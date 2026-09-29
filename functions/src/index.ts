import {setGlobalOptions} from "firebase-functions";
import {
  onDocumentCreated,
  onDocumentUpdated,
} from "firebase-functions/v2/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {google} from "googleapis";
import {sendMailNotification} from "./utils/adminNotify";
import * as path from "path";
import * as fs from "fs";

admin.initializeApp();

const db = admin.firestore(); // Firestore 객체 선언 추가

setGlobalOptions({region: "asia-northeast3"});

export const onSignupMailTrigger = onDocumentCreated(
  {
    document: "mail_triggers/{userId}",
  },
  async (event) => {
    const snap = event.data;
    if (!snap) {
      console.log("❌ 스냅샷 데이터가 없습니다.");
      return;
    }
    const data = snap.data();
    if (!data) {
      console.log("❌ 문서 데이터가 비어있습니다.");
      return;
    }

    console.log(
      `[함수 실행됨] mail_triggers 문서 생성 감지됨 ID: ${event.params.userId}`
    );

    try {
      await sendMailNotification("JOIN", data);
      console.log("✅ [이메일 트리거 완료]");
    } catch (error) {
      console.error("❌ [이메일 트리거 실패]:", error);
    }
  }
);


// 결제 완료 시 메일 발송 트리거 함수
export const onPaymentMailTrigger = onDocumentCreated(
  {
    document: "payment_mail_triggers/{paymentId}",
  },
  async (event) => {
    const snap = event.data;
    if (!snap) {
      console.log("❌ 결제 스냅샷 데이터가 없습니다.");
      return;
    }
    const data = snap.data();
    if (!data) {
      console.log("❌ 결제 문서 데이터가 비어있습니다.");
      return;
    }

    console.log(
      "[결제 함수 실행됨] payment_mail_triggers 문서 생성 감지됨 ID:",
      event.params.paymentId
    );

    try {
      await sendMailNotification("PAYMENT", data);
      console.log("✅ [결제 이메일 트리거 완료]");
    } catch (error) {
      console.error("❌ [결제 이메일 트리거 실패]:", error);
    }
  }
);

// 주보 발행/업데이트 시 운영자에게 메일 알림.
// 클라이언트(AdminEditor)가 발행 성공 후 bulletin_mail_triggers 에 문서를 하나
// 쓰면 이 함수가 감지한다. (mail_triggers / payment_mail_triggers 와 동일한 패턴)
export const onBulletinMailTrigger = onDocumentCreated(
  {
    document: "bulletin_mail_triggers/{docId}",
  },
  async (event) => {
    const data = event.data?.data();
    if (!data) {
      console.log("❌ 주보 알림 문서 데이터가 비어있습니다.");
      return;
    }

    try {
      let churchName = "이름 미등록 교회";
      let pastorName = "";

      if (data.authorId) {
        const userSnap = await db
          .collection("users")
          .doc(String(data.authorId))
          .get();
        const user = (userSnap.data() || {}) as Record<string, unknown>;
        if (typeof user.churchName === "string" && user.churchName) {
          churchName = user.churchName;
        }
        if (
          typeof user.seniorPastorName === "string" &&
          user.seniorPastorName
        ) {
          pastorName = user.seniorPastorName;
        }
      }

      // users 에 담임목사 이름이 없으면 이번 주보의 "담임 목사" 자리에서 폴백
      if (!pastorName && data.bulletinId) {
        const bSnap = await db
          .collection("bulletins")
          .doc(String(data.bulletinId))
          .get();
        const b = bSnap.data() as Record<string, unknown> | undefined;
        const sp = b?.seniorPastor as { name?: unknown } | undefined;
        if (sp && typeof sp.name === "string" && sp.name) {
          pastorName = sp.name;
        }
      }

      await sendMailNotification(
        data.isUpdate ? "BULLETIN_UPDATE" : "BULLETIN_PUBLISH",
        {
          churchName,
          pastorName: pastorName || "-",
          date: String(data.date || ""),
          bulletinId: String(data.bulletinId || ""),
        },
      );
      console.log("✅ [주보 발행 알림 메일 완료]");
    } catch (error) {
      console.error("❌ [주보 발행 알림 메일 실패]:", error);
    }
  },
);

// 매일 00:00(한국 시간)에 딱 1번 실행되는 스케줄 함수.
// 각 교회(authorId)별 이번 달 발행 주보들의 views 합계를 계산해 users/{uid}.monthlyViews에 저장.
// 문서 변경 트리거가 아닌 시간 트리거라 자기 자신이나 다른 함수를 재호출할 수 없음.
export const updateMonthlyViews = onSchedule(
  {
    schedule: "0 0 * * *",
    timeZone: "Asia/Seoul",
  },
  async () => {
    const kstNow = new Date(
      new Date().toLocaleString("en-US", {timeZone: "Asia/Seoul"})
    );
    const monthStart = `${kstNow.getFullYear()}-${String(
      kstNow.getMonth() + 1
    ).padStart(2, "0")}-01`;
    const nextMonthDate = new Date(
      kstNow.getFullYear(),
      kstNow.getMonth() + 1,
      1
    );
    const monthEnd = `${nextMonthDate.getFullYear()}-${String(
      nextMonthDate.getMonth() + 1
    ).padStart(2, "0")}-01`;

    const bulletinsSnap = await db
      .collection("bulletins")
      .where("date", ">=", monthStart)
      .where("date", "<", monthEnd)
      .get();

    const totalsByAuthor = new Map<string, number>();
    bulletinsSnap.forEach((docSnap) => {
      const data = docSnap.data();
      const authorId = data.authorId as string | undefined;
      if (!authorId) return;
      const views = typeof data.views === "number" ? data.views : 0;
      totalsByAuthor.set(authorId, (totalsByAuthor.get(authorId) || 0) + views);
    });

    // 지난달엔 조회수가 집계됐지만 이번 달엔 발행분이 없는 교회는 0으로 초기화
    const staleSnap = await db
      .collection("users")
      .where("monthlyViews", ">", 0)
      .get();

    const batch = db.batch();
    staleSnap.forEach((userDoc) => {
      if (!totalsByAuthor.has(userDoc.id)) {
        batch.set(userDoc.ref, {monthlyViews: 0}, {merge: true});
      }
    });
    totalsByAuthor.forEach((total, authorId) => {
      batch.set(
        db.collection("users").doc(authorId),
        {monthlyViews: total},
        {merge: true}
      );
    });

    await batch.commit();
    console.log(
      `[이번 달 조회수 갱신 완료] 대상 교회 수: ${totalsByAuthor.size}`
    );
  }
);

const BOT_AGENT_REGEX =
  /kakaotalk-scrap|facebookexternalhit|twitterbot|slackbot|telegrambot/i;
// 검색봇 전용 판별 정규식. BOT_AGENT_REGEX(메신저 링크 미리보기 봇)와는 완전히
// 별개 — 교회가 "검색엔진 노출"을 켠 주보(users/{uid}.bulletinSearchable===true)만
// 이 분기에서 실제 내용을 내려주고, 안 켠 교회는 noindex를 명시해 색인에서 제외한다.
const SEARCH_BOT_REGEX = /googlebot|bingbot|google-inspectiontool|yeti/i;

export const bulletinOG = functions.https.onRequest(async (req, res) => {
  const userAgent = req.headers["user-agent"] || "";
  console.log("[UA 확인]", userAgent); // ← 이 줄 추가

  const pathSegments = req.path.split("/");
  const bulletinId = pathSegments[pathSegments.length - 1];

  let churchName = "우리 교회";
  let description = "스마트 모바일 주보를 확인해보세요.";
  let imageUrl =
    "https://bulletin.stayon-platform.com/stayon_jubo_kakao_cover.png";
    // 교회가 "검색엔진 노출"을 켰는지(users/{uid}.bulletinSearchable). 기본값은
    // false(opt-in) — AdminEditor.tsx "검색엔진 노출" 토글에서 켠 교회만 true
  let bulletinSearchable = false;

  if (bulletinId && bulletinId !== "view") {
    try {
      const userDocRef = await db.collection("users").doc(bulletinId).get();

      let userData: Record<string, unknown> | null = null;
      let bulletinData: Record<string, unknown> | null = null;

      if (userDocRef.exists) {
        // ① /view/{교회 UID}
        userData = userDocRef.data() as Record<string, unknown>;
      } else {
        // ② users 중 currentBulletinId == 이 값
        const querySnapshot = await db
          .collection("users")
          .where("currentBulletinId", "==", bulletinId)
          .limit(1)
          .get();
        if (!querySnapshot.empty) {
          userData = querySnapshot.docs[0].data() as Record<string, unknown>;
        }
      }

      // ③ /view/{주보 문서 ID} — 주보에서 authorId 뽑아 그 교회 users 조회
      if (!userData) {
        const bDoc = await db.collection("bulletins").doc(bulletinId).get();
        if (bDoc.exists) {
          bulletinData = bDoc.data() as Record<string, unknown>;
          const authorId = bulletinData.authorId;
          if (typeof authorId === "string" && authorId) {
            const uDoc = await db.collection("users").doc(authorId).get();
            if (uDoc.exists) {
              userData = uDoc.data() as Record<string, unknown>;
            }
          }
        }
      }

      if (userData) {
        if (typeof userData.churchName === "string") {
          churchName = userData.churchName;
        }
        if (
          typeof userData.description === "string" &&
            userData.description
        ) {
          description = userData.description;
        }
        if (typeof userData.coverImage === "string" && userData.coverImage) {
          imageUrl = userData.coverImage;
        }
        if (userData.bulletinSearchable === true) {
          bulletinSearchable = true;
        }
      }

      // 설명은 이 주보의 설교 제목이 있으면 그걸로 더 풍성하게
      if (bulletinData) {
        const sermon =
          (typeof bulletinData.title === "string" && bulletinData.title) ||
          (typeof bulletinData.subtitle === "string" && bulletinData.subtitle);
        if (sermon) description = `이번 주 말씀 — ${sermon}`;
      }
    } catch (error) {
      console.error("Firestore 조회 에러:", error);
    }
  }

  const ogTitle = `${churchName} 온라인주보 | STAYON_온라인 주보`;

  // 1. 카카오톡 등 크롤러 봇인 경우: 각 교회별 맞춤 OG 태그가 담긴 HTML 반환
  if (BOT_AGENT_REGEX.test(userAgent)) {
    const html = `
      <!DOCTYPE html>
      <html lang="ko">
      <head>
        <meta charset="utf-8" />
        <title>${ogTitle}</title>
        <meta property="og:type" content="website" />
        <meta property="og:title" content="${ogTitle}" />
        <meta property="og:description" content="${description}" />
        <meta property="og:url" content="https://bulletin.stayon-platform.com/view/${bulletinId}" />
        <meta property="og:image" content="${imageUrl}" />
      </head>
      <body>
        <h1>${ogTitle}</h1>
        <p>${description}</p>
      </body>
      </html>
    `;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(html);
    return;
  }

  // 2. 검색봇(구글/빙/네이버)인 경우: 교회가 "검색엔진 노출"을 켠 주보만 실제
  //    내용을 채워서 내려주고, 안 켠 주보는 noindex를 명시해 혹시라도 이
  //    URL이 발견되더라도 검색결과엔 절대 나오지 않게 한다. 실제 방문자(성도)
  //    화면과는 완전히 분리된 분기라 이 아래 3번(일반 방문자)엔 영향 없음
  if (SEARCH_BOT_REGEX.test(userAgent)) {
    const indexPath = path.join(__dirname, "../dist/index.html");
    if (fs.existsSync(indexPath)) {
      const indexHtml = fs.readFileSync(indexPath, "utf8");

      if (bulletinSearchable) {
        const safeTitle = escapeHtml(ogTitle);
        const safeDesc = escapeHtml(description);
        const safeUrl = escapeHtml(
          `https://bulletin.stayon-platform.com/view/${bulletinId}`
        );
        const safeImageUrl = /^https?:\/\//.test(imageUrl) ?
          escapeHtml(imageUrl) :
          "";
        const merged = injectChurchMeta(indexHtml, {
          title: safeTitle,
          description: safeDesc,
          canonicalUrl: safeUrl,
          imageUrl: safeImageUrl,
        });
        const bodyHtml = [
          `<h1>${safeTitle}</h1>`,
          `<p>${safeDesc}</p>`,
        ].join("\n");
        const withBody = merged.replace(
          "<div id=\"root\"></div>",
          `<div id="root">${bodyHtml}</div>`
        );
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.status(200).send(withBody);
        return;
      }

      const withNoindex = indexHtml.replace(
        "</head>",
        "  <meta name=\"robots\" content=\"noindex, nofollow\" />\n  </head>"
      );
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(200).send(withNoindex);
      return;
    }
  }

  // 3. 일반 성도인 경우: SPA의 실제 index.html을 서브하여 해시 없는 /view/... 주보 화면이 정상 렌더링되도록 함
  try {
    const indexPath = path.join(__dirname, "../dist/index.html");
    if (fs.existsSync(indexPath)) {
      const indexHtml = fs.readFileSync(indexPath, "utf8");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(200).send(indexHtml);
      return;
    }
  } catch (e) {
    console.error("index.html 로드 실패:", e);
  }

  res.status(500).send("Internal Server Error");
});

const KNOWN_SUBDOMAINS = ["www", "bulletin", "place", "stayonsbplatform"];

/**
 * routes.tsx의 getChurchSubdomain()과 동일한 판별 로직.
 * 클라이언트는 window.location.hostname을 보고, 서버(이 함수)는
 * Cloudflare Worker(flat-shape-14)가 x-original-host 헤더로 넘겨준
 * 원래 호스트명을 봄 (Firebase Hosting에 도달할 땐 host 헤더 자체가
 * stayonsbplatform.web.app로 이미 바뀌어 있어서 host는 못 씀).
 * @param {string | undefined} hostHeader 원래 호스트명 헤더 값
 * @return {string | null} 교회 서브도메인 slug, 아니면 null
 */
function getChurchSlugFromHost(hostHeader: string | undefined): string | null {
  if (!hostHeader) return null;
  const hostname = hostHeader.split(":")[0]; // 포트 번호 제거
  if (!hostname.endsWith("stayon-platform.com")) return null;
  const stripped = hostname.replace(".stayon-platform.com", "");
  const subdomain = stripped.split(".")[0];
  const isKnown = KNOWN_SUBDOMAINS.includes(subdomain);
  if (!subdomain || subdomain === "stayon-platform" || isKnown) {
    return null;
  }
  return subdomain;
}

/**
 * HTML 속성/텍스트에 안전하게 넣기 위해 특수문자를 이스케이프함.
 * @param {string} input 원본 문자열
 * @return {string} 이스케이프된 문자열
 */
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// siteOG 전용 봇 판별 정규식들. bulletinOG가 쓰는 BOT_AGENT_REGEX와는 완전히
// 분리된 별개의 상수임 — BOT_AGENT_REGEX 자체는 여기서 손대지 않음
const SITE_PREVIEW_BOT_REGEX =
  /kakaotalk-scrap|facebookexternalhit|twitterbot|slackbot|telegrambot/i;
// yeti = 네이버 크롤러. 원래 구글/빙만 잡고 있어서 네이버는 교회별 맞춤 메타를
// 못 받고 있었음(성도 주보 주소가 아닌 회사 소개 텍스트만 보고 갔음) — 추가함
const SITE_SEARCH_BOT_REGEX = /googlebot|bingbot|google-inspectiontool|yeti/i;

// 검색봇에게는 얇은 미리보기용 안내 HTML이 아니라 실제 SPA(index.html)를
// 그대로 주면서 head의 title/description/OG 태그만 이 교회 것으로 바꿔 끼움
// — 그래야 검색엔진이 받는 첫 HTML부터 교회별로 구분되면서도, 스크립트가
// 그대로 있어서 이어서 실제 페이지 내용도 정상적으로 렌더링됨
/**
 * @param {string} html 원본 index.html 문자열
 * @param {{title: string, description: string, canonicalUrl: string,
 *   imageUrl: string}} meta 교회별 메타 값
 * @return {string} 치환된 HTML 문자열
 */
function injectChurchMeta(
  html: string,
  meta: {
    title: string;
    description: string;
    canonicalUrl: string;
    imageUrl: string;
  }
): string {
  let result = html
    .replace(/<title>[^<]*<\/title>/, `<title>${meta.title}</title>`)
    .replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/,
      `<meta name="description" content="${meta.description}" />`
    )
    .replace(
      /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/,
      `<meta property="og:title" content="${meta.title}" />`
    )
    .replace(
      /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/,
      `<meta property="og:description" content="${meta.description}" />`
    )
    .replace(
      /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/,
      `<meta property="og:url" content="${meta.canonicalUrl}" />`
    );
  if (meta.imageUrl) {
    result = result.replace(
      /<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/,
      `<meta property="og:image" content="${meta.imageUrl}" />`
    );
  }
  return result.replace(
    "</head>",
    `  <link rel="canonical" href="${meta.canonicalUrl}" />\n  </head>`
  );
}

// 검색봇용 첫 HTML의 <div id="root">를 텅 비워두면, head의 title/description은
// 교회 것으로 바뀌어 있는데 정작 본문 텍스트는 하나도 없는 "속 빈 페이지"가
// 되어 저품질(thin content)로 판정되기 쉽다. 실제 방문자는 이 분기를 타지
// 않으므로(React가 그대로 마운트되며 아래 내용은 덮어써짐) 검색봇 첫 크롤링이
// 읽을 수 있는 핵심 정보(교회 소개/예배 시간/주소/섬기는 사람들)를 서버에서
// 미리 텍스트로 채워 넣는다
/**
 * @param {Record<string, unknown>} site churchSites 문서 데이터
 * @param {string} churchName 교회명(이스케이프 전)
 * @param {string} description 교회 소개(이스케이프 전)
 * @return {string} <div id="root"> 안에 들어갈 본문 HTML
 */
function buildChurchBodyHtml(
  site: Record<string, unknown>,
  churchName: string,
  description: string
): string {
  const parts: string[] = [
    `<h1>${escapeHtml(churchName)}</h1>`,
    `<p>${escapeHtml(description)}</p>`,
  ];

  const address = typeof site.address === "string" ? site.address : "";
  const phone = typeof site.phone === "string" ? site.phone : "";
  if (address || phone) {
    parts.push("<section>");
    parts.push("<h2>오시는 길</h2>");
    if (address) parts.push(`<p>${escapeHtml(address)}</p>`);
    if (phone) parts.push(`<p>${escapeHtml(phone)}</p>`);
    parts.push("</section>");
  }

  const worshipServices = Array.isArray(site.worshipServices) ?
    (site.worshipServices as { title?: unknown; time?: unknown }[]) :
    [];
  const worshipItems = worshipServices
    .map((w) => ({
      title: typeof w.title === "string" ? w.title : "",
      time: typeof w.time === "string" ? w.time : "",
    }))
    .filter((w) => w.title || w.time);
  if (worshipItems.length > 0) {
    parts.push("<section>");
    parts.push("<h2>예배 안내</h2>");
    parts.push("<ul>");
    worshipItems.forEach((w) => {
      parts.push(
        `<li>${escapeHtml(w.title)} ${escapeHtml(w.time)}</li>`
      );
    });
    parts.push("</ul>");
    parts.push("</section>");
  }

  const staffMembers = Array.isArray(site.staffMembers) ?
    (site.staffMembers as { name?: unknown; role?: unknown }[]) :
    [];
  const staffItems = staffMembers
    .map((m) => ({
      name: typeof m.name === "string" ? m.name : "",
      role: typeof m.role === "string" ? m.role : "",
    }))
    .filter((m) => m.name)
    .slice(0, 20);
  if (staffItems.length > 0) {
    parts.push("<section>");
    parts.push("<h2>섬기는 사람들</h2>");
    parts.push("<ul>");
    staffItems.forEach((m) => {
      parts.push(`<li>${escapeHtml(m.role)} ${escapeHtml(m.name)}</li>`);
    });
    parts.push("</ul>");
    parts.push("</section>");
  }

  return parts.join("\n");
}

// /view/** 를 제외한 모든 경로의 캐치올 라우트. /view/**는 위의 bulletinOG가
// 우선 매칭되므로 이 함수까지 절대 오지 않음(firebase.json 라우팅 우선순위,
// 이 함수는 그 규칙에 손대지 않음). 교회 서브도메인 + 링크 미리보기 봇(카카오톡
// 등)인 경우에만 그 교회 전용 OG 태그를 만들어 반환하고, 그 외(일반 방문자
// 전부, 주보 플랫폼 메인 도메인, 관리자 페이지 등)는 기존과 동일하게 정적
// index.html을 그대로 반환함 — 즉 주보 플랫폼 쪽 동작은 전혀 달라지지 않음
export const siteOG = functions.https.onRequest(async (req, res) => {
  const userAgent = req.headers["user-agent"] || "";
  // Cloudflare Worker(flat-shape-14)가 봇 요청일 때 이 함수를 직접 호출하며
  // ?host=&path= 쿼리로 원래 주소를 넘겨줌 (루트 경로 "/"도 놓치지 않기 위해
  // Firebase Hosting의 정적 파일 우선 규칙을 아예 거치지 않는 방식으로 변경).
  // 쿼리가 없으면 예전 방식(헤더 기반)도 안전망으로 유지함
  const queryHost = typeof req.query.host === "string" ?
    req.query.host :
    undefined;
  const queryPath = typeof req.query.path === "string" ?
    req.query.path :
    "/";
  const originalHost = queryHost || (
    (req.headers["x-original-host"] as string | undefined) ||
    (req.headers["x-forwarded-host"] as string | undefined) ||
    req.headers.host
  );
  const requestPath = queryHost ? queryPath : (req.originalUrl || "/");
  const churchSlug = getChurchSlugFromHost(originalHost);

  const isPreviewBot = SITE_PREVIEW_BOT_REGEX.test(userAgent);
  const isSearchBot = SITE_SEARCH_BOT_REGEX.test(userAgent);

  if (churchSlug && (isPreviewBot || isSearchBot)) {
    try {
      const siteRef = db.collection("churchSites").doc(churchSlug);
      const siteDoc = await siteRef.get();
      if (siteDoc.exists) {
        const site = siteDoc.data() as Record<string, unknown>;
        const rawName = site.churchName;
        const churchName =
          typeof rawName === "string" && rawName ? rawName : churchSlug;
        const description =
          (typeof site.intro === "string" && site.intro) ||
          (typeof site.metaDesc === "string" && site.metaDesc) ||
          `${churchName}의 온라인 홈페이지입니다.`;
          // 카카오톡 등 링크 미리보기는 og:image로 실제 http(s) URL만 가져올 수
          // 있고 data: base64 이미지는 지원 안 하므로, 업로드 시 base64로
          // 압축 저장된 이미지 필드는 후보에서 제외함
        const isRealUrl = (v: unknown): v is string =>
          typeof v === "string" && /^https?:\/\//.test(v);
        const imageUrl =
          (isRealUrl(site.heroImageUrl) && site.heroImageUrl) ||
          (isRealUrl(site.buildingImageUrl) && site.buildingImageUrl) ||
          (isRealUrl(site.logoUrl) && site.logoUrl) ||
          "";
        const ogTitle = `${churchName} | STAYON`;
        const pageUrl = `https://${originalHost}${requestPath}`;
        const safeTitle = escapeHtml(ogTitle);
        const safeDesc = escapeHtml(description);
        const safeUrl = escapeHtml(pageUrl);
        const safeImageUrl = imageUrl ? escapeHtml(imageUrl) : "";

        // 검색봇(구글/빙): 안내용 HTML이 아니라 실제 SPA를 head 메타만 바꿔서 줌
        if (isSearchBot) {
          const indexPath = path.join(__dirname, "../dist/index.html");
          if (fs.existsSync(indexPath)) {
            const indexHtml = fs.readFileSync(indexPath, "utf8");
            const merged = injectChurchMeta(indexHtml, {
              title: safeTitle,
              description: safeDesc,
              canonicalUrl: safeUrl,
              imageUrl: safeImageUrl,
            });
              // head 메타만 바꾸고 본문(<div id="root">)을 비워두면 검색봇
              // 첫 크롤링 시점엔 "제목/설명은 있는데 본문은 텅 빈 페이지"로
              // 읽혀서 저품질(thin content) 판정을 받기 쉽다 — 실제 방문자는
              // 이 isSearchBot 분기 자체를 타지 않으므로 안전하게 본문 텍스트를
              // 채워 넣는다
            const bodyHtml =
                buildChurchBodyHtml(site, churchName, description);
            const withBody = merged.replace(
              "<div id=\"root\"></div>",
              `<div id="root">${bodyHtml}</div>`
            );
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.status(200).send(withBody);
            return;
          }
        }

        // 카카오톡 등 메신저 미리보기 봇: 기존과 동일한 얇은 안내 HTML
        const imageTag = safeImageUrl ?
          `<meta property="og:image" content="${safeImageUrl}" />` :
          "";

        const html = `
          <!DOCTYPE html>
          <html lang="ko">
          <head>
            <meta charset="utf-8" />
            <title>${safeTitle}</title>
            <meta property="og:type" content="website" />
            <meta property="og:title" content="${safeTitle}" />
            <meta property="og:description" content="${safeDesc}" />
            <meta property="og:url" content="${safeUrl}" />
            ${imageTag}
          </head>
          <body>
            <h1>${safeTitle}</h1>
            <p>${safeDesc}</p>
          </body>
          </html>
        `;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.status(200).send(html);
        return;
      }
    } catch (error) {
      console.error("교회 사이트 OG 조회 에러:", error);
    }
  }

  // "스테이온과 함께 하고 있는 교회" 링크(WebsiteMain.tsx)는 자바스크립트가 실행돼야
  // 나타나서, 검색봇이 자바스크립트 렌더링을 미루면 이 링크를 오래도록 못 찾는다.
  // 검색봇에게는 그 링크 목록을 정적 HTML에 미리 박아서 내려줘서, 렌더링을 기다리지
  // 않고 첫 크롤링에서 바로 각 교회 사이트를 발견할 수 있게 한다. 실제 방문자 화면과
  // /website 외 다른 경로는 전혀 건드리지 않음
  if (!churchSlug && requestPath === "/website" && isSearchBot) {
    try {
      const indexPath = path.join(__dirname, "../dist/index.html");
      if (fs.existsSync(indexPath)) {
        const sitesSnap = await db
          .collection("churchSites")
          .where("published", "==", true)
          .limit(24)
          .get();
        const links = sitesSnap.docs
          .map((d) => {
            const data = d.data() as Record<string, unknown>;
            const name =
              typeof data.churchName === "string" && data.churchName ?
                data.churchName :
                d.id;
            return `<a href="https://${escapeHtml(d.id)}.stayon-platform.com/">${escapeHtml(name)}</a>`;
          })
          .join("\n");
        const indexHtml = fs.readFileSync(indexPath, "utf8");
        const withLinks = indexHtml.replace(
          "</body>",
          `<nav aria-label="스테이온과 함께 하고 있는 교회">${links}</nav></body>`
        );
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.status(200).send(withLinks);
        return;
      }
    } catch (error) {
      console.error("교회 사이트 링크 목록 조회 에러:", error);
    }
  }

  // 그 외 모든 경우: 기존과 완전히 동일하게 정적 index.html 그대로 반환
  try {
    const indexPath = path.join(__dirname, "../dist/index.html");
    if (fs.existsSync(indexPath)) {
      const indexHtml = fs.readFileSync(indexPath, "utf8");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(200).send(indexHtml);
      return;
    }
  } catch (e) {
    console.error("index.html 로드 실패:", e);
  }

  res.status(500).send("Internal Server Error");
});

// 발행된(published) 교회 사이트 전체를 실시간으로 조회해서 사이트맵 XML을 생성.
// 새 교회 사이트가 생성/발행되면 별도 작업 없이 다음 요청부터 자동으로 반영됨.
// 주보 플랫폼 라우트/함수는 전혀 건드리지 않는 완전히 새로운 함수 + 새 경로임.
export const churchSitemap = functions.https.onRequest(async (_req, res) => {
  try {
    const snapshot = await db
      .collection("churchSites")
      .where("published", "==", true)
      .get();

    const sections = ["", "worship", "community", "news", "location"];
    const urlEntries: string[] = [];

    snapshot.forEach((doc) => {
      const site = doc.data() as Record<string, unknown>;
      const slug = doc.id;
      const updatedAt = site.updatedAt as
        admin.firestore.Timestamp | undefined;
      const lastmod = updatedAt ?
        updatedAt.toDate().toISOString().split("T")[0] :
        undefined;

      sections.forEach((section) => {
        const loc = `https://${slug}.stayon-platform.com/${section}`;
        const lastmodTag = lastmod ? `<lastmod>${lastmod}</lastmod>` : "";
        urlEntries.push(`  <url><loc>${loc}</loc>${lastmodTag}</url>`);
      });
    });

    const xml = [
      "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
      "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">",
      ...urlEntries,
      "</urlset>",
    ].join("\n");

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.status(200).send(xml);
  } catch (error) {
    console.error("교회 사이트맵 생성 에러:", error);
    res.status(500).send("Internal Server Error");
  }
});

// "검색엔진 노출"을 켠(users/{uid}.bulletinSearchable === true) 교회의 주보
// (/view/{uid})만 모아 사이트맵 XML로 생성. 기본값이 꺼짐(opt-in)이라 대부분의
// 교회는 여기 안 잡히고, AdminEditor.tsx에서 직접 켠 교회만 포함됨. churchSitemap과
// 마찬가지로 완전히 새로운 함수/경로이며 기존 주보 플랫폼 로직은 건드리지 않음.
export const bulletinSitemap = functions.https.onRequest(
  async (_req, res) => {
    try {
      const snapshot = await db
        .collection("users")
        .where("bulletinSearchable", "==", true)
        .get();

      const urlEntries: string[] = [];
      snapshot.forEach((doc) => {
        const loc = `https://bulletin.stayon-platform.com/view/${doc.id}`;
        urlEntries.push(`  <url><loc>${loc}</loc></url>`);
      });

      const xml = [
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
        "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">",
        ...urlEntries,
        "</urlset>",
      ].join("\n");

      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      res.status(200).send(xml);
    } catch (error) {
      console.error("주보 사이트맵 생성 에러:", error);
      res.status(500).send("Internal Server Error");
    }
  }
);

// 교회 사이트가 "배포"(published: false→true)될 때만 자동으로 실행됨.
// Search Console API로 church-sitemap.xml을 재제출해서 구글이 더 빨리
// 새 페이지를 크롤링하도록 알려줌. 완전히 새로운 트리거 + 새로운 로직이라
// 주보 플랫폼 관련 함수/로직은 전혀 건드리지 않음.
export const onChurchSitePublished = onDocumentUpdated(
  {document: "churchSites/{slug}"},
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;
    if (before.published === true || after.published !== true) return;

    try {
      const auth = new google.auth.GoogleAuth({
        scopes: ["https://www.googleapis.com/auth/webmasters"],
      });
      const webmasters = google.webmasters({version: "v3", auth});
      await webmasters.sitemaps.submit({
        siteUrl: "sc-domain:stayon-platform.com",
        feedpath:
          "https://bulletin.stayon-platform.com/church-sitemap.xml",
      });
      console.log(`[사이트맵 재제출 완료] slug: ${event.params.slug}`);
    } catch (error) {
      console.error("사이트맵 재제출 실패:", error);
    }
  }
);
