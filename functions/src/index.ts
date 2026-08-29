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

export const bulletinOG = functions.https.onRequest(async (req, res) => {
  const userAgent = req.headers["user-agent"] || "";
  console.log("[UA 확인]", userAgent); // ← 이 줄 추가

  const pathSegments = req.path.split("/");
  const bulletinId = pathSegments[pathSegments.length - 1];

  let churchName = "우리 교회";
  let description = "스마트 모바일 주보를 확인해보세요.";
  let imageUrl =
    "https://bulletin.stayon-platform.com/stayon_jubo_kakao_cover.png";

  if (bulletinId && bulletinId !== "view") {
    try {
      const userDocRef = await db.collection("users").doc(bulletinId).get();

      let userData: Record<string, unknown> | null = null;
      if (userDocRef.exists) {
        userData = userDocRef.data() as Record<string, unknown>;
      } else {
        const querySnapshot = await db
          .collection("users")
          .where("currentBulletinId", "==", bulletinId)
          .limit(1)
          .get();
        if (!querySnapshot.empty) {
          userData = querySnapshot.docs[0].data() as Record<string, unknown>;
        }
      }

      if (userData) {
        if (typeof userData.churchName === "string") {
          churchName = userData.churchName;
        }
        if (typeof userData.description === "string") {
          description = userData.description;
        }
        if (typeof userData.coverImage === "string") {
          imageUrl = userData.coverImage;
        }
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

  // 2. 일반 성도인 경우: SPA의 실제 index.html을 서브하여 해시 없는 /view/... 주보 화면이 정상 렌더링되도록 함
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
const SITE_SEARCH_BOT_REGEX = /googlebot|bingbot|google-inspectiontool/i;

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
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.status(200).send(merged);
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
