
  import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import "./styles/index.css";

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
    !["www", "bulletin", "place", "stayonsbplatform"].includes(sub);
  const isSearchBot = /googlebot|google-inspectiontool|bingbot|yeti|daum/i.test(navigator.userAgent);
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

  if (!keepServerHtml) {
    if (document.getElementById("prerender-hide")) rootEl.innerHTML = "";
    document.querySelectorAll("[data-prerender]").forEach((el) => el.remove());
    createRoot(rootEl).render(<App />);
  }
