import { useState, useEffect } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router";
import { auth, db } from "../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { motion } from "framer-motion";
import {
  Check, ArrowLeft, Sparkles, Info, User, LogIn, Lock, MessageCircle, Clock, Calendar
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "../components/ui/dialog";
import { usePayment } from "../../hooks/usePayment";
import { useWebsitePayment } from "../../hooks/useWebsitePayment";
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

  const [showTrialDialog, setShowTrialDialog] = useState(false);
  const [showLoginGuardDialog, setShowLoginGuardDialog] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentUserInfo, setCurrentUserInfo] = useState<{
    email: string; churchName: string; status: string; uid: string; congregationSize: string;
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
            congregationSize: data.congregationSize || ""
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
      buyerEmail: currentUserInfo?.email || "",
      buyerName: currentUserInfo?.churchName || "교회담당자"
    });
  };

  if (loading) return null;

  return (
    <div className="min-h-screen bg-[#F2F4F6] p-4 py-8 md:py-12 transition-colors duration-500 font-sans">
      <div className="container mx-auto max-w-6xl">
        <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
          <Button variant="ghost" onClick={() => navigate(-1)} className="rounded-full text-slate-600 hover:bg-slate-200 self-start">
            <ArrowLeft className="w-4 h-4 mr-2" /> 돌아가기
          </Button>
          {currentUserInfo && (
            <div className="flex items-center gap-3 px-5 py-2.5 bg-white rounded-full border border-slate-200 shadow-sm animate-in fade-in slide-in-from-top-2 duration-500">
              <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white shadow-inner"><User className="w-4 h-4" /></div>
              <div className="flex flex-col">
                <span className="text-[11px] font-bold text-blue-600 leading-tight">결제 계정 확인</span>
                <span className="text-sm font-black text-slate-800 leading-tight">
                  {currentUserInfo.churchName} <span className="font-normal opacity-60 text-slate-500">({currentUserInfo.email})</span>
                </span>
              </div>
            </div>
          )}
        </div>

        {/* 서비스 탭: 주보 서비스(기존, PG 결제 가능) / 홈페이지 제작(안내 전용) */}
        <div className="flex justify-center mb-10">
          <div className="inline-flex items-center bg-white p-1.5 rounded-full shadow-sm border border-slate-200">
            <button
              onClick={() => setActiveTab("bulletin")}
              className={`px-5 sm:px-6 py-2.5 rounded-full text-sm font-bold transition-all ${activeTab === "bulletin" ? "bg-blue-600 text-white shadow-md" : "text-slate-500 hover:text-slate-700"}`}
            >
              주보 서비스
            </button>
            <button
              onClick={() => setActiveTab("website")}
              className={`px-5 sm:px-6 py-2.5 rounded-full text-sm font-bold transition-all ${activeTab === "website" ? "bg-blue-600 text-white shadow-md" : "text-slate-500 hover:text-slate-700"}`}
            >
              홈페이지 제작
            </button>
          </div>
        </div>

        {activeTab === "bulletin" ? (
        <>
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 text-blue-600 text-xs sm:text-sm font-bold mb-4">
            <Sparkles className="w-4 h-4" /> 모바일 주보 최저가 Beta Special Price
          </div>
          
          {/* 모바일에서는 텍스트를 줄이고 크기를 최적화 (스마트 주보 특별 혜택가) */}
          <h1 className="text-3xl sm:text-5xl font-black mb-4 bg-gradient-to-r from-blue-700 to-indigo-700 bg-clip-text text-transparent leading-tight tracking-tight">
            스마트 주보 특별 혜택가
          </h1>
          
          <p className="text-base sm:text-xl text-slate-600 break-keep font-medium">
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
          className="mb-10 p-5 rounded-2xl bg-white border flex items-start gap-3 max-w-3xl mx-auto"
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

        {!isAdminPath && !currentUserInfo && (
          <Card className="mb-12 p-6 md:p-8 rounded-[2.5rem] bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-0 shadow-xl shadow-blue-200 max-w-4xl mx-auto relative overflow-hidden group animate-in fade-in zoom-in-95 duration-500">
            <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left relative z-10">
              <div>
                <h3 className="text-2xl font-black mb-2">🎁 무료 주보 제작 1개월 체험</h3>
                <p className="text-blue-50 opacity-90 font-medium">어떤 플랜을 선택하셔도 첫 달은 0원으로 스마트 주보의 모든 기능을 체험하실 수 있습니다.</p>
              </div>
              <Button size="lg" onClick={() => navigate("/signup")} className="bg-white text-blue-600 hover:bg-slate-50 rounded-full px-10 font-black w-full md:w-auto border-none h-14 shadow-lg active:scale-95 transition-transform">지금 무료 주보 시작</Button>
            </div>
          </Card>
        )}

        {/* 가입 시 입력한 성도 수 기준으로 요금제가 자동 책정된다는 점을 분명히 안내 */}
        <div className="max-w-3xl mx-auto mb-8 p-5 rounded-2xl bg-blue-50 border border-blue-100 flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-blue-800 font-medium leading-relaxed break-keep">
            {userTier ? (
              <>가입 시 입력하신 평균 출석 성도 수 기준(<strong>{userTier} · {featuredTier.rangeLabel}</strong>)으로 아래 <strong>{userTier}</strong> 요금제가 자동으로 하이라이트됩니다. 다른 등급의 요금제는 선택하실 수 없으며, 등급 변경이 필요하시면 우측 하단 1:1 문의를 이용해주세요.</>
            ) : currentUserInfo ? (
              <>가입 정보에 성도 수가 등록되어 있지 않아 전체 요금제를 자유롭게 선택하실 수 있습니다. 정확한 안내가 필요하시면 우측 하단 1:1 문의를 이용해주세요.</>
            ) : (
              <>로그인하시면 가입 시 입력하신 평균 출석 성도 수를 기준으로 이용 가능한 요금제가 자동으로 하이라이트돼요. 지금은 전체 요금제를 자유롭게 둘러보실 수 있습니다.</>
            )}
          </p>
        </div>

        {/* 대표 티어(로그인 + 성도 수 등록 시 본인 등급, 그 외엔 개척 기본값)를 원래의 넓은 카드 스타일로 강조 노출 */}
        <div className="text-center mb-6">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900 text-white text-xs font-bold">
            {userTier ? `${featuredTier.value} · ${featuredTier.rangeLabel} 교회 맞춤 요금제` : `${featuredTier.value} 단계 · ${featuredTier.rangeLabel} 시작 요금제`}
          </span>
          <br></br>
          <br></br>
        </div>

        {featuredIsEnterprise ? (
          <div className="flex justify-center mb-10">
            <Card className="relative p-10 rounded-[2.5rem] border-0 bg-white shadow-2xl ring-2 ring-blue-500 max-w-md w-full text-center">
              <div className={`w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br ${TIER_GRADIENT[featuredTier.value]} flex items-center justify-center text-white mb-6 shadow-lg shadow-blue-100`}>
                <MessageCircle className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-black mb-2 text-slate-900">{featuredTier.value} 티어 맞춤 상담</h3>
              <p className="text-sm mb-8 font-bold text-slate-500">{featuredTier.rangeLabel} 규모 교회는 담당자가 직접 맞춤 요금을 안내해드려요.</p>
              <Button onClick={() => window.open(KAKAO_CHANNEL_URL, "_blank")} className={`w-full rounded-[1.3rem] py-8 font-black border-none shadow-md transition-all active:scale-95 text-lg bg-gradient-to-r ${TIER_GRADIENT[featuredTier.value]} hover:opacity-90 text-white shadow-lg shadow-blue-100 flex items-center justify-center gap-2`}>
                <MessageCircle className="w-5 h-5" /> 1:1 문의하기
              </Button>
            </Card>
          </div>
        ) : (
          <div className="flex justify-center mb-10">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 w-full max-w-4xl">
              {(["monthly", "threeMonth"] as const).map((duration) => {
                const plan = buildTierPlan(featuredTier, duration);
                if (!plan) return null;
                const isThreeMonth = duration === "threeMonth";
                return (
                  <Card key={duration} className={`relative p-8 rounded-[2.5rem] border-0 transition-all duration-300 flex flex-col ${isThreeMonth ? "ring-2 ring-blue-500 shadow-2xl bg-white md:scale-105 z-10" : "bg-white shadow-sm"}`}>
                    {isThreeMonth && (
                      <div className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap">
                        <div className="bg-blue-600 text-white px-5 py-1.5 rounded-full text-[11px] font-black shadow-lg uppercase tracking-wider">추천 모바일 주보 플랜</div>
                      </div>
                    )}
                    <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${TIER_GRADIENT[featuredTier.value]} flex items-center justify-center text-white mb-6 shadow-lg shadow-blue-100`}>
                      {isThreeMonth ? <Calendar className="w-6 h-6" /> : <Clock className="w-6 h-6" />}
                    </div>
                    <h3 className="text-2xl font-black mb-2 text-slate-900">{featuredTier.value} {plan.period} 플랜</h3>
                    <p className="text-sm mb-6 font-bold text-slate-500">{featuredTier.rangeLabel} 교회를 위한 요금제</p>
                    <div className="mb-8"><div className="flex items-end gap-1"><span className="text-4xl font-black text-slate-900">{plan.price}</span><span className="text-slate-400 text-base mb-1.5 font-bold">원 / {plan.period}</span></div></div>
                    <Button onClick={() => handlePlanSelection(plan, featuredTier.value)} className={`w-full rounded-[1.3rem] py-8 mb-8 font-black border-none shadow-md transition-all active:scale-95 text-lg bg-gradient-to-r ${TIER_GRADIENT[featuredTier.value]} hover:opacity-90 text-white shadow-lg shadow-blue-100`}>
                      주보 시작하기
                    </Button>
                    <div className="space-y-4 flex-grow">
                      {commonFeatures.map((feature, fIndex) => (
                        <div key={fIndex} className="flex items-start gap-3">
                          <Check className="w-5 h-5 flex-shrink-0 mt-0.5 text-blue-500" />
                          <span className="text-sm leading-tight font-medium text-slate-600">{feature}</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* 나머지 성도 수 구간 요금제는 비교용으로 하단에 좀 더 작게 노출 */}
        <div className="max-w-5xl mx-auto mb-16">
          <div className="text-center mb-6">
            <br></br>
            <h2 className="text-lg font-black text-slate-900 mb-1">다른 성도 수 구간 요금제</h2>
            <p className="text-sm text-slate-500 font-medium">성도 수가 늘어나면 등급 변경이 필요해요. 변경은 1:1 문의로 도와드립니다.</p>
            <p className="text-sm text-slate-500 font-medium">선택하신 요금제 대비 이용량이 초과되는 경우, 담당자가 별도로 안내드릴 수 있습니다.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {otherTiers.map((tier) => {
              const isEnterprise = tier.monthly === null && tier.threeMonth === null;
              const locked = !isEnterprise && isTierLocked(tier.value);
              const gradient = TIER_GRADIENT[tier.value] || "from-slate-500 to-slate-600";

              return (
                <Card key={tier.value} className={`relative p-5 rounded-[1.75rem] border-0 transition-all duration-300 flex flex-col ${locked ? "bg-slate-100 opacity-70 grayscale-[0.4]" : "bg-white shadow-sm"}`}>
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
              );
            })}
          </div>
        </div>

        <Card className="max-w-3xl mx-auto mb-16 p-8 rounded-[2rem] border-0 bg-white shadow-sm">
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

        <div className="max-w-3xl mx-auto mb-12 font-sans">
          <div className="flex items-center justify-center gap-2 mb-8"><Info className="w-6 h-6 text-blue-600" /><h2 className="text-3xl font-black text-slate-900 text-center tracking-tight">교회 주보 FAQ</h2></div>
          <div className="grid gap-4">
            {[
              { q: "정말로 모바일 주보 자동 결제가 안 되나요?", a: "네, 스테이온 베타 기간에는 사용자의 동의 없는 자동 결제를 절대 진행하지 않습니다. 기간 만료 전 알림을 드리며, 직접 주보 서비스를 연장하실 때만 결제가 이루어집니다." },
              { q: "온라인 주보 990원 가격은 언제까지 유지되나요?", a: "현재 베타 버전으로 가입하신 플랜의 가격은 유지되며, 추후에 요금이 인상될 수 있습니다. 지금 사전 혜택으로 스마트 주보 제작을 가장 저렴하게 시작해 보세요." }
            ].map((faq, i) => (
              <Card key={i} className="p-6 rounded-[1.5rem] border-0 bg-white shadow-sm">
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
        <div className="flex justify-center mb-16">
          <Card className="max-w-lg w-full p-10 sm:p-12 rounded-[2.5rem] border-0 bg-white shadow-xl text-center">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-6">
              <Lock className="w-7 h-7" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-black mb-3 text-slate-900 tracking-tight">
              홈페이지 제작 서비스 준비중입니다
            </h1>
            <p className="text-sm sm:text-base text-slate-500 break-keep font-medium leading-relaxed mb-8">
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
        <DialogContent className="rounded-[2.5rem] max-w-md bg-white border-none p-8 font-sans">
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

      <Dialog open={showLoginGuardDialog} onOpenChange={setShowLoginGuardDialog}>
        <DialogContent className="rounded-[2.5rem] max-w-md bg-white border-none p-8 font-sans">
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
