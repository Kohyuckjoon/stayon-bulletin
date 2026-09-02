import { useState } from "react";
import { useNavigate, useLocation } from "react-router";
import { Menu, X } from "lucide-react";

// /super 하위 전체 페이지에서 공유하는 내비게이션 항목 목록.
// 데스크톱(좌측 고정 사이드바)과 모바일(상단 바 + 슬라이드 메뉴)이 이 배열 하나를 함께 사용한다.
const NAV_ITEMS = [
  { label: "전체 회원 관리", path: "/super/management", match: (p: string) => p.includes("management") || p === "/super" },
  { label: "가입자 현황", path: "/super/auth-users", match: (p: string) => p.includes("auth-users") },
  { label: "주보 발행 관리", path: "/super/bulletins", match: (p: string) => p.includes("bulletins") },
  { label: "공지사항 관리", path: "/super/notify", match: (p: string) => p.includes("notify") },
  { label: "사이트 발행 관리", path: "/super/church-sites", match: (p: string) => p.includes("church-sites") },
  { label: "광고 설정", path: "/super/ads", match: (p: string) => p.includes("/super/ads") },
  { label: "화면 관리", path: "/super/features", match: (p: string) => p.includes("/super/features") },
  { label: "기능 업데이트 알림", path: "/super/feature-update", match: (p: string) => p.includes("/super/feature-update") },
];

export const AdminSidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;
  const [mobileOpen, setMobileOpen] = useState(false);

  const activeLabel = NAV_ITEMS.find((item) => item.match(currentPath))?.label || "StayOn Admin";

  const goTo = (path: string) => {
    navigate(path);
    setMobileOpen(false);
  };

  return (
    <>
      {/* 데스크톱: 기존 그대로 좌측 고정 사이드바 */}
      <aside className="w-64 bg-[#0f172a] min-h-screen p-5 text-white hidden md:block flex-shrink-0">
        <div className="mb-10 text-lg font-bold px-3 tracking-tight">StayOn Admin</div>
        <nav className="space-y-1.5">
          {NAV_ITEMS.map((item) => (
            <div
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`block px-4 py-3 rounded-xl font-medium cursor-pointer transition-colors ${item.match(currentPath)
                ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                : "text-slate-400 hover:bg-white/5 hover:text-white"
                }`}
            >
              {item.label}
            </div>
          ))}
        </nav>
      </aside>

      {/* 모바일: 상단 고정 바 + 눌렀을 때 내려오는 메뉴. 사이드바가 안 보이던 자리를 대신한다 */}
      <div className="md:hidden sticky top-0 z-40 bg-[#0f172a] text-white">
        <div className="flex items-center justify-between px-4 h-14">
          <span className="font-bold text-[15px] tracking-tight truncate">{activeLabel}</span>
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className="w-9 h-9 -mr-1.5 rounded-full flex items-center justify-center text-slate-300 hover:bg-white/10 transition-colors shrink-0"
            aria-label="메뉴 열기"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {mobileOpen && (
          <nav className="px-3 pb-3 space-y-1 border-t border-white/10 pt-3">
            {NAV_ITEMS.map((item) => (
              <div
                key={item.path}
                onClick={() => goTo(item.path)}
                className={`px-4 py-3 rounded-xl font-medium cursor-pointer transition-colors text-[14px] ${item.match(currentPath)
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                  : "text-slate-300 hover:bg-white/5 hover:text-white"
                  }`}
              >
                {item.label}
              </div>
            ))}
          </nav>
        )}
      </div>
    </>
  );
};
