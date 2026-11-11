// 온라인 주보 ↔ 교회 홈페이지 "매주 바뀌는 내용"(교회 소식 · 이번 주 말씀) 맞추기.
// 같은 주인지는 날짜(YYYY-MM-DD)로 판단. 어느 쪽이든 저장한 뒤 "반대쪽에도 반영할까요?"를 물어보고,
// "예"를 누른 것만 반대쪽에 써 넣음(QR·주보 주소·주보 id는 그대로, 내용 칸만 바꿈)
import { collection, doc, getDocs, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { db } from "../firebase";

export type SyncLine = { title: string; content: string };
export type SyncSermon = { title: string; scripture: string; preacher: string };

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");

// "2026-11-29" · "2026.11.29" · "2026. 11. 29 ~ 30" → "2026-11-29"
export function syncDate(v: unknown): string {
  const m = s(v).match(/(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : "";
}

export const dotDate = (d: string) => d.replace(/-/g, ". ");

export function cleanLines(v: unknown): SyncLine[] {
  return (Array.isArray(v) ? v : []).map((a: any) => ({ title: s(a?.title), content: s(a?.content) })).filter((a) => a.title || a.content);
}

// 홈페이지 소식 한 건(1번·2번… items, 예전 데이터는 title/content 한 개) → 줄 목록
export function siteNewsLines(n: any): SyncLine[] {
  return cleanLines(Array.isArray(n?.items) && n.items.length ? n.items : [{ title: n?.title, content: n?.content }]);
}

export const sameLines = (a: SyncLine[], b: SyncLine[]) => JSON.stringify(cleanLines(a)) === JSON.stringify(cleanLines(b));

export function cleanSermon(v: any): SyncSermon {
  return { title: s(v?.title), scripture: s(v?.scripture), preacher: s(v?.preacher) };
}
export const sameSermon = (a: any, b: any) => JSON.stringify(cleanSermon(a)) === JSON.stringify(cleanSermon(b));

// 홈페이지 저장 후 "주보에도 반영할까요?"에 보여 줄 주보 한 장(같은 날짜)
export type BulletinSyncTarget = {
  date: string;
  bulletinIds: string[];
  news?: SyncLine[];
  sermon?: SyncSermon;
};

// 이번에 홈페이지에서 바뀐 소식·말씀 중, 같은 날짜 주보가 있고 내용이 다른 것만 골라 줌
export async function findBulletinTargets(
  ownerId: string,
  changedNews: { date: string; lines: SyncLine[] }[],
  changedSermon: (SyncSermon & { date: string }) | null,
): Promise<BulletinSyncTarget[]> {
  const dates = new Set<string>();
  changedNews.forEach((n) => n.date && dates.add(n.date));
  if (changedSermon?.date && changedSermon.title) dates.add(changedSermon.date);
  if (!ownerId || dates.size === 0) return [];
  const snap = await getDocs(query(collection(db, "bulletins"), where("authorId", "==", ownerId)));
  const byDate = new Map<string, { id: string; data: any }[]>();
  snap.docs.forEach((d) => {
    const data = d.data();
    if (data.status !== "published" && data.status !== "archived") return;
    const key = syncDate(data.date);
    if (!dates.has(key)) return;
    byDate.set(key, [...(byDate.get(key) || []), { id: d.id, data }]);
  });
  const out: BulletinSyncTarget[] = [];
  byDate.forEach((docs, date) => {
    const t: BulletinSyncTarget = { date, bulletinIds: docs.map((x) => x.id) };
    const news = changedNews.find((n) => n.date === date);
    if (news && docs.some((x) => !sameLines(cleanLines(x.data.announcements), news.lines))) t.news = cleanLines(news.lines);
    if (changedSermon && changedSermon.date === date && changedSermon.title && docs.some((x) => !sameSermon(x.data, changedSermon))) {
      t.sermon = cleanSermon(changedSermon);
    }
    if (t.news || t.sermon) out.push(t);
  });
  return out.sort((a, z) => z.date.localeCompare(a.date));
}

// 고른 주보에 소식·말씀 써 넣기(그 칸만 바꿈)
export async function applyBulletinTarget(t: BulletinSyncTarget) {
  const patch: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (t.news) patch.announcements = t.news.map((l, i) => ({ id: `${Date.now()}-${i}`, title: l.title, content: l.content }));
  if (t.sermon) {
    patch.title = t.sermon.title;
    patch.scripture = t.sermon.scripture;
    patch.preacher = t.sermon.preacher;
  }
  await Promise.all(t.bulletinIds.map((id) => updateDoc(doc(db, "bulletins", id), patch)));
}

// ── 주보 쪽에서 쓰는 것 ──────────────────

type SiteDoc = { slug: string; newsItems?: any[]; weeklySermon?: any };

async function ownerSites(ownerId: string): Promise<SiteDoc[]> {
  const snap = await getDocs(query(collection(db, "churchSites"), where("ownerId", "==", ownerId)));
  return snap.docs.map((d) => ({ slug: d.id, ...(d.data() as any) }));
}

// 주보 발행 뒤: 같은 날짜의 홈페이지 소식·이번 주 말씀이 있고 내용이 다르면 ask()로 물어보고,
// "예"면 홈페이지에 써 넣음. 같은 날짜 홈페이지 내용이 없으면 홈페이지는 주보 내용을 그대로 보여 주므로 묻지 않음
export async function syncBulletinToSites(
  ownerId: string,
  dateRaw: unknown,
  announcements: unknown,
  sermonRaw: any,
  ask: (message: string, detail: { date: string; kinds: string[] }) => boolean | Promise<boolean>,
): Promise<boolean> {
  const date = syncDate(dateRaw);
  if (!ownerId || !date) return false;
  const lines = cleanLines(announcements);
  const sermon = cleanSermon(sermonRaw);
  const sites = await ownerSites(ownerId);
  const plans = sites.map((site) => {
    const news = Array.isArray(site.newsItems) ? site.newsItems : [];
    const ni = news.findIndex((n) => syncDate(n?.date) === date);
    const newsDiff = ni >= 0 && lines.length > 0 && !sameLines(siteNewsLines(news[ni]), lines);
    const w = site.weeklySermon || {};
    const sermonDiff = !!sermon.title && syncDate(w.date) === date && !sameSermon(w, sermon);
    return { site, news, ni, newsDiff, sermonDiff };
  }).filter((p) => p.newsDiff || p.sermonDiff);
  if (plans.length === 0) return false;
  const kindList = [plans.some((p) => p.newsDiff) && "교회 소식", plans.some((p) => p.sermonDiff) && "이번 주 말씀"].filter(Boolean) as string[];
  const kinds = kindList.join("·");
  if (!(await ask(`${dotDate(date)} ${kinds}을(를) 교회 홈페이지에도 반영할까요?\n(취소를 누르면 홈페이지는 지금 내용 그대로예요)`, { date, kinds: kindList }))) return false;
  await Promise.all(plans.map((p) => {
    const patch: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (p.newsDiff) {
      patch.newsItems = p.news.map((n, i) => (i === p.ni
        ? { ...n, items: lines, title: lines[0]?.title || "", content: lines[0]?.content || "" }
        : n));
    }
    if (p.sermonDiff) patch.weeklySermon = { ...(p.site.weeklySermon || {}), ...sermon, date };
    return updateDoc(doc(db, "churchSites", p.site.slug), patch);
  }));
  return true;
}

// 새 주보를 만들 때: 같은 날짜로 홈페이지에 적어 둔 소식·이번 주 말씀(없으면 null)
export async function siteWeeklyForDate(ownerId: string, dateRaw: unknown): Promise<{ news: SyncLine[]; sermon: SyncSermon | null } | null> {
  const date = syncDate(dateRaw);
  if (!ownerId || !date) return null;
  const sites = await ownerSites(ownerId);
  for (const site of sites) {
    const n = (Array.isArray(site.newsItems) ? site.newsItems : []).find((x) => syncDate(x?.date) === date);
    const w = site.weeklySermon || {};
    const sermon = syncDate(w.date) === date && cleanSermon(w).title ? cleanSermon(w) : null;
    const news = n ? siteNewsLines(n) : [];
    if (news.length || sermon) return { news, sermon };
  }
  return null;
}
