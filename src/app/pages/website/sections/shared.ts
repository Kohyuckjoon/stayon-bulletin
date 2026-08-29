// WebsiteRenderer.tsx와 각 화면(sections/*.tsx)이 공통으로 쓰는 순수 유틸/작은 컴포넌트 모음.
// 화면별 콘텐츠 자체는 여기 두지 않고, 여러 화면에서 재사용하는 조각만 둔다.

export const sectionPath = (id: string) => (id === "home" ? "/" : `/${id}`);

// Tailwind는 클래스명이 소스에 그대로(리터럴로) 있어야 인식하므로, 개수에 따른 sm:grid-cols-N을
// 동적 문자열 조합 대신 정적 매핑으로 반환
const WORSHIP_ITEM_COLS: Record<number, string> = {
    1: "sm:grid-cols-1",
    2: "sm:grid-cols-2",
    3: "sm:grid-cols-3",
};
export const worshipItemColsClass = (count: number) => WORSHIP_ITEM_COLS[count] || "sm:grid-cols-4";
