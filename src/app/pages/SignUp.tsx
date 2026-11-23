import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Eye, EyeOff, Check } from "lucide-react";
import { KakaoChannelButton } from "../components/KakaoChannelButton";
import { AuthShowcase } from "../components/AuthShowcase";

// Firebase 관련 임포트
import { auth, db } from "../../firebase";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc, writeBatch } from "firebase/firestore";
import { CONGREGATION_SIZES } from "../../utils/congregationSizes";
import { isWebsiteHost } from "../../utils/websiteHost";

// 회원가입(2026-11-13 디자인 개편): 로그인 화면과 같은 좌우 분할(왼쪽 AuthShowcase) + 오른쪽 3단계 폼
//   ① 교회 정보(교회명·부서·성도 수·담임목사) ② 가입자 정보(성함·직분·연락처) ③ 계정 만들기(이메일·비밀번호)
// 부서·성도 수는 드롭다운 대신 버튼으로 고르기, 오류는 알림창 대신 입력칸 아래 빨간 글씨.
// 가입 처리(같은 교회·부서 중복 확인 → 계정 생성 → users·system_check·mail_triggers 저장)는 예전과 똑같음.

// 숫자만 입력해도 000-0000-0000 형태로 하이픈을 자동으로 붙여주는 포맷터
const formatPhoneNumber = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 11); // 숫자만 남기고 최대 11자리로 제한
  if (digits.length < 4) return digits;
  if (digits.length < 8) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
};

// 부서 리스트 정의
const DEPARTMENTS = [
  "장년부", "청년1부", "청년2부", "청년부", "대학청년부",
  "중등부", "고등부", "중고등부", "초등부", "유치부",
  "유초등부", "영아부"
];

const STEPS = ["교회 정보", "가입자 정보", "계정 만들기"];

// 입력칸 공통 스타일(로그인 화면과 같음): 연한 회색 → 포커스 시 흰 바탕 + 파란 테두리
const field = "w-full h-[52px] rounded-2xl border-2 border-transparent bg-[#F2F4F6] px-4 text-[16px] text-[#191F28] placeholder:text-[#B0B8C1] outline-none transition-all duration-200 focus:bg-white focus:border-[#3182F6]";
const errField = { borderColor: "#F04452", background: "#fff" };

const FieldLabel = ({ htmlFor, children, hint }: { htmlFor?: string; children: React.ReactNode; hint?: string }) => (
  <label htmlFor={htmlFor} className="mb-2 block text-[13px] font-bold text-[#4E5968]">
    {children}{hint && <span className="ml-1.5 font-medium text-[#8B95A1]">{hint}</span>}
  </label>
);
const ErrorText = ({ text }: { text?: string }) => text ? (
  <p className="mt-2 flex items-center gap-1.5 text-[13px] font-semibold text-[#F04452]" style={{ animation: "suShake .35s ease-in-out" }}>
    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#F04452] text-[10px] font-black text-white">!</span>{text}
  </p>
) : null;
// 버튼으로 고르기(부서·성도 수)
const Chip = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button type="button" onClick={onClick}
    className={`relative rounded-xl border-2 px-3 py-2.5 text-[14px] font-bold transition-all duration-200 active:scale-95 ${on ? "border-[#3182F6] bg-[#E8F3FF] text-[#1B64DA]" : "border-transparent bg-[#F2F4F6] text-[#4E5968] hover:bg-[#E8EBED]"}`}>
    {children}
    {on && <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#3182F6] shadow" style={{ animation: "suPop .25s cubic-bezier(.2,0,0,1)" }}><Check className="h-3 w-3 text-white" strokeWidth={3} /></span>}
  </button>
);

export function SignUp() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false); // 성공 팝업 상태
  const [formData, setFormData] = useState({
    churchName: "",
    department: "",
    congregationSize: "",
    seniorPastorName: "",
    userName: "",
    userRole: "",
    email: "",
    password: "",
    confirmPassword: "",
    phone: ""
  });
  const set = (k: keyof typeof formData) => (v: string) => { setFormData((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: "" })); };

  // 단계·오류·비밀번호 보기·화면 전환
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1); // 단계 넘어가는 방향(애니메이션용)
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [shown, setShown] = useState(false);
  useEffect(() => { const r = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(r); }, []);
  const leaveTo = (to: string) => { setLeaving(true); setTimeout(() => { navigate(to); window.scrollTo(0, 0); }, 380); };

  // 단계별 확인(빈칸 등) — 통과하면 true
  const validate = (s: number) => {
    const e: Record<string, string> = {};
    if (s === 0) {
      if (!formData.churchName.trim()) e.churchName = "교회 이름을 입력해 주세요.";
      if (!formData.department) e.department = "부서를 골라 주세요.";
      if (!formData.congregationSize) e.congregationSize = "성도 수를 골라 주세요.";
      if (!formData.seniorPastorName.trim()) e.seniorPastorName = "담임목사님 성함을 입력해 주세요.";
    } else if (s === 1) {
      if (!formData.userName.trim()) e.userName = "성함을 입력해 주세요.";
      if (!formData.userRole.trim()) e.userRole = "직분을 입력해 주세요.";
      if (formData.phone.replace(/\D/g, "").length < 9) e.phone = "연락처를 끝까지 입력해 주세요.";
    } else {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) e.email = "이메일 형식이 올바르지 않아요.";
      if (formData.password.length < 6) e.password = "비밀번호는 6자 이상으로 만들어 주세요.";
      if (formData.password !== formData.confirmPassword) e.confirmPassword = "비밀번호가 일치하지 않아요.";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };
  const next = () => { if (!validate(step)) return; setFormError(""); setDir(1); setStep((s) => s + 1); };
  const prev = () => { setFormError(""); setDir(-1); setStep((s) => s - 1); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step < 2) { next(); return; } // 마지막 단계 전에는 Enter 누르면 다음 단계로
    if (!validate(2)) return;

    if (formData.password !== formData.confirmPassword) {
      setErrors((x) => ({ ...x, confirmPassword: "비밀번호가 일치하지 않아요." }));
      return;
    }

    if (!formData.department) {
      setFormError("부서를 선택해 주세요."); setDir(-1); setStep(0);
      return;
    }

    if (!formData.congregationSize) {
      setFormError("성도 수를 선택해 주세요."); setDir(-1); setStep(0);
      return;
    }

    setLoading(true);
    setFormError("");

    try {
      const systemCheckId = `${formData.churchName.trim()}_${formData.department}`;
      const systemCheckRef = doc(db, "system_check", systemCheckId);
      const systemCheckSnap = await getDoc(systemCheckRef);

      if (systemCheckSnap.exists()) {
        setFormError("해당 교회의 해당 부서는 이미 등록되어 있어요. 1:1 문의로 도와드릴게요.");
        setLoading(false);
        return;
      }

      const userCredential = await createUserWithEmailAndPassword(
        auth,
        formData.email,
        formData.password
      );
      const uid = userCredential.user.uid;

      const batch = writeBatch(db);
      const userRef = doc(db, "users", uid);

      const formattedDate = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

      batch.set(userRef, {
        uid,
        email: formData.email,
        churchName: formData.churchName,
        department: formData.department,
        congregationSize: formData.congregationSize,
        seniorPastorName: formData.seniorPastorName,
        userName: formData.userName,
        userRole: formData.userRole,
        phone: formData.phone,
        createdAt: new Date().toISOString(),
        isTrialUsed: true,
        currentBulletinId: null,
        status: "active"
      });

      batch.set(systemCheckRef, {
        registeredUid: uid,
        churchName: formData.churchName,
        department: formData.department
      });

      const mailTriggerRef = doc(db, "mail_triggers", uid);
      batch.set(mailTriggerRef, {
        type: "JOIN",
        churchName: formData.churchName,
        department: formData.department,
        congregationSize: formData.congregationSize,
        seniorPastorName: formData.seniorPastorName,
        userName: formData.userName,
        userRole: formData.userRole,
        phone: formData.phone,
        email: formData.email,
        date: formattedDate,
        createdAt: new Date().toISOString()
      });

      await batch.commit();

      // alert 대신 팝업 띄우기
      setShowSuccessModal(true);

    } catch (error: any) {
      console.error(error);
      if (error.code === "auth/email-already-in-use") {
        setErrors((x) => ({ ...x, email: "이미 사용 중인 이메일이에요. 로그인해 주세요." }));
      } else if (error.code === "auth/weak-password") {
        setErrors((x) => ({ ...x, password: "비밀번호는 6자 이상으로 만들어 주세요." }));
      } else if (error.code === "auth/invalid-email") {
        setErrors((x) => ({ ...x, email: "이메일 형식이 올바르지 않아요." }));
      } else {
        setFormError("가입 중 문제가 생겼어요. (" + (error.code || error.message) + ")");
      }
      setLoading(false);
    }
  };

  const pwMatch = formData.confirmPassword.length > 0 && formData.password === formData.confirmPassword;

  return (
    <div className={`min-h-screen lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] bg-white font-sans transition-opacity duration-[420ms] ease-out ${shown && !leaving ? "opacity-100" : "opacity-0"}`}>
      <style>{`
        @keyframes suShake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}
        @keyframes suPop{from{transform:scale(0)}to{transform:scale(1)}}
        @keyframes suInR{from{opacity:0;transform:translateX(28px)}to{opacity:1;transform:translateX(0)}}
        @keyframes suInL{from{opacity:0;transform:translateX(-28px)}to{opacity:1;transform:translateX(0)}}
      `}</style>

      <AuthShowcase onHome={() => leaveTo("/")} />

      {/* 오른쪽: 3단계 가입 폼 */}
      <main className="relative flex min-h-screen flex-col px-5 sm:px-10 py-6 sm:py-10 lg:px-16">
        <button type="button" onClick={() => (step > 0 ? prev() : leaveTo("/"))}
          className="flex w-fit items-center gap-1.5 rounded-full px-3 py-2 -ml-3 text-sm font-semibold text-[#4E5968] transition-colors hover:bg-[#F2F4F6]">
          <ArrowLeft className="h-4 w-4" /> {step > 0 ? "이전 단계" : "돌아가기"}
        </button>

        <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-8">
          <h1 className="text-[28px] sm:text-[30px] font-black tracking-tight text-[#191F28]">1개월 무료로 시작해요 🎉</h1>
          <p className="mt-2 text-[15px] text-[#6B7684]">교회 부서별 스마트 주보 서비스를 시작하세요</p>

          {/* 진행 표시: ①──②──③ */}
          <div className="mt-8 flex items-center">
            {STEPS.map((label, i) => {
              const done = i < step, cur = i === step;
              return (
                <div key={label} className={`flex items-center ${i < STEPS.length - 1 ? "flex-1" : ""}`}>
                  <div className="flex flex-col items-center gap-1.5">
                    <span className={`flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-black transition-all duration-300 ${done ? "bg-[#3182F6] text-white" : cur ? "bg-[#3182F6] text-white ring-4 ring-[#3182F6]/20" : "bg-[#F2F4F6] text-[#B0B8C1]"}`}>
                      {done ? <Check className="h-4 w-4" strokeWidth={3} /> : i + 1}
                    </span>
                    <span className={`text-[12px] font-bold whitespace-nowrap ${cur ? "text-[#191F28]" : done ? "text-[#3182F6]" : "text-[#B0B8C1]"}`}>{label}</span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className="mx-2 mb-5 h-[3px] flex-1 overflow-hidden rounded-full bg-[#F2F4F6]">
                      <div className="h-full rounded-full bg-[#3182F6] transition-all duration-500" style={{ width: done ? "100%" : "0%" }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <form onSubmit={handleSubmit} className="mt-8" noValidate>
            {/* 단계 화면 — 넘어갈 때 옆으로 밀리듯 바뀜 */}
            <div key={step} className="space-y-5" style={{ animation: `${dir > 0 ? "suInR" : "suInL"} .4s cubic-bezier(.2,0,0,1) both` }}>
              {step === 0 && (
                <>
                  <div>
                    <FieldLabel htmlFor="churchName">교회명</FieldLabel>
                    <input id="churchName" autoFocus placeholder="ex. 새벽교회" value={formData.churchName} onChange={(e) => set("churchName")(e.target.value)}
                      className={field} style={errors.churchName ? errField : undefined} />
                    <ErrorText text={errors.churchName} />
                  </div>
                  <div>
                    <FieldLabel>부서</FieldLabel>
                    <div className="grid grid-cols-3 gap-2">
                      {DEPARTMENTS.map((d) => <Chip key={d} on={formData.department === d} onClick={() => set("department")(d)}>{d}</Chip>)}
                    </div>
                    <ErrorText text={errors.department} />
                  </div>
                  <div>
                    <FieldLabel hint="평균 예배 인원수">성도 수</FieldLabel>
                    <div className="grid grid-cols-2 gap-2">
                      {CONGREGATION_SIZES.map((sz) => <Chip key={sz.value} on={formData.congregationSize === sz.value} onClick={() => set("congregationSize")(sz.value)}>{sz.label}</Chip>)}
                    </div>
                    <ErrorText text={errors.congregationSize} />
                  </div>
                  <div>
                    <FieldLabel htmlFor="seniorPastorName">담임목사</FieldLabel>
                    <input id="seniorPastorName" placeholder="성함을 입력하세요" value={formData.seniorPastorName} onChange={(e) => set("seniorPastorName")(e.target.value)}
                      className={field} style={errors.seniorPastorName ? errField : undefined} />
                    <ErrorText text={errors.seniorPastorName} />
                  </div>
                </>
              )}

              {step === 1 && (
                <>
                  <div>
                    <FieldLabel htmlFor="userName">가입자 성함</FieldLabel>
                    <input id="userName" autoFocus placeholder="성함을 입력하세요" value={formData.userName} onChange={(e) => set("userName")(e.target.value)}
                      className={field} style={errors.userName ? errField : undefined} />
                    <ErrorText text={errors.userName} />
                  </div>
                  <div>
                    <FieldLabel htmlFor="userRole">직분</FieldLabel>
                    <input id="userRole" placeholder="ex. 부목사, 전도사, 간사, 집사" value={formData.userRole} onChange={(e) => set("userRole")(e.target.value)}
                      className={field} style={errors.userRole ? errField : undefined} />
                    <ErrorText text={errors.userRole} />
                  </div>
                  <div>
                    <FieldLabel htmlFor="phone" hint="인증·계정 찾기용">연락처</FieldLabel>
                    <input id="phone" type="tel" inputMode="numeric" placeholder="010-0000-0000" maxLength={13} value={formData.phone}
                      onChange={(e) => set("phone")(formatPhoneNumber(e.target.value))}
                      className={field} style={errors.phone ? errField : undefined} />
                    <ErrorText text={errors.phone} />
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <div>
                    <FieldLabel htmlFor="email" hint="로그인 아이디">이메일</FieldLabel>
                    <input id="email" type="email" autoFocus autoComplete="email" placeholder="example@church.com" value={formData.email} onChange={(e) => set("email")(e.target.value)}
                      className={field} style={errors.email ? errField : undefined} />
                    <ErrorText text={errors.email} />
                  </div>
                  <div>
                    <FieldLabel htmlFor="password" hint="6자 이상">비밀번호</FieldLabel>
                    <div className="relative">
                      <input id="password" type={showPw ? "text" : "password"} autoComplete="new-password" placeholder="비밀번호 입력" value={formData.password} onChange={(e) => set("password")(e.target.value)}
                        className={`${field} pr-12`} style={errors.password ? errField : undefined} />
                      <button type="button" aria-label={showPw ? "비밀번호 숨기기" : "비밀번호 보기"} onClick={() => setShowPw((v) => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full text-[#8B95A1] transition-colors hover:bg-[#E5E8EB] hover:text-[#4E5968]">
                        {showPw ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                      </button>
                    </div>
                    <ErrorText text={errors.password} />
                  </div>
                  <div>
                    <FieldLabel htmlFor="confirmPassword">비밀번호 확인</FieldLabel>
                    <input id="confirmPassword" type={showPw ? "text" : "password"} autoComplete="new-password" placeholder="한 번 더 입력" value={formData.confirmPassword} onChange={(e) => set("confirmPassword")(e.target.value)}
                      className={field} style={errors.confirmPassword ? errField : pwMatch ? { borderColor: "#00A661", background: "#fff" } : undefined} />
                    {/* 입력하는 동안 일치 여부 바로 표시 */}
                    {errors.confirmPassword ? <ErrorText text={errors.confirmPassword} /> : formData.confirmPassword && (
                      pwMatch
                        ? <p className="mt-2 flex items-center gap-1.5 text-[13px] font-semibold text-[#00A661]"><Check className="h-4 w-4" strokeWidth={3} /> 비밀번호가 일치해요</p>
                        : <p className="mt-2 text-[13px] font-semibold text-[#8B95A1]">비밀번호가 아직 일치하지 않아요</p>
                    )}
                  </div>
                  <p className="rounded-2xl bg-[#FFF8E6] px-4 py-3 text-[12px] leading-relaxed text-[#8A5A00]">
                    같은 교회·부서의 중복 혜택을 막기 위해, 탈퇴 후에도 등록 이력은 보존돼요.
                  </p>
                </>
              )}
            </div>

            {formError && (
              <div className="mt-5 flex items-start gap-2 rounded-2xl bg-[#FFEEEE] px-4 py-3 text-[13px] font-semibold text-[#F04452]" style={{ animation: "suShake .35s ease-in-out" }}>
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#F04452] text-[10px] font-black text-white">!</span>{formError}
              </div>
            )}

            <div className="mt-7 flex gap-2">
              {step > 0 && (
                <button type="button" onClick={prev}
                  className="h-[56px] w-[96px] shrink-0 rounded-2xl bg-[#F2F4F6] text-[16px] font-bold text-[#4E5968] transition-all hover:bg-[#E8EBED] active:scale-[0.98]">이전</button>
              )}
              <button type="submit" disabled={loading}
                className="flex h-[56px] flex-1 items-center justify-center gap-2 rounded-2xl bg-[#3182F6] text-[17px] font-bold text-white shadow-[0_8px_20px_rgba(49,130,246,0.25)] transition-all hover:bg-[#1B64DA] active:scale-[0.98] disabled:opacity-70">
                {loading ? (<><span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />등록 중…</>) : step < 2 ? "다음" : "무료로 시작하기"}
              </button>
            </div>
          </form>

          <p className="mt-8 text-center text-[14px] text-[#6B7684]">
            이미 계정이 있으신가요?{" "}
            <button type="button" onClick={() => leaveTo("/login")} className="font-bold text-[#3182F6] hover:underline">로그인</button>
          </p>
        </div>
      </main>

      {/* --- 가입 완료 팝업(2026-11-13 새 디자인): 로그인·가입 화면과 같은 남색·파랑 톤
          위: 남색 그라데이션 + 빛나는 원 + 흰 원 안에 체크가 그려짐 / 가운데: 교회 이름 환영 + 무료 기간(끝나는 날짜)
          + 혜택 3가지 / 아래: 파란 "주보 만들러 가기". 뜰 때 종이 꽃가루가 터짐 --- */}
      {/* website 주소에서 가입하면 "교회 사이트 만들러 가기" → 홈페이지 편집 화면(로그인 이어서 bulletin으로 넘어감, routes.tsx) (2026-11-19) */}
      {showSuccessModal && <WelcomePopup churchName={formData.churchName.trim()} forWebsite={isWebsiteHost()}
        onStart={() => leaveTo(isWebsiteHost() ? "/website-builder" : "/admin")} />}

      <KakaoChannelButton />
    </div>
  );
}

// 가입 완료 팝업
function WelcomePopup({ churchName, onStart, forWebsite }: { churchName: string; onStart: () => void; forWebsite?: boolean }) {
  const end = new Date(); end.setMonth(end.getMonth() + 1);
  const endText = `${end.getFullYear()}. ${String(end.getMonth() + 1).padStart(2, "0")}. ${String(end.getDate()).padStart(2, "0")}`;
  useEffect(() => {
    let stop = false;
    import("canvas-confetti").then(({ default: confetti }) => {
      if (stop) return;
      const colors = ["#3182F6", "#6EA8FF", "#FFFFFF", "#FFD66B", "#A5C8FF"];
      confetti({ particleCount: 110, spread: 75, startVelocity: 42, origin: { y: 0.32 }, colors, zIndex: 200 });
      window.setTimeout(() => !stop && confetti({ particleCount: 60, angle: 60, spread: 60, origin: { x: 0, y: 0.6 }, colors, zIndex: 200 }), 250);
      window.setTimeout(() => !stop && confetti({ particleCount: 60, angle: 120, spread: 60, origin: { x: 1, y: 0.6 }, colors, zIndex: 200 }), 400);
    }).catch(() => {});
    return () => { stop = true; };
  }, []);
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-5" role="dialog" aria-modal="true">
      <style>{`
        @keyframes wpScrim{from{opacity:0}to{opacity:1}}
        @keyframes wpCard{from{opacity:0;transform:translateY(18px) scale(.94)}to{opacity:1;transform:translateY(0) scale(1)}}
        @keyframes wpBadge{0%{transform:scale(.3);opacity:0}60%{transform:scale(1.1);opacity:1}100%{transform:scale(1)}}
        @keyframes wpCheck{from{stroke-dashoffset:30}to{stroke-dashoffset:0}}
        @keyframes wpPulse{0%{transform:scale(1);opacity:.55}100%{transform:scale(1.9);opacity:0}}
        @keyframes wpUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
      `}</style>
      <div className="absolute inset-0 bg-[#0B1220]/55 backdrop-blur-[3px]" style={{ animation: "wpScrim .25s ease-out both" }} />
      <div className="relative w-full max-w-[380px] overflow-hidden rounded-[30px] bg-white shadow-[0_30px_60px_rgba(11,18,32,.35)]"
        style={{ animation: "wpCard .45s cubic-bezier(.2,0,0,1) both" }}>
        {/* 위: 남색 그라데이션 + 빛 */}
        <div className="relative h-[132px] bg-gradient-to-br from-[#0F1B33] via-[#17305C] to-[#3182F6]">
          <div className="absolute -left-10 -top-10 h-40 w-40 rounded-full bg-[#6EA8FF]/30 blur-2xl" />
          <div className="absolute -right-8 bottom-0 h-32 w-32 rounded-full bg-[#3182F6]/40 blur-2xl" />
          <p className="relative pt-6 text-center text-[11px] font-bold tracking-[0.3em] text-blue-200/90">WELCOME TO STAYON</p>
        </div>
        {/* 가운데 배지: 흰 원 + 체크(물결처럼 퍼지는 테두리) */}
        <div className="relative -mt-12 flex justify-center">
          <span className="absolute h-24 w-24 rounded-full bg-[#3182F6]/40" style={{ animation: "wpPulse 1.6s ease-out .6s infinite" }} />
          <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-white shadow-[0_10px_30px_rgba(49,130,246,.35)]" style={{ animation: "wpBadge .55s cubic-bezier(.2,0,0,1) .15s both" }}>
            <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-gradient-to-br from-[#4D94FF] to-[#1B64DA]">
              <svg viewBox="0 0 24 24" className="h-9 w-9" fill="none" stroke="white" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12.5l4.5 4.5L19 7.5" style={{ strokeDasharray: 30, animation: "wpCheck .45s ease-out .55s both" }} />
              </svg>
            </div>
          </div>
        </div>
        <div className="px-7 pb-7 pt-5 text-center">
          <h2 className="text-[23px] font-black leading-snug tracking-tight text-[#191F28] break-keep" style={{ animation: "wpUp .4s ease-out .5s both" }}>
            {churchName ? <>{churchName},<br />가입을 환영해요!</> : "가입을 환영해요!"}
          </h2>
          <p className="mt-2 text-[15px] text-[#6B7684]" style={{ animation: "wpUp .4s ease-out .6s both" }}>
            지금부터 <b className="text-[#3182F6]">1개월 동안 모든 기능</b>을 무료로 써 보세요
          </p>
          {/* 무료 기간 */}
          <div className="mt-5 rounded-2xl bg-[#F2F7FF] px-4 py-3.5" style={{ animation: "wpUp .4s ease-out .7s both" }}>
            <p className="text-[12px] font-bold text-[#6B7684]">무료 이용 기간</p>
            <p className="mt-0.5 text-[17px] font-black tabular-nums text-[#1B64DA]">오늘 ~ {endText}</p>
          </div>
          {/* 혜택 3가지 */}
          <ul className="mt-4 grid grid-cols-3 gap-2" style={{ animation: "wpUp .4s ease-out .8s both" }}>
            {["모든 기능\n무료", "카드 등록\n없이", "언제든\n해지 가능"].map((t) => (
              <li key={t} className="flex flex-col items-center gap-1.5 rounded-2xl border border-[#E5E8EB] px-2 py-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#E8F3FF]"><Check className="h-3.5 w-3.5 text-[#3182F6]" strokeWidth={3} /></span>
                <span className="whitespace-pre-line text-[12px] font-bold leading-tight text-[#4E5968]">{t}</span>
              </li>
            ))}
          </ul>
          <button type="button" autoFocus onClick={onStart}
            className="mt-6 flex h-[56px] w-full items-center justify-center gap-1.5 rounded-2xl bg-[#3182F6] text-[17px] font-bold text-white shadow-[0_10px_24px_rgba(49,130,246,.3)] transition-all hover:bg-[#1B64DA] active:scale-[0.98]"
            style={{ animation: "wpUp .4s ease-out .9s both" }}>
            {forWebsite ? "교회 사이트 만들러 가기" : "주보 만들러 가기"} <span aria-hidden>→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
