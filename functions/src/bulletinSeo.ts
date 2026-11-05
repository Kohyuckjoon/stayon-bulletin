// 검색봇(구글/빙/네이버)용 주보 페이지 렌더링.
//
// 성도 화면은 React(BulletinView 등)가 브라우저에서 Firestore를 불러와 그리는
// 구조라, 검색봇이 첫 HTML만 보면 빈 페이지가 된다. 그래서 bulletinOG가 검색봇
// 요청일 때만 이 파일의 함수로 같은 내용을 서버에서 완성된 HTML로 만들어 준다.
// 주보플러스(joobo.kr) 교회 페이지 구조를 그대로 따름:
//  - 페이지마다 고유 title/description/canonical/robots/og/twitter
//  - Church(주소·전화 포함)/WebSite/WebPage/BreadcrumbList/Article 구조화 데이터
//  - 모든 페이지 상단 메뉴(주보/교회 소개/섬기시는 분/칼럼/교회 소식/오시는 길…)
//    + 하단 연락처·예배안내·바로가기 → 페이지끼리 서로 링크로 연결
//  - 교회별 RSS(/view/{uid}/rss.xml)
// 성도 화면(React 라우트)에 실제로 있는 주소만 만든다 — 사람이 열었을 때 없는
// 페이지를 검색봇에게만 보여주면 구글 정책상 클로킹이 되기 때문.
// 개인 휴대폰 번호·헌금 계좌번호는 검색결과에 노출되면 안 되므로 넣지 않는다.
import * as admin from "firebase-admin";

export const SITE = "https://bulletin.stayon-platform.com";
// index.html과 같은 bulletin 도메인 소유확인 값(public/google61aa6fd3ceb77412.html)
const GOOGLE_SITE_VERIFICATION = "google61aa6fd3ceb77412";
// 네이버 서치어드바이저 bulletin 도메인 소유확인 값(index.html과 동일)
const NAVER_SITE_VERIFICATION = "fad7558d8dce1f7e0585580e0aeeda9892365990";

type Doc = Record<string, unknown>;

// 교회별 주보 전용 주소: {bulletinSlug}-jubo.stayon-platform.com
// (주보플러스 anjeongch.joobo.kr처럼 교회 하나 = 검색엔진에 사이트 하나).
// users/{uid}.bulletinSlug를 /super에서 넣은 교회만 해당. 기존 QR 주소
// (/view/{uid})는 그대로 열리고, 검색엔진에 알리는 대표 주소만 이쪽으로 바뀐다
export const JUBO_HOST_SUFFIX = "-jubo.stayon-platform.com";
export const BULLETIN_SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])?$/;

/**
 * 주보 전용 주소의 기본 URL(없으면 빈 문자열).
 * @param {unknown} slug users/{uid}.bulletinSlug
 * @return {string} 예: https://haeundae-jubo.stayon-platform.com
 */
export function juboSiteBase(slug: unknown): string {
  const s = typeof slug === "string" ? slug.trim() : "";
  return BULLETIN_SLUG_REGEX.test(s) ? `https://${s}${JUBO_HOST_SUFFIX}` : "";
}

/**
 * 소유확인 값 정리 — 메타 태그 전체를 붙여넣어도 content 값만 뽑는다.
 * @param {unknown} v 입력값
 * @return {string} content 값(영문·숫자·-_ 만)
 */
export function verificationCode(v: unknown): string {
  const s = typeof v === "string" ? v.trim() : "";
  const m = s.match(/content=["']([^"']+)["']/);
  const code = m ? m[1] : s;
  return /^[A-Za-z0-9_-]{6,100}$/.test(code) ? code : "";
}

/**
 * HTML 속성/텍스트에 안전하게 넣기 위해 특수문자를 이스케이프함.
 * @param {string} input 원본 문자열
 * @return {string} 이스케이프된 문자열
 */
export function esc(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * unknown 값을 앞뒤 공백 제거한 문자열로. 문자열이 아니면 빈 문자열.
 * @param {unknown} v 원본 값
 * @return {string} 문자열
 */
export function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * 객체 배열이면 그대로, 아니면 빈 배열.
 * @param {unknown} v 원본 값
 * @return {Doc[]} 객체 배열
 */
export function objArray(v: unknown): Doc[] {
  return Array.isArray(v) ?
    v.filter((x) => x && typeof x === "object") as Doc[] :
    [];
}

/**
 * 줄바꿈을 <br />로 바꾼 이스케이프 문자열.
 * @param {string} s 원본
 * @return {string} HTML
 */
export function nl2br(s: string): string {
  return esc(s).replace(/\n/g, "<br />");
}

/**
 * 여러 줄 텍스트를 한 줄로(제목/설명용).
 * @param {string} s 원본
 * @return {string} 한 줄 문자열
 */
export function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * 설명(meta description)용으로 길이를 자른다.
 * @param {string} s 원본
 * @param {number} max 최대 글자 수
 * @return {string} 잘린 문자열
 */
export function clip(s: string, max = 150): string {
  const t = oneLine(s);
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * Firestore Timestamp → millis(아니면 0).
 * @param {unknown} v 값
 * @return {number} millis
 */
export function millis(v: unknown): number {
  return v instanceof admin.firestore.Timestamp ? v.toMillis() : 0;
}

// 프론트 subscriptionTier.ts의 TIER_RANK와 동일. 무료체험(active/없음)은 최고 등급.
const TIER_RANK: Record<string, number> = {
  active: 4, basic: 1, standard: 2, pro: 3, allinone: 4,
};

/**
 * 교회 등급이 minTier 이상인지(프론트 hasTierOrAbove와 동일).
 * @param {unknown} status users/{uid}.status
 * @param {string} minTier 최소 등급
 * @return {boolean} 이상이면 true
 */
export function hasTierOrAbove(status: unknown, minTier: string): boolean {
  const s = typeof status === "string" && status in TIER_RANK ?
    status : "active";
  return TIER_RANK[s] >= TIER_RANK[minTier];
}

export interface BulletinItem {
  id: string;
  data: Doc;
}

/**
 * 교회가 발행한(published/archived) 주보를 최신순으로.
 * 인덱스 없이 돌도록 authorId 단일 조건으로만 조회하고 나머지는 메모리에서 거름.
 * @param {string} uid 교회 uid
 * @return {Promise<BulletinItem[]>} 주보 목록
 */
export async function getPublishedBulletins(
  uid: string
): Promise<BulletinItem[]> {
  const snap = await admin.firestore().collection("bulletins")
    .where("authorId", "==", uid)
    .get();
  return snap.docs
    .map((d) => ({id: d.id, data: d.data() as Doc}))
    .filter((b) => b.data.status === "published" ||
      b.data.status === "archived")
    .sort((a, b) => millis(b.data.publishedAt) - millis(a.data.publishedAt));
}

export interface Ctx {
  uid: string;
  user: Doc;
  churchName: string;
  searchable: boolean;
  // 요청 주소의 주보(/view/{주보ID}면 그 주보, 아니면 최신 주보)
  bulletin: BulletinItem | null;
  // 요청 주소가 "최신 주보"를 가리키는지(→ canonical을 /view/{uid}로 모음)
  isLatest: boolean;
  // 발행된 주보 전체(최신순)
  list: BulletinItem[];
  // 목회 칼럼(프로 이상 + 최신 주보에서 켠 경우만, 날짜 최신순)
  columns: BulletinItem[];
  // 주보 전용 주소(없으면 빈 문자열 → 기존 /view/{uid} 주소 그대로)
  siteBase: string;
}

/**
 * 만들어진 HTML/RSS/주소 안의 bulletin 주소를 주보 전용 주소로 바꾼다.
 * /view/{uid}/about → {siteBase}/about, 지난 주보 /view/{주보ID} →
 * {siteBase}/bulletins/{주보ID}. 전용 주소가 없는 교회는 그대로 반환.
 * @param {Ctx} ctx 컨텍스트
 * @param {string} text 원문
 * @return {string} 바뀐 문자열
 */
export function rebase(ctx: Ctx, text: string): string {
  if (!ctx.siteBase) return text;
  let out = text;
  ctx.list.forEach((b) => {
    out = out.split(`${SITE}/view/${b.id}`)
      .join(`${ctx.siteBase}/bulletins/${b.id}`);
  });
  return out.split(`${SITE}/view/${ctx.uid}`).join(ctx.siteBase);
}

/**
 * /view/:id 의 id로 교회·주보를 찾는다. BulletinView.tsx/bulletinOG와 같은 순서:
 * ① users/:id ② users.currentBulletinId==id ③ bulletins/:id 의 authorId
 * @param {string} id 주소의 id
 * @param {Object} opts opts.onlySearchable이면 검색엔진 노출을
 *   안 켠 교회는 주보 목록 조회 전에 바로 null(성도 방문마다 불필요한 조회 방지)
 * @return {Promise<Ctx | null>} 못 찾으면 null
 */
export async function resolveCtx(
  id: string,
  opts: {onlySearchable?: boolean} = {}
): Promise<Ctx | null> {
  const db = admin.firestore();
  let uid = "";
  let user: Doc | null = null;
  let docBulletin: BulletinItem | null = null;

  const u = await db.collection("users").doc(id).get();
  if (u.exists) {
    uid = id;
    user = u.data() as Doc;
  } else {
    const q = await db.collection("users")
      .where("currentBulletinId", "==", id).limit(1).get();
    if (!q.empty) {
      uid = q.docs[0].id;
      user = q.docs[0].data() as Doc;
    } else {
      const b = await db.collection("bulletins").doc(id).get();
      const authorId = b.exists ? str((b.data() as Doc).authorId) : "";
      if (authorId) {
        const au = await db.collection("users").doc(authorId).get();
        if (au.exists) {
          uid = authorId;
          user = au.data() as Doc;
          docBulletin = {id: b.id, data: b.data() as Doc};
        }
      }
    }
  }
  if (!user || !uid) return null;
  if (opts.onlySearchable && user.bulletinSearchable !== true) return null;

  const list = await getPublishedBulletins(uid);
  const latest = list.find((b) => b.data.status === "published") ||
    list[0] || null;
  const bulletin = docBulletin || latest;
  const isLatest = !docBulletin || docBulletin.data.status === "published";

  let columns: BulletinItem[] = [];
  if (latest?.data.pastoralColumnsEnabled === true &&
    hasTierOrAbove(user.status, "pro")) {
    const cs = await db.collection("pastoralColumns")
      .where("authorId", "==", uid).get();
    columns = cs.docs
      .map((d) => ({id: d.id, data: d.data() as Doc}))
      .filter((c) => str(c.data.title) || str(c.data.content))
      .sort((a, b) => str(b.data.date).localeCompare(str(a.data.date)));
  }

  return {
    uid,
    user,
    churchName: str(user.churchName) || "우리 교회",
    searchable: user.bulletinSearchable === true,
    bulletin,
    isLatest,
    list,
    columns,
    siteBase: juboSiteBase(user.bulletinSlug),
  };
}

// ---------------------------------------------------------------------------
// 하위 페이지 정의 — 성도 화면 메뉴(BulletinMenu)와 같은 주소/같은 표시 조건
// ---------------------------------------------------------------------------

type SubKey =
  "about" | "pastor" | "team" | "officers" | "column" | "church-news" |
  "location" | "sns";

const SUB_LABEL: Record<SubKey, string> = {
  "about": "교회 소개",
  "pastor": "담임목사 인사말",
  "team": "섬기시는 분",
  "officers": "중직자",
  "column": "목회 칼럼",
  "church-news": "교회 소식",
  "location": "오시는 길",
  "sns": "교회 SNS·유튜브",
};

const SUB_ORDER: SubKey[] = [
  "about", "pastor", "team", "officers", "column", "church-news",
  "location", "sns",
];

interface Section {
  title: string;
  html: string;
}

/**
 * 담임목사 + 부교역자 목록(TeamPage와 같은 조건).
 * @param {Doc} b 주보
 * @return {Doc[]} 사람 목록
 */
function teamPeople(b: Doc): {role: string; name: string; desc: string}[] {
  const out: {role: string; name: string; desc: string}[] = [];
  const senior = (b.seniorPastor || {}) as Doc;
  if (b.seniorPastorEnabled !== false && str(senior.name)) {
    out.push({
      role: str(senior.role) || "담임 목사",
      name: str(senior.name),
      desc: str(senior.description),
    });
  }
  if (b.ministersEnabled !== false) {
    objArray(b.ministers).forEach((m) => {
      if (str(m.name)) {
        out.push({
          role: str(m.role), name: str(m.name), desc: str(m.description),
        });
      }
    });
  }
  return out;
}

/**
 * 교회 소식(공지)이 있는 주보들(ChurchNewsListPage와 같은 기준).
 * @param {Ctx} ctx 컨텍스트
 * @return {BulletinItem[]} 공지가 있는 주보 목록(날짜 최신순)
 */
function newsBulletins(ctx: Ctx): BulletinItem[] {
  return ctx.list
    .filter((b) => objArray(b.data.announcements)
      .some((a) => str(a.title) || str(a.content)))
    .sort((a, b) => str(b.data.date).localeCompare(str(a.data.date)));
}

/**
 * 하위 페이지 본문 섹션. 성도 화면에서 안 보이는(꺼짐/내용 없음) 페이지는 null.
 * @param {Ctx} ctx 컨텍스트
 * @param {SubKey} key 하위 페이지
 * @return {Section[] | null} 섹션 목록
 */
function subSections(ctx: Ctx, key: SubKey): Section[] | null {
  const b = ctx.bulletin?.data || {};
  switch (key) {
  case "about": {
    const out: Section[] = [];
    const intro = b.churchIntroEnabled !== false ? str(b.churchIntro) : "";
    const vision = b.churchVisionEnabled !== false ? str(b.churchVision) : "";
    const mission = b.churchMissionEnabled !== false ?
      str(b.churchMission) : "";
    if (b.mottoEnabled !== false && str(b.mottoText)) {
      out.push({
        title: "표어",
        html: `<p>${nl2br(str(b.mottoText))}</p>` +
          (str(b.mottoReference) ?
            `<p>${esc(str(b.mottoReference))}</p>` : ""),
      });
    }
    if (intro) out.push({title: "교회 소개", html: `<p>${nl2br(intro)}</p>`});
    if (vision) out.push({title: "비전", html: `<p>${nl2br(vision)}</p>`});
    if (mission) out.push({title: "사명", html: `<p>${nl2br(mission)}</p>`});
    return out.length > 0 ? out : null;
  }
  case "pastor": {
    const g = (b.pastorGreeting || {}) as Doc;
    if (!hasTierOrAbove(ctx.user.status, "standard") ||
      b.pastorGreetingEnabled === false ||
      (!str(g.greetingText) && !str(g.content))) {
      return null;
    }
    const senior = (b.seniorPastor || {}) as Doc;
    const out: Section[] = [{
      title: "담임목사 인사말",
      html: (str(g.greetingText) ? `<h3>${nl2br(str(g.greetingText))}</h3>` :
        "") +
        (str(g.content) ? `<p>${nl2br(str(g.content))}</p>` : "") +
        (str(senior.name) ?
          `<p>${esc(str(senior.role) || "담임 목사")} ${
            esc(str(senior.name))}</p>` :
          ""),
    }];
    // 교회 대표번호·이메일만(개인 휴대폰은 제외)
    const contacts: string[] = [];
    if (g.phoneSectionEnabled !== false && str(g.churchPhone)) {
      contacts.push(`<li>교회 전화: ${esc(str(g.churchPhone))}</li>`);
    }
    if (str(g.email)) contacts.push(`<li>이메일: ${esc(str(g.email))}</li>`);
    if (contacts.length > 0) {
      out.push({title: "연락처", html: `<ul>${contacts.join("")}</ul>`});
    }
    return out;
  }
  case "team": {
    const people = teamPeople(b);
    if (people.length === 0) return null;
    return [{
      title: "섬기시는 분",
      html: "<ul>" + people.map((p) =>
        `<li><strong>${esc(p.role)} ${esc(p.name)}</strong>` +
          (p.desc ? `<br />${nl2br(p.desc)}` : "") + "</li>"
      ).join("") + "</ul>",
    }];
  }
  case "officers": {
    const officers = b.officersEnabled !== false ?
      objArray(b.officers).filter((o) => str(o.name)) : [];
    if (officers.length === 0) return null;
    return [{
      title: "중직자",
      html: "<ul>" + officers.map((o) =>
        `<li><strong>${esc(str(o.position))} ${esc(str(o.name))}</strong>` +
          (str(o.duty) ? `<br />${esc(str(o.duty))}` : "") + "</li>"
      ).join("") + "</ul>",
    }];
  }
  case "column": {
    if (ctx.columns.length === 0) return null;
    return [{
      title: "목회 칼럼",
      html: "<ul>" + ctx.columns.map((c) =>
        `<li><a href="${SITE}/view/${esc(ctx.uid)}/column/${esc(c.id)}">` +
          `<strong>${esc(oneLine(str(c.data.title)) || "칼럼")}</strong></a>` +
          `<br /><small>${esc([str(c.data.date), str(c.data.author)]
            .filter(Boolean).join(" · "))}</small>` +
          (str(c.data.content) ?
            `<br />${esc(clip(str(c.data.content), 120))}` : "") +
          "</li>"
      ).join("") + "</ul>",
    }];
  }
  case "church-news": {
    const items = newsBulletins(ctx);
    if (items.length === 0) return null;
    return [{
      title: "교회 소식",
      html: "<ul>" + items.map((n) => {
        const titles = objArray(n.data.announcements)
          .map((a) => oneLine(str(a.title))).filter(Boolean).slice(0, 4);
        return `<li><a href="${SITE}/view/${esc(ctx.uid)}/church-news/${
          esc(n.id)}"><strong>${esc(str(n.data.date) || "교회 소식")}` +
          "</strong></a>" +
          (titles.length > 0 ? `<br />${esc(titles.join(" · "))}` : "") +
          "</li>";
      }).join("") + "</ul>",
    }];
  }
  case "location": {
    const address = [str(b.churchAddress), str(b.churchAddressDetail)]
      .filter(Boolean).join(" ");
    if (b.addressEnabled === false || !str(b.churchAddress)) return null;
    const phone = churchPhone(ctx);
    return [{
      title: "오시는 길",
      html: `<p>${esc(address)}</p>` +
        (phone ? `<p>교회 전화: ${esc(phone)}</p>` : "") +
        `<p><a href="https://map.naver.com/p/search/${
          encodeURIComponent(str(b.churchAddress))}">네이버 지도에서 보기</a>` +
        " · " +
        `<a href="https://map.kakao.com/?q=${
          encodeURIComponent(str(b.churchAddress))}">카카오맵에서 보기</a></p>`,
    }];
  }
  case "sns": {
    if (b.snsEnabled === false) return null;
    const links: string[] = [];
    const add = (label: string, url: string) => {
      if (/^https?:\/\//.test(url)) {
        links.push(`<li><a href="${esc(url)}" rel="noopener">${
          esc(label)}</a></li>`);
      }
    };
    add(str(b.youtubeChannelName) || "유튜브 채널", str(b.youtubeChannelUrl));
    add("네이버 블로그", str(b.snsNaverBlog));
    add("인스타그램", str(b.snsInstagram));
    add("스레드", str(b.snsThreads));
    if (links.length === 0) return null;
    return [{title: "교회 SNS·유튜브", html: `<ul>${links.join("")}</ul>`}];
  }
  }
  return null;
}

/**
 * 교회 대표번호(담임목사 인사말에 등록된 교회 전화). 개인 휴대폰은 쓰지 않음.
 * @param {Ctx} ctx 컨텍스트
 * @return {string} 전화번호(없으면 빈 문자열)
 */
function churchPhone(ctx: Ctx): string {
  const b = ctx.bulletin?.data || {};
  const g = (b.pastorGreeting || {}) as Doc;
  return g.phoneSectionEnabled !== false ? str(g.churchPhone) : "";
}

/**
 * 이 교회에서 실제로 보이는 하위 페이지 목록(메뉴·사이트맵용).
 * @param {Ctx} ctx 컨텍스트
 * @return {SubKey[]} 하위 페이지 키
 */
export function availableSubs(ctx: Ctx): SubKey[] {
  return SUB_ORDER.filter((k) => subSections(ctx, k) !== null);
}

/**
 * 교회 소식 상세에 쓸 수 있는 주보 id 목록(사이트맵용).
 * @param {Ctx} ctx 컨텍스트
 * @return {string[]} 주보 id
 */
export function newsIds(ctx: Ctx): string[] {
  return newsBulletins(ctx).map((b) => b.id);
}

// ---------------------------------------------------------------------------
// 주보 본문
// ---------------------------------------------------------------------------

/**
 * 주보 본문 섹션(성도 화면 BulletinView에 보이는 순서/조건 기준).
 * @param {Doc} b 주보
 * @return {Section[]} 섹션 목록
 */
function bulletinSections(b: Doc): Section[] {
  const out: Section[] = [];

  const sermonBits = [
    str(b.specialSunday),
    str(b.scripture) && `본문: ${str(b.scripture)}`,
    str(b.preacher) && `설교: ${str(b.preacher)}`,
  ].filter(Boolean) as string[];
  if (str(b.title) || str(b.subtitle) || sermonBits.length > 0) {
    out.push({
      title: "이번 주 말씀",
      html: (str(b.title) ? `<h3>${nl2br(str(b.title))}</h3>` : "") +
        (str(b.subtitle) ? `<p>${nl2br(str(b.subtitle))}</p>` : "") +
        (sermonBits.length > 0 ? `<p>${esc(sermonBits.join(" · "))}</p>` :
          ""),
    });
  }

  const order = objArray(b.sections)
    .filter((s) => s.hidden !== true && (str(s.label) || str(s.value)));
  if (order.length > 0) {
    out.push({
      title: "예배 순서",
      html: "<ul>" + order.map((s) =>
        `<li><strong>${esc(str(s.label))}</strong> ${esc(str(s.value))}` +
          (str(s.preview) ? `<br />${nl2br(str(s.preview))}` : "") + "</li>"
      ).join("") + "</ul>",
    });
  }

  const news = objArray(b.announcements)
    .filter((a) => str(a.title) || str(a.content));
  if (news.length > 0) {
    out.push({
      title: "교회 소식",
      html: news.map((a) =>
        (str(a.title) ? `<h3>${esc(str(a.title))}</h3>` : "") +
          (str(a.content) ? `<p>${nl2br(str(a.content))}</p>` : "")
      ).join(""),
    });
  }

  const sharing = objArray(b.sharingQuestions)
    .filter((q) => str(q.title) || str(q.content));
  if (b.sharingEnabled !== false && sharing.length > 0) {
    out.push({
      title: "나눔",
      html: sharing.map((q) =>
        (str(q.title) ? `<h3>${esc(str(q.title))}</h3>` : "") +
          (str(q.quote) ?
            `<blockquote>${nl2br(str(q.quote))}</blockquote>` : "") +
          (str(q.content) ? `<p>${nl2br(str(q.content))}</p>` : "")
      ).join(""),
    });
  }

  const services = worshipLines(b);
  if (services.length > 0) {
    out.push({
      title: "예배 안내",
      html: "<ul>" + services.map((s) => `<li>${esc(s)}</li>`).join("") +
        "</ul>",
    });
  }

  if (b.mottoEnabled !== false && str(b.mottoText)) {
    out.push({
      title: "표어",
      html: `<p>${nl2br(str(b.mottoText))}</p>` +
        (str(b.mottoReference) ? `<p>${esc(str(b.mottoReference))}</p>` : ""),
    });
  }
  return out;
}

/**
 * 예배 안내 줄 목록(주일/주일 저녁/수·금·새벽).
 * @param {Doc} b 주보
 * @return {string[]} 줄 목록
 */
function worshipLines(b: Doc): string[] {
  const lines: string[] = [];
  if (Array.isArray(b.sundayServices)) {
    b.sundayServices.forEach((s) => {
      // 저장 형식: "이름, 시간, 장소"
      const line = str(s).split(",").map((x) => x.trim())
        .filter(Boolean).join(" ");
      if (line) lines.push(line);
    });
  }
  const ev = (b.sundayEveningService || {}) as Doc;
  if (ev.enabled === true && ev.isCanceled !== true) {
    const line = [str(ev.name), str(ev.time), str(ev.location)]
      .filter(Boolean).join(" ");
    if (line) lines.push(line);
  }
  const mw = (b.midweekServices || {}) as Doc;
  if (mw.enabled === true) {
    ["wednesday", "friday", "dawn"].forEach((k) => {
      const m = (mw[k] || {}) as Doc;
      const line = [str(m.name), str(m.dateTime)].filter(Boolean).join(" ");
      if (line) lines.push(line);
    });
  }
  return lines;
}

// ---------------------------------------------------------------------------
// 페이지 조립
// ---------------------------------------------------------------------------

export interface SeoPage {
  title: string;
  description: string;
  canonical: string;
  html: string;
}

interface PageSpec {
  title: string;
  description: string;
  canonicalPath: string;
  h1: string;
  dateLine: string;
  sections: Section[];
  crumbs: {name: string; path: string}[];
  article: boolean;
  datePublished: string;
}

/**
 * 주보 제목 한 줄(예: "2026-10-25 죄인을 부르러 오신 예수님").
 * @param {Doc} b 주보
 * @return {string} 제목
 */
function bulletinLabel(b: Doc): string {
  return [str(b.date), oneLine(str(b.title) || str(b.subtitle))]
    .filter(Boolean).join(" ");
}

/**
 * 요청 경로에 맞는 검색봇용 페이지. 성도 화면에 없는 페이지면 null.
 * @param {Ctx} ctx 컨텍스트
 * @param {string} sub 하위 경로(about 등, 주보 본문이면 빈 문자열)
 * @param {string} subId 상세 id(칼럼/교회 소식 상세)
 * @return {SeoPage | null} 페이지
 */
export function buildSeoPage(
  ctx: Ctx, sub: string, subId: string
): SeoPage | null {
  const church = ctx.churchName;
  const home = `/view/${ctx.uid}`;
  const b = ctx.bulletin?.data || {};
  let spec: PageSpec | null = null;

  if (!sub) {
    if (!ctx.bulletin) return null;
    const label = bulletinLabel(b);
    const sermon = oneLine(str(b.title) || str(b.subtitle));
    const order = objArray(b.sections)
      .filter((s) => s.hidden !== true && str(s.label))
      .map((s) => str(s.label)).slice(0, 5);
    const archive = ctx.list
      .filter((x) => x.id !== ctx.bulletin?.id &&
        !(ctx.isLatest && x.data.status === "published"))
      .slice(0, 30);
    const sections = bulletinSections(b);
    if (archive.length > 0) {
      sections.push({
        title: "지난 주보",
        html: "<ul>" + archive.map((x) => {
          const href = x.data.status === "published" ? home : `/view/${x.id}`;
          return `<li><a href="${SITE}${esc(href)}">${
            esc(bulletinLabel(x.data) || "주보")}</a></li>`;
        }).join("") + "</ul>",
      });
    }
    spec = {
      title: ctx.isLatest ?
        `${church} 주보 | ${label || "온라인 주보"}` :
        `${label ? `${label} ` : ""}주보 | ${church}`,
      description: clip(`${church} ${str(b.date)} 주보` +
        (sermon ? ` - "${sermon}"` : "") +
        (str(b.scripture) ? ` (${str(b.scripture)})` : "") +
        ". " + (order.length > 0 ? `${order.join(", ")} 등 ` : "") +
        "예배 순서와 교회 소식을 확인하세요."),
      canonicalPath: ctx.isLatest ? home : `/view/${ctx.bulletin.id}`,
      h1: `${church} 주보`,
      dateLine: label,
      sections,
      crumbs: ctx.isLatest ?
        [{name: church, path: home}] :
        [
          {name: church, path: home},
          {name: `${label || "주보"}`, path: `/view/${ctx.bulletin.id}`},
        ],
      article: true,
      datePublished: /^\d{4}-\d{2}-\d{2}$/.test(str(b.date)) ?
        `${str(b.date)}T00:00:00+09:00` : "",
    };
  } else if (sub === "column" && subId) {
    const c = ctx.columns.find((x) => x.id === subId);
    if (!c) return null;
    const title = oneLine(str(c.data.title)) || "목회 칼럼";
    const meta = [str(c.data.date), str(c.data.author)]
      .filter(Boolean).join(" · ");
    spec = {
      title: `${title} - 목회 칼럼 | ${church}`,
      description: clip(`${church} 목회 칼럼 "${title}". ` +
        str(c.data.content)),
      canonicalPath: `${home}/column/${c.id}`,
      h1: title,
      dateLine: meta,
      sections: [{
        title: "목회 칼럼",
        html: `<h3>${esc(title)}</h3>` +
          (meta ? `<p><small>${esc(meta)}</small></p>` : "") +
          `<p>${nl2br(str(c.data.content))}</p>`,
      }],
      crumbs: [
        {name: church, path: home},
        {name: "목회 칼럼", path: `${home}/column`},
        {name: title, path: `${home}/column/${c.id}`},
      ],
      article: true,
      datePublished: /^\d{4}-\d{2}-\d{2}$/.test(str(c.data.date)) ?
        `${str(c.data.date)}T00:00:00+09:00` : "",
    };
  } else if (sub === "church-news" && subId) {
    const n = newsBulletins(ctx).find((x) => x.id === subId);
    if (!n) return null;
    const date = str(n.data.date);
    const news = objArray(n.data.announcements)
      .filter((a) => str(a.title) || str(a.content));
    const titles = news.map((a) => oneLine(str(a.title))).filter(Boolean);
    spec = {
      // 같은 날짜 주보가 여러 개(주일/수요)면 제목이 겹치므로 첫 소식 제목을 붙임
      title: `${date ? `${date} ` : ""}교회 소식` +
        (titles[0] ? ` - ${titles[0]}` : "") + ` | ${church}`,
      description: clip(`${church} ${date} 교회 소식 - ${titles.join(", ")}`),
      canonicalPath: `${home}/church-news/${n.id}`,
      h1: `${church} 교회 소식`,
      dateLine: date,
      sections: [{
        title: "교회 소식",
        html: news.map((a) =>
          (str(a.title) ? `<h3>${esc(str(a.title))}</h3>` : "") +
            (str(a.content) ? `<p>${nl2br(str(a.content))}</p>` : "")
        ).join(""),
      }],
      crumbs: [
        {name: church, path: home},
        {name: "교회 소식", path: `${home}/church-news`},
        {name: date || "교회 소식", path: `${home}/church-news/${n.id}`},
      ],
      article: true,
      datePublished: /^\d{4}-\d{2}-\d{2}$/.test(date) ?
        `${date}T00:00:00+09:00` : "",
    };
  } else if ((SUB_ORDER as string[]).includes(sub) && !subId) {
    const key = sub as SubKey;
    const sections = subSections(ctx, key);
    if (!sections) return null;
    const plain = sections.map((s) => s.html.replace(/<[^>]+>/g, " "))
      .join(" ");
    spec = {
      title: `${SUB_LABEL[key]} | ${church}`,
      description: clip(`${church} ${SUB_LABEL[key]} - ` +
        plain.replace(/&[a-z#0-9]+;/g, " ")),
      canonicalPath: `${home}/${key}`,
      h1: SUB_LABEL[key],
      dateLine: church,
      sections,
      crumbs: [
        {name: church, path: home},
        {name: SUB_LABEL[key], path: `${home}/${key}`},
      ],
      article: false,
      datePublished: "",
    };
  }

  if (!spec) return null;
  return {
    title: spec.title,
    description: spec.description,
    canonical: rebase(ctx, SITE + spec.canonicalPath),
    html: rebase(ctx, renderHtml(ctx, spec, sub)),
  };
}

/**
 * 교회 주보 전용 주소용 네이버·구글 소유확인 메타 태그(/super에서 입력).
 * @param {Ctx} ctx 컨텍스트
 * @return {string} 메타 태그(없으면 빈 문자열)
 */
export function churchVerificationMetas(ctx: Ctx): string {
  if (!ctx.siteBase) return "";
  const naver = verificationCode(ctx.user.naverSiteVerification);
  const google = verificationCode(ctx.user.googleSiteVerification);
  return [
    naver ? `<meta name="naver-site-verification" content="${naver}" />` : "",
    google ? `<meta name="google-site-verification" content="${google}" />` :
      "",
  ].filter(Boolean).join("\n");
}

/**
 * 공통 HTML 껍데기(head + 메뉴 + 본문 + 하단 연락처/예배안내/바로가기).
 * @param {Ctx} ctx 컨텍스트
 * @param {PageSpec} p 페이지 정보
 * @param {string} activeSub 현재 메뉴(강조용)
 * @return {string} HTML 문서
 */
function renderHtml(ctx: Ctx, p: PageSpec, activeSub: string): string {
  const church = ctx.churchName;
  const home = `${SITE}/view/${ctx.uid}`;
  const url = SITE + p.canonicalPath;
  const b = ctx.bulletin?.data || {};
  const cover = str(ctx.user.coverImage);
  const image = /^https?:\/\//.test(cover) ? cover : "";
  const logo = /^https?:\/\//.test(str(b.churchLogo)) ? str(b.churchLogo) : "";
  const address = [str(b.churchAddress), str(b.churchAddressDetail)]
    .filter(Boolean).join(" ");
  const phone = churchPhone(ctx);
  const subs = availableSubs(ctx);

  const churchNode: Doc = {
    "@type": "Church",
    "@id": `${home}#church`,
    "name": church,
    "url": home,
    ...(str(b.churchIntro) ? {description: clip(str(b.churchIntro), 200)} :
      {}),
    ...(image ? {image} : {}),
    ...(logo || image ? {logo: logo || image} : {}),
    ...(address && b.addressEnabled !== false ? {
      address: {
        "@type": "PostalAddress",
        "streetAddress": address,
        "addressCountry": "KR",
      },
    } : {}),
    ...(phone ? {telephone: phone} : {}),
  };
  const graph: Doc[] = [
    churchNode,
    {
      "@type": "WebSite",
      "@id": `${home}#website`,
      "name": `${church} 온라인 주보`,
      "url": home,
      "inLanguage": "ko-KR",
      "about": {"@id": `${home}#church`},
    },
    {
      "@type": "WebPage",
      "@id": `${url}#webpage`,
      "url": url,
      "name": p.title,
      "description": p.description,
      "inLanguage": "ko-KR",
      "isPartOf": {"@id": `${home}#website`},
      "about": {"@id": `${home}#church`},
      "breadcrumb": {"@id": `${url}#breadcrumb`},
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${url}#breadcrumb`,
      "itemListElement": p.crumbs.map((c, i) => ({
        "@type": "ListItem",
        "position": i + 1,
        "name": c.name,
        "item": SITE + c.path,
      })),
    },
  ];
  if (p.article) {
    graph.push({
      "@type": "Article",
      "@id": `${url}#article`,
      "headline": p.title.slice(0, 110),
      "description": p.description,
      "mainEntityOfPage": {"@id": `${url}#webpage`},
      "author": {"@type": "Organization", "name": church, "url": home},
      "publisher": {
        "@type": "Organization",
        "name": church,
        "url": home,
        ...(logo || image ?
          {logo: {"@type": "ImageObject", "url": logo || image}} : {}),
      },
      "inLanguage": "ko-KR",
      ...(p.datePublished ?
        {datePublished: p.datePublished, dateModified: p.datePublished} :
        {}),
      ...(image ? {image: [image]} : {}),
    });
  }
  const jsonLd = JSON.stringify({"@context": "https://schema.org", "@graph":
    graph}).replace(/</g, "\\u003c");

  const nav = [
    `<a href="${home}"${activeSub ? "" : " class=\"on\""}>주보</a>`,
    ...subs.map((k) => `<a href="${home}/${k}"${
      activeSub === k ? " class=\"on\"" : ""}>${SUB_LABEL[k]}</a>`),
  ].join("");

  const worship = worshipLines(b);
  const footer = [
    "<footer>",
    `<p class="fname">${esc(church)}</p>`,
    "<div class=\"fgrid\">",
    (address && b.addressEnabled !== false) || phone ?
      "<div><h3>연락처</h3>" +
        (address && b.addressEnabled !== false ?
          `<p>${esc(address)}</p>` : "") +
        (phone ? `<p><a href="tel:${esc(phone.replace(/[^0-9+]/g, ""))}">${
          esc(phone)}</a></p>` : "") +
        "</div>" :
      "",
    worship.length > 0 ?
      "<div><h3>예배안내</h3><ul>" +
        worship.slice(0, 6).map((w) => `<li>${esc(w)}</li>`).join("") +
        "</ul></div>" :
      "",
    "<div><h3>바로가기</h3><ul>" +
      `<li><a href="${home}">이번 주 주보</a></li>` +
      subs.map((k) => `<li><a href="${home}/${k}">${SUB_LABEL[k]}</a></li>`)
        .join("") +
      "</ul></div>",
    "</div>",
    `<p class="copy"><a href="${SITE}/">STAYON 온라인 주보</a></p>`,
    "</footer>",
  ].join("");

  const t = esc(p.title);
  const d = esc(p.description);
  const u = esc(url);
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${t}</title>
<meta name="description" content="${d}" />
<link rel="canonical" href="${u}" />
<meta name="robots" content="index,follow" />
<meta property="og:title" content="${t}" />
<meta property="og:description" content="${d}" />
${image ? `<meta property="og:image" content="${esc(image)}" />` : ""}
<meta property="og:url" content="${u}" />
<meta property="og:type" content="${p.article ? "article" : "website"}" />
<meta property="og:site_name" content="${esc(church)}" />
<meta property="og:locale" content="ko_KR" />
${p.datePublished ? `<meta property="article:published_time" content="${
    p.datePublished}" />` : ""}
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${t}" />
<meta name="twitter:description" content="${d}" />
${image ? `<meta name="twitter:image" content="${esc(image)}" />` : ""}
<meta name="google-site-verification" content="${GOOGLE_SITE_VERIFICATION}" />
<meta name="naver-site-verification" content="${NAVER_SITE_VERIFICATION}" />
${churchVerificationMetas(ctx)}
<link rel="alternate" type="application/rss+xml" title="${
  esc(church)} 주보·소식" href="${home}/rss.xml" />
<link rel="stylesheet" href="${FONT_URL}" />
<style>${CSS}</style>
<script type="application/ld+json">${jsonLd}</script>
</head>
<body>
<main class="wrap">
<header class="hero">
${image && !activeSub ? `<img class="cover" src="${esc(image)}" alt="${
    esc(church)}" />` : ""}
<p class="brand"><a href="${home}">${esc(church)}</a></p>
<h1>${esc(p.h1)}</h1>
${p.dateLine ? `<p class="date">${esc(p.dateLine)}</p>` : ""}
<nav>${nav}</nav>
</header>
${p.sections.map((s) => `<section><h2>${esc(s.title)}</h2>${s.html}</section>`)
    .join("\n")}
${footer}
</main>
</body>
</html>`;
}

/**
 * 교회별 RSS(최신 주보·지난 주보·목회 칼럼·교회 소식). 네이버 서치어드바이저
 * RSS 제출과 구글 피드 수집용.
 * @param {Ctx} ctx 컨텍스트
 * @return {string} RSS XML
 */
export function buildRss(ctx: Ctx): string {
  const home = `${SITE}/view/${ctx.uid}`;
  const items: {title: string; link: string; desc: string; date: number}[] =
    [];
  ctx.list.slice(0, 30).forEach((x) => {
    const link = x.data.status === "published" ? home : `${SITE}/view/${x.id}`;
    items.push({
      title: `${bulletinLabel(x.data) || "주보"} 주보`,
      link,
      desc: clip([str(x.data.scripture), str(x.data.preacher),
        objArray(x.data.announcements).map((a) => str(a.title)).join(", ")]
        .filter(Boolean).join(" · "), 300),
      date: millis(x.data.publishedAt),
    });
  });
  ctx.columns.slice(0, 20).forEach((c) => {
    items.push({
      title: `${oneLine(str(c.data.title)) || "목회 칼럼"} - 목회 칼럼`,
      link: `${home}/column/${c.id}`,
      desc: clip(str(c.data.content), 300),
      date: Date.parse(`${str(c.data.date)}T00:00:00+09:00`) || 0,
    });
  });
  items.sort((a, b) => b.date - a.date);
  const rssItems = items.map((i) => [
    "<item>",
    `<title>${esc(i.title)}</title>`,
    `<link>${esc(i.link)}</link>`,
    `<guid>${esc(i.link)}</guid>`,
    i.desc ? `<description>${esc(i.desc)}</description>` : "",
    i.date ? `<pubDate>${new Date(i.date).toUTCString()}</pubDate>` : "",
    "</item>",
  ].join("")).join("\n");
  return rebase(ctx, [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    "<rss version=\"2.0\">",
    "<channel>",
    `<title>${esc(ctx.churchName)} 주보·소식</title>`,
    `<link>${esc(home)}</link>`,
    `<description>${esc(ctx.churchName)} 온라인 주보와 교회 소식</description>`,
    "<language>ko</language>",
    rssItems,
    "</channel>",
    "</rss>",
  ].join("\n"));
}

/**
 * 사이트맵에 넣을 이 교회의 모든 주소(lastmod 포함).
 * @param {Ctx} ctx 컨텍스트
 * @return {{loc: string, lastmod: string}[]} 주소 목록
 */
export function sitemapEntries(ctx: Ctx): {loc: string; lastmod: string}[] {
  const day = (v: unknown) => millis(v) ?
    new Date(millis(v)).toISOString().split("T")[0] : "";
  const home = `${SITE}/view/${ctx.uid}`;
  const latestDay = day(ctx.list[0]?.data.publishedAt);
  const out: {loc: string; lastmod: string}[] = [
    {loc: home, lastmod: latestDay},
  ];
  availableSubs(ctx).forEach((k) =>
    out.push({loc: `${home}/${k}`, lastmod: latestDay}));
  ctx.list.filter((x) => x.data.status === "archived").forEach((x) =>
    out.push({loc: `${SITE}/view/${x.id}`, lastmod: day(x.data.publishedAt)}));
  ctx.columns.forEach((c) => out.push({
    loc: `${home}/column/${c.id}`,
    lastmod: /^\d{4}-\d{2}-\d{2}$/.test(str(c.data.date)) ?
      str(c.data.date) : "",
  }));
  newsBulletins(ctx).forEach((n) => out.push({
    loc: `${home}/church-news/${n.id}`,
    lastmod: day(n.data.publishedAt),
  }));
  return out.map((e) => ({...e, loc: rebase(ctx, e.loc)}));
}

// 검색봇용 페이지 디자인. 스크립트 없는 정적 HTML이라 성도 화면(React +
// Tailwind)의 CSS를 그대로 쓸 수 없어서 주보 카드 형태로 별도로 입힌다.
const FONT_URL =
  "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/" +
  "pretendard.min.css";
const CSS = [
  "*{box-sizing:border-box;margin:0;padding:0}",
  "body{background:#f4f1ec;color:#2b2724;line-height:1.7;",
  "word-break:keep-all;overflow-wrap:anywhere;",
  "font-family:Pretendard,-apple-system,'Apple SD Gothic Neo',sans-serif}",
  ".wrap{max-width:480px;margin:0 auto;padding:0 0 32px;background:#faf8f5;",
  "min-height:100vh}",
  ".hero{text-align:center;padding:0 0 18px;background:#fff;",
  "border-bottom:1px solid #ece6dd}",
  ".cover{display:block;width:100%;aspect-ratio:16/10;object-fit:cover}",
  ".brand{padding-top:22px;font-size:12px;letter-spacing:.2em}",
  ".brand a{color:#a08a6d}",
  "h1{margin-top:4px;font-size:25px;font-weight:800;color:#2b2724;",
  "padding:0 16px}",
  ".date{margin-top:4px;font-size:14px;color:#8a7f73;padding:0 16px}",
  "nav{display:flex;gap:6px;overflow-x:auto;padding:16px 16px 0;",
  "scrollbar-width:none}",
  "nav a{flex:none;font-size:13px;padding:6px 12px;border-radius:999px;",
  "background:#f4efe8;color:#6b5a45}",
  "nav a.on{background:#2b2724;color:#fff}",
  "section{margin:16px;padding:22px 20px;background:#fff;border-radius:18px;",
  "box-shadow:0 1px 3px rgba(0,0,0,.05)}",
  "h2{font-size:13px;font-weight:700;letter-spacing:.12em;color:#a08a6d;",
  "margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid #f0ebe4}",
  "h3{font-size:17px;font-weight:700;margin:14px 0 4px}",
  "h2+h3{margin-top:0}",
  "p{font-size:15px;color:#4a443e;margin-top:4px}",
  "small{font-size:12px;color:#8a7f73}",
  "ul{list-style:none}",
  "li{font-size:15px;padding:9px 0;border-bottom:1px dashed #eee6dc}",
  "li:last-child{border-bottom:0}",
  "blockquote{margin:6px 0;padding:10px 14px;background:#f7f3ee;",
  "border-left:3px solid #c9b394;border-radius:6px;font-size:14px}",
  "a{color:#7a5c3a;text-decoration:none}",
  "footer{margin:28px 16px 0;padding:22px 20px;background:#2b2724;",
  "border-radius:18px;color:#d8cfc3}",
  "footer .fname{font-size:16px;font-weight:800;color:#fff;margin:0 0 10px}",
  "footer h3{font-size:12px;letter-spacing:.12em;color:#a08a6d;",
  "margin:14px 0 4px}",
  "footer p,footer li{font-size:13px;color:#d8cfc3;border:0;padding:2px 0}",
  "footer a{color:#efe6da}",
  "footer .copy{margin-top:16px;font-size:11px}",
].join("");
