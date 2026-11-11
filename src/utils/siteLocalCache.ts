// 교회 홈페이지 속도 개선: 한 번 본 교회 정보를 이 브라우저에 저장해 두고, 다음 방문 때
// 저장해 둔 내용으로 바로 화면을 그린 뒤 최신 내용으로 조용히 바꿈.
// 이 브라우저 안에만 저장(서버·주보 데이터에는 아무것도 쓰지 않음). 저장이 막힌 환경(시크릿 창,
// 저장 공간 부족 등)에서는 그냥 저장 없이 기존처럼 동작함.
const PREFIX = "stayon:site-cache:v1:";
const MAX_AGE = 1000 * 60 * 60 * 24 * 30; // 30일 지난 저장본은 쓰지 않음

export function readSiteCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { t: number; v: T };
    if (!parsed || typeof parsed.t !== "number" || Date.now() - parsed.t > MAX_AGE) return null;
    return parsed.v ?? null;
  } catch {
    return null;
  }
}

export function removeSiteCache(key: string) {
  try { localStorage.removeItem(PREFIX + key); } catch { /* 무시 */ }
}

export function writeSiteCache(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ t: Date.now(), v: value }));
  } catch {
    // 저장 공간이 모자라면 이 교회 저장본만 지우고 넘어감(화면 동작에는 영향 없음)
    try { localStorage.removeItem(PREFIX + key); } catch { /* 무시 */ }
  }
}
