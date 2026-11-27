import { useEffect, useState } from "react";
import { useSmoothNavigate as useNavigate, preloadAdminPages } from "../../utils/smoothNavigate"; // 관리자 화면 사이 부드러운 이동(2026-11-25)
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { ArrowLeft } from "lucide-react";
import { auth, db } from "../../firebase";
import { PaperJuboGate } from "./website/paperJubo/PaperJuboGate";

// 주보 관리자 > 종이 주보 만들기(2026-11-24) — /admin/paper-jubo.
// 홈페이지 없이 주보만 쓰는 교회도 종이 주보를 만들 수 있게, 교회 계정에 저장(paperJubos/{계정}).
// 홈페이지 편집 화면의 "📄 교회 주보"와 같은 종이 주보(같은 저장 위치)
export function PaperJuboPage() {
  const navigate = useNavigate();
  useEffect(() => { preloadAdminPages(); }, []);
  const [uid, setUid] = useState<string | null>(null);
  const [churchName, setChurchName] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => onAuthStateChanged(auth, async (u) => {
    if (!u) { navigate("/login"); return; }
    setUid(u.uid);
    try { const s = await getDoc(doc(db, "users", u.uid)); setChurchName((s.data()?.churchName as string) || ""); } catch { /* 이름 없이도 진행 */ }
    setReady(true);
  }), [navigate]);
  useEffect(() => { document.title = "종이 주보 만들기 | 스테이온"; }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="bg-white/80 backdrop-blur-md border-b sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-3 sm:px-4 py-3 grid grid-cols-[auto_1fr_auto] items-center gap-2">
          <button type="button" onClick={() => navigate("/admin")} className="rounded-full p-2 hover:bg-slate-100" title="대시보드로"><ArrowLeft className="w-4 h-4" /></button>
          <h1 className="text-base sm:text-xl font-bold tracking-tight text-center">종이 주보 만들기</h1>
          <span className="w-8" />
        </div>
      </div>
      <div className="mx-auto max-w-[1200px] px-3 sm:px-6 py-6">
        {ready && uid ? <PaperJuboGate storeKey={uid} ownerId={uid} churchName={churchName} /> : <p className="py-16 text-center text-sm text-slate-400">불러오는 중이에요…</p>}
      </div>
    </div>
  );
}
