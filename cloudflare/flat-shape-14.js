// Cloudflare Worker "flat-shape-14" (경로: *.stayon-platform.com/*) 코드 사본.
// 실제 배포는 Cloudflare 대시보드 → Workers & Pages → flat-shape-14 → Edit code
// 에 이 파일 내용을 그대로 붙여 넣고 Deploy. 이 파일을 고쳐도 자동 반영되지 않음.
//
// 바뀐 점(2026-11):
//  1. {주소}-jubo.stayon-platform.com(교회별 주보 전용 주소) → bulletinSite 함수
//  2. 교회 홈페이지 검색봇 목록에 네이버(yeti) 추가
//  3. 교회 홈페이지의 robots.txt·sitemap.xml·rss.xml → siteOG(교회별 파일)
//  4. (2026-11-06) 교회 홈페이지에서 봇이 이미지 등 정적 파일을 요청하면 실제 파일을 줌
//     (파비콘을 네이버가 못 읽던 문제)
//  5. (2026-11-09) 속도 개선: /assets/ 파일·이미지를 Cloudflare에 저장해 두고 바로 돌려줌(맨 아래)
//  6. (2026-11-09) 한국 방문자가 Cloudflare 미국(LA) 서버로 연결돼 느린 문제: 페이지(HTML) 안의
//     프로그램·스타일 파일(/assets/) 주소를 bulletin.stayon-platform.com(Firebase 서울 서버 직통)으로 바꿔 줌.
//     ※ 반드시 Firebase hosting 배포(firebase.json의 Access-Control-Allow-Origin 추가)를 먼저 한 뒤 이 코드를 Deploy할 것
//  7. (2026-11-10) 구글 색인 문제: 교회 홈페이지 페이지(파일 아닌 주소)는 사람 방문자도 siteOG로
//     → 누구에게나 같은 교회 HTML(주보플러스와 같은 방식). 이미지·JS 같은 파일은 그대로 Hosting
// 그 외(미리보기 봇 등)는 기존과 동일.
// bulletin.stayon-platform.com(QR 주소)은 Cloudflare를 거치지 않아 이 코드와 무관.

// bulletin.stayon-platform.com이 아니라 web.app 주소를 씀: 주보 화면을 연 적 있는 브라우저에는 허용 설정 전의
// 옛 파일이 1년짜리로 저장돼 있어 교회 홈페이지에서 막혔음(빈 화면). web.app 주소는 그런 저장본이 없음. 둘 다 서울 서버
const FAST_ORIGIN = "https://stayonsbplatform.web.app";

// 사람이 보는 페이지(HTML)일 때만 /assets/ 주소를 서울 직통 주소로 바꿈. 그 밖의 응답은 그대로
function fastAssets(response) {
  const type = response.headers.get("content-type") || "";
  if (!type.includes("text/html")) return response;
  const fix = (attr) => ({
    element(el) {
      const v = el.getAttribute(attr);
      if (v && v.startsWith("/assets/")) el.setAttribute(attr, FAST_ORIGIN + v);
    },
  });
  return new HTMLRewriter()
    .on("script[src]", fix("src"))
    .on("link[href]", fix("href"))
    .transform(response);
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const userAgent = request.headers.get("user-agent") || "";

    // 교회별 주보 전용 주소: 페이지·robots.txt·sitemap.xml·rss.xml은 bulletinSite
    // 함수가 만들고, 이미지·JS 같은 정적 파일은 아래 일반 방문자 처리로 넘긴다
    if (url.hostname.endsWith("-jubo.stayon-platform.com")) {
      const p = url.pathname;
      const isStatic = /\.[a-z0-9]+$/i.test(p) &&
        !["/robots.txt", "/sitemap.xml", "/rss.xml"].includes(p);
      if (!isStatic) {
        const fnUrl = new URL("https://asia-northeast3-stayonsbplatform.cloudfunctions.net/bulletinSite");
        fnUrl.searchParams.set("host", url.hostname);
        fnUrl.searchParams.set("path", p);
        const res = await fetch(fnUrl.toString(), {
          headers: { "user-agent": userAgent },
        });
        return fastAssets(res);
      }
    } else {
      // 카카오톡/페이스북 등 링크 미리보기 봇·검색봇인 경우: Firebase Hosting을 거치지
      // 않고 OG 태그 생성 함수를 바로 호출 (루트 주소 "/"도 놓치지 않기 위함)
      const isPreviewBot =
        /kakaotalk-scrap|facebookexternalhit|twitterbot|slackbot|telegrambot|googlebot|bingbot|google-inspectiontool|yeti/i.test(userAgent);
      // 교회 홈페이지의 robots.txt·sitemap.xml은 누가 요청하든 그 교회 것으로
      // (Hosting에 있는 건 bulletin 사이트용이라 교회별 네이버 등록이 안 됨)
      const sub = url.hostname.split(".")[0];
      const isChurchSeoFile =
        url.hostname.endsWith(".stayon-platform.com") &&
        !["www", "bulletin", "place", "stayonsbplatform"].includes(sub) &&
        ["/robots.txt", "/sitemap.xml", "/rss.xml"].includes(url.pathname);

      // 이미지·JS 같은 정적 파일(파비콘 포함)은 봇이 요청해도 실제 파일을 줘야 함
      // (전에는 봇 요청이면 이미지도 siteOG로 가서 HTML이 돌아가, 네이버가 파비콘을 못 읽었음)
      const isStaticFile = /\.[a-z0-9]+$/i.test(url.pathname) && !isChurchSeoFile;

      // (2026-11-10) 교회 홈페이지 페이지는 사람이 열어도 siteOG가 만든 교회 HTML을 줌
      // (예전엔 사람에게 주보 플랫폼 메인이 나가서 구글이 교회 주소를 bulletin 복사본으로 보고 색인 안 함)
      const isChurchPage =
        url.hostname.endsWith(".stayon-platform.com") &&
        !["www", "bulletin", "place", "stayonsbplatform"].includes(sub) &&
        !isStaticFile;

      if ((isPreviewBot && !isStaticFile) || isChurchSeoFile || isChurchPage) {
        const ogUrl = new URL("https://asia-northeast3-stayonsbplatform.cloudfunctions.net/siteOG");
        ogUrl.searchParams.set("host", url.hostname);
        ogUrl.searchParams.set("path", url.pathname);
        const res = await fetch(ogUrl.toString(), {
          headers: { "user-agent": userAgent },
        });
        return fastAssets(res);
      }
    }

    // 일반 방문자: 기존과 완전히 동일하게 처리 (변경 없음)
    const originUrl = new URL(request.url);
    const originalHost = originUrl.hostname;
    originUrl.hostname = "stayonsbplatform.web.app";
    const originRequest = new Request(originUrl.toString(), request);
    originRequest.headers.set("host", "stayonsbplatform.web.app");
    originRequest.headers.set("x-original-host", originalHost);
    // (2026-11-09) 속도 개선: 이름이 바뀌는 프로그램·스타일 파일(/assets/)은 1년, 그 밖의 이미지는 하루
    // Cloudflare에 저장해 두고 바로 돌려줌(매번 Firebase까지 가지 않음). 페이지(HTML)는 저장하지 않음
    if (originUrl.pathname.startsWith("/assets/")) {
      return fetch(originRequest, { cf: { cacheEverything: true, cacheTtl: 31536000 } });
    }
    if (/\.(png|jpe?g|webp|svg|ico)$/i.test(originUrl.pathname)) {
      return fetch(originRequest, { cf: { cacheEverything: true, cacheTtl: 86400 } });
    }
    return fastAssets(await fetch(originRequest));
  },
};
