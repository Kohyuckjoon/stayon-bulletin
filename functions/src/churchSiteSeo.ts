// 교회 홈페이지(페이지 전환형) 검색봇용 페이지·사이트맵.
//
// 성도 화면은 React(src/app/pages/website/MultiPageSite.tsx)가 그리고, 검색봇에게는
// siteOG 함수가 이 파일로 같은 내용을 완성된 HTML 본문으로 넣어 준다.
// 내용 규칙은 src/utils/churchSiteContent.ts와 같다: 모바일 주보 데이터를 먼저,
// 없으면 홈페이지 빌더 입력값. 메뉴 주소·표시 조건도 MultiPageSite와 같아야 한다
// (사람에게 없는 페이지를 봇에게만 보여주면 클로킹이 됨).
import {
  Ctx, esc, str, objArray, nl2br, oneLine, clip, hasTierOrAbove,
} from "./bulletinSeo";

type Doc = Record<string, unknown>;

interface Page {
  title: string;
  description: string;
  h1: string;
  body: string;
}

const arr = (v: unknown): Doc[] => objArray(v);

const PAGES: {path: string; label: string; group: string}[] = [
  {path: "/about", label: "교회 소개", group: "교회소개"},
  {path: "/about/pastor", label: "담임목사 인사말", group: "교회소개"},
  {path: "/about/history", label: "교회 연혁", group: "교회소개"},
  {path: "/about/staff", label: "섬기는 사람들", group: "교회소개"},
  {path: "/location", label: "오시는 길", group: "교회소개"},
  {path: "/worship", label: "예배 안내", group: "예배"},
  {path: "/worship/online", label: "온라인 예배", group: "예배"},
  {path: "/sermons", label: "설교", group: "예배"},
  {path: "/bulletins", label: "교회 주보", group: "주보"},
  {path: "/jubo", label: "온라인 주보", group: "주보"},
  {path: "/news", label: "교회소식", group: "교회소식"},
  {path: "/column", label: "교회 칼럼", group: "교회소식"},
  {path: "/prayer", label: "중보기도", group: "교회소식"},
];

interface Content {
  name: string;
  b: Doc;
  site: Doc;
  ctx: Ctx | null;
  intro: string;
  vision: string;
  mission: string;
  motto: string;
  pastor: {name: string; role: string; title: string; text: string} | null;
  staff: {role: string; name: string; desc: string}[];
  officers: {role: string; name: string}[];
  worship: {group: string; title: string; time: string; place: string}[];
  youtube: string;
  videos: Doc[];
  address: string;
  addressDetail: string;
  phone: string;
  news: {id: string; date: string; items: {title: string; content: string}[]}[];
  paperSermons: {date: string; fileUrl: string; text: string}[];
  prayers: {id: string; title: string; date: string; content: string}[];
  history: Doc[];
}

/**
 * 주보(있으면) + 빌더 입력을 합친 화면 내용.
 * @param {Doc} site churchSites 문서
 * @param {Ctx | null} ctx 이 교회 주보 컨텍스트(주보 계정이 없으면 null)
 * @return {Content} 내용
 */
function buildContent(site: Doc, ctx: Ctx | null): Content {
  const b = (ctx?.bulletin?.data || {}) as Doc;
  const status = ctx?.user.status;
  const senior = (b.seniorPastorEnabled !== false && b.seniorPastor ?
    b.seniorPastor : {}) as Doc;
  const g = (b.pastorGreeting || {}) as Doc;
  const greetingOn = hasTierOrAbove(status, "standard") &&
    b.pastorGreetingEnabled !== false && !!(str(g.greetingText) ||
    str(g.content));
  const pastorName = str(senior.name) || str(site.pastor);
  const pastorText = greetingOn ? str(g.content) : str(site.pastorMessage);
  const pastorTitle = greetingOn ?
    str(g.greetingText) : str(site.pastorTagline);

  const staff: Content["staff"] = [];
  if (str(senior.name)) {
    staff.push({role: str(senior.role) || "담임목사", name: str(senior.name),
      desc: str(senior.description)});
  }
  if (b.ministersEnabled !== false) {
    arr(b.ministers).filter((m) => str(m.name)).forEach((m) =>
      staff.push({role: str(m.role), name: str(m.name),
        desc: str(m.description)}));
  }
  if (staff.length === 0) {
    arr(site.staffMembers).filter((m) => str(m.name)).forEach((m) =>
      staff.push({role: str(m.role), name: str(m.name),
        desc: str(m.department)}));
  }
  let officers = b.officersEnabled !== false ?
    arr(b.officers).filter((o) => str(o.name))
      .map((o) => ({role: str(o.position), name: str(o.name)})) : [];
  if (officers.length === 0) {
    officers = arr(site.layLeaders).filter((o) => str(o.name))
      .map((o) => ({role: str(o.role), name: str(o.name)}));
  }

  const worship: Content["worship"] = [];
  (Array.isArray(b.sundayServices) ? b.sundayServices : []).forEach((sv) => {
    if (typeof sv === "string") {
      const p = sv.split(",").map((x) => x.trim());
      worship.push({group: "주일예배", title: p[0] || "주일 예배",
        time: p[1] || "", place: p[2] || ""});
    } else if (sv && typeof sv === "object") {
      const o = sv as Doc;
      worship.push({group: "주일예배", title: str(o.name) || "주일 예배",
        time: str(o.time), place: str(o.location)});
    }
  });
  const ev = (b.sundayEveningService || {}) as Doc;
  if (b.sundayEveningService && ev.enabled !== false &&
    (str(ev.name) || str(ev.time))) {
    worship.push({group: "주일예배", title: str(ev.name) || "주일 오후 예배",
      time: str(ev.time), place: str(ev.location)});
  }
  const mw = (b.midweekServices || {}) as Doc;
  if (b.midweekServices && mw.enabled !== false) {
    const labels: Doc = {wednesday: "수요예배", friday: "금요기도회",
      dawn: "새벽기도회"};
    ["wednesday", "friday", "dawn"].forEach((k) => {
      const m = (mw[k] || {}) as Doc;
      if (str(m.title) || str(m.dateTime)) {
        worship.push({group: "주중예배", title: str(m.name) || str(labels[k]),
          time: str(m.dateTime), place: ""});
      }
    });
  }
  if (worship.length === 0) {
    arr(site.worshipServices).filter((w) => str(w.title) || str(w.time))
      .forEach((w) => worship.push({group: str(w.group) || "예배 시간",
        title: str(w.title), time: str(w.time), place: str(w.note)}));
    if (worship.length === 0 && str(site.worshipTime)) {
      worship.push({group: "예배 시간", title: "예배 안내",
        time: str(site.worshipTime), place: ""});
    }
  }

  const news: Content["news"] = (ctx?.list || []).map((x) => ({
    id: x.id,
    date: str(x.data.date),
    items: arr(x.data.announcements)
      .map((a) => ({title: str(a.title), content: str(a.content)}))
      .filter((a) => a.title || a.content),
  })).filter((n) => n.items.length > 0);
  arr(site.newsItems).forEach((n, i) => {
    if (str(n.title) || str(n.content)) {
      news.push({id: `site-${i}`, date: str(n.date),
        items: [{title: str(n.title), content: str(n.content)}]});
    }
  });
  // 종이 주보 자동 분석으로 교회가 넣은 교회 소식(주보 한 부 = 한 묶음)
  arr(site.paperBulletins).forEach((p) => {
    const items = arr(p.news)
      .map((a) => ({title: str(a.title), content: str(a.content)}))
      .filter((a) => a.title || a.content);
    if (items.length) {
      news.push({id: `paper-${str(p.id)}`, date: str(p.date), items});
    }
  });
  news.sort((a, z) => z.date.localeCompare(a.date));

  // 종이 주보 자동 분석으로 넣은 설교
  const paperSermons = arr(site.paperBulletins).flatMap((p) =>
    arr(p.sermons).filter((x) => str(x.title) || str(x.scripture))
      .map((x) => ({date: str(p.date), fileUrl: str(p.fileUrl),
        text: [str(x.title), str(x.scripture), str(x.preacher)]
          .filter(Boolean).join(" · ")})));

  const prayers = arr(site.prayerPosts)
    .filter((p) => str(p.title) || str(p.content))
    .map((p, i) => ({id: str(p.id) || String(i), title: str(p.title),
      date: str(p.date), content: str(p.content)}))
    .sort((a, z) => z.date.localeCompare(a.date));

  const pg = (b.pastorGreeting || {}) as Doc;
  return {
    name: str(site.churchName) || "우리 교회",
    b,
    site,
    ctx,
    intro: (b.churchIntroEnabled !== false && str(b.churchIntro)) ||
      str(site.intro),
    vision: b.churchVisionEnabled !== false ? str(b.churchVision) : "",
    mission: b.churchMissionEnabled !== false ? str(b.churchMission) : "",
    motto: b.mottoEnabled !== false ? str(b.mottoText) : "",
    pastor: pastorName || pastorText ?
      {name: pastorName, role: str(senior.role) || str(site.pastorRole) ||
        "담임목사", title: pastorTitle, text: pastorText} : null,
    staff,
    officers,
    worship,
    youtube: str(b.youtubeChannelUrl) || str(site.youtubeLink),
    videos: site.onlineWorshipEnabled === false ? [] :
      arr(site.sermons).filter((v) => str(v.youtubeVideoId)),
    address: (b.addressEnabled !== false && str(b.churchAddress)) ||
      str(site.address),
    addressDetail: (b.addressEnabled !== false &&
      str(b.churchAddressDetail)) || str(site.locationDetail),
    phone: (pg.phoneSectionEnabled !== false && str(pg.churchPhone)) ||
      str(site.phone),
    news,
    paperSermons,
    prayers,
    history: arr(site.historyItems),
  };
}

/**
 * 페이지에 보여줄 내용이 있는지(MultiPageSite.tsx hasPage와 같은 기준).
 * @param {string} path 메뉴 주소
 * @param {Content} c 내용
 * @return {boolean} 있으면 true
 */
function hasPage(path: string, c: Content): boolean {
  const list = c.ctx?.list || [];
  switch (path) {
  case "/about": return !!(c.intro || c.vision || c.mission || c.motto ||
    arr(c.site.visionItems).length);
  case "/about/pastor": return !!(c.pastor && (c.pastor.text ||
    c.pastor.title));
  case "/about/history": return c.history.length > 0;
  case "/about/staff": return c.staff.length + c.officers.length > 0;
  case "/location": return !!c.address;
  case "/worship": return c.worship.length > 0;
  case "/worship/online": return !!c.youtube || c.videos.length > 0;
  case "/sermons": return list.some((x) => str(x.data.title) ||
    str(x.data.scripture)) || c.videos.length > 0 ||
    c.paperSermons.length > 0;
  // 교회 주보 = 올린 종이 주보 파일
  case "/bulletins": return arr(c.site.paperBulletins).length > 0;
  case "/jubo": return !!(c.ctx && c.ctx.bulletin);
  case "/news": return c.news.length > 0;
  case "/column": return (c.ctx?.columns.length || 0) > 0;
  case "/prayer": return c.prayers.length > 0;
  }
  return false;
}

const ul = (items: string[]) => items.length ?
  `<ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>` : "";

/**
 * 주소에 맞는 페이지. 성도 화면에 없는 페이지면 null.
 * @param {Content} c 내용
 * @param {string} base 사이트 주소(https://slug.stayon-platform.com)
 * @param {string} path 요청 주소
 * @return {Page | null} 페이지
 */
function buildPage(c: Content, base: string, path: string): Page | null {
  const p = path.replace(/\/+$/, "") || "/";
  const seg = p.split("/").filter(Boolean);
  const list = c.ctx?.list || [];
  const a = (href: string, text: string) =>
    `<a href="${base}${href}">${esc(text)}</a>`;
  const label = (x: Doc) => [str(x.date),
    oneLine(str(x.title) || str(x.subtitle))].filter(Boolean).join(" ");

  if (p === "/") {
    const parts: string[] = [];
    if (c.motto) parts.push(`<p>${nl2br(c.motto)}</p>`);
    if (c.intro) parts.push(`<p>${nl2br(clip(c.intro, 400))}</p>`);
    if (c.worship.length) {
      parts.push("<h2>예배 안내</h2>" + ul(c.worship.map((w) =>
        esc([w.title, w.time, w.place].filter(Boolean).join(" ")))));
    }
    if (list[0]) {
      parts.push("<h2>이번 주 주보</h2>" +
        `<p>${a("/jubo", label(list[0].data) || "이번 주 주보")}</p>`);
    }
    if (c.address) parts.push(`<h2>오시는 길</h2><p>${esc(c.address)}</p>`);
    return {
      title: str(c.site.metaTitle) || `${c.name} | 교회 홈페이지`,
      description: clip(str(c.site.metaDesc) || c.intro ||
        `${c.name} 공식 홈페이지입니다.`, 150),
      h1: c.name,
      body: parts.join("\n"),
    };
  }

  // 상세 페이지(지난 주보 / 교회소식 / 칼럼 / 중보기도)
  if (seg.length === 2 && ["bulletins", "news", "column", "prayer"]
    .includes(seg[0])) {
    const id = seg[1];
    if (seg[0] === "bulletins") {
      const x = list.find((y) => y.id === id);
      if (!x) return null;
      const d = x.data;
      const t = `${str(d.date)} 주보`;
      return {
        title: `${t} | ${c.name}`,
        description: clip([oneLine(str(d.title)), str(d.scripture),
          str(d.preacher)].filter(Boolean).join(" · ") || t, 150),
        h1: t,
        body: `<p>${esc([str(d.title), str(d.scripture), str(d.preacher)]
          .filter(Boolean).join(" · "))}</p>` +
          ul(arr(d.announcements).filter((n) => str(n.title))
            .map((n) => esc(str(n.title)))) +
          `<p><a href="https://bulletin.stayon-platform.com/view/${
            esc(id)}">주보 전체 보기</a></p>`,
      };
    }
    if (seg[0] === "news") {
      const n = c.news.find((y) => y.id === id);
      if (!n) return null;
      const first = n.items[0]?.title || "교회소식";
      return {
        title: `${n.date} 교회소식 - ${first} | ${c.name}`,
        description: clip(n.items.map((i) => i.title || i.content)
          .join(" · "), 150),
        h1: `${n.date} 교회소식`,
        body: n.items.map((i) => (i.title ? `<h2>${esc(i.title)}</h2>` : "") +
          (i.content ? `<p>${nl2br(i.content)}</p>` : "")).join(""),
      };
    }
    const posts = seg[0] === "column" ?
      (c.ctx?.columns || []).map((x) => ({id: x.id, title: str(x.data.title),
        date: str(x.data.date), content: str(x.data.content)})) :
      c.prayers;
    const post = posts.find((y) => y.id === id);
    if (!post) return null;
    return {
      title: `${post.title} | ${c.name}`,
      description: clip(post.content, 150),
      h1: post.title,
      body: `<p>${esc(post.date)}</p><p>${nl2br(post.content)}</p>`,
    };
  }

  const def = PAGES.find((x) => x.path === p);
  if (!def || !hasPage(p, c)) return null;
  let body = "";
  switch (p) {
  case "/about":
    body = [c.motto && `<h2>표어</h2><p>${nl2br(c.motto)}</p>`,
      c.intro && `<h2>교회 소개</h2><p>${nl2br(c.intro)}</p>`,
      c.vision && `<h2>비전</h2><p>${nl2br(c.vision)}</p>`,
      c.mission && `<h2>사명</h2><p>${nl2br(c.mission)}</p>`,
      ul(arr(c.site.visionItems).map((v) => `<strong>${esc(str(v.title))}` +
        `</strong> ${esc(str(v.desc))}`)),
    ].filter(Boolean).join("");
    break;
  case "/about/pastor":
    body = (c.pastor?.title ? `<h2>${nl2br(c.pastor.title)}</h2>` : "") +
      `<p>${nl2br(c.pastor?.text || "")}</p>` +
      (c.pastor?.name ? `<p>${esc(c.pastor.role)} ${esc(c.pastor.name)}</p>` :
        "");
    break;
  case "/about/history":
    body = ul(c.history.map((h) => `<strong>${esc(str(h.date))}</strong> ` +
      nl2br(str(h.content))));
    break;
  case "/about/staff":
    body = (c.staff.length ? "<h2>교역자</h2>" + ul(c.staff.map((s) =>
      `<strong>${esc(s.role)} ${esc(s.name)}</strong>` +
      (s.desc ? ` ${esc(s.desc)}` : ""))) : "") +
      (c.officers.length ? "<h2>중직자</h2>" + ul(c.officers.map((o) =>
        esc(`${o.role} ${o.name}`))) : "");
    break;
  case "/location":
    body = `<p>${esc(c.address)} ${esc(c.addressDetail)}</p>` +
      (c.phone ? `<p>교회 전화: ${esc(c.phone)}</p>` : "");
    break;
  case "/worship":
    body = ul(c.worship.map((w) => `<strong>${esc(w.title)}</strong> ` +
      esc([w.time, w.place].filter(Boolean).join(" "))));
    break;
  case "/worship/online":
    body = (c.youtube ? `<p><a href="${esc(c.youtube)}">유튜브 채널</a></p>` :
      "") + ul(c.videos.map((v) => esc([str(v.date), str(v.title),
      str(v.speaker)].filter(Boolean).join(" · "))));
    break;
  case "/sermons":
  {
    const online = list
      .filter((x) => str(x.data.title) || str(x.data.scripture))
      .map((x) => a(`/bulletins/${x.id}`, [str(x.data.date),
        oneLine(str(x.data.title)), str(x.data.scripture),
        str(x.data.preacher)].filter(Boolean).join(" · ")));
    const paper = c.paperSermons.map((x) =>
      `<a href="${esc(x.fileUrl)}">` +
      `${esc([x.date, x.text].filter(Boolean).join(" · "))}</a>`);
    body = ul(online.concat(paper));
    break;
  }
  case "/bulletins":
    body = ul(arr(c.site.paperBulletins).filter((p) => str(p.fileUrl))
      .map((p) => `<a href="${esc(str(p.fileUrl))}">${esc(str(p.date))} ` +
        `${esc(str(p.title) || "주보")}</a>`));
    break;
  case "/jubo":
    body = `<p>${esc(label(list[0]?.data || {}))}</p>` +
      `<p><a href="https://bulletin.stayon-platform.com/view/${
        esc(c.ctx?.uid || "")}">모바일 주보 보기</a></p>`;
    break;
  case "/news":
    body = ul(c.news.map((n) => a(`/news/${n.id}`, `${n.date} ` +
      n.items.map((i) => i.title).filter(Boolean).slice(0, 3).join(" · "))));
    break;
  case "/column":
    body = ul((c.ctx?.columns || []).map((x) => a(`/column/${x.id}`,
      `${str(x.data.date)} ${oneLine(str(x.data.title))}`)));
    break;
  case "/prayer":
    body = ul(c.prayers.map((x) => a(`/prayer/${x.id}`,
      `${x.date} ${x.title}`)));
    break;
  }
  return {
    title: `${def.label} | ${c.name}`,
    description: clip(body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")
      .trim() || `${c.name} ${def.label}`, 150),
    h1: def.label,
    body,
  };
}

/**
 * 검색봇용 페이지(head 메타 + 본문 HTML). 없는 페이지면 null.
 * @param {Doc} site churchSites 문서
 * @param {Ctx | null} ctx 주보 컨텍스트
 * @param {string} base 사이트 주소
 * @param {string} path 요청 주소
 * @return {Object | null} title/description/canonical/bodyHtml
 */
export function churchSitePage(
  site: Doc, ctx: Ctx | null, base: string, path: string
): {title: string; description: string; canonical: string;
  bodyHtml: string} | null {
  const c = buildContent(site, ctx);
  const page = buildPage(c, base, path);
  if (!page) return null;
  const nav = PAGES.filter((x) => hasPage(x.path, c))
    .map((x) => `<a href="${base}${x.path}">${esc(x.label)}</a>`).join(" · ");
  const clean = (path.replace(/\/+$/, "") || "/");
  return {
    title: page.title,
    description: page.description,
    canonical: base + (clean === "/" ? "/" : clean),
    bodyHtml: `<header><a href="${base}/">${esc(c.name)}</a>` +
      `<nav>${nav}</nav></header><main><h1>${esc(page.h1)}</h1>` +
      `${page.body}</main>` +
      `<footer><p>${esc(c.name)} ${esc(c.address)} ${esc(c.phone)}</p>` +
      "</footer>",
  };
}

/**
 * 사이트맵에 넣을 이 교회 홈페이지의 모든 주소.
 * @param {Doc} site churchSites 문서
 * @param {Ctx | null} ctx 주보 컨텍스트
 * @param {string} base 사이트 주소
 * @return {string[]} 주소 목록
 */
export function churchSitePaths(
  site: Doc, ctx: Ctx | null, base: string
): string[] {
  const c = buildContent(site, ctx);
  const out = [`${base}/`];
  PAGES.filter((x) => hasPage(x.path, c))
    .forEach((x) => out.push(base + x.path));
  // 온라인 주보 상세(설교 목록에서 연결) — 교회 주보 파일 유무와 상관없이
  (ctx?.list || []).forEach((x) => out.push(`${base}/bulletins/${x.id}`));
  c.news.forEach((n) => out.push(`${base}/news/${n.id}`));
  (ctx?.columns || []).forEach((x) => out.push(`${base}/column/${x.id}`));
  c.prayers.forEach((x) => out.push(`${base}/prayer/${x.id}`));
  return out;
}

/**
 * 교회 홈페이지 RSS(교회소식·설교·칼럼·중보기도). 네이버 서치어드바이저 RSS 제출용.
 * @param {Doc} site churchSites 문서
 * @param {Ctx | null} ctx 주보 컨텍스트
 * @param {string} base 사이트 주소
 * @return {string} RSS XML
 */
export function churchSiteRss(
  site: Doc, ctx: Ctx | null, base: string
): string {
  const c = buildContent(site, ctx);
  const day = (d: string) => Date.parse(`${d}T00:00:00+09:00`) || 0;
  const items: {title: string; link: string; desc: string; date: number}[] =
    [];
  c.news.forEach((n) => items.push({
    title: `${n.date} 교회소식 - ${n.items[0]?.title || "교회소식"}`,
    link: `${base}/news/${n.id}`,
    desc: clip(n.items.map((i) => i.title || i.content).join(" · "), 300),
    date: day(n.date),
  }));
  (ctx?.list || []).forEach((x) => {
    const d = x.data;
    if (!str(d.title) && !str(d.scripture)) return;
    items.push({
      title: `${str(d.date)} 설교 - ${oneLine(str(d.title)) || "말씀"}`,
      link: `${base}/bulletins/${x.id}`,
      desc: [str(d.scripture), str(d.preacher)].filter(Boolean).join(" · "),
      date: day(str(d.date)),
    });
  });
  (ctx?.columns || []).forEach((x) => items.push({
    title: `${oneLine(str(x.data.title)) || "교회 칼럼"} - 교회 칼럼`,
    link: `${base}/column/${x.id}`,
    desc: clip(str(x.data.content), 300),
    date: day(str(x.data.date)),
  }));
  c.prayers.forEach((x) => items.push({
    title: `${x.title} - 중보기도`,
    link: `${base}/prayer/${x.id}`,
    desc: clip(x.content, 300),
    date: day(x.date),
  }));
  items.sort((a, z) => z.date - a.date);
  return [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    "<rss version=\"2.0\">",
    "<channel>",
    `<title>${esc(c.name)}</title>`,
    `<link>${esc(base)}/</link>`,
    `<description>${esc(c.name)} 교회소식·설교·칼럼</description>`,
    "<language>ko</language>",
    ...items.slice(0, 100).map((i) => [
      "<item>",
      `<title>${esc(i.title)}</title>`,
      `<link>${esc(i.link)}</link>`,
      `<guid>${esc(i.link)}</guid>`,
      i.desc ? `<description>${esc(i.desc)}</description>` : "",
      i.date ? `<pubDate>${new Date(i.date).toUTCString()}</pubDate>` : "",
      "</item>",
    ].join("")),
    "</channel>",
    "</rss>",
  ].join("\n");
}
