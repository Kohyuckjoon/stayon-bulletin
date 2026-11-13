import { useEffect, useState } from "react"; // 화면 전체 나타남·사라짐은 투명도만(transform을 쓰면 안쪽 팝업·문의 버튼의 고정 위치가 틀어짐)
import { useNavigate } from "react-router";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { ArrowLeft, Mail, X, Eye, EyeOff, Check } from "lucide-react";
import { KakaoChannelButton } from "../components/KakaoChannelButton";
import { AuthShowcase } from "../components/AuthShowcase";

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
  // 디자인 개편(2026-11-13): 비밀번호 보기 · 오류는 알림창 대신 입력칸 아래 빨간 글씨 · 비밀번호 찾기 결과도 창 안에 표시
  const [showPw, setShowPw] = useState(false);
  // 화면 전환(2026-11-13): 나갈 때 화면이 서서히 사라진 뒤 이동(로그인 성공·돌아가기·회원가입)
  const [leaving, setLeaving] = useState(false);
  const [shown, setShown] = useState(false); // 들어올 때: 첫 그림 다음에 켜서 서서히 나타나게
  useEffect(() => { const r = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(r); }, []);
  const leaveTo = (to: string) => { setLeaving(true); setTimeout(() => { navigate(to); window.scrollTo(0, 0); }, 380); };
  const [keepLogin, setKeepLogin] = useState(false); // "로그인 상태 유지" 체크(화면 표시용 — 기존과 같이 동작은 연결 안 됨)
  const [loginError, setLoginError] = useState("");
  const [resetMsg, setResetMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // 1. 실제 로그인 핸들러
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    setLoginError("");
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
      leaveTo(returnTo ?? "/");
    } catch (error: any) {
      if (error.code === "auth/invalid-credential" || error.code === "auth/user-not-found" || error.code === "auth/wrong-password") {
        setLoginError("이메일 또는 비밀번호가 일치하지 않아요.");
      } else if (error.code === "auth/invalid-email") {
        setLoginError("이메일 형식이 올바르지 않아요.");
      } else if (error.code === "auth/too-many-requests") {
        setLoginError("로그인 시도가 너무 많았어요. 잠시 후 다시 시도해 주세요.");
      } else {
        setLoginError("로그인 중 문제가 생겼어요. (" + error.code + ")");
      }
    } finally {
      setLoading(false);
    }
  };

  // 2. 비밀번호 재설정 이메일 전송 핸들러 (가입 여부 체크 포함)
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = resetEmail.trim();
    if (!trimmedEmail) { setResetMsg({ ok: false, text: "이메일을 입력해 주세요." }); return; }

    setResetLoading(true);
    setResetMsg(null);
    try {
      await sendPasswordResetEmail(auth, trimmedEmail);
      setResetMsg({ ok: true, text: "비밀번호 재설정 메일을 보냈어요. 메일함을 확인해 주세요." });
    } catch (error: any) {
      console.error("Reset Error Code:", error.code);
      
      // Firebase 최신 버전에서는 보안상 user-not-found를 던지지 않을 수 있음
      // 그럴 경우 일반적인 성공 메시지를 띄우는 것이 Google의 보안 권장사항이나,
      // 현재 개발 단계에서는 명확한 구분을 위해 아래와 같이 처리합니다.
      if (error.code === "auth/user-not-found") {
        setResetMsg({ ok: false, text: "가입되지 않은 이메일이에요. 회원가입을 먼저 진행해 주세요." });
      } else if (error.code === "auth/invalid-email") {
        setResetMsg({ ok: false, text: "이메일 형식이 올바르지 않아요." });
      } else if (error.code === "auth/too-many-requests") {
        setResetMsg({ ok: false, text: "요청이 너무 많았어요. 잠시 후 다시 시도해 주세요." });
      } else {
        // 일부 Firebase 설정에서는 가입되지 않은 이메일도 '성공'으로 간주하여 보안을 유지합니다.
        // 이 경우 실제 메일함에 메일이 오지 않는 것으로 가입 여부를 판단해야 합니다.
        setResetMsg({ ok: false, text: "요청 중 문제가 생겼어요. (" + error.code + ")" });
      }
    } finally {
      setResetLoading(false);
    }
  };

  // 입력칸 공통 스타일(토스풍): 연한 회색 → 포커스 시 흰 바탕 + 파란 테두리
  const field = "w-full h-[52px] rounded-2xl border-2 border-transparent bg-[#F2F4F6] px-4 text-[16px] text-[#191F28] placeholder:text-[#B0B8C1] outline-none transition-all duration-200 focus:bg-white focus:border-[#3182F6]";

  return (
    <div className={`min-h-screen lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] bg-white font-sans transition-opacity duration-[420ms] ease-out ${shown && !leaving ? "opacity-100" : "opacity-0"}`}>
      <style>{`
        @keyframes lgRipple{from{transform:scale(.3);opacity:1}to{transform:scale(1.3);opacity:0}}
        @keyframes lgShake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}
      `}</style>

      <AuthShowcase onHome={() => { clearLoginReturnTo(); leaveTo("/"); }} />

      {/* 오른쪽: 로그인 폼 */}
      {/* PC: 화면 높이에 딱 맞춤(스크롤 없음) — 여백이 화면 높이에 따라 줄어듦. 모바일은 그대로 */}
      <main className="relative flex min-h-screen flex-col px-5 sm:px-10 py-6 sm:py-10 lg:px-16 lg:h-screen lg:min-h-0 lg:py-0 lg:overflow-y-auto">
        <button type="button" onClick={() => { clearLoginReturnTo(); leaveTo("/"); }}
          className="flex w-fit items-center gap-1.5 rounded-full px-3 py-2 -ml-3 lg:absolute lg:left-16 lg:top-[min(40px,4.5vh)] lg:z-10 text-sm font-semibold text-[#4E5968] transition-colors hover:bg-[#F2F4F6]">
          <ArrowLeft className="h-4 w-4" /> 돌아가기
        </button>
        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-8 lg:py-[min(32px,3vh)] animate-in fade-in slide-in-from-bottom-2 duration-500">
          <h1 className="text-[28px] sm:text-[30px] font-black tracking-tight text-[#191F28]">다시 만나서 반가워요 👋</h1>
          <p className="mt-2 text-[15px] text-[#6B7684]">교회 계정으로 로그인하세요</p>

          <form onSubmit={handleSubmit} className="mt-9 lg:mt-[min(36px,4vh)] space-y-4" noValidate>
            <div>
              <label htmlFor="email" className="mb-2 block text-[13px] font-bold text-[#4E5968]">이메일</label>
              <input id="email" type="email" autoComplete="email" placeholder="example@church.com" value={formData.email}
                onChange={(e) => { setFormData({ ...formData, email: e.target.value }); if (loginError) setLoginError(""); }}
                className={field} required />
            </div>
            <div>
              <label htmlFor="password" className="mb-2 block text-[13px] font-bold text-[#4E5968]">비밀번호</label>
              <div className="relative">
                <input id="password" type={showPw ? "text" : "password"} autoComplete="current-password" placeholder="비밀번호 입력" value={formData.password}
                  onChange={(e) => { setFormData({ ...formData, password: e.target.value }); if (loginError) setLoginError(""); }}
                  className={`${field} pr-12`} style={loginError ? { borderColor: "#F04452", background: "#fff" } : undefined} required />
                <button type="button" aria-label={showPw ? "비밀번호 숨기기" : "비밀번호 보기"} onClick={() => setShowPw((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full text-[#8B95A1] transition-colors hover:bg-[#E5E8EB] hover:text-[#4E5968]">
                  {showPw ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                </button>
              </div>
              {/* 오류: 알림창 대신 입력칸 아래 빨간 글씨(살짝 흔들리며 나타남) */}
              {loginError && (
                <p key={loginError + String(loading)} className="mt-2 flex items-center gap-1.5 text-[13px] font-semibold text-[#F04452]" style={{ animation: "lgShake .35s ease-in-out" }}>
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#F04452] text-[10px] font-black text-white">!</span>
                  {loginError}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between pt-1 text-[14px]">
              {/* 머티리얼 스타일 체크박스: 누르면 파랗게 채워지며 체크가 그려지고, 주변에 물결처럼 번짐 */}
              <label className="group flex cursor-pointer select-none items-center gap-2.5 text-[#4E5968]">
                <input type="checkbox" checked={keepLogin} onChange={(e) => setKeepLogin(e.target.checked)} className="peer sr-only" />
                <span className="relative flex h-[22px] w-[22px] items-center justify-center rounded-[7px] peer-focus-visible:ring-4 peer-focus-visible:ring-[#3182F6]/25">
                  {/* 마우스를 올리면 뒤에 옅은 원 */}
                  <span className="absolute -inset-[9px] rounded-full bg-[#3182F6]/0 transition-colors duration-200 group-hover:bg-[#3182F6]/10" />
                  {keepLogin && <span key="rip" className="absolute -inset-[9px] rounded-full bg-[#3182F6]/25" style={{ animation: "lgRipple .45s ease-out forwards" }} />}
                  <span className={`relative flex h-[22px] w-[22px] items-center justify-center rounded-[7px] border-2 transition-all duration-200 ${keepLogin ? "border-[#3182F6] bg-[#3182F6] scale-100" : "border-[#C9CED6] bg-white group-hover:border-[#3182F6]"}`}>
                    <svg viewBox="0 0 24 24" className="h-[15px] w-[15px]" fill="none" stroke="white" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M5 12.5l4.5 4.5L19 7.5" style={{ strokeDasharray: 24, strokeDashoffset: keepLogin ? 0 : 24, transition: "stroke-dashoffset .25s ease-out .05s" }} />
                    </svg>
                  </span>
                </span>
                <span className={`transition-colors ${keepLogin ? "text-[#191F28] font-semibold" : ""}`}>로그인 상태 유지</span>
              </label>
              <button type="button" onClick={() => { setResetMsg(null); setResetEmail(formData.email); setShowResetModal(true); }} className="font-semibold text-[#3182F6] hover:underline">
                비밀번호 찾기
              </button>
            </div>

            <button type="submit" disabled={loading}
              className="mt-3 flex h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-[#3182F6] text-[17px] font-bold text-white shadow-[0_8px_20px_rgba(49,130,246,0.25)] transition-all hover:bg-[#1B64DA] active:scale-[0.98] disabled:opacity-70">
              {loading ? (<><span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />확인 중…</>) : "로그인"}
            </button>
          </form>

          <div className="mt-10 lg:mt-[min(40px,4vh)] border-t border-[#F2F4F6] pt-7 lg:pt-[min(28px,3vh)] text-center">
            <p className="text-[14px] text-[#6B7684]">아직 계정이 없으신가요?</p>
            <button type="button" onClick={() => leaveTo("/signup")}
              className="mt-3 h-[52px] w-full rounded-2xl border-2 border-[#E5E8EB] text-[16px] font-bold text-[#191F28] transition-all hover:border-[#3182F6] hover:text-[#3182F6] active:scale-[0.98]">
              1개월 무료로 시작하기
            </button>
          </div>
        </div>
      </main>

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
                  onClick={() => { setShowResetModal(false); setResetMsg(null); }}
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
                {resetMsg && (
                  <p className={`flex items-start gap-1.5 text-[13px] font-semibold ${resetMsg.ok ? "text-[#00A661]" : "text-[#F04452]"}`}>
                    {resetMsg.ok ? <Check className="mt-0.5 h-4 w-4 shrink-0" /> : <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#F04452] text-[10px] font-black text-white">!</span>}
                    {resetMsg.text}
                  </p>
                )}
                {resetMsg?.ok ? (
                  <Button type="button" onClick={() => { setShowResetModal(false); setResetMsg(null); setResetEmail(""); }}
                    className="w-full rounded-xl py-6 bg-[#191F28] hover:bg-black text-white font-bold active:scale-[0.98] transition-all">확인</Button>
                ) : (
                <Button
                  type="submit"
                  disabled={resetLoading}
                  className="w-full rounded-xl py-6 bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md active:scale-[0.98] transition-all"
                >
                  {resetLoading ? "발송 중..." : "이메일 보내기"}
                </Button>
                )}
              </form>
            </div>
          </div>
        </div>
      )}
      <KakaoChannelButton />
    </div>
  );
}
