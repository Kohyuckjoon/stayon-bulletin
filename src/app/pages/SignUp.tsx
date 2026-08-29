import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card } from "../components/ui/card";
import { Smartphone, ArrowLeft, CheckCircle2, PartyPopper } from "lucide-react";
import { KakaoChannelButton } from "../components/KakaoChannelButton";

// Firebase 관련 임포트
import { auth, db } from "../../firebase";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc, writeBatch } from "firebase/firestore";
import { CONGREGATION_SIZES } from "../../utils/congregationSizes";

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.password !== formData.confirmPassword) {
      alert("비밀번호가 일치하지 않습니다.");
      return;
    }

    if (!formData.department) {
      alert("부서를 선택해주세요.");
      return;
    }

    if (!formData.congregationSize) {
      alert("성도 수를 선택해주세요.");
      return;
    }

    setLoading(true);

    try {
      const systemCheckId = `${formData.churchName.trim()}_${formData.department}`;
      const systemCheckRef = doc(db, "system_check", systemCheckId);
      const systemCheckSnap = await getDoc(systemCheckRef);

      if (systemCheckSnap.exists()) {
        alert("해당 교회의 해당 부서는 이미 등록되어 있습니다.");
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
        alert("이미 사용 중인 이메일입니다.");
      } else {
        alert("가입 중 오류가 발생했습니다: " + error.message);
      }
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-4 py-12 relative">
      <Card className="w-full max-w-md p-8 rounded-3xl border-0 shadow-xl relative z-10">
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            className="mb-4 rounded-full -ml-2 text-gray-500"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            돌아가기
          </Button>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center shadow-lg shadow-blue-200">
              <Smartphone className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">회원가입</h1>
          </div>
          <p className="text-gray-600">
            교회 부서별 스마트 주보 서비스를 시작하세요
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="churchName">교회명</Label>
              <Input
                id="churchName"
                placeholder="OO교회"
                value={formData.churchName}
                onChange={(e) => setFormData({ ...formData, churchName: e.target.value })}
                className="rounded-xl bg-gray-50 border-gray-100 focus:bg-white transition-all"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="department">부서 선택</Label>
              <select
                id="department"
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                className="flex h-10 w-full rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                required
              >
                <option value="">선택하세요</option>
                {DEPARTMENTS.map((dept) => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="congregationSize">
              <span className="text-gray-900">성도 수</span>
              <span className="text-gray-400 font-normal ml-1">(평균 예배 인원수를 선택해주세요)</span>
            </Label>
            <select
              id="congregationSize"
              value={formData.congregationSize}
              onChange={(e) => setFormData({ ...formData, congregationSize: e.target.value })}
              className="flex h-10 w-full rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
              required
            >
              <option value="">선택하세요</option>
              {CONGREGATION_SIZES.map((size) => (
                <option key={size.value} value={size.value}>{size.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="seniorPastorName">담임목사</Label>
            <Input
              id="seniorPastorName"
              placeholder="이름을 입력하세요"
              value={formData.seniorPastorName}
              onChange={(e) => setFormData({ ...formData, seniorPastorName: e.target.value })}
              className="rounded-xl bg-gray-50 border-gray-100 focus:bg-white transition-all"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="userName">가입자 성함</Label>
              <Input
                id="userName"
                placeholder="이름을 입력하세요"
                value={formData.userName}
                onChange={(e) => setFormData({ ...formData, userName: e.target.value })}
                className="rounded-xl bg-gray-50 border-gray-100 focus:bg-white transition-all"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="userRole">직분</Label>
              <Input
                id="userRole"
                placeholder="예: 부목사님, 전도사님, 간사님, 집사님 등"
                value={formData.userRole}
                onChange={(e) => setFormData({ ...formData, userRole: e.target.value })}
                className="rounded-xl bg-gray-50 border-gray-100 focus:bg-white transition-all"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone">연락처 (인증/복구용)</Label>
            <Input
              id="phone"
              type="tel"
              placeholder="010-0000-0000"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: formatPhoneNumber(e.target.value) })}
              maxLength={13}
              className="rounded-xl bg-gray-50 border-gray-100 focus:bg-white transition-all"
              required
            />
          </div>

          <hr className="my-4 border-gray-100" />

          <div className="space-y-1.5">
            <Label htmlFor="email">이메일 (아이디)</Label>
            <Input
              id="email"
              type="email"
              placeholder="example@church.com"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="rounded-xl bg-gray-50 border-gray-100 focus:bg-white transition-all"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="password">비밀번호</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="rounded-xl bg-gray-50 border-gray-100 focus:bg-white transition-all"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">비밀번호 확인</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                className="rounded-xl bg-gray-50 border-gray-100 focus:bg-white transition-all"
                required
              />
            </div>
          </div>

          <div className="pt-4">
            <Button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl py-7 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg shadow-blue-100 transition-all font-bold text-lg"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  등록 중...
                </span>
              ) : "무료로 시작하기"}
            </Button>
          </div>
        </form>

        <div className="mt-6 p-4 bg-amber-50/50 rounded-2xl border border-amber-100">
          <p className="text-[11px] text-amber-800 leading-relaxed text-center">
            ⚠️ <strong>알림:</strong> 동일 교회 부서의 중복 혜택 방지를 위해 탈퇴 후에도 등록 이력은 보존됩니다.
          </p>
        </div>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            이미 계정이 있으신가요?{" "}
            <button
              onClick={() => navigate("/login")}
              className="text-blue-600 hover:underline font-bold"
            >
              로그인
            </button>
          </p>
        </div>
      </Card>

      {/* --- 메테리얼 성공 팝업 (모달) --- */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
          <Card className="w-full max-w-sm p-8 rounded-[2.5rem] border-0 shadow-2xl flex flex-col items-center text-center animate-in zoom-in-95 duration-300">
            <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-6">
              <PartyPopper className="w-10 h-10 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold mb-2">가입을 환영합니다!</h2>
            <p className="text-gray-600 mb-8">
              지금부터 1개월 동안<br />
              <span className="font-bold text-blue-600">모든 프리미엄 기능</span>을<br />
              무료로 사용하실 수 있습니다.
            </p>
            <Button
              onClick={() => navigate("/admin")}
              className="w-full rounded-2xl py-6 bg-gray-900 hover:bg-black text-white font-bold"
            >
              시작하기
            </Button>
          </Card>
        </div>
      )}

      <KakaoChannelButton />
    </div>
  );
}
