// 주보 화면(BulletinView) 전체 디자인을 통째로 바꾸는 "커스텀 디자인" 템플릿 목록.
// pageBgThemes(배경색 프리셋)와는 다른 개념 - 템플릿은 헤더 구조/카드 스타일/폰트 웨이트 등
// 화면 전체의 시각 언어를 바꾼다. "기본"이 아닌 템플릿을 고르면 그 템플릿 고유의 배색을
// 쓰기 때문에, 주보 화면 배경색(pageBgTheme) 선택은 "기본" 템플릿일 때만 의미가 있다.
export interface BulletinTemplate {
  id: string;
  label: string;
  description: string;
  swatch: string; // 선택 카드 미리보기용 배경색
  accent: string; // 선택 카드 미리보기용 포인트색
  comingSoon?: boolean; // true면 아직 준비 중 - 적용 불가, "준비중" 잠금 표시만
}

export const BULLETIN_TEMPLATES: BulletinTemplate[] = [
  {
    id: "default",
    label: "기본",
    description: "지금까지 써오신 기본 디자인이에요. 배경색은 직접 고를 수 있어요.",
    swatch: "#111827",
    accent: "#3b82f6",
  },
  {
    id: "warm-ivory",
    label: "모던 & 미니멀 디자인(커버형)",
    description: "따뜻한 아이보리 배경에 번호가 매겨진 예배 순서 리스트가 특징인 디자인이에요. 첫 화면 가득 사진 커버가 떠요.",
    swatch: "#FDFAF5",
    accent: "#2F5C52",
  },
  {
    id: "warm-ivory-open",
    label: "모던 & 미니멀 디자인(오픈형)",
    description: "커버형과 디자인은 같지만, 사진 커버를 짧은 배너로 줄여서 스크롤 없이 바로 예배 순서부터 보여줘요.",
    swatch: "#FDFAF5",
    accent: "#2F5C52",
  },
  // ── 준비 중 (버튼만 먼저 노출) ─────────────────────────────
  { id: "deep-terracotta", label: "딥 테라코타", description: "프로그램 카드형", swatch: "#8C3B2B", accent: "#E0A88F", comingSoon: true },
  { id: "rose-amber", label: "로즈 앰버", description: "매거진형", swatch: "#C97D6B", accent: "#F0C27B", comingSoon: true },
  { id: "sage-green", label: "세이지 그린", description: "카드형", swatch: "#9CAF88", accent: "#3F5233", comingSoon: true },
  { id: "toss-blue", label: "토스 블루", description: "앱형", swatch: "#3182F6", accent: "#E7F0FF", comingSoon: true },
  { id: "scrapbook", label: "스크랩북형", description: "손으로 붙인 듯한 콜라주 느낌", swatch: "#D9C3A0", accent: "#8A6D3B", comingSoon: true },
  { id: "dark-neon", label: "다크 네온형", description: "어두운 배경 + 네온 포인트", swatch: "#14141F", accent: "#25F4EE", comingSoon: true },
  { id: "story", label: "스토리형", description: "SNS 스토리처럼 한 장씩 넘겨 보는 형태", swatch: "#3A1C71", accent: "#F5A623", comingSoon: true },
  { id: "wallet-pass", label: "월렛 패스형", description: "모바일 지갑 카드(패스) 느낌", swatch: "#1C1C1E", accent: "#5EC5FF", comingSoon: true },
];

export const DEFAULT_BULLETIN_TEMPLATE_ID = "default";

export function isCustomBulletinTemplate(templateId: string | undefined | null): boolean {
  return !!templateId && templateId !== DEFAULT_BULLETIN_TEMPLATE_ID;
}

export function isComingSoonBulletinTemplate(templateId: string | undefined | null): boolean {
  return !!BULLETIN_TEMPLATES.find((t) => t.id === templateId)?.comingSoon;
}

// "모던 & 미니멀 디자인" 계열(커버형/오픈형)인지. 메인 화면(BulletinView)은 둘이 서로 다른
// 컴포넌트(WarmIvoryTemplate / WarmIvoryOpenTemplate)를 쓰지만, 메뉴 하위 화면(소개/오시는길/
// 섬기시는분)은 둘 다 똑같은 "아이보리 톤"을 써야 해서 이 헬퍼로 묶어서 판정한다.
export const WARM_IVORY_FAMILY_IDS = ["warm-ivory", "warm-ivory-open"] as const;
export function isWarmIvoryFamily(templateId: string | undefined | null): boolean {
  return !!templateId && (WARM_IVORY_FAMILY_IDS as readonly string[]).includes(templateId);
}
