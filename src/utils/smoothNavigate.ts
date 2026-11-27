import { useCallback } from "react";
import { useNavigate, type NavigateFunction, type NavigateOptions, type To } from "react-router";

// 주보 관리자(/admin…) 화면 사이 이동을 부드럽게(2026-11-25).
// 브라우저의 화면 전환 기능(View Transitions)으로, 지금 화면이 서서히 사라지고 새 화면이 살짝 떠오르며 겹쳐 바뀜
// (흰 화면이 번쩍이거나 뚝 끊기지 않음). 모양은 styles/index.css 의 ::view-transition-*.
// 지원하지 않는 브라우저는 예전처럼 바로 바뀜. 뒤로 가기(-1 같은 숫자)는 그대로
export function useSmoothNavigate(): NavigateFunction {
  const navigate = useNavigate();
  return useCallback(((to: To | number, opts?: NavigateOptions) => {
    if (typeof to === "number") return navigate(to);
    return navigate(to, { viewTransition: true, ...opts });
  }) as NavigateFunction, [navigate]);
}

// 사이드 메뉴로 갈 화면들의 파일을 미리 받아 둠 — 누른 뒤에 받으면 로딩 동그라미가 끼어 끊겨 보임
let preloaded = false;
export function preloadAdminPages() {
  if (preloaded) return;
  preloaded = true;
  const idle = (cb: () => void) => ("requestIdleCallback" in window ? (window as unknown as { requestIdleCallback: (f: () => void) => void }).requestIdleCallback(cb) : setTimeout(cb, 300));
  idle(() => {
    void import("../app/pages/AdminDashboard");
    void import("../app/pages/AdminEditor");
    void import("../app/pages/History");
    void import("../app/pages/ChurchNewsHistory");
    void import("../app/pages/ChurchNewsDetail");
    void import("../app/pages/NoticeBoard");
    void import("../app/pages/PaperJuboPage");
    void import("../app/pages/PaperFilesPage");
  });
}
