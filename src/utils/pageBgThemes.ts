// 주보 화면(BulletinView) 전체를 감싸는 배경색 프리셋. 흰 카드 밖(섬기는 사람들 헤더, 오시는 길
// 헤더, 세그먼트 컨트롤 등)에는 기본적으로 흰 글씨를 쓴다. 밝은(isLight) 프리셋을 고르면
// BulletinView 쪽에서 그 바깥 글씨를 어두운 색으로 자동 전환해서 대비를 유지한다.
// AdminEditor(선택 UI)와 BulletinView(실제 적용) 양쪽에서 이 목록 하나만 같이 참조해서 값이 어긋나지 않게 한다.
export interface PageBgTheme {
  id: string;
  label: string;
  swatch: string; // 선택 UI 미리보기용 단색
  gradientClass: string; // BulletinView에 그대로 붙이는 tailwind 그라데이션 클래스
  isLight?: boolean; // true면 밝은 배경 - 카드 바깥 글씨를 어두운 색으로 자동 전환해야 함
}

export const PAGE_BG_THEMES: PageBgTheme[] = [
  { id: "default", label: "다크그레이", swatch: "#111827", gradientClass: "bg-gradient-to-br from-[#1f2937] via-[#111827] to-black" },
  { id: "navy", label: "네이비", swatch: "#122a4a", gradientClass: "bg-gradient-to-br from-[#1e3a5f] via-[#122a4a] to-[#050d1a]" },
  { id: "green", label: "포레스트", swatch: "#152e22", gradientClass: "bg-gradient-to-br from-[#234a37] via-[#152e22] to-[#03080a]" },
  { id: "wine", label: "버건디", swatch: "#2a0f1b", gradientClass: "bg-gradient-to-br from-[#4a1c2e] via-[#2a0f1b] to-[#0a0306]" },
  { id: "purple", label: "퍼플", swatch: "#1e1533", gradientClass: "bg-gradient-to-br from-[#332352] via-[#1e1533] to-[#07050d]" },
  { id: "black", label: "블랙", swatch: "#000000", gradientClass: "bg-gradient-to-br from-[#1a1a1a] via-black to-black" },
  { id: "white", label: "화이트", swatch: "#ffffff", gradientClass: "bg-white", isLight: true },
  { id: "beige", label: "베이지", swatch: "#E6DDD1", gradientClass: "bg-gradient-to-br from-[#EFE7DA] via-[#E6DDD1] to-[#D9CDBA]", isLight: true },
];

export const DEFAULT_PAGE_BG_THEME_ID = "default";

export function getPageBgGradientClass(themeId: string | undefined | null): string {
  const found = PAGE_BG_THEMES.find((t) => t.id === themeId);
  return (found || PAGE_BG_THEMES[0]).gradientClass;
}

// 밝은 배경(흰색 등)이 선택된 상태인지 여부. true면 흰 카드 바깥의 흰 글씨/아이콘을
// 어두운 색으로 바꿔서 그려야 한다.
export function isLightPageBgTheme(themeId: string | undefined | null): boolean {
  const found = PAGE_BG_THEMES.find((t) => t.id === themeId);
  return !!(found || PAGE_BG_THEMES[0]).isLight;
}
