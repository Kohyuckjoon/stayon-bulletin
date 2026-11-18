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
import {
  resolveCtx, buildSeoPage, buildRss, sitemapEntries, SeoPage,
  juboSiteBase, churchVerificationMetas, JUBO_HOST_SUFFIX, BULLETIN_SLUG_REGEX,
  verificationCode, withFavicon, denominationId,
} from "./bulletinSeo";
import {churchSitePage, churchSitePaths, churchSiteRss} from "./churchSiteSeo";

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

const PLAN_TIERS = ["basic", "standard", "pro", "allinone"];
const PLAN_LABELS: Record<string, string> = {
  "베이직": "basic", "스탠다드": "standard", "프로": "pro", "올인원": "allinone",
};

/**
 * 정기결제로 결제한 요금제 등급(users.status 값).
 * billingFeaturePlan이 없던 예전 등록은 요금제 이름(예: "개척 베이직 정기결제
 * 플랜")에서 찾고, 그래도 모르면 예전 동작대로 올인원.
 * @param {FirebaseFirestore.DocumentData} data users/{uid} 문서 데이터
 * @return {string} basic | standard | pro | allinone
 */
function recurringPlanTier(data: FirebaseFirestore.DocumentData): string {
  const key = String(data.billingFeaturePlan || "");
  if (PLAN_TIERS.includes(key)) return key;
  const name = String(data.billingPlanName || "");
  const label = Object.keys(PLAN_LABELS).find((l) => name.includes(l));
  return label ? PLAN_LABELS[label] : "allinone";
}

// 결제 성공 후 처리(이용 기간 연장·다음 결제일·성공 메일). 매일 도는 결제와
// 카드 등록 직후 첫 결제(chargeFirstRecurring)가 공통으로 쓴다.
/**
 * @param {string} uid 사용자(교회) uid
 * @param {FirebaseFirestore.DocumentData} data users/{uid} 문서 데이터
 * @param {Date} scheduledDue 이번 결제의 기준 결제일(다음 결제일 = +1개월)
 * @return {Promise<void>}
 */
async function applyRecurringSuccess(
  uid: string,
  data: FirebaseFirestore.DocumentData,
  scheduledDue: Date
): Promise<void> {
  const amount = data.billingAmount as number;
  const planName = (data.billingPlanName as string) || "정기결제";
  const email = (data.email as string) || "";
  const churchName = (data.churchName as string) || "교회담당자";
  const now = new Date();
  let baseDate = now;
  const current = data.lastPaymentDate as
    FirebaseFirestore.Timestamp | undefined;
  if (current?.toDate && current.toDate() > now) {
    baseDate = current.toDate();
  }
  const newExpiration = addMonthsClamped(baseDate, 1);

  await db.collection("users").doc(uid).update({
    status: recurringPlanTier(data), // 결제한 요금제 등급 그대로(/super 상태값)
    isPaidUser: true,
    currentPlan: planName,
    lastPaymentDate: admin.firestore.Timestamp.fromDate(newExpiration),
    nextBillingDate:
      admin.firestore.Timestamp.fromDate(addMonthsClamped(scheduledDue, 1)),
    billingFailCount: 0,
    // 첫 결제가 끝났다는 표시(스케줄 함수가 먼저 처리한 경우에도 꺼서,
    // chargeFirstRecurring이 같은 첫 결제를 한 번 더 긁지 못하게 함)
    firstChargePending: false,
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
    // 다음 결제일은 "지금"이 아니라 "원래 예정됐던 결제일"을 기준으로
    // +1개월 해야 "매월 같은 날 결제" 약속이 지켜진다. 실패 후 재시도로
    // 처리 시각이 며칠 늦어져도(now 기준으로 계산하면) 결제일이 그 늦어진
    // 날로 영구히 밀려버리는 버그가 있었음 — scheduledDue를 기준으로 고침.
    const scheduledDue = (data.nextBillingDate as
      FirebaseFirestore.Timestamp | undefined)?.toDate() || new Date();
    await applyRecurringSuccess(uid, data, scheduledDue);
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

// 카드 등록 직후 첫 결제. /pricing에서 정기결제 카드를 등록하면 프론트
// (useBillingKey.ts)가 바로 이 함수를 불러 그 자리에서 첫 달 금액을 결제하고,
// 다음 결제일을 한 달 뒤로 잡는다. firstChargePending이 켜진 계정만, 한 번만
// 결제(버튼 연타·새로고침으로 두 번 긁히지 않게 트랜잭션으로 먼저 끔).
// POST, 헤더 Authorization: Bearer <Firebase ID 토큰>
export const chargeFirstRecurring = functions.https.onRequest(
  {secrets: ["PORTONE_API_SECRET"], cors: true},
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({error: "POST만 받아요."});
      return;
    }
    let uid = "";
    try {
      const token = String(req.headers.authorization || "")
        .replace(/^Bearer\s+/i, "");
      uid = (await admin.auth().verifyIdToken(token)).uid;
    } catch {
      res.status(401).json({error: "로그인이 필요합니다."});
      return;
    }
    const ref = db.collection("users").doc(uid);
    const data = await db.runTransaction(async (tx) => {
      const d = (await tx.get(ref)).data();
      if (!d || d.firstChargePending !== true || !d.billingKey ||
        !d.billingAmount || d.subscriptionActive !== true) return null;
      tx.update(ref, {firstChargePending: false});
      return d;
    });
    if (!data) {
      res.status(409).json({error: "이미 처리됐거나 결제할 정기결제가 없어요."});
      return;
    }
    const result = await chargeBillingKeyPayment(
      data.billingKey as string, data.billingAmount as number,
      (data.billingPlanName as string) || "정기결제", uid
    );
    if (result.success) {
      // 다음 결제일 = 오늘 + 1개월
      await applyRecurringSuccess(uid, data, new Date());
      res.json({ok: true});
      return;
    }
    // 첫 결제 실패: 정기결제를 꺼서 다음 날 자동으로 긁히지 않게 하고,
    // 교회가 화면에서 바로 사유를 보고 카드를 다시 등록하게 함
    await ref.update({
      subscriptionActive: false,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`[정기결제 첫 결제 실패] ${uid} — ${result.message}`);
    res.status(402).json({error: result.message || "결제에 실패했어요."});
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

// 교회 홈페이지 "지난 설교": 교회 유튜브 채널에 올린 영상을 자동으로 가져온다(2026-11-10).
// 채널 주소(@아이디·/channel/·영상 주소 모두 가능)로 채널 ID를 찾고, 유튜브가 공개하는
// 채널 RSS(최신 15개, API 키 필요 없음)를 읽어 {id,title,published}로 돌려준다.
// 같은 채널은 30분 동안 기억해 두고 바로 돌려줌(유튜브에 매번 묻지 않게)
const ytCache = new Map<string, {t: number; videos: unknown[]}>();
const ytIdCache = new Map<string, string>(); // 채널 주소 → 채널 ID
const ytLiveCache = new Map<string, {t: number; live: unknown}>();
const YT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

// 온라인 예배 화면: 지금 실시간 방송 중이면 그 영상 ID(2분 동안 기억). 채널의
// /live 주소는 방송 중일 때만 대표 주소가 watch?v=영상ID가 된다
const ytLiveNow = async (channelId: string) => {
  const hit = ytLiveCache.get(channelId);
  if (hit && Date.now() - hit.t < 2 * 60 * 1000) return hit.live;
  let live: {id: string; title: string} | null = null;
  try {
    const html = await (await fetch(
      `https://www.youtube.com/channel/${channelId}/live`,
      {headers: {"User-Agent": YT_UA, "Accept-Language": "ko"}}
    )).text();
    const id = (html.match(
      /<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/ // eslint-disable-line max-len
    ) || [])[1];
    if (id && /"isLiveNow":true/.test(html)) {
      const title = (html.match(/<meta name="title" content="([^"]*)"/) ||
        [])[1] || "";
      live = {id, title};
    }
  } catch (e) {
    console.error("유튜브 실시간 확인 실패:", e);
  }
  ytLiveCache.set(channelId, {t: Date.now(), live});
  return live;
};

// 교회 홈페이지에서 부를 때(site=주소): 받은 영상 목록을 그 교회 사이트 데이터에 저장해 둠
// (채널 = ytVideos, 지난 설교 재생목록 = ytPlaylist) → 다음 방문자는 사이트 데이터와 함께 바로
// 받아서 이 함수를 부르지 않음. 홈페이지는 저장본이 1시간보다 오래됐을 때만 이 함수를 부름
// (방문이 없으면 호출도 없음). 이미 1시간 안에 같은 주소로 저장돼 있으면 다시 쓰지 않음
const YT_SITE_TTL = 60 * 60 * 1000;
const YT_MAX = 24; // 홈페이지에 보여 줄 영상 최대 개수(주 1개면 약 6개월치)
type YtItem = {id: string; title: string; published: string; short: boolean};
const saveYtToSite = async (
  slug: string, field: "ytVideos" | "ytPlaylist", url: string, videos: unknown[]
) => {
  if (!slug || videos.length === 0) return;
  try {
    const ref = db.collection("churchSites").doc(slug);
    const snap = await ref.get();
    if (!snap.exists) return;
    const cur = snap.get(field) || {};
    if (cur.url === url && Date.now() - Number(cur.t || 0) < YT_SITE_TTL) {
      return;
    }
    await ref.update({[field]: {url, t: Date.now(), videos}});
  } catch (e) {
    console.error("유튜브 영상 목록 저장 실패:", e);
  }
};

const ytUnescape = (t: string) => t.replace(/&amp;/g, "&")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, "\"").replace(/&#39;/g, "'");

// 유튜브 RSS(채널: channel_id=, 재생목록: playlist_id=). 최신 15개까지만 주고,
// 같은 주소도 될 때와 안 될 때(404)가 섞여 있어서 몇 번 다시 시도
const ytFeed = async (query: string): Promise<YtItem[]> => {
  let xml = "";
  for (let i = 0; i < 4 && !xml.includes("<entry>"); i++) {
    if (i) await new Promise((r) => setTimeout(r, 400 * i));
    try {
      const r = await fetch(`https://www.youtube.com/feeds/videos.xml?${query}`,
        {headers: {"User-Agent": YT_UA}});
      xml = r.ok ? await r.text() : "";
    } catch (e) {
      xml = "";
    }
  }
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)]
    .map((m) => ({
      id: (m[1].match(/<yt:videoId>([^<]+)/) || [])[1] || "",
      title: ytUnescape((m[1].match(/<title>([^<]*)/) || [])[1] || ""),
      published: (m[1].match(/<published>([^<]+)/) || [])[1] || "",
      // 쇼츠는 RSS 링크가 /shorts/영상ID 형태
      short: /<link rel="alternate" href="[^"]*\/shorts\//.test(m[1]),
    }))
    .filter((v) => v.id);
};

// RSS가 24개가 안 되면(15개 제한·실패) 유튜브 화면(채널 "동영상" / 재생목록)에서
// 영상 ID·제목을 더 읽어 뒤에 붙임(이렇게 붙인 영상은 날짜 없음). 최대 24개
const ytFillFromPage = async (pageUrl: string, videos: YtItem[]) => {
  if (videos.length >= YT_MAX) return;
  try {
    const html = await (await fetch(pageUrl,
      {headers: {"User-Agent": YT_UA, "Accept-Language": "ko"}})).text();
    const seen = new Set(videos.map((v) => v.id));
    for (const seg of html.split("\"lockupViewModel\":{").slice(1)) {
      const id = (seg.match(
        /"contentId":"([\w-]{11})","contentType":"LOCKUP_CONTENT_TYPE_VIDEO"/
      ) || [])[1];
      const raw = (seg.match(
        /"lockupMetadataViewModel":\{"title":\{"content":"((?:[^"\\]|\\.)*)"/
      ) || [])[1];
      if (!id || raw === undefined || seen.has(id)) continue;
      seen.add(id);
      let title = raw;
      try {
        title = JSON.parse(`"${raw}"`);
      } catch (e) {
        // 그대로 씀
      }
      videos.push({id, title, published: "", short: false});
      if (videos.length >= YT_MAX) break;
    }
  } catch (e) {
    console.error("유튜브 화면 읽기 실패:", e);
  }
};

// url = 채널 주소(실시간 방송·채널 영상) 또는 재생목록 주소(playlist?list=, 지난 설교용)
export const youtubeVideos = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  const channelUrl = String(req.query.url || "");
  const siteSlug = String(req.query.site || "").replace(/[^a-z0-9-]/g, "");
  if (!/^https:\/\/((www|m)\.)?(youtube\.com|youtu\.be)\//.test(channelUrl)) {
    res.status(400).json({error: "invalid url"});
    return;
  }
  const playlistId = (channelUrl.match(/[?&]list=([\w-]+)/) || [])[1] || "";
  // 재생목록은 실시간 방송 확인 없음
  const wantLive = req.query.live === "1" && !playlistId;
  const field = playlistId ? "ytPlaylist" : "ytVideos";
  const hit = ytCache.get(channelUrl);
  const cachedId = ytIdCache.get(channelUrl);
  if (hit && Date.now() - hit.t < 30 * 60 * 1000) {
    const live = wantLive && cachedId ? await ytLiveNow(cachedId) : null;
    await saveYtToSite(siteSlug, field, channelUrl, hit.videos);
    res.set("Cache-Control", wantLive ?
      "public, max-age=60" : "public, max-age=1800");
    res.json({videos: hit.videos, live});
    return;
  }
  try {
    let videos: YtItem[] = [];
    let channelId = "";
    if (playlistId) {
      videos = await ytFeed(`playlist_id=${playlistId}`);
      await ytFillFromPage(
        `https://www.youtube.com/playlist?list=${playlistId}`, videos);
    } else {
      channelId = (channelUrl.match(/\/channel\/(UC[\w-]{22})/) || [])[1] || "";
      if (!channelId) {
        const html = await (await fetch(channelUrl, {
          headers: {"User-Agent": YT_UA, "Accept-Language": "ko"},
        })).text();
        channelId = (
          html.match(/"externalId":"(UC[\w-]{22})"/) ||
          html.match(/<meta itemprop="identifier" content="(UC[\w-]{22})"/) ||
          html.match(/"channelId":"(UC[\w-]{22})"/) || []
        )[1] || "";
      }
      if (!channelId) {
        res.json({videos: []});
        return;
      }
      videos = await ytFeed(`channel_id=${channelId}`);
      await ytFillFromPage(
        `https://www.youtube.com/channel/${channelId}/videos`, videos);
      ytIdCache.set(channelUrl, channelId);
    }
    videos = videos.slice(0, YT_MAX);
    // 빈 결과는 기억하지 않음(다음 방문 때 다시 가져오게)
    if (videos.length) ytCache.set(channelUrl, {t: Date.now(), videos});
    await saveYtToSite(siteSlug, field, channelUrl, videos);
    const live = wantLive && channelId ? await ytLiveNow(channelId) : null;
    res.set("Cache-Control", wantLive ?
      "public, max-age=60" : "public, max-age=1800");
    res.json({videos, live});
  } catch (error) {
    console.error("유튜브 영상 목록 가져오기 실패:", error);
    res.status(500).json({error: "fetch failed"});
  }
});

const BOT_AGENT_REGEX =
  /kakaotalk-scrap|facebookexternalhit|twitterbot|slackbot|telegrambot/i;
// 검색봇 전용 판별 정규식. BOT_AGENT_REGEX(메신저 링크 미리보기 봇)와는 완전히
// 별개 — 교회가 "검색엔진 노출"을 켠 주보(users/{uid}.bulletinSearchable===true)만
// 이 분기에서 실제 내용을 내려주고, 안 켠 교회는 noindex를 명시해 색인에서 제외한다.
// google-firebase: Firebase Hosting이 rewrite로 함수에 넘길 때 UA의 "Googlebot"을
// "Google-Firebase"로 바꿔서 전달함(로그로 확인). 이게 없으면 구글봇이 이 분기를
// 못 타고 빈 SPA(index.html)만 받아가서 모든 주보가 메인 페이지 중복으로 처리됨.
const SEARCH_BOT_REGEX =
  /googlebot|google-firebase|bingbot|google-inspectiontool|yeti/i;

// 빌드 후 scripts/prerender.mjs가 메인(index.html)·pricing.html·website.html을
// 내용이 다 그려진 HTML로 만들고, 원래의 빈 SPA 껍데기는 app.html로 옮긴다.
// 주보(/view)·교회 사이트처럼 함수가 내려주는 화면은 계속 빈 껍데기를 써야
// 하므로 app.html을 읽는다(없으면 예전처럼 index.html)
const distFile = (name: string) => path.join(__dirname, "../dist", name);
const SHELL_HTML_PATH = fs.existsSync(distFile("app.html")) ?
  distFile("app.html") :
  distFile("index.html");
const WEBSITE_HTML_PATH = fs.existsSync(distFile("website.html")) ?
  distFile("website.html") :
  SHELL_HTML_PATH;

export const bulletinOG = functions.https.onRequest(async (req, res) => {
  const userAgent = req.headers["user-agent"] || "";
  console.log("[UA 확인]", userAgent); // ← 이 줄 추가

  // /view/{id}[/{하위 메뉴}[/{상세 id}]] — 성도 화면 라우트(routes.tsx)와 같은 구조
  const segs = req.path.split("/").filter(Boolean);
  const viewId = segs[0] === "view" ? segs[1] || "" : "";
  const viewSub = segs[0] === "view" ? segs[2] || "" : "";
  const viewSubId = segs[0] === "view" ? segs[3] || "" : "";

  // 교회별 RSS(/view/{uid}/rss.xml) — 검색엔진 노출을 켠 교회만
  if (viewId && viewSub === "rss.xml") {
    try {
      const ctx = await resolveCtx(viewId);
      if (ctx && ctx.searchable) {
        res.setHeader("Content-Type", "application/rss+xml; charset=utf-8");
        res.status(200).send(buildRss(ctx));
        return;
      }
    } catch (error) {
      console.error("RSS 생성 에러:", error);
    }
    res.status(404).send("Not Found");
    return;
  }

  // 검색봇(구글/빙/네이버): 교회가 "검색엔진 노출"을 켰으면 bulletinSeo.ts가
  // 만든 완성된 HTML(주보 본문 + 하위 메뉴 페이지)을, 안 켰거나 성도 화면에 없는
  // 페이지면 noindex를 붙인 SPA를 준다. 스크립트 없는 정적 HTML을 주는 이유:
  // SPA를 주면 구글 2차 렌더링 때 Firestore 로딩 전 "불러오는 중..." 화면에서
  // 캡처가 끝나버리는 문제가 실제로 확인됨(서치콘솔 실시간 테스트로 재현).
  if (SEARCH_BOT_REGEX.test(userAgent)) {
    let page: SeoPage | null = null;
    try {
      const ctx = viewId ? await resolveCtx(viewId) : null;
      if (ctx && ctx.searchable) page = buildSeoPage(ctx, viewSub, viewSubId);
    } catch (error) {
      console.error("검색봇 페이지 생성 에러:", error);
    }
    if (page) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(200).send(page.html);
      return;
    }
    const indexPath = SHELL_HTML_PATH;
    if (fs.existsSync(indexPath)) {
      const indexHtml = fs.readFileSync(indexPath, "utf8");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(200).send(indexHtml.replace(
        "</head>",
        "  <meta name=\"robots\" content=\"noindex, nofollow\" />\n  </head>"
      ));
      return;
    }
    res.status(404).send("Not Found");
    return;
  }

  const pathSegments = req.path.split("/");
  const bulletinId = pathSegments[pathSegments.length - 1];

  let churchName = "우리 교회";
  let description = "스마트 모바일 주보를 확인해보세요.";
  let imageUrl =
    "https://bulletin.stayon-platform.com/stayon_jubo_kakao_cover.png";
  let authorUid: string | null = null;

  if (bulletinId && bulletinId !== "view") {
    try {
      const userDocRef = await db.collection("users").doc(bulletinId).get();

      let userData: Record<string, unknown> | null = null;
      let bulletinData: Record<string, unknown> | null = null;

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

  // 3. 일반 성도인 경우: SPA의 실제 index.html을 서브하여 해시 없는 /view/... 주보 화면이 정상 렌더링되도록 함
  //    검색엔진 노출을 켠 교회는 head(제목/설명/canonical/og)만 검색봇이 받는
  //    것과 똑같이 맞춘다 - 구글이 일반 브라우저로 확인 요청을 했을 때 메인
  //    페이지 head(og:url=메인)가 나오면 봇용 페이지와 어긋나 보이기 때문.
  //    본문/스크립트는 손대지 않으므로 성도 화면(React)은 그대로.
  let seoPage: SeoPage | null = null;
  try {
    const ctx = viewId ?
      await resolveCtx(viewId, {onlySearchable: true}) :
      null;
    if (ctx) seoPage = buildSeoPage(ctx, viewSub, viewSubId);
  } catch (error) {
    console.error("성도 화면 head 생성 에러:", error);
  }
  try {
    const indexPath = SHELL_HTML_PATH;
    if (fs.existsSync(indexPath)) {
      const indexHtml = fs.readFileSync(indexPath, "utf8");
      let html = seoPage ?
        injectChurchMeta(indexHtml, {
          title: escapeHtml(seoPage.title),
          description: escapeHtml(seoPage.description),
          canonicalUrl: escapeHtml(seoPage.canonical),
          imageUrl: /^https?:\/\//.test(imageUrl) ? escapeHtml(imageUrl) : "",
        }) :
        indexHtml;
      // 구글 색인 문제(2026-11-10): 성도용 HTML에도 검색봇과 같은 주보 본문·구조화
      // 데이터를 넣음(봇/사람이 받는 내용이 같도록 - 주보 전용 주소 bulletinSite와 같은
      // 방식). 본문은 #root 안 data-ssr 묶음에 넣고, 성도 화면(React)이 다 그려지면
      // main.tsx가 지움 — 성도가 보는 주보 화면은 기존과 동일
      if (seoPage) {
        const body = seoPage.html.match(/<body>([\s\S]*)<\/body>/);
        const style = seoPage.html.match(/<style>[\s\S]*?<\/style>/);
        const ld = seoPage.html.match(
          /<script type="application\/ld\+json">[\s\S]*?<\/script>/);
        if (body) {
          html = html.replace("<div id=\"root\"></div>",
            `<div id="root"><div data-ssr="1">${style ? style[0] : ""}` +
            `${body[1]}</div></div>`);
        }
        if (ld) html = html.replace("</head>", `${ld[0]}\n</head>`);
      }
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(200).send(html);
      return;
    }
  } catch (e) {
    console.error("index.html 로드 실패:", e);
  }

  res.status(500).send("Internal Server Error");
});

// website: 교회 홈페이지 제작 소개 페이지 전용 주소(2026-11-12) — 교회 주소로 보지 않음
const KNOWN_SUBDOMAINS = [
  "www", "bulletin", "place", "stayonsbplatform", "website",
];

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
// google-firebase: Firebase Hosting 경유 시 "Googlebot"이 바뀌어 들어오는 UA
// (SEARCH_BOT_REGEX 주석 참고)
const SITE_SEARCH_BOT_REGEX =
  /googlebot|google-firebase|bingbot|google-inspectiontool|yeti/i;

// 검색봇에게는 얇은 미리보기용 안내 HTML이 아니라 실제 SPA(index.html)를
// 그대로 주면서 head의 title/description/OG 태그만 이 교회 것으로 바꿔 끼움
// — 그래야 검색엔진이 받는 첫 HTML부터 교회별로 구분되면서도, 스크립트가
// 그대로 있어서 이어서 실제 페이지 내용도 정상적으로 렌더링됨
/**
 * @param {string} html 원본 index.html 문자열
 * @param {{title: string, description: string, canonicalUrl: string,
 *   imageUrl: string}} meta 교회별 메타 값
 * @param {boolean} forChurchSite 교회 홈페이지용이면 플랫폼 문구·결제 스크립트 정리
 * @return {string} 치환된 HTML 문자열
 */
function injectChurchMeta(
  html: string,
  meta: {
    title: string;
    description: string;
    canonicalUrl: string;
    imageUrl: string;
  },
  forChurchSite = false
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
  // 교회 홈페이지인데 주보 플랫폼 홍보 문구(키워드 "온라인 주보, 990원 주보"·트위터 카드)와
  // 결제 스크립트가 그대로 남아 있었음 → 구글이 보기엔 모든 교회 사이트가 같은 플랫폼 광고 페이지.
  // 교회 것으로 바꾸고 필요 없는 건 뺌. 교회 홈페이지(검색봇용)에서만 — 주보 화면(/view, -jubo)은 그대로
  if (!forChurchSite) {
    return result.replace(
      "</head>",
      `  <link rel="canonical" href="${meta.canonicalUrl}" />\n  </head>`
    );
  }
  result = result
    .replace(/\s*<meta\s+name="keywords"\s+content="[^"]*"\s*\/?>/, "")
    .replace(/\s*<meta\s+name="author"\s+content="[^"]*"\s*\/?>/, "")
    .replace(
      /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/,
      `<meta name="twitter:title" content="${meta.title}" />`
    )
    .replace(
      /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/,
      `<meta name="twitter:description" content="${meta.description}" />`
    )
    .replace(/\s*<script\s+src="https:\/\/cdn\.portone\.io[^"]*"><\/script>/,
      "");
  if (meta.imageUrl) {
    result = result
      .replace(
        /<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/,
        `<meta property="og:image" content="${meta.imageUrl}" />`
      )
      .replace(
        /<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?>/,
        `<meta name="twitter:image" content="${meta.imageUrl}" />`
      );
  } else {
    result = result.replace(
      /\s*<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?>/, "");
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
  // 쿼리(?utm_… 등)는 떼고 경로만 봄 — 붙어 있으면 /website?utm=… 같은 주소가
  // 아래 분기에 안 걸려 빈 껍데기 HTML이 나갔음
  const rawPath = (queryHost ? queryPath : (req.originalUrl || "/"))
    .split("?")[0] || "/";
  // website.stayon-platform.com 첫 화면 = bulletin.../website 와 같은 소개 페이지
  const isWebsiteHost =
    (originalHost || "").split(":")[0] === "website.stayon-platform.com";
  const requestPath = isWebsiteHost && rawPath.split("?")[0] === "/" ?
    "/website" : rawPath;
  const churchSlug = getChurchSlugFromHost(originalHost);

  // (2026-11-13) website.stayon-platform.com 검색 노출: 전용 robots.txt·sitemap.xml.
  // 예전엔 둘 다 주보 플랫폼 앱 HTML이 나가서 구글이 사이트맵을 못 읽었음
  if (isWebsiteHost) {
    const websitePath = rawPath.split("?")[0];
    if (websitePath === "/robots.txt") {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.status(200).send("User-agent: *\nAllow: /\n\n" +
        "Sitemap: https://website.stayon-platform.com/sitemap.xml\n");
      return;
    }
    if (websitePath === "/sitemap.xml") {
      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.status(200).send("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n" +
        "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n" +
        "  <url><loc>https://website.stayon-platform.com/</loc></url>\n" +
        "</urlset>\n");
      return;
    }
    // 첫 화면(/) 말고 website 주소에서 보이는 화면(/login·/signup 등)은 주보 플랫폼과
    // 같은 화면이라 검색 결과에 따로 뜨지 않게 noindex
    if (websitePath !== "/" && fs.existsSync(SHELL_HTML_PATH)) {
      const shellHtml = fs.readFileSync(SHELL_HTML_PATH, "utf8");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(200).send(shellHtml.replace("</head>",
        "  <meta name=\"robots\" content=\"noindex\" />\n  </head>"));
      return;
    }
  }

  const isPreviewBot = SITE_PREVIEW_BOT_REGEX.test(userAgent);
  const isSearchBot = SITE_SEARCH_BOT_REGEX.test(userAgent);

  // 교회 홈페이지 주소의 robots.txt / sitemap.xml. 예전엔 Firebase Hosting의
  // bulletin용 파일이 그대로 나가서(다른 도메인 사이트맵) 교회마다 네이버에
  // 따로 등록할 수 없었다. Worker가 이 두 경로만 UA와 상관없이 넘겨준다
  if (churchSlug && (requestPath === "/robots.txt" ||
    requestPath === "/sitemap.xml" || requestPath === "/rss.xml")) {
    try {
      const siteDoc = await db.collection("churchSites").doc(churchSlug).get();
      const site = siteDoc.exists ?
        siteDoc.data() as Record<string, unknown> : null;
      if (!site) {
        res.status(404).send("Not Found");
        return;
      }
      const base = `https://${churchSlug}.stayon-platform.com`;
      const published = site.published === true;
      if (requestPath === "/robots.txt") {
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.status(200).send([
          "User-agent: *",
          "Allow: /",
          "Disallow: /admin",
          "Disallow: /super",
          "",
          published ? `Sitemap: ${base}/sitemap.xml` : "",
          "",
        ].join("\n"));
        return;
      }
      // 교회 홈페이지 RSS(페이지 전환형만 — 원페이지형은 상세 페이지가 없음)
      if (requestPath === "/rss.xml") {
        if (!published || site.layoutMode === "onepage") {
          res.status(404).send("Not Found");
          return;
        }
        const ownerId = typeof site.ownerId === "string" ? site.ownerId : "";
        const ctx = ownerId ? await resolveCtx(ownerId) : null;
        res.setHeader("Content-Type", "application/rss+xml; charset=utf-8");
        res.status(200).send(churchSiteRss(site, ctx, base));
        return;
      }
      // 페이지 전환형: 메뉴별 페이지 + 지난 주보·소식·칼럼·중보기도 상세까지
      if (published && site.layoutMode !== "onepage") {
        const ownerId = typeof site.ownerId === "string" ? site.ownerId : "";
        const ctx = ownerId ? await resolveCtx(ownerId) : null;
        res.setHeader("Content-Type", "application/xml; charset=utf-8");
        res.status(200).send([
          "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
          "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">",
          ...churchSitePaths(site, ctx, base)
            .map((loc) => `  <url><loc>${escapeHtml(loc)}</loc></url>`),
          "</urlset>",
        ].join("\n"));
        return;
      }
      const updatedAt = site.updatedAt as admin.firestore.Timestamp | undefined;
      const lastmod = updatedAt && typeof updatedAt.toDate === "function" ?
        updatedAt.toDate().toISOString().split("T")[0] : "";
      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      res.status(200).send([
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
        "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">",
        published ? (lastmod ?
          `  <url><loc>${base}/</loc><lastmod>${lastmod}</lastmod></url>` :
          `  <url><loc>${base}/</loc></url>`) : "",
        "</urlset>",
      ].filter(Boolean).join("\n"));
      return;
    } catch (error) {
      console.error("교회 사이트 robots/sitemap 에러:", error);
      res.status(500).send("Internal Server Error");
      return;
    }
  }

  // 일반 방문자(사람)도 교회 페이지 HTML을 받음(2026-11-10). 예전엔 사람에게는 Hosting의
  // 주보 플랫폼 메인(제목 "온라인 주보 제작 스테이온", 대표 주소 bulletin)이 나가고 봇에게만
  // 교회 페이지를 줘서, 구글이 "교회 주소 = bulletin 메인 복사본 + 봇에게만 다른 내용"으로 보고
  // 색인하지 않았음. 주보플러스처럼 누구에게나 같은 HTML을 주고, 사람은 그 위에 React가 뜸
  const isHumanVisit = !isPreviewBot && !isSearchBot;
  if (churchSlug) {
    try {
      const siteRef = db.collection("churchSites").doc(churchSlug);
      const siteDoc = await siteRef.get();
      // 구글 색인 문제(2026-11-09): 없는 교회 주소(아무거나.stayon-platform.com)나 발행 전 사이트도
      // 예전엔 아래 "그 외 모든 경우"로 빠져 주보 플랫폼 첫 화면을 200으로 줬음 → 구글이 보기엔 같은 내용이
      // 주소만 바꿔 무한히 있는 사이트(저품질)로 보임. 검색봇에게는 404로 "없는 페이지"라고 정확히 알려 줌
      const notPublished =
        !siteDoc.exists || siteDoc.data()?.published !== true;
      if (isSearchBot && notPublished) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("X-Robots-Tag", "noindex");
        res.status(404).send("<!DOCTYPE html><html lang=\"ko\"><head>" +
          "<meta charset=\"utf-8\" />" +
          "<meta name=\"robots\" content=\"noindex\" />" +
          "<title>페이지를 찾을 수 없습니다</title></head>" +
          "<body><h1>페이지를 찾을 수 없습니다</h1></body></html>");
        return;
      }
      // 카카오톡 등 미리보기 봇 + 아직 없는 교회 주소(목사님께 미리 보낸 제안 주소 등):
      // 예전엔 아래 "그 외"로 빠져 주보 플랫폼 홍보 카드가 떴음 → 홈페이지 준비 중 카드로
      if (isPreviewBot && !siteDoc.exists) {
        const ogTitle = "교회 홈페이지를 준비하고 있어요 | STAYON";
        const ogDesc = "STAYON과 함께 곧 새 교회 홈페이지가 열려요.";
        const ogUrl = escapeHtml(`https://${originalHost}/`);
        const ogImage = "https://bulletin.stayon-platform.com/" +
          "stayon_website_kakao_cover.png";
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.status(200).send(`<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="robots" content="noindex" />
  <title>${ogTitle}</title>
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${ogTitle}" />
  <meta property="og:description" content="${ogDesc}" />
  <meta property="og:url" content="${ogUrl}" />
  <meta property="og:image" content="${ogImage}" />
  <meta property="og:image:width" content="1774" />
  <meta property="og:image:height" content="887" />
</head>
<body><h1>${ogTitle}</h1><p>${ogDesc}</p></body>
</html>`);
        return;
      }
      // 사람: 발행 전·원페이지형은 예전과 똑같이 아래 기본 화면(React가 그림)으로
      const humanFallback = isHumanVisit &&
        (notPublished || siteDoc.data()?.layoutMode === "onepage");
      if (siteDoc.exists && !humanFallback) {
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
        // 카카오톡 등 미리보기 카드 제목: 교회 이름만(2026-11-13, 예전엔 "교회이름 | STAYON")
        const ogTitle = churchName;
        const pageUrl = `https://${originalHost}${requestPath}`;
        const safeTitle = escapeHtml(ogTitle);
        const safeDesc = escapeHtml(description);
        const safeUrl = escapeHtml(pageUrl);
        const safeImageUrl = imageUrl ? escapeHtml(imageUrl) : "";

        // 페이지 전환형 교회 홈페이지: 주소마다 그 페이지 내용(MultiPageSite와 같음)
        if ((isSearchBot || isHumanVisit) && site.layoutMode !== "onepage" &&
          fs.existsSync(SHELL_HTML_PATH)) {
          const ownerId = typeof site.ownerId === "string" ? site.ownerId : "";
          const ctx = ownerId ? await resolveCtx(ownerId) : null;
          const base = `https://${churchSlug}.stayon-platform.com`;
          const page = churchSitePage(site, ctx, base, requestPath);
          const shell = fs.readFileSync(SHELL_HTML_PATH, "utf8");
          const metas = [
            ["naver-site-verification", site.naverSiteVerification],
            ["google-site-verification", site.googleSiteVerification],
          ].map(([name, v]) => {
            const code = verificationCode(v);
            return code ? `<meta name="${name}" content="${code}" />` : "";
          }).filter(Boolean).join("\n");
          const html = page ?
            injectChurchMeta(shell, {
              title: escapeHtml(page.title),
              description: escapeHtml(page.description),
              canonicalUrl: escapeHtml(page.canonical),
              imageUrl: safeImageUrl,
            }, true).replace("<div id=\"root\"></div>",
              `<div id="root">${page.bodyHtml}</div>`)
              .replace("</head>", `${page.styleHtml}\n</head>`) :
            shell.replace("</head>",
              "  <meta name=\"robots\" content=\"noindex\" />\n  </head>");
          // 파비콘: 홈페이지에서 고른 교단 → 교회 계정 교단 → 스테이온 기본
          const denom = denominationId(site.denomination) ||
            (ctx ? ctx.denomination : "");
          // 교회 정보 구조화 데이터(주보플러스와 같은 schema.org "Church")
          const str = (v: unknown) => typeof v === "string" ? v.trim() : "";
          const ld: Record<string, unknown> = {
            "@context": "https://schema.org",
            "@type": "Church",
            "@id": `${base}/#church`,
            "name": churchName,
            "url": `${base}/`,
            "description": description,
          };
          if (imageUrl) ld.image = imageUrl;
          if (isRealUrl(site.logoUrl)) ld.logo = site.logoUrl;
          if (str(site.address)) ld.address = str(site.address);
          if (str(site.phone)) ld.telephone = str(site.phone);
          const ldTag = page ? "<script type=\"application/ld+json\">" +
            JSON.stringify(ld).replace(/</g, "\\u003c") + "</script>" : "";
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          // 없는 페이지(/community 같은 옛 주소, 오타 주소)는 200+noindex가 아니라 404로
          // (200으로 주면 구글이 "내용 없는 페이지가 많은 사이트"로 봄 - soft 404)
          res.status(page ? 200 : 404).send(withFavicon(
            html.replace("<head>", `<head>\n${metas}`)
              .replace("</head>", `${ldTag}\n</head>`), denom));
          return;
        }

        // 검색봇(구글/빙): 안내용 HTML이 아니라 실제 SPA를 head 메타만 바꿔서 줌
        if (isSearchBot) {
          const indexPath = SHELL_HTML_PATH;
          if (fs.existsSync(indexPath)) {
            const indexHtml = fs.readFileSync(indexPath, "utf8");
            const merged = injectChurchMeta(indexHtml, {
              title: safeTitle,
              description: safeDesc,
              canonicalUrl: safeUrl,
              imageUrl: safeImageUrl,
            }, true);
              // head 메타만 바꾸고 본문(<div id="root">)을 비워두면 검색봇
              // 첫 크롤링 시점엔 "제목/설명은 있는데 본문은 텅 빈 페이지"로
              // 읽혀서 저품질(thin content) 판정을 받기 쉽다 — 실제 방문자는
              // 이 isSearchBot 분기 자체를 타지 않으므로 안전하게 본문 텍스트를
              // 채워 넣는다
            let bodyHtml =
                buildChurchBodyHtml(site, churchName, description);
            // 이 교회가 주보 검색엔진 노출을 켰으면 교회 사이트 → 주보로 가는
            // 링크를 건다(주보플러스처럼 교회 홈에서 주보로 크롤링이 이어지게)
            const ownerId = typeof site.ownerId === "string" ?
              site.ownerId : "";
            let denom = denominationId(site.denomination);
            if (ownerId) {
              const owner = await db.collection("users").doc(ownerId).get();
              if (!denom) denom = denominationId(owner.data()?.denomination);
              if (owner.exists && owner.data()?.bulletinSearchable === true) {
                // 주보 전용 주소가 있으면 그쪽(검색엔진 대표 주소)으로 링크
                const bulletinUrl =
                  juboSiteBase(owner.data()?.bulletinSlug) ||
                  `https://bulletin.stayon-platform.com/view/${ownerId}`;
                bodyHtml += "\n<section><h2>온라인 주보</h2>" +
                  `<p><a href="${escapeHtml(bulletinUrl)}">` +
                  `${escapeHtml(churchName)} 이번 주 주보 보기</a></p></section>`;
              }
            }
            // /super > 사이트 발행 관리에서 넣은 이 교회 홈페이지용 소유확인 코드
            const verifyMetas = [
              ["naver-site-verification", site.naverSiteVerification],
              ["google-site-verification", site.googleSiteVerification],
            ].map(([name, v]) => {
              const code = verificationCode(v);
              return code ? `<meta name="${name}" content="${code}" />` : "";
            }).filter(Boolean).join("\n");
            const withBody = merged.replace(
              "<div id=\"root\"></div>",
              `<div id="root">${bodyHtml}</div>`
            ).replace("<head>", `<head>\n${verifyMetas}`);
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.status(200).send(withFavicon(withBody, denom));
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
      // 카톡 카드 아래 주소: website 주소로 보냈으면 그 주소 그대로
      const ogUrl = isWebsiteHost ?
        "https://website.stayon-platform.com/" :
        "https://bulletin.stayon-platform.com/website";
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
        const indexPath = WEBSITE_HTML_PATH;
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

    // 일반 방문자: 빌드 때 미리 그려둔 /website 화면(내용이 다 들어 있는 HTML)
    if (fs.existsSync(WEBSITE_HTML_PATH)) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(200).send(fs.readFileSync(WEBSITE_HTML_PATH, "utf8"));
      return;
    }
  }

  // 그 외 모든 경우: 기존과 완전히 동일하게 정적 index.html 그대로 반환
  try {
    const indexPath = SHELL_HTML_PATH;
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

    // 예전엔 모든 교회에 /worship·/community·/news·/location을 고정으로 넣었는데,
    // /community는 지금 없는 주소(404)라 구글이 "사이트맵에 없는 페이지가 섞인 사이트"로 봄.
    // 교회별 sitemap.xml과 같은 목록(실제로 있는 메뉴 페이지)을 그대로 씀. 원페이지형은 첫 주소만
    const urlEntries: string[] = [];

    for (const doc of snapshot.docs) {
      const site = doc.data() as Record<string, unknown>;
      const slug = doc.id;
      const base = `https://${slug}.stayon-platform.com`;
      const updatedAt = site.updatedAt as
        admin.firestore.Timestamp | undefined;
      const lastmod = updatedAt && typeof updatedAt.toDate === "function" ?
        updatedAt.toDate().toISOString().split("T")[0] :
        undefined;
      const lastmodTag = lastmod ? `<lastmod>${lastmod}</lastmod>` : "";
      let locs = [`${base}/`];
      if (site.layoutMode !== "onepage") {
        try {
          const ownerId = typeof site.ownerId === "string" ? site.ownerId : "";
          const ctx = ownerId ? await resolveCtx(ownerId) : null;
          locs = churchSitePaths(site, ctx, base);
        } catch (e) {
          console.error("교회 사이트맵 페이지 목록 실패:", slug, e);
        }
      }
      locs.forEach((loc) => {
        urlEntries.push(
          `  <url><loc>${escapeHtml(loc)}</loc>${lastmodTag}</url>`);
      });
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
    console.error("교회 사이트맵 생성 에러:", error);
    res.status(500).send("Internal Server Error");
  }
});

// "검색엔진 노출"을 켠(users/{uid}.bulletinSearchable === true) 교회의 주보
// (/view/{uid})만 모아 사이트맵 XML로 생성. 기본값이 꺼짐(opt-in)이라 대부분의
// 교회는 여기 안 잡히고, AdminEditor.tsx에서 직접 켠 교회만 포함됨. churchSitemap과
// 마찬가지로 완전히 새로운 함수/경로이며 기존 주보 플랫폼 로직은 건드리지 않음.
// 메인 페이지 하단 교회 목록에서 빼는 교회 이름(운영자 요청)
const LANDING_EXCLUDED_CHURCHES = ["석진교회"];

export const bulletinSitemap = functions.https.onRequest(
  async (req, res) => {
    try {
      // /searchable-churches.json: 메인 페이지(Landing.tsx) 하단 교회 이름 링크
      // 목록. 검색 노출 여부와 상관없이 지금 발행 중인 주보가 있는 교회 전부.
      // 교회 이름과 고정 주소용 ID만 내보낸다
      if (req.path === "/searchable-churches.json") {
        const pubSnap = await db
          .collection("bulletins")
          .where("status", "==", "published")
          .get();
        const authorIds = [...new Set(pubSnap.docs
          .map((d) => d.data().authorId)
          .filter((v): v is string => typeof v === "string" && v !== ""))];
        const userDocs = authorIds.length ?
          await db.getAll(...authorIds.map((id) => db.doc(`users/${id}`))) :
          [];
        // 발행된 교회 홈페이지(교회 계정 → 홈페이지 주소). 메인 페이지에서 교회
        // 홈페이지로 가는 진짜 링크를 걸어 구글이 교회 홈페이지를 찾아가게 함
        // (구글 색인 문제 2026-11-09: 교회 홈페이지를 가리키는 링크가 하나도 없었음)
        const siteSnap = await db.collection("churchSites")
          .where("published", "==", true).get();
        const siteByOwner = new Map<string, string>();
        const siteNameByOwner = new Map<string, string>();
        siteSnap.docs.forEach((d) => {
          const owner = d.data().ownerId;
          if (typeof owner === "string" && owner && !siteByOwner.has(owner)) {
            siteByOwner.set(owner, `https://${d.id}.stayon-platform.com/`);
            const nm = d.data().churchName;
            siteNameByOwner.set(owner, typeof nm === "string" ? nm.trim() : "");
          }
        });
        const churches = userDocs
          .filter((u) => u.exists)
          .map((u) => ({
            id: u.id,
            name: u.data()?.churchName,
            // 주보 전용 주소가 있으면 그쪽으로 링크(없으면 Landing이 /view/{id})
            url: u.data()?.bulletinSearchable === true ?
              juboSiteBase(u.data()?.bulletinSlug) : "",
            site: siteByOwner.get(u.id) || "",
          }))
          .filter((c): c is {
            id: string; name: string; url: string; site: string;
          } =>
            typeof c.name === "string" && c.name.trim() !== "" &&
            !c.name.trim().startsWith("마스터") && // 운영자 테스트 계정 제외
            !LANDING_EXCLUDED_CHURCHES.includes(c.name.trim()));
        // 위 목록에 안 들어간 교회 홈페이지(주보가 없거나, 운영자 계정이 만든
        // 사이트 — 예: 스테이온교회는 "마스터" 계정 소유)도 홈페이지 링크만 추가.
        // 이름은 홈페이지에 적힌 교회 이름
        const listed = new Set(churches.map((c) => c.id));
        const siteOnly = [...siteByOwner.entries()]
          .filter(([owner]) => !listed.has(owner))
          .map(([owner, site]) => ({
            id: `site-${owner}`,
            name: siteNameByOwner.get(owner) || "",
            url: "",
            site,
            onlySite: true,
          }))
          .filter((c) => c.name !== "" &&
            !LANDING_EXCLUDED_CHURCHES.includes(c.name));
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "public, max-age=600");
        res.status(200).send(JSON.stringify([...churches, ...siteOnly]));
        return;
      }

      const usersSnap = await db
        .collection("users")
        .where("bulletinSearchable", "==", true)
        .get();
      const ctxs = (await Promise.all(
        usersSnap.docs.map((d) => resolveCtx(d.id, {onlySearchable: true}))
      )).filter((c): c is NonNullable<typeof c> => c !== null)
        // 주보 전용 주소가 있는 교회는 그 주소의 sitemap.xml/rss.xml로 따로
        // 내보낸다(네이버는 사이트맵·RSS에 다른 도메인 주소가 섞이면 거부)
        .filter((c) => !c.siteBase);

      // /bulletin-rss.xml: 검색엔진 노출을 켠 모든 교회의 주보·칼럼을 한 피드로
      // (네이버 서치어드바이저는 사이트당 RSS 1개만 제출 가능해서 통합본을 둔다)
      if (req.path === "/bulletin-rss.xml") {
        const items = ctxs
          .map((c) => buildRss(c).match(/<item>[\s\S]*?<\/item>/g) || [])
          .flat()
          .map((item) => ({
            item,
            date: Date.parse(
              (item.match(/<pubDate>([^<]+)<\/pubDate>/) || [])[1] || ""
            ) || 0,
          }))
          .sort((a, b) => b.date - a.date)
          .slice(0, 200)
          .map((x) => x.item);
        res.setHeader("Content-Type", "application/rss+xml; charset=utf-8");
        res.status(200).send([
          "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
          "<rss version=\"2.0\">",
          "<channel>",
          "<title>STAYON 온라인 주보 - 교회 주보·소식</title>",
          "<link>https://bulletin.stayon-platform.com/</link>",
          "<description>스테이온 온라인 주보를 쓰는 교회들의 주보와 소식</description>",
          "<language>ko</language>",
          ...items,
          "</channel>",
          "</rss>",
        ].join("\n"));
        return;
      }

      // 교회마다 성도 화면에 실제로 보이는 모든 주소: 교회 고정 주소(/view/{uid},
      // QR 주소) + 하위 메뉴(교회 소개/섬기시는 분/칼럼/교회 소식/오시는 길 등)
      // + 지난 주보(archived) + 칼럼·교회 소식 상세. 최신 주보 문서 주소는
      // /view/{uid}와 같은 내용이라(canonical을 그쪽으로 모음) 넣지 않는다.
      const urlEntries = ctxs.flatMap(sitemapEntries).map((e) => e.lastmod ?
        `  <url><loc>${e.loc}</loc><lastmod>${e.lastmod}</lastmod></url>` :
        `  <url><loc>${e.loc}</loc></url>`);

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

// 교회별 주보 전용 주소({bulletinSlug}-jubo.stayon-platform.com) 전용 함수.
// 주보플러스처럼 교회 하나를 검색엔진에 사이트 하나로 등록할 수 있게, 그 주소의
// 첫 화면·하위 메뉴·지난 주보·robots.txt·sitemap.xml·rss.xml을 내려준다.
// Cloudflare Worker(flat-shape-14)가 이 주소로 온 요청(정적 파일 제외)을
// ?host=&path= 로 넘겨준다. 기존 bulletinOG(/view, QR 주소)와는 완전히 별개
export const bulletinSite = functions.https.onRequest(async (req, res) => {
  const host = typeof req.query.host === "string" ?
    req.query.host.toLowerCase() : "";
  const rawPath = typeof req.query.path === "string" ? req.query.path : "/";
  const userAgent = req.headers["user-agent"] || "";
  const slug = host.endsWith(JUBO_HOST_SUFFIX) ?
    host.slice(0, -JUBO_HOST_SUFFIX.length) : "";

  try {
    if (!BULLETIN_SLUG_REGEX.test(slug)) {
      res.status(404).send("Not Found");
      return;
    }
    const q = await db.collection("users")
      .where("bulletinSlug", "==", slug).limit(1).get();
    if (q.empty) {
      res.status(404).send("Not Found");
      return;
    }
    const uid = q.docs[0].id;
    const base = `https://${slug}${JUBO_HOST_SUFFIX}`;

    if (rawPath === "/robots.txt") {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.status(200).send(
        `User-agent: *\nAllow: /\n\nSitemap: ${base}/sitemap.xml\n`
      );
      return;
    }

    // 주소 → (주보 id, 하위 메뉴, 상세 id). 성도 화면은 브라우저에서
    // /view/{uid}/... 형태로 바꿔 쓰므로(아래 스크립트) 그 형태도 받아준다.
    //   /            → 최신 주보      /about 등 → 하위 메뉴
    //   /bulletins/{주보ID}[/...] → 지난 주보
    let segs = rawPath.split("/").filter(Boolean);
    if (segs[0] === "view" && segs[1]) {
      segs = segs[1] === uid ?
        segs.slice(2) :
        ["bulletins", segs[1], ...segs.slice(2)];
    }
    const isArchive = segs[0] === "bulletins" && !!segs[1];
    const ctxId = isArchive ? segs[1] : uid;
    const sub = (isArchive ? segs[2] : segs[0]) || "";
    const subId = (isArchive ? segs[3] : segs[1]) || "";

    const found = await resolveCtx(ctxId);
    const ctx = found && found.uid === uid ? found : null;

    if (rawPath === "/sitemap.xml") {
      const entries = ctx && ctx.searchable ? sitemapEntries(ctx) : [];
      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      res.status(200).send([
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
        "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">",
        ...entries.map((e) => e.lastmod ?
          `  <url><loc>${e.loc}</loc><lastmod>${e.lastmod}</lastmod></url>` :
          `  <url><loc>${e.loc}</loc></url>`),
        "</urlset>",
      ].join("\n"));
      return;
    }
    if (rawPath === "/rss.xml") {
      if (!ctx || !ctx.searchable) {
        res.status(404).send("Not Found");
        return;
      }
      res.setHeader("Content-Type", "application/rss+xml; charset=utf-8");
      res.status(200).send(buildRss(ctx));
      return;
    }

    const page = ctx && ctx.searchable ? buildSeoPage(ctx, sub, subId) : null;

    // 검색봇·링크 미리보기 봇: 내용이 다 들어 있는 HTML
    if (SEARCH_BOT_REGEX.test(userAgent) || BOT_AGENT_REGEX.test(userAgent)) {
      if (page) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.status(200).send(page.html);
        return;
      }
    }

    // 성도(일반 방문자): 기존 성도 화면 그대로. 브라우저 주소를 /view/{uid}/...
    // 로 바꿔서 기존 라우트(routes.tsx)가 그대로 그리게 한다(주소창 표시만 바뀜)
    if (!fs.existsSync(SHELL_HTML_PATH)) {
      res.status(500).send("Internal Server Error");
      return;
    }
    const shell = fs.readFileSync(SHELL_HTML_PATH, "utf8");
    const cover = ctx ? String(ctx.user.coverImage || "") : "";
    let html = page ?
      injectChurchMeta(shell, {
        title: escapeHtml(page.title),
        description: escapeHtml(page.description),
        canonicalUrl: escapeHtml(page.canonical),
        imageUrl: /^https?:\/\//.test(cover) ? escapeHtml(cover) : "",
      }) :
      shell.replace(
        "</head>",
        "  <meta name=\"robots\" content=\"noindex, nofollow\" />\n  </head>"
      );
    const toView =
      "<script>(function(){var p=location.pathname," +
      `u=${JSON.stringify(uid)},` +
      "m=p.match(/^\\/bulletins\\/([^/]+)(\\/.*)?$/)," +
      "t=p.indexOf(\"/view/\")===0?p:m?\"/view/\"+m[1]+(m[2]||\"\"):" +
      "\"/view/\"+u+(p===\"/\"?\"\":p);" +
      "history.replaceState(null,\"\",t+location.search+location.hash)" +
      "})()</script>";
    html = html.replace(
      "<head>",
      `<head>\n${toView}\n${ctx ? churchVerificationMetas(ctx) : ""}`
    );
    // 구글 색인 문제(2026-11-10): 성도용 HTML에도 검색봇과 같은 주보 본문·구조화
    // 데이터를 넣음(봇/사람이 받는 내용이 같도록). 본문은 #root 안에 넣고, 성도 화면
    // (React)이 다 그려지면 main.tsx가 지움 — 성도가 보는 주보 화면은 기존과 동일
    if (page) {
      const body = page.html.match(/<body>([\s\S]*)<\/body>/);
      const style = page.html.match(/<style>[\s\S]*?<\/style>/);
      const ld = page.html.match(
        /<script type="application\/ld\+json">[\s\S]*?<\/script>/);
      if (body) {
        html = html.replace("<div id=\"root\"></div>",
          `<div id="root"><div data-ssr="1">${style ? style[0] : ""}` +
          `${body[1]}</div></div>`);
      }
      if (ld) html = html.replace("</head>", `${ld[0]}\n</head>`);
    }
    // 교단 파비콘(교단을 모르면 스테이온 기본 파비콘 그대로)
    if (ctx) html = withFavicon(html, ctx.denomination);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(html);
  } catch (error) {
    console.error("주보 전용 주소 처리 에러:", error);
    res.status(500).send("Internal Server Error");
  }
});

// 종이 주보 자동 분석(빌더 '교회 주보' 파일 → 설교·교회 소식·기본 정보 추출, 저장은 안 함)
// ANTHROPIC_API_KEY 시크릿 등록 전까지 배포 제외(등록 후 아래 줄 주석 해제)
// export {analyzePaperBulletin} from "./bulletinAnalyze";

// 모금 프로젝트(러브링 등) 합계 계산 — 결제·주보 함수와 별개 파일(./fundraising.ts)
export {fundraiserTotals, fundraiserModeChange} from "./fundraising";

// bulletin → website 주소 로그인 이어 주기(일회용 로그인 열쇠)
// 별개 파일(./websiteHandoff.ts)
export {websiteLoginHandoff} from "./websiteHandoff";
