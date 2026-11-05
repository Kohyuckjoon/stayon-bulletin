// Cloudflare Worker "flat-shape-14" (경로: *.stayon-platform.com/*) 코드 사본.
// 실제 배포는 Cloudflare 대시보드 → Workers & Pages → flat-shape-14 → Edit code
// 에 이 파일 내용을 그대로 붙여 넣고 Deploy. 이 파일을 고쳐도 자동 반영되지 않음.
//
// 바뀐 점(2026-11):
//  1. {주소}-jubo.stayon-platform.com(교회별 주보 전용 주소) → bulletinSite 함수
//  2. 교회 홈페이지 검색봇 목록에 네이버(yeti) 추가
//  3. 교회 홈페이지의 robots.txt·sitemap.xml·rss.xml → siteOG(교회별 파일)
// 그 외(교회 홈페이지 일반 방문자, 미리보기 봇)는 기존과 동일.
// bulletin.stayon-platform.com(QR 주소)은 Cloudflare를 거치지 않아 이 코드와 무관.

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
        return fetch(fnUrl.toString(), {
          headers: { "user-agent": userAgent },
        });
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

      if (isPreviewBot || isChurchSeoFile) {
        const ogUrl = new URL("https://asia-northeast3-stayonsbplatform.cloudfunctions.net/siteOG");
        ogUrl.searchParams.set("host", url.hostname);
        ogUrl.searchParams.set("path", url.pathname);
        return fetch(ogUrl.toString(), {
          headers: { "user-agent": userAgent },
        });
      }
    }

    // 일반 방문자: 기존과 완전히 동일하게 처리 (변경 없음)
    const originUrl = new URL(request.url);
    const originalHost = originUrl.hostname;
    originUrl.hostname = "stayonsbplatform.web.app";
    const originRequest = new Request(originUrl.toString(), request);
    originRequest.headers.set("host", "stayonsbplatform.web.app");
    originRequest.headers.set("x-original-host", originalHost);
    return fetch(originRequest);
  },
};
