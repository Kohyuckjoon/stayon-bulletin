import { useState, useEffect } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router";
import { auth, db } from "../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Checkbox } from "../components/ui/checkbox";
import { motion } from "framer-motion";
import {
  Check, ArrowLeft, Sparkles, Info, User, LogIn, Lock, MessageCircle, Clock, Calendar, Rocket,
  RefreshCcw, ShieldCheck,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "../components/ui/dialog";
import { usePayment } from "../../hooks/usePayment";
import { useWebsitePayment } from "../../hooks/useWebsitePayment";
// 주의: 아래 정기결제(빌링키) 훅은 usePayment.ts(기존 단건 결제)와 완전히
// 분리된 신규 기능이다. 단건 결제 쪽 코드/흐름은 이 작업에서 전혀 건드리지 않음.
import { useBillingKey, addMonthsClamped } from "../../hooks/useBillingKey";
// "앞으로 이런 요금제로 확장돼요" 미리보기 전용 — 교회 규모(성도 수)별로
// 베이직/스탠다드/프로/올인원 가격이 다르게 뜨도록 통합한 매트릭스
import { PRICING_MATRIX, type FeaturePlanKey } from "../../utils/pricingMatrix";
import { KakaoChannelButton, KAKAO_CHANNEL_URL } from "../components/KakaoChannelButton";
import { PRICING_TIERS } from "../../utils/pricingTiers";
import { setLoginReturnTo } from "../../utils/loginReturn";
import { getChurchSiteByOwner, ChurchSite } from "../../utils/churchSite";
import { toast } from "sonner";

export function Pricing() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { requestPayment } = usePayment();
  const { requestWebsitePayment } = useWebsitePayment();
  const { requestIssueBillingKey, startRecurringWithSavedCard } = useBillingKey();

  const [showTrialDialog, setShowTrialDialog] = useState(false);
  const [showLoginGuardDialog, setShowLoginGuardDialog] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // 정기결제(빌링키 등록) 전용 상태 — 기존 1회성 결제(showTrialDialog 등)와는
  // 완전히 별도 흐름. 아래로 내려갈수록 등장하는 "정기결제 카드" 전용.
  const [showRecurringDialog, setShowRecurringDialog] = useState(false);
  const [recurringAgreed, setRecurringAgreed] = useState(false);
  const [registeringRecurring, setRegisteringRecurring] = useState(false);

  // 실제 결제 카드 영역(대표 요금제) 전용 — 교회 규모(featuredTier)는 그대로
  // 자동 고정이고, 여기에 "요금제(기능 등급)"를 사람이 직접 고를 수 있게
  // 추가. 기본값 "basic"은 지금 실제로 결제되는 금액(PRICING_TIERS)과
  // 동일한 숫자라 기존 결제 흐름과 충돌 없이 자연스럽게 이어진다.
  const [selectedFeaturePlan, setSelectedFeaturePlan] = useState<FeaturePlanKey>("basic");
  const [currentUserInfo, setCurrentUserInfo] = useState<{
    email: string; churchName: string; status: string; uid: string; congregationSize: string;
    hasBillingKey: boolean; // 결제 관리에서 이미 등록한 정기결제 카드가 있는지
    recurringActive: boolean; // 이미 정기결제 중인지(요금제·금액까지 걸려 있음)
  } | null>(null);

  // 홈페이지 제작 탭 전용: 로그인한 회원이 소유한 교회 사이트(있어야 결제로 이용 기간을 연장할 수 있음)
  const [websiteSite, setWebsiteSite] = useState<ChurchSite | null>(null);
  const [websitePaying, setWebsitePaying] = useState(false);

  const isAdminPath = location.pathname.startsWith("/admin");

  // /pricing?tab=website 로 들어오면 홈페이지 제작 탭이 바로 보이도록 (예: /website-offer의 리다이렉트).
  // 파라미터가 없으면 기존과 동일하게 주보 서비스 탭이 기본값
  const activeTab: "bulletin" | "website" = searchParams.get("tab") === "website" ? "website" : "bulletin";
  const setActiveTab = (tab: "bulletin" | "website") => {
    setSearchParams(tab === "website" ? { tab: "website" } : {}, { replace: true });
  };

  // 로그인 안 된 경우: website-create(로그인 필요) 흐름으로 보냄
  const handleWebsiteFreeStart = () => {
    setLoginReturnTo("/website-offer");
    navigate("/website-create");
  };

  // 로그인은 했지만 아직 만든 사이트가 없는 경우: 결제로 연장할 대상이 없으므로 먼저 사이트 생성 유도
  const handleWebsiteNeedsSite = () => {
    navigate("/website-create");
  };

  // 로그인 + 사이트 보유 상태에서 실제 결제 진행. 주보 결제(usePayment)와는 완전히 분리된
  // useWebsitePayment를 사용 — 성공 시 churchSites/{slug}.accessExpiresAt만 연장하고
  // users/{uid}(주보 구독 정보)는 건드리지 않음
  const handleWebsitePayment = async (planName: string, amount: number, months: 1 | 3) => {
    if (!websiteSite) return;
    setWebsitePaying(true);
    try {
      await requestWebsitePayment({
        planName,
        amount,
        months,
        slug: websiteSite.slug,
        buyerEmail: currentUserInfo?.email,
        buyerName: currentUserInfo?.churchName,
      });
    } finally {
      setWebsitePaying(false);
    }
  };

  // 로그인한 회원이 소유한 교회 사이트를 조회 (결제로 연장할 대상이 있는지 확인용)
  useEffect(() => {
    if (!currentUserInfo?.uid) {
      setWebsiteSite(null);
      return;
    }
    getChurchSiteByOwner(currentUserInfo.uid).then(setWebsiteSite).catch(() => setWebsiteSite(null));
  }, [currentUserInfo?.uid]);

  // 푸터의 "환불 정책" 버튼이 /pricing#refund로 이동시키면, 로딩 끝난 뒤
  // 해당 섹션까지 부드럽게 스크롤한다. 같은 페이지 안 앵커 클릭과 달리
  // 다른 페이지에서 라우팅해 들어오는 경우라 수동으로 처리해줘야 함.
  useEffect(() => {
    if (loading || location.hash !== "#refund") return;
    const el = document.getElementById("refund");
    if (el) {
      const t = setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
      return () => clearTimeout(t);
    }
  }, [loading, location.hash]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userRef);
        if (userDoc.exists()) {
          const data = userDoc.data();
          setCurrentUserInfo({
            email: user.email || "",
            churchName: data.churchName || "정보 없음",
            status: data.status || "active",
            uid: user.uid,
            congregationSize: data.congregationSize || "",
            hasBillingKey: !!data.billingKey,
            recurringActive: !!data.billingKey && data.subscriptionActive === true && !!data.billingAmount,
          });
        }
      } else {
        setCurrentUserInfo(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 티어별 카드 그라데이션 (결제 금액과는 무관한 순수 UI 설정)
  const TIER_GRADIENT: Record<string, string> = {
    "개척": "from-slate-500 to-slate-600",
    "독립": "from-cyan-500 to-blue-500",
    "성장": "from-blue-500 to-blue-600",
    "번성": "from-indigo-600 to-purple-600",
    "대형": "from-purple-700 to-slate-900"
  };

  const commonFeatures = [
    "무제한 모바일 주보 발행", "교회 소식 실시간 동기화", "주보 히스토리 자동 저장", "프리미엄 주보 디자인 이용", "온라인 고객 지원 서비스"
  ];

  // 앞으로 지금의 성도 수 기준 요금제를 대체할 예정인 "기능별" 요금제 구조 미리보기.
  // 아직 준비중이라 결제로 이어지지 않으며, 이 페이지에는 안내용으로만 노출한다.
  // 가격은 더 이상 고정값이 아니라 PRICING_MATRIX[featuredTier.value]에서
  // 교회 규모에 맞춰 가져온다(key로 매트릭스 조회) — 아래 features 목록은 그대로.
  const UPCOMING_FEATURE_TIERS: { name: string; key: FeaturePlanKey; features: string[] }[] = [
    {
      name: "베이직", key: "basic",
      features: [
        "예배 정보에 관련된 내용", "예배순서", "찬양 곡 미리듣기(Youtube)", "성경본문", "말씀구절",
        "예배 시간표(주일 1부/2부, 수요 예배, 새벽기도 등)", "지난 주보 보기(다시 보기/발행하기/열람만)",
        "교회소식", "기도 순서(이번주/다음주)", "열람 통계(관리자 기능)", "섬기는 분(담임 목사/부 교역자 등)",
      ],
    },
    {
      name: "스탠다드", key: "standard",
      features: [
        "교회 소개", "섬기는이 명단(예배 위원/반주자/찬양대)", "찬양 곡 미리듣기(Youtube + 카드뷰 형태)",
        "부서/기관 조직도", "카카오톡 URL 링크 전달 시 교회 이미지 시각화(프리뷰)", "지난 주 다운로드(데이터 백업용)",
        "담임 목사/교역자 소개 상세페이지", "교회 연혁/비전선언문", "목회칼럼(짧은글)", "교회 SNS·유튜브 채널 링크 모음",
        "오시는길·주차안내(지도 임베드)", "기도 순서(1달치 제공)", "릴레이 기도표 = 1달치 제공", "기도 요청",
      ],
    },
    {
      name: "프로", key: "pro",
      features: [
        "훈련 / 양육 관련", "헌금 현황(이름만)", "심방 / 모임(구역 셀 일정)", "새가족 환영", "성경 읽기표",
        "릴레이 기도표", "제자 훈련반 / 양육과정 모집 및 신청", "성경 공부반 소그룹 시간표", "세례 입교 신청",
        "온라인 헌금 QR", "선교사 소식 / 후원 현황", "구역 셀 리더 연락처",
      ],
    },
    {
      name: "올인원", key: "allinone",
      features: [
        "전도", "관리자 계정 다중 초대", "헌금 현황(관리자 대시보드(금액포함) 표시)",
        "온라인 주보 실시간 예배 자동 최신화", "수련회 관련 모든 기능(모집 및 신청)",
        "새가족 온라인 등록 폼", "전도 행사 & 광고 배너 기능(띠 형태)",
      ],
    },
  ];

  // 데이터(위 features 배열)에는 그대로 남겨두되, 화면에는 지금 당장 노출하지
  // 않을 항목들. 교회 사이트(홈페이지 제작) 서비스와 실제로 연동되는 시점에
  // 이 Set에서 빼면 다시 화면에 보인다 — features 배열 자체는 건드리지 않음.
  const HIDDEN_FEATURE_LABELS = new Set<string>([
    "교회 연혁/비전선언문", // 교회 사이트 서비스 연동 후 다시 노출 예정
    "부서/기관 조직도", // 메뉴에서도 "준비중"으로 숨겨둔 상태 - 추가로 더 열 때 같이 노출
    "릴레이 기도표 = 1달치 제공", // 미구현 - 스탠다드 전용 문구. (프로 티어의 "릴레이 기도표"와는 별개)
    "기도 요청", // 미구현
    "기도 순서(1달치 제공)", // 실제 구현은 이번주/다음주 2칸뿐이라 "1달치" 문구만 숨김
  ]);
  const visibleFeatures = (features: string[]) =>
    features.filter((f) => !HIDDEN_FEATURE_LABELS.has(f));

  // 가입 시 입력한 성도 수(congregationSize) 등급. 미로그인/미입력 시 전체 요금제를 제한 없이 볼 수 있음
  const userTier = currentUserInfo?.congregationSize || "";
  const isTierLocked = (tierValue: string) => !!userTier && userTier !== tierValue;

  // 상단에 크게 보여줄 대표 티어: 로그인 + 성도 수 등록된 경우 본인 티어, 그 외엔 기본값(개척)을 노출
  const featuredTier = PRICING_TIERS.find((t) => t.value === userTier) || PRICING_TIERS[0];
  const otherTiers = PRICING_TIERS.filter((t) => t.value !== featuredTier.value);
  const featuredIsEnterprise = featuredTier.monthly === null && featuredTier.threeMonth === null;

  // 특정 티어 + 결제 주기(월/3개월)에 대한 결제용 plan 객체 생성. 해당 주기 가격이 없으면(대형 티어) null 반환
  const buildTierPlan = (tier: (typeof PRICING_TIERS)[number], duration: "monthly" | "threeMonth") => {
    const amount = duration === "monthly" ? tier.monthly : tier.threeMonth;
    if (amount === null) return null;
    return {
      id: `plan_${tier.value}_${duration}`,
      name: `${tier.value} 티어 ${duration === "monthly" ? "1개월" : "3개월"} 주보 플랜`,
      price: amount.toLocaleString(),
      period: duration === "monthly" ? "월" : "3개월",
      status: "active"
    };
  };

  // "교회 규모 × 요금제(기능 등급) × 기간" 3차원 결제용 plan 객체 생성.
  // buildTierPlan(교회 규모만 반영, 기존 결제 흐름 그대로)과는 별개 —
  // 대표 요금제 카드(위쪽 3장)에서만 쓰는 신규 함수. usePayment.ts 자체는
  // 안 바뀌고, 여기서 계산한 amount/name을 그대로 넘기기만 한다.
  const FEATURE_PLAN_LABELS: Record<FeaturePlanKey, string> = {
    basic: "베이직", standard: "스탠다드", pro: "프로", allinone: "올인원",
  };
  const buildFeaturePlan = (
    tier: (typeof PRICING_TIERS)[number],
    featureKey: FeaturePlanKey,
    duration: "monthly" | "threeMonth"
  ) => {
    const row = PRICING_MATRIX[tier.value]?.[featureKey];
    const amount = row ? (duration === "monthly" ? row.monthly : row.threeMonth) : null;
    if (amount === null || amount === undefined) return null;
    return {
      id: `plan_${tier.value}_${featureKey}_${duration}`,
      name: `${tier.value} ${FEATURE_PLAN_LABELS[featureKey]} ${duration === "monthly" ? "1개월" : "3개월"} 주보 플랜`,
      price: amount.toLocaleString(),
      period: duration === "monthly" ? "월" : "3개월",
      status: "active",
      featurePlan: featureKey, // 결제한 요금제 등급 — 결제 성공 시 users.status로 저장
    };
  };

  const handlePlanSelection = (plan: any, tierValue: string) => {
    if (isTierLocked(tierValue)) {
      toast.error("가입하신 성도 수 등급에 맞지 않는 요금제예요. 등급 변경은 1:1 문의를 이용해주세요.");
      return;
    }
    setSelectedPlan(plan);
    if (!currentUserInfo) {
      setShowLoginGuardDialog(true);
    } else {
      setShowTrialDialog(true);
    }
  };

  const handleStartPayment = async (plan: any) => {
    const targetPlan = plan || selectedPlan;
    if (!targetPlan || targetPlan.status !== "active") return;

    const numericAmount = parseInt(targetPlan.price.replace(/,/g, ""), 10);

    await requestPayment({
      planName: targetPlan.name,
      amount: numericAmount,
      planTier: targetPlan.featurePlan,
      buyerEmail: currentUserInfo?.email || "",
      buyerName: currentUserInfo?.churchName || "교회담당자"
    });
  };

  // 정기결제 카드의 "정기결제로 시작하기" 클릭. handlePlanSelection(기존
  // 1회성 결제 선택 핸들러)와는 완전히 분리된 별도 함수 — 기존 쪽은 안 건드림.
  const handleRecurringSelection = () => {
    if (isTierLocked(featuredTier.value)) {
      toast.error("가입하신 성도 수 등급에 맞지 않는 요금제예요. 등급 변경은 1:1 문의를 이용해주세요.");
      return;
    }
    if (!currentUserInfo) {
      setShowLoginGuardDialog(true);
      return;
    }
    if (currentUserInfo.recurringActive) {
      toast.info("이미 정기결제 중이에요. 결제 관리에서 확인할 수 있어요.");
      return;
    }
    setRecurringAgreed(false);
    setShowRecurringDialog(true);
  };

  // 정기결제 동의 다이얼로그에서 "동의하고 카드 등록하기" 클릭 시 실제로
  // 포트원 카드 등록 창을 연다 — useBillingKey.ts 쪽으로만 요청이 가고,
  // usePayment.ts(1회성 결제)는 이 흐름에서 전혀 호출되지 않는다.
  // useSavedCard: 결제 관리에서 등록해 둔 카드로 바로 결제(카드 번호 다시 입력 안 함).
  // false면 카드 등록 창을 띄워 새 카드를 등록한 뒤 결제. 어느 쪽이든 첫 달은 바로 결제됨
  const handleConfirmRecurring = async (useSavedCard: boolean) => {
    const recurringAmount = PRICING_MATRIX[featuredTier.value]?.[selectedFeaturePlan]?.monthly;
    if (!recurringAgreed || recurringAmount === null || recurringAmount === undefined) return;
    const plan = {
      planName: `${featuredTier.value} ${FEATURE_PLAN_LABELS[selectedFeaturePlan]} 정기결제 플랜`,
      tierValue: featuredTier.value,
      amount: recurringAmount,
      featurePlan: selectedFeaturePlan,
    };
    setRegisteringRecurring(true);
    try {
      const ok = useSavedCard
        ? await startRecurringWithSavedCard(plan)
        : await requestIssueBillingKey(plan);
      if (ok) {
        setShowRecurringDialog(false);
        setCurrentUserInfo((u) => u && { ...u, hasBillingKey: true, recurringActive: true });
      }
    } finally {
      setRegisteringRecurring(false);
    }
  };

  if (loading) return null;

  return (
    <div className="min-h-screen bg-[#F2F4F6] px-3 py-5 sm:p-4 sm:py-8 md:py-12 transition-colors duration-500 font-sans">
      <div className="container mx-auto max-w-6xl">
        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center mb-5 sm:mb-8 gap-2.5 sm:gap-4">
          <Button variant="ghost" onClick={() => navigate(-1)} className="rounded-full text-slate-600 hover:bg-slate-200 self-start">
            <ArrowLeft className="w-4 h-4 mr-2" /> 돌아가기
          </Button>
          {currentUserInfo && (
            <div className="flex items-center gap-2.5 sm:gap-3 px-4 sm:px-5 py-2 sm:py-2.5 bg-white rounded-full border border-slate-200 shadow-sm animate-in fade-in slide-in-from-top-2 duration-500">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-blue-500 flex items-center justify-center text-white shadow-inner shrink-0"><User className="w-3.5 h-3.5 sm:w-4 sm:h-4" /></div>
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] sm:text-[11px] font-bold text-blue-600 leading-tight">결제 계정 확인</span>
                <span className="text-xs sm:text-sm font-black text-slate-800 leading-tight truncate">
                  {currentUserInfo.churchName} <span className="font-normal opacity-60 text-slate-500">({currentUserInfo.email})</span>
                </span>
              </div>
            </div>
          )}
        </div>

        {/* 서비스 탭: 주보 서비스(기존, PG 결제 가능) / 홈페이지 제작(안내 전용).
            선택된 쪽으로 배경이 스르륵 이동하는 토스 스타일 애니메이션
            (motion layoutId) — 요금제 토글(아래)과 같은 방식. */}
        <div className="flex justify-center mb-6 sm:mb-10">
          <div className="inline-flex items-center bg-white p-1.5 rounded-full shadow-sm border border-slate-200">
            {([
              { key: "bulletin", label: "주보 서비스" },
              { key: "website", label: "홈페이지 제작" },
            ] as const).map((tab) => {
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`relative px-5 sm:px-6 py-2.5 rounded-full text-sm font-bold transition-colors ${active ? "text-white" : "text-slate-500 hover:text-slate-700"}`}
                >
                  {active && (
                    <motion.div
                      layoutId="serviceTabPill"
                      className="absolute inset-0 bg-blue-600 rounded-full"
                      transition={{ type: "spring", stiffness: 500, damping: 35 }}
                    />
                  )}
                  <span className="relative z-10">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {activeTab === "bulletin" ? (
        <>
        <div className="text-center mb-6 sm:mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 text-blue-600 text-xs sm:text-sm font-bold mb-3 sm:mb-4">
            <Sparkles className="w-4 h-4" /> 모바일 주보 최저가 Beta Special Price
          </div>

          {/* 모바일에서는 텍스트를 줄이고 크기를 최적화 (스마트 주보 특별 혜택가) */}
          <h1 className="text-2xl sm:text-5xl font-black mb-2.5 sm:mb-4 bg-gradient-to-r from-blue-700 to-indigo-700 bg-clip-text text-transparent leading-tight tracking-tight">
            스마트 주보 특별 혜택가
          </h1>

          <p className="text-sm sm:text-xl text-slate-600 break-keep font-medium">
            가장 경제적인 온라인 주보 제작,<br></br>교회 규모에 맞는 요금제로 시작하세요.
          </p>
        </div>

        <motion.div
          animate={{
            boxShadow: [
              "0 4px 6px -1px rgba(49, 130, 246, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03), 0 0 0px 0px rgba(49, 130, 246, 0)", // 완전히 꺼진 상태 (은은한 기본)
              "0 8px 30px -4px rgba(49, 130, 246, 0.2), 0 0 24px 6px rgba(49, 130, 246, 0.35)"
            ],
            borderColor: ["#E5E8EB", "#3182F6"] // 테두리도 띡띡 변하지 않고 스르륵 물들도록 두 단계만 지정
          }}
          transition={{
            duration: 1.8,
            repeat: Infinity,
            repeatType: "reverse",
            ease: "easeInOut"
          }}
          className="mb-6 sm:mb-10 p-4 sm:p-5 rounded-2xl bg-white border flex items-start gap-2.5 sm:gap-3 max-w-3xl mx-auto"
        >
          <div className="relative flex-shrink-0 mt-0.5 flex items-center justify-center w-6 h-6 rounded-full bg-[#E8F3FF]">
            <Sparkles className="w-3.5 h-3.5 text-[#3182F6]" />
          </div>

          <div className="text-sm text-slate-600 break-keep leading-relaxed font-medium w-full">
            <div>
              <strong className="text-[#3182F6]">2026년도 하반기 이벤트!</strong> 회원 가입 후 제공되는 1개월 안에 고객센터로 <strong>하반기 무료 이벤트 참여 문의</strong>하시면, 2026년도 하반기 무료 이벤트에 참여하실 수 있습니다. 자세한 내용은 고객센터로 문의해 주세요!
            </div>

            <div className="mt-2.5 pt-2 border-t border-dashed border-[#F2F4F6] text-[12px] text-[#F04452] font-semibold flex items-center gap-1">
              <span>반드시 회원 가입 후 1개월 이내 문의해주세요! 이벤트 미문의 시 서비스 이용을 위해 결제를 해야 사용하실 수 있어요.</span>
            </div>
          </div>
        </motion.div>

        {/* 앞으로 지금의 성도 수 기준 요금제를 대체할 예정인 기능별 요금제(베이직/스탠다드/프로/올인원)
            미리보기. 아직 기능이 준비중이라 결제/선택은 막아두고 안내용으로만 노출한다. */}
        <div className="max-w-6xl mx-auto mb-6 sm:mb-12">
          <div className="rounded-2xl sm:rounded-[2.5rem] bg-gradient-to-br from-indigo-50 via-white to-blue-50 border border-indigo-100 p-4 sm:p-10">
            <div className="text-center mb-5 sm:mb-8">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-100 text-indigo-600 text-xs sm:text-sm font-bold mb-3 sm:mb-4">
                <Rocket className="w-4 h-4" /> 대규모 기능 업데이트 예정
              </div>
              <h2 className="text-xl sm:text-3xl font-black text-slate-900 mb-2 sm:mb-3 tracking-tight">
                앞으로 이런 요금제로 확장돼요
              </h2>
              <p className="text-xs sm:text-base text-slate-500 font-medium break-keep max-w-2xl mx-auto leading-relaxed">
                지금의 성도 수 기준 요금제는 앞으로 <strong className="text-slate-700">베이직 · 스탠다드 · 프로 · 올인원</strong> 기능별 요금제로 순차 개편될 예정이에요. 아래는 준비 중인 기능들을 미리 보여드리는 화면이며, 아직 결제·가입은 불가능해요.
              </p>

              <p className="text-xs sm:text-base text-slate-500 font-medium break-keep max-w-2xl mx-auto leading-relaxed">
                현재는 <strong className="text-slate-700">현 페이지 하단에 월 플랜 · 3개월 플랜 · 정기결제</strong>로 결제가 가능해요.
              </p>

              {/* 통합 포인트: 성도 수 기준 요금제와 기능별 요금제를 "교회 규모" 하나로 묶음.
                  아래 가격은 featuredTier(로그인한 교회의 실제 등급, 미로그인 시 개척)에 맞춰
                  PRICING_MATRIX에서 가져온 값이라 성도 수에 따라 달라진다 — 더 이상 고정가 아님 */}
              <p className="mt-2 text-xs font-bold text-indigo-500">
                아래 가격은 <strong>{featuredTier.value} · {featuredTier.rangeLabel}</strong> 교회 기준이에요
              </p>
            </div>

            {/* 모바일: 가로 스크롤 캐러셀 / sm 이상: 기존 그리드 그대로 */}
            <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 sm:pb-0 sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:gap-5 sm:overflow-visible">
              {UPCOMING_FEATURE_TIERS.map((tier) => {
                // 베이직/스탠다드는 구현이 끝나서 공개, 프로/올인원은 아직 확정되지 않은
                // 세부 기능 로드맵이라 원래는 경쟁사 등에 노출되지 않도록 블러 처리해야
                // 하지만, 지금은 요금제 구조 재검토 중이라 잠시 풀어둔 상태 — 다시 잠글 때
                // 아래 줄로 되돌리면 됨.
                // const isLocked = tier.name === "프로" || tier.name === "올인원";
                const isLocked = false;
                const price = PRICING_MATRIX[featuredTier.value]?.[tier.key];
                const isEnterprisePrice = !price || price.monthly === null;
                return (
                  <div key={tier.name} className="shrink-0 w-[78%] snap-center sm:w-auto sm:shrink">
                  <Card className="relative p-4 pt-6 sm:p-5 sm:pt-6 rounded-[1.75rem] border-0 bg-white/90 shadow-sm flex flex-col overflow-hidden h-full">
                    <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-400 text-[9px] font-black uppercase tracking-wider whitespace-nowrap">
                      <Lock className="w-2.5 h-2.5" /> Coming Soon
                    </div>
                    <h3 className="text-base font-black mb-1 text-slate-900 pr-24">{tier.name}</h3>
                    {isEnterprisePrice ? (
                      <div className="flex items-end gap-1 mb-1">
                        <span className="text-xl font-black text-slate-400">별도 문의</span>
                      </div>
                    ) : (
                      <div className="flex items-end gap-1 mb-1">
                        <span className="text-xl font-black text-slate-400">{price.monthly!.toLocaleString()}원</span>
                        <span className="text-slate-300 text-[11px] mb-0.5 font-bold">/ 월</span>
                      </div>
                    )}
                    <p className="text-[10px] text-slate-300 font-bold mb-4">
                      {isEnterprisePrice ? "대형 교회는 담당자가 안내해드려요" : `3개월 ${price.threeMonth!.toLocaleString()}원`}
                    </p>

                    <div className="relative flex-grow mb-4">
                      <div className={`space-y-2 ${isLocked ? "blur-[5px] opacity-50 select-none pointer-events-none" : ""}`}>
                        {visibleFeatures(tier.features).map((feature, fIndex) => (
                          <div key={fIndex} className="flex items-start gap-2">
                            <Check className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-slate-300" />
                            <span className="text-[11px] leading-snug font-medium text-slate-500 break-keep">{feature}</span>
                          </div>
                        ))}
                      </div>

                      {isLocked && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                          <div className="w-10 h-10 rounded-full bg-white shadow-md border border-slate-200 flex items-center justify-center text-slate-400">
                            <Lock className="w-4 h-4" />
                          </div>
                          <span className="text-[10px] font-bold text-slate-400 text-center px-4 leading-relaxed">
                            세부 기능은<br />업데이트 시 공개돼요
                          </span>
                        </div>
                      )}
                    </div>

                    <Button disabled className="w-full rounded-xl font-black text-xs py-4 bg-slate-100 text-slate-400 cursor-not-allowed hover:bg-slate-100">
                      준비중
                    </Button>
                  </Card>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {!isAdminPath && !currentUserInfo && (
          <Card className="mb-6 sm:mb-12 p-4 sm:p-8 rounded-2xl sm:rounded-[2.5rem] bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-0 shadow-xl shadow-blue-200 max-w-4xl mx-auto relative overflow-hidden group animate-in fade-in zoom-in-95 duration-500">
            <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <div className="flex flex-col md:flex-row items-center justify-between gap-3 sm:gap-6 text-center md:text-left relative z-10">
              <div>
                <h3 className="text-lg sm:text-2xl font-black mb-1.5 sm:mb-2">🎁 무료 주보 제작 1개월 체험</h3>
                <p className="text-sm sm:text-base text-blue-50 opacity-90 font-medium">어떤 플랜을 선택하셔도 첫 달은 0원으로 스마트 주보의 모든 기능을 체험하실 수 있습니다.</p>
              </div>
              <Button size="lg" onClick={() => navigate("/signup")} className="bg-white text-blue-600 hover:bg-slate-50 rounded-full px-10 font-black w-full md:w-auto border-none h-12 sm:h-14 shadow-lg active:scale-95 transition-transform">지금 무료 주보 시작</Button>
            </div>
          </Card>
        )}

        {/* 가입 시 입력한 성도 수 기준으로 요금제가 자동 책정된다는 점을 분명히 안내 */}
        <div className="max-w-3xl mx-auto mb-5 sm:mb-8 p-3.5 sm:p-5 rounded-2xl bg-blue-50 border border-blue-100 flex items-start gap-2.5 sm:gap-3">
          <Info className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs sm:text-sm text-blue-800 font-medium leading-relaxed break-keep">
            {userTier ? (
              <>가입 시 입력하신 평균 출석 성도 수 기준(<strong>{userTier} · {featuredTier.rangeLabel}</strong>)으로 아래 <strong>{userTier}</strong> 요금제가 자동으로 하이라이트됩니다. 다른 등급의 요금제는 선택하실 수 없으며, 등급 변경이 필요하시면 우측 하단 1:1 문의를 이용해주세요.</>
            ) : currentUserInfo ? (
              <>가입 정보에 성도 수가 등록되어 있지 않아 전체 요금제를 자유롭게 선택하실 수 있습니다. 정확한 안내가 필요하시면 우측 하단 1:1 문의를 이용해주세요.</>
            ) : (
              <>로그인하시면 가입 시 입력하신 평균 출석 성도 수를 기준으로 이용 가능한 요금제가 자동으로 하이라이트돼요. 지금은 전체 요금제를 자유롭게 둘러보실 수 있습니다.</>
            )}
          </p>
        </div>

        {/* 요금제(기능 등급) 선택 토글 — 교회 규모 배지보다 먼저 노출.
            교회 규모(featuredTier)는 자동 고정, 여기서 베이직/스탠다드/
            프로/올인원 중 하나를 고르면 아래 카드들이 전부 같이 바뀐다.
            선택된 버튼 뒤로 스르륵 움직이는 배경(motion layoutId)을 깔아
            토스 스타일 세그먼트 컨트롤처럼 보이게 함. */}
        {!featuredIsEnterprise && (
          <div className="flex justify-center mb-3 sm:mb-4">
            <div className="inline-flex flex-wrap justify-center gap-1 bg-white p-1.5 rounded-full shadow-sm border border-slate-200">
              {UPCOMING_FEATURE_TIERS.map((fp) => {
                const active = selectedFeaturePlan === fp.key;
                return (
                  <button
                    key={fp.key}
                    onClick={() => setSelectedFeaturePlan(fp.key)}
                    className={`relative px-3.5 sm:px-5 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-bold transition-colors ${active ? "text-white" : "text-slate-500 hover:text-slate-700"}`}
                  >
                    {active && (
                      <motion.div
                        layoutId="featurePlanPill"
                        className="absolute inset-0 bg-slate-900 rounded-full"
                        transition={{ type: "spring", stiffness: 500, damping: 35 }}
                      />
                    )}
                    <span className="relative z-10">{fp.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 대표 티어(로그인 + 성도 수 등록 시 본인 등급, 그 외엔 개척 기본값)를 원래의 넓은 카드 스타일로 강조 노출 */}
        <div className="text-center mb-6 sm:mb-12">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900 text-white text-xs font-bold">
            {userTier ? `${featuredTier.value} · ${featuredTier.rangeLabel} 교회 맞춤 요금제` : `${featuredTier.value} 단계 · ${featuredTier.rangeLabel} 시작 요금제`}
          </span>
        </div>

        {featuredIsEnterprise ? (
          <div className="flex justify-center mb-6 sm:mb-10">
            <Card className="relative p-6 sm:p-10 rounded-2xl sm:rounded-[2.5rem] border-0 bg-white shadow-2xl ring-2 ring-blue-500 max-w-md w-full text-center">
              <div className={`w-12 h-12 sm:w-14 sm:h-14 mx-auto rounded-2xl bg-gradient-to-br ${TIER_GRADIENT[featuredTier.value]} flex items-center justify-center text-white mb-4 sm:mb-6 shadow-lg shadow-blue-100`}>
                <MessageCircle className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <h3 className="text-xl sm:text-2xl font-black mb-2 text-slate-900">{featuredTier.value} 티어 맞춤 상담</h3>
              <p className="text-sm mb-5 sm:mb-8 font-bold text-slate-500">{featuredTier.rangeLabel} 규모 교회는 담당자가 직접 맞춤 요금을 안내해드려요.</p>
              <Button onClick={() => window.open(KAKAO_CHANNEL_URL, "_blank")} className={`w-full rounded-[1.3rem] py-6 sm:py-8 font-black border-none shadow-md transition-all active:scale-95 text-base sm:text-lg bg-gradient-to-r ${TIER_GRADIENT[featuredTier.value]} hover:opacity-90 text-white shadow-lg shadow-blue-100 flex items-center justify-center gap-2`}>
                <MessageCircle className="w-5 h-5" /> 1:1 문의하기
              </Button>
            </Card>
          </div>
        ) : (
          <div className="flex flex-col items-center mb-6 sm:mb-10 w-full">
            {/* 프로/올인원은 아직 세부 기능이 확정 안 됐으므로(위 "앞으로 이런 요금제로
                확장돼요" 미리보기 카드와 동일), 실제 결제 카드 3장(월/3개월/정기결제)의
                기능 리스트도 똑같이 블러+자물쇠 처리한다. 가격/결제 버튼은 그대로 둔다 —
                요청받은 건 "기능만" 가리는 것이라, 결제 자체를 막는 판단은 하지 않는다. */}
            {(() => {
              // 위 미리보기 카드와 동일하게, 요금제 구조 재검토 중이라 잠시 풀어둔 상태 —
              // 다시 잠글 때 아래 줄로 되돌리면 됨.
              // const isFeatureLocked = selectedFeaturePlan === "pro" || selectedFeaturePlan === "allinone";
              const isFeatureLocked = false;
              return (
            <>
            {/* 모바일: 가로 스크롤 캐러셀(월/3개월/정기결제 3장) / sm 이상: 기존 그리드 */}
            <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-3 px-3 sm:mx-0 sm:px-0 sm:pb-0 sm:grid sm:grid-cols-3 sm:gap-5 sm:overflow-visible w-full max-w-5xl items-stretch">
              {(["monthly", "threeMonth"] as const).map((duration) => {
                const plan = buildFeaturePlan(featuredTier, selectedFeaturePlan, duration);
                if (!plan) return null;
                const isThreeMonth = duration === "threeMonth";
                const planFeatures = visibleFeatures(UPCOMING_FEATURE_TIERS.find((f) => f.key === selectedFeaturePlan)?.features || commonFeatures);
                return (
                  <div key={duration} className="shrink-0 w-[82%] snap-center sm:w-auto sm:shrink">
                  <Card className={`relative p-4 sm:p-6 rounded-2xl sm:rounded-[2.5rem] border-0 transition-all duration-300 flex flex-col h-full ${isThreeMonth ? "ring-2 ring-blue-500 shadow-2xl bg-white md:scale-105 sm:z-10" : "bg-white shadow-sm"}`}>
                    {isThreeMonth && (
                      <div className="absolute -top-3.5 sm:-top-4 left-1/2 -translate-x-1/2 whitespace-nowrap">
                        <div className="bg-blue-600 text-white px-4 sm:px-5 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-[11px] font-black shadow-lg uppercase tracking-wider">추천 모바일 주보 플랜</div>
                      </div>
                    )}
                    <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br ${TIER_GRADIENT[featuredTier.value]} flex items-center justify-center text-white mb-3.5 sm:mb-5 shadow-lg shadow-blue-100`}>
                      {isThreeMonth ? <Calendar className="w-4 h-4 sm:w-5 sm:h-5" /> : <Clock className="w-4 h-4 sm:w-5 sm:h-5" />}
                    </div>
                    <h3 className="text-base sm:text-xl font-black mb-1.5 sm:mb-2 text-slate-900">{featuredTier.value} {FEATURE_PLAN_LABELS[selectedFeaturePlan]} {plan.period} 플랜</h3>
                    <p className="text-xs sm:text-sm mb-3.5 sm:mb-5 font-bold text-slate-500">{featuredTier.rangeLabel} 교회를 위한 요금제</p>
                    <div className="mb-1"><div className="flex items-end gap-1"><span className="text-2xl sm:text-3xl font-black text-slate-900">{plan.price}</span><span className="text-slate-400 text-xs sm:text-sm mb-1 font-bold">원 / {plan.period}</span></div></div>
                    <p className="text-[10px] sm:text-[11px] text-slate-400 font-bold mb-4 sm:mb-6">
                      {isThreeMonth ? "1회 결제 · 자동 갱신 없음" : "1회 결제 · 자동 결제 아님"}
                    </p>
                    <Button onClick={() => handlePlanSelection(plan, featuredTier.value)} className={`w-full rounded-[1.3rem] py-5 sm:py-7 mb-5 sm:mb-8 font-black border-none shadow-md transition-all active:scale-95 text-sm sm:text-base bg-gradient-to-r ${TIER_GRADIENT[featuredTier.value]} hover:opacity-90 text-white shadow-lg shadow-blue-100`}>
                      주보 시작하기
                    </Button>
                    <div className="relative flex-grow">
                      <div className={`space-y-2.5 sm:space-y-3.5 ${isFeatureLocked ? "blur-[5px] opacity-50 select-none pointer-events-none" : ""}`}>
                        {planFeatures.map((feature, fIndex) => (
                          <div key={fIndex} className="flex items-start gap-2.5 sm:gap-3">
                            <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0 mt-0.5 text-blue-500" />
                            <span className="text-xs sm:text-[13px] leading-tight font-medium text-slate-600">{feature}</span>
                          </div>
                        ))}
                      </div>
                      {isFeatureLocked && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                          <div className="w-10 h-10 rounded-full bg-white shadow-md border border-slate-200 flex items-center justify-center text-slate-400">
                            <Lock className="w-4 h-4" />
                          </div>
                          <span className="text-[10px] font-bold text-slate-400 text-center px-4 leading-relaxed">
                            세부 기능은<br />업데이트 시 공개돼요
                          </span>
                        </div>
                      )}
                    </div>
                  </Card>
                  </div>
                );
              })}

              {/* 정기결제 카드 — 신규 추가. 월/3개월 카드(위)와 완전히 별개의
                  버튼·핸들러(handleRecurringSelection)를 쓰고, usePayment.ts는
                  이 카드 흐름에서 전혀 호출되지 않는다(useBillingKey.ts만 호출).
                  가격/기능 목록은 위 토글로 고른 selectedFeaturePlan을 그대로 따름. */}
              <div className="shrink-0 w-[82%] snap-center sm:w-auto sm:shrink">
              <Card className="relative p-4 sm:p-6 rounded-2xl sm:rounded-[2.5rem] border-0 bg-white shadow-sm transition-all duration-300 flex flex-col h-full">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white mb-3.5 sm:mb-5 shadow-lg shadow-emerald-100">
                  <RefreshCcw className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <h3 className="text-base sm:text-xl font-black mb-1.5 sm:mb-2 text-slate-900">{featuredTier.value} {FEATURE_PLAN_LABELS[selectedFeaturePlan]} 정기결제</h3>
                <p className="text-xs sm:text-sm mb-2 font-bold text-slate-500">카드 등록 한 번으로 매달 자동 결제</p>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[10px] sm:text-[11px] font-bold mb-3.5 sm:mb-5 w-fit">
                  <Info className="w-3 h-3 shrink-0" /> 현재 정기 결제 시스템 도입중입니다
                </div>
                <div className="mb-1"><div className="flex items-end gap-1"><span className="text-2xl sm:text-3xl font-black text-slate-900">{PRICING_MATRIX[featuredTier.value]?.[selectedFeaturePlan]?.monthly?.toLocaleString()}</span><span className="text-slate-400 text-xs sm:text-sm mb-1 font-bold">원 / 월</span></div></div>
                <p className="text-[10px] sm:text-[11px] text-emerald-600 font-bold mb-4 sm:mb-6">매월 자동결제 · 언제든 해지 가능</p>
                <Button onClick={handleRecurringSelection} className="w-full rounded-[1.3rem] py-5 sm:py-7 mb-5 sm:mb-8 font-black border-none shadow-md transition-all active:scale-95 text-sm sm:text-base bg-gradient-to-r from-emerald-500 to-teal-600 hover:opacity-90 text-white shadow-lg shadow-emerald-100 flex items-center justify-center gap-2">
                  <RefreshCcw className="w-4 h-4" /> 정기결제로 시작하기
                </Button>
                <div className="relative flex-grow">
                  <div className={`space-y-2.5 sm:space-y-3.5 ${isFeatureLocked ? "blur-[5px] opacity-50 select-none pointer-events-none" : ""}`}>
                    {visibleFeatures(UPCOMING_FEATURE_TIERS.find((f) => f.key === selectedFeaturePlan)?.features || commonFeatures).map((feature, fIndex) => (
                      <div key={fIndex} className="flex items-start gap-2.5 sm:gap-3">
                        <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0 mt-0.5 text-emerald-500" />
                        <span className="text-xs sm:text-[13px] leading-tight font-medium text-slate-600">{feature}</span>
                      </div>
                    ))}
                  </div>
                  {isFeatureLocked && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                      <div className="w-10 h-10 rounded-full bg-white shadow-md border border-slate-200 flex items-center justify-center text-slate-400">
                        <Lock className="w-4 h-4" />
                      </div>
                      <span className="text-[10px] font-bold text-slate-400 text-center px-4 leading-relaxed">
                        세부 기능은<br />업데이트 시 공개돼요
                      </span>
                    </div>
                  )}
                </div>
              </Card>
              </div>
            </div>
            </>
              );
            })()}
          </div>
        )}

        {/* 나머지 성도 수 구간 요금제는 비교용으로 하단에 좀 더 작게 노출 */}
        <div className="max-w-5xl mx-auto mb-8 sm:mb-16">
          <div className="text-center mb-4 sm:mb-6">
            <h2 className="text-base sm:text-lg font-black text-slate-900 mb-1">다른 성도 수 구간 요금제</h2>
            <p className="text-xs sm:text-sm text-slate-500 font-medium">성도 수가 늘어나면 등급 변경이 필요해요. 변경은 1:1 문의로 도와드립니다.</p>
            <p className="text-xs sm:text-sm text-slate-500 font-medium">선택하신 요금제 대비 이용량이 초과되는 경우, 담당자가 별도로 안내드릴 수 있습니다.</p>
          </div>
          {/* 모바일: 가로 스크롤 캐러셀 / sm 이상: 기존 그리드 */}
          <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-3 px-3 sm:mx-0 sm:px-0 sm:pb-0 sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:gap-5 sm:overflow-visible">
            {otherTiers.map((tier) => {
              const isEnterprise = tier.monthly === null && tier.threeMonth === null;
              const locked = !isEnterprise && isTierLocked(tier.value);
              const gradient = TIER_GRADIENT[tier.value] || "from-slate-500 to-slate-600";

              return (
                <div key={tier.value} className="shrink-0 w-[46%] snap-center sm:w-auto sm:shrink">
                <Card className={`relative p-4 sm:p-5 rounded-[1.75rem] border-0 transition-all duration-300 flex flex-col h-full ${locked ? "bg-slate-100 opacity-70 grayscale-[0.4]" : "bg-white shadow-sm"}`}>
                  {locked && (
                    <div className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/90 border border-slate-200 flex items-center justify-center shadow-sm">
                      <Lock className="w-3 h-3 text-slate-400" />
                    </div>
                  )}

                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white mb-3 shadow-sm ${locked ? "grayscale" : ""}`}>
                    <span className="text-sm font-black">{tier.value.slice(0, 1)}</span>
                  </div>
                  <h3 className="text-base font-black mb-0.5 text-slate-900">{tier.value}</h3>
                  <p className="text-[11px] mb-4 font-bold text-slate-400">{tier.rangeLabel}</p>

                  {isEnterprise ? (
                    <div className="mt-auto">
                      <Button
                        size="sm"
                        onClick={() => window.open(KAKAO_CHANNEL_URL, "_blank")}
                        className={`w-full rounded-lg font-black text-xs py-4 flex items-center justify-center gap-1.5 bg-gradient-to-r ${gradient} text-white hover:opacity-90`}
                      >
                        <MessageCircle className="w-3.5 h-3.5" /> 별도 문의
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-1.5 mt-auto">
                      {(["monthly", "threeMonth"] as const).map((duration) => {
                        const plan = buildTierPlan(tier, duration);
                        if (!plan) return null;
                        return (
                          <div key={duration} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50">
                            <div>
                              <div className="text-[9px] font-bold text-slate-400">{plan.period}</div>
                              <div className={`text-sm font-black ${locked ? "text-slate-400" : "text-slate-900"}`}>{plan.price}원</div>
                            </div>
                            <Button
                              size="sm"
                              disabled={locked}
                              onClick={() => handlePlanSelection(plan, tier.value)}
                              className={`rounded-lg font-bold text-[10px] px-3 h-7 ${locked ? "bg-slate-200 text-slate-400 cursor-not-allowed hover:bg-slate-200" : `bg-gradient-to-r ${gradient} text-white hover:opacity-90`}`}
                            >
                              {locked ? <Lock className="w-3 h-3" /> : "시작하기"}
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
                </div>
              );
            })}
          </div>
        </div>

        <Card className="max-w-3xl mx-auto mb-8 sm:mb-16 p-5 sm:p-8 rounded-[2rem] border-0 bg-white shadow-sm">
          <h3 className="text-lg font-black text-slate-900 mb-5 text-center">모든 요금제 공통 혜택</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {commonFeatures.map((feature, fIndex) => (
              <div key={fIndex} className="flex items-center gap-3">
                <Check className="w-5 h-5 flex-shrink-0 text-blue-500" />
                <span className="text-sm font-medium text-slate-600">{feature}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* 정기결제 및 환불 정책 — 신규 추가 섹션. 푸터 "환불 정책" 버튼이
            여기로 스크롤됨(위쪽 useEffect 참고). 3개월 플랜 환불 비율은
            기존 footer.tsx 모달과 동일하게 30%로 맞춤 — 임의로 다른 숫자
            쓰지 않음. */}
        <div id="refund" className="max-w-3xl mx-auto mb-8 sm:mb-16 font-sans scroll-mt-20">
          <div className="flex items-center justify-center gap-2 mb-5 sm:mb-8">
            <ShieldCheck className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
            <h2 className="text-xl sm:text-3xl font-black text-slate-900 text-center tracking-tight">정기결제 및 환불 정책</h2>
          </div>
          <div className="grid gap-3 sm:gap-4">
            <Card className="p-4 sm:p-6 rounded-xl sm:rounded-[1.5rem] border-0 bg-white shadow-sm">
              <h4 className="font-black mb-2 text-slate-800 tracking-tight">1. 상품 및 제공 방식</h4>
              <p className="text-sm text-slate-500 break-keep font-medium leading-relaxed">
                스테이온 모바일 주보는 온라인으로 제공되는 디지털 서비스로, 별도의 배송이 없습니다.<br />
                결제가 완료되면 즉시 계정에 이용권이 적용되며, 결제일로부터 1개월(3개월 플랜은 3개월) 동안 이용하실 수 있습니다.
              </p>
            </Card>
            <Card className="p-4 sm:p-6 rounded-xl sm:rounded-[1.5rem] border-0 bg-white shadow-sm">
              <h4 className="font-black mb-2 text-slate-800 tracking-tight">2. 정기결제 (월 플랜)</h4>
              <p className="text-sm text-slate-500 break-keep font-medium leading-relaxed">
                최초 결제일을 기준으로 매월 같은 날 등록된 카드로 자동 결제됩니다. 해당 일자가 없는 달은 말일에 결제됩니다.<br />
                결제 3일 전에 결제 예정 금액과 일자를 이메일로 안내해 드립니다.<br />
                결제에 실패하면 3일간 재결제를 시도하며, 최종 실패 시 서비스 이용이 일시 정지됩니다.<br />
                3개월 플랜은 1회 결제 상품으로 자동 갱신되지 않습니다.
              </p>
            </Card>
            <Card className="p-4 sm:p-6 rounded-xl sm:rounded-[1.5rem] border-0 bg-white shadow-sm">
              <h4 className="font-black mb-2 text-slate-800 tracking-tight">3. 해지</h4>
              <p className="text-sm text-slate-500 break-keep font-medium leading-relaxed">
                마이페이지(관리자 홈 &gt; 결제 관리)에서 언제든지 해지하실 수 있습니다.<br />
                해지 시 다음 결제일부터 결제가 중단되며, 이미 결제된 기간은 만료일까지 정상적으로 이용하실 수 있습니다.
              </p>
            </Card>
            <Card className="p-4 sm:p-6 rounded-xl sm:rounded-[1.5rem] border-0 bg-white shadow-sm">
              <h4 className="font-black mb-2 text-slate-800 tracking-tight">4. 청약철회 및 환불</h4>
              <p className="text-sm text-slate-500 break-keep font-medium leading-relaxed">
                결제 후 7일 이내이고 서비스를 이용하지 않은 경우, 플랜과 관계없이 전액 환불됩니다.<br />
                월 플랜은 이용 내역(주보 작성·발행 등)이 발생한 후에는 해당 월 결제분을 환불하지 않습니다. 본 서비스는 결제 즉시 모든 기능이 제공되는 디지털 서비스이며, 가입 시 1개월 무료 체험을 통해 사전에 충분히 이용해 보실 수 있습니다.<br />
                3개월 플랜은 중도 해지 시 결제 금액의 30% 기준으로 남은 기간을 일할 계산하여 환불됩니다.<br />
                회사의 귀책 사유로 서비스를 이용하지 못한 경우, 이용하지 못한 기간을 일할 계산하여 환불하거나 이용 기간을 연장해 드립니다.
              </p>
            </Card>
            <Card className="p-4 sm:p-6 rounded-xl sm:rounded-[1.5rem] border-0 bg-white shadow-sm">
              <h4 className="font-black mb-2 text-slate-800 tracking-tight">5. 요금 변경</h4>
              <p className="text-sm text-slate-500 break-keep font-medium leading-relaxed">
                요금이 인상되는 경우 최소 30일 전에 안내하고 동의를 받으며, 동의하지 않으시면 다음 결제일에 자동 해지됩니다.
              </p>
            </Card>
            <Card className="p-4 sm:p-6 rounded-xl sm:rounded-[1.5rem] border-0 bg-white shadow-sm">
              <h4 className="font-black mb-2 text-slate-800 tracking-tight">6. 환불 신청 및 처리</h4>
              <p className="text-sm text-slate-500 break-keep font-medium leading-relaxed">
                고객센터(0502-1937-0615) 또는 1:1 문의로 신청하실 수 있습니다.<br />
                환불은 요청일로부터 영업일 기준 3~5일 이내에 결제하신 수단으로 취소 처리됩니다.
              </p>
            </Card>
          </div>
        </div>

        <div className="max-w-3xl mx-auto mb-8 sm:mb-12 font-sans">
          <div className="flex items-center justify-center gap-2 mb-5 sm:mb-8"><Info className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" /><h2 className="text-xl sm:text-3xl font-black text-slate-900 text-center tracking-tight">교회 주보 FAQ</h2></div>
          <div className="grid gap-3 sm:gap-4">
            {[
              { q: "자동 결제는 어떻게 되나요?", a: "월 플랜은 결제일 기준으로 매월 자동 결제되며, 결제 3일 전에 미리 안내해 드립니다. 마이페이지에서 언제든 해지하실 수 있고, 해지하시면 다음 달부터 결제되지 않습니다. 3개월 플랜과 무료 체험은 자동으로 결제되지 않습니다." },
              { q: "온라인 주보 990원 가격은 언제까지 유지되나요?", a: "현재 베타 버전으로 가입하신 플랜의 가격은 유지되며, 추후에 요금이 인상될 수 있습니다. 지금 사전 혜택으로 스마트 주보 제작을 가장 저렴하게 시작해 보세요." }
            ].map((faq, i) => (
              <Card key={i} className="p-4 sm:p-6 rounded-xl sm:rounded-[1.5rem] border-0 bg-white shadow-sm">
                <h4 className="font-black mb-2 text-slate-800 tracking-tight">{faq.q}</h4>
                <p className="text-sm text-slate-500 break-keep font-medium leading-relaxed">{faq.a}</p>
              </Card>
            ))}
          </div>
        </div>
        </>
        ) : (
        <>
        {/* 홈페이지 제작 탭 — 준비중. 결제/가입 흐름으로 진입할 수 있는 버튼을 전부 없애고
            잠금 안내만 노출한다. 관련 결제 로직(useWebsitePayment 등)은 재오픈 시 바로
            쓸 수 있도록 그대로 남겨두되, 이 화면에서는 호출하지 않는다. */}
        <div className="flex justify-center mb-8 sm:mb-16">
          <Card className="max-w-lg w-full p-6 sm:p-12 rounded-2xl sm:rounded-[2.5rem] border-0 bg-white shadow-xl text-center">
            <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-4 sm:mb-6">
              <Lock className="w-6 h-6 sm:w-7 sm:h-7" />
            </div>
            <h1 className="text-xl sm:text-3xl font-black mb-2.5 sm:mb-3 text-slate-900 tracking-tight">
              홈페이지 제작 서비스 준비중입니다
            </h1>
            <p className="text-sm sm:text-base text-slate-500 break-keep font-medium leading-relaxed mb-5 sm:mb-8">
              더 나은 모습으로 다시 찾아뵙기 위해 잠시 서비스를 준비하고 있어요.<br />
              오픈 소식은 별도로 안내드릴게요.
            </p>
            <Button onClick={() => window.open(KAKAO_CHANNEL_URL, "_blank")} variant="outline" className="rounded-full font-bold text-slate-500 border-slate-200 flex items-center gap-2 mx-auto">
              <MessageCircle className="w-4 h-4" /> 문의하기
            </Button>
          </Card>
        </div>
        </>
        )}
      </div>

      <Dialog open={showTrialDialog} onOpenChange={setShowTrialDialog}>
        <DialogContent className="rounded-[2rem] sm:rounded-[2.5rem] max-w-md bg-white border-none p-5 sm:p-8 font-sans">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black text-slate-900 text-center tracking-tight">무료 주보 체험 및 결제 안내</DialogTitle>
            <div className="text-base pt-6 space-y-4">
              <div className="bg-blue-50 p-5 rounded-[1.5rem] border border-blue-100">
                <p className="font-black text-blue-900 mb-1">🎁 선택한 플랜: {selectedPlan?.name}</p>
                <p className="text-blue-700 text-sm font-medium">최초 1개월은 0원으로 스마트 주보를 이용하며, 이후 {selectedPlan?.price}원이 결제됩니다.</p>
              </div>
              <div className="bg-orange-50 p-5 rounded-[1.5rem] border border-orange-100">
                <p className="font-black text-orange-900 mb-1">📢 가격 변동 안내</p>
                <p className="text-orange-700 text-sm font-medium">본 가격은 베타 전용이며, 정식 서비스 시점에 주보 이용 금액이 인상될 수 있습니다.</p>
              </div>
            </div>
          </DialogHeader>
          <div className="flex gap-3 mt-8">
            <Button variant="outline" onClick={() => setShowTrialDialog(false)} className="flex-1 rounded-[1.2rem] h-14 border-slate-200 text-slate-500 font-bold">취소</Button>
            <Button onClick={() => { handleStartPayment(selectedPlan); setShowTrialDialog(false); }} className="flex-1 rounded-[1.2rem] h-14 bg-blue-600 hover:bg-blue-700 border-none font-black text-white shadow-xl shadow-blue-100">주보 결제 진행하기</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 정기결제 동의 다이얼로그 — 신규. showTrialDialog(기존 1회성 결제
          안내)와는 별개 컴포넌트이고, "동의하고 카드 등록하기"는
          handleConfirmRecurring()을 통해 useBillingKey.ts만 호출한다. */}
      <Dialog open={showRecurringDialog} onOpenChange={setShowRecurringDialog}>
        <DialogContent className="rounded-[2rem] sm:rounded-[2.5rem] max-w-md bg-white border-none p-5 sm:p-8 font-sans">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black text-slate-900 text-center tracking-tight">정기결제 등록</DialogTitle>
            <div className="text-base pt-6 space-y-4">
              <div className="bg-emerald-50 p-5 rounded-[1.5rem] border border-emerald-100 space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-emerald-700 font-bold">요금제</span>
                  <span className="text-emerald-900 font-black">{featuredTier.value} · {FEATURE_PLAN_LABELS[selectedFeaturePlan]}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-emerald-700 font-bold">결제 금액</span>
                  <span className="text-emerald-900 font-black">{PRICING_MATRIX[featuredTier.value]?.[selectedFeaturePlan]?.monthly?.toLocaleString()}원 / 월</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-emerald-700 font-bold">결제 주기</span>
                  <span className="text-emerald-900 font-black">매월 자동 결제</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-emerald-700 font-bold">다음 결제 예정일</span>
                  <span className="text-emerald-900 font-black">{addMonthsClamped(new Date(), 1).toLocaleDateString()}</span>
                </div>
              </div>
              <p className="text-slate-500 text-[13px] font-medium leading-relaxed break-keep">
                카드를 등록하면 첫 달 {PRICING_MATRIX[featuredTier.value]?.[selectedFeaturePlan]?.monthly?.toLocaleString()}원이 바로 결제되고, 이후 매월 결제일에 등록된 카드로 자동 결제됩니다. 마이페이지(관리자 홈 &gt; 결제 관리)에서 언제든 해지할 수 있으며, 해지 시 다음 결제일부터 청구되지 않습니다.
              </p>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <Checkbox
                  checked={recurringAgreed}
                  onCheckedChange={(v) => setRecurringAgreed(v === true)}
                  className="mt-0.5"
                />
                <span className="text-[13px] font-bold text-slate-700 leading-relaxed">
                  (필수) 정기결제 및{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setShowRecurringDialog(false);
                      setTimeout(() => document.getElementById("refund")?.scrollIntoView({ behavior: "smooth", block: "start" }), 300);
                    }}
                    className="text-blue-600 underline underline-offset-2"
                  >
                    환불·해지 정책
                  </button>
                  에 동의합니다.
                </span>
              </label>
            </div>
          </DialogHeader>
          <div className="flex gap-3 mt-8">
            <Button variant="outline" onClick={() => setShowRecurringDialog(false)} className="flex-1 rounded-[1.2rem] h-14 border-slate-200 text-slate-500 font-bold">취소</Button>
            <Button
              onClick={() => handleConfirmRecurring(!!currentUserInfo?.hasBillingKey)}
              disabled={!recurringAgreed || registeringRecurring}
              className="flex-1 rounded-[1.2rem] h-14 bg-emerald-600 hover:bg-emerald-700 border-none font-black text-white shadow-xl shadow-emerald-100 disabled:opacity-50"
            >
              {registeringRecurring ? "처리 중..." : currentUserInfo?.hasBillingKey ? "동의하고 등록된 카드로 결제" : "동의하고 카드 등록하기"}
            </Button>
          </div>
          {currentUserInfo?.hasBillingKey && (
            <button
              type="button"
              onClick={() => handleConfirmRecurring(false)}
              disabled={!recurringAgreed || registeringRecurring}
              className="mt-3 w-full text-center text-[13px] font-bold text-slate-400 underline underline-offset-2 disabled:opacity-50"
            >
              다른 카드로 결제하기
            </button>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showLoginGuardDialog} onOpenChange={setShowLoginGuardDialog}>
        <DialogContent className="rounded-[2rem] sm:rounded-[2.5rem] max-w-md bg-white border-none p-5 sm:p-8 font-sans">
          <DialogHeader>
            <div className="flex justify-center mb-4"><div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center"><LogIn className="w-8 h-8 text-blue-600" /></div></div>
            <DialogTitle className="text-2xl font-black text-slate-900 text-center tracking-tight">로그인이 필요합니다</DialogTitle>
            <DialogDescription className="text-center pt-2 text-slate-500 font-medium break-keep">스테이온의 모든 플랜은 <span className="text-blue-600 font-bold">첫 가입 시 1개월 무료 체험</span> 혜택을 드립니다. 먼저 로그인 후 혜택을 받아보세요!</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 mt-8">
            <Button onClick={() => { setLoginReturnTo("/pricing"); navigate("/login"); }} className="w-full rounded-[1.2rem] h-14 bg-blue-600 hover:bg-blue-700 border-none font-black text-white shadow-lg">로그인하고 1개월 무료 체험</Button>
            <Button variant="ghost" onClick={() => setShowLoginGuardDialog(false)} className="w-full rounded-[1.2rem] h-12 text-slate-400 font-bold">다음에 할게요</Button>
          </div>
        </DialogContent>
      </Dialog>
      <KakaoChannelButton />
    </div>
  );
}
