import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

// /super > 기능 업데이트 알림에서 운영자가 작성한 한 줄(또는 여러 줄) 메모를 실시간으로 읽어온다.
// settings/featureUpdateNotice 문서가 없거나 enabled가 false거나 message가 비어있으면 표시하지 않는다.
export function useFeatureUpdateNotice() {
  const [message, setMessage] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, "settings", "featureUpdateNotice"),
      (snap) => {
        const data = snap.data();
        setMessage(typeof data?.message === "string" ? data.message : "");
        setEnabled(data?.enabled === true);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsubscribe();
  }, []);

  return { message, enabled, loading, show: enabled && message.trim() !== "" };
}
