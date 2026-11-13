// "함께한 이야기"(/story) — STAYON이 교회들과 함께한 일(나눔 모금·영상 촬영·홈페이지 등)을 카드로 소개.
// 주보·결제·정기결제·성도 화면과 완전히 별개인 컬렉션만 씀.
//   stories/{id}                 카드 한 장 (누구나 읽기, 운영자만 쓰기 — firestore.rules)
//   storyMeta/categories         분류 목록 { list: string[] }

export type StoryLinkType = "none" | "give" | "youtube" | "url";

export interface Story {
  id: string;
  category: string;
  title: string;
  churchName: string;
  date: string; // YYYY-MM-DD (카드 정렬·표시용)
  imageUrl: string;
  linkType: StoryLinkType;
  link: string; // youtube·url 일 때 주소
  fundraiserId: string; // give 일 때 모금 프로젝트 id
  visible: boolean;
}

export const DEFAULT_STORY_CATEGORIES = ["나눔 모금", "영상 촬영", "홈페이지"];

export const toStory = (id: string, d: Record<string, unknown>): Story => ({
  id,
  category: String(d.category || ""),
  title: String(d.title || ""),
  churchName: String(d.churchName || ""),
  date: String(d.date || ""),
  imageUrl: String(d.imageUrl || ""),
  linkType: (["give", "youtube", "url"].includes(String(d.linkType)) ? d.linkType : "none") as StoryLinkType,
  link: String(d.link || ""),
  fundraiserId: String(d.fundraiserId || ""),
  visible: d.visible !== false,
});

// 최신순(날짜 내림차순)
export const sortStories = (list: Story[]) => [...list].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

export const youtubeId = (url: string): string => {
  const m = url.match(/(?:youtu\.be\/|v=|\/shorts\/|\/embed\/|\/live\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : "";
};

// 사진이 없으면 유튜브 영상 썸네일을 대신 씀
export const storyImage = (s: Story): string => {
  if (s.imageUrl) return s.imageUrl;
  if (s.linkType === "youtube") {
    const id = youtubeId(s.link);
    if (id) return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  }
  return "";
};

export const storyHref = (s: Story): string => {
  if (s.linkType === "give" && s.fundraiserId) return `/give/${s.fundraiserId}`;
  if ((s.linkType === "youtube" || s.linkType === "url") && s.link) return s.link;
  return "";
};

// 2026-11-12 → 2026. 11
export const storyDate = (d: string) => (d ? d.slice(0, 7).replace("-", ". ") : "");
