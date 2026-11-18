// export default {
//   async fetch(request) {
//     const originUrl = new URL(request.url);
//     const originalHost = originUrl.hostname; // 추가: 원래 요청한 진짜 호스트명 저장
//     originUrl.hostname = "stayonsbplatform.web.app";
//     const originRequest = new Request(originUrl.toString(), request);
//     originRequest.headers.set("host", "stayonsbplatform.web.app");
//     originRequest.headers.set("x-original-host", originalHost); // 추가: 원래 호스트명을 별도 헤더로 함께 전달
//     return fetch(originRequest);
//   },
// };

// 2026.11.03
// export default {
//   async fetch(request) {
//     const url = new URL(request.url);
//     const userAgent = request.headers.get("user-agent") || "";

//     // 카카오톡/페이스북 등 링크 미리보기 봇인 경우: Firebase Hosting을 거치지
//     // 않고 OG 태그 생성 함수를 바로 호출 (루트 주소 "/"도 놓치지 않기 위함)
//     const isPreviewBot =
//       /kakaotalk-scrap|facebookexternalhit|twitterbot|slackbot|telegrambot|googlebot|bingbot|google-inspectiontool/i.test(userAgent);

//     if (isPreviewBot) {
//       const ogUrl = new URL("https://asia-northeast3-stayonsbplatform.cloudfunctions.net/siteOG");
//       ogUrl.searchParams.set("host", url.hostname);
//       ogUrl.searchParams.set("path", url.pathname);
//       return fetch(ogUrl.toString(), {
//         headers: { "user-agent": userAgent },
//       });
//     }

//     // 일반 방문자: 기존과 완전히 동일하게 처리 (변경 없음)
//     const originUrl = new URL(request.url);
//     const originalHost = originUrl.hostname;
//     originUrl.hostname = "stayonsbplatform.web.app";
//     const originRequest = new Request(originUrl.toString(), request);
//     originRequest.headers.set("host", "stayonsbplatform.web.app");
//     originRequest.headers.set("x-original-host", originalHost);
//     return fetch(originRequest);
//   },
// };

// 2026.11.04
// const FAST_ORIGIN = "https://bulletin.stayon-platform.com";
const FAST_ORIGIN = "https://stayonsbplatform.web.app";
// 사람이 보는 페이지(HTML)일 때만 /assets/ 주소를 서울 직통 주소로 바꿈
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

// 교회 홈페이지·주보 전용 주소 페이지를 Cloudflare에 저장해 두고 바로 돌려줌
// 검색봇 / 미리보기 봇 / 사람은 받는 HTML이 달라서 따로 저장
// const PAGE_CACHE_SECONDS = 300;
const EDGE_CACHE_SECONDS = 86400;   // Cloudflare 저장 시간: 하루
const BROWSER_CACHE_SECONDS = 300;  // 브라우저 저장 시간: 5분
// (2026-11-16) 저장본이 이 시간보다 오래됐으면, 저장본은 바로 보내고(빠름 유지) 뒤에서 새로 받아 저장본을 바꿈.
// 예전엔 하루 동안 저장본만 계속 나가서, 교회가 홈페이지를 고치거나 새로 배포해도 방문자에게 옛 화면이 보였음
const REFRESH_AFTER_SECONDS = 300;  // 5분

// 함수에서 새 페이지를 받아서(200·404만) 저장
async function fetchAndStore(fnUrl, userAgent, cache, key) {
  const res = await fetch(fnUrl.toString(), { headers: { "user-agent": userAgent } });
  const type = res.headers.get("content-type") || "";
  // 200·404만 저장, 서버 오류(5xx)는 저장 안 함
  if ((res.status === 200 || res.status === 404) && /text\/html|xml|text\/plain/.test(type)) {
    const copy = new Response(res.clone().body, res);
    // copy.headers.set("Cache-Control", `public, max-age=${PAGE_CACHE_SECONDS}`);
    copy.headers.set("Cache-Control", `public, max-age=${EDGE_CACHE_SECONDS}`);
    copy.headers.set("x-cached-at", String(Date.now())); // 저장 시각(5분 지났는지 확인용)
    await cache.put(key, copy);
  }
  return res;
}

async function cachedPage(fnUrl, url, userAgent, ctx) {
  const kind = /kakaotalk-scrap|facebookexternalhit|twitterbot|slackbot|telegrambot/i.test(userAgent) ? "preview"
    : /googlebot|google-inspectiontool|bingbot|yeti/i.test(userAgent) ? "search" : "human";
  const cache = caches.default;
  const key = new Request(`https://page-cache.stayon-platform.com/${url.hostname}${url.pathname}?k=${kind}`);
  const hit = await cache.match(key);
  // if (hit) return fastAssets(hit);
  if (hit) {
    // 5분 지난 저장본(저장 시각이 없는 예전 저장본 포함)이면 뒤에서 새로 받아 둠 — 지금 방문자는 기다리지 않음
    const at = Number(hit.headers.get("x-cached-at") || 0);
    if (!at || Date.now() - at > REFRESH_AFTER_SECONDS * 1000) {
      ctx.waitUntil(fetchAndStore(fnUrl, userAgent, cache, key).catch(() => {}));
    }
    // 저장본은 하루짜리지만 브라우저에는 5분으로 바꿔서 보냄
    const out = new Response(hit.body, hit);
    out.headers.set("Cache-Control", `public, max-age=${BROWSER_CACHE_SECONDS}`);
    out.headers.delete("x-cached-at");
    return fastAssets(out);
  }
  // 저장본이 없으면: 새로 받아서 저장(저장은 응답과 동시에)하고 바로 보냄
  const res = await fetch(fnUrl.toString(), { headers: { "user-agent": userAgent } });
  const type = res.headers.get("content-type") || "";
  if ((res.status === 200 || res.status === 404) && /text\/html|xml|text\/plain/.test(type)) {
    const copy = new Response(res.clone().body, res);
    copy.headers.set("Cache-Control", `public, max-age=${EDGE_CACHE_SECONDS}`);
    copy.headers.set("x-cached-at", String(Date.now()));
    ctx.waitUntil(cache.put(key, copy));
  }
  return fastAssets(res);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const userAgent = request.headers.get("user-agent") || "";

    // 교회별 주보 전용 주소({주소}-jubo.stayon-platform.com)
    if (url.hostname.endsWith("-jubo.stayon-platform.com")) {
      const p = url.pathname;
      const isStatic = /\.[a-z0-9]+$/i.test(p) &&
        !["/robots.txt", "/sitemap.xml", "/rss.xml"].includes(p);
      if (!isStatic) {
        const fnUrl = new URL("https://asia-northeast3-stayonsbplatform.cloudfunctions.net/bulletinSite");
        fnUrl.searchParams.set("host", url.hostname);
        fnUrl.searchParams.set("path", p);
        // return fetch(fnUrl.toString(), {
        //   headers: { "user-agent": userAgent },
        // });
        // const res = await fetch(fnUrl.toString(), {
        //   headers: { "user-agent": userAgent },
        // });
        return cachedPage(fnUrl, url, userAgent, ctx);
      }
    } else {
      // 카카오톡/페이스북 등 링크 미리보기 봇·검색봇(네이버 yeti 추가)
      const isPreviewBot =
        /kakaotalk-scrap|facebookexternalhit|twitterbot|slackbot|telegrambot|googlebot|bingbot|google-inspectiontool|yeti/i.test(userAgent);

        // 교회 홈페이지의 robots.txt·sitemap.xml은 그 교회 전용으로
      const sub = url.hostname.split(".")[0];
      const isChurchSeoFile =
        url.hostname.endsWith(".stayon-platform.com") &&
        !["www", "bulletin", "place", "stayonsbplatform"].includes(sub) &&
        ["/robots.txt", "/sitemap.xml", "/rss.xml"].includes(url.pathname);


      // const isStaticFile = /\.[a-z0-9]+$/i.test(url.pathname) && !isChurchSeoFile;
      // // if (isPreviewBot || isChurchSeoFile) {
      // if ((isPreviewBot && !isStaticFile) || isChurchSeoFile) {

      //   const ogUrl = new URL("https://asia-northeast3-stayonsbplatform.cloudfunctions.net/siteOG");
      //   ogUrl.searchParams.set("host", url.hostname);
      //   ogUrl.searchParams.set("path", url.pathname);
      //   return fetch(ogUrl.toString(), {
      //     headers: { "user-agent": userAgent },
      //   });
      // }
      const isStaticFile = /\.[a-z0-9]+$/i.test(url.pathname) && !isChurchSeoFile;

      // 교회 홈페이지 페이지는 사람이 열어도 siteOG가 만든 교회 HTML을 줌(구글 색인 문제)
      const isChurchPage =
        url.hostname.endsWith(".stayon-platform.com") &&
        !["www", "bulletin", "place", "stayonsbplatform"].includes(sub) &&
        !isStaticFile;

      if ((isPreviewBot && !isStaticFile) || isChurchSeoFile || isChurchPage) {
        const ogUrl = new URL("https://asia-northeast3-stayonsbplatform.cloudfunctions.net/siteOG");
        ogUrl.searchParams.set("host", url.hostname);
        ogUrl.searchParams.set("path", url.pathname);
        if (request.method === "GET" && (isChurchPage || isChurchSeoFile)) {
          return cachedPage(ogUrl, url, userAgent, ctx);
        }
        const res = await fetch(ogUrl.toString(), {
          headers: { "user-agent": userAgent },
        });
        return fastAssets(res);
      }

    }

    // 일반 방문자: 기존과 완전히 동일
    const originUrl = new URL(request.url);
    const originalHost = originUrl.hostname;
    originUrl.hostname = "stayonsbplatform.web.app";
    const originRequest = new Request(originUrl.toString(), request);
    originRequest.headers.set("host", "stayonsbplatform.web.app");
    originRequest.headers.set("x-original-host", originalHost);

    // 속도 개선: 프로그램·스타일 파일(/assets/)은 1년, 이미지는 하루 Cloudflare에 저장해 두고 바로 돌려줌
    if (originUrl.pathname.startsWith("/assets/")) {
      return fetch(originRequest, { cf: { cacheEverything: true, cacheTtl: 31536000 } });
    }
    if (/\.(png|jpe?g|webp|svg|ico)$/i.test(originUrl.pathname)) {
      return fetch(originRequest, { cf: { cacheEverything: true, cacheTtl: 86400 } });
    }
    return fastAssets(await fetch(originRequest));
    // return fetch(originRequest);
  },
};
