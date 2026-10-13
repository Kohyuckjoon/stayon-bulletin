import { CONGREGATION_SIZES } from "./congregationSizes";

// "앞으로 이런 요금제로 확장돼요" 미리보기 섹션(Pricing.tsx) 전용 데이터.
// 지금 실제 결제가 일어나는 PRICING_TIERS(pricingTiers.ts)와는 완전히
// 별개 파일이며, 여기 숫자가 바뀌어도 실제 결제 금액에는 영향이 없다 —
// 이 섹션 버튼은 전부 disabled(Coming Soon)라서 결제 로직 자체를 안 탐.
//
// 기존 문제: 베이직/스탠다드/프로/올인원 가격이 성도 수(교회 규모)와 무관하게
// 고정값(990/2,900/5,900/9,900원)으로만 떠 있었음 — 실제 결제(PRICING_TIERS)는
// 개척/독립/성장/번성/대형에 따라 가격이 다른데, 미리보기만 그걸 안 따라가서
// "통합이 안 돼 있다"는 지적이 나온 부분. 이 파일에서 "교회 규모 × 기능
// 플랜" 매트릭스로 통합함.
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

// 개척 티어 값은 UPCOMING_FEATURE_TIERS에 원래 있던 고정값을 그대로 기준선으로 씀.
// 독립/성장/번성은 개척 대비 PRICING_TIERS(실제 결제)의 가격 배율을 참고해
// 잡은 예시 숫자 — 아직 확정된 공식 가격이 아니라 "준비 중" 표시와 함께
// 보여주는 미리보기용임. 실제 출시 전 반드시 재검토 필요.
export const PRICING_MATRIX: Record<string, TierPricingMatrixRow> = {
  "개척": {
    basic: { monthly: 990, threeMonth: 1990 },
    standard: { monthly: 2900, threeMonth: 5900 },
    pro: { monthly: 5900, threeMonth: 11900 },
    allinone: { monthly: 9900, threeMonth: 19900 },
  },
  "독립": {
    basic: { monthly: 2490, threeMonth: 6490 },
    standard: { monthly: 7300, threeMonth: 14900 },
    pro: { monthly: 14800, threeMonth: 29900 },
    allinone: { monthly: 24900, threeMonth: 49900 },
  },
  "성장": {
    basic: { monthly: 6900, threeMonth: 19900 },
    standard: { monthly: 20200, threeMonth: 41200 },
    pro: { monthly: 41100, threeMonth: 82900 },
    allinone: { monthly: 69000, threeMonth: 138000 },
  },
  "번성": {
    basic: { monthly: 10900, threeMonth: 30900 },
    standard: { monthly: 31900, threeMonth: 65100 },
    pro: { monthly: 65000, threeMonth: 130900 },
    // 참고: 109,000원은 추정치. "번성 pro(65,000원) 대비 올인원 배율"을
    // 다른 티어와 동일하게 맞춰서 역산한 값이라, 확정 가격 아님 — 공식
    // 숫자 정해지면 여기만 교체하면 됨.
    allinone: { monthly: 109000, threeMonth: 218000 },
  },
  // 대형은 실제 결제(PRICING_TIERS)와 동일하게 정찰 없이 "별도 문의" 대상
  "대형": {
    basic: { monthly: null, threeMonth: null },
    standard: { monthly: null, threeMonth: null },
    pro: { monthly: null, threeMonth: null },
    allinone: { monthly: null, threeMonth: null },
  },
};

// CONGREGATION_SIZES 순서를 그대로 기준으로 삼아 PRICING_MATRIX가 누락 없이
// 모든 교회 규모를 커버하는지 보장 (빠진 티어가 있으면 빈 객체로 폴백되지
// 않고, 개발 중 바로 눈에 띄도록 함)
CONGREGATION_SIZES.forEach(({ value }) => {
  if (!PRICING_MATRIX[value]) {
    console.warn(`[pricingMatrix] "${value}" 티어 가격 정보가 없습니다.`);
  }
});
