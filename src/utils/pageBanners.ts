// 교회 홈페이지(페이지 전환형) 화면 위쪽 배너 — 편집 화면(BuilderPage)과 홈페이지(MultiPageSite)가 같이 씀 (2026-11-12)
//  - 사진: 기본 사진(public/page-banners/{이름}.jpg, 1920×480) 또는 교회가 화면별로 올린 사진(bannerPhotos)
//  - 색상: 두 색 그라데이션(투톤). 두 색이 같으면 단색
//  - 끄기: 예전처럼 교회 색 옅은 띠

export type BannerMode = "photo" | "color" | "off";

// 화면 → 기본 사진 파일 이름. 목록 순서 = 편집 화면에 보이는 순서
export const BANNER_PAGES: { key: string; label: string; file: string }[] = [
  { key: "about", label: "교회 소개", file: "about" },
  { key: "pastor", label: "담임목사 인사말", file: "about-pastor" },
  { key: "history", label: "교회 연혁", file: "about-history" },
  { key: "staff", label: "섬기는 사람들", file: "about-staff" },
  { key: "location", label: "오시는 길", file: "location" },
  { key: "newcomer", label: "새가족 안내", file: "about-newcomer" },
  { key: "worship", label: "예배 안내", file: "worship" },
  { key: "online", label: "온라인 예배", file: "worship-online" },
  { key: "sermons", label: "말씀/영상", file: "sermons" },
  { key: "praise", label: "찬양팀", file: "praise" },
  { key: "education", label: "주일학교(교육부서)", file: "education" },
  { key: "bulletins", label: "교회 주보", file: "bulletins" },
  { key: "news", label: "교회 소식", file: "news" },
  { key: "jubo", label: "온라인 주보", file: "jubo" },
  { key: "album", label: "앨범", file: "album" },
  { key: "schedule", label: "교회 일정", file: "schedule" },
];

export const defaultBannerPhoto = (key: string): string => {
  const p = BANNER_PAGES.find((x) => x.key === key);
  return p ? `/page-banners/${p.file}.jpg` : "";
};

// 투톤 기본 조합. "church"는 교회 대표색으로 자동(저장 값은 church)
export const BANNER_PRESETS: { id: string; label: string; colors: [string, string] }[] = [
  { id: "church", label: "우리 교회 색", colors: ["", ""] },
  { id: "navy", label: "네이비", colors: ["#1B2A4A", "#3B6FD8"] },
  { id: "green", label: "딥그린", colors: ["#123D33", "#3FA98B"] },
  { id: "burgundy", label: "버건디", colors: ["#5A1A2B", "#D9686A"] },
  { id: "purple", label: "퍼플", colors: ["#2E1F5E", "#9C84E0"] },
  { id: "charcoal", label: "차콜", colors: ["#1F2329", "#6B7380"] },
  { id: "brown", label: "웜브라운", colors: ["#3A2A1E", "#B08562"] },
  { id: "sky", label: "스카이", colors: ["#1E5C8A", "#7CC4E8"] },
];

const hexToRgb = (hex: string): [number, number, number] | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgbToHex = (r: number, g: number, b: number) =>
  "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");

// 색을 흰색 쪽으로 t(0~1)만큼 섞음
export const lighten = (hex: string, t: number) => {
  const c = hexToRgb(hex);
  if (!c) return hex;
  return rgbToHex(c[0] + (255 - c[0]) * t, c[1] + (255 - c[1]) * t, c[2] + (255 - c[2]) * t);
};

// 저장된 색 설정 → 실제 두 색. "church" 이거나 값이 없으면 교회 대표색 → 조금 밝게
export const resolveBannerColors = (colors: unknown, churchColor: string): [string, string] => {
  const base = hexToRgb(churchColor) ? churchColor : "#1B3A6B";
  if (Array.isArray(colors) && colors.length === 2 && hexToRgb(String(colors[0])) && hexToRgb(String(colors[1]))) {
    return [String(colors[0]), String(colors[1])];
  }
  return [base, lighten(base, 0.45)];
};

// 두 색 평균 밝기가 높으면(밝은 배경) 글자를 어두운색으로
export const bannerTextIsDark = (a: string, b: string) => {
  const ca = hexToRgb(a), cb = hexToRgb(b);
  if (!ca || !cb) return false;
  const lum = (c: [number, number, number]) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
  return (lum(ca) + lum(cb)) / 2 > 0.68;
};

// 교회가 올린 사진: 배너 비율(4:1)로 가운데를 잘라 1920×480 JPG로 만듦
export const cropToBannerBlob = (file: File): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const W = 1920, H = 480, ratio = W / H;
      let sw = img.width, sh = img.width / ratio;
      if (sh > img.height) { sh = img.height; sw = img.height * ratio; }
      const sx = (img.width - sw) / 2, sy = (img.height - sh) / 2;
      const canvas = document.createElement("canvas");
      canvas.width = W; canvas.height = H;
      canvas.getContext("2d")?.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("이미지 변환 실패"))), "image/jpeg", 0.82);
    };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
