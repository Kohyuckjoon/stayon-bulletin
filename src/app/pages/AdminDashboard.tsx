import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { auth, db } from "../../firebase";
import { KakaoChannelButton } from "../components/KakaoChannelButton";
import { AnimatePresence, motion } from "framer-motion";
import {
  doc, getDoc, updateDoc, serverTimestamp, collection, query,
  where, orderBy, getDocs, limit, writeBatch
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import {
  Plus, FileText, History as HistoryIcon, LogOut, Calendar, Eye, Smartphone, Download, Send,
  CheckCircle2, BookOpen, Globe, Copy, Zap, ChevronRight, ShieldCheck, Lock, Megaphone,
  X, Sparkles, Youtube, ExternalLink, ChevronLeft, Briefcase
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "../components/ui/dialog";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { useJobBoardEnabled } from "../../hooks/useJobBoardEnabled";

export function AdminDashboard() {
  const navigate = useNavigate();
  const { enabled: jobBoardEnabled } = useJobBoardEnabled();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [showWelcomeDialog, setShowWelcomeDialog] = useState(false); // 팝업 이름 변경 (신규 유저 환영)
  const [showTrialDialog, setShowTrialDialog] = useState(false);
  const [userData, setUserData] = useState<any>(null);
  const [daysLeft, setDaysLeft] = useState<number | null>(null);
  const [recentBulletins, setRecentBulletins] = useState<any[]>([]);
  const [publishedBulletin, setPublishedBulletin] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showNoticeBanner, setShowNoticeBanner] = useState(true);
  
  const [bannerNotices, setBannerNotices] = useState<any[]>([]);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);

  // 왼쪽 공지사항 카드 슬라이드를 위한 전용 인덱스 상태 추가
  const [noticeCardIndex, setNoticeCardIndex] = useState(0);

  // 우측 카드에 표시할 최대 3개의 공지사항 목록을 관리할 상태 추가
  const [cardNotices, setCardNotices] = useState<any[]>([]);

  // 좌측 배너 타이머를 제어하기 위한 타이머 레퍼런스(ref) 추가
  const bannerTimerRef = useRef<NodeJS.Timeout | null>(null);

  const isExpired = daysLeft !== null && daysLeft <= 0;
  const fixedViewUrl = auth.currentUser ? `${window.location.origin}/view/${auth.currentUser.uid}` : "";

  const bannerSlides = [
    {
      id: "retreat",
      tag: "SPECIAL SERVICE",
      title: "수련회 준비, 스테이온 플랫폼과 함께 해보세요!",
      desc: "수련회 준비에 필요한 모든 과정을 스마트하게 해결하세요.",
      badge: "수련회 플랫폼 게시",
      link: "https://place.stayon-platform.com/",
      isExternal: true,
      icon: <Sparkles className="w-6 h-6 animate-pulse text-blue-400" />,
      buttonText: "플랫폼 바로가기",
    },
    {
      id: "youtube",
      tag: "YOUTUBE",
      title: "STAYON Youtube 채널 공식 출연!",
      desc: "사역자들을 위한 스테이온 주보 / 수련회 플랫폼 활용 가이드와 생생한 소개 영상을 확인해보세요.",
      badge: "YOUTUBE",
      link: "https://www.youtube.com/watch?v=VqkVecqG_Sg&t=258s",
      isExternal: true,
      icon: <Youtube className="w-6 h-6 animate-bounce text-red-400" />,
      buttonText: "영상 시청하기",
    },
    {
      id: "notice",
      tag: "ADMIN NOTICE",
      title: "새로운 공지사항 탭이 활성화 되었습니다.",
      desc: "교회 행정 효율화를 위한 최신 업데이트 소식을 전체 공지에서 확인해 보세요.",
      badge: "UPDATE",
      link: "/admin/notify",
      isExternal: false,
      icon: <Megaphone className="w-6 h-6 animate-bounce text-blue-400" />,
      buttonText: "공지 보러가기",
    },
    {
      id: "teams",
      tag: "PLACE PLATFORM",
      title: "외부사역팀 섭외, 스테이온 플레이스에서 한번에!",
      desc: "수련회·집회에 필요한 외부 사역팀을 스테이온 플레이스에서 손쉽게 섭외해보세요.",
      badge: "팀 섭외",
      link: "https://place.stayon-platform.com/teams",
      isExternal: true,
      icon: <Briefcase className="w-6 h-6 animate-bounce text-indigo-400" />,
      buttonText: "사역팀 섭외하기",
    },
  ];

  // 좌측 배너 자동 슬라이드 및 수동 조작 시 타이머를 리셋/재시작하는 함수 정의
  const startBannerTimer = () => {
    if (bannerTimerRef.current) clearInterval(bannerTimerRef.current);
    bannerTimerRef.current = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % bannerSlides.length);
    }, 6000);
  };

  useEffect(() => {
    startBannerTimer();
    return () => {
      if (bannerTimerRef.current) clearInterval(bannerTimerRef.current);
    };
  }, [bannerSlides.length]);

  const handlePrevBanner = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentSlide((prev) => (prev - 1 + bannerSlides.length) % bannerSlides.length);
    startBannerTimer();
  };

  // 좌측 배너 수동 다음(>) 버튼 핸들러 (타이머 초기화 포함)
  const handleNextBanner = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentSlide((prev) => (prev + 1) % bannerSlides.length);
    startBannerTimer();
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % bannerSlides.length);
    }, 6000); // 6초마다 자동 전환
    return () => clearInterval(timer);
  }, [bannerSlides.length]);

  const activeBanner = bannerSlides[currentSlide];

  const handleBannerClick = () => {
    if (activeBanner.isExternal) {
      window.open(activeBanner.link, "_blank", "noopener,noreferrer");
    } else {
      navigate(activeBanner.link);
    }
  };

  // 1. 남은 일수 계산 로직 (수정: 결제 개월 수 반영)
  const calculateDaysLeft = (startDateInput: any, durationMonths: number = 0) => {
    if (!startDateInput) return 0;

    let startDate: Date;
    if (typeof startDateInput.toDate === 'function') {
      startDate = startDateInput.toDate();
    } else {
      startDate = new Date(startDateInput);
    }

    const endDate = new Date(startDate);
    // 수정 포인트: durationMonths가 0이면 입력된 날짜를 그대로 만료일로 사용합니다.
    // 결제 로직에서 이미 미래 날짜를 저장한다면 0을 넘겨야 합니다.
    if (durationMonths > 0) {
      endDate.setMonth(startDate.getMonth() + durationMonths);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const targetDate = new Date(endDate);
    targetDate.setHours(0, 0, 0, 0);

    const diffTime = targetDate.getTime() - today.getTime();
    // Math.ceil을 사용하면 오늘 기준 24시간 미만으로 남았을 때 1일로 표기됩니다.
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays;
  };

  // 슬라이더를 위한 현재 인덱스 상태 추가
  const [currentNoticeIndex, setCurrentNoticeIndex] = useState(0);

  // StayOn 섹션의 자동 하이라이트를 위한 상태
  const [activeFeatureIndex, setActiveFeatureIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  const handleClose = async () => {
    setShowTrialDialog(false); // 팝업 닫기
    if (auth.currentUser) {
      try {
        const userRef = doc(db, "users", auth.currentUser.uid);
        // DB의 isTrialUsed 필드를 true로 업데이트
        await updateDoc(userRef, { isTrialUsed: true });
      } catch (error) {
        console.error("팝업 상태 업데이트 실패:", error);
      }
    }
  };

  // 2. 프리미엄 상태 UI 구성 (디자인 유지)
  const getPremiumStatusUI = () => {
    const days = daysLeft ?? 0;

    if (days <= 0) {
      return {
        cardBg: "bg-white",
        iconBg: "bg-slate-900",
        textColor: "text-slate-900",
        badgeBg: "bg-slate-100 text-slate-600 border-slate-200",
        title: "이용 기간이 만료되었습니다",
        desc: "모든 기능이 제한되었습니다. 서비스를 계속하시려면 연장 결제가 필요합니다.",
        accentColor: "text-blue-600",
        isUrgent: true,
        label: "만료"
      };
    }
    if (days === 1) {
      return {
        cardBg: "bg-white",
        iconBg: "bg-red-500",
        textColor: "text-red-600",
        badgeBg: "bg-red-50 text-red-600 border-red-100",
        title: `오늘 프리미엄 기능이 만료됩니다`,
        desc: "내일부터 서비스 이용이 전면 제한됩니다. 지금 연장하세요!",
        accentColor: "text-red-600",
        isUrgent: true,
        label: `D-1`
      };
    }
    if (days <= 3) {
      return {
        cardBg: "bg-white",
        iconBg: "bg-orange-500",
        textColor: "text-orange-600",
        badgeBg: "bg-orange-50 text-orange-600 border-orange-100",
        title: `프리미엄 만료까지 ${days}일 남았습니다`,
        desc: "중단 없는 서비스를 위해 미리 결제 정보를 확인해주세요.",
        accentColor: "text-orange-600",
        isUrgent: false,
        label: `D-${days}`
      };
    }
    return {
      cardBg: "bg-white",
      iconBg: "bg-blue-600",
      textColor: "text-blue-600",
      badgeBg: "bg-blue-50 text-blue-600 border-blue-100",
      title: "프리미엄 기능을 사용 중입니다",
      desc: "제한 없는 주보 발행과 모든 관리 도구를 이용하고 있습니다.",
      accentColor: "text-blue-600",
      isUrgent: false,
      label: `D-${days}`
    };
  };

  const statusUI = getPremiumStatusUI();

  const fetchBulletinsData = async (uid: string) => {
    try {
      setIsLoading(true);
      const bulletinsRef = collection(db, "bulletins");
      const recentQuery = query(bulletinsRef, where("authorId", "==", uid), orderBy("date", "desc"), limit(5));
      const recentSnap = await getDocs(recentQuery);
      setRecentBulletins(recentSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));

      const publishedQuery = query(bulletinsRef, where("authorId", "==", uid), where("status", "==", "published"), orderBy("publishedAt", "desc"), limit(1));
      const publishedSnap = await getDocs(publishedQuery);
      if (!publishedSnap.empty) {
        setPublishedBulletin({ id: publishedSnap.docs[0].id, ...publishedSnap.docs[0].data() });
      } else {
        setPublishedBulletin(null);
      }
    } catch (error: any) {
      console.error("데이터 로드 에러:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userRef);

        if (userDoc.exists()) {
          const data = userDoc.data();
          setUserData(data);

          let calculated;

          if (data.lastPaymentDate) {
            calculated = calculateDaysLeft(data.lastPaymentDate, 0);
          }

          else if (data.createdAt) {
            calculated = calculateDaysLeft(data.createdAt, 1);
          }
          else {
            const now = new Date().toISOString();
            await updateDoc(userRef, { createdAt: now });
            calculated = 30;
          }

          setDaysLeft(calculated);

          if (data.isTrialUsed !== true) {
            setShowTrialDialog(true);
          }
        }
        fetchBulletinsData(user.uid);
      } else {
        navigate("/login");
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  // 공지사항 코드
  useEffect(() => {
    const fetchBannerNotices = async () => {
      try {
        const q = query(collection(db, "notices"), orderBy("createdAt", "desc"), limit(3));
        const querySnapshot = await getDocs(q);
        const list = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (list.length > 0) {
          setBannerNotices(list);
          setCardNotices(list);
        }
      } catch (error) {
        console.error("배너 공지 로드 실패:", error);
      }
    };
    fetchBannerNotices();
  }, []);

  // 왼쪽 카드 6초마다 슬라이드
  useEffect(() => {
    if (bannerNotices.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentSlideIndex((prev) => (prev + 1) % bannerNotices.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [bannerNotices]);

  // 오른쪽 카드 6초 마다 슬라이드
  useEffect(() => {
    if (cardNotices.length <= 1) return;
    const cardTimer = setInterval(() => {
      setNoticeCardIndex((prev) => (prev + 1) % cardNotices.length);
    }, 6000);
    return () => clearInterval(cardTimer);
  }, [cardNotices]);

  const handlePublish = async (bulletinId: string) => {
    if (isExpired) {
      toast.error("기간이 만료되었습니다. 결제 후 이용 가능합니다.");
      navigate("/admin/pricing");
      return;
    }
    if (!auth.currentUser) return;
    try {
      const uid = auth.currentUser.uid;
      const batch = writeBatch(db);
      const bulletinsRef = collection(db, "bulletins");
      const q = query(bulletinsRef, where("authorId", "==", uid), where("status", "==", "published"));
      const snapshot = await getDocs(q);
      snapshot.forEach((d) => batch.update(doc(db, "bulletins", d.id), { status: "archived" }));
      batch.update(doc(db, "bulletins", bulletinId), { status: "published", publishedAt: serverTimestamp() });
      await batch.commit();
      toast.success("게시 완료!");
      fetchBulletinsData(uid);
    } catch (error) {
      toast.error("오류 발생");
    }
  };

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(fixedViewUrl);
    toast.success("복사되었습니다!");
  };

  const downloadQRCode = () => {
    const svg = document.getElementById("bulletin-qr");
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      if (ctx) {
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
      }
      const pngFile = canvas.toDataURL("image/png");
      const downloadLink = document.createElement("a");
      downloadLink.download = `${userData?.churchName}_qr.png`;
      downloadLink.href = pngFile;
      downloadLink.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  };

  const stats = [
    { label: "전체 주보", value: recentBulletins.length.toString(), icon: <FileText className="w-6 h-6" />, color: "from-blue-500 to-blue-600" },
    { label: "이번 달 조회수", value: (userData?.monthlyViews || 0).toLocaleString(), icon: <Eye className="w-6 h-6" />, color: "from-purple-500 to-purple-600" },
    { label: "프리미엄 남은 일수", value: daysLeft !== null ? (daysLeft <= 0 ? "만료" : `${daysLeft}일`) : "계산 중", icon: <Calendar className="w-6 h-6" />, color: daysLeft !== null && daysLeft <= 3 ? "from-red-500 to-orange-600" : (daysLeft !== null && daysLeft <= 7 ? "from-emerald-500 to-teal-600" : "from-blue-500 to-indigo-600") }
  ];

  const currentNotice = bannerNotices.length > 0 ? bannerNotices[currentSlideIndex] : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 font-sans">
      <style>{`
        @keyframes strongGlow {
          0% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); border-color: rgba(59, 130, 246, 0); }
          50% { box-shadow: 0 0 30px 8px rgba(59, 130, 246, 0.5); border-color: rgba(59, 130, 246, 0.6); }
          100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); border-color: rgba(59, 130, 246, 0); }
        }
        .animate-strong-glow {
          animation: strongGlow 2s infinite ease-in-out;
          border-width: 2px;
        }
        .locked-feature {
          filter: grayscale(1) opacity(0.5) blur(1px);
          pointer-events: none;
          user-select: none;
          cursor: not-allowed;
        }
      `}</style>

      <div className="bg-white/80 backdrop-blur-md border-b border-slate-100 sticky top-0 z-30 shadow-xs">
        <div className="container mx-auto px-4 py-3.5 max-w-5xl">
          <div className="flex justify-between items-center relative">
            {/* 좌측: 로고 및 사용자 정보 영역 */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center shadow-md shadow-blue-500/20 text-white">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">{userData?.churchName || "불러오는 중..."}</h1>
                  <span className={`hidden sm:inline-flex px-2 py-0.5 rounded-md text-[10px] font-extrabold items-center gap-1 border ${statusUI.badgeBg}`}>
                    <ShieldCheck className="w-3 h-3" /> {userData?.status === "premium" ? "PREMIUM" : "FREE TRIAL"}
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-medium">{userData?.department || "관리자"}</p>
              </div>
            </div>

            {/* 중앙: 정중앙 로고 */}
            <div className="absolute left-1/2 -translate-x-1/2 hidden md:block">
              {/* <button onClick={() => window.location.href = "https://stayon-bulletin.com/"} className="font-black text-xl tracking-tighter hover:opacity-70 transition-opacity">
                <span className="text-black">STAY ON</span>
              </button> */}
              <button onClick={() => window.location.href = "https://bulletin.stayon-platform.com/"} className="font-black text-xl tracking-tighter hover:opacity-70 transition-opacity">
                <span className="text-black">STAY ON</span>
              </button>
            </div>

            {/* 우측: 청빙 게시판 + 주보 미리보기 + 로그아웃 버튼 그룹 */}
            <div className="flex items-center gap-2">
              {jobBoardEnabled ? (
                <button
                  onClick={() => navigate("/jobs", { state: { from: "admin" } })}
                  className="flex items-center gap-1.5 shrink-0 bg-blue-600 text-white px-3 sm:px-4 py-2 sm:py-2.5 rounded-full shadow-md active:scale-95 transition-all text-xs sm:text-sm font-black relative"
                >
                  <Briefcase className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                  <span className="hidden xs:inline">사역자</span> 청빙 게시판
                  <span className="w-2 h-2 bg-red-400 rounded-full"></span>
                </button>
              ) : (
                <button
                  disabled
                  className="flex items-center gap-1.5 shrink-0 bg-gray-100 text-gray-400 px-3 sm:px-4 py-2 sm:py-2.5 rounded-full text-xs sm:text-sm font-black cursor-not-allowed"
                >
                  <Lock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400" />
                  <span className="hidden xs:inline">사역자</span> 청빙 게시판
                </button>
              )}

              <Button variant="outline" onClick={() => window.open(fixedViewUrl, "_blank")} className="rounded-xl h-10 px-4 hidden sm:flex border-slate-200 bg-slate-50/50 text-slate-700 font-bold hover:bg-slate-100 hover:text-blue-600 text-xs">
                주보 미리보기
              </Button>

              <Button variant="ghost" onClick={() => auth.signOut()} className="rounded-xl h-10 w-10 text-slate-400 hover:bg-red-50 hover:text-red-500">
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-5 max-w-5xl">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-6 items-stretch">
          <div
            onClick={handleBannerClick}
            className="lg:col-span-7 bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 rounded-[1.75rem] px-6 py-8 text-white shadow-md flex flex-col md:flex-row items-center justify-between gap-6 border border-blue-800/40 relative overflow-hidden cursor-pointer group transition-all"
          >
            {/* 우측 상단 메테리얼 수동 전환 버튼 그룹 */}
            <div className="absolute top-4 right-5 flex items-center gap-1 z-30">
              <button
                onClick={handlePrevBanner}
                className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center text-white transition-colors"
                aria-label="이전 배너"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={handleNextBanner}
                className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center text-white transition-colors"
                aria-label="다음 배너"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-blue-500/10 rounded-full blur-2xl pointer-events-none"></div>

            <div className="flex items-center gap-4 z-10 w-full md:w-auto min-w-0 overflow-hidden">
              <div className="w-12 h-12 rounded-2xl bg-blue-600/30 border border-blue-400/30 flex items-center justify-center flex-shrink-0 shadow-inner">
                {activeBanner.icon}
              </div>
              <div className="min-w-0 flex-1">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeBanner.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.4 }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="bg-blue-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full tracking-wider uppercase shadow-xs">
                        {activeBanner.badge}
                      </span>
                      <span className="text-xs text-blue-200 font-medium">{activeBanner.tag}</span>
                    </div>
                    <h2 className="text-xs sm:text-sm font-bold text-white tracking-tight truncate group-hover:text-blue-300 transition-colors">
                      {activeBanner.title}
                    </h2>
                    <p className="text-[11px] text-blue-200/80 truncate mt-0.5">
                      {activeBanner.desc}
                    </p>
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            <div className="flex items-center gap-3 z-10 flex-shrink-0 w-full md:w-auto justify-end translate-y-3">
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  handleBannerClick();
                }}
                className="bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-xl font-bold text-xs px-5 py-2.5 transition-all w-full md:w-auto cursor-pointer flex-shrink-0 flex items-center gap-1.5"
              >
                {activeBanner.buttonText}
                <ExternalLink className="w-3.5 h-3.5 opacity-70" />
              </Button>
            </div>

            <div className="absolute bottom-2.5 right-6 flex items-center gap-1.5 z-20">
              {bannerSlides.map((_, idx) => (
                <span
                  key={idx}
                  className={`h-1 rounded-full transition-all duration-300 ${currentSlide === idx ? "w-4 bg-blue-400" : "w-1 bg-white/30"
                    }`}
                />
              ))}
            </div>
          </div>

          {/* <Card
            className="lg:col-span-5 p-5 rounded-[1.75rem] border border-blue-100 bg-white shadow-sm flex flex-col justify-between cursor-pointer group hover:shadow-md hover:border-blue-300 transition-all"
            onClick={() => toast.info("스마트 주보 핵심 가이드 준비중입니다!")}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-blue-600">
                <Sparkles className="w-4 h-4" />
                <span className="text-[11px] font-extrabold tracking-wider uppercase">SMART GUIDE</span>
              </div>
              <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></span>
            </div>
            <div>
              <h4 className="text-sm font-black text-gray-900 group-hover:text-blue-600 transition-colors">스마트 주보 200% 활용하기</h4>
              <p className="text-[11px] text-gray-500 mt-0.5 font-medium">핵심 기능 가이드 보기</p>
            </div>
          </Card> */}

          <Card
            className="lg:col-span-5 p-5 rounded-[1.75rem] border border-blue-100 bg-white shadow-sm flex flex-col justify-between cursor-pointer group hover:shadow-md hover:border-blue-300 transition-all relative overflow-hidden"
            onClick={() => navigate("/admin/notify")}
          >
            {cardNotices.length > 0 ? (
              <div className="flex flex-col justify-between h-full w-full">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5 text-blue-600">
                    <Megaphone className="w-4 h-4" />
                    {/* <span className="text-[11px] font-extrabold tracking-wider uppercase">BULLETIN NOTICE</span> */}
                    <span className="text-[13px] font-extrabold tracking-wider uppercase">공지사항</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-gray-400 group-hover:text-blue-600 transition-colors flex items-center gap-0.5">
                      더보기 <ChevronRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
                <div>
                  {/* 2줄까지 표시되도록 line-clamp-2와 wrapping 관련 클래스 적용 */}
                  <h4 className="text-sm font-black text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-2 break-all">
                    {cardNotices[0]?.title || "공지사항 제목"}
                  </h4>
                  <p className="text-[11px] text-gray-500 mt-1 font-medium truncate">
                    {cardNotices[0]?.content || cardNotices[0]?.desc || "주보 플랫폼 최신 공지사항을 확인하세요."}
                  </p>
                </div>
              </div>
            ) : (
              // 등록된 공지가 없을 경우 기존 스마트 가이드로 안전하게 대체 노출
              <div className="flex flex-col justify-between h-full w-full">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5 text-blue-600">
                    <Sparkles className="w-4 h-4" />
                    <span className="text-[11px] font-extrabold tracking-wider uppercase">SMART GUIDE</span>
                  </div>
                  <span className="text-[11px] font-bold text-gray-400 group-hover:text-blue-600 transition-colors flex items-center gap-0.5">
                    더보기 <ChevronRight className="w-3 h-3" />
                  </span>
                </div>
                <div>
                  <h4 className="text-sm font-black text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-2">스마트 주보 200% 활용하기</h4>
                  <p className="text-[11px] text-gray-500 mt-1 font-medium">핵심 기능 가이드 보기</p>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* <Card
          className={`mb-8 p-0 rounded-[2rem] border-0 overflow-hidden shadow-xl bg-white group cursor-pointer transition-all duration-500 ${statusUI.isUrgent ? 'animate-strong-glow ring-2 ring-blue-400' : ''}`}
          onClick={() => navigate("/admin/pricing")}
        >
          <div className="flex flex-col md:flex-row items-stretch">
            <div className={`${statusUI.iconBg} p-8 flex items-center justify-center text-white transition-colors duration-500`}>
              <Zap className="w-10 h-10 animate-pulse" />
            </div>
            <div className="p-8 flex-1 flex flex-col md:flex-row items-center justify-between gap-6 bg-white">
              <div>
                <h3 className={`text-xl font-bold mb-1 flex items-center gap-2 ${statusUI.textColor}`}>
                  {statusUI.title} <span className={`${statusUI.badgeBg} text-[10px] px-2 py-0.5 rounded-full tracking-tighter font-black border`}>{statusUI.label}</span>
                </h3>
                <p className="text-gray-500 font-medium">{statusUI.desc}</p>
              </div>
              <div className={`flex items-center gap-2 font-black group-hover:gap-4 transition-all ${statusUI.accentColor}`}>
                연장 및 결제하기 <ChevronRight className="w-5 h-5" />
              </div>
            </div>
          </div>
        </Card> */}

        <Card className={`border-none shadow-md overflow-hidden rounded-[1.75rem] transition-all relative h-full flex flex-row items-stretch ${statusUI.cardBg} ${statusUI.isUrgent ? 'animate-strong-glow' : ''}`}>

          {/* 좌측 파란색 아이콘 박스 (모바일: w-24, PC: sm:w-32) */}
          <div className={`w-24 sm:w-32 min-h-[120px] ${statusUI.iconBg} flex items-center justify-center relative overflow-hidden shrink-0`}>
            <div className="absolute inset-0 bg-black/5"></div>
            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white shadow-inner relative z-10">
              <Zap className="w-6 h-6 sm:w-8 sm:h-8 fill-white/20 animate-pulse" />
            </div>
          </div>

          {/* 우측 본문 영역 (가로 배치 유지, 모바일 글자/패딩 축소) */}
          <div className="p-4 sm:p-6 flex-1 min-w-0 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <h2 className="text-xs sm:text-base font-black text-slate-900 tracking-tight truncate">
                  {statusUI.title}
                </h2>
                <span className={`px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-black inline-flex items-center gap-1 border shrink-0 ${statusUI.badgeBg}`}>
                  <Calendar className="w-3 h-3" /> {statusUI.label}
                </span>
              </div>

              <p className="text-[11px] sm:text-xs text-slate-600 font-medium truncate mb-2">
                {statusUI.desc}
              </p>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <button
                onClick={() => navigate("/admin/pricing")}
                className="text-[11px] sm:text-xs font-black text-blue-600 hover:text-blue-700 flex items-center gap-1 group cursor-pointer"
              >
                연장 및 결제하기
                <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
          </div>

        </Card>

        <div className="grid md:grid-cols-3 gap-6 mb-8 mt-6">
          {/* <div className="grid md:grid-cols-3 gap-6 mb-8"> */}
          {stats.map((stat, index) => (
            <Card key={index} className="p-6 rounded-3xl border-0 bg-white shadow-sm hover:shadow-md transition-all">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-gray-500 font-bold mb-1 text-sm">{stat.label}</p>
                  <p className="text-3xl font-black text-gray-900">{stat.value}</p>
                </div>
                <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${stat.color} flex items-center justify-center text-white shadow-lg`}>
                  {stat.icon}
                </div>
              </div>
            </Card>
          ))}
        </div>

        <div className="mb-10 relative">
          <div className="grid md:grid-cols-2 gap-4 mb-6">
            <Card onClick={() => !isExpired && navigate("/admin/editor")} className={`p-6 rounded-3xl border-0 bg-gradient-to-br from-blue-600 to-indigo-700 text-white transition-all group shadow-lg ${isExpired ? 'locked-feature' : 'cursor-pointer hover:shadow-2xl hover:-translate-y-1'}`}>
              <div className="flex items-center gap-5">
                <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center group-hover:scale-110 transition-transform">
                  {isExpired ? <Lock className="w-8 h-8" /> : <Plus className="w-8 h-8" />}
                </div>
                <div>
                  <h3 className="text-xl font-bold mb-1">새 주보 만들기</h3>
                  <p className="text-blue-100 opacity-80 text-sm">주보를 작성하고 즉시 발행하세요</p>
                </div>
              </div>
            </Card>
            <Card onClick={() => !isExpired && navigate("/admin/history")} className={`p-6 rounded-3xl border-0 bg-white transition-all group shadow-sm border border-gray-50 ${isExpired ? 'locked-feature' : 'cursor-pointer hover:shadow-xl'}`}>
              <div className="flex items-center gap-5">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white group-hover:scale-110 transition-transform shadow-lg">
                  {isExpired ? <Lock className="w-8 h-8" /> : <HistoryIcon className="w-8 h-8" />}
                </div>
                <div>
                  <h3 className="text-xl font-bold mb-1 text-gray-900">주보 히스토리</h3>
                  <p className="text-gray-500 text-sm font-medium">과거 주보 보기 및 간편 재사용</p>
                </div>
              </div>
            </Card>
          </div>

          <Card className={`mb-6 p-8 rounded-[2rem] border-0 bg-white shadow-lg overflow-hidden relative border border-blue-50 transition-all ${isExpired ? 'locked-feature' : ''}`}>
            <div className="flex flex-col md:flex-row items-center gap-8">
              <div className="w-20 h-20 rounded-3xl bg-blue-50 flex items-center justify-center text-blue-600 shadow-inner flex-shrink-0">
                <Globe className="w-10 h-10 animate-pulse" />
              </div>
              <div className="flex-1 text-center md:text-left">
                <div className="flex flex-col md:flex-row items-center gap-3 mb-3">
                  <h3 className="text-2xl font-black text-gray-900 tracking-tight">현재 게시 중인 주보</h3>
                  {publishedBulletin ? (
                    <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-600 text-white text-[10px] font-black shadow-sm border border-blue-700 uppercase tracking-widest">
                      <CheckCircle2 className="w-3.5 h-3.5" /> LIVE 게시 중
                    </span>
                  ) : (
                    <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-500 text-xs font-bold border border-gray-200">
                      게시된 주보 없음
                    </span>
                  )}
                </div>
                {publishedBulletin ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 py-2">
                    <div className="flex items-center justify-center md:justify-start gap-2 text-gray-600 font-bold"><Calendar className="w-5 h-5 text-blue-500" />{publishedBulletin.date}</div>
                    <div className="flex items-center justify-center md:justify-start gap-2 text-gray-600 font-bold"><BookOpen className="w-5 h-5 text-purple-500" />{publishedBulletin.scripture || "본문 없음"}</div>
                    <div className="flex items-center justify-center md:justify-start gap-2 text-gray-600 font-bold"><FileText className="w-5 h-5 text-emerald-500" />{publishedBulletin.title}</div>
                  </div>
                ) : (
                  <p className="text-gray-400 font-medium">작성된 주보를 '게시하기'하면 QR에 즉시 반영됩니다.</p>
                )}
              </div>
              <Button disabled={!publishedBulletin || isExpired} onClick={() => publishedBulletin && window.open(fixedViewUrl, "_blank")} className="bg-gray-900 hover:bg-black text-white px-8 py-6 rounded-2xl font-bold shadow-lg transition-all">성도 화면 확인</Button>
            </div>
          </Card>

          <Card className={`p-8 rounded-[2rem] border-0 bg-white shadow-lg overflow-hidden relative group border border-blue-50 transition-all ${isExpired ? 'locked-feature' : ''}`}>
            <div className="relative z-10 flex flex-col md:flex-row items-center gap-10">
              <div className="bg-white p-4 rounded-3xl shadow-sm border border-gray-100">
                <QRCodeSVG id="bulletin-qr" value={fixedViewUrl} size={150} />
              </div>
              <div className="flex-1 text-center md:text-left">
                <div className="flex flex-col md:flex-row items-center gap-3 mb-4">
                  <div className="px-4 py-1.5 bg-blue-600 text-white rounded-full text-[10px] font-black tracking-widest uppercase">Active</div>
                  <h3 className="text-2xl font-black text-gray-900 tracking-tight">부서 고정 QR 코드</h3>
                </div>
                <p className="text-gray-600 text-base leading-relaxed mb-6 font-medium">이 QR 하나로 매주 새롭게 발행되는 주보를 확인할 수 있습니다.</p>
                <div className="flex flex-wrap gap-3 justify-center md:justify-start">
                  <Button onClick={() => !isExpired && downloadQRCode()} disabled={isExpired} className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-6 rounded-2xl font-bold shadow-lg transition-all">
                    <Download className="w-4 h-4 mr-2" /> QR 이미지 저장
                  </Button>
                  <Button onClick={() => !isExpired && copyToClipboard()} disabled={isExpired} variant="outline" className="px-8 py-6 rounded-2xl font-bold border-gray-200 text-gray-600 hover:bg-gray-50 shadow-sm transition-all">
                    <Copy className="w-4 h-4 mr-2" /> 링크 복사
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
        <div className={`mt-12 transition-all ${isExpired ? 'relative' : ''}`}>
          <div className="flex justify-between items-center mb-6 px-2">
            <h2 className="text-2xl font-bold flex items-center gap-2"><div className="w-2 h-6 bg-purple-600 rounded-full"></div>최근 주보 리스트</h2>
            <Button variant="ghost" onClick={() => !isExpired && navigate("/admin/history")} disabled={isExpired} className="rounded-full font-bold text-gray-500 hover:text-purple-600">전체보기</Button>
          </div>

          <div className="space-y-4">
            {isLoading ? (
              <div className="text-center py-20 bg-white/50 rounded-3xl border-2 border-dashed border-gray-100">
                <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                <p className="text-gray-400 font-medium">데이터 로딩 중...</p>
              </div>
            ) : recentBulletins.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-[2rem] border border-gray-100 shadow-sm">
                {/* <FileText className="w-16 h-16 text-gray-100 mx-auto mb-4" />
                <p className="text-gray-400 font-medium mb-4">아직 작성된 주보가 없습니다</p>
                <Button onClick={() => navigate("/admin/editor")} variant="outline" className="rounded-full border-blue-100 text-blue-600 font-bold">첫 주보 만들기</Button> */}

                {isExpired ? (
                  <>
                    <Lock className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500 font-medium mb-4">이용 기간이 만료되어 주보를 이용할 수 없습니다</p>
                    <Button
                      onClick={() => navigate("/admin/pricing")}
                      className="rounded-full bg-blue-600 text-white font-bold hover:bg-blue-700 px-6"
                    >
                      연장 및 결제하기
                    </Button>
                  </>
                ) : (
                  <>
                    <FileText className="w-16 h-16 text-gray-100 mx-auto mb-4" />
                    <p className="text-gray-400 font-medium mb-4">아직 작성된 주보가 없습니다</p>
                    <Button
                      onClick={() => navigate("/admin/editor")}
                      variant="outline"
                      className="rounded-full border-blue-100 text-blue-600 font-bold"
                    >
                      첫 주보 만들기
                    </Button>
                  </>
                )}
              </div>
            ) : (
              recentBulletins.map((bullet) => {
                const isCurrentlyActive = publishedBulletin?.id === bullet.id;
                return (
                  <Card key={bullet.id} className={`p-6 rounded-[2rem] border-0 bg-white shadow-sm hover:shadow-xl transition-all group ${isCurrentlyActive ? 'ring-4 ring-blue-500 bg-blue-50/20 shadow-blue-100' : ''} ${isExpired ? 'locked-feature' : ''}`}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                      <div className="flex items-center gap-5 flex-1">
                        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-inner transition-all ${isCurrentlyActive ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                          {isExpired ? <Lock className="w-8 h-8" /> : <FileText className="w-8 h-8" />}
                        </div>
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <h3 className="font-bold text-xl text-gray-900 group-hover:text-blue-600 transition-colors">{bullet.title}</h3>
                            {isCurrentlyActive && (
                              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest">
                                <Globe className="w-3 h-3" /> 게시 중
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm font-bold text-gray-400">
                            <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4" />{bullet.date}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                        <Button
                          disabled={isCurrentlyActive || isExpired}
                          onClick={() => handlePublish(bullet.id)}
                          className={`flex-1 sm:flex-none rounded-2xl font-black transition-all shadow-md ${isCurrentlyActive ? 'bg-gray-100 text-gray-400 border-0' : isExpired ? 'bg-gray-200 text-gray-400' : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:scale-105'}`}
                        >
                          <Send className="w-4 h-4 mr-2" /> {isCurrentlyActive ? "게시 중" : "게시하기"}
                        </Button>
                        <Button variant="outline" className="flex-1 sm:flex-none rounded-2xl font-bold border-gray-100 hover:bg-gray-50 px-6 py-2" onClick={() => window.open(`${window.location.origin}/view/${bullet.id}`, "_blank")}>미리보기</Button>
                        <Button disabled={isExpired} variant="outline" className="flex-1 sm:flex-none rounded-2xl font-bold bg-gray-50 border-0 text-gray-600 hover:bg-gray-100 px-6 py-2" onClick={() => navigate(`/admin/editor/${bullet.id}`)}>수정하기</Button>
                      </div>
                    </div>
                  </Card>
                );
              })
            )}
          </div>
        </div>
      </div>

      <Dialog open={showTrialDialog} onOpenChange={setShowTrialDialog}>
        <DialogContent className="rounded-[2.5rem] max-w-md border-0 p-8 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-3xl font-black tracking-tight text-center">환영합니다! 🎉</DialogTitle>
            <div className="text-base pt-6 space-y-6 text-center">
              <div className="bg-blue-50 p-6 rounded-[1.5rem] border border-blue-100">
                <p className="font-bold text-blue-900 text-lg mb-1">1개월 무료 체험이 시작되었습니다</p>
                <p className="text-blue-700 font-medium opacity-80">{daysLeft && daysLeft > 0 ? daysLeft : 30}일 동안 모든 기능을 마음껏 써보세요!</p>
              </div>
            </div>
          </DialogHeader>
          {/* <Button onClick={() => setShowTrialDialog(false)} className="w-full rounded-2xl py-7 bg-gradient-to-r from-blue-600 to-indigo-600 hover:shadow-xl font-bold text-lg mt-4 transition-all text-white">지금 시작하기</Button> */}
          <Button onClick={handleClose} className="w-full rounded-2xl py-7 bg-gradient-to-r from-blue-600 to-indigo-600 hover:shadow-xl font-bold text-lg mt-4 transition-all text-white">지금 시작하기</Button>
        </DialogContent>
      </Dialog>
      <KakaoChannelButton />
    </div>
  );
}
