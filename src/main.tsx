
  import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import "./styles/index.css";
  import { browserSessionPersistence, setPersistence } from "firebase/auth";
  import { auth } from "./firebase";
  import { captureWebsiteHandoff, applyWebsiteHandoff, isHandoffPending, WEBSITE_PATHS } from "./utils/websiteHost";

  // 빌드 때 미리 그려둔 HTML(scripts/prerender.mjs)이면 그 임시 요소들을 정리한다 —
  // 구조화 데이터(JSON-LD)는 React가 다시 넣으므로 중복되지 않게 지우고,
  // 교회 서브도메인에서 숨겨둔 메인 화면 내용도 비운 뒤 앱을 그린다
  const rootEl = document.getElementById("root")!;

  // 교회 홈페이지({주소}.stayon-platform.com)를 검색봇(구글 렌더러 등)이 열었을 때:
  // 서버(siteOG)가 교회 내용을 다 채운 HTML을 줬는데, 앱을 띄우면 그 본문을 지우고
  // Firestore에서 다시 읽는다 — 구글 렌더러에선 이 연결이 끝나지 않아 빈 화면 + 주보
  // 플랫폼 기본 제목으로 색인 판단이 돼 버림. 그래서 이 경우만 서버 HTML을 그대로 둔다
  // (사람이 여는 화면은 기존과 동일)
  const host = location.hostname;
  const sub = host.endsWith(".stayon-platform.com") ? host.split(".")[0] : "";
  const isChurchSite = !!sub && !sub.endsWith("-jubo") &&
    !["www", "bulletin", "place", "stayonsbplatform", "website"].includes(sub);
  const isSearchBot = /googlebot|google-inspectiontool|bingbot|yeti|daum/i.test(navigator.userAgent);

  // 교회 홈페이지 제작 소개 페이지 전용 주소(website.stayon-platform.com, 2026-11-12)
  //  - website 주소: 첫 화면(/)·로그인·회원가입은 그대로, 그 밖의 주소 → bulletin 같은 주소로
  //  - bulletin.../website 를 링크로 바로 연 사람 → website 주소로(검색봇은 그대로 둠).
  //    메인 화면 버튼으로 앱 안에서 넘어가는 경우는 이 코드를 안 타서 bulletin에 그대로 있음
  //  - 양쪽 모두: 다른 쪽에서 로그인한 채 넘어오면(#t=열쇠) 그 열쇠로 같은 계정에 로그인(src/utils/websiteHost.ts)
  let movingAway = false;
  if (sub === "website") {
    // bulletin 메인과 같게: 탭을 닫으면 로그아웃
    void setPersistence(auth, browserSessionPersistence).catch(() => {});
  }
  if (sub === "website" && WEBSITE_PATHS.includes(location.pathname)) {
    captureWebsiteHandoff(); // bulletin에서 로그인한 채 넘어왔으면 일회용 로그인 열쇠를 받아 둠(아래에서 로그인)
  } else if (sub === "website") {
    movingAway = true;
    location.replace(location.pathname === "/website"
      ? `/${location.search}${location.hash}`
      : `https://bulletin.stayon-platform.com${location.pathname}${location.search}${location.hash}`);
  } else if (sub === "bulletin" && location.pathname === "/website" && !isSearchBot) {
    movingAway = true;
    location.replace(`https://website.stayon-platform.com/${location.search}${location.hash}`);
  } else if (sub === "bulletin" && location.hash.startsWith("#t=")) {
    captureWebsiteHandoff(); // website에서 로그인한 채 넘어옴(빌더·주보 관리자 등) → 화면 그리기 전에 로그인
  }
  const keepServerHtml = isChurchSite && isSearchBot && rootEl.children.length > 0;

  // 교회 홈페이지를 사람이 열었을 때도 서버(siteOG)가 교회 내용을 채운 HTML을 준다(2026-11-10,
  // 구글이 봇·사람 모두 같은 내용을 보게). 앱이 Firestore에서 내용을 다 불러올 때까지는 그 서버
  // 화면을 그대로 보여 주고(빈 화면 방지), 앱 화면이 준비되면 MultiPageSite가 #ssr-shell을 지운다
  // 주보 전용 주소({주소}-jubo)도 같은 방식(서버가 주보 본문을 넣어 줌). 성도 화면은 기존 그대로
  const isJuboSite = !!sub && sub.endsWith("-jubo");
  // QR 주보(/view/...)도 서버(bulletinOG)가 data-ssr 묶음으로 주보 본문을 넣어 줌(2026-11-10) — 같은 방식으로 처리
  const hasSsrBody = !!rootEl.firstElementChild?.hasAttribute("data-ssr");
  if (!keepServerHtml && (isChurchSite || isJuboSite || hasSsrBody) && rootEl.children.length > 0 && !document.getElementById("prerender-hide")) {
    const shell = document.createElement("div");
    shell.id = "ssr-shell";
    while (rootEl.firstChild) shell.appendChild(rootEl.firstChild);
    rootEl.parentNode!.insertBefore(shell, rootEl);
    // 앱 화면에 실제 내용이 그려지면(로딩 표시 말고) 서버 화면을 지움 — 화면에 그리기 전에 처리됨
    // 기준: 앱 화면 글자가 30자를 넘으면(로딩 문구 "불러오는 중…"보다 길면) 실제 내용으로 봄.
    // 짧은 화면(교회 소개 등)도 있어서 앱이 뜬 뒤 6초가 지나면 무조건 지움(서버 화면이 남아 겹치지 않게)
    const removeShell = () => { document.getElementById("ssr-shell")?.remove(); observer.disconnect(); clearTimeout(fallback); };
    const observer = new MutationObserver(() => {
      if ((rootEl.innerText || "").trim().length > 30) removeShell();
    });
    observer.observe(rootEl, { childList: true, subtree: true, characterData: true });
    const fallback = setTimeout(removeShell, 6000);
  }

  // website 주소에서 "뒤로가기"로 돌아왔는데 브라우저가 저장해 둔 화면이 첫 화면(/)이 아니면(예: 예전 버전에서 남은 /admin 기록)
  // 그 화면을 그대로 보여 주지 않고 위와 같은 규칙으로 다시 보냄
  if (sub === "website") {
    window.addEventListener("pageshow", (e) => {
      if (e.persisted && !WEBSITE_PATHS.includes(location.pathname)) {
        location.replace(location.pathname === "/website" ? "/"
          : `https://bulletin.stayon-platform.com${location.pathname}${location.search}${location.hash}`);
      }
    });
  }

  const start = () => {
    if (document.getElementById("prerender-hide")) rootEl.innerHTML = "";
    document.querySelectorAll("[data-prerender]").forEach((el) => el.remove());
    createRoot(rootEl).render(<App />);
  };
  if (!keepServerHtml && !movingAway) {
    if (sub === "bulletin" && isHandoffPending()) {
      // bulletin(빌더·주보 관리자 등)은 "로그인 안 됨"을 보면 로그인 화면으로 보내는 곳이 있어서, 열쇠 로그인을 먼저 마치고 그림
      void applyWebsiteHandoff().then(start);
    } else {
      start();
      if (sub === "website") void applyWebsiteHandoff(); // 받아 둔 열쇠로 로그인 → 헤더가 로그인 상태로 바뀜
    }
  }
