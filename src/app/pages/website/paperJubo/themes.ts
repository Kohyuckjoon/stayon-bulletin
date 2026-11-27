// 종이 주보 디자인 테마(2026-11-24) — docs/bulletin-designs 의 시안 7종을 "테마"로 옮김.
// 내용(칸·표지 입력값)은 그대로 두고, 테마만 바꾸면 같은 내용이 그 모양으로 다시 그려짐.
// 시안은 바깥면(4면 | 1면 표지)만 있어서, 안쪽면(2·3면)은 같은 칸 제목 모양·색으로 맞춤.
import type { PjTemplate } from "./types";

export type PjTitleStyle = "double" | "bar" | "pill" | "spaced" | "plain" | "thin";

export interface PjTheme {
  id: PjTemplate;
  no: string;           // 시안 번호(파일 제목의 번호)
  name: string;
  font: string;         // 본문 글꼴
  titleFont?: string;   // 칸 제목 글꼴(없으면 본문 글꼴)
  accent: string;       // 기본 포인트 색(편집 화면 "포인트 색"으로 바꿀 수 있음)
  ink: string;          // 본문 글자 색
  muted: string;        // 흐린 글자 색
  line: string;         // 항목 사이 옅은 줄
  title: PjTitleStyle;
  titleInk?: boolean;   // 칸 제목을 포인트 색 대신 본문 색으로(클래식·차콜)
}

const SERIF = "'Noto Serif KR', 'Nanum Myeongjo', serif";
const SANS = "'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";
const PLEX = "'IBM Plex Sans KR', 'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif";

export const PJ_THEMES: PjTheme[] = [
  { id: "classic", no: "01", name: "클래식 이중 테두리", font: SERIF, accent: "#1A1A1A", ink: "#1A1A1A", muted: "#6B6B6B", line: "#CFCFCF", title: "double", titleInk: true },
  { id: "navy", no: "02", name: "모던 네이비 블록", font: SANS, accent: "#1F3A5F", ink: "#1E2430", muted: "#5F6B7A", line: "#DDE3EA", title: "bar" },
  { id: "minimal", no: "03", name: "미니멀 화이트", font: PLEX, accent: "#222222", ink: "#222222", muted: "#767676", line: "#E5E5E5", title: "spaced" },
  { id: "arch", no: "05", name: "딥그린 아치", font: SANS, titleFont: SERIF, accent: "#24483E", ink: "#1F2A26", muted: "#5E6E68", line: "#DCE5E1", title: "pill" },
  { id: "charcoal", no: "11", name: "차콜 하프", font: SANS, accent: "#C9A227", ink: "#222222", muted: "#6B6B6B", line: "#E3E3E3", title: "thin", titleInk: true },
  { id: "stripe", no: "19", name: "스트라이프 밴드", font: PLEX, accent: "#2E5E8C", ink: "#1D2733", muted: "#5A6573", line: "#DFE7EF", title: "plain" },
  { id: "photo", no: "20", name: "교회 사진 표지", font: SANS, accent: "#2F6F5E", ink: "#1F2328", muted: "#5C6560", line: "#E1E6E4", title: "thin" },
];

// 예전 저장값 "modern"(포인트 색 + 밑줄 제목)은 가장 비슷한 02 모던 네이비로 보여 줌
export function themeIdOf(t: string | undefined): PjTemplate {
  if (t === "modern") return "navy";
  return (PJ_THEMES.find((x) => x.id === t)?.id) || "classic";
}
export function themeOf(t: string | undefined): PjTheme {
  const id = themeIdOf(t);
  return PJ_THEMES.find((x) => x.id === id)!;
}

// 시안의 px 값(가로 1123px = 297mm)을 mm로
export const px = (n: number) => `${(n * 297 / 1123).toFixed(2)}mm`;
