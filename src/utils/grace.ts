import { collection, doc, getDoc, getDocs, query, where, setDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "../firebase";

// 교회 홈페이지 "은혜나눔" 게시판(2026-11-24) — 교회별(slug) 글. 읽기는 바로 DB에서,
// 쓰기·고치기·지우기·신고·관리는 서버 함수(gracePosts)만(비밀번호 · 스팸 · 욕설 검사를 서버에서)
export interface GracePost {
  id: string; slug: string;
  name: string; title: string; content: string; images: string[];
  hidden: boolean; reports: number;
  createdAt?: Timestamp; updatedAt?: Timestamp;
}

const toPost = (id: string, d: Record<string, unknown>): GracePost => ({
  id, slug: String(d.slug || ""), name: String(d.name || ""), title: String(d.title || ""), content: String(d.content || ""),
  images: Array.isArray(d.images) ? (d.images as string[]) : [], hidden: d.hidden === true, reports: Number(d.reports || 0),
  createdAt: d.createdAt as Timestamp | undefined, updatedAt: d.updatedAt as Timestamp | undefined,
});

// 이 교회 글만(최신순). includeHidden: 관리 화면에서 숨긴 글도 보기
export async function listGracePosts(slug: string, includeHidden = false): Promise<GracePost[]> {
  const snap = await getDocs(query(collection(db, "gracePosts"), where("slug", "==", slug)));
  return snap.docs.map((d) => toPost(d.id, d.data()))
    .filter((p) => includeHidden || !p.hidden)
    .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
}

export async function getGracePost(slug: string, id: string): Promise<GracePost | null> {
  const s = await getDoc(doc(db, "gracePosts", id));
  if (!s.exists()) return null;
  const p = toPost(s.id, s.data());
  return p.slug === slug ? p : null;
}

type Call = { action: string; slug: string; [k: string]: unknown };
export async function graceCall<T = { ok?: boolean; id?: string; already?: boolean; hidden?: boolean }>(data: Call): Promise<T> {
  const fn = httpsCallable<Call, T>(getFunctions(auth.app, "asia-northeast3"), "gracePosts");
  try {
    return (await fn(data)).data;
  } catch (e) {
    // 서버가 보낸 한글 안내 문구는 그대로, 서버 연결 문제(internal · unavailable 등 영어 오류)는 쉬운 말로
    const err = e as { message?: string; code?: string };
    const msg = (err.message || "").replace(/^.*?:\s*/, "");
    const known = /[가-힣]/.test(msg) && err.code !== "functions/internal";
    throw new Error(known ? msg : "지금은 처리하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
}

// 사진 올리기(최대 3장) — 파일 저장소 graceUploads/{교회}/…
export async function uploadGraceImages(slug: string, files: File[]): Promise<string[]> {
  const urls: string[] = [];
  for (const [i, f] of files.slice(0, 3).entries()) {
    if (!f.type.startsWith("image/")) continue;
    if (f.size > 10 * 1024 * 1024) throw new Error("사진은 한 장에 10MB까지 올릴 수 있어요.");
    const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
    const r = storageRef(storage, `graceUploads/${slug}/${Date.now()}-${i}.${ext}`);
    await uploadBytes(r, f, { contentType: f.type });
    urls.push(await getDownloadURL(r));
  }
  return urls;
}

// ── 게시판 사용 승인(2026-11-24): 운영자가 허용한 교회만 사용(트래픽 관리) ──
// 진짜 승인은 graceApprovals/{주소}(운영자만 쓰기 · 서버가 확인). 메뉴 표시용으로 churchSites.graceAllowed 도 같이 맞춤
export async function getGraceApproval(slug: string): Promise<boolean> {
  try { const s = await getDoc(doc(db, "graceApprovals", slug)); return s.data()?.allowed === true; } catch { return false; }
}
export async function setGraceApproval(slug: string, allowed: boolean): Promise<void> {
  await setDoc(doc(db, "graceApprovals", slug), { allowed, updatedAt: serverTimestamp() }, { merge: true });
  await setDoc(doc(db, "churchSites", slug), { graceAllowed: allowed }, { merge: true });
}
