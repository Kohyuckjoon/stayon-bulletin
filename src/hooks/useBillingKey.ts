import { useCallback } from "react";
import { db, auth } from "../firebase";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";

// usePayment.ts(단건 결제)와 완전히 분리된, 카드 등록 전용 훅. 결제가 아니라
// "다음에 이 카드로 긁어도 된다"는 빌링키 토큰만 발급받는다 — 실제로 돈이
// 빠져나가는 건 이 시점엔 전혀 없다(카드사 일부는 확인 차 소액 승인 후 즉시
// 취소하는 경우가 있는데, 이것도 결제가 아니라 카드 유효성 확인 절차).
declare global {
  interface Window {
    PortOne: any;
  }
}

// NHN KCP 정기결제(빌링) 전용 채널. 2026-10-21 KCP 정기결제 계약 완료 후
// 발급된 채널키로 교체 완료(기존엔 단건결제용 채널키를 임시로 재사용 중이었음).
const BILLING_STORE_ID = "store-cee37831-993c-4f67-a317-143a42ebd82b";
const BILLING_CHANNEL_KEY = "channel-key-608b0f0e-f450-43cb-a1af-5f4e9e9ace32";
// 카드 등록 직후 첫 달 결제를 처리하는 서버 함수(functions/src/index.ts chargeFirstRecurring)
const FIRST_CHARGE_URL = "https://asia-northeast3-stayonsbplatform.cloudfunctions.net/chargeFirstRecurring";

// 다음 결제일 계산. "해당 일자가 없는 달은 말일에 결제"라는 정책(정기결제
// 정책 섹션) 그대로 반영 — 예: 1/31 등록이면 다음 결제일은 2/28(또는 29).
export function addMonthsClamped(date: Date, months: number): Date {
  const targetDay = date.getDate();
  const d = new Date(date);
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDayOfTargetMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(targetDay, lastDayOfTargetMonth));
  return d;
}

// featurePlan: 결제한 요금제 등급(basic/standard/pro/allinone) — 결제 성공 시 users.status로 들어감
// refundAmount: 관리형 정기결제 — 12개월 연속 결제를 다 채우면 돌려드릴 금액(중도 해지 시 없음). 운영자가 환급 대상 확인용
export type RecurringPlan = { planName: string; tierValue: string; amount: number; featurePlan: string; refundAmount?: number };

// 정기결제 시작: 요금제·금액을 저장하고 서버(chargeFirstRecurring)가 첫 달을 바로
// 결제 → 성공하면 다음 결제일이 한 달 뒤로 잡히고, 이후 매달 스케줄 함수가 결제.
// nextBillingDate를 "지금"으로 두는 건, 창을 닫는 등으로 서버 요청이 못 닿았을 때
// 매일 도는 스케줄 함수가 대신 첫 결제를 처리하게 하기 위한 안전장치
// (firstChargePending은 어느 쪽이든 결제 성공 시 꺼져서 두 번 결제되지 않음).
async function startRecurring(plan: RecurringPlan): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) return false;
  await updateDoc(doc(db, "users", user.uid), {
    billingPlanName: plan.planName,
    billingTierValue: plan.tierValue,
    billingFeaturePlan: plan.featurePlan,
    billingAmount: plan.amount,
    subscriptionActive: true,
    nextBillingDate: new Date(),
    billingFailCount: 0,
    firstChargePending: true,
    billingRefundAmount: plan.refundAmount ?? 0, // 12개월 다 채우면 환급할 금액(0이면 환급 없는 요금제)
    billingStartedAt: serverTimestamp(),         // 정기결제 시작일(12개월 계산 기준)
  });
  const token = await user.getIdToken();
  let res: Response;
  try {
    res = await fetch(FIRST_CHARGE_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // 서버에 요청 자체가 닿지 않음(네트워크·함수 미배포 등) — 결제가 안 됐으니 정기결제를
    // 다시 꺼서, 다음 날 오전 9시 스케줄 함수가 교회 모르게 결제하지 않게 함
    await updateDoc(doc(db, "users", user.uid), { subscriptionActive: false, firstChargePending: false });
    toast.error("결제 서버에 연결하지 못해 결제되지 않았어요. 잠시 후 다시 시도해주세요.");
    return false;
  }
  const body = await res.json().catch(() => ({}));
  if (res.ok) {
    toast.success(`${plan.amount.toLocaleString()}원이 결제됐어요. 다음 달부터 같은 날 자동으로 결제돼요.`);
    return true;
  }
  // 409(이미 처리됨) 말고는 결제가 안 된 것이므로 정기결제를 꺼 둠(다음 날 자동 결제 방지)
  if (res.status !== 409) {
    await updateDoc(doc(db, "users", user.uid), { subscriptionActive: false, firstChargePending: false }).catch(() => {});
  }
  toast.error(`결제에 실패했어요: ${body.error || "잠시 후 다시 시도해주세요."}`);
  return false;
}

export const useBillingKey = () => {
  // 카드 등록(빌링키 발급). plan이 있으면(= /pricing에서 정기결제 시작) 등록 직후
  // 바로 첫 결제까지 진행. plan이 없으면(= 결제 관리에서 카드 등록·변경) 카드만
  // 바꾸고 정기결제 상태·요금제는 그대로 둠 — 정기결제 중이면 다음 결제부터 새 카드로.
  const requestIssueBillingKey = useCallback(async (plan?: RecurringPlan): Promise<boolean> => {
    const { PortOne } = window;
    const user = auth.currentUser;

    if (!user) {
      toast.error("로그인이 필요한 서비스입니다.");
      return false;
    }

    if (typeof PortOne === "undefined") {
      toast.error("결제 모듈이 로드되지 않았습니다. 잠시 후 다시 시도해주세요.");
      return false;
    }

    try {
      const result = await PortOne.requestIssueBillingKey({
        storeId: BILLING_STORE_ID,
        channelKey: BILLING_CHANNEL_KEY,
        billingKeyMethod: "CARD",
        issueId: `stayon_billing_${Date.now()}`,
        issueName: "스테이온 정기결제 카드 등록",
        customer: {
          fullName: user.displayName || "교회담당자",
          email: user.email || "",
        },
        windowType: {
          pc: "IFRAME",
          mobile: "REDIRECTION",
        },
        redirectUrl: `${window.location.origin}/admin/billing`,
      });

      if (result.code) {
        if (result.code === "FAILURE_TYPE_CANCEL") return false;
        toast.error(`카드 등록 실패: ${result.message}`);
        return false;
      }

      // 성공 — 빌링키만 저장. 카드 원본 정보는 저장하지 않음(포트원/KCP가 보관).
      await updateDoc(doc(db, "users", user.uid), {
        billingKey: result.billingKey,
        // TODO: 카드사명/뒷자리는 포트원 응답 필드 확인 후 정확한 경로로 교체
        billingCardName: result.card?.issuerName ?? "",
        billingCardLast4: result.card?.number?.slice(-4) ?? "",
        billingKeyRegisteredAt: serverTimestamp(),
      });

      if (!plan) {
        toast.success("카드가 등록됐어요.");
        return true;
      }
      return await startRecurring(plan);
    } catch (error) {
      console.error("빌링키 발급 오류:", error);
      toast.error("카드 등록 중 오류가 발생했습니다.");
      return false;
    }
  }, []);

  // 이미 등록된 카드로 정기결제 시작(카드 번호 다시 입력 안 함) — 바로 첫 결제
  const startRecurringWithSavedCard = useCallback(async (plan: RecurringPlan): Promise<boolean> => {
    try {
      return await startRecurring(plan);
    } catch (error) {
      console.error("정기결제 시작 오류:", error);
      toast.error("결제 중 오류가 발생했습니다.");
      return false;
    }
  }, []);

  const cancelSubscription = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      // 빌링키 자체는 지우지 않고 subscriptionActive만 꺼서, 다음 결제
      // 스케줄 함수가 이 사용자를 더는 결제 대상에서 제외하도록 한다.
      await updateDoc(doc(db, "users", user.uid), {
        subscriptionActive: false,
      });
      toast.success("정기결제가 해지됐어요.");
    } catch (error) {
      console.error("정기결제 해지 오류:", error);
      toast.error("해지 처리 중 오류가 발생했습니다.");
    }
  }, []);

  return { requestIssueBillingKey, startRecurringWithSavedCard, cancelSubscription };
};
