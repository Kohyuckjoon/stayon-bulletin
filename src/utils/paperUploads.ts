import { collection, addDoc, deleteDoc, doc, getDocs, query, where, serverTimestamp } from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage } from "../firebase";

// 올린 종이 주보 파일(2026-11-25) — 주보 편집(/admin/editor) "종이 주보" 칸에서 PDF·사진을 올리면
// 교회 계정(ownerId)에 쌓이고, 홈페이지 편집(/website-builder) "교회 주보"와 전체 보기(/admin/paper-files)에서 같이 봄.
// 저장 위치: paperJuboFiles/{자동 id}, 파일은 Storage paperJuboFiles/{계정}/...
// (홈페이지 성도 화면의 "교회 주보"는 churchSites.paperBulletins — 이것과는 별개)
export type PaperUpload = {
  id: string;
  ownerId: string;
  bulletinId: string | null;
  date: string; // 주보 날짜 YYYY-MM-DD
  title: string;
  fileUrl: string;
  fileName: string;
  fileType: string; // MIME
  size: number;
  createdAtMs: number;
};

export const PAPER_UPLOAD_ACCEPT = "application/pdf,.pdf,image/jpeg,image/png,image/webp,image/heic,image/heif";
export const PAPER_UPLOAD_MAX_MB = 30;

export const isPdf = (p: Pick<PaperUpload, "fileType" | "fileName">) =>
  p.fileType === "application/pdf" || /\.pdf$/i.test(p.fileName);

export function formatBytes(n: number) {
  if (!n) return "-";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

// 올바른 파일인지(PDF 또는 사진) — 아니면 사람이 읽을 안내 문구, 맞으면 null
export function checkPaperFile(f: File): string | null {
  const okType = f.type === "application/pdf" || f.type.startsWith("image/") || /\.(pdf|jpe?g|png|webp|heic|heif)$/i.test(f.name);
  if (!okType) return `${f.name}: PDF나 사진(JPG·PNG) 파일만 올릴 수 있어요.`;
  if (f.size > PAPER_UPLOAD_MAX_MB * 1024 * 1024) return `${f.name}: ${PAPER_UPLOAD_MAX_MB}MB보다 커서 올릴 수 없어요.`;
  return null;
}

// 날짜 최신순(같으면 올린 순서 최신순). 색인 없이 쓰려고 정렬은 화면에서
export async function listPaperUploads(ownerId: string): Promise<PaperUpload[]> {
  if (!ownerId) return [];
  const snap = await getDocs(query(collection(db, "paperJuboFiles"), where("ownerId", "==", ownerId)));
  const rows = snap.docs.map((d) => {
    const x = d.data() as Record<string, unknown>;
    const ts = x.createdAt as { toMillis?: () => number } | undefined;
    return {
      id: d.id,
      ownerId: String(x.ownerId || ""),
      bulletinId: (x.bulletinId as string) || null,
      date: String(x.date || ""),
      title: String(x.title || ""),
      fileUrl: String(x.fileUrl || ""),
      fileName: String(x.fileName || ""),
      fileType: String(x.fileType || ""),
      size: Number(x.size || 0),
      createdAtMs: ts?.toMillis ? ts.toMillis() : Number(x.createdAtMs || 0),
    } as PaperUpload;
  });
  return rows.sort((a, z) => z.date.localeCompare(a.date) || z.createdAtMs - a.createdAtMs);
}

export async function uploadPaperFile(file: File, meta: { ownerId: string; bulletinId: string | null; date: string; title: string }): Promise<PaperUpload> {
  const safe = file.name.replace(/[^\w.\-가-힣]/g, "_").slice(-80);
  const path = `paperJuboFiles/${meta.ownerId}/${Date.now()}_${safe}`;
  const r = storageRef(storage, path);
  await uploadBytes(r, file, { contentType: file.type || (/\.pdf$/i.test(file.name) ? "application/pdf" : "application/octet-stream") });
  const fileUrl = await getDownloadURL(r);
  const now = Date.now();
  const data = {
    ownerId: meta.ownerId,
    bulletinId: meta.bulletinId,
    date: meta.date,
    title: meta.title,
    fileUrl,
    filePath: path,
    fileName: file.name,
    fileType: file.type || "",
    size: file.size,
    createdAt: serverTimestamp(),
    createdAtMs: now,
  };
  const ref = await addDoc(collection(db, "paperJuboFiles"), data);
  return { id: ref.id, ...data, createdAtMs: now };
}

// 기록과 실제 파일 둘 다 지움(파일 지우기는 실패해도 기록은 지움)
export async function deletePaperUpload(p: PaperUpload & { filePath?: string }) {
  await deleteDoc(doc(db, "paperJuboFiles", p.id));
  try { await deleteObject(storageRef(storage, p.fileUrl)); } catch { /* 이미 없거나 경로를 못 찾음 */ }
}

// 2026-11-29 → "2026. 11. 29."
export function formatPaperDate(d: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${m[1]}. ${Number(m[2])}. ${Number(m[3])}.` : d || "-";
}
