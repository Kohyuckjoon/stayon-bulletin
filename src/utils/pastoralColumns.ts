// 목회 칼럼: 주보와 무관하게 교회 계정(authorId)별로 매주 누적되는 글 목록.
// bulletins 문서에 종속된 sections/announcements와 달리, 이 컬렉션은 특정 주보의 발행/삭제와
// 완전히 독립적으로 유지된다 - "지난 내역 전체 조회"가 핵심 요구사항이라 별도 컬렉션으로 뺐다.
// 프로 요금제 전용 기능(텍스트) / 이미지 첨부는 올인원 요금제 — 게이팅은 subscriptionTier.ts의
// hasTierOrAbove로 판정하고, 여기 이 파일은 순수 CRUD만 담당한다.
import { db } from "../firebase";
import {
  collection, addDoc, updateDoc, deleteDoc, doc, getDoc, getDocs, query, where, orderBy, limit as fbLimit, serverTimestamp,
} from "firebase/firestore";

export interface PastoralColumn {
  id: string;
  authorId: string;
  date: string; // "YYYY-MM-DD"
  title: string;
  content: string;
  author: string; // 작성자 (담임목사가 아닐 수도 있음 - 자유 입력)
  imageUrl?: string; // 올인원 요금제 전용, 없으면 텍스트만
  createdAt?: unknown;
}

const COLLECTION = "pastoralColumns";

export async function fetchPastoralColumns(authorId: string, max?: number): Promise<PastoralColumn[]> {
  const base = collection(db, COLLECTION);
  const q = max
    ? query(base, where("authorId", "==", authorId), orderBy("date", "desc"), fbLimit(max))
    : query(base, where("authorId", "==", authorId), orderBy("date", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as PastoralColumn));
}

// 목록에서 클릭했을 때 보여줄 상세 화면(PastoralColumnDetailPage)용 단건 조회.
export async function getPastoralColumn(id: string): Promise<PastoralColumn | null> {
  const snap = await getDoc(doc(db, COLLECTION, id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as PastoralColumn) : null;
}

export async function addPastoralColumn(data: Omit<PastoralColumn, "id" | "createdAt">) {
  return addDoc(collection(db, COLLECTION), { ...data, createdAt: serverTimestamp() });
}

export async function updatePastoralColumn(id: string, data: Partial<Omit<PastoralColumn, "id" | "authorId" | "createdAt">>) {
  return updateDoc(doc(db, COLLECTION, id), data);
}

export async function deletePastoralColumn(id: string) {
  return deleteDoc(doc(db, COLLECTION, id));
}
