import { doc, getDoc, getDocs, collection, query, where, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import type { PaperJubo } from "../app/pages/website/paperJubo/types";

// 종이 주보 저장 위치(2026-11-24): 홈페이지 사이트가 아니라 "교회 계정"에 붙임 → 홈페이지 없이 주보만 쓰는 교회도 사용.
//  paperJubos/{계정 uid} = { jubo, ownerId, updatedAt }
//  운영자가 대신 만들고 아직 계정 연결 안 한 사이트는 계정이 없어서 site_{주소} 를 열쇠로 씀
// 예전에 홈페이지 쪽(churchSites/{주소}.paperJubo)에 저장된 것은 처음 열 때 그대로 불러오고, 다음 저장부터 여기로 저장
export async function loadPaperJubo(key: string, ownerId: string | null): Promise<PaperJubo | null> {
  const snap = await getDoc(doc(db, "paperJubos", key));
  if (snap.exists()) return (snap.data().jubo as PaperJubo) || null;
  // 예전 저장본: 사이트 열쇠면 그 사이트, 계정이면 그 계정의 사이트 중 종이 주보가 있는 것
  if (key.startsWith("site_")) {
    const s = await getDoc(doc(db, "churchSites", key.slice(5)));
    return (s.data()?.paperJubo as PaperJubo) || null;
  }
  if (!ownerId) return null;
  const sites = await getDocs(query(collection(db, "churchSites"), where("ownerId", "==", ownerId)));
  const withJubo = sites.docs.map((d) => d.data().paperJubo as PaperJubo | undefined).filter(Boolean) as PaperJubo[];
  withJubo.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return withJubo[0] || null;
}

export async function savePaperJubo(key: string, ownerId: string, jubo: PaperJubo): Promise<void> {
  await setDoc(doc(db, "paperJubos", key), { jubo, ownerId, updatedAt: serverTimestamp() }, { merge: true });
}
