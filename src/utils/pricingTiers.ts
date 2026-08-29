import { CONGREGATION_SIZES } from "./congregationSizes";

// 티어별 실제 결제 금액(원) 정의. null이면 정찰 판매 없이 "별도 문의" 대상(현재는 대형 티어).
const PRICE_BY_TIER: Record<string, { monthly: number | null; threeMonth: number | null }> = {
  "개척": { monthly: 990, threeMonth: 1990 },
  "독립": { monthly: 2490, threeMonth: 6490 },
  "성장": { monthly: 6900, threeMonth: 19900 },
  "번성": { monthly: 10900, threeMonth: 30900 },
  "대형": { monthly: null, threeMonth: null },
};

export interface PricingTier {
  value: string; // 회원가입/운영자 페이지의 congregationSize 값과 동일한 키 (개척/독립/성장/번성/대형)
  rangeLabel: string; // 예: "50명 이하"
  monthly: number | null;
  threeMonth: number | null;
}

// CONGREGATION_SIZES(성도 수 구간 taxonomy)를 그대로 순서/이름의 기준으로 삼아
// 요금표와 회원가입 select가 항상 같은 티어 목록을 가리키도록 함
export const PRICING_TIERS: PricingTier[] = CONGREGATION_SIZES.map((size) => ({
  value: size.value,
  rangeLabel: size.label,
  monthly: PRICE_BY_TIER[size.value]?.monthly ?? null,
  threeMonth: PRICE_BY_TIER[size.value]?.threeMonth ?? null,
}));
