import {setGlobalOptions} from "firebase-functions";
import {
  onDocumentCreated,
  onDocumentUpdated,
} from "firebase-functions/v2/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {google} from "googleapis";
import {sendMailNotification, sendCustomerEmail} from "./utils/adminNotify";
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

// ============================================================
// 정기결제(빌링) — src/hooks/useBillingKey.ts(프론트)에서 발급한 빌링키로
// 서버가 매달 실제 결제를 긁는 부분. usePayment.ts(기존 단건 결제) 및 그
// 관련 함수는 이 블록에서 전혀 건드리지 않음 — 완전히 새로운 코드.
// ============================================================

const RECURRING_ADMIN_EMAILS = [
  "akhj123akhjk@gmail.com", "stayon.platform@gmail.com",
];

// 다음 결제일 계산. src/hooks/useBillingKey.ts의 addMonthsClamped와 동일한
// 규칙("해당 일자가 없는 달은 말일에 결제") — 프론트/서버가 서로 다른
// 빌드라 공유 import는 못 하고, 같은 로직을 서버 쪽에도 그대로 둠.
/**
 * @param {Date} date 기준 날짜
 * @param {number} months 더할 개월 수
 * @return {Date} 말일 보정이 적용된 결과 날짜
 */
function addMonthsClamped(date: Date, months: number): Date {
  const targetDay = date.getDate();
  const d = new Date(date);
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(targetDay, lastDay));
  return d;
}

// TODO: NHN KCP 정기결제 채널이 포트원에서 승인되면, 발급받는 API
// 시크릿키를 functions 환경변수 PORTONE_API_SECRET으로 설정해야 실제
// 결제가 성공함. 지금은 이 값이 없거나 채널이 미승인이라 항상 실패
// 응답이 오는 게 정상 — 그 실패 처리 경로(재시도/정지/메일)는 지금도
// testRecurringBillingNow로 바로 테스트할 수 있다.
/**
 * @param {string} billingKey 포트원이 발급한 빌링키
 * @param {number} amount 결제 금액(원)
 * @param {string} orderName 주문명(결제 내역에 표시됨)
 * @param {string} customerId 결제 요청자 식별용 uid
 * @return {Promise<object>} 결제 결과({success, message?})
 */
async function chargeBillingKeyPayment(
  billingKey: string,
  amount: number,
  orderName: string,
  customerId: string
): Promise<{ success: boolean; message?: string }> {
  const secret = process.env.PORTONE_API_SECRET;
  if (!secret) {
    return {success: false, message: "PORTONE_API_SECRET 환경변수 미설정"};
  }
  const paymentId = `stayon_recurring_${customerId}_${Date.now()}`;
  try {
    const res = await fetch(
      `https://api.portone.io/payments/${encodeURIComponent(paymentId)}` +
        "/billing-key",
      {
        method: "POST",
        headers: {
          "Authorization": `PortOne ${secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          billingKey,
          orderName,
          customer: {id: customerId},
          amount: {total: amount},
          currency: "KRW",
        }),
      }
    );
    const json = (await res.json()) as { message?: string; code?: string };
    if (!res.ok || json.code) {
      return {
        success: false,
        message: json.message || `HTTP ${res.status}`,
      };
    }
    return {success: true};
  } catch (error) {
    console.error("[정기결제] 빌링키 결제 요청 오류:", error);
    return {success: false, message: String(error)};
  }
}

// 교회 한 곳의 정기결제를 처리하는 핵심 로직. 매일 도는 스케줄 함수와
// 운영자 수동 테스트 함수가 공통으로 쓴다 — 여기 한 곳만 고치면 둘 다
// 같이 바뀐다.
/**
 * @param {string} uid 처리할 사용자(교회)의 uid
 * @param {FirebaseFirestore.DocumentData} data users/{uid} 문서 데이터
 * @return {Promise<void>}
 */
async function processOneRecurringUser(
  uid: string,
  data: FirebaseFirestore.DocumentData
): Promise<void> {
  const billingKey = data.billingKey as string | undefined;
  const amount = data.billingAmount as number | undefined;
  const planName = (data.billingPlanName as string) || "정기결제";
  const email = (data.email as string) || "";
  const churchName = (data.churchName as string) || "교회담당자";

  if (!billingKey || !amount) {
    console.error(`[정기결제] ${uid} — billingKey/billingAmount 없음`);
    return;
  }

  const result = await chargeBillingKeyPayment(
    billingKey, amount, planName, uid
  );

  if (result.success) {
    const now = new Date();
    let baseDate = now;
    const current = data.lastPaymentDate as
      FirebaseFirestore.Timestamp | undefined;
    if (current?.toDate && current.toDate() > now) {
      baseDate = current.toDate();
    }
    const newExpiration = addMonthsClamped(baseDate, 1);

    // 다음 결제일은 "지금"이 아니라 "원래 예정됐던 결제일"을 기준으로
    // +1개월 해야 "매월 같은 날 결제" 약속이 지켜진다. 실패 후 재시도로
    // 처리 시각이 며칠 늦어져도(now 기준으로 계산하면) 결제일이 그 늦어진
    // 날로 영구히 밀려버리는 버그가 있었음 — scheduledDue를 기준으로 고침.
    const scheduledDue = (data.nextBillingDate as
      FirebaseFirestore.Timestamp | undefined)?.toDate() || now;

    await db.collection("users").doc(uid).update({
      status: "allinone",
      isPaidUser: true,
      currentPlan: planName,
      lastPaymentDate: admin.firestore.Timestamp.fromDate(newExpiration),
      nextBillingDate:
        admin.firestore.Timestamp.fromDate(addMonthsClamped(scheduledDue, 1)),
      billingFailCount: 0,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    try {
      await sendMailNotification("PAYMENT", {
        buyerName: churchName,
        buyerEmail: email,
        planName,
        amount: amount.toLocaleString(),
        date: new Date().toLocaleString("ko-KR", {timeZone: "Asia/Seoul"}),
      });
    } catch (e) {
      console.error("[정기결제] 성공 알림 메일 실패:", e);
    }
    console.log(`[정기결제 성공] ${uid} / ${amount}원`);
    return;
  }

  // 실패 처리 — 최대 3회(3일) 재시도, 최종 실패 시 일시정지
  const failCount = ((data.billingFailCount as number) || 0) + 1;
  if (failCount >= 3) {
    await db.collection("users").doc(uid).update({
      subscriptionActive: false,
      billingFailCount: failCount,
      billingSuspendedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await sendCustomerEmail(
      email,
      "[STAYON] 정기결제 실패로 서비스가 일시 정지됐어요",
      `<p>${churchName}님, 3회 결제 시도가 모두 실패하여 서비스 이용이 ` +
        "일시 정지됐습니다.</p><p>카드 정보를 확인하신 후 마이페이지 " +
        "(관리자 홈 &gt; 결제 관리)에서 다시 등록해주세요.</p>",
      RECURRING_ADMIN_EMAILS
    );
    console.log(`[정기결제 최종 실패] ${uid} — 서비스 일시정지`);
  } else {
    await db.collection("users").doc(uid).update({billingFailCount: failCount});
    await sendCustomerEmail(
      email,
      "[STAYON] 정기결제에 실패했어요",
      `<p>${churchName}님, 카드 결제에 실패했습니다(사유: ` +
        `${result.message || "알 수 없음"}).</p>` +
        `<p>${3 - failCount}회 더 자동으로 재시도하며, 계속 실패하면 ` +
        "서비스가 일시 정지될 수 있어요.</p>",
      RECURRING_ADMIN_EMAILS
    );
    console.log(`[정기결제 실패 ${failCount}/3] ${uid}`);
  }
}

// 매일 한국시간 09:00에 1번, 오늘이 결제일인 정기결제 사용자를 전부 찾아
// 처리한다. 카드를 막 등록한 사용자는 nextBillingDate가 "오늘"로 잡혀
// 있어서(useBillingKey.ts 참고) 이 함수가 첫 결제도 같이 처리하게 된다.
export const processRecurringBilling = onSchedule(
  {
    schedule: "0 9 * * *",
    timeZone: "Asia/Seoul",
    secrets: ["PORTONE_API_SECRET"],
  },
  async () => {
    const now = admin.firestore.Timestamp.now();
    const dueSnap = await db
      .collection("users")
      .where("subscriptionActive", "==", true)
      .where("nextBillingDate", "<=", now)
      .get();

    console.log(`[정기결제 스케줄] 대상 ${dueSnap.size}건`);
    for (const docSnap of dueSnap.docs) {
      await processOneRecurringUser(docSnap.id, docSnap.data());
    }
  }
);

// 결제 3일 전 안내 메일. 매일 한국시간 10:00에 1번 돌면서, nextBillingDate가
// 정확히 3일 뒤인 사용자를 찾아 안내 메일을 보낸다.
export const sendUpcomingBillingReminders = onSchedule(
  {schedule: "0 10 * * *", timeZone: "Asia/Seoul"},
  async () => {
    const kstNow = new Date(
      new Date().toLocaleString("en-US", {timeZone: "Asia/Seoul"})
    );
    const target = new Date(kstNow);
    target.setDate(target.getDate() + 3);
    const dayStart = new Date(
      target.getFullYear(), target.getMonth(), target.getDate()
    );
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const dueSnap = await db
      .collection("users")
      .where("subscriptionActive", "==", true)
      .where(
        "nextBillingDate", ">=", admin.firestore.Timestamp.fromDate(dayStart)
      )
      .where(
        "nextBillingDate", "<", admin.firestore.Timestamp.fromDate(dayEnd)
      )
      .get();

    console.log(`[정기결제 3일 전 안내] 대상 ${dueSnap.size}건`);
    for (const docSnap of dueSnap.docs) {
      const data = docSnap.data();
      const email = (data.email as string) || "";
      const churchName = (data.churchName as string) || "교회담당자";
      const amount = (data.billingAmount as number) || 0;
      await sendCustomerEmail(
        email,
        "[STAYON] 3일 뒤 정기결제가 예정돼 있어요",
        `<p>${churchName}님, 3일 뒤(${target.toLocaleDateString("ko-KR")}) ` +
          `${amount.toLocaleString()}원이 등록하신 카드로 자동 결제될 ` +
          "예정이에요.</p><p>해지를 원하시면 마이페이지(관리자 홈 &gt; " +
          "결제 관리)에서 미리 해지해주세요.</p>",
        RECURRING_ADMIN_EMAILS
      );
    }
  }
);

// 운영자 전용 수동 테스트 트리거. KCP 정기결제 승인 전이라 실제 결제
// 자체는 항상 실패하지만(PORTONE_API_SECRET 미설정), 재시도 횟수 증가·
// 3회 후 자동 정지·메일 발송 같은 주변 로직은 이 함수로 지금 바로 눌러서
// 확인할 수 있다. 매일 도는 스케줄 함수를 기다릴 필요 없이
// ?adminEmail=관리자이메일&uid=테스트할uid 로 호출하면 그 사용자 한 명만
// 즉시 처리한다. 일반 성도/사이트 방문자가 쓰는 라우트와는 무관.
export const testRecurringBillingNow = functions.https.onRequest(
  {secrets: ["PORTONE_API_SECRET"]},
  async (req, res) => {
    const callerEmail = req.query.adminEmail as string | undefined;
    if (!callerEmail || !RECURRING_ADMIN_EMAILS.includes(callerEmail)) {
      res.status(403).send("adminEmail 쿼리에 운영자 이메일을 넣어주세요.");
      return;
    }
    const uid = req.query.uid as string | undefined;
    if (!uid) {
      res.status(400).send("uid 쿼리 파라미터가 필요합니다.");
      return;
    }
    const snap = await db.collection("users").doc(uid).get();
    if (!snap.exists) {
      res.status(404).send("해당 uid의 사용자를 찾을 수 없습니다.");
      return;
    }
    await processOneRecurringUser(uid, snap.data() || {});
    res.status(200).send(
      "처리 완료. Firestore users/" + uid + " 문서의 billingFailCount/" +
        "subscriptionActive 값과 콘솔 로그, 메일함을 확인해보세요."
    );
  }
);

// 유튜브 채널 링크의 채널명을 대신 가져와준다. 유튜브 공식 oEmbed는 영상(watch) URL만
// 지원하고 채널 URL은 지원하지 않아서(404), 채널 페이지 HTML의 og:title 메타태그를
// 직접 읽는 방식으로 우회한다. 브라우저에서 바로 채널 페이지를 fetch하면 CORS로 막히기
// 때문에 서버(여기)에서 대신 가져와 돌려준다. AdminEditor.tsx에서 채널 링크 입력 후
// blur 시 호출한다. 실패해도 관리자가 채널명을 직접 입력하면 되므로 치명적이지 않다.
export const fetchYoutubeChannelName = functions.https.onRequest(
  async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    const channelUrl = String(req.query.url || "");
    if (!/^https:\/\/(www\.)?youtube\.com\//.test(channelUrl)) {
      res.status(400).json({error: "invalid url"});
      return;
    }
    try {
      const resp = await fetch(channelUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });
      const html = await resp.text();
      const match = html.match(
        /<meta property="og:title" content="([^"]*)"/
      );
      res.json({name: match ? match[1] : ""});
    } catch (error) {
      console.error("유튜브 채널명 가져오기 실패:", error);
      res.status(500).json({error: "fetch failed"});
    }
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
  // 검색봇 노출용 본문을 제목·설명 한 줄보다 풍성하게 채우기 위한 추가 문단
  // (날짜·본문 구절·설교자). 구글이 "내용이 거의 없는 템플릿 페이지"로 보고
  // 색인을 꺼릴 수 있어서, 실제 주보 정보를 조금 더 넣어준다.
  let extraBody = "";
  // 경쟁사(주보플러스)처럼 article:published_time·구조화 데이터의 datePublished에
  // 쓸 ISO 8601 날짜 - 주보 날짜가 "YYYY-MM-DD" 형식일 때만 채워진다.
  let bulletinDateIso = "";

  if (bulletinId && bulletinId !== "view") {
    try {
      const userDocRef = await db.collection("users").doc(bulletinId).get();

      let userData: Record<string, unknown> | null = null;
      let bulletinData: Record<string, unknown> | null = null;
      let authorUid: string | null = null;

      if (userDocRef.exists) {
        // ① /view/{교회 UID}
        userData = userDocRef.data() as Record<string, unknown>;
        authorUid = bulletinId;
      } else {
        // ② users 중 currentBulletinId == 이 값
        const querySnapshot = await db
          .collection("users")
          .where("currentBulletinId", "==", bulletinId)
          .limit(1)
          .get();
        if (!querySnapshot.empty) {
          userData = querySnapshot.docs[0].data() as Record<string, unknown>;
          authorUid = querySnapshot.docs[0].id;
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

      // ①②번 경로는 교회 uid만 찾았을 뿐 실제 발행된 주보(설교 제목 등)는
      // 못 가져온 상태라, BulletinView.tsx가 /view/{uid}에서 쓰는 것과 동일한
      // "최신 발행 주보" 조회를 여기서도 한 번 더 해줘야 한다. 이게 없으면
      // 가장 흔한 공유 링크 형태(/view/{교회UID})에서 설교 제목이 전혀 안 들어가
      // 모든 교회가 똑같은 일반 문구로만 노출되는 버그가 있었음(구글이 이런
      // 템플릿성 페이지를 색인 안 하는 원인으로 추정됨).
      if (!bulletinData && authorUid) {
        const latestSnap = await db
          .collection("bulletins")
          .where("authorId", "==", authorUid)
          .where("status", "==", "published")
          .orderBy("publishedAt", "desc")
          .limit(1)
          .get();
        if (!latestSnap.empty) {
          bulletinData = latestSnap.docs[0].data() as Record<string, unknown>;
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

        const bits: string[] = [];
        if (typeof bulletinData.date === "string" && bulletinData.date) {
          bits.push(`날짜: ${bulletinData.date}`);
        }
        if (
          typeof bulletinData.scripture === "string" && bulletinData.scripture
        ) {
          bits.push(`본문 구절: ${bulletinData.scripture}`);
        }
        if (
          typeof bulletinData.preacher === "string" && bulletinData.preacher
        ) {
          bits.push(`설교자: ${bulletinData.preacher}`);
        }
        extraBody = bits.join(" · ");

        // 경쟁사(주보플러스)의 개별 주보 페이지는 article:published_time을
        // 명시해서 구글한테 "이 글은 특정 날짜의 콘텐츠"라고 알려준다 - 날짜
        // 형식이 "YYYY-MM-DD"일 때만 ISO 8601(+09:00)로 변환해서 채운다.
        if (
          typeof bulletinData.date === "string" &&
          /^\d{4}-\d{2}-\d{2}$/.test(bulletinData.date)
        ) {
          bulletinDateIso = `${bulletinData.date}T00:00:00+09:00`;
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

  // 2. 검색봇(구글/빙/네이버)인 경우: 교회가 "검색엔진 노출"을 켠 주보만 실제
  //    내용을 채워서 내려주고, 안 켠 주보는 noindex를 명시해 혹시라도 이
  //    URL이 발견되더라도 검색결과엔 절대 나오지 않게 한다. 실제 방문자(성도)
  //    화면과는 완전히 분리된 분기라 이 아래 3번(일반 방문자)엔 영향 없음.
  //
  //    아래 bulletinSearchable 분기는 일부러 SPA(index.html의 <script> 태그)를
  //    전혀 포함하지 않는 완전히 독립된 정적 HTML만 반환한다 — SPA를 같이
  //    보내면 구글이 자바스크립트를 실행하는 2차 렌더링 단계에서 이 React
  //    앱(BulletinView.tsx)이 그대로 마운트되면서, Firestore에서 주보 데이터를
  //    다 받아오기 전인 "불러오는 중..." 로딩 스피너 화면에서 캡처가 끝나버리는
  //    문제가 실제로 확인됨(구글 서치콘솔 "실시간 테스트"로 재현). 검색봇에게는
  //    처음부터 로딩이 필요 없는 완성된 HTML만 주면 이 문제 자체가 생기지 않음
  if (SEARCH_BOT_REGEX.test(userAgent)) {
    if (bulletinSearchable) {
      const safeTitle = escapeHtml(ogTitle);
      const safeDesc = escapeHtml(description);
      const safeUrl = escapeHtml(
        `https://bulletin.stayon-platform.com/view/${bulletinId}`
      );
      const safeImageUrl = /^https?:\/\//.test(imageUrl) ?
        escapeHtml(imageUrl) :
        "";
      const imageTag = safeImageUrl ?
        `<meta property="og:image" content="${safeImageUrl}" />` :
        "";
      const safeExtraBody = extraBody ? escapeHtml(extraBody) : "";
      const extraBodyTag = safeExtraBody ? `<p>${safeExtraBody}</p>` : "";
      const pageUrl = `https://bulletin.stayon-platform.com/view/${bulletinId}`;
      const hasImage = imageUrl && /^https?:\/\//.test(imageUrl);
      const publishedTimeTag = bulletinDateIso ?
        "<meta property=\"article:published_time\" " +
          `content="${bulletinDateIso}" />` :
        "";

      // 검색엔진이 이 페이지를 "진짜 콘텐츠가 있는 페이지"로 더 잘 인식하도록
      // schema.org 구조화 데이터(JSON-LD)를 Church/WebSite/WebPage/Article/
      // BreadcrumbList 5종류로 연결해서 넣는다(경쟁사 주보 서비스가 쓰는
      // 구조와 동일한 패턴). </script>로 끊기지 않게 "<"는 유니코드 이스케이프로 치환.
      const structuredData = {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "Church",
            "@id": `${pageUrl}#church`,
            "name": churchName,
            "url": pageUrl,
            ...(hasImage ? {image: imageUrl, logo: imageUrl} : {}),
          },
          {
            "@type": "WebSite",
            "@id": `${pageUrl}#website`,
            "name": `${churchName} 온라인주보`,
            "url": pageUrl,
            "inLanguage": "ko-KR",
            "about": {"@id": `${pageUrl}#church`},
          },
          {
            "@type": "WebPage",
            "@id": `${pageUrl}#webpage`,
            "url": pageUrl,
            "name": ogTitle,
            "description": description,
            "inLanguage": "ko-KR",
            "isPartOf": {"@id": `${pageUrl}#website`},
            "about": {"@id": `${pageUrl}#church`},
            "breadcrumb": {"@id": `${pageUrl}#breadcrumb`},
          },
          {
            "@type": "BreadcrumbList",
            "@id": `${pageUrl}#breadcrumb`,
            "itemListElement": [
              {
                "@type": "ListItem", "position": 1,
                "name": churchName, "item": pageUrl,
              },
              {
                "@type": "ListItem", "position": 2,
                "name": "온라인 주보", "item": pageUrl,
              },
            ],
          },
          {
            "@type": "Article",
            "@id": `${pageUrl}#article`,
            "headline": ogTitle,
            "description": description,
            "mainEntityOfPage": {"@id": `${pageUrl}#webpage`},
            "author": {"@type": "Organization", "name": churchName},
            "publisher": {
              "@type": "Organization",
              "name": churchName,
              ...(hasImage ?
                {logo: {"@type": "ImageObject", "url": imageUrl}} :
                {}),
            },
            "inLanguage": "ko-KR",
            ...(bulletinDateIso ? {datePublished: bulletinDateIso} : {}),
            ...(hasImage ? {image: [imageUrl]} : {}),
          },
        ],
      };
      const structuredDataTag = `<script type="application/ld+json">${
        JSON.stringify(structuredData).replace(/</g, "\\u003c")
      }</script>`;
      const html = `
        <!DOCTYPE html>
        <html lang="ko">
        <head>
          <meta charset="utf-8" />
          <title>${safeTitle}</title>
          <meta name="description" content="${safeDesc}" />
          <link rel="canonical" href="${safeUrl}" />
          <meta property="og:type" content="article" />
          <meta property="og:title" content="${safeTitle}" />
          <meta property="og:description" content="${safeDesc}" />
          <meta property="og:url" content="${safeUrl}" />
          <meta property="og:site_name" content="${escapeHtml(churchName)}" />
          <meta property="og:locale" content="ko_KR" />
          ${publishedTimeTag}
          ${imageTag}
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content="${safeTitle}" />
          <meta name="twitter:description" content="${safeDesc}" />
          ${structuredDataTag}
        </head>
        <body>
          <h1>${safeTitle}</h1>
          <p>${safeDesc}</p>
          ${extraBodyTag}
        </body>
        </html>
      `;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(200).send(html);
      return;
    }

    const indexPath = path.join(__dirname, "../dist/index.html");
    if (fs.existsSync(indexPath)) {
      const indexHtml = fs.readFileSync(indexPath, "utf8");
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
  if (!churchSlug && requestPath === "/website") {
    // 카카오톡 등 메신저 미리보기 봇: /website는 특정 교회가 아니라 "교회
    // 홈페이지 제작" 제품 소개 페이지라서, 아무 분기도 안 타면 루트(/)의
    // 일반 주보 홍보 문구가 그대로 나가버린다(실제로 확인된 버그) - 이 페이지
    // 전용 OG 카드를 만들어준다.
    if (isPreviewBot) {
      const ogTitle = "교회 홈페이지 무료로 만들기 | STAYON";
      const ogDesc =
        "수백만 원짜리 교회 홈페이지를 3단계면 무료로 완성해요. " +
        "디자인 몰라도 괜찮아요.";
      const ogUrl = "https://bulletin.stayon-platform.com/website";
      const ogImage =
        "https://bulletin.stayon-platform.com/stayon_website_kakao_cover.png";
      const html = `
        <!DOCTYPE html>
        <html lang="ko">
        <head>
          <meta charset="utf-8" />
          <title>${ogTitle}</title>
          <meta property="og:type" content="website" />
          <meta property="og:title" content="${ogTitle}" />
          <meta property="og:description" content="${ogDesc}" />
          <meta property="og:url" content="${ogUrl}" />
          <meta property="og:image" content="${ogImage}" />
        </head>
        <body>
          <h1>${ogTitle}</h1>
          <p>${ogDesc}</p>
        </body>
        </html>
      `;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(200).send(html);
      return;
    }

    if (isSearchBot) {
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
      const usersSnap = await db
        .collection("users")
        .where("bulletinSearchable", "==", true)
        .get();

      const urlEntries: string[] = [];

      // 교회당 "최신 주보" 고정 링크(/view/{uid}) - 항상 지금 발행된 주보를 보여줌
      usersSnap.forEach((doc) => {
        const loc = `https://bulletin.stayon-platform.com/view/${doc.id}`;
        urlEntries.push(`  <url><loc>${loc}</loc></url>`);
      });

      // 교회마다 발행된 주보 "전체"를 각자 고유 URL(/view/{주보문서ID})로도
      // 등록한다. 매주 새 주보를 발행할 때마다 색인 가능한 페이지가 하나씩
      // 쌓이게 하기 위함 - 경쟁사(주보플러스)처럼 "주보마다 영구 URL"이 있어야
      // 콘텐츠가 누적되지, 교회당 "최신 주보" 링크 1개만으로는 매주 똑같은
      // 페이지 하나만 재사용하는 꼴이라 구글이 쌓인 콘텐츠로 안 쳐준다.
      const searchableUids = usersSnap.docs.map((d) => d.id);
      if (searchableUids.length > 0) {
        // Firestore "in" 쿼리는 최대 30개까지만 받아서 30개씩 끊어서 조회
        const chunks: string[][] = [];
        for (let i = 0; i < searchableUids.length; i += 30) {
          chunks.push(searchableUids.slice(i, i + 30));
        }
        for (const chunk of chunks) {
          const bulletinsSnap = await db
            .collection("bulletins")
            .where("authorId", "in", chunk)
            .where("status", "==", "published")
            .get();
          bulletinsSnap.forEach((doc) => {
            const data = doc.data() as Record<string, unknown>;
            const publishedAt =
              data.publishedAt as admin.firestore.Timestamp | undefined;
            const lastmod = publishedAt ?
              publishedAt.toDate().toISOString().split("T")[0] :
              undefined;
            const loc =
              `https://bulletin.stayon-platform.com/view/${doc.id}`;
            urlEntries.push(
              lastmod ?
                `  <url><loc>${loc}</loc><lastmod>${lastmod}</lastmod></url>` :
                `  <url><loc>${loc}</loc></url>`
            );
          });
        }
      }

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
