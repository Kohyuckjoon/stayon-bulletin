import { useEffect, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { auth, db } from "../../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { Switch } from "../../components/ui/switch";
import { Briefcase, Eye, EyeOff } from "lucide-react";

// /super > 화면 관리. 사용자에게 공개로 노출할지 말지를 화면 단위로 켜고 끄는 스위치 모음.
// 여기서 끄면 settings/featureFlags에 저장되고, useJobBoardEnabled 훅을 통해
// Landing/AdminDashboard 헤더의 진입 버튼과 /jobs 라우트 전체(JobsGate)가 실시간으로 반응한다.
export const AdminFeatureSettings = () => {
  const [jobBoardEnabled, setJobBoardEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const ADMIN_EMAILS = ["akhj123akhjk@gmail.com", "stayon.platform@gmail.com"];

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user || !ADMIN_EMAILS.includes(user.email || "")) {
        alert("접근 권한이 없습니다.");
        window.location.href = "/login";
      }
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, "settings", "featureFlags"), (snap) => {
      const data = snap.data();
      setJobBoardEnabled(data?.jobBoardEnabled !== false);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleToggle = async (next: boolean) => {
    setSaving(true);
    try {
      await setDoc(doc(db, "settings", "featureFlags"), { jobBoardEnabled: next }, { merge: true });
    } catch (error) {
      console.error("화면 노출 설정 저장 실패:", error);
      alert("저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 sm:p-8 md:p-12">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6 md:mb-10">
          <h1 className="text-xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">화면 관리</h1>
          <p className="text-gray-500 mt-1.5 md:mt-2 text-xs sm:text-base font-medium leading-relaxed">
            사용자에게 공개로 보여줄지 말지를 화면 단위로 켜고 끌 수 있어요. 끄면 헤더의 진입 버튼이 비활성화(잠금) 상태로 바뀌고, 해당 화면에 직접 접속해도 준비중 안내가 표시돼요.
          </p>
        </div>

        <div className="bg-white rounded-2xl md:rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="p-10 md:p-16 text-center text-gray-400 font-medium text-sm">설정을 불러오는 중입니다...</div>
          ) : (
            <div className="p-4 sm:p-6 flex items-center gap-3 sm:gap-4">
              <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center shrink-0 transition-colors ${jobBoardEnabled ? "bg-blue-50 text-blue-600" : "bg-gray-100 text-gray-400"}`}>
                <Briefcase className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 text-sm sm:text-base">사역자 청빙</p>
                <p className="text-[11px] sm:text-xs text-gray-400 mt-0.5">/jobs 게시판 · 공고 등록/상세/수정/홍보 화면 전체가 함께 적용돼요</p>
              </div>
              <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
                <span className={`hidden sm:flex items-center gap-1 text-xs font-black ${jobBoardEnabled ? "text-emerald-600" : "text-gray-400"}`}>
                  {jobBoardEnabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  {jobBoardEnabled ? "노출 중" : "숨김"}
                </span>
                <Switch checked={jobBoardEnabled} onCheckedChange={handleToggle} disabled={saving} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
