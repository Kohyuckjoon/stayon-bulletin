import { useEffect, useState } from "react";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { Switch } from "../../components/ui/switch";
import { Button } from "../../components/ui/button";
import { Megaphone } from "lucide-react";
import { toast } from "sonner";

// /super > 기능 업데이트 알림. 운영자가 자유롭게 메모(엔터로 줄바꿈 가능)를 남기면,
// settings/featureUpdateNotice 문서에 저장되고 /admin/editor와 /admin 화면에 실시간으로 노출된다.
export const AdminFeatureUpdateNotice = () => {
  const [message, setMessage] = useState("");
  const [enabled, setEnabled] = useState(true);
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
    const unsubscribe = onSnapshot(doc(db, "settings", "featureUpdateNotice"), (snap) => {
      const data = snap.data();
      setMessage(typeof data?.message === "string" ? data.message : "");
      setEnabled(data?.enabled !== false);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await setDoc(
        doc(db, "settings", "featureUpdateNotice"),
        { message, enabled, updatedAt: serverTimestamp() },
        { merge: true }
      );
      toast.success("저장되었습니다.");
    } catch (error) {
      console.error("기능 업데이트 알림 저장 실패:", error);
      toast.error("저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 sm:p-8 md:p-12">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6 md:mb-10">
          <h1 className="text-xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">기능 업데이트 알림</h1>
          <p className="text-gray-500 mt-1.5 md:mt-2 text-xs sm:text-base font-medium leading-relaxed">
            여기에 작성한 메모는 각 교회의 <b>주보 수정 화면</b>과 <b>대시보드</b>에 "새 기능이 생겼어요!" 알림으로 표시돼요.
            엔터로 줄바꿈한 내용은 그대로 유지됩니다.
          </p>
        </div>

        <div className="bg-white rounded-2xl md:rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="p-10 md:p-16 text-center text-gray-400 font-medium text-sm">불러오는 중입니다...</div>
          ) : (
            <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2.5 sm:gap-3">
                  <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center shrink-0 transition-colors ${enabled ? "bg-blue-50 text-blue-600" : "bg-gray-100 text-gray-400"}`}>
                    <Megaphone className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 text-sm sm:text-base">알림 노출</p>
                    <p className="text-[11px] sm:text-xs text-gray-400 mt-0.5">꺼두면 내용은 남아있고 화면에만 안 보여요</p>
                  </div>
                </div>
                <Switch checked={enabled} onCheckedChange={setEnabled} disabled={saving} />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">메모 내용</label>
                <textarea
                  rows={5}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={"예) 오시는 길 기능이 추가되었어요!\n주보에 교회 위치와 길찾기 버튼을 넣어보세요."}
                  className="w-full px-3.5 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium resize-none"
                />
              </div>

              {/* 실제 화면과 동일한 스타일의 미리보기 */}
              {message.trim() !== "" && (
                <div>
                  <p className="text-xs font-bold text-gray-400 mb-2">미리보기</p>
                  <div className="p-4 rounded-[1.75rem] bg-gradient-to-r from-blue-600 to-indigo-700 text-white shadow-lg flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                      <Megaphone className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-black tracking-widest uppercase text-blue-100 mb-1">새 기능이 생겼어요!</p>
                      <p className="text-sm font-bold leading-relaxed whitespace-pre-line break-words">{message}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold px-6 py-3 shadow-sm">
                  {saving ? "저장 중..." : "저장하기"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
