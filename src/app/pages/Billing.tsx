import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { auth, db } from "../../firebase";
import { doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { ArrowLeft, CreditCard, Calendar, Loader2, Info, Trash2, ShieldCheck, Lock } from "lucide-react";
import { toast } from "sonner";
import { getPlanTierMeta, getExpiryInfo } from "../../utils/subscriptionTier";
import { useBillingKey } from "../../hooks/useBillingKey";

// 결제 관리(정기결제) 화면. /admin 하위 전용 페이지 — AdminDashboard.tsx의
// "연장 및 결제하기" 버튼 옆에 이 화면으로 가는 링크를 추가해서 연결한다.
//
// 카드 등록(빌링키 발급)은 useBillingKey.ts 훅으로 분리돼 있음. 그 훅 안의
// TODO 주석대로, NHN KCP 정기결제 채널이 승인·발급되면 channelKey를 그
// 채널 값으로 교체해야 실제로 작동한다 — 그 전까지는 카드 등록 버튼을 눌러도
// 포트원 쪽에서 채널 오류가 날 수 있음(PG 승인 전이라 당연한 상태).
//
// 카드가 등록되면 Firestore users/{uid}에 아래 필드들이 채워진다:
//   billingKey            - 포트원이 발급한 빌링키(토큰). 카드 원본 정보는 저장하지 않음
//   billingCardName       - 카드사명 (예: "신한카드")
//   billingCardLast4      - 카드 뒷자리 4자리 (마스킹 표시용)
//   billingKeyRegisteredAt- 등록 시각
//   subscriptionActive    - 정기결제 사용 중 여부(해지 시 false)
// 화면 잠금 토글 — PG 심사 때는 이 화면이 실제로 작동하는 상태로 보여야 해서
// true로 둠. 다시 잠그려면 false로(아래 잠금 UI 코드는 안 지움)
const PREVIEW_UNLOCKED = true;

export function Billing() {
  const navigate = useNavigate();
  const { requestIssueBillingKey, cancelSubscription } = useBillingKey();
  const [userData, setUserData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const refetchUserData = async (uid: string) => {
    try {
      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) setUserData(snap.data());
    } catch (error) {
      console.error("결제 정보 조회 실패:", error);
      toast.error("결제 정보를 불러오지 못했습니다.");
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        navigate("/login");
        return;
      }
      await refetchUserData(user.uid);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [navigate]);

  const planMeta = getPlanTierMeta(userData?.status);
  const expiry = userData ? getExpiryInfo(userData) : null;

  const hasBillingKey = !!userData?.billingKey;
  const subscriptionActive = hasBillingKey && userData?.subscriptionActive !== false;

  const handleRegisterCard = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setRegistering(true);
    try {
      await requestIssueBillingKey();
      await refetchUserData(uid); // 등록 성공 시 화면에 바로 반영
    } finally {
      setRegistering(false);
    }
  };

  // 참고: 자동 결제 자체(매달 실제로 긁는 것)는 서버의 스케줄 함수가 따로
  // 필요함 — 저장된 빌링키로 결제 주기가 된 사용자를 찾아 포트원 서버 API를
  // 호출하는 부분은 이 화면(클라이언트)이 아니라 functions 쪽에 추가해야 함.
  const handleCancelSubscription = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setCancelling(true);
    try {
      await cancelSubscription();
      await refetchUserData(uid);
    } finally {
      setCancelling(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="container mx-auto px-3 py-2.5 sm:px-4 sm:py-4">
          <div className="flex items-center gap-1 sm:gap-3 min-w-0">
            <Button
              variant="ghost"
              onClick={() => navigate("/admin")}
              aria-label="대시보드로 돌아가기"
              className="rounded-full shrink-0"
            >
              <ArrowLeft className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">대시보드</span>
            </Button>
            <h1 className="text-base sm:text-xl font-bold truncate">결제 관리</h1>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 sm:py-8 max-w-2xl space-y-5">
        {/* 현재 요금제 — 전체 페이지가 아직 준비중이라 섹션별로 잠금 처리 */}
        <Card className="relative p-5 sm:p-6 rounded-[1.75rem] border-0 bg-white shadow-sm overflow-hidden">
          {!PREVIEW_UNLOCKED && (
            <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-400 text-[9px] font-black uppercase tracking-wider whitespace-nowrap z-10">
              <Lock className="w-2.5 h-2.5" /> 준비중
            </div>
          )}
          <div className={PREVIEW_UNLOCKED ? "" : "opacity-50 grayscale-[0.6] pointer-events-none select-none"}>
            <h2 className="text-sm font-bold text-slate-400 mb-3">현재 요금제</h2>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-extrabold ${planMeta.chipClass} ${planMeta.textClass}`}>
                  {planMeta.icon ? <planMeta.icon className="w-3.5 h-3.5" /> : null} {planMeta.label}
                </span>
              </div>
              {expiry?.date && (
                <div className="flex items-center gap-1.5 text-xs sm:text-sm text-slate-500 font-medium">
                  <Calendar className="w-4 h-4" />
                  {expiry.isTrial ? "무료체험 만료일" : "이용 만료일"} {expiry.date.toLocaleDateString()}
                  {typeof expiry.daysLeft === "number" && (
                    <span className={expiry.daysLeft <= 7 ? "text-red-500 font-bold" : ""}>
                      (D{expiry.daysLeft >= 0 ? "-" : "+"}{Math.abs(expiry.daysLeft)})
                    </span>
                  )}
                </div>
              )}
            </div>
            <Button
              variant="outline"
              disabled={!PREVIEW_UNLOCKED}
              onClick={() => navigate("/admin/pricing")}
              className="w-full mt-4 rounded-xl font-bold text-slate-600 border-slate-200"
            >
              요금제 변경 / 1회 결제로 연장
            </Button>
          </div>
        </Card>

        {/* 등록된 카드 / 정기결제 */}
        <Card className="relative p-5 sm:p-6 rounded-[1.75rem] border-0 bg-white shadow-sm overflow-hidden">
          {!PREVIEW_UNLOCKED && (
            <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-400 text-[9px] font-black uppercase tracking-wider whitespace-nowrap z-10">
              <Lock className="w-2.5 h-2.5" /> 준비중
            </div>
          )}
          <div className={PREVIEW_UNLOCKED ? "" : "opacity-50 grayscale-[0.6] pointer-events-none select-none"}>
            <h2 className="text-sm font-bold text-slate-400 mb-3">정기결제 카드</h2>

            {hasBillingKey ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 rounded-2xl bg-slate-50 border border-slate-100">
                  <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-white shrink-0">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 text-sm">
                      {userData?.billingCardName || "등록된 카드"} •••• {userData?.billingCardLast4 || "••••"}
                    </p>
                    <p className="text-xs text-slate-400 font-medium">
                      {subscriptionActive ? "매달 자동으로 결제돼요" : "정기결제가 해지된 카드예요"}
                    </p>
                  </div>
                </div>

                {subscriptionActive && (
                  <Button
                    variant="outline"
                    onClick={handleCancelSubscription}
                    disabled={!PREVIEW_UNLOCKED || cancelling}
                    className="w-full rounded-xl font-bold text-red-500 border-red-200 hover:bg-red-50 flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" /> {cancelling ? "처리 중..." : "정기결제 해지"}
                  </Button>
                )}
              </div>
            ) : (
              <div className="text-center py-6">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                  <CreditCard className="w-6 h-6" />
                </div>
                <p className="text-sm text-slate-500 font-medium mb-5">등록된 카드가 없어요.</p>
                <Button
                  onClick={handleRegisterCard}
                  disabled={!PREVIEW_UNLOCKED || registering}
                  className="rounded-xl font-bold px-6 bg-blue-600 hover:bg-blue-700"
                >
                  {registering ? "처리 중..." : "카드 등록하기"}
                </Button>
              </div>
            )}

            <p className="text-[11px] text-slate-400 font-medium mt-4 flex items-start gap-1.5 leading-relaxed">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              카드 번호는 저희 서버에 저장되지 않아요. 결제 대행사(포트원)가 안전하게 보관해요.
            </p>
          </div>
        </Card>

        <div className="flex items-start gap-2 text-xs text-slate-400 font-medium px-1">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          정기결제는 현재 준비 중인 기능이에요. 지금은 /admin/pricing에서 1회 결제로만 이용하실 수 있어요.
        </div>
      </div>
    </div>
  );
}
