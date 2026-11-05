
  import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import "./styles/index.css";

  // 빌드 때 미리 그려둔 HTML(scripts/prerender.mjs)이면 그 임시 요소들을 정리한다 —
  // 구조화 데이터(JSON-LD)는 React가 다시 넣으므로 중복되지 않게 지우고,
  // 교회 서브도메인에서 숨겨둔 메인 화면 내용도 비운 뒤 앱을 그린다
  const rootEl = document.getElementById("root")!;
  if (document.getElementById("prerender-hide")) rootEl.innerHTML = "";
  document.querySelectorAll("[data-prerender]").forEach((el) => el.remove());

  createRoot(rootEl).render(<App />);
