import { db } from "../firebase";
import { doc, getDoc, collection, query, where, orderBy, limit, getDocs } from "firebase/firestore";
import { applyChurchFavicon } from "./churchFavicon";

// 성도 화면 및 그 하위 메뉴 화면(섬기시는 분 등)이 공통으로 쓰는 주보 데이터 로더.
// BulletinView 의 메인 로딩과 달리 조회수(views) 집계는 하지 않는다 - 메뉴 화면 진입이
// 열람 수로 중복 집계되지 않도록.
//  - idOrAuthor 가 bulletins 문서 id 면 그 문서를,
//  - 아니면 그 값을 authorId 로 보고 가장 최근 발행분을 가져온다. (BulletinView 와 동일한 규칙)
export async function fetchPublishedBulletin(idOrAuthor: string): Promise<any | null> {
  try {
    const snap = await getDoc(doc(db, "bulletins", idOrAuthor));
    if (snap.exists()) {
      applyChurchFavicon(snap.data().authorId); // 탭 아이콘을 이 교회 교단 마크로
      return { id: snap.id, ...snap.data() };
    }

    const q = query(
      collection(db, "bulletins"),
      where("authorId", "==", idOrAuthor),
      where("status", "==", "published"),
      orderBy("publishedAt", "desc"),
      limit(1)
    );
    const qs = await getDocs(q);
    if (!qs.empty) {
      applyChurchFavicon(qs.docs[0].data().authorId);
      return { id: qs.docs[0].id, ...qs.docs[0].data() };
    }
    return null;
  } catch (e) {
    console.error("주보 로딩 실패:", e);
    return null;
  }
}
