import {
  addDoc, collection, doc, getDoc, getDocs, orderBy, query, runTransaction,
  serverTimestamp, setDoc, updateDoc, where, Timestamp,
} from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../firebase";

// 수련회(2026-11-24) — 곤지암 만나교회 청년부 주보(WorshipServiceBulletinMANNA)의 /SummerCamp 를 스테이온으로 옮김.
// 달라진 점: 교회마다 따로(retreats/{id}, ownerId), 일정표·조편성 공개 시각·시작일을 코드가 아니라 입력값으로,
// 신청은 구글폼 대신 자체 신청서(retreats/{id}/applications). 이미지는 파일 저장소(Storage).
// 성도 화면: /retreat/{id} · 관리자: 주보 편집 > 수련회 설정

export type RetreatFieldKey = "gender" | "group" | "attendance" | "depositor" | "memo";
export const RETREAT_FIELD_LABELS: Record<RetreatFieldKey, string> = {
  gender: "성별", group: "소속 (부서 · 셀)", attendance: "참석 여부", depositor: "회비 입금자명", memo: "하고 싶은 말",
};

export interface RetreatQuestion { id: string; label: string; required: boolean }
export interface RetreatScheduleRow { time: string; label: string; highlight?: boolean }
export interface RetreatScheduleDay { title: string; rows: RetreatScheduleRow[] }

export interface Retreat {
  id: string;
  ownerId: string;
  churchName: string;
  enabled: boolean;          // 성도 화면 공개
  title: string;             // 큰 제목 (예: 2026 청년부 여름 수련회)
  theme: string;             // 대주제
  verse: string; verseRef: string;
  startDate: string;         // YYYY-MM-DD (카운트다운 기준)
  endDate: string;
  dateText: string;          // 일시 문구(비우면 시작·종료일로 자동)
  location: string; address: string;
  fee: string; bankName: string; accountNumber: string; accountHolder: string;
  contact: string; items: string; caution: string;
  schedule: RetreatScheduleDay[];
  coverUrl: string;          // 성도 화면 첫 화면을 꽉 채우는 커버 사진(비우면 기본 사진)
  posterUrl: string;
  groupImageUrl: string;
  groupRevealAt: string;     // 조편성 공개 시각(datetime-local 값, 한국 시간). 비우면 바로 공개
  form: {
    open: boolean;           // 신청 받기
    fields: Record<RetreatFieldKey, boolean>;
    questions: RetreatQuestion[];
    capacity: number;        // 0 = 제한 없음
    deadline: string;        // YYYY-MM-DD, 비우면 없음(그날 끝까지 받음)
  };
  appCount?: number;         // 신청 인원(신청할 때 함께 +1)
  createdAt?: Timestamp; updatedAt?: Timestamp;
}

export interface RetreatApplication {
  id: string;
  name: string; phone: string;
  gender?: string; group?: string; attendance?: string; depositor?: string; memo?: string;
  answers?: Record<string, string>;
  agree: boolean;
  paid: boolean;
  createdAt?: Timestamp;
}

export function emptyRetreat(ownerId: string, churchName: string): Omit<Retreat, "id"> {
  return {
    ownerId, churchName, enabled: false,
    title: "", theme: "", verse: "", verseRef: "",
    startDate: "", endDate: "", dateText: "",
    location: "", address: "", fee: "", bankName: "", accountNumber: "", accountHolder: "",
    contact: "", items: "", caution: "",
    schedule: [
      { title: "1일차", rows: [{ time: "", label: "" }] },
      { title: "2일차", rows: [{ time: "", label: "" }] },
      { title: "3일차", rows: [{ time: "", label: "" }] },
    ],
    coverUrl: "", posterUrl: "", groupImageUrl: "", groupRevealAt: "",
    form: {
      open: true,
      fields: { gender: true, group: true, attendance: true, depositor: true, memo: true },
      questions: [], capacity: 0, deadline: "",
    },
    appCount: 0,
  };
}

// 저장된 값에 빠진 칸이 있어도 화면이 깨지지 않게 기본값과 합침
export function normalizeRetreat(id: string, raw: Partial<Retreat>): Retreat {
  const base = emptyRetreat(raw.ownerId || "", raw.churchName || "");
  return {
    ...base, ...raw, id,
    schedule: Array.isArray(raw.schedule) && raw.schedule.length ? raw.schedule : base.schedule,
    form: { ...base.form, ...(raw.form || {}), fields: { ...base.form.fields, ...(raw.form?.fields || {}) }, questions: raw.form?.questions || [] },
  };
}

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const fmtDay = (s: string) => {
  const d = new Date(`${s}T00:00:00+09:00`);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()} (${WEEK[d.getDay()]})`;
};
// 일시 문구: 직접 쓴 문구가 있으면 그것, 없으면 "2026. 8. 16 (일) — 8. 18 (화)"
export function retreatDateText(r: Retreat): string {
  if (r.dateText.trim()) return r.dateText.trim();
  if (!r.startDate) return "";
  const a = fmtDay(r.startDate);
  if (!r.endDate || r.endDate === r.startDate) return a;
  const b = fmtDay(r.endDate);
  return `${a} — ${r.endDate.slice(0, 4) === r.startDate.slice(0, 4) ? b.replace(/^\d{4}\. /, "") : b}`;
}

// 신청을 받을 수 있는 상태인지(닫힘/마감일 지남/정원 참)
export function retreatApplyState(r: Retreat): { ok: boolean; reason: string } {
  if (!r.form.open) return { ok: false, reason: "신청이 마감되었어요" };
  if (r.form.deadline) {
    const end = new Date(`${r.form.deadline}T23:59:59+09:00`).getTime();
    if (Date.now() > end) return { ok: false, reason: "신청 기간이 끝났어요" };
  }
  if (r.form.capacity > 0 && (r.appCount || 0) >= r.form.capacity) return { ok: false, reason: "정원이 다 찼어요" };
  return { ok: true, reason: "" };
}

export async function getRetreat(id: string): Promise<Retreat | null> {
  const snap = await getDoc(doc(db, "retreats", id));
  return snap.exists() ? normalizeRetreat(snap.id, snap.data() as Partial<Retreat>) : null;
}

// 교회(계정)의 수련회 — 지금은 가장 최근 것 하나만 씀
export async function getRetreatByOwner(ownerId: string): Promise<Retreat | null> {
  const snap = await getDocs(query(collection(db, "retreats"), where("ownerId", "==", ownerId)));
  if (snap.empty) return null;
  const list = snap.docs.map((d) => normalizeRetreat(d.id, d.data() as Partial<Retreat>));
  list.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
  return list[0];
}

export async function createRetreat(ownerId: string, churchName: string): Promise<Retreat> {
  const data = { ...emptyRetreat(ownerId, churchName), createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
  const r = await addDoc(collection(db, "retreats"), data);
  return normalizeRetreat(r.id, { ...emptyRetreat(ownerId, churchName) });
}

// 저장: 신청 인원(appCount)·만든 시각은 건드리지 않음
export async function saveRetreat(r: Retreat): Promise<void> {
  const { id, appCount: _c, createdAt: _t, ...rest } = r;
  void _c; void _t;
  await setDoc(doc(db, "retreats", id), { ...rest, updatedAt: serverTimestamp() }, { merge: true });
}

export async function uploadRetreatImage(ownerId: string, kind: "cover" | "poster" | "group", file: File): Promise<string> {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const r = storageRef(storage, `retreatUploads/${ownerId}/${kind}-${Date.now()}.${ext}`);
  await uploadBytes(r, file, { contentType: file.type || undefined });
  return getDownloadURL(r);
}

// 신청: 닫힘·마감·정원을 한 번 더 확인하고, 신청서 저장과 인원 +1 을 함께(동시에 여러 명이 내도 정원 넘지 않게)
export async function submitApplication(retreatId: string, app: Omit<RetreatApplication, "id" | "paid" | "createdAt">): Promise<void> {
  const rRef = doc(db, "retreats", retreatId);
  const aRef = doc(collection(db, "retreats", retreatId, "applications"));
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(rRef);
    if (!snap.exists()) throw new Error("수련회를 찾을 수 없어요");
    const r = normalizeRetreat(snap.id, snap.data() as Partial<Retreat>);
    const st = retreatApplyState(r);
    if (!st.ok) throw new Error(st.reason);
    tx.set(aRef, { ...app, paid: false, createdAt: serverTimestamp() });
    tx.update(rRef, { appCount: (r.appCount || 0) + 1 });
  });
}

export async function listApplications(retreatId: string): Promise<RetreatApplication[]> {
  const snap = await getDocs(query(collection(db, "retreats", retreatId, "applications"), orderBy("createdAt", "asc")));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<RetreatApplication, "id">) }));
}

export async function setApplicationPaid(retreatId: string, appId: string, paid: boolean): Promise<void> {
  await updateDoc(doc(db, "retreats", retreatId, "applications", appId), { paid });
}

// 신청 삭제: 인원도 -1
export async function deleteApplication(retreatId: string, appId: string): Promise<void> {
  const rRef = doc(db, "retreats", retreatId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(rRef);
    const n = (snap.data()?.appCount as number) || 0;
    tx.delete(doc(db, "retreats", retreatId, "applications", appId));
    tx.update(rRef, { appCount: Math.max(0, n - 1) });
  });
}
export const newQuestionId = () => `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
