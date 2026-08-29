import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

// /super > 화면 관리에서 켜고 끄는 "사역자 청빙" 공개 노출 스위치.
// settings/featureFlags 문서가 없거나 필드가 비어있으면(=한 번도 꺼본 적 없으면) 켜진 것으로 취급해
// 기존 사용자 경험이 이 기능 도입 이전과 동일하게 유지되도록 한다.
export function useJobBoardEnabled() {
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, "settings", "featureFlags"), (snap) => {
      const data = snap.data();
      setEnabled(data?.jobBoardEnabled !== false);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsubscribe();
  }, []);

  return { enabled, loading };
}
