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
// 날짜만 뽑아 YYYY-MM-DD로(화면 쪽 churchSiteContent.ts와 같은 규칙)
const normDate = (v: unknown): string => {
  const m = str(v).match(/(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : "";
};

// 상단 메뉴 묶음 순서(실제 홈페이지 MultiPageSite의 SITE_GROUPS와 같은 순서)
const NAV_GROUP_ORDER = ["교회소개", "예배", "말씀/영상", "찬양팀", "주일학교",
  "주보", "앨범", "교회 일정"];
// 교단 이름(상단 로고 아래 작은 글씨) — src/utils/denominations.ts와 같은 목록
const DENOM_NAMES: Record<string, string> = {
  "pck-hapdong": "대한예수교장로회(합동)", "pck-tonghap": "대한예수교장로회(통합)",
  "pck-kosin": "대한예수교장로회(고신)", "pck-baekseok": "대한예수교장로회(백석)",
  "pck-hapshin": "대한예수교장로회(합신)", "prok": "한국기독교장로회",
  "kmc": "기독교대한감리회", "kehc": "기독교대한성결교회",
  "jehc": "예수교대한성결교회", "nazarene": "대한기독교나사렛성결회",
  "kbc": "기독교한국침례회", "agk": "기독교대한하나님의성회",
  "salvation-army": "구세군대한본영", "kaicam": "독립교단(KAICAM)",
};
const PAGES: {path: string; label: string; group: string}[] = [
  {path: "/about", label: "교회 소개", group: "교회소개"},
  {path: "/about/pastor", label: "담임목사 인사말", group: "교회소개"},
  {path: "/about/history", label: "교회 연혁", group: "교회소개"},
  {path: "/about/staff", label: "섬기는 사람들", group: "교회소개"},
  {path: "/location", label: "오시는 길", group: "교회소개"},
  {path: "/about/newcomer", label: "새가족 안내", group: "교회소개"},
  {path: "/worship", label: "예배 안내", group: "예배"},
  // 찬양팀: 홈페이지 편집 화면에서 켰을 때만(praiseEnabled)
  {path: "/praise", label: "찬양팀", group: "찬양팀"},
  // 주일학교/교육부서(메뉴 이름은 교회가 정함 - 화면에선 eduLabel).
  // 부서별 화면은 /education/1, /education/2 …
  {path: "/education", label: "주일학교", group: "주일학교"},
  // 2026-11-21: 온라인 예배 → 말씀/영상 첫 탭 "실시간 예배"(/sermons/live)
  {path: "/sermons/live", label: "실시간 예배", group: "말씀/영상"},
  {path: "/sermons", label: "말씀 / 영상", group: "말씀/영상"},
  {path: "/bulletins", label: "교회 주보", group: "주보"},
  {path: "/jubo", label: "온라인 주보", group: "주보"},
  // 앨범(홈페이지 편집 화면 > 매주 업데이트). 앨범별 화면은 /album/{앨범 id}
  {path: "/album", label: "앨범", group: "앨범"},
  // 교회 일정: 홈페이지 편집 화면에서 켰을 때만(scheduleEnabled)
  {path: "/schedule", label: "교회 일정", group: "교회 일정"},
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
  news: {id: string; date: string; notice?: string;
    items: {title: string; content: string}[]}[];
  paperSermons: {date: string; fileUrl: string; text: string}[];
  prayers: {id: string; title: string; date: string; content: string}[];
  history: Doc[];
  edu: Doc[]; // 주일학교·교육부서(홈페이지 편집 화면)
  albums: Doc[]; // 행사 사진 앨범(최신 날짜 순)
  eduLabel: string;
}

/**
 * 주보(있으면) + 빌더 입력을 합친 화면 내용.
 * @param {Doc} site churchSites 문서
 * @param {Ctx | null} ctx 이 교회 주보 컨텍스트(주보 계정이 없으면 null)
 * @return {Content} 내용
 */
function buildContent(site: Doc, ctx: Ctx | null): Content {
  // 교회 정보 가져오기가 "custom"(주보와 다르게)·"website"(홈페이지만)이면 주보 정보 대신
  // 홈페이지 입력값만 씀(src/utils/churchSiteContent.ts와 같은 규칙)
  const useBulletinInfo = site.dataSource !== "custom" &&
    site.dataSource !== "website";
  const b = (useBulletinInfo ? (ctx?.bulletin?.data || {}) : {}) as Doc;
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
        title: str(w.title), time: str(w.time),
        place: str(w.place) || str(w.note)}));
    if (worship.length === 0 && str(site.worshipTime)) {
      worship.push({group: "예배 시간", title: "예배 안내",
        time: str(site.worshipTime), place: ""});
    }
  }

  const news: Content["news"] = (ctx?.list || []).map((x) => ({
    id: x.id,
    date: normDate(x.data.date),
    items: arr(x.data.announcements)
      .map((a) => ({title: str(a.title), content: str(a.content)}))
      .filter((a) => a.title || a.content),
  })).filter((n) => n.items.length > 0);
  const bulletinIds = new Set(news.map((n) => n.id));
  arr(site.newsItems).forEach((n, i) => {
    // 한 건에 1번·2번… 여러 소식(items). 예전 데이터는 title/content 한 개
    const lines = (arr(n.items).length ? arr(n.items) :
      [{title: n.title, content: n.content}])
      .map((a) => ({title: str(a.title), content: str(a.content)}))
      .filter((a) => a.title || a.content);
    const notice = str(n.notice); // 번호 없이 맨 위에 보이는 전체 안내
    if (lines.length || notice) {
      news.push({id: str(n.id) || `site-${i}`, date: normDate(n.date),
        items: lines, notice});
    }
  });
  // 같은 날짜에 주보 소식과 홈페이지 소식이 둘 다 있으면 홈페이지 것만
  // (홈페이지·주보 저장 때 "반대쪽에도 반영할까요?"로 맞춤)
  const siteDates = new Set(news.filter((n) => !bulletinIds.has(n.id))
    .map((n) => n.date).filter(Boolean));
  for (let i = news.length - 1; i >= 0; i--) {
    if (bulletinIds.has(news[i].id) && siteDates.has(news[i].date)) {
      news.splice(i, 1);
    }
  }
  // 종이 주보 자동 분석으로 교회가 넣은 교회 소식(주보 한 부 = 한 묶음)
  arr(site.paperBulletins).forEach((p) => {
    const items = arr(p.news)
      .map((a) => ({title: str(a.title), content: str(a.content)}))
      .filter((a) => a.title || a.content);
    if (items.length) {
      news.push({id: `paper-${str(p.id)}`, date: normDate(p.date), items});
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
    // 주보 → 없으면 홈페이지 편집 화면 > 교회소개(화면 쪽 churchSiteContent.ts와 같은 규칙)
    vision: (b.churchVisionEnabled !== false && str(b.churchVision)) ||
      str(site.vision),
    mission: (b.churchMissionEnabled !== false && str(b.churchMission)) ||
      str(site.mission),
    motto: (b.mottoEnabled !== false && str(b.mottoText)) ||
      str(site.mottoText),
    pastor: pastorName || pastorText ?
      {name: pastorName, role: str(senior.role) || str(site.pastorRole) ||
        "담임목사", title: pastorTitle, text: pastorText} : null,
    // 편집 화면에서 끈 칸은 비움(2026-11-17)
    staff: site.staffEnabled === false ? [] : staff,
    officers: site.officersEnabled === false ? [] : officers,
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
    history: site.historyEnabled === false ? [] : arr(site.historyItems),
    edu: arr(site.eduDepartments).filter((d) => str(d.name)),
    albums: arr(site.albums)
      .filter((x) => str(x.id) && (str(x.title) || arr(x.photos).length))
      .sort((x, z) => str(z.date).localeCompare(str(x.date))),
    eduLabel: str(site.eduMenuLabel) || "주일학교",
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
  case "/about": return !!(c.intro || c.vision || c.mission || c.motto);
  case "/about/pastor": return !!(c.pastor && (c.pastor.text ||
    c.pastor.title));
  case "/about/history": return c.history.length > 0;
  case "/about/staff": return c.staff.length + c.officers.length > 0;
  case "/location": return !!c.address;
  case "/worship": return c.worship.length > 0;
  case "/sermons/live": return !!c.youtube || c.videos.length > 0;
  // 화면(MultiPageSite.tsx)과 같은 기준: 유튜브 채널·다음 주 설교만 있어도 메뉴가
  // 보이므로 서버도 페이지를 만든다(안 그러면 메뉴 링크가 404가 됨, 2026-11-22)
  case "/sermons": return list.some((x) => str(x.data.title) ||
    str(x.data.scripture)) || c.videos.length > 0 ||
    c.paperSermons.length > 0 || !!c.youtube || !!nextSermonOf(c.site);
  // 교회 주보 = 올린 종이 주보 파일. 화면(MultiPageSite.tsx)은 파일이 없어도 메뉴를
  // 항상 보여 주므로 서버도 항상 페이지를 만든다(없으면 404였음, 2026-11-22)
  case "/bulletins": return true;
  // 편집 화면 "온라인 주보 메뉴"를 끄면 숨김(2026-11-17)
  case "/jubo": return !!(c.ctx && c.ctx.bulletin) &&
    c.site.juboMenuEnabled !== false;
  case "/news": return c.news.length > 0;
  case "/column": return (c.ctx?.columns.length || 0) > 0;
  case "/prayer": return c.prayers.length > 0;
  case "/education": return c.edu.length > 0;
  case "/praise": return c.site.praiseEnabled === true;
  case "/about/newcomer": return c.site.newcomerEnabled !== false &&
    !!(str(c.site.newcomerIntro) ||
    arr(c.site.newcomerSteps).length || str(c.site.newcomerContact));
  // 홈페이지(앱)도 앨범 메뉴는 앨범이 없어도 항상 보여 주므로 404로 내지 않음
  case "/album": return c.site.albumEnabled !== false; // 편집 화면에서 끄면 숨김
  case "/schedule": return c.site.scheduleEnabled === true;
  }
  return false;
}

/**
 * 다음 주 설교. 화면 churchSiteContent.ts nextSermon과 같은 규칙
 * (켜져 있고 제목이 있을 때).
 * @param {Doc} site 홈페이지 문서
 * @return {Doc | null} 다음 주 설교 또는 null
 */
function nextSermonOf(site: Doc): Doc | null {
  const n = (site.nextSermon || {}) as Doc;
  return site.nextSermonEnabled === true && str(n.title) ? n : null;
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
    // 메인에서 상세 페이지로 바로 가는 링크(구글이 하위 페이지를 타고 들어가게 —
    // 최근 주보·교회소식·부서 상세 링크를 함께 둔다)
    if (list.length) {
      parts.push("<h2>최근 주보</h2>" + ul(list.slice(0, 6).map((x) =>
        a(`/bulletins/${x.id}`, label(x.data) || "주보"))));
    }
    if (c.news.length) {
      parts.push("<h2>교회소식</h2>" + ul(c.news.slice(0, 6).map((n) =>
        a(`/news/${n.id}`, `${n.date} ` + n.items.map((i) => i.title)
          .filter(Boolean).slice(0, 2).join(" · ")))));
    }
    if (c.edu.length) {
      parts.push(`<h2>${esc(c.eduLabel)}</h2>` + ul(c.edu.map((d, i) =>
        a(`/education/${i + 1}`, str(d.name)))));
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
      if (!x) {
        // 종이 주보 상세(화면 MultiPageSite.tsx paperPath = /bulletins/{id}).
        // 온라인 주보 id가 아닐 때만 여기로 옴 — 온라인 주보 처리는 그대로(2026-11-22)
        const pb = arr(c.site.paperBulletins).find((y) =>
          str(y.id) === id && /^https?:\/\//.test(str(y.fileUrl)));
        if (!pb) return null;
        const date = normDate(pb.date) || str(pb.date);
        const t = str(pb.title) || `${date} 주보`;
        const pNews = arr(pb.news).filter((n) => str(n.title) ||
          str(n.content));
        const pSermons = arr(pb.sermons).filter((n) => str(n.title) ||
          str(n.scripture)).map((n) => [str(n.title), str(n.scripture),
          str(n.preacher)].filter(Boolean).join(" · "));
        return {
          title: `${t} | ${c.name}`,
          description: clip([t, ...pSermons,
            ...pNews.map((n) => str(n.title))].filter(Boolean)
            .join(" · "), 150),
          h1: t,
          body: `<p>주보 날짜 ${esc(date)}</p>` +
            ul(pSermons.map((x) => esc(x))) +
            pNews.map((n) => (str(n.title) ? `<h2>${esc(str(n.title))}</h2>` :
              "") + (str(n.content) ? `<p>${nl2br(str(n.content))}</p>` : ""))
              .join("") +
            `<p><a href="${esc(str(pb.fileUrl))}">주보 파일 보기</a></p>`,
        };
      }
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
        body: (n.notice ? `<p>${nl2br(n.notice)
          .replace(/\*\*([\s\S]+?)\*\*/g, "<strong>$1</strong>")}</p>` : "") +
          n.items.map((i) => (i.title ? `<h2>${esc(i.title)}</h2>` : "") +
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

  // 앨범 하나(/album/{id}): 제목 · 날짜 · 사진들
  if (seg[0] === "album" && seg.length === 2 && c.site.albumEnabled !== false) {
    const al = c.albums.find((x) => str(x.id) === seg[1]);
    if (!al) return null;
    const photos = arr(al.photos).map(str)
      .filter((u) => /^https?:\/\//.test(u));
    const title = str(al.title) || "앨범";
    return {
      title: `${title} | 앨범 | ${c.name}`,
      description: clip([title, str(al.date), `사진 ${photos.length}장`]
        .filter(Boolean).join(" · "), 150),
      h1: title,
      body: `<p>${esc([str(al.date), `사진 ${photos.length}장`]
        .filter(Boolean).join(" · "))}</p>` +
        photos.map((u, i) => `<img src="${esc(u)}" alt="${
          esc(`${title} ${i + 1}`)}" loading="lazy" />`).join(""),
    };
  }

  // 주일학교 부서별 화면(/education/1 …): 부서 하나의 대상·예배 시간·장소·담당·소개
  if (seg[0] === "education" && seg.length === 2) {
    const d = c.edu[Number(seg[1]) - 1];
    if (!d) return null;
    const rows = [["대상", str(d.target)], ["예배 시간", str(d.time)],
      ["장소", str(d.place)], ["담당", str(d.leader)]].filter(([, v]) => v);
    return {
      title: `${str(d.name)} | ${c.eduLabel} | ${c.name}`,
      description: clip([str(d.name), ...rows.map(([k, v]) => `${k} ${v}`),
        str(d.desc)].filter(Boolean).join(" · "), 150),
      h1: str(d.name),
      body: ul(rows.map(([k, v]) => `<strong>${esc(k)}</strong> ${esc(v)}`)) +
        (str(d.desc) ? `<p>${nl2br(str(d.desc))}</p>` : ""),
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
  case "/sermons/live":
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
    const ns = nextSermonOf(c.site);
    body = (ns ? `<h2>다음 주 설교</h2><p>${esc([str(ns.date),
      str(ns.title), str(ns.scripture), str(ns.preacher)]
      .filter(Boolean).join(" · "))}</p>` : "") +
      ul(online.concat(paper)) +
      ul(c.videos.map((v) => esc([str(v.date), str(v.title),
        str(v.speaker)].filter(Boolean).join(" · ")))) +
      (c.youtube ? `<p><a href="${esc(c.youtube)}">유튜브 채널</a></p>` : "");
    break;
  }
  case "/bulletins":
    // 화면처럼 각 주보는 상세 화면(/bulletins/{id})으로 연결(2026-11-22).
    // id가 없는 예전 데이터만 파일로 바로 연결
    body = ul(arr(c.site.paperBulletins).filter((p) => str(p.fileUrl))
      .map((p) => `<a href="${esc(str(p.id) ? `/bulletins/${str(p.id)}` :
        str(p.fileUrl))}">${esc(str(p.date))} ` +
        `${esc(str(p.title) || "주보")}</a>`)) ||
      "<p>아직 올린 교회 주보가 없습니다.</p>";
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
  case "/praise":
    body = (str(c.site.praiseIntro) ?
      `<p>${nl2br(str(c.site.praiseIntro))}</p>` : "") +
      arr(c.site.praiseTeams).filter((x) => str(x.name)).map((x) =>
        `<h2>${esc(str(x.name))}</h2>` +
        ul([["시간", str(x.time)], ["장소", str(x.place)],
          ["리더", str(x.leader)]].filter(([, v]) => v)
          .map(([k, v]) => `<strong>${esc(k)}</strong> ${esc(v)}`)) +
        (str(x.desc) ? `<p>${nl2br(str(x.desc))}</p>` : "")).join("");
    break;
  case "/about/newcomer":
    body = (str(c.site.newcomerIntro) ?
      `<p>${nl2br(str(c.site.newcomerIntro))}</p>` : "") +
      "<ol>" + arr(c.site.newcomerSteps)
      .filter((x) => str(x.title) || str(x.desc))
      .map((x) => `<li><strong>${esc(str(x.title))}</strong> ${
        nl2br(str(x.desc))}</li>`).join("") + "</ol>" +
      (str(c.site.newcomerContact) ?
        `<p>문의: ${nl2br(str(c.site.newcomerContact))}</p>` : "");
    break;
  case "/album":
    body = c.albums.length ?
      ul(c.albums.map((x) => a(`/album/${str(x.id)}`, [str(x.date),
        str(x.title) || "앨범", `사진 ${arr(x.photos).length}장`]
        .filter(Boolean).join(" · ")))) :
      "<p>아직 등록된 앨범이 없습니다.</p>";
    break;
  case "/schedule": {
    // 날짜순 일정 목록(2026.01.01 일정 내용)
    const items = arr(c.site.schedules)
      .filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(str(x.date)) &&
        str(x.title))
      .sort((x, y) => str(x.date).localeCompare(str(y.date)));
    body = items.length ?
      ul(items.map((x) => `${esc(str(x.date).replace(/-/g, "."))} ${
        esc(str(x.title))}`)) :
      "<p>아직 등록된 일정이 없습니다.</p>";
    break;
  }
  case "/education":
    body = ul(c.edu.map((d, i) => a(`/education/${i + 1}`,
      [str(d.name), str(d.target)].filter(Boolean).join(" · "))));
    break;
  }
  const defLabel = p === "/education" ? c.eduLabel : def.label;
  return {
    title: `${defLabel} | ${c.name}`,
    description: clip(body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")
      .trim() || `${c.name} ${defLabel}`, 150),
    h1: defLabel,
    body,
  };
}

/**
 * 이 홈페이지가 소유 계정의 주보를 읽어도 되는지(2026-11-17).
 * "홈페이지만 사용"(dataSource: website)이거나, 운영자가 먼저 만들어 아직 교회 계정을 연결하지 않은
 * 사이트(pendingOwner — 소유자가 운영자 계정이라 운영자 주보가 섞여 나왔음)면 주보를 전혀 안 읽음.
 * 요금제(user)는 그대로 두고 주보·목록·칼럼만 비움
 * @param {Doc} site churchSites 문서
 * @param {Ctx | null} ctx 주보 컨텍스트
 * @return {Ctx | null} 주보를 비운 컨텍스트
 */
function siteCtx(site: Doc, ctx: Ctx | null): Ctx | null {
  if (!ctx) return ctx;
  const noBulletin = site.dataSource === "website" ||
    site.pendingOwner === true;
  return noBulletin ? {...ctx, bulletin: null, list: [], columns: []} : ctx;
}

/**
 * 검색봇용 페이지(head 메타 + 본문 HTML). 없는 페이지면 null.
 * @param {Doc} site churchSites 문서
 * @param {Ctx | null} ctxIn 주보 컨텍스트
 * @param {string} base 사이트 주소
 * @param {string} path 요청 주소
 * @return {Object | null} title/description/canonical/bodyHtml
 */
export function churchSitePage(
  site: Doc, ctxIn: Ctx | null, base: string, path: string
): {title: string; description: string; canonical: string;
  bodyHtml: string; styleHtml: string} | null {
  const c = buildContent(site, siteCtx(site, ctxIn));
  const page = buildPage(c, base, path);
  if (!page) return null;
  const clean = (path.replace(/\/+$/, "") || "/");
  // 상단 메뉴(2026-11-16): 실제 홈페이지(MultiPageSite)처럼 묶음 이름만 보이고(PC), 휴대폰에선 ≡ 버튼만.
  // 세부 페이지 링크는 HTML에 그대로 있어서(펼침 메뉴처럼 숨김) 검색엔진은 모든 페이지를 읽음.
  // 예전엔 15개 링크가 다 펼쳐진 채로 처음에 잠깐 보였다가 실제 화면으로 바뀌어 어색했음
  const navGroupOf = (x: {path: string; group: string}) =>
    x.path === "/news" ? "주보" : x.group;
  const visiblePages = PAGES.filter((x) => hasPage(x.path, c));
  const nav = NAV_GROUP_ORDER.map((g) => {
    const pages = visiblePages.filter((x) => navGroupOf(x) === g);
    if (!pages.length) return "";
    const label = g === "주일학교" ? c.eduLabel : g;
    const on = pages.some((x) => x.path === clean);
    const links = pages.map((x) => `<a href="${base}${x.path}">${
      esc(x.path === "/education" ? c.eduLabel : x.label)}</a>`).join("");
    return `<div class="g"><a class="gl${on ? " on" : ""}" href="${base}${
      pages[0].path}">${esc(label)}</a><div class="sm">${links}</div></div>`;
  }).join("") + (() => {
    // 묶음 메뉴에 안 보이는 페이지(교회 칼럼 등)도 링크는 남겨 둠(숨김)
    const rest = visiblePages.filter((x) =>
      !NAV_GROUP_ORDER.includes(navGroupOf(x)));
    return rest.length ? `<div class="sm">${rest.map((x) =>
      `<a href="${base}${x.path}">${esc(x.label)}</a>`).join("")}</div>` : "";
  })();

  // 디자인: 실제 홈페이지(MultiPageSite)와 같은 색·배치를 정적 HTML로 흉내 낸다
  // (구글 렌더러에서는 앱이 안 떠서 이 HTML이 그대로 보이고 스크린샷도 이걸로 찍힘)
  const color = /^#[0-9a-f]{3,8}$/i.test(str(site.primaryColor)) ?
    str(site.primaryColor) : "#1B3A6B";
  const isUrl = (v: unknown) => /^https?:\/\//.test(str(v));
  const heroList = Array.isArray(site.heroImages) ?
    (site.heroImages as unknown[]).filter(isUrl).map(str) : [];
  const hero = heroList[0] || (isUrl(site.heroImageUrl) ?
    str(site.heroImageUrl) : "");
  const denom = str(site.denomination);
  const mark = denom && denom !== "none" ?
    `<img class="mark" src="/denomination-logos/${esc(denom)}.png" alt="" />` :
    "";
  // 로고 영역: 실제 화면과 같게 — 직접 올린 로고가 있으면 로고(+교단 마크 같이 표시 옵션),
  // 없으면 교단 마크 + 교회 이름 + 교단명(작게)
  // 실제 화면 규칙과 같음: "로고 숨김"이면 없음, 아니면 주보 로고 → 홈페이지 로고 순
  const bd = c.b as Doc;
  const logoUrl = site.hideLogo === true ? "" :
    (bd.churchLogoEnabled !== false && isUrl(bd.churchLogo) ?
      str(bd.churchLogo) : (isUrl(site.logoUrl) ? str(site.logoUrl) : ""));
  // "교단 이름까지 표시"를 켰으면 괄호까지(대한예수교장로회(합신)), 아니면 괄호 앞부분만
  const denomName = site.denominationFullName === true ?
    (DENOM_NAMES[denom] || "") :
    (DENOM_NAMES[denom] || "").replace(/\s*\(.*\)$/, "");
  const brand = logoUrl ?
    `${site.denominationWithLogo === true && mark ?
      mark + "<span class=\"bar\"></span>" : ""}` +
      `<img class="logo" src="${esc(logoUrl)}" alt="${esc(c.name)}" />` :
    `${mark}<span class="nm"><span class="t">${esc(c.name)}</span>${
      denomName ? `<span class="d">${esc(denomName)}</span>` : ""}</span>`;
  const isHome = clean === "/";
  const mottoRef = bd.mottoEnabled !== false && str(bd.mottoText) ?
    str(bd.mottoReference) : str(site.mottoReference);
  const heroColor = /^#[0-9a-f]{3,8}$/i.test(str(site.heroTextColor)) ?
    str(site.heroTextColor) : "#fff";
  // 메인 사진: 실제 화면과 같은 높이(휴대폰 화면 세로 70%·최대 560 / PC 너비 기준)·아래 왼쪽 글자·표어
  const heroHtml = isHome ?
    `<section class="hero"${hero ? ` style="background-image:url('${
      esc(hero)}')"` : ""}><span class="sh"></span>` +
      `<div class="hi" style="color:${heroColor}"><p class="en">WELCOME</p>` +
      `<h1>${esc(page.h1)}</h1>${c.motto ? `<p class="mt">${esc(c.motto)}${
        mottoRef ? ` (${esc(mottoRef)})` : ""}</p>` : ""}</div></section>` :
    `<section class="sub"><div class="in"><h1>${esc(page.h1)}</h1>` +
      "</div></section>";

  return {
    title: page.title,
    description: page.description,
    canonical: base + (clean === "/" ? "/" : clean),
    // 메인 사진은 페이지를 열자마자 먼저 받기 시작(늦게 받아지는 동안 사진 자리가 검은 띠로 보였음)
    styleHtml: (isHome && hero ? `<link rel="preload" as="image" href="${
      esc(hero)}" fetchpriority="high" />\n` : "") +
      `<style>${churchSiteCss(color)}</style>`,
    bodyHtml: "<div class=\"cs\"><header><div class=\"hw\">" +
      `<a class="brand" href="${base}/">${brand}</a>` +
      `<nav>${nav}</nav><span class="bg" aria-hidden="true"><i></i><i></i>` +
      `<i></i></span></div></header>${heroHtml}` +
      `<main class="in">${page.body}</main>` +
      `<footer><div class="in"><p class="fn">${esc(c.name)}</p>` +
      `<p>${esc(c.address)}${c.phone ? ` · ${esc(c.phone)}` : ""}</p>` +
      `<p class="pw">© ${esc(c.name)} · Powered by STAYON</p></div></footer>` +
      "</div>",
  };
}

/**
 * 검색봇용 교회 홈페이지 정적 HTML 스타일.
 * @param {string} color 교회 주요 색상
 * @return {string} CSS
 */
function churchSiteCss(color: string): string {
  return [
    ".cs{font-family:'Pretendard',-apple-system,'Apple SD Gothic Neo',",
    "'Malgun Gothic',sans-serif;color:#1f2937;background:#fff;",
    "word-break:keep-all;line-height:1.7}",
    ".cs .in{max-width:1100px;margin:0 auto;padding:0 20px}",
    ".cs a{color:inherit;text-decoration:none}",
    // 상단·메인 사진은 실제 홈페이지(MultiPageSite)와 같은 크기·배치(2026-11-16)
    ".cs header{position:sticky;top:0;z-index:40;",
    "background:rgba(255,255,255,.95);border-bottom:1px solid #f3f4f6}",
    ".cs .hw{max-width:1152px;margin:0 auto;padding:0 16px;height:64px;",
    "display:flex;align-items:center;justify-content:space-between;gap:16px}",
    ".cs .brand{display:flex;align-items:center;gap:10px;min-width:0}",
    ".cs .mark{width:36px;height:36px;object-fit:contain;flex-shrink:0}",
    ".cs .bar{width:1px;height:24px;background:#e5e7eb;flex-shrink:0}",
    ".cs .logo{height:32px;object-fit:contain;min-width:0}",
    ".cs .nm{min-width:0;line-height:1.25}",
    ".cs .nm .t{display:block;font-weight:900;font-size:16px;color:#111827;",
    "white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    ".cs .nm .d{display:block;font-size:11px;color:#6b7280;",
    "white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    ".cs nav{display:none;align-items:center;gap:4px}",
    ".cs nav .gl{display:block;padding:8px 16px;border-radius:8px;",
    "font-size:15px;font-weight:700;color:#374151}",
    `.cs nav .gl.on{color:${color}}`,
    ".cs nav .sm{display:none}",
    ".cs .bg{display:block;padding:8px;margin-right:-8px;color:#374151}",
    ".cs .bg i{display:block;width:20px;height:2px;background:currentColor}",
    ".cs .bg i+i{margin-top:6px}",
    `.cs .hero{position:relative;background:${color};background-size:cover;`,
    "background-position:center;height:min(70vh,560px);display:flex;",
    "align-items:flex-end;overflow:hidden}",
    ".cs .hero .sh{position:absolute;inset:0;background:linear-gradient(",
    "to top,rgba(0,0,0,.6),rgba(0,0,0,.2) 50%,rgba(0,0,0,0))}",
    ".cs .hero .hi{position:relative;max-width:1152px;margin:0 auto;",
    "width:100%;box-sizing:border-box;padding:0 16px 40px}",
    ".cs .hero .en{font-size:12px;font-weight:700;letter-spacing:.25em;",
    "opacity:.8;margin:0}",
    ".cs .hero h1{font-size:30px;line-height:1.2;font-weight:900;",
    "margin:8px 0 0;color:inherit}",
    ".cs .hero .mt{font-size:14px;opacity:.9;margin:12px 0 0;color:inherit}",
    "@media(min-width:640px){.cs .hw{padding:0 32px}",
    ".cs .mark{width:40px;height:40px}.cs .logo{height:36px}",
    ".cs .nm .t{font-size:18px}.cs .nm .d{font-size:12px}",
    ".cs .hero{height:clamp(420px,42.3vw,820px)}",
    ".cs .hero .hi{padding:0 32px 64px}.cs .hero .en{font-size:14px}",
    ".cs .hero h1{font-size:48px}.cs .hero .mt{font-size:18px}}",
    "@media(min-width:768px){.cs nav{display:flex}.cs .bg{display:none}}",
    ".cs .sub{background:#f9fafb;border-bottom:1px solid #f1f1f1;",
    "padding:40px 0}",
    `.cs .sub h1{font-size:28px;font-weight:900;margin:0;color:${color}}`,
    ".cs main{padding:40px 20px 64px}",
    ".cs main h2{font-size:20px;font-weight:900;color:#111827;",
    `margin:36px 0 12px;padding-left:12px;border-left:4px solid ${color}}`,
    ".cs main h2:first-child{margin-top:0}",
    ".cs main p{margin:8px 0;color:#4b5563}",
    ".cs main ul{list-style:none;padding:0;margin:0;border:1px solid #e5e7eb;",
    "border-radius:14px;overflow:hidden}",
    ".cs main li{padding:12px 16px;border-top:1px solid #f1f1f1;",
    "color:#374151}",
    ".cs main li:first-child{border-top:0}",
    `.cs main a{color:${color};font-weight:700}`,
    ".cs main table{width:100%;border-collapse:collapse}",
    ".cs main td,.cs main th{border:1px solid #e5e7eb;padding:10px;",
    "text-align:left}",
    ".cs footer{background:#1a1b3a;color:#cbd5e1;padding:32px 0;",
    "font-size:13px}",
    ".cs footer p{margin:4px 0}",
    ".cs footer .fn{color:#fff;font-weight:900;font-size:15px}",
    ".cs footer .pw{margin-top:12px;color:#94a3b8}",
    "@media(max-width:640px){.cs .sub h1{font-size:24px}}",
  ].join("");
}

/**
 * 사이트맵에 넣을 이 교회 홈페이지의 모든 주소.
 * @param {Doc} site churchSites 문서
 * @param {Ctx | null} ctxIn 주보 컨텍스트
 * @param {string} base 사이트 주소
 * @return {string[]} 주소 목록
 */
export function churchSitePaths(
  site: Doc, ctxIn: Ctx | null, base: string
): string[] {
  const ctx = siteCtx(site, ctxIn);
  const c = buildContent(site, ctx);
  const out = [`${base}/`];
  PAGES.filter((x) => hasPage(x.path, c))
    .forEach((x) => out.push(base + x.path));
  // 온라인 주보 상세(설교 목록에서 연결) — 교회 주보 파일 유무와 상관없이
  (ctx?.list || []).forEach((x) => out.push(`${base}/bulletins/${x.id}`));
  // 교회 주보(종이 주보 파일) 상세 — 올릴 때마다 자동으로 사이트맵에 들어감(2026-11-22)
  const onlineIds = new Set((ctx?.list || []).map((x) => x.id));
  arr(site.paperBulletins).filter((p) => str(p.id) &&
    !onlineIds.has(str(p.id)) && /^https?:\/\//.test(str(p.fileUrl)))
    .forEach((p) => out.push(`${base}/bulletins/${str(p.id)}`));
  c.news.forEach((n) => out.push(`${base}/news/${n.id}`));
  (ctx?.columns || []).forEach((x) => out.push(`${base}/column/${x.id}`));
  c.prayers.forEach((x) => out.push(`${base}/prayer/${x.id}`));
  c.edu.forEach((_, i) => out.push(`${base}/education/${i + 1}`));
  if (c.site.albumEnabled !== false) {
    c.albums.forEach((x) => out.push(`${base}/album/${str(x.id)}`));
  }
  return out;
}

/**
 * 교회 홈페이지 RSS(교회소식·설교·칼럼·중보기도). 네이버 서치어드바이저 RSS 제출용.
 * @param {Doc} site churchSites 문서
 * @param {Ctx | null} ctxIn 주보 컨텍스트
 * @param {string} base 사이트 주소
 * @return {string} RSS XML
 */
export function churchSiteRss(
  site: Doc, ctxIn: Ctx | null, base: string
): string {
  const ctx = siteCtx(site, ctxIn);
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
