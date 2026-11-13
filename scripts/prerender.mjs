// 빌드 직후(vite build 다음) 실행: 메인(/)·요금 안내(/pricing)·교회 홈페이지 제작(/website)
// 세 페이지를 헤드리스 크롬으로 실제로 열어, 다 그려진 화면을 HTML 파일로 저장한다.
// 사람이 열든 구글이 열든 처음부터 내용이 들어 있는 HTML을 받게 하기 위함.
//
// 결과물(dist/)
//   app.html      원래의 빈 SPA 껍데기 — 그 밖의 모든 경로(**)와 함수(주보 /view, 교회 사이트)가 사용
//   index.html    메인(/) 완성본
//   pricing.html  /pricing 완성본
//   website.html  /website 완성본 (siteOG 함수가 내려줌)
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import puppeteer from "puppeteer";

const DIST = path.resolve("dist");
const SITE = "https://bulletin.stayon-platform.com";
const PAGES = [
  { route: "/", file: "index.html" },
  { route: "/pricing", file: "pricing.html" },
  { route: "/website", file: "website.html" },
];
// 메인 페이지 교회 링크 목록 — 로컬 서버에는 없으니 실제 서버에서 받아온다
const CHURCH_LIST_SOURCES = [
  `${SITE}/searchable-churches.json`,
  "https://asia-northeast3-stayonsbplatform.cloudfunctions.net/bulletinSitemap/searchable-churches.json",
];

// 교회 서브도메인(예: stay.stayon-platform.com)의 일반 방문자도 Cloudflare Worker를 거쳐
// 같은 index.html을 받으므로, 그쪽에서는 미리 그린 메인 화면을 숨겼다가 앱이 그리게 한다
// (판별 기준은 routes.tsx의 getChurchSubdomain과 동일). 정리는 src/main.tsx가 함
const CHURCH_HOST_HIDE =
  `<script data-prerender>(function(){var h=location.hostname,s=h.replace(".stayon-platform.com","").split(".")[0];` +
  `if(/stayon-platform\\.com$/.test(h)&&s&&s!=="stayon-platform"&&["www","bulletin","place","stayonsbplatform","website"].indexOf(s)<0)` +
  `document.write('<style id="prerender-hide" data-prerender>#root{display:none}</style>')})()</script>`;

const shell = fs.readFileSync(path.join(DIST, "index.html"), "utf8");
// 실패해도 사이트가 깨지지 않도록 먼저 껍데기로 전부 채워둔다
for (const name of ["app.html", "pricing.html", "website.html"]) {
  fs.writeFileSync(path.join(DIST, name), shell);
}

const MIME = {
  ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml",
  ".webp": "image/webp", ".gif": "image/gif", ".ico": "image/x-icon", ".woff2": "font/woff2",
  ".woff": "font/woff", ".mp4": "video/mp4", ".txt": "text/plain", ".xml": "application/xml",
};

async function fetchChurchList() {
  for (const url of CHURCH_LIST_SOURCES) {
    try {
      const r = await fetch(url);
      if (r.ok) {
        const text = await r.text();
        if (Array.isArray(JSON.parse(text))) return text;
      }
    } catch {}
  }
  console.warn("[prerender] 교회 목록을 못 받아와 빈 목록으로 진행합니다");
  return "[]";
}

const churchList = await fetchChurchList();

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (urlPath === "/searchable-churches.json") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(churchList);
  }
  const filePath = path.join(DIST, urlPath);
  if (urlPath !== "/" && filePath.startsWith(DIST) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream" });
    return fs.createReadStream(filePath).pipe(res);
  }
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(shell);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({ headless: true });
let failed = false;
try {
  for (const { route, file } of PAGES) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    // Firestore 연결이 계속 열려 있어 네트워크가 완전히 조용해지지 않으므로,
    // 로드 후 화면 글자 수가 더 이상 변하지 않을 때까지 기다린다
    await page.goto(origin + route, { waitUntil: "load", timeout: 60000 });
    await page.evaluate(async () => {
      let last = -1;
      for (let stable = 0, i = 0; stable < 4 && i < 60; i++) {
        await new Promise((r) => setTimeout(r, 500));
        const len = document.getElementById("root").innerHTML.length;
        stable = len === last ? stable + 1 : 0;
        last = len;
      }
    });
    // 스크롤해야 나타나는 애니메이션 요소들까지 다 보이게 끝까지 내렸다가 올린다
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 400) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      window.scrollTo(0, 0);
    });
    await new Promise((r) => setTimeout(r, 1500));

    const html = await page.evaluate((shellHtml) => {
      const shellDoc = new DOMParser().parseFromString(shellHtml, "text/html");
      const original = new Set(
        [...shellDoc.querySelectorAll("script")].map((s) => s.outerHTML)
      );
      // 실행 중에 추가된 외부 스크립트는 빼고(앱이 다시 넣음), 구조화 데이터는 남기되 표시
      document.querySelectorAll("script").forEach((s) => {
        if (original.has(s.outerHTML)) return;
        if (s.type === "application/ld+json") s.setAttribute("data-prerender", "");
        else s.remove();
      });
      document.querySelectorAll("iframe").forEach((el) => el.remove());
      // 로그인 표시 자리(로그인/교회 이름 버튼)는 미리 그린 HTML에선 숨김 — 미리 그릴 땐 늘 "로그인"으로 찍혀서
      // 로그인한 사람이 열면 앱이 뜨기 전 잠깐 "로그인"이 보였다 바뀌는 깜빡임이 생김(WebsiteMain의 data-auth-slot)
      document.querySelectorAll("[data-auth-slot]").forEach((el) => { el.style.opacity = "0"; });
      document.querySelectorAll("style").forEach((el) => {
        if (!el.textContent.trim()) el.remove();
      });
      // body에는 #root와 원래 있던 스크립트만 남긴다(팝업·포털 등 제거)
      [...document.body.children].forEach((el) => {
        if (el.id === "root" || (el.tagName === "SCRIPT" && original.has(el.outerHTML))) return;
        el.remove();
      });
      return "<!DOCTYPE html>\n" + document.documentElement.outerHTML;
    }, shell);

    const textLength = await page.evaluate(() => document.getElementById("root").innerText.trim().length);
    await page.close();
    if (textLength < 200) throw new Error(`${route} 화면 내용이 비어 있습니다(${textLength}자)`);

    const out = html
      .split(origin).join(SITE)
      .replace("<head>", "<head>" + CHURCH_HOST_HIDE);
    fs.writeFileSync(path.join(DIST, file), out);
    console.log(`[prerender] ${route} → dist/${file} (본문 ${textLength}자)`);
  }
} catch (error) {
  failed = true;
  console.error("[prerender] 실패 — 해당 페이지는 기존 빈 껍데기 그대로 둡니다:", error);
} finally {
  await browser.close();
  server.close();
}
if (failed) process.exit(1);
