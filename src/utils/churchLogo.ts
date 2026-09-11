// 교회 로고(성도 화면 상단 흰 띠)의 표시 크기.
// 교회마다 로고 형태가 달라서(2단 워드마크 / 한 줄 워드마크 / 정사각 엠블럼) 관리자가 직접 고른다.
// 값이 없는(예전) 주보는 "md"(크게)로 표시한다 — 기존 48px 고정이 작다는 피드백 반영.

export type ChurchLogoSize = "sm" | "md" | "lg";

export const CHURCH_LOGO_SIZE_OPTIONS: { id: ChurchLogoSize; label: string; hint: string }[] = [
  { id: "sm", label: "보통", hint: "한 줄짜리 간결한 로고" },
  { id: "md", label: "크게", hint: "2단 워드마크 (권장)" },
  { id: "lg", label: "아주 크게", hint: "엠블럼 위주 로고" },
];

export const DEFAULT_CHURCH_LOGO_SIZE: ChurchLogoSize = "md";

export function normalizeChurchLogoSize(v: unknown): ChurchLogoSize {
  return v === "sm" || v === "lg" ? v : DEFAULT_CHURCH_LOGO_SIZE;
}

// 성도 화면 로고 <img>에 적용할 Tailwind 높이 클래스 (모바일 / sm 이상)
export function churchLogoHeightClass(size: unknown): string {
  switch (normalizeChurchLogoSize(size)) {
    case "sm":
      return "max-h-12 sm:max-h-14"; // 48 / 56
    case "lg":
      return "max-h-[84px] sm:max-h-24"; // 84 / 96
    case "md":
    default:
      return "max-h-[66px] sm:max-h-[76px]"; // 66 / 76
  }
}
