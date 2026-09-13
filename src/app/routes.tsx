import { useEffect } from "react";
import { createBrowserRouter, Outlet, ScrollRestoration, useLocation, useNavigate } from "react-router";
import { Landing } from "./pages/Landing";
import { SignUp } from "./pages/SignUp";
import { Login } from "./pages/Login";
import { BulletinView } from "./pages/BulletinView";
import { AboutPage } from "./pages/bulletin/AboutPage"; // 성도 화면 메뉴 > 교회 소개
import { PastorGreetingPage } from "./pages/bulletin/PastorGreetingPage"; // 성도 화면 메뉴 > 담임목사 인사말
import { TeamPage } from "./pages/bulletin/TeamPage"; // 성도 화면 메뉴 > 섬기시는 분
import { OfficersPage } from "./pages/bulletin/OfficersPage"; // 성도 화면 메뉴 > 섬기시는 분 > 중직자
import { PastoralColumnListPage } from "./pages/bulletin/PastoralColumnListPage"; // 성도 화면 메뉴 > 목회 칼럼
import { PastoralColumnDetailPage } from "./pages/bulletin/PastoralColumnDetailPage"; // 목회 칼럼 상세
import { LocationPage } from "./pages/bulletin/LocationPage"; // 성도 화면 메뉴 > 오시는 길
import { AdminDashboard } from "./pages/AdminDashboard";
import { AdminEditor } from "./pages/AdminEditor";
import { History } from "./pages/History";
import { Pricing } from "./pages/Pricing";
import { SuccessPage } from "./pages/Success";
import { Footer } from "./components/layout/footer";
import { AdminJuboManagement } from "./pages/AdminJuboManagement";
import { AdminBulletinList } from "./pages/AdminBulletinList"; // 교회별 주보 관리 페이지 임포트
import { AdminAuthUsers } from "./pages/admin/AdminAuthUsers"; // 전체 가입자 현황 페이지 컴포넌트 임포트
import { AdminChurchSites } from "./pages/admin/AdminChurchSites"; // 교회 사이트 제작 플랫폼 발행 관리 페이지 임포트
import { AdminAdSettings } from "./pages/admin/AdminAdSettings"; // 사역자 청빙 게시판 끌어올리기(광고) 설정 페이지 임포트
import { AdminFeatureSettings } from "./pages/admin/AdminFeatureSettings"; // 화면 노출 on/off 관리 페이지 임포트
import { AdminFeatureUpdateNotice } from "./pages/admin/AdminFeatureUpdateNotice"; // 기능 업데이트 알림 관리 페이지 임포트
import { AdminCustomDesign } from "./pages/admin/AdminCustomDesign"; // 커스텀 디자인(주보 템플릿) 교회별 사용 권한 관리 페이지 임포트
import { SuperAuthGuard } from "./pages/SuperAuthGuard";
import { NoticeBoard } from "./pages/NoticeBoard"; // 공지사항 게시판 페이지 컴포넌트 추가
import { AdminSidebar } from "./components/layout/Sidebar";
import { WebsiteCreate } from "./pages/website/WebsiteCreate";
import { WebsitePreview } from "./pages/website/WebsitePreview";

import { WebsiteMain } from "./pages/website/WebsiteMain"; // 교회 홈페이지 제작 메인 페이지 컴포넌트 임포트
import BuilderPage from "./pages/website/BuilderPage"; // 새 사이트 빌더 프로토타입 화면 임포트
import { WebsiteRenderer } from "./pages/website/WebsiteRenderer";
import { WebsiteOffer } from "./pages/website/WebsiteOffer"; // '홈페이지 상품 선택하기' 전용 혜택가/가격 안내 페이지

// 사역자 청빙관 및 등록 페이지 컴포넌트 임포트
import { JobBoard } from "./pages/JobBoard";
import { JobWrite } from "./pages/JobWrite";
import { JobBoost } from "./pages/JobBoost"; // 사역자 청빙 공고 홍보(끌어올리기/티커 노출) 셀프 신청 페이지 임포트
import { JobDetail } from "./pages/JobDetail"; // 공고 상세보기 화면(팝업 alert 대체) 임포트
import { JobEdit } from "./pages/JobEdit"; // 공고 수정 화면 임포트
import { JobsGate } from "./pages/JobsGate"; // /jobs 전체를 관리자 화면 관리 설정에 따라 잠그는 공통 게이트 임포트

const SEOManager = () => {
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname;
    let title = "스테이온 | 스마트 모바일 주보 서비스";
    // 기존 index.html 정적 태그와 동일한 기본값 — /website 외 다른 라우트는
    // 이 값 그대로라 실제로 바뀌는 페이지는 하나도 없음
    let description =
      "월 990원 최저가로 시작하는 우리 교회 모바일 주보 스테이온(STAYON). 종이 없는 건강한 교회를 위한 가장 쉬운 스마트 주보 제작 플랫폼입니다.";
    // og:title은 document.title(위 title)과 별개로, index.html 정적 기본값을 그대로 씀 —
    // /website 외에는 이 값을 안 건드려서 다른 라우트의 카카오톡 공유 미리보기 등은 전혀 안 바뀜
    let ogTitle = "스테이온(STAYON) | 월 990원 우리 교회 온라인 주보";

    if (path === "/") {
      title = "온라인(모바일) 주보 제작 스테이온 | 월 990원 스마트 교회 주보";
    } else if (path.includes("website")) {
      title = "교회 홈페이지 제작 | 월 9,900원 스테이온 교회 사이트 제작 플랫폼"; // SEO 타이틀 분기
      description =
        "빈칸만 채우면 5분 만에 완성되는 우리 교회 공식 홈페이지. 월 9,900원, 도메인과 SSL 포함, 네이버·구글 검색 최적화까지 자동 지원합니다.";
      ogTitle = title;
    } else if (path.includes("pricing")) {
      title = "주보 요금 안내 | 월 990원 최저가 모바일 주보 스테이온";
    } else if (path.includes("admin")) {
      title = "주보 관리자 센터 | 가장 쉬운 온라인 주보 편집기";
    } else if (path.includes("view") || path.includes("bulletin")) {
      title = "우리 교회 모바일 주보 보기 | 스테이온(STAYON)";
    } else if (path.includes("login")) {
      title = "로그인 | 스테이온 스마트 주보";
    } else if (path.includes("signup")) {
      title = "무료 시작하기 | 990원 모바일 주보 스테이온";
    } else if (path.includes("success")) {
      title = "결제 완료 | 스테이온";
    } else if (path.includes("notify")) {
      title = "공지사항 | 스테이온 스마트 주보"; // 공지사항 페이지 SEO 타이틀 추가
    } else if (path.includes("jobs")) {
      title = "사역자 청빙관 | 스테이온 스마트 주보"; // 사역자 청빙관 SEO 타이틀 분기 처리
    } else if (path.includes("auth-users")) {
      title = "전체 가입자 현황 | 스테이온 슈퍼 관리자"; // 전체 가입자 현황 페이지 SEO 타이틀 추가
    } else if (path.includes("website-create")) {
      title = "우리 교회 홈페이지 만들기 | 스테이온";
    }

    document.title = title;
    // title뿐 아니라 실제 <meta> 태그도 같이 갱신 — 지금까지는 document.title만
    // 바뀌고 description/og 태그는 index.html 정적 기본값 그대로였음(=/website에서
    // 구글이 계속 주보용 설명을 가져가던 원인). description 값 자체가 대부분의
    // 라우트에서는 기존 정적 기본값과 동일해서, /website 외에는 실질적으로 안 바뀜
    const setMetaContent = (selector: string, value: string) => {
      document.querySelector(selector)?.setAttribute("content", value);
    };
    setMetaContent('meta[name="description"]', description);
    setMetaContent('meta[property="og:title"]', ogTitle);
    setMetaContent('meta[property="og:description"]', description);
  }, [location]);

  return null;
};

// BuilderPage는 onBack 콜백을 필요로 하는 컴포넌트라, 라우터에 바로 연결할 수 있도록 얇은 래퍼로 감쌈
const BuilderPageRoute = () => {
  const navigate = useNavigate();
  return <BuilderPage onBack={() => navigate("/website")} />;
};

// 교회 서브도메인(예: stay.stayon-platform.com)에서는 WebsiteRenderer가 이미 자체 footer(교회 이름/
// 주소/연락처)를 그리고 있으므로, STAYON 플랫폼 자체의 사업자 정보 footer는 중복으로 붙이지 않음.
// 성도 화면(주보)도 마찬가지로 이 공통 Footer 대신 BulletinView 자체에 있는 작은 하단
// 정보(상호/문의전화/SNS)만 보여주므로 여기서 숨긴다.
const RootLayout = () => {
  const location = useLocation();
  const isBulletinRoute = location.pathname === "/bulletin" || location.pathname.startsWith("/view/");
  return (
    <div className="flex flex-col min-h-screen font-sans">
      <SEOManager />
      <ScrollRestoration />
      <div className="flex-grow">
        <Outlet />
      </div>
      {!getChurchSubdomain() && !isBulletinRoute && <Footer />}
    </div>
  );
};

const getChurchSubdomain = (): string | null => {
  const hostname = window.location.hostname;
  const knownSubdomains = ["www", "bulletin", "place", "stayonsbplatform"];
  const parts = hostname.replace(".stayon-platform.com", "").split(".");
  const subdomain = parts[0];

  const isChurchSite =
    hostname.endsWith("stayon-platform.com") &&
    subdomain &&
    subdomain !== "stayon-platform" &&
    !knownSubdomains.includes(subdomain);

  return isChurchSite ? subdomain : null;
};

// 교회 서브도메인에서는 메뉴별로 실제 하위 페이지(/worship, /community, /news, /location)가 따로
// 존재하도록 섹션마다 라우트를 분리함. bulletin 등 다른 알려진 서브도메인에서는
// getChurchSubdomain()이 null을 반환해 랜딩으로 대체되므로 주보 라우트와는 무관, 영향 없음
const churchSectionRoute = (section: "home" | "worship" | "community" | "news" | "location" | "online-worship") => () => {
  const subdomain = getChurchSubdomain();
  return subdomain ? <WebsiteRenderer slug={subdomain} section={section} /> : <Landing />;
};

const HostRouter = churchSectionRoute("home");
const ChurchWorshipRoute = churchSectionRoute("worship");
const ChurchCommunityRoute = churchSectionRoute("community");
const ChurchNewsRoute = churchSectionRoute("news");
const ChurchLocationRoute = churchSectionRoute("location");
const ChurchOnlineWorshipRoute = churchSectionRoute("online-worship");


// const SuperLayout = () => (
//   <div className="flex flex-col min-h-screen bg-gray-50">
//     <div className="flex-grow">
//       <Outlet />
//     </div>
//   </div>
// );

const SuperLayout = () => (
  <div className="flex flex-col md:flex-row min-h-screen bg-[#F9FAFB] font-sans">
    <SEOManager />
    <AdminSidebar />
    <main className="flex-1 min-w-0 overflow-x-hidden">
      <Outlet />
    </main>
  </div>
);

export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />, 
    children: [
      { index: true, Component: HostRouter },  // ← Landing에서 HostRouter로 교체
      // { index: true, Component: Landing },
      { path: "worship", Component: ChurchWorshipRoute },     // 교회 사이트 "예배 안내" 하위 페이지
      { path: "community", Component: ChurchCommunityRoute }, // 교회 사이트 "공동체" 하위 페이지
      { path: "news", Component: ChurchNewsRoute },           // 교회 사이트 "소식" 하위 페이지
      { path: "location", Component: ChurchLocationRoute },   // 교회 사이트 "오시는 길" 하위 페이지
      { path: "online-worship", Component: ChurchOnlineWorshipRoute }, // 교회 사이트 "온라인 예배" 하위 페이지
      { path: "bulletin", Component: BulletinView },
      { path: "view/:id", Component: BulletinView },
      { path: "view/:id/about", Component: AboutPage }, // 성도 화면 메뉴 > 교회 소개
      { path: "view/:id/pastor", Component: PastorGreetingPage }, // 성도 화면 메뉴 > 담임목사 인사말
      { path: "view/:id/team", Component: TeamPage }, // 성도 화면 메뉴 > 섬기시는 분
      { path: "view/:id/officers", Component: OfficersPage }, // 성도 화면 메뉴 > 섬기시는 분 > 중직자
      { path: "view/:id/column", Component: PastoralColumnListPage }, // 성도 화면 메뉴 > 목회 칼럼
      { path: "view/:id/column/:columnId", Component: PastoralColumnDetailPage }, // 목회 칼럼 상세
      { path: "view/:id/location", Component: LocationPage }, // 성도 화면 메뉴 > 오시는 길
      { path: "pricing", Component: Pricing },
      { path: "success", Component: SuccessPage }, // 모바일/성공 페이지 대응
      {
        path: "jobs",
        Component: JobsGate, // /super > 화면 관리에서 끄면 이 아래 전부 준비중 화면으로 대체
        children: [
          { index: true, Component: JobBoard }, // 사역자 청빙관 메인 페이지 라우터 연결
          { path: "write", Component: JobWrite }, // 사역자 공고 등록 페이지 라우터 연결 (로그인 체크 및 글쓰기)
          { path: "boost", Component: JobBoost }, // 공고 홍보(끌어올리기/티커 노출) 셀프 신청 페이지 라우터 연결
          { path: "edit/:id", Component: JobEdit }, // 공고 수정 화면 라우터 연결
          { path: ":id", Component: JobDetail }, // 공고 상세보기 화면 라우터 연결 (write, boost보다 뒤에 둬도 react-router가 정적 경로를 우선 매칭함)
        ],
      },
      { path: "website", Component: WebsiteMain }, // 상단 네비게이션 버튼과 연결될 독립된 홈페이지 제작 메인 경로
      { path: "website-offer", Component: WebsiteOffer }, // '홈페이지 상품 선택하기' 버튼으로 진입하는 혜택가/가격 안내 전용 경로
      { path: "website-builder", Component: BuilderPageRoute }, // 새 사이트 빌더 프로토타입 화면 경로
      { path: "website-create", Component: WebsiteCreate },      // ← 추가
      { path: "website-preview/:slug", Component: WebsitePreview },   // ← 추가
    ],
  },
  {
    path: "/admin",
    element: <RootLayout />,
    children: [
      { index: true, Component: AdminDashboard },
      { path: "history", Component: History },
      { path: "pricing", Component: Pricing },
      { path: "notify", Component: NoticeBoard }, // 관리자용 공지사항 읽기 라우터 추가
    ],
  },
  {
    path: "/super",
    element: <SuperAuthGuard />, // 운영자 비밀번호 인증 후에만 아래 SuperLayout 하위 페이지 접근 가능
    children: [
      {
        element: <SuperLayout />,
        children: [
          { index: true, Component: AdminJuboManagement },
          { path: "management", Component: AdminJuboManagement },
          { path: "bulletins", Component: AdminBulletinList }, // 교회별 주보 발행 목록 라우터 연결
          { path: "notify", Component: NoticeBoard }, // 운영자용 공지사항 관리(CRUD) 라우터 추가
          { path: "auth-users", Component: AdminAuthUsers }, // 전체 가입자 현황 라우터 연결
          { path: "church-sites", Component: AdminChurchSites }, // 교회 사이트 제작 플랫폼 발행 관리 라우터 연결
          { path: "ads", Component: AdminAdSettings }, // 사역자 청빙 게시판 끌어올리기(광고) 설정 라우터 연결
          { path: "custom-design", Component: AdminCustomDesign }, // 커스텀 디자인 교회별 사용 권한 관리 라우터 연결
          { path: "features", Component: AdminFeatureSettings }, // 화면 노출 on/off 관리 라우터 연결
          { path: "feature-update", Component: AdminFeatureUpdateNotice }, // 기능 업데이트 알림 관리 라우터 연결
        ],
      },
    ],
  },
  {
    path: "/signup",
    element: (
      <>
        <SEOManager />
        <SignUp />
      </>
    ),
  },
  {
    path: "/login",
    element: (
      <>
        <SEOManager />
        <Login />
      </>
    ),
  },
  {
    path: "/admin/editor",
    element: (
      <>
        <SEOManager />
        <AdminEditor />
      </>
    ),
  },
  {
    path: "/admin/editor/:id",
    element: (
      <>
        <SEOManager />
        <AdminEditor />
      </>
    ),
  },
]);
