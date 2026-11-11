// 교회 홈페이지(페이지 전환형)가 화면에 보여줄 내용을 한 번에 모아주는 로더.
// 원칙: 모바일 주보(bulletins)에 들어 있는 데이터를 먼저 쓰고, 주보에 없는 항목만 홈페이지
// 빌더(churchSites) 입력값으로 채운다. 주보에서 한 번 고치면 홈페이지에도 자동으로 반영되게 하기 위함.
// 주보 쪽 데이터는 읽기만 하고 절대 쓰지 않는다(QR·주보 화면에 영향 없음).
// 서버(functions/src/churchSiteSeo.ts)도 같은 규칙으로 검색봇용 페이지를 만든다 — 한쪽을 바꾸면 같이 바꿀 것.
import { collection, doc, getDoc, getDocs, query, where, orderBy, limit } from "firebase/firestore";
import { db } from "../firebase";
import { ChurchSite } from "./churchSite";
import { fetchPastoralColumns, PastoralColumn } from "./pastoralColumns";
import { hasTierOrAbove } from "./subscriptionTier";
import { resolveDenomination, Denomination } from "./denominations";

export interface Person { role: string; name: string; desc?: string; photoUrl?: string; department?: string }
export interface WorshipItem { group: string; title: string; time: string; place?: string; note?: string }
// fileUrl: 종이 주보 분석으로 넣은 설교면 그 주보 파일 주소(누르면 파일이 열림)
export interface BulletinSummary { id: string; date: string; title: string; scripture: string; preacher: string; status: string; fileUrl?: string }
export interface NewsGroup { id: string; date: string; items: { title: string; content: string }[] }
export interface Post { id: string; title: string; date: string; content: string }
// 교회 주보(종이 주보 파일) — 빌더에서 교회가 올린 한글·워드·PDF·사진 파일
export interface PaperBulletin { id: string; date: string; title: string; fileUrl: string; fileName: string; fileType: string }

export interface SiteContent {
  ownerId: string;
  churchName: string;
  primaryColor: string;
  logoUrl: string; // 교회가 직접 올린 로고(있으면 교단 마크보다 우선)
  denomination: Denomination | null;
  denominationWithLogo: boolean;
  heroImageUrl: string;
  heroImages: string[];
  heroTransition: "slide" | "fade";
  heroTextColor: string; // 메인 사진 위 글자 색(#RRGGBB). 기본 흰색
  homeCards: { title?: string; desc?: string }[]; // 메인 바로가기 카드 문구(저장값 그대로, 화면에서 기본 문구로 채움)
  buildingImageUrl: string;
  galleryImages: string[];
  // 교회 소개
  motto: { text: string; reference: string; label: string } | null;
  intro: string;
  vision: string;
  mission: string;
  visionItems: { title: string; desc: string }[];
  // 담임목사
  pastor: { name: string; role: string; photoUrl: string; greetingTitle: string; greeting: string } | null;
  // 섬기는 사람들(담임 + 부교역자) / 중직자
  staff: Person[];
  officers: Person[];
  // 예배
  worship: WorshipItem[];
  youtubeLink: string;
  sermonPlaylist: string;
  worshipPhotos: Record<string, string>; // 예배 구분별 대표 사진 // 지난 설교 재생목록 주소(편집 화면 입력, 없으면 빈 값)
  sermonVideos: { title: string; speaker?: string; scripture?: string; youtubeVideoId: string; date?: string }[];
  // 주보에서 자동으로 쌓이는 설교 목록 + 지난 주보
  sermons: BulletinSummary[];
  bulletins: BulletinSummary[];
  paperBulletins: PaperBulletin[];
  latestBulletinId: string;
  // 소식
  news: NewsGroup[];
  columns: PastoralColumn[];
  prayers: Post[];
  // 연락처·위치
  address: string;
  addressDetail: string;
  shuttleInfo: string; // 차량 운행 안내(홈페이지 편집 화면 > 교회 기본 정보)
  // 주일학교/교육부서 메뉴(홈페이지 편집 화면 > 소개·소식)
  eduLabel: string;
  eduDepartments: { name: string; target: string; time: string; place: string; leader: string; desc: string; photoUrl: string }[];
  phone: string;
  email: string;
  sns: { label: string; url: string }[];
  // 앨범(홈페이지 편집 화면 > 소개·소식). 최신 날짜가 먼저
  albums: { id: string; title: string; date: string; photos: string[] }[];
}

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
// 날짜만 뽑아 YYYY-MM-DD로("2026.07.23 ~ 25" → "2026-07-23"). 날짜가 없으면 ""
const normDate = (v: unknown) => {
  const m = s(v).match(/(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : "";
};
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const isUrl = (v: unknown) => /^https?:\/\//.test(s(v));
// 사진 칸용: 예전 빌더는 사진을 data:image(base64)로 바로 저장했어서 그것도 사진으로 인정
const isImage = (v: unknown) => isUrl(v) || /^data:image\//.test(s(v));

// 주보 문서에서 예배 시간 목록 — BulletinView.tsx 표시 규칙과 동일
function bulletinWorship(b: any): WorshipItem[] {
  const out: WorshipItem[] = [];
  arr(b?.sundayServices).forEach((svc) => {
    let title = "", time = "", place = "";
    if (typeof svc === "string") {
      const p = svc.split(",").map((x) => x.trim());
      title = p[0] || "주일 예배"; time = p[1] || ""; place = p[2] || "";
    } else if (svc && typeof svc === "object") {
      title = s(svc.name) || "주일 예배"; time = s(svc.time); place = s(svc.location);
    }
    if (title || time) out.push({ group: "주일예배", title, time, place });
  });
  const ev = b?.sundayEveningService;
  if (ev && ev.enabled !== false && (s(ev.name) || s(ev.time))) {
    out.push({ group: "주일예배", title: s(ev.name) || "주일 오후 예배", time: s(ev.time), place: s(ev.location) });
  }
  const mw = b?.midweekServices;
  if (mw && mw.enabled !== false) {
    const labels: Record<string, string> = { wednesday: "수요예배", friday: "금요기도회", dawn: "새벽기도회" };
    ["wednesday", "friday", "dawn"].forEach((k) => {
      const m = mw[k];
      if (m && (s(m.title) || s(m.dateTime))) {
        out.push({ group: "주중예배", title: s(m.name) || labels[k], time: s(m.dateTime) });
      }
    });
  }
  return out;
}

// 설교자: 주보의 설교자 칸 → 비어 있으면 예배 순서에서 "설교" 순서, 그다음 "말씀 선포" 순서의 담당자(숨긴 순서 제외).
// "말씀 봉독"처럼 설교자가 아닌 순서는 쓰지 않음
const bulletinPreacher = (d: any): string => {
  if (s(d?.preacher)) return s(d.preacher);
  const secs = arr(d?.sections).filter((x) => x && !x.hidden && s(x.value));
  const hit = secs.find((x) => s(x.label).includes("설교")) || secs.find((x) => s(x.label).includes("선포"));
  return hit ? s(hit.value) : "";
};

const summarize = (id: string, d: any): BulletinSummary => ({
  id,
  date: s(d.date),
  title: s(d.title) || s(d.subtitle),
  scripture: s(d.scripture),
  preacher: bulletinPreacher(d),
  status: s(d.status),
});

// 주보 쪽 원본 데이터(교회 계정 하나당 한 번만 조회 — 빌더 미리보기에서 글자 칠 때마다 다시 부르지 않게)
export interface OwnerData { list: { id: string; data: any }[]; userStatus: string; columns: PastoralColumn[]; churchName?: string }

// maxCount: 교회 홈페이지 첫 화면을 빨리 띄우려고 최근 주보 몇 개만 먼저 받을 때 씀(나머지는 뒤에서 전체 조회)
export async function fetchOwnerData(ownerIdRaw: unknown, maxCount?: number): Promise<OwnerData> {
  const ownerId = s(ownerIdRaw);
  let list: { id: string; data: any }[] = [];
  let userStatus = "";
  let churchName = "";
  if (ownerId) {
    try {
      const constraints = [
        where("authorId", "==", ownerId),
        where("status", "in", ["published", "archived"]),
        orderBy("date", "desc"),
        ...(maxCount ? [limit(maxCount)] : []),
      ];
      const [qs, userSnap] = await Promise.all([
        getDocs(query(collection(db, "bulletins"), ...constraints)),
        getDoc(doc(db, "users", ownerId)),
      ]);
      list = qs.docs.map((d) => ({ id: d.id, data: d.data() }));
      userStatus = s(userSnap.data()?.status);
      churchName = s(userSnap.data()?.churchName);
    } catch (e) {
      console.error("교회 홈페이지용 주보 데이터 조회 실패:", e);
    }
  }
  const latestDoc = list.find((x) => x.data.status === "published") || list[0] || null;
  let columns: PastoralColumn[] = [];
  if (ownerId && latestDoc?.data.pastoralColumnsEnabled === true && hasTierOrAbove(userStatus, "pro")) {
    try {
      columns = (await fetchPastoralColumns(ownerId)).filter((c) => s(c.title) || s(c.content));
    } catch (e) {
      console.error("목회 칼럼 조회 실패:", e);
    }
  }
  return { list, userStatus, columns, churchName };
}

// 브라우저 저장용으로 줄인 주보 데이터: 최신 주보는 전부, 나머지는 홈페이지 목록·소식에 쓰는 칸만
// (buildSiteContent가 지난 주보에서 읽는 칸: 날짜·제목·성경·설교자·상태·공지)
export function trimOwnerForCache(owner: OwnerData): OwnerData {
  const latest = owner.list.find((x) => x.data.status === "published") || owner.list[0] || null;
  return {
    ...owner,
    list: owner.list.map((x) => (x === latest ? x : {
      id: x.id,
      data: {
        date: x.data.date, title: x.data.title, subtitle: x.data.subtitle, scripture: x.data.scripture,
        preacher: bulletinPreacher(x.data), status: x.data.status, announcements: x.data.announcements,
      },
    })),
  };
}

// 홈페이지 빌더(BuilderPage) 입력칸에 미리 채워 넣을 값 — 온라인 주보에 들어 있는 내용.
// 주보 데이터는 읽기만 하고, 빌더에서 고친 내용을 주보로 되돌려 쓰는 일은 절대 하지 않는다.
// 표시 규칙(켜짐/꺼짐, 요금제)은 buildSiteContent와 같다 — 홈페이지에 실제로 보이는 주보 내용과 일치하게
export interface BuilderDefaults {
  text: Partial<Record<"mottoText" | "mottoReference" | "vision" | "mission" | "churchName" | "phone" | "email" | "address" | "locationDetail" | "intro" | "pastor" | "pastorRole" | "pastorMessage" | "pastorTagline" | "pastorPhotoUrl" | "youtubeLink" | "instagramLink" | "logoUrl", string>>;
  worshipServices: { title: string; time: string; place: string; note: string; group: string }[];
  staffMembers: { role: string; name: string; department: string; phone: string; email: string; photoUrl: string }[];
  layLeaders: { role: string; name: string; department: string; photoUrl: string }[];
}

export function builderDefaultsFromBulletin(owner: OwnerData): BuilderDefaults | null {
  const latest = owner.list.find((x) => x.data.status === "published") || owner.list[0] || null;
  if (!latest) return null;
  const b: any = latest.data;
  const g = b.pastorGreeting || {};
  const senior = b.seniorPastorEnabled !== false && s(b.seniorPastor?.name) ? b.seniorPastor : null;
  const greetingOn = hasTierOrAbove(owner.userStatus, "standard") && b.pastorGreetingEnabled !== false;
  const text: BuilderDefaults["text"] = {
    churchName: owner.churchName || "",
    phone: g.phoneSectionEnabled !== false ? s(g.churchPhone) : "",
    email: s(g.email),
    address: b.addressEnabled !== false ? s(b.churchAddress) : "",
    locationDetail: b.addressEnabled !== false ? s(b.churchAddressDetail) : "",
    intro: b.churchIntroEnabled !== false ? s(b.churchIntro) : "",
    mottoText: b.mottoEnabled !== false ? s(b.mottoText) : "",
    mottoReference: b.mottoEnabled !== false ? s(b.mottoReference) : "",
    vision: b.churchVisionEnabled !== false ? s(b.churchVision) : "",
    mission: b.churchMissionEnabled !== false ? s(b.churchMission) : "",
    pastor: s(senior?.name),
    pastorRole: s(senior?.role),
    pastorMessage: greetingOn ? s(g.content) : "",
    pastorTagline: greetingOn ? s(g.greetingText) : "",
    pastorPhotoUrl: isImage(senior?.photoUrl) ? s(senior.photoUrl) : "",
    youtubeLink: b.snsEnabled !== false ? s(b.youtubeChannelUrl) : "",
    instagramLink: b.snsEnabled !== false ? s(b.snsInstagram) : "",
    // 주보 관리자 화면의 교회 로고(로고 켠 경우) — 홈페이지 상단 로고도 이걸 먼저 씀
    logoUrl: b.churchLogoEnabled !== false && isImage(b.churchLogo) ? s(b.churchLogo) : "",
  };
  Object.keys(text).forEach((k) => { if (!text[k as keyof typeof text]) delete text[k as keyof typeof text]; });
  return {
    text,
    worshipServices: bulletinWorship(b).map((w) => ({ title: w.title, time: w.time, place: w.place || "", note: "", group: w.group })),
    staffMembers: b.ministersEnabled !== false
      ? arr(b.ministers).filter((m) => s(m?.name)).map((m) => ({
          role: s(m.role), name: s(m.name), department: "", phone: s(m.phone), email: "",
          photoUrl: [m.photoUrl, m.photoURL].find(isImage) || "",
        }))
      : [],
    layLeaders: b.officersEnabled !== false
      ? arr(b.officers).filter((o) => s(o?.name)).map((o) => ({ role: s(o.position), name: s(o.name), department: s(o.duty), photoUrl: isImage(o.photoUrl) ? s(o.photoUrl) : "" }))
      : [],
  };
}

export function buildSiteContent(site: ChurchSite, owner: OwnerData): SiteContent {
  const ownerId = s(site.ownerId);
  const { list, userStatus, columns } = owner;
  const latest = list.find((x) => x.data.status === "published") || list[0] || null;
  // 교회 정보(담임목사·섬기는 사람들·예배·소개·주소 등)를 주보에서 가져올지: "custom"(주보와 다르게)·
  // "website"(홈페이지만)이면 주보 정보를 쓰지 않고 홈페이지 편집 화면 입력값만 씀.
  // 주보 목록·교회 소식·설교 같은 주보 페이지는 그대로 주보에서 가져옴
  const useBulletinInfo = site.dataSource !== "custom" && site.dataSource !== "website";
  const b: any = useBulletinInfo ? (latest?.data || {}) : {};

  // 담임목사: 주보 인사말(스탠다드 이상) → 없으면 빌더 입력
  const senior = b.seniorPastorEnabled !== false && s(b.seniorPastor?.name) ? b.seniorPastor : null;
  const g = b.pastorGreeting || {};
  const greetingOn = hasTierOrAbove(userStatus, "standard") && b.pastorGreetingEnabled !== false &&
    (s(g.greetingText) || s(g.content));
  const pastorName = s(senior?.name) || s(site.pastor);
  const pastor = pastorName || greetingOn || s(site.pastorMessage)
    ? {
        name: pastorName,
        role: s(senior?.role) || s(site.pastorRole) || "담임목사",
        photoUrl: (isImage(senior?.photoUrl) && s(senior.photoUrl)) || (isImage(site.pastorPhotoUrl) ? s(site.pastorPhotoUrl) : ""),
        greetingTitle: greetingOn ? s(g.greetingText) : s(site.pastorTagline),
        greeting: greetingOn ? s(g.content) : s(site.pastorMessage),
      }
    : null;

  // 섬기는 사람들: 주보(담임 + 부교역자) → 없으면 빌더
  const bulletinStaff: Person[] = [];
  if (senior) bulletinStaff.push({ role: s(senior.role) || "담임목사", name: s(senior.name), desc: s(senior.description), photoUrl: isImage(senior.photoUrl) ? s(senior.photoUrl) : "" });
  if (b.ministersEnabled !== false) {
    arr(b.ministers).filter((m) => s(m?.name)).forEach((m) => bulletinStaff.push({
      role: s(m.role), name: s(m.name), desc: s(m.description),
      photoUrl: [m.photoUrl, m.photoURL].find(isImage) || "",
    }));
  }
  const builderStaff: Person[] = arr(site.staffMembers).filter((m) => s(m?.name)).map((m) => ({
    role: s(m.role), name: s(m.name), department: s(m.department), photoUrl: isImage(m.photoUrl) ? s(m.photoUrl) : "",
  }));
  const bulletinOfficers: Person[] = b.officersEnabled !== false
    ? arr(b.officers).filter((o) => s(o?.name)).map((o) => ({ role: s(o.position), name: s(o.name), desc: s(o.duty), photoUrl: isImage(o.photoUrl) ? s(o.photoUrl) : "" }))
    : [];
  const builderOfficers: Person[] = arr(site.layLeaders).filter((o) => s(o?.name)).map((o) => ({
    role: s(o.role), name: s(o.name), department: s(o.department), photoUrl: isImage(o.photoUrl) ? s(o.photoUrl) : "",
  }));

  // 예배: 주보 → 없으면 빌더(worshipServices, 구버전 worshipTime)
  let worship = bulletinWorship(b);
  if (worship.length === 0) {
    worship = arr(site.worshipServices).filter((w) => s(w?.title) || s(w?.time)).map((w) => ({
      group: s(w.group) || "예배 시간", title: s(w.title), time: s(w.time), place: s(w.place), note: s(w.note),
    }));
    if (worship.length === 0 && s(site.worshipTime)) worship = [{ group: "예배 시간", title: "예배 안내", time: s(site.worshipTime) }];
  }

  // 교회 소식: 주보 공지(주보별 묶음) + 빌더에 직접 쓴 소식
  const news: NewsGroup[] = list
    .map((x) => ({
      id: x.id,
      date: normDate(x.data.date),
      items: arr(x.data.announcements).map((a) => ({ title: s(a?.title), content: s(a?.content) })).filter((a) => a.title || a.content),
    }))
    .filter((n) => n.items.length > 0);
  const bulletinNewsIds = new Set(news.map((n) => n.id));
  arr(site.newsItems).forEach((n, i) => {
    // 날짜는 등록일(날짜만). 예전에 자유롭게 적은 "2026.07.23 ~ 25" 같은 값도 날짜만
    // 한 건에 1번·2번… 여러 소식(items). 예전 데이터는 title/content 한 개
    const lines = (arr(n?.items).length ? arr(n.items) : [{ title: n?.title, content: n?.content }])
      .map((a) => ({ title: s(a?.title), content: s(a?.content) })).filter((a) => a.title || a.content);
    if (lines.length) news.push({ id: s(n?.id) || `site-${i}`, date: normDate(n.date), items: lines });
  });
  // 같은 날짜에 주보 소식과 홈페이지 소식이 둘 다 있으면 홈페이지 것만 보여 줌
  // (홈페이지·주보 저장 때 "반대쪽에도 반영할까요?"로 서로 맞추고, "아니오"면 홈페이지 내용 유지)
  const siteNewsDates = new Set(news.filter((n) => !bulletinNewsIds.has(n.id)).map((n) => n.date).filter(Boolean));
  for (let i = news.length - 1; i >= 0; i--) {
    if (bulletinNewsIds.has(news[i].id) && siteNewsDates.has(news[i].date)) news.splice(i, 1);
  }
  // 종이 주보 자동 분석으로 교회가 넣은 교회 소식(주보 한 부 = 한 묶음)
  arr(site.paperBulletins).forEach((p) => {
    const items = arr(p?.news).map((a) => ({ title: s(a?.title), content: s(a?.content) })).filter((a) => a.title || a.content);
    if (items.length) news.push({ id: `paper-${s(p.id)}`, date: normDate(p.date), items });
  });
  news.sort((a, z) => z.date.localeCompare(a.date));

  // 종이 주보 자동 분석으로 넣은 설교 — 온라인 주보 설교와 날짜순으로 같이 보임
  const paperSermons: BulletinSummary[] = arr(site.paperBulletins).flatMap((p) =>
    arr(p?.sermons).filter((x) => s(x?.title) || s(x?.scripture)).map((x, k) => ({
      id: `paper-${s(p.id)}-${k}`, date: s(p.date), title: s(x.title), scripture: s(x.scripture),
      preacher: s(x.preacher), status: "", fileUrl: isUrl(p.fileUrl) ? s(p.fileUrl) : "",
    })));

  const address = (b.addressEnabled !== false && s(b.churchAddress)) || s(site.address);
  const sns: { label: string; url: string }[] = [];
  // 같은 종류(유튜브 등)가 주보·빌더 양쪽에 있으면 주보 것 하나만
  const addSns = (label: string, url: unknown) => { if (isUrl(url) && !sns.some((x) => x.url === s(url) || x.label === label)) sns.push({ label, url: s(url) }); };
  if (b.snsEnabled !== false) {
    addSns("유튜브", b.youtubeChannelUrl);
    addSns("네이버 블로그", b.snsNaverBlog);
    addSns("인스타그램", b.snsInstagram);
    addSns("스레드", b.snsThreads);
  }
  addSns("유튜브", site.youtubeLink);
  addSns("인스타그램", site.instagramLink);
  addSns("카카오톡 채널", site.kakaoLink);

  const summaries = list.map((x) => summarize(x.id, x.data));
  // label: 주보 편집 화면 "화면에 표시할 제목"(주제 성구 / 표어 / 직접 입력)과 같게
  const mottoLabel = b.mottoLabelType === "motto" ? "표어"
    : b.mottoLabelType === "custom" ? (s(b.mottoCustomLabel) || "표어")
    : "주제 성구";
  // 주보 표어 → 없으면(2·3번 교회 등) 홈페이지 편집 화면 > 교회소개의 표어
  const motto = b.mottoEnabled !== false && s(b.mottoText) ? { text: s(b.mottoText), reference: s(b.mottoReference), label: mottoLabel }
    : s(site.mottoText) ? { text: s(site.mottoText), reference: s(site.mottoReference), label: "표어" } : null;

  return {
    ownerId,
    churchName: s(site.churchName) || "우리 교회",
    primaryColor: s(site.primaryColor) || "#1B3A6B",
    // 로고: 주보 로고(켠 경우) → 없으면 빌더에 올린 로고
    logoUrl: site.hideLogo === true ? "" : ((b.churchLogoEnabled !== false && isImage(b.churchLogo) && s(b.churchLogo)) || (isImage(site.logoUrl) ? s(site.logoUrl) : "")),
    denomination: resolveDenomination(site.denomination),
    denominationWithLogo: site.denominationWithLogo === true,
    heroImageUrl: isImage(site.heroImageUrl) ? s(site.heroImageUrl) : "",
    heroImages: arr(site.heroImages).filter(isImage).length
      ? arr(site.heroImages).filter(isImage)
      : (isImage(site.heroImageUrl) ? [s(site.heroImageUrl)] : []),
    heroTransition: site.heroTransition === "fade" ? "fade" : "slide",
    homeCards: Array.isArray(site.homeCards) ? site.homeCards : [],
    heroTextColor: /^#[0-9a-f]{6}$/i.test(s(site.heroTextColor)) ? s(site.heroTextColor) : "#FFFFFF",
    // 교회 사진: 빌더의 "교회 전경 사진" → 없으면 주보 편집 화면의 교회 이미지(교회 소개용)
    buildingImageUrl: isImage(site.buildingImageUrl) ? s(site.buildingImageUrl) : (isImage(b.churchImage) ? s(b.churchImage) : ""),
    galleryImages: arr(site.galleryImages).filter(isImage),
    motto,
    intro: (b.churchIntroEnabled !== false && s(b.churchIntro)) || s(site.intro),
    vision: (b.churchVisionEnabled !== false && s(b.churchVision)) || s(site.vision),
    mission: (b.churchMissionEnabled !== false && s(b.churchMission)) || s(site.mission),
    visionItems: arr(site.visionItems).filter((v) => s(v?.title) || s(v?.desc)).map((v) => ({ title: s(v.title), desc: s(v.desc) })),
    pastor,
    staff: bulletinStaff.length > 0 ? bulletinStaff : builderStaff,
    officers: bulletinOfficers.length > 0 ? bulletinOfficers : builderOfficers,
    worship,
    youtubeLink: s(b.youtubeChannelUrl) || s(site.youtubeLink),
    worshipPhotos: Object.fromEntries(Object.entries((site.worshipGroupPhotos || {}) as Record<string, unknown>).filter(([, v]) => isImage(v)).map(([k, v]) => [k, s(v)])),
    sermonPlaylist: /[?&]list=[\w-]+/.test(s(site.sermonPlaylistUrl)) ? s(site.sermonPlaylistUrl) : "",
    sermonVideos: site.onlineWorshipEnabled === false ? [] : arr(site.sermons).filter((v) => s(v?.youtubeVideoId)),
    sermons: (() => {
      const list = summaries.filter((x) => x.title || x.scripture).concat(paperSermons)
        .sort((a, z) => z.date.localeCompare(a.date));
      // 이번 주 말씀(편집 화면 > 매주 업데이트): 주보와 연동하지 않거나(2·3번) 주보 설교가 없을 때 맨 앞에
      const w = (site.weeklySermon || {}) as Record<string, unknown>;
      if (s(w.title)) {
        // 같은 날짜 주보가 있으면 그 주보 설교 자리에 이번 주 말씀을 보여 줌(홈페이지 내용 우선)
        const wDate = normDate(w.date);
        const same = wDate ? list.findIndex((x) => normDate(x.date) === wDate) : -1;
        if (same >= 0) {
          list[same] = { ...list[same], title: s(w.title), scripture: s(w.scripture), preacher: s(w.preacher) };
        } else if (!useBulletinInfo || list.length === 0 || (wDate && wDate > normDate(list[0].date))) {
          // 주보와 연동하지 않거나, 주보 설교가 없거나, 주보보다 더 최근 날짜면 맨 앞에
          list.unshift({ id: "site-weekly", date: s(w.date), title: s(w.title), scripture: s(w.scripture), preacher: s(w.preacher), status: "" });
        }
      }
      return list;
    })(),
    bulletins: summaries,
    paperBulletins: arr(site.paperBulletins)
      .filter((p) => isUrl(p?.fileUrl))
      .map((p) => ({ id: s(p.id), date: s(p.date), title: s(p.title), fileUrl: s(p.fileUrl), fileName: s(p.fileName), fileType: s(p.fileType).toLowerCase() }))
      .sort((a, z) => z.date.localeCompare(a.date)),
    latestBulletinId: latest?.id || "",
    news,
    columns,
    prayers: arr((site as any).prayerPosts)
      .filter((p) => s(p?.title) || s(p?.content))
      .map((p, i) => ({ id: s(p.id) || String(i), title: s(p.title), date: s(p.date), content: s(p.content) }))
      .sort((a, z) => z.date.localeCompare(a.date)),
    address,
    addressDetail: (b.addressEnabled !== false && s(b.churchAddressDetail)) || s(site.locationDetail),
    shuttleInfo: s(site.shuttleInfo),
    eduLabel: s(site.eduMenuLabel) || "주일학교",
    eduDepartments: arr(site.eduDepartments).filter((d) => s(d?.name)).map((d) => ({
      name: s(d.name), target: s(d.target), time: s(d.time), place: s(d.place), leader: s(d.leader), desc: s(d.desc),
      photoUrl: isImage(d.photoUrl) ? s(d.photoUrl) : "",
    })),
    phone: (b.pastorGreeting?.phoneSectionEnabled !== false && s(b.pastorGreeting?.churchPhone)) || s(site.phone),
    email: s(site.email) || s(b.pastorGreeting?.email),
    sns,
    albums: arr(site.albums)
      .filter((a) => s(a?.title) || arr(a?.photos).some(isImage))
      .map((a, i) => ({ id: s(a.id) || String(i), title: s(a.title) || "앨범", date: s(a.date), photos: arr(a.photos).filter(isImage) }))
      .sort((a, z) => z.date.localeCompare(a.date)),
  };
}

export async function loadSiteContent(site: ChurchSite): Promise<SiteContent> {
  return buildSiteContent(site, await fetchOwnerData(site.ownerId));
}

// 고정 QR 주소 — 교회 관리자 화면(AdminDashboard.tsx fixedViewUrl)에서 발급하는 QR과 완전히 같은 주소.
// 절대 다른 주소로 바꾸지 말 것(이미 인쇄된 QR이 이 주소를 가리킨다)
export const fixedBulletinUrl = (ownerId: string) => `https://bulletin.stayon-platform.com/view/${ownerId}`;
