import { useEffect, useState } from "react";
import { createBrowserRouter, Outlet, ScrollRestoration, useLocation, useNavigate } from "react-router";
import { auth } from "../firebase";
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
import { ChurchNewsListPage } from "./pages/bulletin/ChurchNewsListPage"; // 성도 화면 메뉴 > 지난 교회 소식
import { ChurchNewsDetailPage } from "./pages/bulletin/ChurchNewsDetailPage"; // 지난 교회 소식 상세
import { LocationPage } from "./pages/bulletin/LocationPage"; // 성도 화면 메뉴 > 오시는 길
import { SnsPage } from "./pages/bulletin/SnsPage"; // 성도 화면 메뉴 > 교회 SNS·유튜브
import { Billing } from "./pages/Billing"; // 결제 관리(정기결제) 화면
import { Pricing } from "./pages/Pricing";
import { SuccessPage } from "./pages/Success";
import { Footer } from "./components/layout/footer";
import { SuperAuthGuard } from "./pages/SuperAuthGuard";
import { AdminSidebar } from "./components/layout/Sidebar";

import { WebsiteMain } from "./pages/website/WebsiteMain"; // 교회 홈페이지 제작 메인 페이지 컴포넌트 임포트
import { WebsiteRenderer } from "./pages/website/WebsiteRenderer";

// 사역자 청빙관 및 등록 페이지 컴포넌트 임포트
import { JobsGate } from "./pages/JobsGate"; // /jobs 전체를 관리자 화면 관리 설정에 따라 잠그는 공통 게이트 임포트
import { lazyPage } from "./lazyPage";
import { isWebsiteHost, BULLETIN_ORIGIN, WEBSITE_ORIGIN, prefetchWebsiteUrl, websiteUrlWithLogin, bulletinUrlWithLogin, WEBSITE_PATHS } from "../utils/websiteHost";

// ── 따로 떼어 내 필요할 때만 불러오는 화면(관리자·편집·청빙 등). lazyPage.tsx 참고
// 성도 주보 화면(BulletinView 등)·결제(Pricing/Billing/Success)·메인·교회 홈페이지는 위에서 바로 불러옴
const AdminDashboard = lazyPage(() => import("./pages/AdminDashboard"), "AdminDashboard");
const AdminEditor = lazyPage(() => import("./pages/AdminEditor"), "AdminEditor");
const History = lazyPage(() => import("./pages/History"), "History");
const ChurchNewsHistory = lazyPage(() => import("./pages/ChurchNewsHistory"), "ChurchNewsHistory");
const ChurchNewsDetail = lazyPage(() => import("./pages/ChurchNewsDetail"), "ChurchNewsDetail");
const AdminJuboManagement = lazyPage(() => import("./pages/AdminJuboManagement"), "AdminJuboManagement");
const AdminBulletinList = lazyPage(() => import("./pages/AdminBulletinList"), "AdminBulletinList");
const AdminAuthUsers = lazyPage(() => import("./pages/admin/AdminAuthUsers"), "AdminAuthUsers");
const AdminRequests = lazyPage(() => import("./pages/admin/AdminRequests"), "AdminRequests"); // /super 신청 관리
const AdminFundraisers = lazyPage(() => import("./pages/admin/AdminFundraisers"), "AdminFundraisers"); // 모금 프로젝트(러브링 등) 운영자 화면
// 모금 프로젝트 교회 관리자 화면(필요할 때만 불러옴). 기존 /admin 묶음(대시보드·결제 등)과 따로 둠
const FundraisingAdmin = lazyPage(() => import("./pages/fundraising/FundraisingAdmin"), "FundraisingAdmin");
const FundraisingList = lazyPage(() => import("./pages/fundraising/FundraisingAdmin"), "FundraisingList");
// 모금 프로젝트 성도 화면(QR 연결) · 교회 입구 9:16 화면 — 필요할 때만 불러옴. 성도 주보 화면(/view)과 별개
const GivePage = lazyPage(() => import("./pages/fundraising/Give"), "GivePage");
const GiveDisplay = lazyPage(() => import("./pages/fundraising/Give"), "GiveDisplay");
const RetreatPage = lazyPage(() => import("./pages/retreat/RetreatPage"), "RetreatPage"); // 수련회 성도 화면(2026-11-24)
const PaperJuboPage = lazyPage(() => import("./pages/PaperJuboPage"), "PaperJuboPage"); // 종이 주보 만들기(주보 관리자, 2026-11-24)
const PaperFilesPage = lazyPage(() => import("./pages/PaperFilesPage"), "PaperFilesPage"); // 올린 종이 주보 전체 보기(카드/표, 2026-11-25)
// "함께한 이야기"(/story) 공개 카드 화면 · 운영자 관리 화면 — 필요할 때만 불러옴
const StoryPage = lazyPage(() => import("./pages/story/StoryPage"), "StoryPage");
const AdminStories = lazyPage(() => import("./pages/admin/AdminStories"), "AdminStories");
const AdminChurchSites = lazyPage(() => import("./pages/admin/AdminChurchSites"), "AdminChurchSites");
const AdminAdSettings = lazyPage(() => import("./pages/admin/AdminAdSettings"), "AdminAdSettings");
const AdminFeatureSettings = lazyPage(() => import("./pages/admin/AdminFeatureSettings"), "AdminFeatureSettings");
const AdminFeatureUpdateNotice = lazyPage(() => import("./pages/admin/AdminFeatureUpdateNotice"), "AdminFeatureUpdateNotice");
const AdminPromoPopup = lazyPage(() => import("./pages/admin/AdminPromoPopup"), "AdminPromoPopup"); // 홍보 팝업 관리
const AdminPayments = lazyPage(() => import("./pages/admin/AdminPayments"), "AdminPayments"); // 결제·정산(보기 전용)
const AdminCustomDesign = lazyPage(() => import("./pages/admin/AdminCustomDesign"), "AdminCustomDesign");
const NoticeBoard = lazyPage(() => import("./pages/NoticeBoard"), "NoticeBoard");
const WebsiteCreate = lazyPage(() => import("./pages/website/WebsiteCreate"), "WebsiteCreate");
const WebsitePreview = lazyPage(() => import("./pages/website/WebsitePreview"), "WebsitePreview");
const WebsiteOffer = lazyPage(() => import("./pages/website/WebsiteOffer"), "WebsiteOffer");
const JobBoard = lazyPage(() => import("./pages/JobBoard"), "JobBoard");
const JobWrite = lazyPage(() => import("./pages/JobWrite"), "JobWrite");
const JobBoost = lazyPage(() => import("./pages/JobBoost"), "JobBoost");
const JobDetail = lazyPage(() => import("./pages/JobDetail"), "JobDetail");
const JobEdit = lazyPage(() => import("./pages/JobEdit"), "JobEdit");
const BuilderPage = lazyPage(() => import("./pages/website/BuilderPage"), "default");
const CellGroupPage = lazyPage(() => import("./pages/CellGroupPage"), "CellGroupPage"); // 소그룹(셀그룹) 편성

const SEOManager = () => {
  const location = useLocation();

  useEffect(() => {
    // website.stayon-platform.com 첫 화면은 /website(소개 페이지)와 같은 제목·설명
    const onWebsiteHost = isWebsiteHost();
    const path = onWebsiteHost && location.pathname === "/" ? "/website" : location.pathname;
    let title = "온라인 주보 제작 스테이온 | 모바일 주보 월 990원 스마트 교회 주보";
    // 기존 index.html 정적 태그와 동일한 기본값 — /website 외 다른 라우트는
    // 이 값 그대로라 실제로 바뀌는 페이지는 하나도 없음
    let description =
      "온라인 주보, 모바일 주보를 월 990원 최저가로 시작하는 스테이온(STAYON). 종이 없는 건강한 교회를 위한 가장 쉬운 스마트 주보 제작 플랫폼입니다.";
    // og:title은 document.title(위 title)과 별개로, index.html 정적 기본값을 그대로 씀 —
    // /website 외에는 이 값을 안 건드려서 다른 라우트의 카카오톡 공유 미리보기 등은 전혀 안 바뀜
    let ogTitle = "온라인 주보 제작 스테이온(STAYON) | 월 990원 우리 교회 모바일 주보";

    if (path === "/") {
      title = "온라인 주보 제작 스테이온 | 모바일 주보 월 990원 스마트 교회 주보";
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

    // canonical/og:url도 경로별로 갱신 — index.html 정적 기본값은 "/" 기준이라
    // /pricing, /website 등 다른 라우트는 지금까지 canonical이 아예 없는 것과 같았음.
    // window.location.origin을 써야 교회 서브도메인(교회이름.stayon-platform.com)에서도
    // 그 교회 자신의 주소로 canonical이 잡히고, 메인 bulletin 도메인으로 잘못 몰리지 않음
    // (2026-11-13) 교회 홈페이지 제작 소개 페이지의 검색엔진 대표 주소는 website.stayon-platform.com/
    // (bulletin.../website도 같은 내용이라 대표 주소를 website 쪽으로 모음). website 주소의 그 밖의
    // 경로(/signup 등)는 주보 플랫폼과 같은 화면이라 bulletin 쪽 주소를 대표로 둠
    const canonicalUrl = path === "/website" ?
      WEBSITE_ORIGIN + "/" :
      onWebsiteHost ? `${BULLETIN_ORIGIN}${path}` : `${window.location.origin}${path}`;
    let canonicalLink = document.querySelector('link[rel="canonical"]');
    if (!canonicalLink) {
      canonicalLink = document.createElement("link");
      canonicalLink.setAttribute("rel", "canonical");
      document.head.appendChild(canonicalLink);
    }
    canonicalLink.setAttribute("href", canonicalUrl);
    setMetaContent('meta[property="og:url"]', canonicalUrl);
  }, [location]);

  return null;
};

// BuilderPage는 onBack 콜백을 필요로 하는 컴포넌트라, 라우터에 바로 연결할 수 있도록 얇은 래퍼로 감쌈
// 빌더의 "뒤로" — 어디서 들어왔는지에 따라 돌아갈 곳을 정함(2026-11-12)
//  - 주보 플랫폼 메인 "바로 가기 > 사이트 관리자"로 들어옴(state.from = "main") → 주보 플랫폼 메인(/)
//  - website.stayon-platform.com 에서 들어옴(?from=website) → website 주소(로그인 이어 주기 포함)
//  - 그 외(bulletin.../website 화면, 주소 직접 입력 등) → 예전처럼 /website
// 빌더 안에서 새로고침해도 유지되게 이 탭에 기억(sessionStorage)
const BUILDER_FROM_KEY = "stayon:builderFrom";
const BuilderPageRoute = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [from] = useState<string>(() => {
    const q = new URLSearchParams(location.search).get("from");
    const st = (location.state as { from?: string } | null)?.from;
    const v = q === "website" ? "website" : st === "main" ? "main" : (q || st) ? "" : null;
    try {
      if (v) sessionStorage.setItem(BUILDER_FROM_KEY, v);
      else if (v === "") sessionStorage.removeItem(BUILDER_FROM_KEY);
      return v ?? sessionStorage.getItem(BUILDER_FROM_KEY) ?? "";
    } catch { return v ?? ""; }
  });
  // (2026-11-19) 편집 화면은 website 주소에서만 — bulletin 주소로 들어오면(주보 메인 "사이트 관리자", /super "편집" 등)
  // 로그인 상태를 이어서 website 주소의 같은 화면으로 넘김. 로그인 확인이 끝난 뒤 넘겨야 열쇠를 받을 수 있음
  const moveToWebsite = window.location.hostname === "bulletin.stayon-platform.com";
  useEffect(() => {
    if (!moveToWebsite) return;
    const sp = new URLSearchParams(location.search);
    sp.delete("from");
    const rest = sp.toString();
    void auth.authStateReady()
      .then(() => websiteUrlWithLogin(null, `${location.pathname}${rest ? `?${rest}` : ""}`))
      .then((url: string) => window.location.replace(url));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (moveToWebsite) return;
    // 주소창의 ?from=website 는 지움(화면엔 영향 없음)
    const sp = new URLSearchParams(location.search);
    if (sp.has("from")) {
      sp.delete("from"); // ?site= 등 다른 값은 그대로 둠
      const rest = sp.toString();
      navigate(`/website-builder${rest ? `?${rest}` : ""}`, { replace: true, state: location.state });
    }
    if (from === "website") prefetchWebsiteUrl(); // 돌아갈 때 바로 넘어가게 로그인 열쇠 미리 받기
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const onBack = () => {
    try { sessionStorage.removeItem(BUILDER_FROM_KEY); } catch { /* 무시 */ }
    if (from === "main") { navigate("/"); window.scrollTo(0, 0); return; }
    if (from === "website" && window.location.hostname === "bulletin.stayon-platform.com") {
      void websiteUrlWithLogin(null).then((url) => { window.location.href = url; });
      return;
    }
    navigate(isWebsiteHost() ? "/" : "/website"); // website 주소에선 website 첫 화면으로
  };
  if (moveToWebsite) return null; // website 주소로 넘어가는 중
  return <BuilderPage onBack={onBack} />;
};

// 교회 서브도메인(예: stay.stayon-platform.com)에서는 WebsiteRenderer가 이미 자체 footer(교회 이름/
// 주소/연락처)를 그리고 있으므로, STAYON 플랫폼 자체의 사업자 정보 footer는 중복으로 붙이지 않음.
// 성도 화면(주보)도 마찬가지로 이 공통 Footer 대신 BulletinView 자체에 있는 작은 하단
// 정보(상호/문의전화/SNS)만 보여주므로 여기서 숨긴다.
// 주보 관리자(/admin…) 화면 전환 애니메이션(2026-11-25)은 각 화면 맨 바깥 칸에 둠(animate-in …).
// 여기(공통 틀)에 두면 화면 파일을 받아 오는 동안 로딩 화면에서 먼저 끝나 버려 실제 화면이 뚝 나타났음
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
  // 개발 서버(npm run dev) 전용: http://localhost:5174/?church=stay 처럼 열면 그 교회 홈페이지로 보여줌.
  // 한 번 열면 탭을 닫기 전까지 유지되고, ?church= (빈 값)으로 열면 해제. 빌드(실제 사이트)에는 포함되지 않음
  if (import.meta.env.DEV) {
    const q = new URLSearchParams(window.location.search).get("church");
    if (q !== null) {
      if (q) sessionStorage.setItem("devChurch", q);
      else sessionStorage.removeItem("devChurch");
    }
    const devChurch = sessionStorage.getItem("devChurch");
    if (devChurch) return devChurch;
  }
  const hostname = window.location.hostname;
  const knownSubdomains = ["www", "bulletin", "place", "stayonsbplatform", "website"];
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
  const location = useLocation(); // 페이지 전환형 교회 사이트가 지금 주소(/about 등)를 알아야 함
  return subdomain ? <WebsiteRenderer slug={subdomain} section={section} pathname={location.pathname} /> : <Landing />;
};

const ChurchHomeRoute = churchSectionRoute("home");
// website.stayon-platform.com 첫 화면 = 교회 홈페이지 제작 소개(/website와 같은 화면). 그 외 주소는 기존 그대로
const HostRouter = () => (isWebsiteHost() ? <WebsiteMain /> : <ChurchHomeRoute />);
const ChurchWorshipRoute = churchSectionRoute("worship");
const ChurchCommunityRoute = churchSectionRoute("community");
const ChurchNewsRoute = churchSectionRoute("news");
const ChurchLocationRoute = churchSectionRoute("location");
const ChurchOnlineWorshipRoute = churchSectionRoute("online-worship");
// 페이지 전환형 교회 사이트의 나머지 메뉴(교회 소개/설교/주보/칼럼/중보기도 등).
// 교회 서브도메인이 아니면(bulletin 등) 위 라우트들과 똑같이 랜딩으로 대체되어 주보 플랫폼엔 영향 없음
const ChurchPageRoute = churchSectionRoute("home");
const CHURCH_PAGE_PATHS = [
  "about", "about/pastor", "about/history", "about/staff", "about/newcomer", "worship/online", "sermons", "sermons/live", "praise",
  "bulletins", "bulletins/:pageId", "jubo", "news/:pageId", "column", "column/:pageId",
  "prayer", "prayer/:pageId", "education", "education/:pageId", "album", "album/:pageId", "schedule",
  "grace", "grace/:pageId", // 은혜나눔 게시판(2026-11-24)
];


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
      ...CHURCH_PAGE_PATHS.map((path) => ({ path, Component: ChurchPageRoute })), // 교회 사이트 페이지 전환형 메뉴
      { path: "bulletin", Component: BulletinView },
      { path: "view/:id", Component: BulletinView },
      { path: "view/:id/about", Component: AboutPage }, // 성도 화면 메뉴 > 교회 소개
      { path: "view/:id/pastor", Component: PastorGreetingPage }, // 성도 화면 메뉴 > 담임목사 인사말
      { path: "view/:id/team", Component: TeamPage }, // 성도 화면 메뉴 > 섬기시는 분
      { path: "view/:id/officers", Component: OfficersPage }, // 성도 화면 메뉴 > 섬기시는 분 > 중직자
      { path: "view/:id/column", Component: PastoralColumnListPage }, // 성도 화면 메뉴 > 목회 칼럼
      { path: "view/:id/column/:columnId", Component: PastoralColumnDetailPage }, // 목회 칼럼 상세
      { path: "view/:id/church-news", Component: ChurchNewsListPage }, // 성도 화면 메뉴 > 지난 교회 소식
      { path: "view/:id/church-news/:newsId", Component: ChurchNewsDetailPage }, // 지난 교회 소식 상세
      { path: "view/:id/location", Component: LocationPage }, // 성도 화면 메뉴 > 오시는 길
      { path: "view/:id/sns", Component: SnsPage }, // 성도 화면 메뉴 > 교회 SNS·유튜브
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
      { path: "billing", Component: Billing }, // 결제 관리(정기결제) 화면
      { path: "church-news", Component: ChurchNewsHistory },
      { path: "church-news/:id", Component: ChurchNewsDetail },
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
          { path: "requests", Component: AdminRequests }, // 신청 관리(1년 결제 신청 · 환급 요청 · 1개월 무료 쿠폰, 2026-11-25)
          { path: "fundraisers", Component: AdminFundraisers }, // 모금 프로젝트(러브링 등) 생성·교회 계정 연결·열기/닫기
          { path: "stories", Component: AdminStories }, // 메인 화면 "함께한 이야기"(/story) 카드 관리
          { path: "ads", Component: AdminAdSettings }, // 사역자 청빙 게시판 끌어올리기(광고) 설정 라우터 연결
          { path: "custom-design", Component: AdminCustomDesign }, // 커스텀 디자인 교회별 사용 권한 관리 라우터 연결
          { path: "features", Component: AdminFeatureSettings }, // 화면 노출 on/off 관리 라우터 연결
          { path: "feature-update", Component: AdminFeatureUpdateNotice }, // 기능 업데이트 알림 관리 라우터 연결
          { path: "promo-popup", Component: AdminPromoPopup }, // 주보 첫 화면·관리 화면 홍보 팝업 켜고 끄기
          { path: "payments", Component: AdminPayments }, // 정기결제 중인 교회 · 결제 내역 · 월별 정산
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
  // 모금 프로젝트(러브링 등) 교회 관리자 화면 — /admin 묶음 밖에 따로(/admin/editor 처럼). 기존 /admin 화면엔 영향 없음
  // 소그룹(셀그룹) 편성 — 인쇄할 때 공통 Footer가 같이 찍히지 않게 RootLayout 밖에 둠
  { path: "/cell-group", element: (<><SEOManager /><CellGroupPage /></>) },
  { path: "/cell-group/:planId", element: (<><SEOManager /><CellGroupPage /></>) }, // 공유 편성표(실시간 함께 편집)
  { path: "/admin/paper-jubo", Component: PaperJuboPage },
  { path: "/admin/paper-files", Component: PaperFilesPage },
  { path: "/admin/fundraising", Component: FundraisingList },
  { path: "/admin/fundraising/:projectId", Component: FundraisingAdmin },
  { path: "/give/:projectId", Component: GivePage },
  { path: "/give/:projectId/display", Component: GiveDisplay },
  { path: "/retreat/:id", Component: RetreatPage },
  // 메인 화면 상단 "함께한 이야기" — STAYON과 함께한 프로젝트 카드 목록
  { path: "/story", Component: StoryPage },
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

// website.stayon-platform.com 에서 소개 페이지 안의 버튼(로그인·무료로 시작하기·만들기 등)을 누르면
// 그 주소는 bulletin 쪽으로 넘김 — 로그인 상태가 주소마다 따로라 실제 제작은 bulletin에서 하게.
// (처음 들어올 때의 주소는 src/main.tsx에서 같은 규칙으로 처리). bulletin 등 다른 주소에선 아무 일 없음
if (isWebsiteHost()) {
  router.subscribe((state) => {
    const { pathname, search, hash } = state.location;
    void hash;
    if (WEBSITE_PATHS.includes(pathname)) return; // 첫 화면·로그인·회원가입은 website 주소에서 그대로
    if (pathname === "/website") { void router.navigate("/", { replace: true }); return; }
    // 그 밖의 화면(로그인 후 빌더·주보 관리자 등) → bulletin 주소로, 로그인했으면 열쇠를 붙여 로그인 유지.
    // replace: 앱 안 이동 기록을 bulletin 주소로 바꿔치기(뒤로가기 때 website에 다른 화면이 남지 않게)
    void bulletinUrlWithLogin(`${pathname}${search}`).then((url) => window.location.replace(url));
  });
}
