import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card } from "../components/ui/card";
import { Smartphone, ArrowLeft, Mail, X } from "lucide-react";
import { KakaoChannelButton } from "../components/KakaoChannelButton";

// Firebase 관련 임포트
import { auth } from "../../firebase";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { clearLoginReturnTo, consumeLoginReturnTo } from "../../utils/loginReturn";

export function Login() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [formData, setFormData] = useState({
    email: "",
    password: ""
  });

  // 1. 실제 로그인 핸들러
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(
        auth, 
        formData.email.trim(), 
        formData.password
      );
      console.log("로그인 성공! 유저 UID:", userCredential.user.uid);
      // navigate("/admin");
      // /pricing, /website-offer 등 결제 안내 화면에서 로그인하러 온 경우 그 화면으로 되돌려 보내고,
      // 그 외(기존과 동일한) 경로로 로그인한 경우는 그대로 홈으로 이동
      const returnTo = consumeLoginReturnTo();
      navigate(returnTo ?? "/");
    } catch (error: any) {
      if (error.code === "auth/invalid-credential" || error.code === "auth/user-not-found" || error.code === "auth/wrong-password") {
        alert("이메일 또는 비밀번호가 일치하지 않습니다.");
      } else if (error.code === "auth/invalid-email") {
        alert("이메일 형식이 올바르지 않습니다.");
      } else if (error.code === "auth/too-many-requests") {
        alert("너무 많은 로그인 시도가 있었습니다. 잠시 후 다시 시도해주세요.");
      } else {
        alert("로그인 중 오류가 발생했습니다: " + error.code);
      }
    } finally {
      setLoading(false);
    }
  };

  // 2. 비밀번호 재설정 이메일 전송 핸들러 (가입 여부 체크 포함)
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = resetEmail.trim();
    if (!trimmedEmail) return alert("이메일을 입력해주세요.");
    
    setResetLoading(true);
    try {
      await sendPasswordResetEmail(auth, trimmedEmail);
      alert("비밀번호 재설정 이메일이 발송되었습니다. 메일함을 확인해주세요.");
      setShowResetModal(false);
      setResetEmail("");
    } catch (error: any) {
      console.error("Reset Error Code:", error.code);
      
      // Firebase 최신 버전에서는 보안상 user-not-found를 던지지 않을 수 있음
      // 그럴 경우 일반적인 성공 메시지를 띄우는 것이 Google의 보안 권장사항이나,
      // 현재 개발 단계에서는 명확한 구분을 위해 아래와 같이 처리합니다.
      if (error.code === "auth/user-not-found") {
        alert("등록되지 않은 이메일 계정입니다. 회원가입을 먼저 진행해주세요.");
      } else if (error.code === "auth/invalid-email") {
        alert("올바른 이메일 형식이 아닙니다.");
      } else if (error.code === "auth/too-many-requests") {
        alert("단시간에 너무 많은 요청이 있었습니다. 잠시 후 다시 시도해주세요.");
      } else {
        // 일부 Firebase 설정에서는 가입되지 않은 이메일도 '성공'으로 간주하여 보안을 유지합니다.
        // 이 경우 실제 메일함에 메일이 오지 않는 것으로 가입 여부를 판단해야 합니다.
        alert("비밀번호 재설정 요청 중 오류가 발생했습니다: " + error.code);
      }
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-4 relative">
      <Card className="w-full max-w-md p-8 rounded-3xl border-0 shadow-xl">
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={() => { clearLoginReturnTo(); navigate("/"); }}
            className="mb-4 rounded-full -ml-2 text-gray-500 hover:bg-gray-100"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            돌아가기
          </Button>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center shadow-lg">
              <Smartphone className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">로그인</h1>
          </div>
          <p className="text-gray-600">
            디지털 주보 관리자 페이지에 오신 것을 환영합니다
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">이메일</Label>
            <Input
              id="email"
              type="email"
              placeholder="example@church.com"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="rounded-xl bg-gray-50 border-gray-100 focus:bg-white transition-all h-12"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">비밀번호</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="rounded-xl bg-gray-50 border-gray-100 focus:bg-white transition-all h-12"
              required
            />
          </div>

          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="rounded border-gray-300 text-blue-600" />
              <span className="text-gray-600">로그인 상태 유지</span>
            </label>
            <button 
              type="button" 
              onClick={() => setShowResetModal(true)}
              className="text-blue-600 hover:underline font-medium"
            >
              비밀번호 찾기
            </button>
          </div>

          <div className="pt-4">
            <Button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl py-7 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg font-bold text-lg transition-all"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  확인 중...
                </span>
              ) : "로그인"}
            </Button>
          </div>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            아직 계정이 없으신가요?{" "}
            <button
              onClick={() => navigate("/signup")}
              className="text-blue-600 hover:underline font-bold"
            >
              회원가입
            </button>
          </p>
        </div>
      </Card>

      {/* --- 비밀번호 재설정 메테리얼 스타일 모달 --- */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm transition-opacity">
          <div className="w-full max-w-sm bg-white rounded-t-[2.5rem] sm:rounded-[2rem] shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-8 duration-300">
            <div className="p-8">
              <div className="flex justify-between items-start mb-6">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center">
                  <Mail className="w-6 h-6 text-blue-600" />
                </div>
                <button 
                  onClick={() => setShowResetModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>
              
              <h2 className="text-2xl font-bold mb-2">비밀번호 찾기</h2>
              <p className="text-gray-500 text-sm mb-6 leading-relaxed">
                가입하신 이메일 주소를 입력하시면<br />
                비밀번호 재설정 링크를 보내드립니다.
              </p>

              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="resetEmail" className="text-gray-400 font-normal">이메일 주소</Label>
                  <Input
                    id="resetEmail"
                    type="email"
                    placeholder="example@church.com"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    className="rounded-xl bg-gray-50 border-0 focus:ring-2 focus:ring-blue-500 h-12 transition-all"
                    required
                  />
                </div>
                <Button
                  type="submit"
                  disabled={resetLoading}
                  className="w-full rounded-xl py-6 bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md active:scale-[0.98] transition-all"
                >
                  {resetLoading ? "발송 중..." : "이메일 보내기"}
                </Button>
              </form>
            </div>
          </div>
        </div>
      )}
      <KakaoChannelButton />
    </div>
  );
}
