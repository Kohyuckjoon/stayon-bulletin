import { CONGREGATION_SIZES } from "./congregationSizes";

// 요금 안내(Pricing.tsx)의 베이직/스탠다드/프로/올인원 가격표.
// ※ 이제 미리보기 전용이 아님 — 요금 안내 화면의 월/3개월 결제 카드와 정기결제 카드가
//   이 값을 그대로 결제 금액으로 넘김(결제 요청·성공 처리 코드는 usePayment/useBillingKey).
//   숫자를 바꾸면 "새로 결제하는" 금액이 바뀜.
//
// 키 이름은 subscriptionTier.ts의 PlanTier 타입("basic"|"standard"|"pro"|
// "allinone")과 동일하게 맞춤 — 같은 개념을 가리키는 키가 두 군데서
// 다르게(allInOne vs allinone) 갈라지지 않도록.
export type FeaturePlanKey = "basic" | "standard" | "pro" | "allinone";

export interface PlanPrice {
  monthly: number | null; // null이면 "별도 문의"(대형 티어)
  threeMonth: number | null;
}

export type TierPricingMatrixRow = Record<FeaturePlanKey, PlanPrice>;

// 단독 요금제(2026-11-12): 교회 규모(개척/독립/성장/번성/대형)별 가격을 없애고 모든 교회 같은 가격.
// 성도 300명 이상 교회는 요금 안내 화면에서 "별도 문의" 안내만 함(결제는 막지 않음).
// 화면 코드가 PRICING_MATRIX[교회 규모][요금제] 형태로 읽기 때문에, 규모마다 같은 값을 넣어 둠.
//   베이직 990 / 3개월 1,990  · 스탠다드 2,900 / 3개월 5,900 (기존 개척 가격 그대로, 3개월 할인 표시 없음)
//   프로 7,900 / 3개월 19,900 · 올인원 9,900 / 3개월 24,900 (3개월 16% 할인)
// (예전 규모별 가격은 git 기록 참고 — 개척 990/2,900/5,900/9,900, 독립·성장·번성은 더 높았고 대형은 별도 문의)
// (2026-11-20) 올인원 9,900원 → "관리형"(라이트 14,900 / 맥스 19,900). 1개월은 1회 결제 · 매월 정기결제 둘 다.
//   여기 allinone 값은 "관리형 라이트" 가격(= 관리형 최저가). 맥스 가격은 아래 MANAGED_PLANS
//   (같은 날 수정) 관리형도 3개월 1회 결제 가능 — 할인 없이 1개월 × 3(라이트 44,700 / 맥스 59,700). 3개월엔 정기결제 없음
export const SINGLE_PLAN_PRICES: TierPricingMatrixRow = {
  basic: { monthly: 990, threeMonth: 1990 },
  standard: { monthly: 2900, threeMonth: 5900 },
  pro: { monthly: 7900, threeMonth: 19900 },
  allinone: { monthly: 14900, threeMonth: 44700 },
};

// 3개월 할인을 화면에 표시할 요금제(베이직·스탠다드·관리형은 할인 없음)
export const THREE_MONTH_DISCOUNT_PLANS: FeaturePlanKey[] = ["pro"];

// 관리형 두 가지(2026-11-20). 둘 다 앱 안의 요금제 등급은 allinone(기능 같음) — 차이는 스테이온이 대신 업데이트해 주는 횟수.
// 정기결제를 12개월 연속으로 다 채우면 refund 만큼 돌려드림(포트원 부분 취소 또는 운영자 입금). 중간에 해지·결제가 끊기면 환급 없음
export type ManagedVariant = "lite" | "max";
export const MANAGED_PLANS: Record<ManagedVariant, { label: string; monthly: number; refund: number; update: string }> = {
  lite: { label: "관리형 라이트", monthly: 14900, refund: 24000, update: "스테이온이 월 2회 대신 업데이트" },
  max: { label: "관리형 맥스", monthly: 19900, refund: 36000, update: "스테이온이 매주 1회 대신 업데이트" },
};

export const PRICING_MATRIX: Record<string, TierPricingMatrixRow> = Object.fromEntries(
  CONGREGATION_SIZES.map(({ value }) => [value, SINGLE_PLAN_PRICES]),
);

// CONGREGATION_SIZES 순서를 그대로 기준으로 삼아 PRICING_MATRIX가 누락 없이
// 모든 교회 규모를 커버하는지 보장 (빠진 티어가 있으면 빈 객체로 폴백되지
// 않고, 개발 중 바로 눈에 띄도록 함)
CONGREGATION_SIZES.forEach(({ value }) => {
  if (!PRICING_MATRIX[value]) {
    console.warn(`[pricingMatrix] "${value}" 티어 가격 정보가 없습니다.`);
  }
});
