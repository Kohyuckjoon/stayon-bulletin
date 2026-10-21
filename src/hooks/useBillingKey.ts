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

export const useBillingKey = () => {
  const requestIssueBillingKey = useCallback(async (plan?: {
    planName: string;
    tierValue: string;
    amount: number;
  }) => {
    const { PortOne } = window;
    const user = auth.currentUser;

    if (!user) {
      toast.error("로그인이 필요한 서비스입니다.");
      return;
    }

    if (typeof PortOne === "undefined") {
      toast.error("결제 모듈이 로드되지 않았습니다. 잠시 후 다시 시도해주세요.");
      return;
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
        if (result.code === "FAILURE_TYPE_CANCEL") return;
        toast.error(`카드 등록 실패: ${result.message}`);
        return;
      }

      // 성공 — 빌링키만 저장. 카드 원본 정보는 저장하지 않음(포트원/KCP가 보관).
      // plan이 넘어온 경우(= /pricing에서 특정 요금제로 정기결제 등록한 경우)
      // 매달 서버가 얼마를 긁어야 하는지 알아야 하므로 금액/다음 결제일도 같이 저장한다.
      const now = new Date();
      await updateDoc(doc(db, "users", user.uid), {
        billingKey: result.billingKey,
        // TODO: 카드사명/뒷자리는 포트원 응답 필드 확인 후 정확한 경로로 교체
        billingCardName: result.card?.issuerName ?? "",
        billingCardLast4: result.card?.number?.slice(-4) ?? "",
        billingKeyRegisteredAt: serverTimestamp(),
        subscriptionActive: true,
        ...(plan ? {
          billingPlanName: plan.planName,
          billingTierValue: plan.tierValue,
          billingAmount: plan.amount,
          // 다음 결제일을 "지금"으로 잡아서, 서버 스케줄 함수(매일 실행)가
          // 바로 다음 실행 때 첫 결제를 시도하도록 한다 — 카드 등록과 동시에
          // 즉시 결제되는 게 아니라, 서버 쪽 정기결제 처리 함수가 picked up함.
          // 이후 결제 성공마다 +1개월씩 밀려난다(functions/src/index.ts 참고).
          nextBillingDate: now,
          billingFailCount: 0, // 결제 실패 재시도 횟수 — 성공 시 0으로 리셋
        } : {}),
      });

      toast.success("카드가 등록됐어요. 다음 결제일에 자동으로 결제돼요.");
    } catch (error) {
      console.error("빌링키 발급 오류:", error);
      toast.error("카드 등록 중 오류가 발생했습니다.");
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

  return { requestIssueBillingKey, cancelSubscription };
};
