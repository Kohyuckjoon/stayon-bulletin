import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { auth, db } from "../../firebase";
import { collection, query, orderBy, getDocs, doc, getDoc } from "firebase/firestore";
import { signOut, onAuthStateChanged, setPersistence, browserSessionPersistence } from "firebase/auth";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { AlertCircle } from 'lucide-react';
import { KakaoChannelButton } from "../components/KakaoChannelButton";
import { NoticeImageCarousel } from "../components/NoticeImageCarousel";
import { useJobBoardEnabled } from "../../hooks/useJobBoardEnabled";
import {
  Smartphone, TrendingDown, Clock, Edit, Sparkles, ChevronRight, ChevronLeft, MousePointerClick,
  QrCode, UserPlus, Rocket, HelpCircle, Plus, Minus, Monitor, BellRing, CreditCard, Building, MapPin,
  Users, Lock, MessageCircle, Volume2, Megaphone, Briefcase, ExternalLink, X
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "../components/ui/dialog";

interface ExtraService {
  id: number;
  icon: React.ReactNode;
  tickerIcon: React.ReactNode; // 모바일 하단 흐르는 카드용 축소 아이콘
  tag: string;
  tagColor: string;
  title: React.ReactNode;
  shortTitle: string; // 모바일 하단 흐르는 카드용 한 줄 제목(줄바꿈 없는 일반 텍스트)
  description: string;
  externalUrl: string;
  isReady: boolean;
}

const extraServices: ExtraService[] = [
  {
    id: 1,
    icon: <Building className="w-10 h-10 text-slate-400" />,
    tickerIcon: <Building className="w-5 h-5" />,
    tag: "대기중",
    tagColor: "bg-slate-100 text-slate-500 border-slate-200",
    title: <>올 해, 우리 교회<br />수련회 장소는 어디?</>,
    shortTitle: "수련회 장소, 어디로 갈까?",
    description: "전국 수련회 전용 기도원, 수양관 정보를 한눈에 비교하고 예약하는 서비스를 준비하고 있습니다.",
    externalUrl: "#",
    isReady: false
  },
  {
    id: 2,
    icon: <Users className="w-10 h-10 text-slate-400" />,
    tickerIcon: <Users className="w-5 h-5" />,
    tag: "런칭 완료",
    tagColor: "bg-blue-50 text-blue-500 border-blue-100",
    title: <>올 해, 우리 교회<br />수련회 장소는 어디?</>,
    shortTitle: "수련회 장소, 최저가로 예약",
    description: "전국 수련회 전용 기도원, 수양관, 캠프장 정보를 한눈에 비교하고 최저가로 예약하세요.",
    externalUrl: "https://place.stayon-platform.com/",
    isReady: true
  },
  {
    id: 3,
    icon: <Briefcase className="w-10 h-10 text-slate-400" />,
    tickerIcon: <Briefcase className="w-5 h-5" />,
    tag: "런칭 완료",
    tagColor: "bg-blue-50 text-blue-500 border-blue-100",
    title: <>필요한 사역팀,<br />지금 바로 섭외하세요</>,
    shortTitle: "외부사역팀, 지금 바로 섭외",
    description: "찬양팀, 음향·조명, 강사 등 우리 교회에 필요한 외부 사역팀을 지금 바로 찾아 섭외해보세요.",
    externalUrl: "https://place.stayon-platform.com/teams",
    isReady: true
  },
  {
    id: 4,
    icon: <MapPin className="w-10 h-10 text-slate-400" />,
    tickerIcon: <MapPin className="w-5 h-5" />,
    tag: "지도 검색",
    tagColor: "bg-slate-100 text-slate-500 border-slate-200",
    title: <>가까운 수련회<br />장소, 지도로 찾기</>,
    shortTitle: "가까운 수련회 장소, 지도로",
    description: "우리 교회에서 가장 가까운 최적의 수련회 장소를 지도 기반으로 찾는 기능을 개발하고 있습니다.",
    externalUrl: "#",
    isReady: false
  }
];

// 모바일 전용 "다른 서비스" 흐르는 카드 목록. /teams 페이지의 "지금 주목받는 사역팀" 티커와
// 동일한 방식(카드 배열을 이어붙여 2배로 만들고 -50%까지 끊김없이 흐르게 함)을 그대로 가져왔다.
function ExtraServicesTicker({ services, onOpen }: { services: ExtraService[]; onOpen: (url: string, isReady: boolean) => void }) {
  const [paused, setPaused] = useState(false);
  if (services.length === 0) return null;
  // 카드 수가 적어도 루프가 짧아 보이지 않도록 최소 반복 횟수를 채운 뒤 두 벌을 이어붙인다.
  const repeat = Math.max(1, Math.ceil(8 / services.length));
  const base = Array.from({ length: repeat }, () => services).flat();
  const looped = [...base, ...base];
  const duration = base.length * 4.5; // 카드가 커진 만큼 체감 속도가 비슷하게 유지되도록 항목당 재생시간도 같이 늘림

  return (
    <div
      className="relative w-full overflow-hidden -mx-4 px-4"
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setPaused(false)}
    >
      <style>{`
        @keyframes extraServicesTickerScrollX {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
      `}</style>
      <div className="absolute top-0 bottom-0 left-0 w-10 bg-gradient-to-r from-[#F9FAFB] to-transparent z-10 pointer-events-none" />
      <div className="absolute top-0 bottom-0 right-0 w-10 bg-gradient-to-l from-[#F9FAFB] to-transparent z-10 pointer-events-none" />
      <div
        className="flex items-center gap-4 w-max"
        style={{ animation: `extraServicesTickerScrollX ${duration}s linear infinite`, animationPlayState: paused ? "paused" : "running" }}
      >
        {looped.map((service, i) => (
          <button
            type="button"
            key={`${service.id}-${i}`}
            onClick={() => onOpen(service.externalUrl, service.isReady)}
            className="relative w-[196px] h-[132px] rounded-[22px] shrink-0 overflow-hidden text-left bg-white border border-gray-100 shadow-[0_4px_16px_rgba(0,0,0,0.06)] active:scale-95 transition-transform"
          >
            <div className="h-full flex flex-col justify-between p-4">
              <div className="w-11 h-11 rounded-xl bg-[#F2F4F6] flex items-center justify-center text-[#3182F6] shrink-0 [&>svg]:w-5 [&>svg]:h-5">
                {service.tickerIcon}
              </div>
              <div>
                <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-black mb-1.5 ${service.tagColor}`}>{service.tag}</span>
                <p className="text-[14px] font-black text-[#191F28] leading-snug line-clamp-2 break-keep">{service.shortTitle}</p>
              </div>
            </div>
            {!service.isReady && (
              <div className="absolute inset-0 bg-white/55 backdrop-blur-[1px] flex items-center justify-center">
                <Lock className="w-5 h-5 text-[#ADB5BD]" />
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Landing() {
  const navigate = useNavigate();
  const { enabled: jobBoardEnabled } = useJobBoardEnabled();
  const [activeStep, setActiveStep] = useState(0);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [previewIdx, setPreviewIdx] = useState(0);

  // 현재 로그인한 사용자 정보를 담을 state 추가
  const [currentUser, setCurrentUser] = useState<any>(null);

  // 페이지가 부드럽게 사라지는(디졸브) 효과를 제어할 페이드아웃 상태값
  const [isFadingOut, setIsFadingOut] = useState(false);

  // 공지사항 스크롤을 위한 Ref
  const noticeRef = useRef<HTMLDivElement>(null);

  // 하드코딩된 notices 대신 Firestore에서 불러온 공지 데이터를 담을 상태(State) 선언
  const [notices, setNotices] = useState<any[]>([]);
  const [loadingNotices, setLoadingNotices] = useState(true);

  // 메인 화면에서 공지사항 클릭 시 내용을 보여주기 위한 상세 모달 상태 추가
  const [selectedNotice, setSelectedNotice] = useState<any>(null);

  // 멀티 카드 슬라이드 인덱스 상태 (3개씩 순환 노출)
  const [heroCardIdx, setHeroCardIdx] = useState(0);

  // 3단계 가이드 자동 슬라이드 및 사용자 인터랙션 타이머 제어를 위한 상태 및 Ref 추가
  const [guideStepIdx, setGuideStepIdx] = useState(0);
  const guideTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 사용자 직접 클릭 여부를 확인하여 6초 자동 타이머를 일시정지/재개하기 위한 상태값
  const [isPausedByClick, setIsPausedByClick] = useState(false);
  const pauseTimerRef = useRef<NodeJS.Timeout | null>(null);

  const scrollToNotice = () => {
    noticeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Firestore "notices" 컬렉션에서 공지사항 목록을 가져오는 함수 정의
  const fetchLandingNotices = async () => {
    try {
      setLoadingNotices(true);
      const q = query(collection(db, "notices"), orderBy("createdAt", "desc"));
      const querySnapshot = await getDocs(q);
      const list = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setNotices(list);
    } catch (error) {
      console.error("메인 화면 공지사항 로드 실패:", error);
    } finally {
      setLoadingNotices(false);
    }
  };

  useEffect(() => {
    // 컴포넌트 마운트 시 공지사항 데이터 페치 실행
    fetchLandingNotices();

    const initAuthPersistence = async () => {
      try {
        await setPersistence(auth, browserSessionPersistence);
      } catch (error) {
        console.error("세션 유지 설정 에러:", error);
      }
    };

    initAuthPersistence();

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userDocRef = doc(db, "users", user.uid);
          const userDocSnap = await getDoc(userDocRef);

          if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            setCurrentUser({
              ...user,
              churchName: userData.churchName || "우리 교회"
            });
          } else {
            setCurrentUser(user);
          }
        } catch (error) {
          console.error("유저 교회 정보 로드 에러:", error);
          setCurrentUser(user);
        }
      } else {
        setCurrentUser(null);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const heroSlideItems = [
    {
      id: 1,
      badge: "핵심 기능 01",
      title: "종이 주보 이제 안녕,\n스마트 모바일 주보",
      desc: "매주 인쇄하고 접던 번거로움 없이 스마트폰으로 즉시 확인하세요.",
      image: "/screen_03.png",
      bgGradient: "from-blue-600 to-indigo-700"
    },
    {
      id: 2,
      badge: "핵심 기능 02",
      title: "PC에서 5분 만에\n뚝딱 완성하는 주보",
      desc: "직관적인 관리자 페이지에서 텍스트만 입력하면 끝납니다.",
      image: "/screen_04.png",
      bgGradient: "from-purple-600 to-blue-600"
    },
    {
      id: 3,
      badge: "핵심 기능 03",
      title: "예배당 입구 QR로\n간편하게 접속",
      desc: "성도들은 앱 설치 없이 카메라로 스캔해 바로 주보를 봅니다.",
      image: "/screen_03.png",
      bgGradient: "from-slate-900 to-blue-950"
    },
    {
      id: 4,
      badge: "합리적인 요금",
      title: "커피 한 잔 값보다\n저렴한 월 990원",
      desc: "부담 없는 비용으로 교회 행정 효율을 극적으로 높여보세요.",
      image: "/screen_04.png",
      bgGradient: "from-blue-700 to-cyan-700"
    },
    {
      id: 5,
      badge: "사역 지원",
      title: "실시간 수정과\n편리한 소식 공유",
      desc: "오타나 일정 변경 시 즉시 반영되어 성도들에게 전달됩니다.",
      image: "/screen_03.png",
      bgGradient: "from-indigo-900 to-purple-900"
    }
  ];

  // const previewScreens = [
  //   {
  //     title: "1. PC에서 5분 만에 뚝딱",
  //     desc: "직관적인 관리자 페이지에서 내용만 입력하세요.",
  //     imgSrc: "/screen_04.png",
  //     icon: <Monitor className="w-6 h-6 text-blue-600" />
  //   },
  //   {
  //     title: "2. 모바일 주보 즉시 완성",
  //     desc: "성도들은 세련된 모바일 주보를 바로 확인합니다.",
  //     imgSrc: "/screen_03.png",
  //     icon: <Smartphone className="w-6 h-6 text-purple-600" />
  //   }
  // ];

  const previewScreens = [
    {
      title: "1. 종이에서 스마트폰으로",
      desc: "매주 출력하던 번거로운 종이 주보, 이제 스마트폰으로 간편하게 바꿔보세요.",
      imgSrc: "/stayon_jubo_01.png",
      icon: <Monitor className="w-6 h-6 text-blue-600" />
    },
    {
      title: "2. 매주 단 3단계면 끝",
      desc: "복잡한 과정 없이 쉽고 빠르게 모바일 주보를 발행하세요.",
      imgSrc: "/stayon_jubo_02.png",
      icon: <Smartphone className="w-6 h-6 text-purple-600" />
    },
    {
      title: "3. 앱 설치가 필요 없습니다",
      desc: "QR 코드 또는 링크 하나로 언제 어디서나 성도들이 즉시 확인합니다.",
      imgSrc: "/stayon_jubo_03.png",
      icon: <QrCode className="w-6 h-6 text-orange-600" />
    },
    {
      title: "4. 매주 종이 출력, 계속 하실 건가요?",
      desc: "월 990원의 합리적인 비용으로 종이 주보의 모든 불편함을 해결하세요.",
      imgSrc: "/stayon_jubo_04.png",
      icon: <TrendingDown className="w-6 h-6 text-emerald-600" />
    },
    {
      title: "5. 실제 비용을 비교해 보세요",
      desc: "1년 사용 기준, 인쇄비용과 행정 수고를 모두 극적으로 절감합니다.",
      imgSrc: "/stayon_jubo_05.png",
      icon: <CreditCard className="w-6 h-6 text-indigo-600" />
    }
  ];

  // "1. 종이에서 스마트폰으로" 캐러셀 섹션 바로 위에 놓는 3카드 요약 섹션 (ajd.co.kr 참고)
  const quickHighlights = [
    {
      title: "종이에서\n스마트폰으로",
      desc: "매주 출력하던 번거로운 종이 주보,\n이제 스마트폰으로 간편하게 바꿔보세요.",
      icon: <Monitor className="w-7 h-7 text-blue-600" />,
      iconBg: "bg-blue-50",
      image: "/c1.png"
    },
    {
      title: "앱 설치가\n필요 없습니다",
      desc: "QR 코드 또는 링크 하나로\n언제 어디서나 성도들이 즉시 확인합니다.",
      icon: <QrCode className="w-7 h-7 text-orange-600" />,
      iconBg: "bg-orange-50",
      image: "/c2.png"
    },
    {
      title: "실제 비용을\n비교해 보세요",
      desc: "1년 사용 기준, 인쇄비용과\n행정 수고를 모두 극적으로 절감합니다.",
      icon: <CreditCard className="w-7 h-7 text-indigo-600" />,
      iconBg: "bg-indigo-50",
      image: "/c3.png"
    }
  ];

  // [EXTENSION] "다른 서비스도 이용해보세요" PC 카드: 실제 이용 가능한(오픈된) 서비스가 여러 개면
  // 중앙 자리에서 5초마다 서로 교차(크로스페이드)되어 표시된다. 준비 중인 서비스는 좌우에 고정된다.
  const openExtraServices = extraServices.filter((s) => s.isReady);
  const lockedExtraServices = extraServices.filter((s) => !s.isReady);
  const [centerOpenIndex, setCenterOpenIndex] = useState(0);
  const [centerFading, setCenterFading] = useState(false);
  const openExtraServicesCount = openExtraServices.length;

  useEffect(() => {
    if (openExtraServicesCount <= 1) return;
    const slideInterval = setInterval(() => {
      setCenterFading(true);
      setTimeout(() => {
        setCenterOpenIndex((prev) => (prev + 1) % openExtraServicesCount);
        setCenterFading(false);
      }, 350);
    }, 5000);

    return () => clearInterval(slideInterval);
  }, [openExtraServicesCount]);

  // 3단계 가이드 이미지 슬라이드 데이터 배열 정의
  const guideSteps = [
    {
      title: "1단계: 회원가입 및 로그인",
      desc: "이메일 또는 소셜 계정으로 1분 만에 간편하게 시작하세요.",
      imgSrc: "/STAYON_1_join.png",
      badge: "STEP 1"
    },
    {
      title: "2단계: 주보 만들기 클릭",
      desc: "관리자 페이지에서 '새 주보 만들기' 버튼을 눌러 작성을 시작합니다.",
      imgSrc: "/STAYON_2_make.png",
      badge: "STEP 2"
    },
    {
      title: "3단계: 내용 입력 후 게시하기",
      desc: "예배 순서와 소식을 입력하면 성도 화면에 즉시 실시간 반영됩니다.",
      imgSrc: "/STAYON_3_open.png",
      badge: "STEP 3"
    }
  ];

  // 6초마다 자동 슬라이드 전환 및 사용자 수동 조작 시 타이머 리셋/재시작 로직 구현
  const startGuideTimer = () => {
    if (guideTimerRef.current) clearInterval(guideTimerRef.current);
    guideTimerRef.current = setInterval(() => {
      setGuideStepIdx((prev) => (prev + 1) % guideSteps.length);
    }, 6000);
  };

  useEffect(() => {
    startGuideTimer();
    return () => {
      if (guideTimerRef.current) clearInterval(guideTimerRef.current);
    };
  }, []);


  const handleManualGuideMove = (newIdx: number) => {
    setGuideStepIdx(newIdx);
    startGuideTimer(); // 수동 클릭 시 6초 타이머 초기화 후 재시작
  };

  useEffect(() => {
    const initAuthPersistence = async () => {
      try {
        await setPersistence(auth, browserSessionPersistence);
      } catch (error) {
        console.error("세션 유지 설정 에러:", error);
      }
    };

    initAuthPersistence();

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          // Firestore의 users 컬렉션에서 해당 유저 문서 가져오기
          const userDocRef = doc(db, "users", user.uid);
          const userDocSnap = await getDoc(userDocRef);

          if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            // Auth 객체와 Firestore의 교회명(churchName)을 합쳐서 state에 저장
            setCurrentUser({
              ...user,
              churchName: userData.churchName || "우리 교회"
            });
          } else {
            setCurrentUser(user);
          }
        } catch (error) {
          console.error("유저 교회 정보 로드 에러:", error);
          setCurrentUser(user);
        }
      } else {
        setCurrentUser(null);
      }
    });

    const timer = setInterval(() => {
      setPreviewIdx((prev) => (prev + 1) % previewScreens.length);
    }, 4500);

    return () => {
      clearInterval(timer);
      unsubscribe();
    };
  }, [previewScreens.length]);

  // const notices = [
  //   { id: 1, tag: "업데이트", title: "v1.2.0 버전 업데이트 안내 (이미지 업로드 기능 개선)", date: "2026.03.25" },
  //   { id: 2, tag: "점검", title: "현재 점검 예정이 없습니다.", date: "2026.03.24" },
  //   { id: 3, tag: "안내", title: "베타 기간 한정 990원 혜택 종료 예정 안내", date: "2026.03.20" }
  // ];

  const tutorialSteps = [
    { title: "1단계: 가입 및 교회 등록", description: "1분 만에 우리 교회만의 전용 공간을 만듭니다. 복잡한 절차 없이 이메일만으로 시작하세요.", icon: <UserPlus className="w-12 h-12 text-blue-500" />, color: "bg-blue-50" },
    { title: "2단계: 주보 내용 채우기", description: "예배 순서, 교회 소식, 말씀 본문을 입력하세요. 직관적인 편집기로 누구나 쉽게 만들 수 있습니다.", icon: <MousePointerClick className="w-12 h-12 text-purple-500" />, color: "bg-purple-50" },
    { title: "3단계: QR 및 링크로 배포", description: "생성된 QR코드를 예배당 입구에 비치하거나, URL을 카톡으로 공유하세요. 성도는 앱 설치 없이 즉시 주보를 확인합니다.", icon: <QrCode className="w-12 h-12 text-orange-500" />, color: "bg-orange-50" }
  ];

  const features = [
    { icon: <TrendingDown className="w-8 h-8" />, title: "종이 주보 사용료 절감", description: "친환경 디지털 주보로 전환하여 매주 발생하는 종이 인쇄 비용을 획기적으로 줄이세요." },
    { icon: <Smartphone className="w-8 h-8" />, title: "실시간 모바일 주보 수정", description: "오타나 예배 순서 변경사항을 즉시 반영하여 성도들에게 실시간 배포할 수 있습니다." },
    { icon: <QrCode className="w-8 h-8" />, title: "간편한 QR코드 주보 배포", description: "성도들은 카메라만 갖다 대면 오늘의 교회 주보를 스마트폰으로 바로 읽을 수 있습니다." },
    { icon: <Edit className="w-8 h-8" />, title: "쉬운 온라인 주보 편집기", description: "전문 디자인 지식 없이도 스마트폰으로 5분이면 예쁜 주보를 완성합니다." },
    { icon: <Clock className="w-8 h-8" />, title: "주보 제작 시간의 혁신", description: "매주 주보 제작에 쏟던 에너지를 더 중요한 사역과 성도 케어에 사용하세요." },
    { icon: <Sparkles className="w-8 h-8" />, title: "현대적인 주보 디자인", description: "모든 성도들이 가독성 있게 보기 편한 현대적인 모바일 최적화 디자인을 제공합니다." }
  ];

  const faqs = [
    { question: "스마트폰을 어려워하는 어르신들도 모바일 주보를 잘 쓰실 수 있을까요?", answer: "네! 복잡한 앱 설치 없이 카카오톡 링크 클릭 한 번으로 바로 주보를 보실 수 있도록 설계되었습니다." },
    { question: "매주 교회 주보 내용을 바꾸는 게 어렵지 않나요?", answer: "전용 관리자 페이지에서 텍스트만 입력하면 자동으로 예쁜 온라인 주보가 완성됩니다." },
    { question: "1개의 아이디로 여러 교회나 부서에서 사용할 수 있나요?", answer: "아쉽게도 지금은 1개의 아이디당 1개의 부서(교회)만 정성껏 모시고 있어요." },
    { question: "월 990원 외에 추가 비용이 있나요?", answer: "아니요. 모든 기능을 추가 비용 없이 월 990원이라는 파격적인 가격에 이용하실 수 있습니다." }
  ];

  // [SEO] 화면에 이미 보이는 FAQ 섹션(faqs) 내용 그대로 구조화 데이터(FAQPage)로도
  // 삽입 — 실제 화면 텍스트와 동일한 내용만 사용하므로 가짜 데이터 정책 위반 아님
  useEffect(() => {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.innerHTML = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": faqs.map((faq) => ({
        "@type": "Question",
        "name": faq.question,
        "acceptedAnswer": { "@type": "Answer", "text": faq.answer },
      })),
    });
    document.head.appendChild(script);
    return () => {
      document.head.removeChild(script);
    };
  }, []);

  const nextStep = () => setActiveStep((prev) => (prev + 1) % tutorialSteps.length);
  const prevStep = () => setActiveStep((prev) => (prev - 1 + tutorialSteps.length) % tutorialSteps.length);

  return (
    <div className={`min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 selection:bg-blue-100 font-sans overflow-x-hidden relative transition-opacity duration-900 ${isFadingOut ? 'opacity-0' : 'opacity-100'}`}>
      {/* 상단 헤더 - place.stayon-platform.com 참고: 떠있는 pill 바가 아니라 화면 끝까지 꽉 찬
          납작한 흰색 바 + 텍스트 위주 메뉴 스타일. 아래 container(px-4)의 바깥, 페이지 최상위
          div의 직계 자식으로 둬서 자연스럽게 풀폭으로 나온다 (transform breakout 불필요). */}
      <header className="w-full bg-white/95 backdrop-blur-md sticky top-0 z-50 border-b border-slate-100">
        <nav className="max-w-7xl mx-auto flex justify-between items-center py-4 sm:py-5 px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 bg-slate-900 rounded-lg flex items-center justify-center cursor-pointer" onClick={() => navigate("/")}>
                <Smartphone className="w-5 h-5 text-white" />
              </div>
              <div className="flex flex-col cursor-pointer" onClick={() => navigate("/")}>
                <span className="text-base sm:text-lg font-black text-slate-900 tracking-tight leading-[1.1]">
                  STAYON
                </span>
                <span className="text-[10px] font-bold text-blue-500 tracking-widest uppercase -mt-0.5">
                  JUBO
                </span>
              </div>
            </div>
            <div className="flex items-center gap-0.5 md:gap-1">
              {/* 데스크톱 전용 메뉴 - 납작한 텍스트 스타일 */}
              <Button variant="ghost" onClick={scrollToNotice} className="text-slate-600 font-bold hover:text-slate-900 hover:bg-transparent rounded-md px-3 hidden md:flex">공지사항</Button>
              <Button variant="ghost" onClick={() => navigate("/pricing")} className="text-slate-600 font-bold hover:text-slate-900 hover:bg-transparent rounded-md px-3 hidden md:flex">990원 요금 안내</Button>

              {jobBoardEnabled ? (
                <Button
                  variant="ghost"
                  onClick={() => navigate("/jobs")}
                  className="text-blue-600 font-bold hover:text-blue-700 hover:bg-transparent rounded-md px-3 hidden md:flex items-center gap-1.5 relative"
                >
                  <Briefcase className="w-4 h-4 text-blue-600" />
                  사역자 청빙
                  <span className="absolute -top-0.5 right-0 w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  disabled
                  className="text-slate-400 font-bold rounded-md px-3 hidden md:flex items-center gap-1.5 cursor-not-allowed hover:bg-transparent"
                >
                  <Lock className="w-4 h-4 text-slate-400" />
                  사역자 청빙
                </Button>
              )}

              <Button
                variant="ghost"
                onClick={() => window.open("https://place.stayon-platform.com/teams", "_blank")}
                className="text-indigo-600 font-bold hover:text-indigo-700 hover:bg-transparent rounded-md px-3 hidden md:flex items-center gap-1.5"
              >
                <Users className="w-4 h-4 text-indigo-600" />
                외부사역팀 섭외
              </Button>

              <Button
                variant="ghost"
                disabled
                className="text-slate-400 font-bold rounded-md px-3 hidden md:flex items-center gap-1.5 relative cursor-not-allowed hover:bg-transparent"
              >
                <Lock className="w-4 h-4 text-slate-400" />
                교회 홈페이지 제작
              </Button>

              <span className="hidden md:block w-px h-5 bg-slate-200 mx-1.5" />

              <Button
                onClick={() => {
                  setIsFadingOut(true);
                  setTimeout(() => {
                    navigate("/admin");
                  }, 900);
                }}
                variant={currentUser ? undefined : "outline"}
                className={`font-bold rounded-full px-3 md:px-5 items-center gap-1.5 transition-all duration-200 text-xs md:text-sm flex ${currentUser
                  ? "bg-gray-900 text-white hover:bg-black border-transparent"
                  : "border-slate-300 text-slate-700 hover:bg-slate-50"
                  }`}
              >
                <ExternalLink className="w-3.5 h-3.5 opacity-90" />
                <span className="hidden sm:inline">주보 관리자</span>
                <span className="sm:hidden">관리자</span>
              </Button>

              {currentUser ? (
                <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-full mr-1">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                  <span className="text-xs font-bold text-blue-900 hidden sm:inline">
                    {currentUser.churchName ? `${currentUser.churchName} 접속중` : `${currentUser.email} 접속중`}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      await signOut(auth);
                    }}
                    className="text-xs text-red-600 hover:bg-red-50 font-bold h-7 px-2 rounded-md"
                  >
                    로그아웃
                  </Button>
                </div>
              ) : (
                <Button variant="ghost" onClick={() => navigate("/login")} className="text-slate-600 font-bold hover:text-slate-900 hover:bg-transparent rounded-md px-3 sm:px-4 text-xs sm:text-sm">로그인</Button>
              )}

              {!currentUser && (
                <Button onClick={() => navigate("/signup")} className="rounded-full bg-gray-900 hover:bg-black text-white font-bold px-4 sm:px-6 text-xs sm:text-sm shadow-md transition-all active:scale-95 whitespace-nowrap">무료 시작</Button>
              )}
            </div>
          </nav>
      </header>

      <div className="container mx-auto px-4 sm:px-6 pb-6 md:pb-8">
        {/* 모바일 퀵 네비게이션 (토스 스타일 칩 메뉴) - 모바일 전용 */}
        <div className="flex md:hidden gap-2 overflow-x-auto pt-4 pb-4 mb-6 no-scrollbar -mx-4 px-4 sticky top-[65px] z-40">
          <button
            onClick={scrollToNotice}
            className="flex items-center gap-1.5 shrink-0 bg-white border border-gray-100 px-4 py-2.5 rounded-full shadow-sm active:scale-95 transition-all text-sm font-black text-gray-700"
          >
            <Megaphone className="w-4 h-4 text-blue-600" /> 공지사항
          </button>
          <button
            onClick={() => navigate("/pricing")}
            className="flex items-center gap-1.5 shrink-0 bg-white border border-gray-100 px-4 py-2.5 rounded-full shadow-sm active:scale-95 transition-all text-sm font-black text-gray-700"
          >
            <CreditCard className="w-4 h-4 text-purple-600" /> 990원 요금 안내
          </button>
          <button
            onClick={() => window.open("https://place.stayon-platform.com/teams", "_blank")}
            className="flex items-center gap-1.5 shrink-0 bg-white border border-gray-100 px-4 py-2.5 rounded-full shadow-sm active:scale-95 transition-all text-sm font-black text-indigo-600"
          >
            <Users className="w-4 h-4 text-indigo-600" /> 외부사역팀 섭외
          </button>
          {jobBoardEnabled ? (
            <button
              onClick={() => navigate("/jobs")}
              className="flex items-center gap-1.5 shrink-0 bg-blue-600 text-white px-4 py-2.5 rounded-full shadow-md active:scale-95 transition-all text-sm font-black relative"
            >
              <Briefcase className="w-4 h-4 text-white" /> 사역자 청빙
              <span className="w-2 h-2 bg-red-400 rounded-full"></span>
            </button>
          ) : (
            <button
              disabled
              className="flex items-center gap-1.5 shrink-0 bg-gray-100 text-gray-400 px-4 py-2.5 rounded-full text-sm font-black cursor-not-allowed"
            >
              <Lock className="w-4 h-4 text-gray-400" /> 사역자 청빙
            </button>
          )}
          <button
            onClick={() => { /* 도움말 등 추가 기능 연결 가능 */ }}
            className="flex items-center gap-1.5 shrink-0 bg-white border border-gray-100 px-4 py-2.5 rounded-full shadow-sm active:scale-95 transition-all text-sm font-black text-gray-700 opacity-50"
          >
            <HelpCircle className="w-4 h-4" /> 가이드
          </button>
        </div>

        {/* Hero Section - 배경 이미지는 히어로 안에만 */}
        <div className="mb-16">
          <section className="relative w-screen left-1/2 -translate-x-1/2 overflow-hidden min-h-[360px] sm:min-h-[420px] lg:min-h-[480px] flex items-center bg-white">
            {/* 이미지를 늘리지 않고, 양옆 가장자리를 배경색으로 서서히 페이드시켜서(mask) 화면이
                꽉 찬 것처럼 자연스럽게 보이게 함 - 화질 저하/왜곡 없이 화면 크기와 무관하게 일관됨.
                실제 <img> 요소를 써서 mask가 이미지의 진짜 경계에 걸리도록 함(배경 이미지 방식은
                bg-contain이 실제로 차지하는 폭을 CSS만으로 알 수 없어 mask 위치가 안 맞았음) */}
            <div className="absolute inset-0 flex items-center justify-center">
              <img
                src="/background_cover.png"
                alt=""
                className="h-full w-auto max-w-none object-contain"
                style={{
                  maskImage: "linear-gradient(to right, transparent, black 12%, black 88%, transparent)",
                  WebkitMaskImage: "linear-gradient(to right, transparent, black 12%, black 88%, transparent)",
                }}
              />
            </div>
            <div className="absolute inset-x-0 bottom-0 h-32 sm:h-44 lg:h-56 bg-gradient-to-t from-white to-transparent" />

            <div className="relative container mx-auto max-w-7xl px-4 sm:px-6 lg:px-10 py-8 sm:py-10 w-full">
              <div className="max-w-xl mx-auto lg:mx-0 lg:ml-10 lg:-mt-16 text-center lg:text-left">
                <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-1.5 rounded-full text-xs font-black mb-2 border border-blue-100 shadow-[0_0_15px_rgba(37,99,235,0.25)] animate-pulse">
                  <Rocket className="w-3.5 h-3.5 text-blue-600 animate-bounce" /> 모바일 주보 제작 베타 기간 한정 혜택
                </div>

                <h1 className="text-2xl sm:text-4xl font-black mb-3 text-slate-900 tracking-tight leading-tight [text-shadow:0_2px_18px_rgba(255,255,255,0.95),0_1px_4px_rgba(255,255,255,0.9)] sm:[text-shadow:none]">
                  매주 만드는 종이 주보,
                  <br />
                  이제 <span className="relative inline-block px-2 py-0.5 text-blue-600 z-10"><span className="absolute inset-x-0 bottom-1.5 h-3.5 bg-blue-100/80 -rotate-1 rounded-sm -z-10"></span>온라인 주보</span>로 끝내세요!
                </h1>

                <p className="text-sm sm:text-base text-slate-800 sm:text-slate-600 font-semibold sm:font-medium mb-4 leading-relaxed [text-shadow:0_2px_18px_rgba(255,255,255,0.95),0_1px_4px_rgba(255,255,255,0.9)] sm:[text-shadow:none]">
                  인쇄비용과 수고는 줄이고,<br /> 성도들과의 소통은 더 편리하게 만듭니다.
                </p>

                <div className="flex flex-col sm:flex-row items-center lg:items-start justify-center lg:justify-start gap-3">
                  <button
                    onClick={() => window.open("https://bulletin.stayon-platform.com/view/8PmIDuDQXKfYp2zUj6sLX3uzMVt2", "_blank", "noopener,noreferrer")}
                    className="group inline-flex items-center justify-center gap-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black px-6 sm:px-7 py-2.5 sm:py-3 rounded-full shadow-[0_0_25px_rgba(37,99,235,0.4)] hover:shadow-[0_0_35px_rgba(37,99,235,0.55)] active:scale-95 transition-all text-sm sm:text-base w-full sm:w-auto"
                  >
                    <Smartphone className="w-5 h-5 shrink-0 animate-bounce" />
                    실제 주보 화면 지금 확인하기
                    <ExternalLink className="w-4 h-4 shrink-0 opacity-90 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                  </button>
                  <button
                    onClick={() => navigate("/signup")}
                    className="inline-flex items-center justify-center gap-1.5 bg-white hover:bg-slate-50 text-slate-800 font-black px-6 sm:px-7 py-2.5 sm:py-3 rounded-full shadow-md border border-slate-200 active:scale-95 transition-all text-sm sm:text-base w-full sm:w-auto"
                  >
                    무료로 시작하기
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* 서비스 바로가기 아이콘 5개 - 히어로와 분리된 독립 섹션, 옅은 배경 띠 */}
          <section className="relative w-screen left-1/2 -translate-x-1/2 bg-slate-50/40 py-4 sm:py-6 mt-4 sm:-mt-24">
            <div className="container mx-auto px-4 sm:px-6 max-w-7xl">
              <p className="text-center text-[10px] sm:text-xs font-black text-slate-400 tracking-widest uppercase mb-2 sm:mb-3">
                바로가기
              </p>
              <div className="grid grid-cols-5 lg:grid-cols-7 justify-items-center gap-1.5 sm:gap-3">
                {[
                  {
                    label: currentUser ? "주보 관리자" : "온라인 주보", img: "/b1-Photoroom.png", onClick: () => {
                      if (currentUser) {
                        setIsFadingOut(true);
                        setTimeout(() => navigate("/admin"), 900);
                      } else {
                        navigate("/login");
                      }
                    }
                  },
                  { label: "이용료 안내", img: "/b5-Photoroom.png", onClick: () => navigate("/pricing") },
                  { label: "수련회 장소 찾기", img: "/b2-Photoroom.png", onClick: () => window.open("https://place.stayon-platform.com/", "_blank") },
                  { label: "외부사역팀 섭외", img: "/b3-Photoroom.png", onClick: () => window.open("https://place.stayon-platform.com/teams", "_blank") },
                  { label: "이용중인 교회", img: "/b4-Photoroom.png", onClick: () => document.getElementById("preview-screens")?.scrollIntoView({ behavior: "smooth" }) },
                  { label: "준비중", img: "/b0-Photoroom.png", onClick: () => alert("서비스 준비중입니다"), desktopOnly: true },
                  { label: "준비중", img: "/b0-Photoroom.png", onClick: () => alert("서비스 준비중입니다"), desktopOnly: true },
                ].map((btn, idx) => (
                  <button key={idx} onClick={btn.onClick} className={`${btn.desktopOnly ? "hidden lg:flex" : "flex"} flex-col items-center gap-1 sm:gap-2 w-16 sm:w-24 lg:w-28 bg-white rounded-2xl shadow-md hover:shadow-lg px-2 py-2.5 sm:px-3 sm:py-3 transition-all active:scale-95 group`}>
                    <img src={btn.img} alt={btn.label} className="w-9 h-9 sm:w-12 sm:h-12 lg:w-14 lg:h-14 object-contain group-hover:-translate-y-1 transition-transform" />
                    <span className="text-[9px] sm:text-xs font-bold text-slate-700 text-center break-keep leading-tight">{btn.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        </div>

        {/* 3카드 요약 섹션 (ajd.co.kr 참고) - 바로 아래 캐러셀의 핵심 3가지를 카드로 미리 보여줌 */}
          {/* <div className="container mx-auto px-4 sm:px-6 max-w-7xl pt-8"> */}
          <div className="container mx-auto px-4 sm:px-6 max-w-7xl pt-8 sm:pt-18">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
              {quickHighlights.map((item, idx) => (
                <div key={idx} className="bg-white border border-slate-100 shadow-[0_2px_16px_rgba(15,23,42,0.05)] rounded-3xl p-7 sm:p-8">
                  <h4 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight leading-snug whitespace-pre-line mb-2">
                    {item.title}
                  </h4>
                  <p className="text-slate-500 font-medium text-sm whitespace-pre-line leading-relaxed mb-6">
                    {item.desc}
                  </p>
                  {item.image ? (
                    <img src={item.image} alt={item.title.replace(/\n/g, " ")} className="w-full rounded-2xl" />
                  ) : (
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${item.iconBg}`}>
                      {item.icon}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 훅 문구 섹션 - 3카드 요약 바로 다음, ajd.co.kr의 "이 모든 고민을 해결할 '아정당'" 구조 참고 */}
          <div className="container mx-auto px-4 sm:px-6 max-w-4xl text-center pt-25 sm:pt-45">
            <h3 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight leading-snug break-keep mb-8">
              이 모든 불편을 한번에 해결할<br className="hidden sm:block" />
              온라인 주보 <span className="text-blue-600">STAYON</span>을 만나보세요!
            </h3>
            <button
              onClick={() => navigate("/signup")}
              className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-black px-8 py-4 rounded-full shadow-[0_0_25px_rgba(37,99,235,0.4)] hover:shadow-[0_0_35px_rgba(37,99,235,0.55)] active:scale-95 transition-all text-sm sm:text-base"
            >
              무료로 시작하기
            </button>
          </div>

          {/* stayon_jubo_02.png - 미리보기 캐러셀(인디케이터) 섹션 바로 위에 새로 추가하는
              풀블리드 이미지 배너. 히어로처럼 흰색 반투명 오버레이를 씌워서 화면에 너무
              꽉 차 보이지 않고 옅게 페이드된 느낌으로 자연스럽게 깔리게 함. */}
          {/* <section className="relative w-screen left-1/2 -translate-x-1/2 overflow-hidden pt-16 sm:pt-10"> */}
          {/* <section className="relative w-screen left-1/2 -translate-x-1/2 overflow-hidden h-[240px] sm:h-[380px] lg:h-[460px]">
          <img
              src="/stayon_jubo_02.png"
              alt="STAYON 온라인 주보 미리보기"
              className="h-full w-auto max-w-none object-contain"
            />
            <div className="absolute inset-0" />
          </section> */}

          {/* 실제 화면 미리보기 캐러셀 - 원래 히어로 안에 있던 걸 그대로 별도 섹션으로 분리 */}
          <div className="container mx-auto px-4 sm:px-6 max-w-7xl pt-16 sm:pt-24">
            <div className="relative max-w-7xl mx-auto h-[300px] sm:h-[650px] flex items-center justify-center">
              <div className="absolute inset-0 bg-blue-500/5 blur-[100px] rounded-full pointer-events-none"></div>
              {previewScreens.map((screen, idx) => {
                const isActive = previewIdx === idx;
                return (
                  <div
                    key={idx}
                    className={`absolute transition-opacity ease-in-out flex flex-col items-center w-full max-w-[960px] px-2 sm:px-6 ${isActive
                      ? "duration-1000 opacity-100 z-30 pointer-events-auto"
                      : "duration-1000 opacity-0 z-10 pointer-events-none"
                      }`}
                  >
                    <img
                      src={screen.imgSrc}
                      alt={screen.title}
                      className="w-full max-h-[220px] sm:max-h-[520px] object-contain drop-shadow-2xl"
                    />

                    <div className={`mt-12 text-center transition-opacity duration-1000 ${isActive ? "opacity-100" : "opacity-0"}`}>
                      <div className="inline-flex items-center gap-2 mb-2 bg-white px-4 py-1.5 rounded-full shadow-sm border border-slate-100">
                        {screen.icon}
                        <h4 className="text-base sm:text-xl font-black text-slate-900 tracking-tight">{screen.title}</h4>
                      </div>
                      <p className="text-slate-500 font-medium text-xs sm:text-sm max-w-[420px] mx-auto">{screen.desc}</p>
                    </div>
                  </div>
                );
              })}

              <div className="absolute -bottom-16 flex items-center gap-3 z-40 bg-white/90 backdrop-blur-md px-5 py-2.5 rounded-full shadow-md border border-slate-200">
                <button
                  onClick={() => setPreviewIdx((prev) => (prev - 1 + previewScreens.length) % previewScreens.length)}
                  className="p-1 rounded-full hover:bg-slate-100 text-slate-700 transition-all active:scale-90 flex items-center justify-center"
                  aria-label="이전 프리뷰"
                >
                  <ChevronLeft className="w-4 h-4 text-slate-700" />
                </button>

                <div className="flex gap-2 items-center">
                  {previewScreens.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setPreviewIdx(idx)}
                      className={`h-2 rounded-full transition-all duration-300 ${previewIdx === idx ? "w-6 bg-blue-600" : "w-2 bg-slate-300 hover:bg-slate-400"}`}
                      aria-label={`${idx + 1}번 화면으로 이동`}
                    ></button>
                  ))}
                </div>

                <button
                  onClick={() => setPreviewIdx((prev) => (prev + 1) % previewScreens.length)}
                  className="p-1 rounded-full hover:bg-slate-100 text-slate-700 transition-all active:scale-90 flex items-center justify-center"
                  aria-label="다음 프리뷰"
                >
                  <ChevronRight className="w-4 h-4 text-slate-700" />
                </button>
              </div>
            </div>
          </div>

          <p className="text-lg md:text-xl text-gray-500 mb-12 break-keep px-4 font-medium leading-relaxed mt-16 sm:mt-32 text-center">종이 인쇄 값보다 저렴한 가격으로 시작하는 스마트 교회 목회 환경.</p>


          <div className="max-w-5xl mx-auto px-4 mt-8 mb-16">
            <div className="text-center mb-8">
              <span className="bg-blue-100 text-blue-700 text-xs font-black px-3.5 py-1.5 rounded-full uppercase tracking-wider">
                사용 가이드
              </span>
              <h3 className="text-2xl sm:text-3xl font-black text-slate-900 mt-3 tracking-tight break-keep">
                초보자도 5분 만에<br className="sm:hidden" />만드는 스마트 주보
              </h3>
              <p className="text-slate-500 text-sm sm:text-base font-medium mt-1">
                화면을 보며 따라 해보세요. 정말 쉽고 간편합니다.
              </p>
            </div>

            <div className="relative bg-white rounded-3xl p-4 sm:p-8 shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
              {/* 이미지 단독 표시 영역 */}
              <div className="relative w-full overflow-hidden rounded-2xl bg-slate-50 border border-slate-100 shadow-inner">
                <img
                  src={guideSteps[0].imgSrc}
                  alt=""
                  aria-hidden="true"
                  className="w-full h-auto object-contain rounded-2xl invisible"
                />

                {guideSteps.map((step, idx) => {
                  const isActive = guideStepIdx === idx;
                  return (
                    <img
                      key={idx}
                      src={step.imgSrc}
                      alt={step.title}
                      className={`absolute inset-0 w-full h-full object-contain rounded-2xl shadow-sm transition-opacity duration-700 ease-in-out ${isActive ? "opacity-100" : "opacity-0 pointer-events-none"
                        }`}
                    />
                  );
                })}
              </div>

              {/* 인디케이터 및 좌우 화살표 버튼 컨트롤 영역 */}
              <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-between">
                <button
                  onClick={() => handleManualGuideMove((guideStepIdx - 1 + guideSteps.length) % guideSteps.length)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-all active:scale-95 cursor-pointer shadow-sm"
                >
                  <ChevronLeft className="w-4 h-4" /> 이전 단계
                </button>

                <div className="flex items-center gap-2">
                  {guideSteps.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleManualGuideMove(idx)}
                      className={`h-2.5 rounded-full transition-all duration-300 cursor-pointer ${guideStepIdx === idx ? "w-8 bg-blue-600 shadow-sm" : "w-2.5 bg-slate-200 hover:bg-slate-300"
                        }`}
                      aria-label={`${idx + 1}단계로 이동`}
                    ></button>
                  ))}
                </div>

                <button
                  onClick={() => handleManualGuideMove((guideStepIdx + 1) % guideSteps.length)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-all active:scale-95 cursor-pointer shadow-md"
                >
                  다음 단계 <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>



          <div className="flex flex-col sm:flex-row gap-4 justify-center px-6 mb-20">
            <Button size="lg" onClick={() => navigate("/pricing")} className="rounded-3xl text-lg px-8 py-8 bg-blue-600 hover:bg-blue-700 shadow-2xl shadow-blue-200 w-full sm:w-auto font-black flex items-center justify-center gap-2">
              <CreditCard className="w-5 h-5" /> 990원 요금제 자세히 보기
            </Button>

            <Dialog>
              {/* <DialogTrigger asChild>
                <Button size="lg" variant="outline" className="rounded-3xl text-lg px-8 py-8 border-2 border-gray-200 hover:bg-gray-50 transition-all w-full sm:w-auto font-black text-gray-700 shadow-sm">3단계 주보 사용법 보기</Button>
              </DialogTrigger> */}
              <DialogContent className="w-[90vw] max-w-[450px] rounded-[2rem] sm:rounded-[3rem] border-0 p-0 overflow-hidden shadow-2xl">
                <div className={`p-8 sm:p-12 transition-colors duration-500 ${tutorialSteps[activeStep].color}`}>
                  <div className="flex justify-center mb-6 sm:mb-8 bg-white w-20 h-20 sm:w-24 sm:h-24 rounded-[2rem] sm:rounded-[2.5rem] items-center mx-auto shadow-sm">{tutorialSteps[activeStep].icon}</div>
                  <div className="text-center space-y-3 sm:space-y-4">
                    <h3 className="text-xl sm:text-2xl font-black text-gray-900">{tutorialSteps[activeStep].title}</h3>
                    <p className="text-gray-600 text-sm sm:text-base leading-relaxed break-keep font-medium">{tutorialSteps[activeStep].description}</p>
                  </div>
                </div>
                <div className="p-8 sm:p-10 bg-white">
                  <div className="flex justify-center gap-2.5 mb-8 sm:mb-10">
                    {tutorialSteps.map((_, i) => (<div key={i} className={`h-2.5 rounded-full transition-all duration-300 ${activeStep === i ? "w-10 bg-blue-600" : "w-2.5 bg-gray-200"}`} />))}
                  </div>
                  <div className="flex gap-3 sm:gap-4">
                    <Button variant="ghost" onClick={prevStep} className="flex-1 rounded-2xl py-6 sm:py-7 font-bold text-gray-400">이전</Button>
                    <Button onClick={activeStep === 2 ? () => navigate("/signup") : nextStep} className="flex-[2] rounded-2xl py-6 sm:py-7 font-black bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-100">
                      {activeStep === 2 ? "지금 가입하기" : "다음 단계"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

        {/* Pricing 요약 카드 */}
        {/* <div className="max-w-5xl mx-auto mb-20 sm:mb-28 px-4">
          <Card className="rounded-[2.5rem] sm:rounded-[3.5rem] border-0 bg-white shadow-[0_32px_64px_-16px_rgba(0,0,0,0.08)] overflow-hidden">
            <div className="flex flex-col md:flex-row">
              <div className="flex-1 p-10 sm:p-20 space-y-6 sm:space-y-8">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-blue-50 text-blue-600 rounded-full text-[10px] font-black tracking-widest uppercase border border-blue-100"><Sparkles className="w-3.5 h-3.5" /> Mobile Jubo Special Offer</div>
                <h2 className="text-2xl sm:text-5xl font-black text-gray-900 leading-[1.1] break-keep">정식 출시 전,<br />최저가 주보 제작 혜택</h2>
                <p className="text-gray-500 text-base sm:text-lg leading-relaxed font-medium break-keep">현재 서비스 안정화를 위한 베타 테스트 중입니다.</p>
                <div className="bg-orange-50/50 p-6 rounded-[2rem] border border-orange-100/50 space-y-3">
                  <p className="text-orange-700 font-bold flex items-center gap-2 text-sm sm:text-base"><BellRing className="w-5 h-5" /> 모바일 주보 요금제 안내</p>
                  <p className="text-[13px] sm:text-sm text-orange-600/80 font-semibold leading-relaxed break-keep">사전 혜택 가격으로 스테이온의 프리미엄 기능을 시작해 보세요.</p>
                </div>
                <Button variant="outline" onClick={() => navigate("/pricing")} className="w-full sm:w-auto rounded-2xl border-2 py-6 px-8 font-black text-gray-700 hover:bg-gray-50 transition-all flex items-center justify-center gap-2">전체 온라인 주보 플랜 확인하기 <ChevronRight className="w-4 h-4" /></Button>
              </div>
              <div className="w-full md:w-[380px] bg-gray-900 p-12 sm:p-20 flex flex-col justify-center items-center text-white text-center relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/20 rounded-full -mr-16 -mt-16 blur-2xl"></div>
                <span className="text-base sm:text-lg font-bold opacity-60 mb-2 z-10 uppercase tracking-widest">990 Won Plan</span>
                <span className="text-lg sm:text-xl font-bold text-white/40 line-through z-10">1,500원</span>
                <div className="flex items-baseline gap-1 z-10">
                  <span className="text-7xl sm:text-9xl font-black italic tracking-tighter text-blue-500">990</span>
                  <span className="text-xl sm:text-2xl font-bold italic">원</span>
                </div>
                <Button onClick={() => navigate("/pricing")} className="mt-8 sm:mt-12 bg-blue-600 text-white hover:bg-blue-500 w-full rounded-[1.5rem] sm:rounded-[2rem] font-black py-7 sm:py-8 text-xl shadow-2xl transition-transform active:scale-95 z-10 border-0">주보 상품 선택하기</Button>
              </div>
            </div>
          </Card>
        </div> */}
        <div className="max-w-5xl mx-auto mb-10 sm:mb-16 px-4">
          <Card className="rounded-[28px] sm:rounded-[32px] border-0 bg-white shadow-[0_8px_30px_rgba(0,0,0,0.06)] overflow-hidden">
            <div className="flex flex-col md:flex-row">
              <div className="flex-1 p-6 sm:p-10 space-y-4 sm:space-y-5">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-[10px] font-black tracking-widest uppercase border border-blue-100"><Sparkles className="w-3.5 h-3.5" /> Mobile Jubo Special Offer</div>
                <h2 className="text-xl sm:text-3xl font-black text-gray-900 leading-snug break-keep">정식 출시 전,<br />최저가 주보 제작 혜택</h2>
                <p className="text-gray-500 text-sm sm:text-base leading-relaxed font-medium break-keep">현재 서비스 안정화를 위한 베타 테스트 중입니다.</p>
                <div className="bg-blue-50/60 p-4 sm:p-5 rounded-2xl border border-blue-100 space-y-1.5">
                  <p className="text-blue-700 font-bold flex items-center gap-2 text-sm"><BellRing className="w-4 h-4" /> 모바일 주보 요금제 안내</p>
                  <p className="text-[13px] text-blue-600/80 font-semibold leading-relaxed break-keep">사전 혜택 가격으로 스테이온의 프리미엄 기능을 시작해 보세요.</p>
                </div>
                <Button variant="outline" onClick={() => navigate("/pricing")} className="w-full sm:w-auto rounded-2xl border-2 py-3.5 px-6 font-black text-sm text-gray-700 hover:bg-gray-50 transition-all flex items-center justify-center gap-2">전체 온라인 주보 플랜 확인하기 <ChevronRight className="w-4 h-4" /></Button>
              </div>
              <div className="w-full md:w-[340px] bg-gray-900 p-8 sm:p-10 flex flex-col justify-center items-center text-white text-center relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-blue-600/20 rounded-full -mr-12 -mt-12 blur-2xl"></div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-500/10 text-red-400 rounded-full text-[11px] font-bold mb-3 z-10 border border-red-500/20">{/* 🔴 신규: 마감임박 배지 (펄스 애니메이션 점 + 텍스트) */}
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500"></span>
                  </span>
                  마감임박 · 조기 종료될 수 있어요
                </div>
                <span className="text-xs sm:text-sm font-bold opacity-60 mb-2 z-10 uppercase tracking-widest">990 Won Plan</span>
                <div className="relative inline-block z-10 mb-0.5">
                  {/* <span className="text-[15px] sm:text-base font-bold text-white/55 -rotate-2 inline-block">1,500원</span> */}
                  <span className="text-lg sm:text-3xl font-bold text-white/55 -rotate-2 inline-block">1,990원</span>
                  <svg className="absolute -left-2 top-1/2 -translate-y-1/2 w-[calc(100%+16px)] h-[22px] pointer-events-none" viewBox="0 0 110 22" preserveAspectRatio="none">{/* 🔴 신규: 붓으로 슥 그은 취소선 (일자 + feTurbulence로 가장자리만 거칠게) */}
                    <defs>
                      <filter id="roughStrike990" x="-30%" y="-30%" width="160%" height="160%">
                        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="4" result="noise" />
                        <feDisplacementMap in="SourceGraphic" in2="noise" scale="3.5" />
                      </filter>
                    </defs>
                    <path d="M4,14 L106,8" stroke="#F87171" strokeWidth="6.5" strokeLinecap="round" fill="none" opacity="0.35" filter="url(#roughStrike990)" />
                    <path d="M3,12 L107,10" stroke="#DC2626" strokeWidth="4" strokeLinecap="round" fill="none" filter="url(#roughStrike990)" />
                  </svg>
                </div>
                <svg className="w-3.5 h-3.5 text-white/45 z-10 my-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 4v14M6 12l6 6 6-6" /></svg>{/* 🔴 신규: 1,500원→990원 관계를 보여주는 화살표 */}
                <div className="relative z-10 mt-0.5">
                  <div className="flex items-baseline gap-1 -rotate-1">
                    <span className="text-6xl sm:text-7xl font-black italic tracking-tighter text-blue-500">990</span>
                    <span className="text-lg sm:text-xl font-bold italic">원</span>
                  </div>
                </div>
                <Button onClick={() => navigate("/pricing")} className="mt-8 sm:mt-10 bg-blue-600 text-white hover:bg-blue-500 w-full rounded-2xl font-black py-4 sm:py-5 text-base sm:text-lg shadow-lg transition-transform active:scale-95 z-10 border-0">주보 상품 선택하기</Button>{/* 🔴 mt-6/8→mt-8/10: 배지·화살표 늘어난 만큼 버튼 여백 재조정 */}
              </div>
            </div>
          </Card>
        </div>

        {/* Features Grid */}
        <div className="mb-20 sm:mb-28">
          <div className="text-center mb-12 sm:mb-20 px-4">
            <h2 className="text-2xl sm:text-5xl font-black text-gray-900 mb-6 tracking-tight break-keep">스마트 교회 주보 기능을 경험하세요</h2>
            <div className="h-1.5 sm:h-2 w-16 sm:w-24 bg-blue-600 mx-auto rounded-full"></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-10">
            {features.map((feature, index) => (
              <Card key={index} className="p-8 sm:p-10 hover:-translate-y-2 transition-all duration-500 rounded-[2.5rem] sm:rounded-[3rem] border-0 bg-white shadow-[0_20px_40px_-12px_rgba(0,0,0,0.05)] group cursor-default">
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gray-50 group-hover:bg-blue-600 flex items-center justify-center text-blue-600 group-hover:text-white mb-6 sm:mb-8 transition-all duration-500 shadow-inner">{feature.icon}</div>
                <h3 className="text-lg sm:text-xl font-black mb-4 text-gray-800">{feature.title}</h3>
                <p className="text-sm sm:text-base text-gray-500 leading-relaxed font-semibold break-keep">{feature.description}</p>
              </Card>
            ))}
          </div>
        </div>

        {/* FAQ Section */}
        <div className="max-w-3xl mx-auto mb-20 sm:mb-32 px-4">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 text-blue-600 font-black text-sm mb-4 uppercase tracking-widest"><HelpCircle className="w-4 h-4" /> 교회 주보 FAQ</div>
            <h2 className="text-2xl sm:text-4xl font-black text-gray-900 break-keep">자주 묻는 질문</h2>
          </div>
          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <div key={index} className={`rounded-[1.5rem] sm:rounded-[2rem] transition-all duration-300 overflow-hidden border-2 ${openFaq === index ? "border-blue-100 bg-blue-50/30" : "border-gray-50 bg-white"}`}>
                <button onClick={() => setOpenFaq(openFaq === index ? null : index)} className="w-full px-6 sm:px-8 py-6 sm:py-7 text-left flex justify-between items-center gap-4">
                  <span className="text-base sm:text-lg font-bold text-gray-800 break-keep leading-tight">{faq.question}</span>
                  <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all ${openFaq === index ? "bg-blue-600 text-white rotate-180" : "bg-gray-100 text-gray-400"}`}>{openFaq === index ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}</div>
                </button>
                <div className={`transition-all duration-300 ease-in-out px-6 sm:px-8 overflow-hidden ${openFaq === index ? "max-h-96 pb-8" : "max-h-0"}`}><p className="text-sm sm:text-base text-gray-500 font-medium leading-relaxed break-keep">{faq.answer}</p></div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="text-center py-16 sm:py-24 bg-blue-600 rounded-[3rem] sm:rounded-[5rem] text-white px-8 relative overflow-hidden shadow-3xl mb-20 sm:mb-32">
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 to-transparent opacity-50"></div>
          <div className="relative z-10 max-w-3xl mx-auto">
            <h2 className="text-2xl sm:text-6xl font-black mb-8 tracking-tight break-keep px-2">가장 저렴한 990원 주보를 시작하세요</h2>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" onClick={() => navigate("/pricing")} className="rounded-2xl sm:rounded-3xl text-lg px-8 py-8 bg-white text-blue-600 hover:bg-gray-100 hover:scale-105 transition-all shadow-2xl w-full sm:w-auto font-black">주보 가격 및 상품 보기</Button>
              <Button size="lg" onClick={() => navigate("/signup")} className="rounded-2xl sm:rounded-3xl text-lg px-8 py-8 bg-transparent border-2 border-white/50 text-white hover:bg-white/10 transition-all w-full sm:w-auto font-black">지금 무료 가입하기</Button>
            </div>
          </div>
        </div>

        {/* 서비스 준비중 */}
        <div className="max-w-7xl mx-auto mb-10 px-4">
          <div className="text-center mb-8 md:mb-10 px-2">
            <div className="inline-flex items-center gap-2 text-[#3182F6] font-black text-xs sm:text-sm mb-3 md:mb-4 uppercase tracking-wide sm:tracking-widest">
              <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> StayOn Family Services
            </div>
            <h2 className="text-[28px] sm:text-3xl md:text-5xl font-black text-[#191F28] tracking-normal sm:tracking-tight leading-snug break-keep">다른 서비스도 이용해보세요!</h2>
          </div>

          {/* 모바일: /teams의 "지금 주목받는 사역팀"과 동일한 스타일로 카드가 끊김없이 옆으로 흐르는 티커 */}
          <div className="md:hidden py-3">
            <ExtraServicesTicker
              services={extraServices}
              onOpen={(url, isReady) => {
                if (!isReady || url === "#") return;
                window.open(url, "_blank");
              }}
            />
          </div>

          <div className="hidden md:flex relative h-[650px] justify-center items-center overflow-visible">
            {/* 배경 오로라 효과 */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-blue-50/30 rounded-full blur-[120px] pointer-events-none"></div>

            <div className="relative w-full max-w-5xl flex justify-center items-center h-full">
              {/* 좌우: 아직 준비 중인 서비스를 고정으로 흐리게 표시 (자물쇠 오버레이) */}
              {lockedExtraServices.slice(0, 2).map((service, i) => (
                <Card
                  key={`locked-${service.id}`}
                  className={`absolute w-full max-w-[380px] p-10 rounded-[4rem] shadow-2xl border-0 flex flex-col justify-between h-[540px] z-10 opacity-40 scale-90 bg-white/50 blur-[1px] pointer-events-none ${i === 0 ? "-translate-x-[90%] md:-translate-x-[105%]" : "translate-x-[90%] md:translate-x-[105%]"
                    }`}
                >
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/40 rounded-[4rem] backdrop-blur-[1px]">
                    <div className="w-16 h-16 bg-[#F2F4F6] text-[#ADB5BD] rounded-full flex items-center justify-center border border-white shadow-sm mb-4">
                      <Lock className="w-7 h-7 fill-current" />
                    </div>
                    <span className="text-[#ADB5BD] font-black text-sm">서비스 준비 중</span>
                  </div>
                  <div className="relative z-10 h-full flex flex-col opacity-0">
                    <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold mb-6 w-fit ${service.tagColor}`}>
                      <AlertCircle className="w-3.5 h-3.5" /> {service.tag}
                    </div>
                    <div className="w-20 h-20 rounded-[30px] flex items-center justify-center text-[#3182F6] mb-8 shadow-inner bg-[#F2F4F6]">{service.icon}</div>
                    <h3 className="text-2xl font-black mb-4 text-[#191F28] leading-tight">{service.title}</h3>
                    <p className="text-[#6B7684] font-semibold leading-relaxed break-keep">{service.description}</p>
                  </div>
                </Card>
              ))}

              {/* 중앙: 실제로 이용 가능한(오픈된) 서비스가 여러 개면 5초마다 서로 교차(크로스페이드)되어 표시 */}
              {openExtraServices.length > 0 && (() => {
                const centerService = openExtraServices[centerOpenIndex % openExtraServices.length];
                return (
                  <Card
                    key="center-open-service"
                    className={`absolute w-full max-w-[380px] p-10 rounded-[4rem] transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] shadow-2xl border-0 flex flex-col justify-between h-[540px] z-30 translate-x-0 scale-110 bg-white shadow-[0_40px_80px_rgba(0,0,0,0.1)] ${centerFading ? "opacity-0" : "opacity-100"
                      }`}
                  >
                    <div className={`relative z-10 h-full flex flex-col transition-opacity duration-300 ${centerFading ? "opacity-0" : "opacity-100"}`}>
                      <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold mb-6 w-fit ${centerService.tagColor}`}>
                        <AlertCircle className="w-3.5 h-3.5" /> {centerService.tag}
                      </div>

                      <div className="w-20 h-20 rounded-[30px] flex items-center justify-center text-[#3182F6] mb-8 shadow-inner bg-[#F2F4F6]">
                        {centerService.icon}
                      </div>

                      <h3 className="text-2xl font-black mb-4 text-[#191F28] leading-tight">
                        {centerService.title}
                      </h3>

                      <p className="text-[#6B7684] font-semibold leading-relaxed break-keep">
                        {centerService.description}
                      </p>

                      <div className="mt-auto">
                        <Button
                          size="lg"
                          onClick={() => window.open(centerService.externalUrl, '_blank')}
                          className="w-full rounded-[20px] py-8 font-black text-lg transition-all bg-[#3182F6] text-white hover:bg-[#1B64DA] shadow-lg shadow-blue-100"
                        >
                          바로가기 <ChevronRight className="ml-2 w-5 h-5" />
                        </Button>
                      </div>
                    </div>
                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50/50 rounded-full -mr-10 -mt-10 blur-2xl"></div>
                  </Card>
                );
              })()}
            </div>

            {/* 하단 점 표시: 중앙에서 교차 표시되는 오픈 서비스 개수만큼, 현재 표시 중인 항목을 강조 */}
            {openExtraServices.length > 1 && (
              <div className="absolute -bottom-16 flex gap-3">
                {openExtraServices.map((s, i) => (
                  <div
                    key={s.id}
                    className={`h-2.5 rounded-full transition-all duration-500 ${i === centerOpenIndex % openExtraServices.length ? "w-10 bg-[#3182F6]" : "w-2.5 bg-gray-200"}`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 공지사항 섹션 */}
        {/* <div ref={noticeRef} className="max-w-4xl mx-auto mb-20 scroll-mt-24 pt-20">
          <div className="flex items-center gap-2 mb-6 px-4">
            <Volume2 className="w-5 h-5 text-blue-600" />
            <h2 className="text-xl font-black text-gray-900">공지사항</h2>
          </div>
          <Card className="rounded-[2rem] border-0 bg-white/70 backdrop-blur-sm shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-2 overflow-hidden">
            <div className="space-y-1">
              {notices.map((notice) => (
                <div key={notice.id} className="flex items-center gap-4 px-5 py-4 hover:bg-white rounded-2xl transition-colors cursor-pointer group">
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider ${notice.tag === '점검' ? 'bg-red-50 text-red-500' : notice.tag === '업데이트' ? 'bg-blue-50 text-blue-500' : 'bg-gray-100 text-gray-500'}`}>{notice.tag}</span>
                  <span className="flex-1 text-sm font-bold text-gray-700 truncate group-hover:text-blue-600 transition-colors">{notice.title}</span>
                  <span className="text-[11px] font-medium text-gray-400 shrink-0">{notice.date}</span>
                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-blue-400 transition-all group-hover:translate-x-0.5" />
                </div>
              ))}
            </div>
          </Card>
        </div> */}
        <div ref={noticeRef} className="max-w-4xl mx-auto mb-20 scroll-mt-24 pt-20 px-4">
          <div className="flex items-center gap-2 mb-6">
            <Volume2 className="w-5 h-5 text-blue-600" />
            <h2 className="text-xl font-black text-gray-900">공지사항</h2>
          </div>

          <Card className="rounded-[2rem] border-0 bg-white/70 backdrop-blur-sm shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-2 overflow-hidden">
            {loadingNotices ? (
              <div className="text-center py-10 text-gray-400 text-sm font-medium">공지사항을 불러오는 중...</div>
            ) : notices.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm font-medium">등록된 공지사항이 없습니다.</div>
            ) : (
              <div className="space-y-1">
                {notices.map((notice) => (
                  <div
                    key={notice.id}
                    onClick={() => setSelectedNotice(notice)} // 클릭 시 상세 내용 모달 오픈
                    className="flex items-center gap-4 px-5 py-4 hover:bg-white rounded-2xl transition-colors cursor-pointer group"
                  >
                    <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider bg-blue-50 text-blue-600">
                      공지
                    </span>
                    <span className="flex-1 text-sm font-bold text-gray-700 truncate group-hover:text-blue-600 transition-colors">
                      {notice.title}
                    </span>
                    <span className="text-[11px] font-medium text-gray-400 shrink-0">
                      {notice.createdAt?.toDate ? notice.createdAt.toDate().toLocaleDateString() : "최근"}
                    </span>
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-blue-400 transition-all group-hover:translate-x-0.5" />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {selectedNotice && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            {/* 공지 내용이 길어도 카드 크기는 고정하고(max-h), 안쪽 본문만 스크롤되게 함
                (flex-col + 본문에만 overflow-y-auto) — 헤더/닫기 버튼과 하단 버튼은 항상 고정 노출됨 */}
            <Card className="w-full max-w-lg max-h-[85vh] p-6 rounded-3xl bg-white shadow-2xl border-0 flex flex-col my-8">
              <div className="flex items-center justify-between border-b pb-4 shrink-0">
                <div>
                  <span className="bg-blue-50 text-blue-600 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider mb-1 inline-block">
                    공지사항 상세
                  </span>
                  <h3 className="text-lg font-black text-gray-900">{selectedNotice.title}</h3>
                </div>
                <button
                  onClick={() => setSelectedNotice(null)}
                  className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4 overflow-y-auto flex-1 min-h-0 py-4">
                <p className="text-sm text-gray-600 font-medium whitespace-pre-wrap leading-relaxed">
                  {selectedNotice.content}
                </p>

                {/* 공지사항에 첨부된 이미지가 있을 경우 메인 화면에서도 캐러셀로 노출 (여러 장 지원, 구 데이터의 imageUrl 단일 필드도 호환) */}
                {(selectedNotice.imageUrls?.length > 0 || selectedNotice.imageUrl) && (
                  <NoticeImageCarousel images={selectedNotice.imageUrls ?? [selectedNotice.imageUrl]} />
                )}
              </div>

              <div className="flex justify-end pt-2 shrink-0">
                <Button
                  onClick={() => setSelectedNotice(null)}
                  className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs px-6 py-3 shadow-sm cursor-pointer"
                >
                  확인
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* Footer */}
        <footer className="mt-10 py-12 border-t border-gray-100 text-center">
          <p className="text-gray-400 text-xs sm:text-sm font-medium">© 2026 StayOn. All rights reserved.</p>
        </footer>
      </div>

      {/* 가로 스크롤바 숨기기를 위한 스타일 태그 */}
      <style dangerouslySetInnerHTML={{
        __html: `
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />
      <KakaoChannelButton />
    </div>
  );
}
