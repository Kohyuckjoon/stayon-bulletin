import { useState, useEffect } from "react";
import { useSmoothNavigate as useNavigate, preloadAdminPages } from "../../utils/smoothNavigate"; // 관리자 화면 사이 부드러운 이동(2026-11-25)
import { auth, db } from "../../firebase";
import { doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { Button } from "../components/ui/button";
import { ArrowLeft, Loader2, Info } from "lucide-react";
import { toast } from "sonner";
import { PlanBillingCard } from "../components/PlanBillingCard";
import { AnnualRequestButton } from "../components/AnnualRequest";
import { PaymentHistory, RefundTree, type PayInfo } from "../components/PaymentTree";
import { WineJars, isBulletinPlan } from "../components/WineJars";
import { getChurchSiteByOwner } from "../../utils/churchSite";

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
  useEffect(() => { preloadAdminPages(); }, []);
  const [userData, setUserData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  // 결제된 내역 + 1년 완납 환급 나무(2026-11-25, 홈페이지 편집 화면 요금제와 같은 부품) — 서버 myPayments(읽기 전용)에서 내 결제만
  const [payInfo, setPayInfo] = useState<PayInfo | null | "error">(null);
  const [siteSlug, setSiteSlug] = useState("");
  // 주보 요금제(베이직·스탠다드) 교회는 결제된 내역을 접어 둠 — 누를 때만 펼쳐 봄(영수증용, 2026-11-25)
  const [historyOpen, setHistoryOpen] = useState(false);

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
      getChurchSiteByOwner(user.uid).then((site) => setSiteSlug(site?.slug || "")).catch(() => {});
      try {
        const token = await user.getIdToken();
        const r = await fetch(`https://asia-northeast3-stayonsbplatform.cloudfunctions.net/myPayments?uid=${encodeURIComponent(user.uid)}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        setPayInfo(await r.json() as PayInfo);
      } catch (e) {
        console.error("결제 내역 불러오기 실패:", e);
        setPayInfo("error");
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  // 주보 플랫폼(이 화면)은 언제나 "물이 포도주로" 항아리, 홈페이지 플랫폼(홈페이지 편집 > 요금제)은 포도나무(2026-11-25 확정).
  // 셀프형·관리형 결제도 항아리를 채움. 결제된 내역은 접어 두고 눌러야 보임
  const showJars = true;

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

      {/* 넓은 화면: 왼쪽 요금제·정기결제·결제된 내역 / 오른쪽 환급 나무. 휴대폰은 위아래로 */}
      <div className="container mx-auto px-4 py-6 sm:py-8 max-w-5xl grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start">
      <div className="space-y-5 min-w-0">
        {/* 요금제 · 정기결제 — components/PlanBillingCard(홈페이지 편집 화면 요금제와 같은 부품) */}
        <PlanBillingCard userData={userData} onChanged={() => { const uid = auth.currentUser?.uid; if (uid) void refetchUserData(uid); }} />

        <div className="flex items-start gap-2 text-xs text-slate-400 font-medium px-1">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          정기결제는 요금제 화면에서 시작해요. 시작하는 날 첫 달이 바로 결제되고, 다음 달부터 같은 날 자동으로 결제돼요. 카드 변경·해지는 이 화면에서 할 수 있어요.
        </div>

        {showJars ? (
          // 주보 요금제: 기본은 접힘. 누르면 결제 내역·영수증이 펼쳐짐
          <div>
            <button type="button" onClick={() => setHistoryOpen((v) => !v)} aria-expanded={historyOpen}
              className="mx-auto flex items-center gap-1 rounded-full px-3 py-1.5 text-[12.5px] font-bold text-slate-400 hover:bg-white hover:text-slate-600">
              결제 내역 · 영수증 보기 <span className={`transition-transform ${historyOpen ? "rotate-180" : ""}`}>▾</span>
            </button>
            {historyOpen && <div className="mt-2 animate-in fade-in slide-in-from-top-1 duration-200"><PaymentHistory info={payInfo} /></div>}
          </div>
        ) : (
          <PaymentHistory info={payInfo} />
        )}
      </div>
      <div className="min-w-0 lg:sticky lg:top-6">
        {/* 주보 요금제(베이직·스탠다드)는 "물이 포도주로" 항아리, 셀프형·관리형은 홈페이지 포도나무.
            테스트(운영자): ?refundTest=basic|standard → 항아리 / pro|lite|max → 포도나무 */}
        {(() => {
          return showJars
            ? <>
                {/* 1년치 한 번에 결제 신청(계좌이체, 11개월 값) — 항아리 바로 위 */}
                <AnnualRequestButton ownerId={auth.currentUser?.uid || null} churchName={String(userData?.churchName || "")}
                  plans={["basic", "standard", "pro", "lite", "max"]} currentAmount={Number(userData?.billingAmount || 0)}
                  recurringActive={!!userData?.billingKey && userData?.subscriptionActive === true && !!userData?.billingAmount} />
                <WineJars info={payInfo} ownerId={auth.currentUser?.uid || null} churchName={String(userData?.churchName || "")} />
              </>
            : <RefundTree info={payInfo} ownerId={auth.currentUser?.uid || null} slug={siteSlug} churchName={String(userData?.churchName || "")} />;
        })()}
      </div>
      </div>
    </div>
  );
}
