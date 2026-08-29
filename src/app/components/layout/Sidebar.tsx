// export const AdminSidebar = () => (
//   <aside className="w-64 bg-[#0f172a] min-h-screen p-5 text-white hidden md:block">
//     <div className="mb-10 text-lg font-bold">StayOn Admin</div>
//     <nav className="space-y-2">
//       <div className="block px-4 py-3 bg-blue-600 rounded-xl font-medium">전체 회원 관리</div>
//       <div className="block px-4 py-3 text-slate-400 hover:bg-white/5 rounded-xl cursor-pointer">대시보드</div>
//       <div className="block px-4 py-3 text-slate-400 hover:bg-white/5 rounded-xl cursor-pointer">문의 관리</div>
//     </nav>
//   </aside>
// );


import { useNavigate, useLocation } from "react-router";

export const AdminSidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;

  return (
    <aside className="w-64 bg-[#0f172a] min-h-screen p-5 text-white hidden md:block flex-shrink-0">
      <div className="mb-10 text-lg font-bold px-3 tracking-tight">StayOn Admin</div>
      <nav className="space-y-1.5">
        <div
          onClick={() => navigate("/super/management")}
          className={`block px-4 py-3 rounded-xl font-medium cursor-pointer transition-colors ${currentPath.includes("management") || currentPath === "/super"
            ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
            : "text-slate-400 hover:bg-white/5 hover:text-white"
            }`}
        >
          전체 회원 관리
        </div>
        <div
          onClick={() => navigate("/super/auth-users")}
          className={`block px-4 py-3 rounded-xl font-medium cursor-pointer transition-colors ${currentPath.includes("auth-users")
            ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
            : "text-slate-400 hover:bg-white/5 hover:text-white"
            }`}
        >
          가입자 현황
        </div>
        <div
          onClick={() => navigate("/super/bulletins")}
          className={`block px-4 py-3 rounded-xl font-medium cursor-pointer transition-colors ${currentPath.includes("bulletins")
            ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
            : "text-slate-400 hover:bg-white/5 hover:text-white"
            }`}
        >
          주보 발행 관리
        </div>
        <div
          onClick={() => navigate("/super/notify")}
          className={`block px-4 py-3 rounded-xl font-medium cursor-pointer transition-colors ${currentPath.includes("notify")
            ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
            : "text-slate-400 hover:bg-white/5 hover:text-white"
            }`}
        >
          공지사항 관리
        </div>
        {/* 교회 사이트 제작 플랫폼(주보 플랫폼과 별개 기능) 전용 메뉴 */}
        <div
          onClick={() => navigate("/super/church-sites")}
          className={`block px-4 py-3 rounded-xl font-medium cursor-pointer transition-colors ${currentPath.includes("church-sites")
            ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
            : "text-slate-400 hover:bg-white/5 hover:text-white"
            }`}
        >
          사이트 발행 관리
        </div>
        {/* 사역자 청빙 게시판(jobPosts) 끌어올리기(광고) 기간 설정 전용 메뉴 */}
        <div
          onClick={() => navigate("/super/ads")}
          className={`block px-4 py-3 rounded-xl font-medium cursor-pointer transition-colors ${currentPath.includes("/super/ads")
            ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
            : "text-slate-400 hover:bg-white/5 hover:text-white"
            }`}
        >
          광고 설정
        </div>
        {/* 사용자에게 공개 노출할 화면을 켜고 끄는 전용 메뉴 */}
        <div
          onClick={() => navigate("/super/features")}
          className={`block px-4 py-3 rounded-xl font-medium cursor-pointer transition-colors ${currentPath.includes("/super/features")
            ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
            : "text-slate-400 hover:bg-white/5 hover:text-white"
            }`}
        >
          화면 관리
        </div>
      </nav>
    </aside>
  );
};
