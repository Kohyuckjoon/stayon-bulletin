import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { GraceBoard } from "./GraceBoard"; // 은혜나눔 게시판(2026-11-24)
import { useNavigate } from "react-router";
import { QRCodeSVG } from "qrcode.react";
import { LayoutGrid, List as ListIcon, Search, HandHeart, Church, Youtube, Car } from "lucide-react";
import { ChurchSite } from "../../../utils/churchSite";
import { denominationLogoSrc, denominationDisplayName } from "../../../utils/denominations";
import { fetchOwnerData, buildSiteContent, OwnerData, SiteContent, fixedBulletinUrl, trimOwnerForCache } from "../../../utils/churchSiteContent";
import { readSiteCache, writeSiteCache } from "../../../utils/siteLocalCache";
import { homeCardText, homeCardHidden } from "../../../utils/homeCards";
import { defaultBannerPhoto, resolveBannerColors, bannerTextIsDark } from "../../../utils/pageBanners";

// 교회 홈페이지 "페이지 전환형" 화면. 메뉴마다 주소(/about, /worship …)가 따로 있고,
// 각 페이지가 따로 검색엔진에 걸리도록 진짜 <a href> 링크로 이동한다.
// 내용은 utils/churchSiteContent.ts가 모바일 주보 데이터를 먼저, 없으면 빌더 입력값으로 채운다.
// 서버 검색봇용 페이지(functions/src/churchSiteSeo.ts)와 메뉴 주소·표시 조건이 같아야 한다.

type PageKey =
  | "home" | "about" | "pastor" | "history" | "staff" | "location"
  | "worship" | "online" | "sermons" | "bulletins" | "jubo"
  | "news" | "column" | "prayer" | "education" | "album" | "praise" | "newcomer" | "schedule" | "grace";

interface PageDef { key: PageKey; path: string; label: string }
interface GroupDef { en: string; label: string; pages: PageDef[]; navHidden?: boolean } // navHidden: 위쪽 메뉴·휴대폰 메뉴에는 안 보이는 묶음(주소로는 열림)

const EDU_GROUP_LABEL = "교육부서";

export const SITE_GROUPS: GroupDef[] = [
  { en: "ABOUT", label: "교회소개", pages: [
    { key: "about", path: "/about", label: "교회 소개" },
    { key: "pastor", path: "/about/pastor", label: "담임목사 인사말" },
    { key: "history", path: "/about/history", label: "교회 연혁" },
    { key: "staff", path: "/about/staff", label: "섬기는 사람들" },
    { key: "location", path: "/location", label: "오시는 길" },
    // 새가족 안내(등록 절차): 편집 화면 > 교회소개에 내용을 적으면 보임
    { key: "newcomer", path: "/about/newcomer", label: "새가족 안내" },
  ] },
  { en: "WORSHIP", label: "예배", pages: [
    { key: "worship", path: "/worship", label: "예배 안내" },
  ] },
  // 말씀(2026-11-11): 예배 메뉴 안에 있던 설교 화면(이번 주 말씀 · 다음 주 말씀)을 예배 바로 오른쪽 메뉴로 따로 뺌
  { en: "SERMON", label: "말씀/영상", pages: [
    // 2026-11-21: 예배 메뉴의 "온라인 예배"를 여기 첫 탭 "실시간 예배"로 옮김(예전 주소 /worship/online도 이 화면)
    { key: "online", path: "/sermons/live", label: "실시간 예배" },
    { key: "sermons", path: "/sermons", label: "말씀 / 영상" },
  ] },
  // 찬양팀: 편집 화면 > 예배 탭에서 켜면(ON) 메뉴에 보이고, 끄면(OFF) 메뉴에서 아예 사라짐
  { en: "PRAISE", label: "찬양팀", pages: [
    { key: "praise", path: "/praise", label: "찬양팀" },
  ] },
  // 주일학교/교육부서: 메뉴 이름은 교회가 정함(홈페이지 편집 화면). 여기 label은 기본값이고 화면에선 c.eduLabel로 바꿔 보여 줌
  { en: "EDUCATION", label: EDU_GROUP_LABEL, pages: [
    { key: "education", path: "/education", label: EDU_GROUP_LABEL },
  ] },
  { en: "BULLETIN", label: "주보", pages: [
    { key: "bulletins", path: "/bulletins", label: "교회 주보" },
    // 교회 소식은 주보 페이지 탭에도 같이 둠(상단 "교회소식" 메뉴에도 그대로 있음 — 같은 페이지)
    { key: "news", path: "/news", label: "교회 소식" },
    { key: "jubo", path: "/jubo", label: "온라인 주보" },
  ] },
  // 앨범: 교회가 홈페이지 편집 화면(매주 업데이트 탭)에서 올린 행사별 사진 앨범. 메뉴 위치는 "주보" 바로 오른쪽.
  // 사진이 없어도 메뉴는 항상 보임(안내 문구). 서버 검색봇용 페이지(churchSiteSeo)에도 /album · /album/:id 있음
  { en: "ALBUM", label: "앨범", pages: [
    { key: "album", path: "/album", label: "앨범" },
  ] },
  // 은혜나눔(2026-11-24): 성도가 직접 글을 쓰는 게시판. 편집 화면 > 기본 설정에서 켜면(ON) 메뉴에 보임.
  // 메뉴 이름은 교회가 정함(site.graceLabel, 기본 "나눔 게시판"). 글은 이 교회(slug) 것만(gracePosts)
  { en: "GRACE", label: "나눔 게시판", pages: [
    { key: "grace", path: "/grace", label: "나눔 게시판" },
  ] },
  // 교회 일정(2026-11-12): 편집 화면 > 매주 업데이트 탭에서 켜면(ON) "앨범" 오른쪽 메뉴에 보이고, 끄면(OFF) 메뉴·화면 모두 숨김.
  // 왼쪽 달력 + 오른쪽 "이 달의 일정" 목록. 서버 검색봇용 페이지(churchSiteSeo /schedule)도 같은 조건
  { en: "SCHEDULE", label: "교회 일정", pages: [
    { key: "schedule", path: "/schedule", label: "교회 일정" },
  ] },
  // 위쪽 "교회소식" 메뉴는 없앰(2026-11-11): 교회 소식은 "주보" 메뉴 탭(교회 주보 · 교회 소식 · 온라인 주보)에 있음.
  // 칼럼·중보기도 화면은 주소(/column, /prayer)로는 그대로 열리게 메뉴에만 숨김
  // (예전: { en: "NEWS", label: "교회소식", pages: [news, column, prayer] })
  { en: "NEWS", label: "교회소식", navHidden: true, pages: [
    { key: "column", path: "/column", label: "교회 칼럼" },
    { key: "prayer", path: "/prayer", label: "중보기도" },
  ] },
];

// 홈 화면 바로가기(카드·환영 섹션·more+)가 가리키는 페이지에 보여 줄 내용이 있는지.
// 내용이 없으면 사람에겐 "준비 중인 페이지", 검색엔진(서버)엔 404라서 그 바로가기는 숨김(2026-11-22)
// 아래 주소들의 hasPage는 site를 쓰지 않음(site는 교회 연혁만 씀)
const HOME_TARGET_KEY: Record<string, PageKey> = { "/about": "about", "/worship": "worship", "/sermons/live": "online", "/location": "location", "/news": "news" };
function homeTargetReady(to: string, c: SiteContent): boolean {
  const key = HOME_TARGET_KEY[to];
  return !key || hasPage(key, c, {} as ChurchSite);
}

// 페이지에 보여줄 내용이 실제로 있는지 — 없는 메뉴는 숨김(눌러도 빈 화면인 죽은 링크 방지)
function hasPage(key: PageKey, c: SiteContent, site: ChurchSite): boolean {
  switch (key) {
    case "home": return true;
    case "about": return !!(c.intro || c.vision || c.mission || c.motto || c.buildingImageUrl);
    case "pastor": return !!(c.pastor && (c.pastor.greeting || c.pastor.greetingTitle));
    case "history": return (site as any).historyEnabled !== false && Array.isArray((site as any).historyItems) && (site as any).historyItems.length > 0;
    case "staff": return c.staff.length > 0 || c.officers.length > 0;
    case "location": return !!c.address;
    case "worship": return c.worship.length > 0;
    case "online": return !!c.youtubeLink || c.sermonVideos.length > 0;
    case "sermons": return c.sermons.length > 0 || c.sermonVideos.length > 0 || !!c.youtubeLink || !!c.nextSermon;
    // 교회 주보(올린 종이 주보 파일)는 파일이 없어도 탭을 항상 보여줌(온라인 주보 탭과 나란히)
    case "bulletins": return true;
    // 온라인 주보: 주보가 있고, 편집 화면 "온라인 주보 메뉴"가 켜져 있을 때만(2026-11-17)
    case "jubo": return !!(c.ownerId && c.latestBulletinId) && c.juboMenuEnabled;
    case "news": return c.news.length > 0;
    case "column": return c.columns.length > 0;
    case "prayer": return c.prayers.length > 0;
    case "education": return c.eduDepartments.length > 0;
    case "album": return c.albumEnabled; // 편집 화면에서 끄면 메뉴·화면 숨김(기본 켜짐)
    case "praise": return c.praiseEnabled;
    case "schedule": return c.scheduleEnabled;
    // 은혜나눔: 운영자 승인(graceAllowed) + 교회가 켬(graceEnabled) 둘 다일 때만 메뉴에 보임
    case "grace": return (site as { graceEnabled?: boolean; graceAllowed?: boolean }).graceEnabled === true && (site as { graceAllowed?: boolean }).graceAllowed === true;
    case "newcomer": return !!(c.newcomerIntro || c.newcomerSteps.length || c.newcomerContact);
  }
}

// 주소 → (페이지, 상세 id). 예전 원페이지 시절 주소(/community, /online-worship)도 받아준다
function parsePath(pathname: string): { key: PageKey; id: string } {
  const p = pathname.replace(/\/+$/, "") || "/";
  const seg = p.split("/").filter(Boolean);
  if (p === "/") return { key: "home", id: "" };
  if (p === "/community") return { key: "staff", id: "" };
  if (p === "/online-worship" || p === "/worship/online") return { key: "online", id: "" };
  for (const g of SITE_GROUPS) {
    for (const pg of g.pages) {
      if (p === pg.path) return { key: pg.key, id: "" };
    }
  }
  if (["bulletins", "news", "column", "prayer", "album", "education", "grace"].includes(seg[0]) && seg[1]) {
    return { key: seg[0] as PageKey, id: seg[1] };
  }
  return { key: "home", id: "" };
}

// 한 페이지가 두 메뉴에 같이 있으면(교회 소식: 주보 탭 + 교회소식 메뉴) 그 페이지가 첫 화면인
// 메뉴(교회소식)를 선택된 메뉴로 본다 — 그렇지 않으면 위에 있는 "주보"가 선택돼 보임
const groupOf = (key: PageKey) =>
  SITE_GROUPS.find((g) => g.pages[0]?.key === key) ||
  SITE_GROUPS.find((g) => g.pages.some((p) => p.key === key));
const pageOf = (key: PageKey) => SITE_GROUPS.flatMap((g) => g.pages).find((p) => p.key === key);
const nl = (t: string) => <span className="whitespace-pre-line">{t}</span>;
// **글자** → 굵게(교회 소식 전체 안내). 줄바꿈은 그대로
const nlBold = (t: string) => (
  <span className="whitespace-pre-line">
    {t.split(/(\*\*[\s\S]+?\*\*)/g).map((p, i) => /^\*\*[\s\S]+\*\*$/.test(p) ? <strong key={i} className="font-bold text-gray-900">{p.slice(2, -2)}</strong> : p)}
  </span>
);

interface Props {
  site: ChurchSite;
  pathname: string;
  // BuilderPage 라이브 미리보기: 실제 주소 이동 대신 미리보기 안에서만 페이지를 바꾼다
  preview?: boolean;
}

// 주보 쪽 데이터도 페이지를 옮길 때마다 처음부터 다시 받지 않게 기억(깜빡임 방지, 최신 내용은 뒤에서 갱신)
const ownerCache = new Map<string, OwnerData>();

export function MultiPageSite({ site, pathname, preview }: Props) {
  const navigate = useNavigate();
  // 실제 교회 홈페이지에서는 이 브라우저에 저장해 둔 주보 데이터(지난 방문)로 바로 그림. 빌더 미리보기는 기존 그대로
  const [owner, setOwner] = useState<OwnerData | null>(() => {
    const oid = String(site.ownerId || "");
    return ownerCache.get(oid) ?? (!preview && oid ? readSiteCache<OwnerData>(`owner:${oid}`) : null);
  });
  const [previewPath, setPreviewPath] = useState("/");
  const [menuOpen, setMenuOpen] = useState(false);
  // 휴대폰 메뉴가 열려 있는 동안 뒤 화면이 같이 스크롤되지 않게 막고, Esc로 닫기
  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [menuOpen]);

  useEffect(() => {
    let cancelled = false;
    let fullDone = false;
    const oid = String(site.ownerId || "");
    // 처음 방문(저장본 없음)이면 최근 주보 몇 개만 먼저 받아 첫 화면을 빨리 띄우고, 전체 목록은 뒤이어 채움
    if (!preview && oid && !ownerCache.has(oid) && !readSiteCache(`owner:${oid}`)) {
      // 주보 한 부가 사진 때문에 수백 KB인 경우가 있어, 첫 화면에 꼭 필요한 최신 2부만 먼저 받음
      fetchOwnerData(site.ownerId, 2).then((o) => {
        if (!cancelled && !fullDone) setOwner((prev) => prev ?? o);
      });
    }
    fetchOwnerData(site.ownerId).then((o) => {
      fullDone = true;
      ownerCache.set(oid, o);
      if (!preview && oid) writeSiteCache(`owner:${oid}`, trimOwnerForCache(o));
      if (!cancelled) setOwner(o);
    });
    return () => { cancelled = true; };
  }, [site.ownerId, preview]);
  const content = useMemo(() => (owner ? buildSiteContent(site, owner) : null), [site, owner]);

  // 어느 화면으로 들어오든 교회 유튜브 채널 영상을 뒤에서 미리 받아 둠 → 설교·온라인 예배 화면에 가면 기다림 없이 바로 보임
  // (첫 화면 그리기를 방해하지 않게 조금 뒤에)
  // 서버가 사이트 데이터에 저장해 둔 목록(채널 = ytVideos, 지난 설교 재생목록 = ytPlaylist)이 있으면 그걸 바로 쓰고,
  // 1시간이 지났을 때만 새로 받음(새로 받으면 서버가 사이트 데이터에 다시 저장 → 방문이 없으면 호출도 없음)
  const ytChannel = content?.youtubeLink || "";
  const ytPlaylistUrl = content?.sermonPlaylist || "";
  ytSiteSlug = !preview ? String(site.slug || "") : "";
  const ytStale: string[] = [];
  // 쇼츠(2026-11-21): 서버가 저장해 둔 쇼츠 목록(ytShorts)도 바로 씀. 오래됐으면 말씀/영상 화면에서 새로 받음
  {
    const sv = site.ytShorts;
    if (ytChannel && !ytShortsMemo.has(ytChannel) && sv?.url === ytChannel && Array.isArray(sv.videos)) ytShortsMemo.set(ytChannel, sv.videos);
    ytShortsNeedsSave = !!ytChannel && !(sv?.url === ytChannel && Date.now() - Number(sv?.t || 0) < 60 * 60 * 1000);
  }
  ([[ytChannel, site.ytVideos], [ytPlaylistUrl, site.ytPlaylist]] as const).forEach(([u, saved]) => {
    if (!u) return;
    if (!ytMemo.has(u) && saved?.url === u && Array.isArray(saved.videos) && saved.videos.length) ytMemo.set(u, saved.videos);
    const fresh = saved?.url === u && Date.now() - Number(saved?.t || 0) < 60 * 60 * 1000;
    // 저장본이 오래됐을 때만 서버에 "사이트에 저장해 줘"(site=주소)를 같이 보냄
    if (fresh) ytNeedsSave.delete(u);
    else { ytNeedsSave.add(u); ytStale.push(u); }
  });
  const ytStaleKey = ytStale.join("\n");
  useEffect(() => {
    const todo = (ytStaleKey ? ytStaleKey.split("\n") : []).filter((u) => !ytLiveMemo.has(u));
    if (!todo.length) return;
    const t = setTimeout(() => { todo.forEach((u) => { void loadYt(u); }); }, 800);
    return () => clearTimeout(t);
  }, [ytStaleKey]);

  // 주소에 #edu-1 처럼 위치가 붙어 들어오면(새로고침·링크 공유) 내용이 그려진 뒤 그 위치로
  useEffect(() => {
    if (!content || preview || !window.location.hash) return;
    const t = setTimeout(() => document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: "start" }), 150);
    return () => clearTimeout(t);
  }, [content, preview]);

  // 앱 화면이 준비되면 서버가 미리 그려 준 교회 화면(main.tsx의 #ssr-shell)을 지움 — 화면에 그리기 전에
  useLayoutEffect(() => {
    if (content && !preview) document.getElementById("ssr-shell")?.remove();
  }, [content, preview]);

  const current = preview ? previewPath : pathname;
  const { key, id } = parsePath(current);

  const go = (path: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    setMenuOpen(false);
    if (preview) setPreviewPath(path);
    else {
      // /education#edu-1 처럼 # 이 붙은 주소는 그 페이지로 간 뒤 해당 부서 위치로 스크롤
      const [p, hash] = path.split("#");
      navigate(p);
      if (hash) setTimeout(() => document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
      else window.scrollTo(0, 0);
    }
  };
  const A = ({ to, className, style, children }: { to: string; className?: string; style?: React.CSSProperties; children: React.ReactNode }) => (
    <a href={to} onClick={go(to)} className={className} style={style}>{children}</a>
  );

  // 은혜나눔 메뉴 이름(교회가 정함)
  const graceLabel = ((site as { graceLabel?: string }).graceLabel || "").trim() || "나눔 게시판";
  const groups = useMemo(() => {
    if (!content) return [];
    return SITE_GROUPS
      .filter((g) => !g.navHidden)
      .map((g) => ({ ...g, pages: g.pages.filter((p) => hasPage(p.key, content, site)) }))
      .filter((g) => g.pages.length > 0)
      // 교육부서 메뉴는 교회가 정한 이름(주일학교·교육부서·직접 입력)으로
      .map((g) => (g.en === "EDUCATION"
        // 상단 메뉴에 마우스를 올리면 부서(유초등부·중고등부 …)가 하위 메뉴로. 누르면 /education 의 그 부서로 이동
        ? { ...g, label: content.eduLabel, pages: content.eduDepartments.length > 1
            ? content.eduDepartments.map((d, i) => ({ key: "education" as PageKey, path: `/education/${i + 1}`, label: d.name }))
            : g.pages.map((p) => ({ ...p, label: content.eduLabel })) }
        : g.en === "GRACE" ? { ...g, label: graceLabel, pages: g.pages.map((p) => ({ ...p, label: graceLabel })) }
        : g));
  }, [content, site, graceLabel]);

  // 교회 소식처럼 두 메뉴(교회소식·주보)에 같이 있는 페이지: 기본은 교회소식 메뉴로 보되, 그 메뉴에
  // 보여 줄 페이지가 교회 소식 하나뿐이면(칼럼·중보기도 없음) 탭이 있는 주보 메뉴로 봄
  // → 교회 소식 화면에서도 "교회 주보 · 교회 소식 · 온라인 주보" 탭이 보임
  const tabCount = (en: string) => groups.find((g) => g.en === en)?.pages.length || 0;
  const baseGroup = groupOf(key);
  const group = baseGroup && tabCount(baseGroup.en) <= 1
    ? (SITE_GROUPS.find((g) => g !== baseGroup && g.pages.some((p) => p.key === key) && tabCount(g.en) > 1) || baseGroup)
    : baseGroup;
  const page = pageOf(key);
  // 화면에 보이는 메뉴/페이지 이름(교육부서는 교회가 정한 이름으로)
  // 상단 메뉴 선택 표시는 페이지 원래 소속(교회 소식 → "교회소식")으로. 아래 탭은 위 group 기준(주보 탭)
  const navGroup = baseGroup;
  const groupLabel = navGroup?.en === "EDUCATION" ? (content?.eduLabel || navGroup.label) : navGroup?.en === "GRACE" ? graceLabel : navGroup?.label;
  // /bulletins/주보ID 는 온라인(모바일) 주보 보기라서 "교회 주보"(이미지·PDF 파일) 탭이 아니라 "온라인 주보" 탭으로 보이게
  // 교회 주보(올린 파일) 상세는 /bulletins/{교회 주보 id} — 이때는 "교회 주보" 탭(2026-11-17)
  const paperDetail = key === "bulletins" && !!id && !!content?.paperBulletins.some((x) => x.id === id);
  const onlineBulletin = key === "bulletins" && !!id && !paperDetail;
  // 주일학교 부서별 화면(/education/1 …)은 제목을 부서 이름으로
  const eduDept = key === "education" && id ? content?.eduDepartments[Number(id) - 1] : undefined;
  const pageLabel = onlineBulletin ? "온라인 주보" : eduDept ? eduDept.name : key === "education" ? (content?.eduLabel || page?.label) : key === "grace" ? graceLabel : page?.label;

  useEffect(() => {
    if (!content || preview) return;
    document.title = key === "home"
      ? (site.metaTitle || `${content.churchName} | STAYON`)
      : `${pageLabel || ""} | ${content.churchName}`;
  }, [content, key, page, preview, site.metaTitle]);

  if (!content) return null;
  const c = content;
  const color = c.primaryColor;
  // /bulletins/주보ID 는 설교 목록에서 여는 온라인 주보 상세라, 교회 주보 파일이 없어도 열림
  const visible = key === "home" || hasPage(key, c, site) || (key === "bulletins" && !!id);

  return (
    <div className="min-h-screen w-full flex flex-col bg-white text-gray-800" style={{ wordBreak: "keep-all" }}>
      {/* 상단 메뉴 */}
      <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur border-b border-gray-100">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4 px-4 sm:px-8 h-16">
          <A to="/" className="flex items-center gap-2 min-w-0">
            {c.logoUrl ? (
              // 로고가 있을 때: 기본은 로고만, "같이 표시"를 켠 교회는 교단 마크 | 로고
              <span className="flex items-center gap-3 min-w-0">
                {c.denominationWithLogo && c.denomination && (
                  <>
                    <img src={denominationLogoSrc(c.denomination.id)} alt={c.denomination.name} className="h-9 w-9 sm:h-10 sm:w-10 object-contain shrink-0"
                      onError={(e) => { e.currentTarget.style.display = "none"; }} />
                    <span aria-hidden className="h-6 w-px bg-gray-200 shrink-0" />
                  </>
                )}
                <img src={c.logoUrl} alt={c.churchName} className="h-8 sm:h-9 object-contain min-w-0" />
              </span>
            ) : (
              // 직접 올린 로고가 없으면: 교단 마크 + 교회 이름 + 교단명(작게)
              <span className="flex items-center gap-2.5 min-w-0">
                {c.denomination && (
                  <img src={denominationLogoSrc(c.denomination.id)} alt={c.denomination.name} className="h-9 w-9 sm:h-10 sm:w-10 object-contain shrink-0"
                    onError={(e) => { e.currentTarget.style.display = "none"; }} />
                )}
                <span className="min-w-0 leading-tight">
                  <span className="block font-black text-base sm:text-lg text-gray-900 truncate">{c.churchName}</span>
                  {/* 화면에는 "(합동)" 같은 교단 구분 없이 큰 이름만(선택 목록에서는 구분해서 보여줌) */}
                  {c.denomination && <span className="block text-[11px] sm:text-xs text-gray-500 truncate">{denominationDisplayName(c.denomination, c.denominationFullName)}</span>}
                </span>
              </span>
            )}
          </A>
          <DesktopNav groups={groups} activeLabel={groupLabel} color={color} A={A} />
          <button className="md:hidden p-2 -mr-2 text-gray-700" aria-label="메뉴 열기" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
            <span className="block w-5 h-0.5 bg-current mb-1.5" /><span className="block w-5 h-0.5 bg-current mb-1.5" /><span className="block w-5 h-0.5 bg-current" />
          </button>
        </div>
      </header>

      {/* 휴대폰 메뉴: 오른쪽에서 밀려 나와 화면을 덮는 패널(어두운 바깥을 누르거나 X로 닫음).
          헤더 밖에 둬야 화면 전체 기준으로 덮임(헤더의 흐림 효과 안에 있으면 헤더 크기로 갇힘) */}
      <div className={`md:hidden fixed inset-0 z-50 ${menuOpen ? "" : "pointer-events-none"}`} aria-hidden={!menuOpen}>
        <div onClick={() => setMenuOpen(false)} className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${menuOpen ? "opacity-100" : "opacity-0"}`} />
        <nav role="dialog" aria-modal="true" aria-label="메뉴"
          // 그림자는 열렸을 때만(2026-11-19) — 닫혀 있어도 화면 오른쪽 밖 패널의 그림자가 비쳐 모든 화면 오른쪽 끝이 뿌옇게 보였음
          className={`absolute right-0 top-0 flex h-full w-[84%] max-w-[340px] flex-col bg-white transition-[transform,box-shadow] duration-300 ease-out ${menuOpen ? "translate-x-0 shadow-2xl" : "translate-x-full shadow-none"}`}>
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-gray-100 px-5">
            <span className="truncate text-base font-black text-gray-900">{c.churchName}</span>
            <button type="button" aria-label="메뉴 닫기" onClick={() => setMenuOpen(false)} className="-mr-2 flex h-10 w-10 items-center justify-center rounded-full text-gray-500 active:bg-gray-100">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-10">
            {groups.map((g) => {
              const label = g.en === "EDUCATION" ? (content?.eduLabel || g.label) : g.label;
              return (
                <div key={g.label} className="border-b border-gray-100 py-5 last:border-b-0">
                  <p className="text-[17px] font-black text-gray-900">{label}</p>
                  <ul className="mt-2">
                    {g.pages.map((p) => {
                      const on = current === p.path;
                      return (
                        <li key={p.path}>
                          <A to={p.path} className="flex items-center justify-between rounded-lg py-2.5 text-[15px] font-semibold active:bg-gray-50"
                            style={{ color: on ? color : "#4B5563" }}>
                            <span>{p.label}</span>
                            <svg viewBox="0 0 24 24" className="h-4 w-4 text-gray-300" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m9 18 6-6-6-6" /></svg>
                          </A>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </nav>
      </div>

      {/* 페이지를 옮길 때마다 가운데 내용만 부드럽게 나타남(디졸브). 상단 메뉴·하단은 그대로 */}
      <div key={current} className="flex-1 animate-in fade-in slide-in-from-bottom-1 duration-300 ease-out">
      {key === "home" ? (
        <HomePage c={c} color={color} A={A} groups={groups} />
      ) : (
        <>
          {/* 페이지 제목 띠 — 편집 화면 "화면 위쪽 배너" 설정(utils/pageBanners.ts)
              사진: 교회가 올린 사진 → 없으면 기본 사진(public/page-banners) → 그것도 없으면(칼럼·중보기도) 교회 색 투톤
              색상: 고른 두 색 그라데이션 / 끄기: 예전 옅은 띠 */}
          {(() => {
            const photo = c.bannerMode === "photo" ? (c.bannerPhotos[key] || defaultBannerPhoto(key)) : "";
            if (c.bannerMode === "off") {
              return (
                <section className="w-full" style={{ background: `${color}0d` }}>
                  <div className="max-w-6xl mx-auto px-4 sm:px-8 py-10 sm:py-14">
                    <p className="text-xs font-black tracking-[0.2em]" style={{ color }}>{group?.en}</p>
                    <h1 className="mt-2 text-3xl sm:text-4xl font-black text-gray-900">{pageLabel}</h1>
                    <p className="mt-3 text-xs text-gray-400"><A to="/" className="hover:underline">홈</A> › {pageLabel}</p>
                  </div>
                </section>
              );
            }
            const [c1, c2] = resolveBannerColors(c.bannerMode === "color" ? c.bannerColors : null, color);
            const dark = !photo && bannerTextIsDark(c1, c2);
            return (
              <section className="relative w-full overflow-hidden" style={{ background: `linear-gradient(120deg, ${c1}, ${c2})` }}>
                {photo && (
                  <>
                    <div className="absolute inset-0 bg-cover bg-center animate-[bannerZoom_1.6s_ease-out_both]" style={{ backgroundImage: `url(${photo})` }} />
                    <div className="absolute inset-0 bg-black/25" />
                  </>
                )}
                <div className="relative max-w-6xl mx-auto px-4 sm:px-8 flex flex-col items-center justify-center text-center h-[170px] sm:h-[230px] lg:h-[280px]">
                  <p className={`text-[11px] sm:text-xs font-bold tracking-[0.3em] ${dark ? "text-gray-700" : "text-white/85"}`}>{group?.en}</p>
                  <h1 className={`mt-2 sm:mt-3 text-2xl sm:text-4xl lg:text-[42px] font-black break-keep ${dark ? "text-gray-900" : "text-white drop-shadow-sm"}`}>{pageLabel}</h1>
                  <p className={`mt-2 sm:mt-3 text-[11px] sm:text-xs ${dark ? "text-gray-600" : "text-white/70"}`}><A to="/" className="hover:underline">홈</A> › {pageLabel}</p>
                </div>
                <style>{`@keyframes bannerZoom{from{transform:scale(1.06)}to{transform:scale(1)}}`}</style>
              </section>
            );
          })()}
          <main className="max-w-6xl mx-auto px-4 sm:px-8 py-8 sm:py-12">
            {/* 탭은 화면이 2개 이상인 메뉴에만. 앨범·게시판은 1개여도 탭 하나를 보여 줌(2026-11-24) — 주보 화면처럼
                검색창 위가 비어 보이지 않게 */}
            {group && group.en !== "EDUCATION" && ((groups.find((g) => g.en === group.en)?.pages.length || 0) > 1 || group.en === "ALBUM" || group.en === "GRACE") && (
              <SubTabs pages={groups.find((g) => g.en === group.en)!.pages} activeKey={onlineBulletin ? "jubo" : key} color={color} A={A} shortBar={group.en === "BULLETIN" || group.en === "ALBUM" || group.en === "GRACE"} />
            )}
            {visible
              ? <PageBody pageKey={key} id={id} c={c} site={site} color={color} A={A} />
              : <p className="py-16 text-center text-gray-400">준비 중인 페이지입니다.</p>}
          </main>
        </>
      )}
      </div>

      {/* 하단 — 내용이 짧아도 항상 화면 맨 아래에 붙음(위 flex-1) */}
      <footer className="w-full mt-12 px-4 sm:px-8 py-10" style={{ background: color }}>
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-end justify-between gap-4 text-white/70 text-xs">
          <div className="space-y-1">
            <p className="text-white font-bold text-base">{c.churchName}</p>
            {c.address && <p>{c.address} {c.addressDetail}</p>}
            {(c.phone || c.email) && <p>{[c.phone, c.email].filter(Boolean).join(" · ")}</p>}
          </div>
          {/* 오른쪽: SNS 아이콘 버튼(2026-11-21, 글자 "유튜브" 대신) + 저작권 */}
          <div className="flex flex-col gap-4 sm:items-end">
            {c.sns.length > 0 && (
              <div className="flex flex-wrap gap-2.5">
                {c.sns.map((x) => <SnsButton key={x.url} label={x.label} url={x.url} />)}
              </div>
            )}
            <p className="text-white/50">© {new Date().getFullYear()} {c.churchName} · Powered by STAYON</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

// 푸터 SNS 버튼(2026-11-21): 흰 동그라미 + 각 서비스 마크. 마우스를 올리면 살짝 떠오르고, 누르면 살짝 눌림
function SnsButton({ label, url }: { label: string; url: string }) {
  const icon = label === "유튜브" ? (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" aria-hidden>
      <path fill="#FF0000" d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8Z" />
      <path fill="#fff" d="m9.6 15.6 6.3-3.6-6.3-3.6v7.2Z" />
    </svg>
  ) : label === "인스타그램" ? (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden fill="none" stroke="#E1306C" strokeWidth="2.2">
      <rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4.2" /><circle cx="17.4" cy="6.6" r="1.1" fill="#E1306C" stroke="none" />
    </svg>
  ) : label === "네이버 블로그" ? (
    <span className="flex h-5 w-5 items-center justify-center rounded-[5px] bg-[#03C75A] text-[11px] font-black text-white">b</span>
  ) : label === "스레드" ? (
    <span className="text-[17px] font-black leading-none text-[#111]">@</span>
  ) : (
    <span className="text-[13px] font-black text-gray-700">{label.slice(0, 1)}</span>
  );
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" aria-label={label} title={label}
      className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.12)] transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-[0_6px_16px_rgba(0,0,0,0.18)] active:scale-95">
      {icon}
    </a>
  );
}

// 상단 메뉴(PC). 회색 배경 하나가 마우스를 따라 스르륵 미끄러지고, 메뉴를 벗어나면 지금 페이지 메뉴로 돌아감.
// 하위 메뉴는 살짝 내려오며 부드럽게 나타남
function DesktopNav({ groups, activeLabel, color, A }: { groups: GroupDef[]; activeLabel?: string; color: string; A: LinkComp }) {
  const navRef = useRef<HTMLElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [hover, setHover] = useState<number | null>(null);
  const [pill, setPill] = useState<{ left: number; width: number; show: boolean }>({ left: 0, width: 0, show: false });
  const activeIdx = groups.findIndex((g) => g.label === activeLabel);
  const target = hover ?? (activeIdx >= 0 ? activeIdx : null);

  useLayoutEffect(() => {
    const el = target === null ? null : itemRefs.current[target];
    if (!el) { setPill((p) => ({ ...p, show: false })); return; }
    setPill({ left: el.offsetLeft, width: el.offsetWidth, show: true });
  }, [target, groups]);

  return (
    <nav ref={navRef} className="relative hidden md:flex items-center gap-1" onMouseLeave={() => setHover(null)}>
      <span aria-hidden className="absolute top-1/2 -translate-y-1/2 h-10 rounded-lg bg-gray-100 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ left: pill.left, width: pill.width, opacity: pill.show ? 1 : 0 }} />
      {groups.map((g, i) => (
        <div key={g.label} ref={(el) => { itemRefs.current[i] = el; }} className="relative group" onMouseEnter={() => setHover(i)}>
          <A to={g.en === "EDUCATION" ? "/education" : g.pages[0].path} className="relative z-10 block px-4 py-2 text-[15px] font-bold transition-colors duration-200" style={{ color: activeLabel === g.label ? color : "#374151" }}>
            {g.label}
          </A>
          {g.pages.length > 1 && (
            <div className="absolute left-1/2 -translate-x-1/2 top-full pt-2 z-20 invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-[opacity,visibility] duration-200">
              {/* 패널은 위에서부터 살짝 펼쳐지고, 항목은 위에서부터 하나씩 차례로 내려옴 */}
              <div className="min-w-[160px] origin-top rounded-xl border border-gray-100 bg-white shadow-lg p-1.5 scale-y-90 -translate-y-1 group-hover:scale-y-100 group-hover:translate-y-0 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]">
                {g.pages.map((p, j) => (
                  <div key={p.path} className="opacity-0 -translate-y-1.5 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 ease-out" style={{ transitionDelay: `${60 + j * 45}ms` }}>
                    <A to={p.path} className="block rounded-lg px-3.5 py-2 text-sm text-gray-600 whitespace-nowrap transition-colors duration-150 hover:bg-gray-50 hover:text-gray-900">{p.label}</A>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </nav>
  );
}

// 페이지 안 메뉴(교회 소개 / 담임목사 인사말 …): 밑줄 탭. 선택된 탭 밑줄이 옆으로 스르륵 이동
// shortBar: 선택 밑줄을 탭 폭의 절반으로(가운데). 주보 탭(교회 주보·교회 소식·온라인 주보)에서 씀
function SubTabs({ pages, activeKey, color, A, shortBar }: { pages: PageDef[]; activeKey: PageKey; color: string; A: LinkComp; shortBar?: boolean }) {
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const [bar, setBar] = useState<{ left: number; width: number }>({ left: 0, width: 0 });
  const idx = pages.findIndex((p) => p.key === activeKey);
  useLayoutEffect(() => {
    const el = refs.current[idx];
    if (el) setBar(shortBar
      ? { left: el.offsetLeft + el.offsetWidth / 4, width: el.offsetWidth / 2 }
      : { left: el.offsetLeft, width: el.offsetWidth });
  }, [idx, pages, shortBar]);
  return (
    <div className="mb-5 md:mb-10 -mx-4 sm:mx-0 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
      <div className="relative flex min-w-max border-b border-gray-200 px-4 sm:px-0">
        {pages.map((p, i) => (
          <div key={p.key} ref={(el) => { refs.current[i] = el; }}>
            <A to={p.path} className={`block px-4 sm:px-6 py-4 text-[15px] sm:text-base font-bold whitespace-nowrap transition-colors duration-200 ${p.key === activeKey ? "" : "text-gray-500 hover:text-gray-900"}`} style={p.key === activeKey ? { color } : undefined}>
              {p.label}
            </A>
          </div>
        ))}
        <span aria-hidden className="absolute -bottom-px h-[3px] rounded-full transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ left: bar.left, width: bar.width, background: color, opacity: idx >= 0 ? 1 : 0 }} />
      </div>
    </div>
  );
}

// 섬기는 사람들: 직분별 묶음 + 정해진 순서. "담임 목사"/"담임목사"처럼 띄어쓰기만 다른 건 같은 직분으로 봄
const ROLE_ORDER = ["담임목사", "부목사", "강도사", "전도사"];
function staffGroups(staff: SiteContent["staff"]) {
  const groups: { key: string; role: string; people: SiteContent["staff"] }[] = [];
  staff.forEach((p) => {
    const role = p.role || "교역자";
    const key = role.replace(/\s+/g, "");
    let g = groups.find((x) => x.key === key);
    if (!g) { g = { key, role, people: [] }; groups.push(g); }
    g.people.push(p);
  });
  const rank = (k: string) => { const i = ROLE_ORDER.indexOf(k); return i < 0 ? ROLE_ORDER.length : i; };
  return groups.sort((a, z) => rank(a.key) - rank(z.key));
}

type LinkComp = (p: { to: string; className?: string; style?: React.CSSProperties; children: React.ReactNode }) => React.ReactElement;

const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`rounded-2xl border border-gray-100 bg-white p-5 sm:p-6 shadow-sm ${className}`}>{children}</div>
);
const H2 = ({ children }: { children: React.ReactNode }) => <h2 className="text-lg sm:text-xl font-black text-gray-900 mb-4">{children}</h2>;

// 첫 화면 배너 사진: 1장이면 고정, 2장 이상이면 5초마다 자동으로 넘김(슬라이드 / 디졸브)
// 메인 사진 슬라이드: 5초마다 자동으로 넘어가고, 직접 고를 수도 있음
//  - PC: 사진에 마우스를 올리면 양옆 ‹ › 버튼, 오른쪽 아래 점(●)을 눌러 원하는 사진으로 바로
//  - 휴대폰: 손가락으로 옆으로 밀면 다음/이전 사진(손가락을 따라 옆으로 넘어감, 디졸브 없음)
//  - 직접 넘기면 자동 넘김 5초를 처음부터 다시 셈
function HeroImages({ images, mode, alt }: { images: string[]; mode: "slide" | "fade"; alt: string }) {
  const n = images.length;
  const [idx, setIdx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [mobile, setMobile] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches);
  // 손가락 위치는 화면을 다시 그리지 않고(렉 없이) 슬라이드 줄(track)의 위치만 바로 바꿈
  const touch = useRef<{ x: number; y: number; dx: number; dir: "" | "h" | "v" } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const on = () => setMobile(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  useEffect(() => { setIdx(0); }, [n]);
  // 자동 넘김: 사진이 바뀔 때마다(직접 넘겨도) 5초를 다시 셈. 손가락으로 끄는 중엔 멈춤
  useEffect(() => {
    if (n < 2 || dragging) return;
    const t = setTimeout(() => setIdx((i) => (i + 1) % n), 5000);
    return () => clearTimeout(t);
  }, [idx, n, dragging]);
  if (n === 0) return null;
  const go = (i: number) => setIdx(((i % n) + n) % n);
  // 휴대폰은 언제나 옆으로 넘기는 방식(편집 화면에서 "서서히 바뀜"을 골랐어도)
  const slide = mode !== "fade" || mobile;
  const place = (i: number, px: number, animate: boolean) => {
    const el = track.current;
    if (!el) return;
    el.style.transition = animate ? "transform 450ms cubic-bezier(0.22, 1, 0.36, 1)" : "none";
    el.style.transform = `translate3d(calc(-${i * 100}% + ${px}px), 0, 0)`;
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (n < 2 || !slide) return;
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, dx: 0, dir: "" };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const tc = touch.current;
    if (!tc) return;
    const mx = e.touches[0].clientX - tc.x;
    const my = e.touches[0].clientY - tc.y;
    if (!tc.dir) {
      if (Math.abs(mx) < 6 && Math.abs(my) < 6) return;
      tc.dir = Math.abs(mx) > Math.abs(my) ? "h" : "v"; // 위아래로 움직이면 화면 스크롤로 둠
      if (tc.dir === "h") setDragging(true);
    }
    if (tc.dir !== "h") return;
    tc.dx = mx;
    place(idx, mx, false);
  };
  const onTouchEnd = () => {
    const tc = touch.current;
    touch.current = null;
    if (!tc || tc.dir !== "h") return;
    const w = box.current?.offsetWidth || window.innerWidth;
    const next = tc.dx < -w * 0.15 ? (idx + 1) % n : tc.dx > w * 0.15 ? (idx - 1 + n) % n : idx;
    place(next, 0, true);
    setIdx(next);
    setDragging(false);
  };

  const img = (src: string) => (
    <img src={src} alt={alt} draggable={false} className="absolute inset-0 w-full h-full object-cover select-none pointer-events-none" />
  );
  return (
    <>
      <div ref={box} className="absolute inset-0 overflow-hidden" style={{ touchAction: "pan-y" }}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
        {slide ? (
          <div ref={track} className="absolute inset-0 flex will-change-transform"
            style={{ transform: `translate3d(-${idx * 100}%, 0, 0)`, transition: dragging ? "none" : "transform 700ms ease-in-out" }}>
            {images.map((src) => (
              <div key={src} className="relative w-full h-full shrink-0 overflow-hidden">{img(src)}</div>
            ))}
          </div>
        ) : (
          images.map((src, i) => (
            <div key={src} className="absolute inset-0 overflow-hidden transition-opacity duration-[1200ms] ease-in-out" style={{ opacity: i === idx ? 1 : 0 }}>
              {img(src)}
            </div>
          ))
        )}
      </div>
      {n > 1 && (
        <>
          {/* PC: 사진에 마우스를 올리면 양옆 이전/다음 버튼 */}
          {(["prev", "next"] as const).map((k) => (
            <button key={k} type="button" aria-label={k === "prev" ? "이전 사진" : "다음 사진"} onClick={() => go(idx + (k === "prev" ? -1 : 1))}
              className={`hidden sm:flex absolute z-10 top-1/2 -translate-y-1/2 ${k === "prev" ? "left-5" : "right-5"} h-12 w-12 items-center justify-center rounded-full bg-black/30 text-white text-2xl backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/50`}>
              {k === "prev" ? "‹" : "›"}
            </button>
          ))}
          {/* 점: 누르면 그 사진으로 바로(누르기 쉽게 터치 영역을 넉넉히) */}
          <div className="absolute z-10 bottom-4 right-4 sm:bottom-7 sm:right-7 flex">
            {images.map((_, i) => (
              <button key={i} type="button" aria-label={`${i + 1}번째 사진`} onClick={() => go(i)} className="flex h-6 items-center px-1">
                <span className={`block h-2 rounded-full transition-all ${i === idx ? "w-6 bg-white" : "w-2 bg-white/50 hover:bg-white/80"}`} />
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}

// 오시는 길 지도 미리보기: API 키가 필요 없는 구글 지도 임베드(주소로 검색). 주소가 없으면 틀만 보임.
// 나중에 네이버·카카오 지도(API 키 필요)로 바꿀 때는 이 부품만 교체하면 오시는 길·교회 소개 둘 다 바뀜
function MapPreview({ c, color, className = "" }: { c: SiteContent; color: string; className?: string }) {
  return (
    <div className={`relative w-full overflow-hidden rounded-[20px] ${className}`} style={{ background: `linear-gradient(160deg, ${color}10 0%, ${color}2e 100%)` }}>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-6">
        <svg viewBox="0 0 24 24" className="w-10 h-10" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" />
        </svg>
        <p className="text-sm font-bold" style={{ color }}>{c.address ? "지도를 불러오는 중…" : "주소를 입력하면 지도가 표시돼요"}</p>
      </div>
      {c.address && (
        <iframe
          title={`${c.churchName} 위치 지도`}
          src={`https://maps.google.com/maps?q=${encodeURIComponent(c.address)}&hl=ko&z=16&output=embed`}
          className="absolute inset-0 w-full h-full border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
        />
      )}
    </div>
  );
}

// 네이버 지도 / 카카오맵 바로가기: 같은 크기 두 칸, 흰 바탕 + 회색 테두리, 앞에 각 서비스 색 마크
// 교회가 빌더에서 직접 넣은 값이 있으면 그걸로(2026-11-21): http… 링크면 그 링크 그대로, 글자면 그 글자로 검색. 없으면 주소로 검색
function MapButtons({ address, naver = "", kakao = "", className = "" }: { address: string; naver?: string; kakao?: string; className?: string }) {
  const isLink = (v: string) => /^https?:\/\//i.test(v.trim());
  const pick = (own: string, search: (q: string) => string) => isLink(own) ? own.trim() : search(own.trim() || address);
  const items = [
    { href: pick(naver, (q) => `https://map.naver.com/p/search/${encodeURIComponent(q)}`), label: "네이버 지도", mark: "N", bg: "#03C75A", fg: "#FFFFFF" },
    { href: pick(kakao, (q) => `https://map.kakao.com/?q=${encodeURIComponent(q)}`), label: "카카오맵", mark: "K", bg: "#FEE500", fg: "#191919" },
  ];
  return (
    <div className={`grid grid-cols-2 gap-2.5 ${className}`}>
      {items.map((it) => (
        <a key={it.label} href={it.href} target="_blank" rel="noopener noreferrer"
          className="flex h-12 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white text-[15px] font-bold text-gray-800 transition-colors hover:border-gray-300 hover:bg-gray-50">
          <span className="flex h-6 w-6 items-center justify-center rounded-md text-xs font-black" style={{ background: it.bg, color: it.fg }}>{it.mark}</span>
          {it.label}
        </a>
      ))}
    </div>
  );
}

// 메인 바로가기 카드: 둥근 교회색 아이콘 · 영문 라벨 · 선 · 굵은 제목 · 짧은 설명. 카드 전체를 누르면 이동.
// PC 4칸 / 태블릿·모바일 2칸
function QuickCards({ c, color, A }: { c: SiteContent; color: string; A: LinkComp }) {
  const name = c.churchName;
  // 문구: 홈페이지 편집 화면 > 홈 화면에서 고른/직접 입력한 문구(없으면 기본 문구). {교회} → 교회 이름
  const t = (i: number) => homeCardText(c.homeCards, i, name);
  const all: { icon: React.ReactNode; en: string; title: string; desc: string; to: string; external?: boolean }[] = [
    { icon: <HandHeart className="w-7 h-7" />, en: "Welcome !", ...t(0), to: "/about" },
    { icon: <Church className="w-7 h-7" />, en: "Worship service", ...t(1), to: "/worship" },
    // 유튜브 채널이 없으면 온라인 예배 페이지로
    { icon: <Youtube className="w-7 h-7" />, en: "Youtube Channel", ...t(2), to: c.youtubeLink || "/sermons/live", external: !!c.youtubeLink },
    { icon: <Car className="w-7 h-7" />, en: "Location", ...t(3), to: "/location" },
  ];
  // 편집 화면에서 OFF로 끈 카드는 아예 안 보여 줌(2026-11-19)
  // 갈 페이지에 내용이 없는 카드도 숨김(예: 예배 시간 미입력 → 예배 카드 없음, 2026-11-22)
  const items = all.filter((it, i) => !homeCardHidden(c.homeCards, i) && (it.external || homeTargetReady(it.to, c)));
  if (!items.length) return null;
  // 휴대폰(2026-11-19): 두 칸 카드는 글자가 너무 좁게 꺾여 읽기 어려워서 한 줄에 하나씩 —
  // 왼쪽 아이콘 + 오른쪽 영어 이름·제목·설명 + 오른쪽 끝 화살표. 태블릿 이상(sm~)은 예전 카드 그대로
  const cls = "group flex items-center gap-4 sm:block h-full rounded-[20px] border border-gray-200 bg-white p-5 sm:p-7 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:border-transparent";
  const body = (it: typeof items[number]) => (
    <>
      <span className="flex h-12 w-12 sm:h-16 sm:w-16 shrink-0 items-center justify-center rounded-full text-white [&>svg]:w-6 [&>svg]:h-6 sm:[&>svg]:w-7 sm:[&>svg]:h-7" style={{ background: color }}>{it.icon}</span>
      <span className="block min-w-0 flex-1">
        <span className="block text-xs sm:mt-5 sm:text-[15px] font-bold" style={{ color }}>{it.en}</span>
        <span className="hidden sm:block mt-3 h-px bg-gray-200" />
        <span className="block mt-0.5 sm:mt-4 text-base sm:text-lg font-black text-gray-900 break-keep">{it.title}</span>
        <span className="block mt-1 sm:mt-2 text-[13px] sm:text-sm leading-relaxed text-gray-500 break-keep line-clamp-2 sm:line-clamp-none">{it.desc}</span>
      </span>
      <svg viewBox="0 0 24 24" className="sm:hidden h-5 w-5 shrink-0 text-gray-300" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m9 18 6-6-6-6" /></svg>
    </>
  );
  return (
    // 남은 카드 수만큼 PC 칸 수를 맞춤(3개면 3칸으로 꽉 차게, 빈칸 없이)
    <div className={`grid grid-cols-1 gap-3 sm:gap-5 ${items.length === 1 ? "" : items.length === 3 ? "sm:grid-cols-2 lg:grid-cols-3" : items.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-4"}`}>
      {items.map((it) => it.external
        ? <a key={it.en} href={it.to} target="_blank" rel="noopener noreferrer" className={cls}>{body(it)}</a>
        : <A key={it.en} to={it.to} className={cls}>{body(it)}</A>)}
    </div>
  );
}

// 메인 환영 섹션: 담임목사 인사말 페이지와 같은 사진 스타일(교회색을 아주 연하게 깐 둥근 패널).
// 오른쪽은 인사 문구 + 바로가기 4개(교회 소개 · 예배 시간 및 장소 · 유튜브 · 찾아오시는 길). 사진이 없으면 오른쪽만 가운데로
function WelcomeSection({ c, color, A }: { c: SiteContent; color: string; A: LinkComp }) {
  const name = c.churchName;
  const p = c.pastor;
  // 인사 문구: 담임목사 인사말 본문 → 교회 소개 (제목 칸은 "담임목사 인사말" 같은 이름만 있는 경우가 많아 쓰지 않음)
  const greet = (p?.greeting || c.intro || "").trim();
  const short = greet.length > 140 ? greet.slice(0, 140).trim() + "…" : greet;
  const links: { en: string; title: string; desc: string; to: string; external?: boolean }[] = [
    { en: "ABOUT", title: "교회 소개", desc: "교회의 비전과 섬기는 사람들을 소개합니다.", to: "/about" },
    { en: "WORSHIP", title: "예배 시간 및 장소 안내", desc: "주일과 주중 예배 시간·장소를 안내합니다.", to: "/worship" },
    c.youtubeLink
      // 교회 이름을 앞에 붙이면 긴 이름(통영베다니감리교회 등)은 두 줄로 넘어가서 "유튜브 채널"만(위에 YOUTUBE 표시도 있음)
      ? { en: "YOUTUBE", title: "유튜브 채널", desc: "멀리서도 함께 예배드릴 수 있어요.", to: c.youtubeLink, external: true }
      : { en: "ONLINE", title: "온라인 예배", desc: "멀리서도 함께 예배드릴 수 있어요.", to: "/sermons/live" },
    { en: "LOCATION", title: "찾아오시는 길", desc: "교회 위치와 오시는 방법을 안내합니다.", to: "/location" },
  ];
  const rowCls = "group flex items-center gap-4 py-5 border-b border-gray-200/70 transition-colors";
  const row = (l: typeof links[number]) => (
    <>
      <span className="w-1 self-stretch rounded-full transition-colors" style={{ background: `${color}33` }} />
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-black tracking-[0.2em]" style={{ color }}>{l.en}</span>
        <span className="mt-1 block text-lg font-black text-gray-900 break-keep group-hover:underline underline-offset-4">{l.title}</span>
        <span className="mt-0.5 block text-sm text-gray-500 break-keep">{l.desc}</span>
      </span>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 transition-all group-hover:text-white group-hover:border-transparent group-hover:translate-x-0.5"
        onMouseEnter={(e) => { e.currentTarget.style.background = color; }} onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}>→</span>
    </>
  );
  return (
    // 위 바로가기 카드와 구분되게: 화면 전체 폭으로 교회색을 아주 연하게 깐 띠 배경(위아래 여백 넉넉히)
    <section className="w-full mt-12 sm:mt-16 py-14 sm:py-20" style={{ background: /^#[0-9a-f]{6}$/i.test(color) ? `${color}0A` : "#F8FAFC" }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-8">
      <h2 className="text-center text-2xl sm:text-4xl font-black tracking-tight text-gray-900 break-keep">{name}에 오신 것을 환영합니다</h2>
      <div className="mx-auto mt-4 h-1 w-10 rounded-full" style={{ background: color }} />
      <div className={`mt-10 sm:mt-14 grid gap-10 lg:gap-16 items-center ${p?.photoUrl ? "md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]" : "max-w-2xl mx-auto"}`}>
        {p?.photoUrl && (
          <div className="mx-auto w-full max-w-[260px] sm:max-w-[380px]">
            <div className="overflow-hidden rounded-[28px]" style={{ background: `linear-gradient(160deg, ${color}10 0%, ${color}2e 100%)` }}>
              <img src={p.photoUrl} alt={p.name} className="block w-full aspect-[4/5] object-cover object-top mix-blend-multiply" />
            </div>
          </div>
        )}
        <div>
          {short && <p className="text-[15px] sm:text-base leading-[1.9] text-gray-600 break-keep whitespace-pre-line">{short}</p>}
          <div className={short ? "mt-6 border-t border-gray-200/70" : "border-t border-gray-200/70"}>
            {links.filter((l) => l.external || homeTargetReady(l.to, c)).map((l) => l.external
              ? <a key={l.en} href={l.to} target="_blank" rel="noopener noreferrer" className={rowCls}>{row(l)}</a>
              : <A key={l.en} to={l.to} className={rowCls}>{row(l)}</A>)}
          </div>
        </div>
      </div>
      </div>
    </section>
  );
}

// 메인 "주보 · 교회 소식": 왼쪽 주보(이번 주 주보 강조 + 지난 주보) / 오른쪽 교회 소식. 각 제목 옆 more +
function BulletinNewsSection({ c, color, A }: { c: SiteContent; color: string; A: LinkComp }) {
  // 왼쪽 = 교회가 올린 주보 파일(이미지·PDF, "교회 주보" 탭) / 오른쪽 = 교회 소식.
  // 두 칸 높이가 같도록 똑같은 모양: 맨 위 강조 칸 1개 + 목록 4줄
  const files = c.paperBulletins;
  const news = c.news;
  const [paperView, setPaperView] = useState<"list" | "grid">("list");
  const fmt = (d: string) => d.replace(/-/g, ".");
  // 소식 제목: "2026. 11. 29 교회 소식" (날짜가 없으면 1번 소식 제목)
  const newsTitle = (n: SiteContent["news"][number]) => n.date ? `${n.date.replace(/-/g, ". ")} 교회 소식` : (n.items.map((i) => i.title).filter(Boolean).join(" · ") || "교회 소식");
  const newsSub = (n: SiteContent["news"][number]) => { const t = n.items.map((i) => i.title).filter(Boolean); return t.length ? `${t[0]}${t.length > 1 ? ` 외 ${t.length - 1}건` : ""}` : ""; };
  const tint = /^#[0-9a-f]{6}$/i.test(color) ? `${color}0F` : "#F8FAFC";
  // to가 비어 있으면 more + 없이 제목만(갈 페이지에 내용이 없을 때, 2026-11-22)
  const Head = ({ word, to }: { word: string; to: string }) => (
    <div className="flex items-end justify-between gap-3 pb-4 border-b-2 border-gray-900">
      {/* 교회 이름은 홈페이지에 저장된 이름 그대로. 이름이 "…교회"로 끝나지 않으면 "교회"를 붙여 "○○ 교회 소식"처럼 */}
      <h3 className="text-xl sm:text-2xl font-black tracking-tight text-gray-900 break-keep">{c.churchName}{/교회$/.test(c.churchName.trim()) ? "" : " 교회"} <span style={{ color }}>{word}</span></h3>
      {to && <A to={to} className="shrink-0 text-sm font-bold text-gray-500 hover:text-gray-900">more +</A>}
    </div>
  );
  const Top = ({ badge, title, sub, action, to }: { badge: string; title: string; sub: string; action: string; to: string }) => (
    <A to={to} className="group mt-4 flex h-[104px] items-center justify-between gap-4 rounded-2xl px-5 transition-colors" style={{ background: tint }}>
      <span className="min-w-0">
        <span className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-black text-white" style={{ background: color }}>{badge}</span>
        <span className="mt-2 block truncate text-lg font-black text-gray-900 group-hover:underline underline-offset-4">{title}</span>
        <span className="mt-0.5 block truncate text-sm text-gray-500">{sub}</span>
      </span>
      <span className="shrink-0 text-sm font-bold" style={{ color }}>{action}</span>
    </A>
  );
  const Row = ({ text, date, to }: { text: string; date: string; to: string }) => (
    <li>
      <A to={to} className="flex h-14 items-center justify-between gap-3 border-b border-gray-100 hover:bg-gray-50/70 px-1">
        <span className="truncate text-[15px] font-bold text-gray-800">{text}</span>
        <span className="shrink-0 text-sm tabular-nums text-gray-400">{date}</span>
      </A>
    </li>
  );
  // 목록이 4줄보다 적으면 빈 줄로 채워 두 칸 높이를 항상 같게
  // 휴대폰(한 칸)에선 높이 맞출 옆 칸이 없어서 빈 줄은 숨기고, 빈 안내 상자도 낮게(2026-11-19 — 큰 빈 공간이 생겼음)
  const Pad = ({ n }: { n: number }) => <>{Array.from({ length: Math.max(0, n) }, (_, i) => <li key={`pad-${i}`} aria-hidden className="hidden md:block h-14 border-b border-gray-100" />)}</>;
  const Empty = ({ text }: { text: string }) => <p className="mt-4 flex h-28 md:h-[336px] items-center justify-center rounded-2xl bg-gray-50 px-5 text-center text-sm text-gray-400">{text}</p>;
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-8 py-14 sm:py-20">
      {/* [&>*]:min-w-0(2026-11-19): 휴대폰(한 칸)에서 긴 소식 제목이 칸을 1000px 넘게 늘려 화면 전체가 넓어지고,
          ≡ 메뉴가 화면 밖 오른쪽에서 열려 안 눌리는 것처럼 보였음 — 칸이 화면 폭을 넘지 않고 말줄임(…) 되게 */}
      <div className="grid gap-12 lg:gap-16 md:grid-cols-2 items-start [&>*]:min-w-0">
        <div>
          {/* 주보: 모두 "교회 주보" 목록(/bulletins)으로 */}
          <Head word="주보" to="/bulletins" />
          {/* (2026-11-17) 맨 위 최신 주보 NEW + 그 아래 지난 주보를 카드형/목록형으로 바꿔 보기. 누르면 바로 주보가 열림 */}
          {files.length ? (
            <>
              <A to={paperPath(files[0])} className="group mt-4 flex h-[104px] items-center justify-between gap-4 rounded-2xl px-5 transition-colors" style={{ background: tint }}>
                <span className="min-w-0">
                  <span className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-black text-white" style={{ background: color }}>NEW</span>
                  <span className="mt-2 block truncate text-lg font-black text-gray-900 group-hover:underline underline-offset-4">{files[0].title || `${fmt(files[0].date)} 주보`}</span>
                  <span className="mt-0.5 block truncate text-sm text-gray-500">{fmt(files[0].date)} · {fileLabel(files[0].fileType)}</span>
                </span>
                <span className="shrink-0 text-sm font-bold" style={{ color }}>주보 보기 →</span>
              </A>
              <div className="mt-3 flex justify-end">
                <div className="inline-flex rounded-xl bg-gray-100 p-0.5">
                  {([["list", ListIcon, "목록형으로 보기"], ["grid", LayoutGrid, "카드형으로 보기"]] as const).map(([v, Icon, label]) => (
                    <button key={v} type="button" onClick={() => setPaperView(v)} aria-label={label} title={label}
                      className={`flex h-8 w-9 items-center justify-center rounded-lg transition-all ${paperView === v ? "bg-white shadow-sm" : "text-gray-400 hover:text-gray-600"}`}
                      style={paperView === v ? { color } : undefined}>
                      <Icon className="h-4 w-4" />
                    </button>
                  ))}
                </div>
              </div>
              {paperView === "list" ? (
                <ul className="mt-1">{files.slice(1, 5).map((p) => (
                  <li key={p.id}>
                    <A to={paperPath(p)} className="flex h-14 items-center justify-between gap-3 border-b border-gray-100 hover:bg-gray-50/70 px-1">
                      <span className="truncate text-[15px] font-bold text-gray-800">{p.title || `${fmt(p.date)} 주보`}</span>
                      <span className="shrink-0 text-sm tabular-nums text-gray-400">{fmt(p.date)}</span>
                    </A>
                  </li>
                ))}<Pad n={4 - files.slice(1, 5).length} /></ul>
              ) : (
                <ul className="mt-1 grid grid-cols-2 gap-2">{files.slice(1, 5).map((p) => (
                  <li key={p.id}>
                    <A to={paperPath(p)} className="group flex h-[104px] flex-col justify-between rounded-xl border border-gray-100 bg-white p-3.5 transition hover:-translate-y-0.5 hover:shadow-md">
                      <span className="text-xs font-bold tabular-nums" style={{ color }}>{fmt(p.date)}</span>
                      <span className="line-clamp-2 text-sm font-bold text-gray-800 group-hover:underline underline-offset-2">{p.title || `${fmt(p.date)} 주보`}</span>
                      <span className="text-[11px] text-gray-400">{fileLabel(p.fileType)} · {openLabel(p.fileType)}</span>
                    </A>
                  </li>
                ))}{files.slice(1, 5).length === 0 && <li className="col-span-2 flex h-[104px] items-center justify-center rounded-xl bg-gray-50 text-sm text-gray-400">지난 주보가 없어요</li>}</ul>
              )}
            </>
          ) : <Empty text="아직 올린 교회 주보가 없습니다." />}
        </div>
        <div>
          <Head word="소식" to={homeTargetReady("/news", c) ? "/news" : ""} />
          {news.length ? (
            <>
              <Top badge="NEW" title={newsTitle(news[0])} sub={newsSub(news[0])} action="소식 보기 →" to={`/news/${news[0].id}`} />
              {/* 왼쪽 주보 칸의 카드형/목록형 버튼 줄과 높이를 맞추는 빈 줄(PC에서 두 칸 목록 줄이 나란히) */}
              <div aria-hidden className="mt-3 hidden h-9 md:block" />
              <ul className="mt-1">{news.slice(1, 5).map((n) => <Row key={n.id} text={newsTitle(n)} date={fmt(n.date)} to={`/news/${n.id}`} />)}<Pad n={4 - news.slice(1, 5).length} /></ul>
            </>
          ) : <Empty text="아직 등록된 교회 소식이 없습니다." />}
        </div>
      </div>
    </section>
  );
}

function HomePage({ c, color, A, groups }: { c: SiteContent; color: string; A: LinkComp; groups: GroupDef[] }) {
  const has = (k: PageKey) => groups.some((g) => g.pages.some((p) => p.key === k));
  const latest = c.bulletins.find((b) => b.id === c.latestBulletinId);
  return (
    <>
      {/* 메인 사진 높이 — 휴대폰: 화면 세로의 70%(최대 560px)
          PC: 화면 "너비" 기준으로 메인 사진 권장 비율(1920×812)에 맞춤(최소 420px·최대 820px).
          예전엔 PC도 창 세로의 78%라 창이 낮으면(탭·북마크 줄 등) 사진 위아래가 잘려 건물 꼭대기가 안 보였음(2026-11-12) */}
      <section className="group relative w-full h-[min(70vh,560px)] sm:h-[clamp(420px,42.3vw,820px)] flex items-end overflow-hidden" style={{ background: color }}>
        <HeroImages images={c.heroImages} mode={c.heroTransition} alt={c.churchName} />
        {/* 어두운 그라데이션·글자는 손가락 밀기·클릭을 막지 않게(pointer-events-none) */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
        {/* 글자 색: 홈페이지 편집 화면 > 메인 사진 > "사진 위 글자 색"(기본 흰색) */}
        <div className="pointer-events-none relative max-w-6xl mx-auto w-full px-4 sm:px-8 pb-10 sm:pb-16" style={{ color: c.heroTextColor }}>
          <p className="text-xs sm:text-sm font-bold tracking-[0.25em] opacity-80">WELCOME</p>
          <h1 className="mt-2 text-3xl sm:text-5xl font-black">{c.churchName}</h1>
          {c.motto && <p className="mt-3 text-sm sm:text-lg opacity-90">{c.motto.text}{c.motto.reference ? ` (${c.motto.reference})` : ""}</p>}
        </div>
      </section>
      {/* 바로가기 카드 4개(2026-11-10): 처음 오셨나요 · 예배 시간 및 장소 · 유튜브 · 오시는 길 */}
      {/* 카드 4개를 모두 OFF로 끄면 칸 자체를 안 그림 */}
      {[0, 1, 2, 3].some((i) => !homeCardHidden(c.homeCards, i)) && (
      <section className="max-w-6xl mx-auto px-4 sm:px-8 pt-10">
        <QuickCards c={c} color={color} A={A} />
      </section>
      )}
      {/* 환영 섹션(2026-11-10): "○○교회에 오신 것을 환영합니다" + 왼쪽 담임목사 사진 · 오른쪽 인사 문구와 바로가기 */}
      <WelcomeSection c={c} color={color} A={A} />
      {/* 주보 · 교회 소식(2026-11-10): 환영 섹션 다음 */}
      <BulletinNewsSection c={c} color={color} A={A} />
      {/* [이전 메인 하단 — 보관용, 화면에 안 나옴] 교회소식 · 설교 카드(위 주보·교회 소식 섹션으로 바꾸면서 꺼 둠).
          안쪽에 주석이 있어 주석으로 감쌀 수 없어서 false && 로 꺼 둠 */}
      {false && (
      <main className="max-w-6xl mx-auto px-4 sm:px-8 py-10 grid gap-5 md:grid-cols-3">
        {/* [이전 메인 카드 — 보관용] 이번 주 주보 · 예배 안내 · 오시는 길 (위 바로가기 카드로 바꾸면서 주석 처리)
        {has("jubo") && (
          <Card>
            <p className="text-xs font-black tracking-widest" style={{ color }}>THIS WEEK</p>
            <p className="mt-2 font-black text-gray-900">이번 주 주보</p>
            {latest && <p className="mt-1 text-sm text-gray-500">{latest.date}<br />{latest.title}</p>}
            <A to="/jubo" className="inline-block mt-4 text-sm font-bold" style={{ color }}>주보 보기 →</A>
          </Card>
        )}
        {has("worship") && (
          <Card>
            <p className="text-xs font-black tracking-widest" style={{ color }}>WORSHIP</p>
            <p className="mt-2 font-black text-gray-900">예배 안내</p>
            <ul className="mt-2 space-y-1 text-sm text-gray-600">
              {c.worship.slice(0, 4).map((w, i) => <li key={i}><b className="text-gray-800">{w.title}</b> {w.time}</li>)}
            </ul>
            <A to="/worship" className="inline-block mt-4 text-sm font-bold" style={{ color }}>전체 보기 →</A>
          </Card>
        )}
        {has("location") && (
          <Card>
            <p className="text-xs font-black tracking-widest" style={{ color }}>LOCATION</p>
            <p className="mt-2 font-black text-gray-900">오시는 길</p>
            <p className="mt-2 text-sm text-gray-600">{c.address}</p>
            <A to="/location" className="inline-block mt-4 text-sm font-bold" style={{ color }}>길 안내 →</A>
          </Card>
        )}
        */}
        {has("news") && (
          <Card className="md:col-span-2">
            <div className="flex items-center justify-between"><H2>교회소식</H2><A to="/news" className="text-sm font-bold" style={{ color }}>더보기</A></div>
            <ul className="divide-y divide-gray-100">
              {c.news.slice(0, 5).map((n) => (
                <li key={n.id}><A to={`/news/${n.id}`} className="flex justify-between gap-3 py-2.5 text-sm hover:underline">
                  <span className="truncate">{n.items.map((i) => i.title).filter(Boolean).join(" · ") || "교회소식"}</span>
                  <span className="shrink-0 text-gray-400">{n.date}</span>
                </A></li>
              ))}
            </ul>
          </Card>
        )}
        {has("sermons") && c.sermons[0] && (
          <Card>
            <p className="text-xs font-black tracking-widest" style={{ color }}>SERMON</p>
            <p className="mt-2 font-black text-gray-900">{c.sermons[0].title}</p>
            <p className="mt-1 text-sm text-gray-500">{[c.sermons[0].scripture, c.sermons[0].preacher].filter(Boolean).join(" · ")}</p>
            <A to="/sermons" className="inline-block mt-4 text-sm font-bold" style={{ color }}>설교 목록 →</A>
          </Card>
        )}
      </main>
      )}
    </>
  );
}

function PageBody({ pageKey, id, c, site, color, A }: { pageKey: PageKey; id: string; c: SiteContent; site: ChurchSite; color: string; A: LinkComp }) {
  switch (pageKey) {
    case "about":
      return (
        <div className="space-y-6">
          {/* 위: 왼쪽 표어·교회 소개 / 오른쪽 교회 사진(반반). 사진이 없으면 글만 한 칸으로.
              모바일에서는 사진이 먼저, 글이 아래 */}
          {(c.motto || c.intro || c.vision || c.mission || c.buildingImageUrl) && (
            // PC: 1행 왼쪽 = MOTTO 라벨·"표어" 제목, 2행 = 왼쪽 말씀 상자·교회 소개·비전·사명 / 오른쪽 사진
            // → 사진 윗변이 "표어" 제목 바로 아래(말씀 상자 윗변)와 같은 높이. 제목 줄 수와 상관없이 자동으로 맞음
            <section className={`grid gap-x-8 lg:gap-x-12 gap-y-8 md:gap-y-3 items-start ${c.buildingImageUrl ? "md:grid-cols-2" : ""}`}>
              {c.motto && (
                <div className="order-2 md:order-none md:col-start-1 md:row-start-1">
                  <p className="text-xs font-black tracking-[0.2em]" style={{ color }}>MOTTO</p>
                  <h2 className="mt-2 text-lg sm:text-xl font-black text-gray-900">{c.motto.label}</h2>
                </div>
              )}
              <div className={`order-3 md:order-none md:col-start-1 space-y-8 ${c.motto ? "md:row-start-2" : "md:row-start-1"}`}>
                {c.motto && (
                  // 말씀 칸: 상자·세로줄 없이 연한 교회색 큰 따옴표 아래에 말씀(잡지 인용문 느낌), 성구는 아래 작은 회색
                  <figure className="-mt-5 md:mt-0">
                    <span aria-hidden className="block h-9 font-serif text-[64px] leading-none select-none" style={{ color, opacity: 0.25 }}>“</span>
                    <blockquote className="text-lg sm:text-xl font-bold leading-[1.75] text-gray-900 break-keep">{nl(c.motto.text)}</blockquote>
                    {c.motto.reference && <figcaption className="mt-3 text-sm font-semibold text-gray-400">— {c.motto.reference}</figcaption>}
                  </figure>
                )}
                {c.motto && c.intro && <div className="h-px bg-gray-100" />}
                {c.intro && (
                  <div>
                    <p className="text-xs font-black tracking-[0.2em]" style={{ color }}>ABOUT</p>
                    <h2 className="mt-2 text-lg sm:text-xl font-black text-gray-900">교회 소개</h2>
                    <p className="mt-3 text-[15px] sm:text-base leading-[1.9] text-gray-600">{nl(c.intro)}</p>
                  </div>
                )}
                {(c.motto || c.intro) && c.vision && <div className="h-px bg-gray-100" />}
                {c.vision && (
                  <div>
                    <p className="text-xs font-black tracking-[0.2em]" style={{ color }}>VISION</p>
                    <h2 className="mt-2 text-lg sm:text-xl font-black text-gray-900">비전</h2>
                    <p className="mt-3 text-[15px] sm:text-base leading-[1.9] text-gray-600">{nl(c.vision)}</p>
                  </div>
                )}
                {(c.motto || c.intro || c.vision) && c.mission && <div className="h-px bg-gray-100" />}
                {c.mission && (
                  <div>
                    <p className="text-xs font-black tracking-[0.2em]" style={{ color }}>MISSION</p>
                    <h2 className="mt-2 text-lg sm:text-xl font-black text-gray-900">사명</h2>
                    <p className="mt-3 text-[15px] sm:text-base leading-[1.9] text-gray-600">{nl(c.mission)}</p>
                  </div>
                )}
              </div>
              {c.buildingImageUrl && (
                <div className={`order-1 md:order-none md:col-start-2 md:sticky md:top-24 ${c.motto ? "md:row-start-2" : "md:row-start-1"}`}>
                  {/* 보일 부분은 편집 화면 > 교회소개에서 사진을 끌어서 정함(buildingImagePos) */}
                  <img src={c.buildingImageUrl} alt={c.churchName} className="w-full aspect-[4/3] md:aspect-[4/5] object-cover rounded-3xl shadow-lg" style={{ objectPosition: c.buildingImagePos || "50% 50%" }} />
                </div>
              )}
            </section>
          )}
          {/* 맨 아래: 오시는 길 요약(지도 + 주소·연락처) → "자세히 보기"로 오시는 길 탭 이동 */}
          {c.address && (
            <section className="pt-10 border-t border-gray-100">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-black tracking-[0.2em]" style={{ color }}>LOCATION</p>
                  <h2 className="mt-2 text-lg sm:text-xl font-black text-gray-900">오시는 길</h2>
                </div>
                <A to="/location" className="shrink-0 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-800 hover:bg-gray-50">자세히 보기 →</A>
              </div>
              <div className="mt-5 grid gap-6 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] items-start">
                <MapPreview c={c} color={color} className="aspect-[16/9]" />
                <div className="text-[15px] leading-relaxed text-gray-700 break-keep">
                  <p className="text-base font-black text-gray-900">{c.churchName}</p>
                  <p className="mt-2">{c.address}</p>
                  {c.addressDetail && <p className="mt-1 text-sm text-gray-500">{nl(c.addressDetail)}</p>}
                  {c.phone && <p className="mt-2"><a href={`tel:${c.phone}`} className="font-bold hover:underline">{c.phone}</a></p>}
                  <MapButtons address={c.address} naver={c.naverMapLink} kakao={c.kakaoMapLink} className="mt-5" />
                </div>
              </div>
            </section>
          )}
        </div>
      );
    case "pastor": {
      // 왼쪽: 인사말 / 오른쪽: 세로 사진 카드. 사진 뒤에 대표 색 판을 어긋나게 겹치고,
      // 왼쪽 아래 모서리에 반투명 이름표를 걸쳐 둠. PC에서는 스크롤해도 사진이 따라옴
      if (!c.pastor) return null;
      const p = c.pastor;
      return (
        // PC: 1행 왼쪽 = 라벨·제목, 2행 = 왼쪽 줄+본문 / 오른쪽 사진 → 사진 윗변이 제목 아래 줄과 같은 높이
        // (제목이 몇 줄이든 자동으로 맞음). 모바일: 제목 → 사진 → 본문
        <div className={`grid gap-x-10 lg:gap-x-20 gap-y-8 md:gap-y-6 items-start ${p.photoUrl ? "md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]" : ""}`}>
          <div className="md:col-start-1 md:row-start-1 md:pt-6">
            <p className="text-xs sm:text-sm font-black tracking-[0.25em]" style={{ color }}>GREETINGS</p>
            {p.greetingTitle && <p className="mt-4 text-2xl sm:text-[34px] leading-snug font-black tracking-tight text-gray-900 break-keep">{nl(p.greetingTitle)}</p>}
          </div>
          <div className="order-3 md:order-none md:col-start-1 md:row-start-2">
            <div className="h-px w-12" style={{ background: color }} />
            <p className="mt-6 text-[15px] sm:text-[17px] leading-[1.95] text-gray-700 break-keep">{nl(p.greeting)}</p>
            {p.name && (
              <p className="mt-10 text-right text-gray-500">
                {p.role} <span className="ml-1 text-xl font-black text-gray-900">{p.name}</span>
              </p>
            )}
          </div>
          {p.photoUrl && (
            // 교회 색을 옅게 깐 패널 위에 사진을 "곱하기"로 겹침 → 흰 배경 증명사진도 배경이 패널 색으로
            // 녹아들어 사람만 떠 보임(잡지 인물 사진 느낌). 오른쪽 2행(제목 아래 줄 높이)에서 시작
            <div className="order-2 md:order-none md:col-start-2 md:row-start-2 md:sticky md:top-28">
              <figure className="mx-auto w-full max-w-[320px] md:max-w-none">
                <div className="overflow-hidden rounded-[28px]" style={{ background: `linear-gradient(160deg, ${color}10 0%, ${color}2e 100%)` }}>
                  <img src={p.photoUrl} alt={p.name} className="block w-full aspect-[4/5] object-cover object-top mix-blend-multiply" />
                </div>
              </figure>
            </div>
          )}
        </div>
      );
    }
    case "praise": {
      // 찬양팀: 소개 문구 + 팀마다 카드(주일학교 부서 카드와 같은 모양: 사진 | 이름 · 소개 · 연습/섬김 시간 · 장소 · 리더)
      return (
        <div>
          {c.praiseIntro && <p className="mb-8 md:mb-12 text-[15px] md:text-[17px] leading-relaxed md:leading-[1.9] text-gray-700 break-keep">{nl(c.praiseIntro)}</p>}
          {c.praiseTeams.length === 0 && !c.praiseIntro && <p className="py-16 text-center text-gray-400">찬양팀 소개를 준비하고 있습니다.</p>}
          <div className="divide-y divide-gray-100">
            {c.praiseTeams.map((d, i) => (
              <section key={i} className={`grid gap-4 md:gap-12 md:grid-cols-2 items-start ${i ? "pt-7 md:pt-12" : ""} pb-7 md:pb-12`}>
                <div className={`w-full overflow-hidden rounded-2xl md:rounded-[24px] bg-gray-100 ${d.photoUrl ? "" : "aspect-[16/10] md:aspect-square"}`}>
                  {d.photoUrl ? (
                    <img src={d.photoUrl} alt={d.name} loading="lazy" className="block w-full h-auto" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-center text-sm text-gray-400">
                      <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
                      <span>찬양팀 사진</span>
                    </div>
                  )}
                </div>
                <div>
                  <h2 className="text-2xl md:text-[34px] font-black text-gray-900 break-keep">{d.name}</h2>
                  {d.desc && <p className="mt-2 md:mt-3 text-[15px] md:text-base leading-relaxed md:leading-[1.8] text-gray-600 break-keep">{nl(d.desc)}</p>}
                  {(d.time || d.place) && (
                    <div className="mt-4 md:mt-7 rounded-xl md:rounded-2xl bg-gray-100/80 px-4 py-3.5 md:px-7 md:py-6">
                      {d.time && (
                        <>
                          <p className="flex items-center gap-1.5 text-sm font-bold text-gray-600">
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                            섬기는 예배 · 연습 시간
                          </p>
                          <p className="mt-1 md:mt-2 text-xl md:text-[30px] font-black tabular-nums text-gray-900 break-keep whitespace-pre-line">{d.time}</p>
                        </>
                      )}
                      {d.place && (
                        <p className={`${d.time ? "mt-1.5 md:mt-3" : ""} flex items-center gap-1.5 text-sm md:text-[15px] text-gray-600 break-keep`}>
                          <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
                          {d.place}
                        </p>
                      )}
                    </div>
                  )}
                  {d.leader && (
                    <div className="mt-4 md:mt-10 flex items-center gap-3 md:gap-4 border-t border-gray-200 pt-4 md:pt-6">
                      <span className="flex h-11 w-11 md:h-16 md:w-16 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500">
                        <svg viewBox="0 0 24 24" className="h-5 w-5 md:h-6 md:w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
                      </span>
                      <div>
                        <p className="text-xs md:text-sm text-gray-500">리더</p>
                        <p className="mt-0.5 text-base md:text-lg font-black text-gray-900 break-keep">{d.leader}</p>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            ))}
          </div>
        </div>
      );
    }
    case "newcomer": {
      // 새가족 안내: 소개 문구 → 등록 절차(1 · 2 · 3 … 단계 카드) → 문의
      return (
        <div className="space-y-8 md:space-y-12">
          {c.newcomerIntro && <p className="text-[15px] md:text-[17px] leading-relaxed md:leading-[1.9] text-gray-700 break-keep">{nl(c.newcomerIntro)}</p>}
          {c.newcomerSteps.length > 0 && (
            <section>
              <p className="text-xs font-black tracking-[0.2em]" style={{ color }}>STEP</p>
              <h2 className="mt-2 text-xl sm:text-2xl font-black text-gray-900">새가족 등록 절차</h2>
              <ol className="mt-5 grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {c.newcomerSteps.map((st, i) => (
                  <li key={i} className="flex gap-4 rounded-2xl border border-gray-200 bg-white px-5 py-5 sm:px-6 sm:py-6">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black text-white" style={{ background: color }}>{i + 1}</span>
                    <div className="min-w-0">
                      {st.title && <p className="text-[17px] font-black text-gray-900 break-keep">{st.title}</p>}
                      {st.desc && <p className="mt-1 text-sm md:text-[15px] leading-relaxed text-gray-600 break-keep">{nl(st.desc)}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}
          {c.newcomerContact && (
            <div className="rounded-2xl bg-gray-100/80 px-5 py-4 md:px-7 md:py-6">
              <p className="text-sm font-bold text-gray-500">문의</p>
              <p className="mt-1 text-[15px] md:text-base font-semibold text-gray-800 break-keep">{nl(c.newcomerContact)}</p>
            </div>
          )}
        </div>
      );
    }
    case "history": {
      const items: { date?: string; content?: string }[] = (site as any).historyItems || [];
      return (
        <ol className="relative border-l-2 ml-2 space-y-6" style={{ borderColor: `${color}40` }}>
          {items.map((h, i) => (
            <li key={i} className="pl-6">
              <span className="absolute -left-[7px] mt-1.5 w-3 h-3 rounded-full" style={{ background: color }} />
              <p className="font-black" style={{ color }}>{h.date}</p>
              <p className="mt-1 text-gray-700">{nl(h.content || "")}</p>
            </li>
          ))}
        </ol>
      );
    }
    case "staff": {
      // 보수적인 교회 홈페이지 느낌: 그림자·둥근 카드 없이 제목 아래 굵은 선, 사진은 단정한 세로 액자,
      // 이름·직분은 사진 아래 가운데. 담임목사는 맨 위에 크게(사진 | 소개)
      const groups = staffGroups(c.staff);
      const isSenior = (role: string) => role.replace(/\s+/g, "").includes("담임");
      const senior = groups.find((g) => isSenior(g.role));
      const others = groups.filter((g) => g !== senior);
      // 담임목사 인사말 화면과 같은 스타일: 교회 색 영문 라벨 → 굵은 제목 → 짧은 교회 색 선
      const Section = ({ en, title, children }: { en: string; title: string; children: React.ReactNode }) => (
        <section>
          <p className="text-xs sm:text-sm font-black tracking-[0.25em]" style={{ color }}>{en}</p>
          <h2 className="mt-3 text-2xl sm:text-[28px] leading-snug font-black tracking-tight text-gray-900">{title}</h2>
          <div className="mt-5 h-px w-12" style={{ background: color }} />
          <div className="mt-8">{children}</div>
        </section>
      );
      // 사진도 인사말 화면과 같게: 교회 색을 옅게 깐 둥근 패널 위에 곱하기로 겹쳐 흰 배경이 패널 색으로 녹아듦
      const Photo = ({ src, name }: { src?: string; name: string }) => (
        <div className="w-full aspect-[4/5] overflow-hidden rounded-[20px]" style={{ background: `linear-gradient(160deg, ${color}10 0%, ${color}2e 100%)` }}>
          {src ? (
            <img src={src} alt={name} className="block w-full h-full object-cover object-top mix-blend-multiply" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-3xl font-black" style={{ color: `${color}66` }}>{name.slice(0, 1)}</div>
          )}
        </div>
      );
      const PersonGrid = ({ people }: { people: { name: string; role?: string; department?: string; desc?: string; photoUrl?: string }[] }) => (
        <div className="grid gap-x-5 gap-y-8 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          {people.map((p, i) => (
            <div key={i}>
              <Photo src={p.photoUrl} name={p.name} />
              <p className="mt-3 text-xs sm:text-sm text-gray-500">{[p.role, p.department].filter(Boolean).join(" · ")}</p>
              <p className="mt-0.5 text-base sm:text-lg font-black text-gray-900">{p.name}</p>
              {p.desc && <p className="mt-1 text-xs sm:text-sm leading-relaxed text-gray-500 break-keep line-clamp-3">{p.desc}</p>}
            </div>
          ))}
        </div>
      );
      return (
        <div className="space-y-16">
          {/* 담임목사: 사진(왼쪽) | 직분·이름·소개(오른쪽) */}
          {senior && (
            <Section en="SENIOR PASTOR" title={senior.role}>
              <div className="space-y-10">
                {senior.people.map((p, i) => (
                  <div key={i} className="grid gap-6 sm:gap-10 sm:grid-cols-[200px_minmax(0,1fr)] items-start">
                    <div className="max-w-[200px] w-full"><Photo src={p.photoUrl} name={p.name} /></div>
                    <div className="sm:pt-3">
                      <p className="text-sm text-gray-500">{p.role}</p>
                      <p className="mt-1 text-2xl font-black text-gray-900">{p.name}</p>
                      {p.desc && <p className="mt-4 text-[15px] sm:text-[17px] leading-[1.95] text-gray-700 break-keep">{nl(p.desc)}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}
          {/* 그 밖의 교역자: 직분별(부목사 → 강도사 → 전도사 …) */}
          {others.map((grp) => (
            <Section key={grp.role} en="MINISTRY" title={grp.role}>
              <PersonGrid people={grp.people} />
            </Section>
          ))}
          {/* 중직자: 교역자와 같은 카드(사진 · 직분 · 이름 · 담당). 사진이 없으면 기본 사진 자리로.
              (예전: 아무도 사진이 없으면 표(직분 | 이름 | 담당) — 아래 false 부분에 보관) */}
          {c.officers.length > 0 && (
            <Section en="ELDERS" title="중직자">
              {true ? (
                <PersonGrid people={c.officers.map((o) => ({ name: o.name, role: o.role, desc: o.desc, photoUrl: o.photoUrl }))} />
              ) : (
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-gray-700">
                      <th className="border border-gray-300 px-3 py-2.5 font-bold w-28">직분</th>
                      <th className="border border-gray-300 px-3 py-2.5 font-bold w-36">이름</th>
                      <th className="border border-gray-300 px-3 py-2.5 font-bold">담당</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.officers.map((o, i) => (
                      <tr key={i} className="text-center">
                        <td className="border border-gray-300 px-3 py-2.5 text-gray-600">{o.role}</td>
                        <td className="border border-gray-300 px-3 py-2.5 font-bold text-gray-900">{o.name}</td>
                        <td className="border border-gray-300 px-3 py-2.5 text-gray-600">{o.desc || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>
          )}
        </div>
      );
    }
    case "location": {
      // 담임목사 인사말·섬기는 사람들과 같은 스타일. 왼쪽: 지도 자리(지도는 나중에 연결) / 오른쪽: 교회 정보 + 차량 운행 안내(펼치기)
      const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
        <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 py-4 border-b border-gray-100">
          <p className="text-sm font-bold text-gray-400 pt-0.5">{label}</p>
          <div className="text-[15px] sm:text-base leading-relaxed text-gray-800 break-keep">{children}</div>
        </div>
      );
      return (
        <section>
          <p className="text-xs sm:text-sm font-black tracking-[0.25em]" style={{ color }}>LOCATION</p>
          <h2 className="mt-3 text-2xl sm:text-[28px] leading-snug font-black tracking-tight text-gray-900">오시는 길</h2>
          <div className="mt-5 h-px w-12" style={{ background: color }} />
          <div className="mt-8 grid gap-8 lg:gap-12 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] items-start">
            <MapPreview c={c} color={color} className="aspect-[4/3]" />
            <div>
              <p className="text-xl sm:text-2xl font-black text-gray-900">{c.churchName}</p>
              <div className="mt-4 border-t-2 border-gray-800">
                <Row label="주소">
                  {/* 도로명 주소(…로/길 + 번호)는 굵게 첫 줄, 건물 이름·층은 둘째 줄(2026-11-21).
                      PC에서 "…1단지 / 행복상가 5층"처럼 애매하게 줄이 바뀌던 것 정리. 도로명이 아니면 한 줄 그대로 */}
                  {(() => {
                    const m = (c.address || "").trim().match(/^(.*?(?:로|길)\s*\d+(?:-\d+)?)(?![\d가번길로-])[\s,，]*(.+)$/);
                    return m
                      ? <><span className="block font-semibold text-gray-900">{m[1]}</span><span className="block mt-0.5 text-[14px] sm:text-[15px] text-gray-700">{m[2]}</span></>
                      : c.address;
                  })()}
                  {c.addressDetail && <span className="block mt-1 text-sm text-gray-500">{nl(c.addressDetail)}</span>}
                </Row>
                {c.phone && (
                  <Row label="연락처"><a href={`tel:${c.phone}`} className="font-bold hover:underline">{c.phone}</a></Row>
                )}
                {c.shuttleInfo && (
                  <details className="group border-b border-gray-100">
                    <summary className="flex cursor-pointer list-none items-center justify-between py-4 [&::-webkit-details-marker]:hidden">
                      <span className="text-[15px] sm:text-base font-bold text-gray-800">차량 운행 안내</span>
                      <span className="flex items-center gap-1 text-sm font-bold" style={{ color }}>
                        <span className="group-open:hidden">펼치기</span><span className="hidden group-open:inline">접기</span>
                        <svg viewBox="0 0 20 20" className="w-4 h-4 transition-transform group-open:rotate-180" fill="currentColor" aria-hidden><path d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4z" /></svg>
                      </span>
                    </summary>
                    <div className="pb-5 text-[15px] leading-[1.9] text-gray-600 break-keep whitespace-pre-line">{c.shuttleInfo}</div>
                  </details>
                )}
              </div>
              <MapButtons address={c.address} naver={c.naverMapLink} kakao={c.kakaoMapLink} className="mt-6" />
            </div>
          </div>
        </section>
      );
    }
    case "education": {
      // 부서별 화면(/education/1 …): 위에 부서 탭, 아래 그 부서 하나만. /education 은 전체 부서 목록
      const depts = c.eduDepartments;
      const one = id ? depts[Number(id) - 1] : undefined;
      if (id && !one) return <p className="py-16 text-center text-gray-400">부서를 찾을 수 없습니다.</p>;
      const shown = one ? [one] : depts;
      // 부서 탭: 다른 페이지(예배 안내 · 온라인 예배 · 설교)와 같은 밑줄 탭(SubTabs)
      const deptPages = [
        { key: "edu-all", path: "/education", label: "전체" },
        ...depts.map((d, i) => ({ key: `edu-${i + 1}`, path: `/education/${i + 1}`, label: d.name })),
      ] as unknown as PageDef[];
      const deptTabs = depts.length > 1 && (
        <SubTabs pages={deptPages} activeKey={(id ? `edu-${id}` : "edu-all") as PageKey} color={color} A={A} />
      );
      // 부서마다: 왼쪽 대표 사진 | 오른쪽 대상(알약) · 부서 이름 · 소개 · 회색 상자(예배 시간 · 장소) · 선 · 담당 교역자
      // 사진은 잘라내지 않고 원래 비율 그대로(사진이 없으면 정사각형 자리 표시). 휴대폰에서는 사진이 위
      return (
        <div>
        {deptTabs}
        <div className="divide-y divide-gray-100">
          {shown.map((d, i) => (
            // id: 상단 메뉴 하위 항목(유초등부 …)을 누르면 이 위치로 스크롤(고정 헤더만큼 띄움)
            <section key={i} id={`edu-${i}`} className={`scroll-mt-24 grid gap-4 md:gap-12 md:grid-cols-2 items-start ${i ? "pt-7 md:pt-12" : ""} pb-7 md:pb-12`}>
              <div className={`w-full overflow-hidden rounded-2xl md:rounded-[24px] bg-gray-100 ${d.photoUrl ? "" : "aspect-[16/10] md:aspect-square"}`}>
                {d.photoUrl ? (
                  <img src={d.photoUrl} alt={d.name} loading="lazy" className="block w-full h-auto" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-center text-sm text-gray-400">
                    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" /></svg>
                    <span>부서 대표 사진<br />(아이들 예배·활동 모습)</span>
                  </div>
                )}
              </div>
              <div>
                {d.target && <span className="inline-block rounded-full bg-gray-100 px-2.5 py-1 md:px-3 md:py-1.5 text-xs md:text-[13px] font-bold text-gray-700">{d.target}</span>}
                <h2 className={`${d.target ? "mt-2 md:mt-4" : ""} text-2xl md:text-[34px] font-black text-gray-900 break-keep`}>{d.name}</h2>
                {d.desc && <p className="mt-2 md:mt-3 text-[15px] md:text-base leading-relaxed md:leading-[1.8] text-gray-600 break-keep">{nl(d.desc)}</p>}
                {(d.time || d.place) && (
                  <div className="mt-4 md:mt-7 rounded-xl md:rounded-2xl bg-gray-100/80 px-4 py-3.5 md:px-7 md:py-6">
                    {d.time && (
                      <>
                        <p className="flex items-center gap-1.5 text-sm font-bold text-gray-600">
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                          예배 시간
                        </p>
                        <p className="mt-1 md:mt-2 text-xl md:text-[30px] font-black tabular-nums text-gray-900 break-keep whitespace-pre-line">{d.time}</p>
                      </>
                    )}
                    {d.place && (
                      <p className={`${d.time ? "mt-1.5 md:mt-3" : ""} flex items-center gap-1.5 text-sm md:text-[15px] text-gray-600 break-keep`}>
                        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
                        {d.place}
                      </p>
                    )}
                  </div>
                )}
                {d.leader && (
                  <div className="mt-4 md:mt-10 flex items-center gap-3 md:gap-4 border-t border-gray-200 pt-4 md:pt-6">
                    <span className="flex h-11 w-11 md:h-16 md:w-16 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500">
                      <svg viewBox="0 0 24 24" className="h-5 w-5 md:h-6 md:w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
                    </span>
                    <div>
                      <p className="text-xs md:text-sm text-gray-500">담당 교역자</p>
                      <p className="mt-0.5 text-base md:text-lg font-black text-gray-900 break-keep">{d.leader}</p>
                    </div>
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
        </div>
      );
    }
    case "worship": {
      const groupsW: { title: string; items: SiteContent["worship"] }[] = [];
      c.worship.forEach((w) => {
        let g = groupsW.find((x) => x.title === w.group);
        if (!g) { g = { title: w.group, items: [] }; groupsW.push(g); }
        g.items.push(w);
      });
      // 예배 구분마다 카드 하나: 왼쪽 대표 사진(편집 화면 > 예배 > 구분별 대표 사진) | 오른쪽 영문 라벨 · 구분 이름 · 예배별 이름/시간 · 장소
      // 휴대폰에서는 사진이 위, 내용이 아래. 장소가 모두 같으면 맨 아래 "모든 예배 ○○" 한 줄로, 다르면 예배마다 이름 아래에
      const enOf = (t: string) => (t.includes("주일") ? "SUNDAY" : t.includes("새벽") ? "DAWN" : (t.includes("주중") || t.includes("수요") || t.includes("금요")) ? "WEEKDAY" : "WORSHIP");
      return (
        <div className="space-y-8 sm:space-y-10">
          {groupsW.map((g) => {
            const photo = c.worshipPhotos[g.title];
            const places = [...new Set(g.items.map((w) => w.place).filter(Boolean))];
            const samePlace = places.length === 1 && g.items.every((w) => w.place === places[0]);
            // 주일예배가 아닌 구분(주중예배·새벽기도 등): 예배마다 작은 카드로 나란히(새벽기도 · 수요예배 · 금요예배 …)
            if (!g.title.includes("주일")) {
              const tagOf = (t: string) => (t.includes("새벽") ? "DAWN" : t.includes("수요") ? "WEDNESDAY" : t.includes("금요") ? "FRIDAY" : t.includes("토요") ? "SATURDAY" : "WEEKDAY");
              return (
                <section key={g.title}>
                  <p className="text-xs font-black tracking-[0.2em] text-gray-700">{enOf(g.title)}</p>
                  <h2 className="mt-2 text-2xl sm:text-[28px] font-black text-gray-900">{g.title}</h2>
                  <div className="mt-5 grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {g.items.map((w, i) => (
                      <div key={i} className="flex flex-col rounded-2xl border border-gray-200 bg-white px-5 py-5 sm:px-6 sm:py-6">
                        <span className="self-start rounded-full px-2.5 py-1 text-[11px] font-black tracking-[0.12em]" style={{ background: `${color}14`, color }}>{tagOf(w.title)}</span>
                        <p className="mt-3 text-lg font-black text-gray-900 break-keep">{w.title}</p>
                        {/* 주중예배(새벽기도·수요예배·금요철야 등) 시간 글자색 #595959 — 주일예배 목록과 같게(2026-11-12 요청) */}
                        <p className="mt-3 border-t border-gray-100 pt-3 text-xl sm:text-2xl font-black tabular-nums text-[#595959] break-keep whitespace-pre-line">{w.time}</p>
                        {(w.place || w.note) && (
                          <div className="mt-auto pt-3 space-y-1">
                            {w.place && (
                              <p className="flex items-center gap-1.5 text-sm text-gray-500 break-keep">
                                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
                                {w.place}
                              </p>
                            )}
                            {w.note && <p className="text-xs sm:text-sm text-gray-500 break-keep">{w.note}</p>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              );
            }
            return (
              <section key={g.title} className="grid overflow-hidden rounded-[24px] border border-gray-200 bg-white md:grid-cols-2">
                <div className="relative aspect-[16/10] md:aspect-auto md:min-h-[320px] bg-gray-100">
                  {photo ? (
                    <img src={photo} alt={`${g.title} 대표 사진`} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-gray-400">
                      <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" /></svg>
                      <span className="text-sm">{g.title} 대표 사진</span>
                    </div>
                  )}
                </div>
                <div className="px-6 py-8 sm:px-12 sm:py-12">
                  <p className="text-xs font-black tracking-[0.2em] text-gray-700">{enOf(g.title)}</p>
                  <h2 className="mt-2 text-2xl sm:text-[28px] font-black text-gray-900">{g.title}</h2>
                  <div className="mt-6 border-t border-gray-800">
                    {g.items.map((w, i) => (
                      <div key={i} className="flex items-start justify-between gap-4 border-b border-gray-200 py-5">
                        <div className="min-w-0">
                          {/* 주일 예배 목록의 예배 이름·시간 글자색 #595959 (2026-11-12 요청) */}
                          <p className="text-[15px] sm:text-base font-bold text-[#595959] break-keep">{w.title}</p>
                          {!samePlace && w.place && <p className="mt-1 text-sm text-gray-500 break-keep">{w.place}</p>}
                          {w.note && <p className="mt-1 text-xs sm:text-sm text-gray-500 break-keep">{w.note}</p>}
                        </div>
                        <p className="shrink-0 text-right text-lg sm:text-2xl font-black tabular-nums text-[#595959] break-keep whitespace-pre-line">{w.time}</p>
                      </div>
                    ))}
                  </div>
                  {samePlace && (
                    <p className="mt-5 flex items-center gap-2 text-sm text-gray-500">
                      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
                      {g.items.length > 1 ? "모든 예배 " : ""}{places[0]}
                    </p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      );
    }
    case "online":
      return (
        // 위: 큰 화면(실시간/최근 예배) + 이번 주 설교 정보, 아래: 최근 예배 영상 표(누르면 위 화면에서 재생)
        <OnlineWorshipLive c={c} color={color} A={A} />
      );
    case "sermons": {
      // 예배 안내와 같은 스타일: 교회 색 영문 라벨 → 굵은 제목 → 짧은 선. 맨 위에 가장 최근 설교를 크게,
      // 아래에 굵은 윗줄로 시작하는 목록(날짜 | 설교 제목·본문 | 설교자 | 보기)
      // 종이 주보에서 읽어온 설교는 그 주보 파일을 열고, 온라인 주보 설교는 주보 화면으로
      const SermonLink = ({ s, className, children }: { s: SiteContent["sermons"][number]; className: string; children: React.ReactNode }) =>
        s.id.startsWith("paper-")
          ? (s.fileUrl ? <a href={s.fileUrl} target="_blank" rel="noopener noreferrer" className={className}>{children}</a> : <div className={className}>{children}</div>)
          // 온라인 주보 설교는 "온라인 주보" 탭으로(교회 주보 탭은 이미지·PDF 주보 파일 전용)
          : <A to={s.id === c.latestBulletinId ? "/jubo" : `/bulletins/${s.id}`} className={className}>{children}</A>;
      const [latest, ...rest] = c.sermons;
      const fmt = (d: string) => d.replace(/-/g, ".");
      const next = c.nextSermon;
      return (
        <div className="space-y-14">
          {/* 이번 주 말씀: 편집 화면 > 매주 업데이트에서 ON/OFF */}
          {latest && c.weeklySermonEnabled && (
            <section>
              <p className="text-xs font-black tracking-[0.2em]" style={{ color }}>THIS WEEK</p>
              <h2 className="mt-2 text-xl sm:text-2xl font-black text-gray-900">이번 주 말씀</h2>
              {/* 제목 아래 짧은 교회 색 선은 뺌(2026-11-10 요청) */}
              <div className="mt-5 rounded-[20px] px-6 py-7 sm:px-9 sm:py-9" style={{ background: `linear-gradient(160deg, ${color}0d 0%, ${color}24 100%)` }}>
                {latest.date && <p className="text-sm font-bold tabular-nums text-gray-500">{fmt(latest.date)}</p>}
                <p className="mt-2 text-2xl sm:text-3xl font-black leading-snug text-gray-900 break-keep">{latest.title || "말씀"}</p>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[15px]">
                  {latest.scripture && <span className="font-bold" style={{ color }}>{latest.scripture}</span>}
                  {latest.preacher && <span className="text-gray-600">{latest.preacher}</span>}
                </div>
                {/* 편집 화면에서 직접 적은 이번 주 말씀(site-weekly)은 연결할 주보가 없어 버튼 없음 */}
                {!latest.id.startsWith("site-") && (
                  <SermonLink s={latest} className="mt-6 inline-flex h-11 items-center rounded-xl bg-white px-5 text-sm font-bold text-gray-800 border border-gray-200 hover:bg-gray-50">
                    {latest.id.startsWith("paper-") ? "주보 파일 보기 →" : "주보 보기 →"}
                  </SermonLink>
                )}
              </div>
            </section>
          )}
          {/* 이번 주 말씀 아래: 가장 최근에 올라온 예배 영상 하나를 큰 화면으로 */}
          {/* 예배 영상(큰 화면) → 최근 예배 영상 카드(누르면 위 큰 화면에서 재생) → 쇼츠 */}
          <SermonVideos c={c} color={color} />
          {/* 다음 주 말씀: 편집 화면 > 매주 업데이트에서 ON/OFF(켜고 설교 제목을 적었을 때만) */}
          {next && (
            <section>
              <p className="text-xs font-black tracking-[0.2em]" style={{ color }}>NEXT WEEK</p>
              <h2 className="mt-2 text-xl sm:text-2xl font-black text-gray-900">다음 주 말씀</h2>
              <div className="mt-5 rounded-[20px] border border-gray-200 bg-white px-6 py-7 sm:px-9 sm:py-9">
                {next.date && <p className="text-sm font-bold tabular-nums text-gray-500">{fmt(next.date)}</p>}
                <p className="mt-2 text-2xl sm:text-3xl font-black leading-snug text-gray-900 break-keep">{next.title}</p>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[15px]">
                  {next.scripture && <span className="font-bold" style={{ color }}>{next.scripture}</span>}
                  {next.preacher && <span className="text-gray-600">{next.preacher}</span>}
                </div>
              </div>
            </section>
          )}
          {/* 지난 설교: 필요 없다고 하셔서 화면에서 뺌(2026-11-10). 코드는 다시 쓸 수 있게 남겨 둠 */}
          {false && (
          <SermonVideoCards c={c} color={color}>
          {rest.length > 0 && (
            <section>
              <p className="text-xs font-black tracking-[0.2em]" style={{ color }}>SERMONS</p>
              <h2 className="mt-2 text-xl sm:text-2xl font-black text-gray-900">지난 설교</h2>
              {/* 제목 아래 짧은 교회 색 선은 뺌(2026-11-10 요청) */}
              <div className="mt-5 border-t-2 border-gray-800">
                <div className="hidden sm:grid grid-cols-[120px_minmax(0,1fr)_140px] gap-4 px-1 py-3 border-b border-gray-200 text-sm font-bold text-gray-400">
                  <span>날짜</span><span>설교 제목</span><span>설교자</span>
                </div>
                {rest.map((s) => (
                  <div key={s.id} className="grid grid-cols-[minmax(0,1fr)] sm:grid-cols-[120px_minmax(0,1fr)_140px] gap-x-4 gap-y-1 px-1 py-4 border-b border-gray-100 items-center">
                    <span className="order-2 sm:order-none text-xs sm:text-[15px] tabular-nums text-gray-500">{s.date ? fmt(s.date) : "-"}</span>
                    <span className="order-1 sm:order-none min-w-0">
                      <span className="block text-[15px] sm:text-base font-bold text-gray-900 break-keep">{s.title || "말씀"}</span>
                      {s.scripture && <span className="block mt-0.5 text-sm" style={{ color }}>{s.scripture}</span>}
                    </span>
                    <span className="hidden sm:block text-[15px] text-gray-600 break-keep">{s.preacher || "-"}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
          </SermonVideoCards>
          )}
        </div>
      );
    }
    case "bulletins": {
      if (id) {
        const paper = c.paperBulletins.find((x) => x.id === id);
        if (paper) return <PaperPost c={c} b={paper} A={A} color={color} />;
        const b = c.bulletins.find((x) => x.id === id);
        if (!b) return <p className="py-16 text-center text-gray-400">주보를 찾을 수 없습니다.</p>;
        // "온라인 주보" 탭과 같은 화면(왼쪽 목록·가운데 휴대폰·오른쪽 정보)에 이 주보를 선택해서 보여 줌
        return <JuboPage key={b.id} c={c} color={color} initialId={b.id} A={A} />;
      }
      return <BulletinTable c={c} color={color} A={A} />;
    }
    case "jubo":
      return <JuboPage c={c} color={color} A={A} />;
    case "news":
      return id ? <NewsPost c={c} id={id} A={A} /> : <NewsTable c={c} A={A} />;
    case "column":
    case "prayer": {
      const posts = pageKey === "column"
        ? c.columns.map((x) => ({ id: x.id, title: x.title, date: x.date, content: x.content, author: x.author }))
        : c.prayers.map((x) => ({ ...x, author: "" }));
      const base = pageKey === "column" ? "/column" : "/prayer";
      if (id) {
        const p = posts.find((x) => x.id === id);
        if (!p) return <p className="py-16 text-center text-gray-400">글을 찾을 수 없습니다.</p>;
        return (
          <div>
            <div className="rounded-t-xl px-5 py-4 text-white font-black text-lg" style={{ background: "#5f6166" }}>{p.title}</div>
            <p className="px-1 py-3 text-sm text-gray-400 border-b border-gray-200">{[p.author, p.date && `등록일 : ${p.date}`].filter(Boolean).join("  |  ")}</p>
            <div className="py-6 px-1 leading-loose">{nl(p.content)}</div>
            <A to={base} className="inline-block mt-4 text-sm font-bold" style={{ color }}>← 목록으로</A>
          </div>
        );
      }
      return (
        <Card>
          <ul className="divide-y divide-gray-100">
            {posts.map((p) => (
              <li key={p.id}><A to={`${base}/${p.id}`} className="flex justify-between gap-3 py-3.5 hover:underline">
                <b className="truncate text-gray-900">{p.title}</b>
                <span className="shrink-0 text-sm text-gray-400">{p.date}</span>
              </A></li>
            ))}
          </ul>
        </Card>
      );
    }
    case "album":
      return id ? <AlbumDetail c={c} id={id} color={color} A={A} /> : <AlbumList c={c} color={color} A={A} />;
    case "schedule":
      return <ScheduleCalendar c={c} color={color} />;
    case "grace":
      return <GraceBoard slug={site.slug} id={id} label={((site as { graceLabel?: string }).graceLabel || "").trim() || "나눔 게시판"} desc={(site as { graceDesc?: string }).graceDesc || ""} color={color} A={A} />;
    default:
      return null;
  }
}

// 지난 설교 카드: 교회 유튜브 채널(c.youtubeLink)에 올린 최신 영상(쇼츠 포함)을 서버 함수(youtubeVideos)로
// 자동으로 가져와 온라인 예배 화면처럼 카드로 보여 줌. 누르면 유튜브(쇼츠는 쇼츠 화면)로 열림.
// 채널이 없거나 못 가져오면 온라인 예배에 직접 넣은 영상, 그것도 없으면 children(예전 목록)
type YtVideo = { id: string; title: string; published: string; short?: boolean };
const ytMemo = new Map<string, YtVideo[]>();
// 가장 최근 것부터(2026-11-21): 올린 날짜 내림차순. 날짜를 모르는 영상(유튜브 화면에서 더 읽어 온 것)은 뒤에 원래 순서대로
const newestFirst = (list: YtVideo[]) => [...list].sort((a, b) => (b.published || "").localeCompare(a.published || ""));
const VIDEO_MAX = 24; // 지난 설교·최근 예배 영상: 최근 24개(주 1개면 약 6개월치)까지만, 그 이전은 유튜브 채널로
type YtLive = { id: string; title: string } | null;
const ytLiveMemo = new Map<string, { t: number; live: YtLive }>(); // 실시간 방송 여부(2분 동안 믿음)
const ytPending = new Map<string, Promise<{ videos: YtVideo[]; live: YtLive }>>();
// 채널 영상 목록 + 실시간 방송 여부를 한 번에 받음. 같은 채널을 동시에 여러 곳에서 부르면 한 번만 받음(미리 받기와 겹쳐도)
// slug: 교회 홈페이지 주소 → 서버가 받은 목록을 그 사이트 데이터에 저장해 둠(다음 방문자는 바로 씀)
let ytSiteSlug = "";
const ytNeedsSave = new Set<string>(); // 사이트 데이터의 저장본이 없거나 1시간이 지난 주소
function loadYt(ch: string): Promise<{ videos: YtVideo[]; live: YtLive }> {
  const pending = ytPending.get(ch);
  if (pending) return pending;
  const slug = ytNeedsSave.has(ch) ? ytSiteSlug : "";
  const p = fetch(`https://asia-northeast3-stayonsbplatform.cloudfunctions.net/youtubeVideos?live=1&url=${encodeURIComponent(ch)}${slug ? `&site=${encodeURIComponent(slug)}` : ""}`)
    .then((r) => (r.ok ? r.json() : { videos: [], live: null }))
    .then((d) => {
      const videos: YtVideo[] = Array.isArray(d.videos) ? d.videos : [];
      const live: YtLive = d.live && d.live.id ? d.live : null;
      if (videos.length) { ytMemo.set(ch, videos); ytNeedsSave.delete(ch); }
      ytLiveMemo.set(ch, { t: Date.now(), live });
      return { videos, live };
    })
    .catch(() => ({ videos: ytMemo.get(ch) || [], live: null }))
    .finally(() => { ytPending.delete(ch); });
  ytPending.set(ch, p);
  return p;
}
// 쇼츠 칸(2026-11-21): 교회 유튜브 채널의 쇼츠만 세로 카드로 가로로 쭉. 누르면 화면 위에 쇼츠가 떠서 바로 재생.
// 서버(youtubeVideos?shorts=1)가 채널의 쇼츠 전용 목록에서 최신 15개까지. 못 받으면 채널 영상 중 쇼츠로 표시된 것
const ytShortsMemo = new Map<string, YtVideo[]>();
let ytShortsNeedsSave = false;
function loadShorts(ch: string): Promise<YtVideo[]> {
  const slug = ytShortsNeedsSave ? ytSiteSlug : "";
  return fetch(`https://asia-northeast3-stayonsbplatform.cloudfunctions.net/youtubeVideos?shorts=1&url=${encodeURIComponent(ch)}${slug ? `&site=${encodeURIComponent(slug)}` : ""}`)
    .then((r) => (r.ok ? r.json() : { videos: [] }))
    .then((d) => {
      // 쇼츠로 표시된 것만(서버가 쇼츠 모드를 모르는 예전 버전이면 채널 영상 전체가 오므로 거름)
      const v: YtVideo[] = (Array.isArray(d.videos) ? d.videos : []).filter((x: YtVideo) => x.short);
      if (v.length) { ytShortsMemo.set(ch, v); ytShortsNeedsSave = false; }
      return v;
    })
    .catch(() => ytShortsMemo.get(ch) || []);
}
function ShortsRow({ c, color }: { c: SiteContent; color: string }) {
  const ch = c.youtubeLink;
  const [list, setList] = useState<YtVideo[] | null>(() => (ch ? ytShortsMemo.get(ch) ?? null : []));
  const [playing, setPlaying] = useState<YtVideo | null>(null);
  // 양옆 화살표(2026-11-21): 한 화면(PC 5개)씩 넘김. 맨 앞/맨 끝이면 그쪽 화살표 숨김
  const scroller = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: true, end: true });
  const checkEdge = () => {
    const el = scroller.current;
    if (!el) return;
    const start = el.scrollLeft <= 4, end = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
    // 값이 바뀔 때만 갱신(매번 새 값으로 바꾸면 화면이 끝없이 다시 그려져 탭이 안 눌리던 문제, 2026-11-21)
    setEdge((e) => (e.start === start && e.end === end ? e : { start, end }));
  };
  const slide = (dir: 1 | -1) => scroller.current?.scrollBy({ left: dir * scroller.current.clientWidth, behavior: "smooth" });
  const shortsCount = list?.length ?? 0;
  useEffect(() => {
    checkEdge();
    window.addEventListener("resize", checkEdge);
    return () => window.removeEventListener("resize", checkEdge);
  }, [shortsCount]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!ch || (ytShortsMemo.has(ch) && !ytShortsNeedsSave)) return;
    let cancelled = false;
    loadShorts(ch).then((v) => { if (!cancelled && (v.length || !ytShortsMemo.has(ch))) setList(v); });
    return () => { cancelled = true; };
  }, [ch]);
  // 쇼츠 화면이 떠 있는 동안 뒤 화면 스크롤 잠금
  useEffect(() => {
    if (!playing) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [playing]);
  if (!ch) return null;
  // 가장 최근 쇼츠부터 최대 10개. 더 있으면 "유튜브에서 더 보기"로
  const all = newestFirst(list && list.length ? list : (ytMemo.get(ch) || []).filter((v) => v.short));
  const shorts = all.slice(0, 10);
  const shortsUrl = `${ch.replace(/\/+$/, "")}/shorts`;
  if (shorts.length === 0) return null;
  return (
    <section>
      <p className="text-xs font-black tracking-[0.2em]" style={{ color }}>SHORTS</p>
      <div className="mt-2 flex items-end justify-between gap-4">
        <h2 className="text-xl sm:text-2xl font-black text-gray-900">쇼츠</h2>
        <a href={shortsUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 pb-0.5 text-sm font-bold" style={{ color }}>Youtube(Shorts)에서 더 보기 →</a>
      </div>
      {/* PC: 한 화면에 5개 꽉 차게 + 양옆 ‹ › 로 넘김(최대 10개). 휴대폰: 2개 + 다음 카드 살짝, 손가락으로 밀기 */}
      <div className="relative mt-5">
        <div ref={scroller} onScroll={checkEdge}
          // scroll-px-4: 카드가 맞춰 멈출 때(snap) 왼쪽 여백 16px을 남김 — 없으면 첫 카드가 화면 왼쪽 끝에 딱 붙음
          className="-mx-4 px-4 scroll-px-4 sm:mx-0 sm:px-0 sm:scroll-px-0 flex gap-3 sm:gap-4 overflow-x-auto snap-x snap-mandatory pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {shorts.map((v) => (
          <button key={v.id} type="button" onClick={() => setPlaying(v)}
            className="group snap-start shrink-0 w-[42%] sm:w-[calc((100%-64px)/5)] text-left">
            <div className="relative aspect-[9/16] overflow-hidden rounded-xl bg-black">
              <img src={`https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`} alt={v.title} loading="lazy"
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
              <span className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent" />
              <span className="absolute left-2 top-2 rounded-md bg-[#FF0000] px-1.5 py-0.5 text-[10px] font-black text-white">Shorts</span>
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white transition-colors group-hover:bg-[#FF0000]">▶</span>
              </span>
              <p className="absolute inset-x-2.5 bottom-2.5 text-[13px] font-bold leading-snug text-white line-clamp-2 break-keep">{v.title}</p>
            </div>
          </button>
        ))}
        </div>
        {!edge.start && (
          <button type="button" onClick={() => slide(-1)} aria-label="이전 쇼츠"
            className="hidden sm:flex absolute left-0 top-[calc(50%-4px)] -translate-x-1/2 -translate-y-1/2 h-11 w-11 items-center justify-center rounded-full bg-white text-xl text-gray-800 shadow-[0_2px_12px_rgba(0,0,0,0.18)] hover:bg-gray-50">‹</button>
        )}
        {!edge.end && (
          <button type="button" onClick={() => slide(1)} aria-label="다음 쇼츠"
            className="hidden sm:flex absolute right-0 top-[calc(50%-4px)] translate-x-1/2 -translate-y-1/2 h-11 w-11 items-center justify-center rounded-full bg-white text-xl text-gray-800 shadow-[0_2px_12px_rgba(0,0,0,0.18)] hover:bg-gray-50">›</button>
        )}
      </div>
      {/* 10개보다 많으면 나머지는 유튜브에서 */}
      {all.length > 10 && (
        <div className="mt-5 text-center">
          <a href={shortsUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-gray-300 bg-white px-5 text-sm font-bold text-gray-700 hover:bg-gray-50">
            <Youtube className="h-4 w-4 text-[#FF0000]" />Youtube(Shorts)에서 더 보기
          </a>
        </div>
      )}
      {playing && (
        <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/80 p-4" onClick={() => setPlaying(null)} role="dialog" aria-modal="true">
          <div className="relative w-full max-w-[360px]" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setPlaying(null)} aria-label="닫기"
              className="absolute -top-11 right-0 h-9 w-9 rounded-full bg-white/15 text-xl text-white hover:bg-white/25">×</button>
            <div className="aspect-[9/16] max-h-[80dvh] mx-auto overflow-hidden rounded-2xl bg-black">
              <iframe src={`https://www.youtube.com/embed/${playing.id}?autoplay=1&playsinline=1&rel=0`} title={playing.title}
                className="h-full w-full" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
            </div>
            <p className="mt-3 text-center text-sm font-bold text-white line-clamp-2 break-keep">{playing.title}</p>
          </div>
        </div>
      )}
    </section>
  );
}

function SermonVideoCards({ c, color, children }: { c: SiteContent; color: string; children?: React.ReactNode }) {
  const ch = c.youtubeLink;
  const [videos, setVideos] = useState<YtVideo[] | null>(() => (ch ? ytMemo.get(ch) ?? null : []));
  useEffect(() => {
    if (!ch || ytMemo.has(ch)) return;
    let cancelled = false;
    loadYt(ch).then((d) => { if (!cancelled) setVideos(d.videos); });
    return () => { cancelled = true; };
  }, [ch]);

  // 한 화면에 최대 12개, 넘으면 아래 번호로 넘김
  const [page, setPage] = useState(1);
  const manual: YtVideo[] = c.sermonVideos.map((v) => ({ id: v.youtubeVideoId, title: v.title, published: v.date || "" }));
  // 편집 화면 "예배 영상 직접 넣기"를 켜고 영상을 넣었으면 그 영상, 껐으면(또는 비었으면) 유튜브 채널 영상
  const all = (manual.length > 0 ? manual : (videos || [])).slice(0, VIDEO_MAX);
  const PER = 12;
  const pages = Math.max(1, Math.ceil(all.length / PER));
  const cur = Math.min(page, pages);
  const list = all.slice((cur - 1) * PER, cur * PER);
  if (videos === null && manual.length === 0) return <p className="py-10 text-center text-sm text-gray-400">설교 영상을 불러오는 중…</p>;
  if (all.length === 0) return <>{children}</>;
  const fmt = (d: string) => (d ? d.slice(0, 10).replace(/-/g, ".") : "");
  return (
    <section>
      <p className="text-xs font-black tracking-[0.2em]" style={{ color }}>SERMONS</p>
      {/* 제목 왼쪽, "유튜브 채널에서 더 보기"는 같은 줄 오른쪽 */}
      <div className="mt-2 flex items-end justify-between gap-4">
        <h2 className="text-xl sm:text-2xl font-black text-gray-900">지난 설교</h2>
        {ch && <a href={ch} target="_blank" rel="noopener noreferrer" className="shrink-0 pb-0.5 text-sm font-bold" style={{ color }}>유튜브 채널에서 더 보기 →</a>}
      </div>
      {/* 휴대폰도 한 줄에 2개(2026-11-19, 최근 예배 영상과 같게) */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        {list.map((v) => (
          <a key={v.id} href={v.short ? `https://www.youtube.com/shorts/${v.id}` : `https://www.youtube.com/watch?v=${v.id}`} target="_blank" rel="noopener noreferrer"
            className="group overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm transition-shadow hover:shadow-md">
            <div className="relative aspect-video bg-black overflow-hidden">
              <img src={`https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`} alt={v.title} loading="lazy" className="block w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
              {v.short && <span className="absolute left-1.5 top-1.5 sm:left-2 sm:top-2 rounded-md bg-[#FF0000] px-1.5 py-0.5 text-[10px] sm:text-[11px] font-black text-white">Shorts</span>}
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="flex h-9 w-9 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-black/55 text-white text-sm sm:text-lg transition-colors group-hover:bg-[#FF0000]">▶</span>
              </span>
            </div>
            <div className="px-2.5 py-2.5 sm:px-4 sm:py-3">
              <p className="text-[13px] sm:text-base leading-snug font-bold text-gray-900 line-clamp-2 break-keep">{v.title}</p>
              {v.published && <p className="mt-0.5 text-[11px] sm:text-xs text-gray-500">{fmt(v.published)}</p>}
            </div>
          </a>
        ))}
      </div>
      {pages > 1 && (
        <div className="mt-8 flex justify-center gap-1">
          {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
            <button key={n} onClick={() => setPage(n)}
              className={`h-9 min-w-9 border px-3 text-sm font-bold ${n === cur ? "border-gray-700 bg-gray-700 text-white" : "border-gray-300 text-gray-600 hover:bg-gray-100"}`}>{n}</button>
          ))}
        </div>
      )}
      {/* 최근 24개(주 1개면 약 6개월치)까지만 보여 주고, 그 이전 영상은 유튜브 채널에서 */}
      {ch && (
        <div className="mt-6 text-center">
          <a href={ch} target="_blank" rel="noopener noreferrer"
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-gray-300 bg-white px-5 text-sm font-bold text-gray-700 hover:bg-gray-50">
            <Youtube className="h-4 w-4 text-[#FF0000]" />지난 영상 더 보기 (유튜브 채널)
          </a>
        </div>
      )}
    </section>
  );
}

// 말씀/영상 탭 영상 묶음(2026-11-21): 예배 영상(큰 화면) → 최근 예배 영상 카드 → 쇼츠.
// 카드를 누르면 위 큰 화면에서 그 영상이 재생되고 화면이 큰 화면으로 올라감
function SermonVideos({ c, color }: { c: SiteContent; color: string }) {
  const ch = c.youtubeLink;
  const [chVideos, setChVideos] = useState<YtVideo[] | null>(() => (ch ? ytMemo.get(ch) ?? null : []));
  useEffect(() => {
    if (!ch || ytMemo.has(ch)) return;
    let cancelled = false;
    loadYt(ch).then((d) => { if (!cancelled) setChVideos(d.videos); });
    return () => { cancelled = true; };
  }, [ch]);
  // 편집 화면에 지난 예배 재생목록을 넣었으면 그 재생목록 영상만(미리 받아 둔 것 바로 사용)
  const pl = c.sermonPlaylist;
  const [plVideos, setPlVideos] = useState<YtVideo[] | null>(() => (pl ? ytMemo.get(pl) ?? null : null));
  useEffect(() => {
    if (!pl || ytMemo.has(pl)) return;
    let cancelled = false;
    loadYt(pl).then((d) => { if (!cancelled) setPlVideos(d.videos); });
    return () => { cancelled = true; };
  }, [pl]);
  // "예배 영상 직접 넣기"를 켜고 영상을 넣었으면 그 영상 → 재생목록 → 채널 영상(쇼츠 제외)
  const rows: YtVideo[] = (c.sermonVideos.length
    ? c.sermonVideos.map((v) => ({ id: v.youtubeVideoId, title: v.title, published: v.date || "" }))
    : newestFirst(pl && plVideos?.length ? plVideos : (chVideos || []).filter((v) => !v.short))).slice(0, VIDEO_MAX);
  const moreLink = pl || ch;
  const [picked, setPicked] = useState<YtVideo | null>(null);
  const [page, setPage] = useState(1);
  const playerRef = useRef<HTMLElement>(null);
  // 최대 2줄만(2026-11-21): PC 한 줄 3개 → 6개, 휴대폰·태블릿 한 줄 2개 → 4개. 나머지는 아래 번호로 넘김
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setWide(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const PER = wide ? 6 : 4;
  const pages = Math.max(1, Math.ceil(rows.length / PER));
  const cur = Math.min(page, pages);
  const videoId = picked?.id || rows[0]?.id || "";
  const fmtD = (d: string) => (d ? d.slice(0, 10).replace(/-/g, ".") : "-");
  const pick = (v: YtVideo) => { setPicked(v); requestAnimationFrame(() => playerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })); };
  return (
    <>
      <LatestVideo c={c} color={color} picked={picked} anchorRef={playerRef} />
      {rows.length > 0 && (
      <section>
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-black tracking-[0.2em]" style={{ color }}>VIDEOS</p>
            <h2 className="mt-2 text-xl sm:text-2xl font-black text-gray-900">최근 예배 영상</h2>
          </div>
          {/* 최근 24개까지만 보여 주고, 그 이전 영상은 유튜브에서(재생목록을 넣었으면 그 재생목록) */}
          {moreLink && <a href={moreLink} target="_blank" rel="noopener noreferrer" className="hidden sm:inline shrink-0 text-sm font-bold" style={{ color }}>Youtube 채널에서 더보기 →</a>}
        </div>
        {moreLink && <a href={moreLink} target="_blank" rel="noopener noreferrer" className="sm:hidden mt-3 inline-block text-sm font-bold" style={{ color }}>Youtube 채널에서 더보기 →</a>}
        {/* 카드형: 한 줄에 3개(휴대폰 2개), 최대 2줄(최대 24개), 넘으면 아래 번호로 */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          {rows.slice((cur - 1) * PER, cur * PER).map((v) => {
            const on = videoId === v.id;
            return (
              <button key={v.id} type="button" onClick={() => pick(v)}
                className={`group text-left overflow-hidden rounded-xl border bg-white shadow-sm transition-shadow hover:shadow-md ${on ? "border-gray-800" : "border-gray-100"}`}>
                <span className="relative block aspect-video bg-black overflow-hidden">
                  <img src={`https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`} alt={v.title} loading="lazy" className="block w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                  {on && <span className="absolute left-1.5 top-1.5 sm:left-2 sm:top-2 rounded-md bg-gray-900/85 px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-[11px] font-black text-white">재생 중</span>}
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="flex h-9 w-9 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-black/55 text-white text-sm sm:text-lg transition-colors group-hover:bg-[#FF0000]">▶</span>
                  </span>
                </span>
                <span className="block p-2.5 sm:p-4">
                  <span className="block text-[13px] sm:text-[15px] leading-snug font-bold text-gray-900 break-keep line-clamp-2">{v.title}</span>
                  <span className="mt-1 block text-[11px] sm:text-xs tabular-nums text-gray-500">{fmtD(v.published)}</span>
                </span>
              </button>
            );
          })}
        </div>
        {pages > 1 && (
          <div className="mt-6 flex justify-center gap-1">
            {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
              <button key={n} onClick={() => setPage(n)}
                className={`h-9 min-w-9 border px-3 text-sm font-bold ${n === cur ? "border-gray-700 bg-gray-700 text-white" : "border-gray-300 text-gray-600 hover:bg-gray-100"}`}>{n}</button>
            ))}
          </div>
        )}
      </section>
      )}
      {/* 쇼츠: 채널에 쇼츠가 있을 때만 */}
      <ShortsRow c={c} color={color} />
    </>
  );
}

// 말씀/영상 화면의 "최근 예배 영상": 가장 최근 영상 하나를 큰 화면으로(왼쪽) + 제목·날짜·유튜브 버튼(오른쪽)
// 영상 고르는 순서: 예배 영상 직접 넣기(켜고 넣은 영상) → 지난 예배 재생목록 → 채널 최신 영상(쇼츠 제외)
// 아래 카드에서 고르면 그 영상, 아니면 가장 최근 예배 영상
function LatestVideo({ c, color, picked, anchorRef }: { c: SiteContent; color: string; picked?: YtVideo | null; anchorRef?: React.Ref<HTMLElement> }) {
  const src = c.sermonPlaylist || c.youtubeLink;
  const [videos, setVideos] = useState<YtVideo[] | null>(() => (src ? ytMemo.get(src) ?? null : []));
  useEffect(() => {
    if (!src || ytMemo.has(src)) return;
    let cancelled = false;
    loadYt(src).then((d) => { if (!cancelled) setVideos(d.videos); });
    return () => { cancelled = true; };
  }, [src]);
  const manual = c.sermonVideos[0];
  const v: YtVideo | undefined = picked || (manual
    ? { id: manual.youtubeVideoId, title: manual.title, published: manual.date || "" }
    : newestFirst(videos || []).find((x) => !x.short));
  if (!v) return null;
  const date = v.published ? v.published.slice(0, 10).replace(/-/g, ".") : "";
  // 아래 카드에서 고른 영상이면 오른쪽에 이번 주 설교 대신 그 영상 제목·날짜
  const s = picked ? undefined : c.sermons[0]; // 이번 주 설교(주보 / 편집 화면 이번 주 말씀)
  return (
    <section ref={anchorRef} className="scroll-mt-24">
      <p className="text-xs font-black tracking-[0.2em]" style={{ color }}>VIDEO</p>
      <h2 className="mt-2 text-xl sm:text-2xl font-black text-gray-900">{picked ? "선택한 예배 영상" : "예배 영상"}</h2>
      <div className="mt-5 grid gap-5 lg:gap-10 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] items-start">
        <div className="relative aspect-video overflow-hidden rounded-[16px] bg-black">
          <iframe key={v.id} className="block w-full h-full" src={`https://www.youtube.com/embed/${v.id}${picked ? "?autoplay=1" : ""}`} title={v.title || "예배 영상"}
            allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen loading="lazy" />
        </div>
        {/* 오른쪽: 온라인 예배 화면과 같은 구성 — 이번 주 설교 제목(크게) · 본문 말씀 · 날짜 · 설교. 설교 정보가 없으면 영상 제목·날짜 */}
        <div className="lg:pt-2">
          <p className="text-xs font-black tracking-[0.2em]" style={{ color }}>THIS WEEK</p>
          {s ? (
            <>
              <p className="mt-3 text-2xl sm:text-3xl font-black leading-snug text-gray-900 break-keep">{s.title || "말씀"}</p>
              <dl className="mt-6 border-t-2 border-gray-800">
                {s.scripture && (
                  <div className="grid grid-cols-[84px_minmax(0,1fr)] gap-3 py-3.5 border-b border-gray-100">
                    <dt className="text-sm font-bold text-gray-400 pt-0.5">본문 말씀</dt>
                    <dd className="text-[15px] sm:text-base font-bold break-keep" style={{ color }}>{s.scripture}</dd>
                  </div>
                )}
                {s.date && (
                  <div className="grid grid-cols-[84px_minmax(0,1fr)] gap-3 py-3.5 border-b border-gray-100">
                    <dt className="text-sm font-bold text-gray-400 pt-0.5">날짜</dt>
                    <dd className="text-[15px] sm:text-base text-gray-800 tabular-nums">{s.date.replace(/-/g, ".")}</dd>
                  </div>
                )}
                {s.preacher && (
                  <div className="grid grid-cols-[84px_minmax(0,1fr)] gap-3 py-3.5 border-b border-gray-100">
                    <dt className="text-sm font-bold text-gray-400 pt-0.5">설교</dt>
                    <dd className="text-[15px] sm:text-base text-gray-800 break-keep">{s.preacher}</dd>
                  </div>
                )}
              </dl>
            </>
          ) : (
            <>
              <p className="mt-3 text-lg sm:text-2xl font-black leading-snug text-gray-900 break-keep">{v.title}</p>
              {date && <p className="mt-2 text-sm tabular-nums text-gray-500">{date}</p>}
            </>
          )}
          {(c.sermonPlaylist || c.youtubeLink) && (
            <a href={c.sermonPlaylist || c.youtubeLink} target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex h-11 items-center rounded-xl bg-[#FF0000] px-5 text-sm font-bold text-white hover:opacity-90">유튜브 채널에서 보기</a>
          )}
        </div>
      </div>
    </section>
  );
}

// 온라인 예배: 왼쪽 큰 화면 = 교회 유튜브 채널이 지금 실시간 방송 중이면 그 방송, 아니면 가장 최근 영상
// (쇼츠 제외) → 그것도 없으면 온라인 예배에 직접 넣은 영상. 오른쪽 = 이번 주 설교 제목(가장 크게)·본문 말씀·설교자
function OnlineWorshipLive({ c, color, A }: { c: SiteContent; color: string; A: LinkComp }) {
  const ch = c.youtubeLink;
  // 미리 받아 둔 영상 목록이 있으면 기다리지 않고 바로 그림. 실시간 방송 여부는 2분이 지났으면 뒤에서 다시 확인
  const [data, setData] = useState<{ videos: YtVideo[]; live: YtLive } | null>(() => {
    if (!ch) return { videos: [], live: null };
    const v = ytMemo.get(ch);
    return v ? { videos: v, live: ytLiveMemo.get(ch)?.live ?? null } : null;
  });
  useEffect(() => {
    if (!ch) return;
    const lm = ytLiveMemo.get(ch);
    if (ytMemo.has(ch) && lm && Date.now() - lm.t < 2 * 60 * 1000) return;
    let cancelled = false;
    loadYt(ch).then((d) => { if (!cancelled) setData({ videos: d.videos.length ? d.videos : (ytMemo.get(ch) || []), live: d.live }); });
    return () => { cancelled = true; };
  }, [ch]);

  // "최근 예배 영상" 카드 목록은 말씀/영상 탭으로 옮김(2026-11-21) — 여기는 큰 화면만.
  // 실시간 방송 중일 때만 영상, 아니면 "이번 주 예배를 준비하고 있어요" 안내(지난 영상은 말씀 / 영상 탭에서)
  const videoId = data?.live?.id || "";
  const label = data?.live ? "LIVE" : "";
  const s = c.sermons[0];
  const w = c.worship.find((x) => x.time) || c.worship[0]; // 예배 안내의 첫 예배(시간 있는 것)
  const hasPast = c.sermonVideos.length > 0 || (data?.videos || []).some((v) => !v.short) || !!c.sermonPlaylist;
  return (
    <div className="space-y-12">
    <section className="grid gap-6 lg:gap-10 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] items-start">
      <div>
        <div className="relative aspect-video overflow-hidden rounded-[16px] bg-black">
          {videoId ? (
            <iframe className="block w-full h-full" src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1`}
              title={data?.live?.title || "실시간 예배"} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
          ) : data === null ? (
            <div className="w-full h-full flex items-center justify-center text-sm text-white/60">실시간 예배를 확인하는 중…</div>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center px-6 text-center text-white"
              style={{ background: `linear-gradient(150deg, #111827 0%, ${color} 140%)` }}>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] sm:text-xs font-bold text-white/80">
                <span className="h-1.5 w-1.5 rounded-full bg-white/60" />방송 전
              </span>
              <p className="mt-3 sm:mt-4 text-lg sm:text-2xl font-black leading-snug break-keep">이번 주 예배를 준비하고 있어요</p>
              {w?.time && (
                <p className="mt-1.5 sm:mt-2 text-[13px] sm:text-base text-white/75 break-keep">{w.title ? `${w.title} ` : ""}{w.time}에 실시간으로 함께해요</p>
              )}
              {hasPast && (
                <A to="/sermons" className="mt-4 sm:mt-6 inline-flex h-9 sm:h-11 items-center rounded-xl bg-white px-4 sm:px-5 text-[13px] sm:text-sm font-bold text-gray-900 hover:bg-gray-100">지난 예배 영상 보기 →</A>
              )}
            </div>
          )}
        </div>
        {label && (
          <p className="mt-3 flex items-center gap-2 text-sm font-bold text-gray-500">
            {data?.live
              ? <><span className="inline-flex items-center gap-1.5 rounded-md bg-[#FF0000] px-2 py-0.5 text-xs font-black text-white"><span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />LIVE</span>지금 실시간으로 예배를 드리고 있습니다</>
              : label}
          </p>
        )}
      </div>
      <div className="lg:pt-2">
        <p className="text-xs font-black tracking-[0.2em]" style={{ color }}>{data?.live ? "LIVE WORSHIP" : "THIS WEEK"}</p>
        {s ? (
          <>
            <h2 className="mt-3 text-2xl sm:text-3xl font-black leading-snug text-gray-900 break-keep">{s.title || "말씀"}</h2>
            <dl className="mt-6 border-t-2 border-gray-800">
              {s.scripture && (
                <div className="grid grid-cols-[84px_minmax(0,1fr)] gap-3 py-3.5 border-b border-gray-100">
                  <dt className="text-sm font-bold text-gray-400 pt-0.5">본문 말씀</dt>
                  <dd className="text-[15px] sm:text-base font-bold break-keep" style={{ color }}>{s.scripture}</dd>
                </div>
              )}
              {s.date && (
                <div className="grid grid-cols-[84px_minmax(0,1fr)] gap-3 py-3.5 border-b border-gray-100">
                  <dt className="text-sm font-bold text-gray-400 pt-0.5">날짜</dt>
                  <dd className="text-[15px] sm:text-base text-gray-800 tabular-nums">{s.date.replace(/-/g, ".")}</dd>
                </div>
              )}
              {/* 설교: 날짜 밑에. 주보 설교자 칸 → 비었으면 예배 순서의 설교·말씀 선포 담당자 */}
              {s.preacher && (
                <div className="grid grid-cols-[84px_minmax(0,1fr)] gap-3 py-3.5 border-b border-gray-100">
                  <dt className="text-sm font-bold text-gray-400 pt-0.5">설교</dt>
                  <dd className="text-[15px] sm:text-base text-gray-800 break-keep">{s.preacher}</dd>
                </div>
              )}
            </dl>
          </>
        ) : (
          <h2 className="mt-3 text-2xl sm:text-3xl font-black text-gray-900">온라인 예배</h2>
        )}
        {ch && <a href={ch} target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex h-11 items-center rounded-xl bg-[#FF0000] px-5 text-sm font-bold text-white hover:opacity-90">유튜브 채널에서 보기</a>}
      </div>
    </section>
    </div>
  );
}

// 교회 일정(2026-11-12 개편): 위에 가로로 꽉 찬 달력(일요일부터) + 아래 "이 달의 일정" 표(날짜 | 요일 | 일정)
//  - PC: 날짜 칸 안에 일정 제목이 바로 보임(칸당 2개, 넘으면 "+n"). 휴대폰: 칸이 좁아 점으로 표시
//  - 일정 있는 날을 누르면 아래 표에서 그날 일정이 강조됨(다시 누르면 해제)
//  - ‹ › 로 달 이동(부드럽게 바뀜), "오늘" 버튼으로 이번 달로
const pad2 = (n: number) => String(n).padStart(2, "0");
const WEEK_KO = ["일", "월", "화", "수", "목", "금", "토"];
function ScheduleCalendar({ c, color }: { c: SiteContent; color: string }) {
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;
  const [ym, setYm] = useState(() => ({ y: today.getFullYear(), m: today.getMonth() })); // m: 0~11
  const [picked, setPicked] = useState<string | null>(null);
  const [anim, setAnim] = useState<"" | "next" | "prev">("");
  const move = (d: number) => {
    setAnim(d > 0 ? "next" : "prev");
    setPicked(null);
    setYm(({ y, m }) => { const t = new Date(y, m + d, 1); return { y: t.getFullYear(), m: t.getMonth() }; });
  };
  const goToday = () => { setAnim(""); setPicked(null); setYm({ y: today.getFullYear(), m: today.getMonth() }); };
  const monthKey = `${ym.y}-${pad2(ym.m + 1)}`;
  const monthItems = c.schedules.filter((x) => x.date.startsWith(monthKey));
  const byDay = new Map<string, SiteContent["schedules"]>();
  monthItems.forEach((x) => byDay.set(x.date, [...(byDay.get(x.date) || []), x]));
  const first = new Date(ym.y, ym.m, 1).getDay();
  const days = new Date(ym.y, ym.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const dot = (d: string) => d.replace(/-/g, ".");
  const weekdayOf = (d: string) => WEEK_KO[new Date(`${d}T00:00:00`).getDay()];
  const enter = anim === "next" ? "slide-in-from-right-4" : anim === "prev" ? "slide-in-from-left-4" : "";
  const dayColor = (wd: number) => (wd === 0 ? "#EF4444" : wd === 6 ? "#3B82F6" : "#374151");
  return (
    <div className="space-y-8 sm:space-y-10">
      {/* 위: 가로로 꽉 찬 달력 */}
      <div className="rounded-[24px] border border-gray-200 bg-white p-4 sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-3">
            <button type="button" aria-label="이전 달" onClick={() => move(-1)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition-all hover:border-gray-300 hover:text-gray-900 active:scale-90">‹</button>
            <p className="min-w-[120px] text-center text-xl sm:text-2xl font-black text-gray-900 tabular-nums">{ym.y}. {pad2(ym.m + 1)}</p>
            <button type="button" aria-label="다음 달" onClick={() => move(1)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition-all hover:border-gray-300 hover:text-gray-900 active:scale-90">›</button>
          </div>
          <button type="button" onClick={goToday} className="rounded-full border border-gray-200 px-3.5 py-1.5 text-xs sm:text-sm font-bold text-gray-500 transition-colors hover:text-gray-900">오늘</button>
        </div>
        <div key={monthKey} className={`mt-5 sm:mt-6 animate-in fade-in duration-300 ${enter}`}>
          <div className="grid grid-cols-7 border-b border-gray-200 text-center text-xs sm:text-sm font-bold">
            {WEEK_KO.map((w, i) => <div key={w} className="py-2.5" style={{ color: dayColor(i) }}>{w}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((d, i) => {
              const wd = i % 7;
              const lastRow = i >= cells.length - 7;
              const border = `border-gray-100 ${wd < 6 ? "border-r" : ""} ${lastRow ? "" : "border-b"}`;
              if (!d) return <div key={i} className={`min-h-[56px] sm:min-h-[104px] bg-gray-50/40 ${border}`} />;
              const key = `${monthKey}-${pad2(d)}`;
              const items = byDay.get(key) || [];
              const isToday = key === todayKey;
              const isPicked = key === picked;
              return (
                <button key={i} type="button" disabled={!items.length} onClick={() => setPicked(isPicked ? null : key)}
                  className={`relative flex flex-col items-center sm:items-stretch justify-start min-h-[56px] sm:min-h-[104px] p-1 sm:p-2 text-left transition-colors duration-200 ${border} ${items.length ? "cursor-pointer hover:bg-gray-50" : "cursor-default"}`}
                  style={isPicked ? { background: `${color}12` } : undefined}>
                  <span className="flex h-6 w-6 sm:h-7 sm:w-7 shrink-0 items-center justify-center rounded-full text-xs sm:text-sm font-bold"
                    style={isToday ? { background: color, color: "#fff" } : { color: dayColor(wd) }}>{d}</span>
                  {/* PC: 일정 제목(최대 2개 + 나머지 개수) */}
                  <div className="mt-1 hidden sm:block space-y-1">
                    {items.slice(0, 2).map((x) => (
                      <p key={x.id} className="truncate rounded-md px-1.5 py-0.5 text-[12px] font-bold" style={{ background: `${color}14`, color }}>{x.title}</p>
                    ))}
                    {items.length > 2 && <p className="px-1.5 text-[11px] font-bold text-gray-400">+{items.length - 2}</p>}
                  </div>
                  {/* 휴대폰: 점 */}
                  {items.length > 0 && <span className="sm:hidden absolute bottom-1.5 left-1/2 -translate-x-1/2 h-1.5 w-1.5 rounded-full" style={{ background: color }} />}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 아래: 이 달의 일정 표 */}
      <div>
        <div className="flex items-end justify-between pb-3">
          <h2 className="text-xl sm:text-2xl font-black text-gray-900">이 달의 일정</h2>
          <span className="text-sm font-bold text-gray-400 tabular-nums">{ym.y}.{pad2(ym.m + 1)} · {monthItems.length}건</span>
        </div>
        <div className="overflow-hidden border-t-2 border-gray-800">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-xs sm:text-sm font-bold text-gray-500">
                <th className="w-[120px] sm:w-[170px] px-3 sm:px-5 py-3">날짜</th>
                <th className="w-[52px] sm:w-[80px] px-2 sm:px-3 py-3 text-center">요일</th>
                <th className="px-3 sm:px-5 py-3">일정</th>
              </tr>
            </thead>
            <tbody key={`t-${monthKey}`}>
              {monthItems.length === 0 ? (
                <tr><td colSpan={3} className="py-14 text-center text-sm text-gray-400 animate-in fade-in duration-300">이 달에는 등록된 일정이 없습니다.</td></tr>
              ) : monthItems.map((x, i) => {
                const on = picked === x.date;
                const wd = new Date(`${x.date}T00:00:00`).getDay();
                return (
                  <tr key={x.id} className="border-b border-gray-100 transition-all duration-300 animate-in fade-in slide-in-from-bottom-1 fill-mode-both"
                    style={{ animationDelay: `${i * 35}ms`, opacity: picked && !on ? 0.35 : 1, background: on ? `${color}0d` : undefined }}>
                    <td className="px-3 sm:px-5 py-3.5 sm:py-4 tabular-nums text-sm sm:text-[15px] font-black" style={{ color: on ? color : "#595959" }}>{dot(x.date)}</td>
                    <td className="px-2 sm:px-3 py-3.5 sm:py-4 text-center text-sm font-bold" style={{ color: dayColor(wd) }}>{weekdayOf(x.date)}</td>
                    <td className="px-3 sm:px-5 py-3.5 sm:py-4 text-sm sm:text-[15px] font-bold text-gray-900 break-keep">{x.title}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// 앨범 목록: 위쪽에 제목·날짜 검색 + 보기 방식 전환(⊞ 카드형 / ☰ 목록형, 교회 주보 목록과 같은 모양)
//  - 카드형: 대표 사진(첫 장) · 제목 · 날짜 · 사진 수. PC 3칸 / 태블릿 2칸 / 모바일 1칸
//  - 목록형: 번호 | 작은 대표 사진 + 제목 | 날짜 | 사진 수
//  - 한 화면 12개, 넘으면 아래 번호로(4개씩 묶음 · ‹ ›)
function AlbumList({ c, color, A }: { c: SiteContent; color: string; A: LinkComp }) {
  const [q, setQ] = useState("");
  const [view, setView] = useState<"grid" | "table">("grid");
  const [page, setPage] = useState(1);
  if (c.albums.length === 0) return <p className="py-16 text-center text-gray-400">아직 등록된 앨범이 없습니다.</p>;
  const kw = q.trim().replace(/\s+/g, "").toLowerCase();
  const list = kw
    ? c.albums.filter((a) => `${a.title}${a.date}${a.date.replace(/-/g, ".")}`.replace(/\s+/g, "").toLowerCase().includes(kw))
    : c.albums;
  const PER = 12;
  const pages = Math.max(1, Math.ceil(list.length / PER));
  const cur = Math.min(page, pages);
  const shown = list.slice((cur - 1) * PER, cur * PER);
  const fmt = (d: string) => (d ? d.replace(/-/g, ".") : "-");
  const Thumb = ({ a, className }: { a: SiteContent["albums"][number]; className: string }) => (
    <div className={`overflow-hidden ${className}`} style={{ background: `linear-gradient(160deg, ${color}10 0%, ${color}2e 100%)` }}>
      {a.photos[0] ? (
        <img src={a.photos[0]} alt={a.title} loading="lazy" className="block w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-xs font-bold" style={{ color: `${color}88` }}>사진 없음</div>
      )}
    </div>
  );
  return (
    <div>
      <div className="mb-5 flex items-center justify-end gap-3">
        <div className="flex w-full sm:w-80 items-center rounded-lg border border-gray-200 bg-white focus-within:border-gray-400 transition-colors">
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="앨범 제목·날짜 검색"
            className="min-w-0 flex-1 bg-transparent px-4 py-2.5 text-sm outline-none" />
          <Search className="mr-3 h-4 w-4 text-gray-400" />
        </div>
        <div className="inline-flex shrink-0 rounded-2xl bg-gray-100 p-1">
          {([["grid", LayoutGrid, "카드형으로 보기"], ["table", ListIcon, "목록형으로 보기"]] as const).map(([v, Icon, label]) => (
            <button key={v} type="button" onClick={() => { setView(v); setPage(1); }} aria-label={label} title={label}
              className={`flex h-10 w-11 items-center justify-center rounded-xl transition-all ${view === v ? "bg-white shadow-sm text-[#3182F6]" : "text-gray-400 hover:text-gray-600"}`}>
              <Icon className="h-5 w-5" />
            </button>
          ))}
        </div>
      </div>

      {/* 카드형 ↔ 목록형 전환·페이지 넘김 때: 높이는 부드럽게 늘었다 줄었다(SmoothHeight), 새 내용은 아래에서 살짝 올라오며 나타남(디졸브 없음) */}
      <SmoothHeight>
      <div key={`${view}-${cur}-${kw}`} className="animate-in slide-in-from-bottom-3 duration-500 ease-out">
      {list.length === 0 ? (
        <p className="py-16 text-center text-gray-400">'{q}'에 맞는 앨범이 없습니다.</p>
      ) : view === "grid" ? (
        <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((a) => (
            <A key={a.id} to={`/album/${a.id}`} className="group block">
              <Thumb a={a} className="w-full aspect-[4/3] rounded-[16px]" />
              <p className="mt-4 text-lg font-black text-gray-900 group-hover:underline underline-offset-4 break-keep">{a.title}</p>
              <p className="mt-1 text-sm text-gray-400">{[a.date && fmt(a.date), `사진 ${a.photos.length}장`].filter(Boolean).join(" · ")}</p>
            </A>
          ))}
        </div>
      ) : (
        <div className="border-t-2 border-gray-800">
          <div className="hidden sm:grid grid-cols-[56px_minmax(0,1fr)_120px_88px] gap-4 px-1 py-3 border-b border-gray-200 text-sm font-bold text-gray-400">
            <span className="text-center">번호</span><span>앨범</span><span className="text-center">날짜</span><span className="text-center">사진</span>
          </div>
          {shown.map((a, k) => (
            <A key={a.id} to={`/album/${a.id}`} className="group grid grid-cols-[minmax(0,1fr)] sm:grid-cols-[56px_minmax(0,1fr)_120px_88px] items-center gap-4 px-1 py-3 border-b border-gray-100 hover:bg-gray-50/70">
              <span className="hidden sm:block text-center text-sm tabular-nums text-gray-500">{list.length - ((cur - 1) * PER + k)}</span>
              <span className="flex min-w-0 items-center gap-3">
                <Thumb a={a} className="h-12 w-16 shrink-0 rounded-lg" />
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-bold text-gray-900 group-hover:underline underline-offset-4">{a.title}</span>
                  <span className="sm:hidden mt-0.5 block text-xs tabular-nums text-gray-400">{[a.date && fmt(a.date), `사진 ${a.photos.length}장`].filter(Boolean).join(" · ")}</span>
                </span>
              </span>
              <span className="hidden sm:block text-center text-sm tabular-nums text-gray-600">{fmt(a.date)}</span>
              <span className="hidden sm:block text-center text-sm tabular-nums text-gray-600">{a.photos.length}장</span>
            </A>
          ))}
        </div>
      )}
      </div>
      </SmoothHeight>
      <PageNav pages={pages} cur={cur} onChange={setPage} />
    </div>
  );
}

// 앨범 상세: 사진 격자, 누르면 크게 보기(좌우 넘기기·ESC로 닫기)
function AlbumDetail({ c, id, color, A }: { c: SiteContent; id: string; color: string; A: LinkComp }) {
  const album = c.albums.find((a) => a.id === id);
  const [open, setOpen] = useState<number | null>(null);
  const count = album?.photos.length || 0;
  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") setOpen((i) => (i === null ? i : (i + 1) % count));
      if (e.key === "ArrowLeft") setOpen((i) => (i === null ? i : (i - 1 + count) % count));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, count]);
  if (!album) return <p className="py-16 text-center text-gray-400">앨범을 찾을 수 없습니다.</p>;
  return (
    <div>
      <h2 className="text-2xl font-black text-gray-900 break-keep">{album.title}</h2>
      <div className="mt-2 h-px w-10" style={{ background: color }} />
      <p className="mt-3 text-sm text-gray-400">{[album.date, `사진 ${count}장`].filter(Boolean).join(" · ")}</p>
      {count === 0 ? (
        <p className="py-16 text-center text-gray-400">아직 올린 사진이 없습니다.</p>
      ) : (
        <div className="mt-6 grid gap-2 sm:gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          {album.photos.map((src, i) => (
            <button key={i} type="button" onClick={() => setOpen(i)} className="block w-full aspect-square overflow-hidden rounded-xl bg-gray-100">
              <img src={src} alt={`${album.title} ${i + 1}`} loading="lazy" className="block w-full h-full object-cover transition-transform duration-500 hover:scale-[1.04]" />
            </button>
          ))}
        </div>
      )}
      <A to="/album" className="inline-block mt-8 text-sm font-bold" style={{ color }}>← 앨범 목록으로</A>
      {open !== null && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center" onClick={() => setOpen(null)}>
          <img src={album.photos[open]} alt="" className="max-w-[92vw] max-h-[86vh] object-contain" onClick={(e) => e.stopPropagation()} />
          <button type="button" aria-label="닫기" className="absolute top-4 right-4 w-11 h-11 text-white text-3xl leading-none" onClick={() => setOpen(null)}>×</button>
          {count > 1 && (
            <>
              <button type="button" aria-label="이전 사진" className="absolute left-2 sm:left-6 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 text-white text-2xl"
                onClick={(e) => { e.stopPropagation(); setOpen((open - 1 + count) % count); }}>‹</button>
              <button type="button" aria-label="다음 사진" className="absolute right-2 sm:right-6 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 text-white text-2xl"
                onClick={(e) => { e.stopPropagation(); setOpen((open + 1) % count); }}>›</button>
            </>
          )}
          <p className="absolute bottom-5 left-0 right-0 text-center text-sm text-white/70">{open + 1} / {count}</p>
        </div>
      )}
    </div>
  );
}

// 주보 미리보기(휴대폰 틀) + 바로가기 버튼 + (온라인 주보 페이지만) 고정 QR
// 스마트폰 모양 미리보기 안의 주보 화면. 다른 주소(bulletin.stayon-platform.com)에서 띄우면 브라우저 보안상
// 안쪽 스크롤바를 숨길 수 없어서, 같은 주소의 /view/... 로 띄운 뒤 안쪽 문서에 스크롤바 숨김 스타일만 넣음
// (주보 화면 코드·QR 주소는 그대로). 버튼·QR은 원래 주소를 그대로 씀
function PhoneFrame({ src, title }: { src: string; title: string }) {
  const sameOrigin = src.replace(/^https:\/\/bulletin\.stayon-platform\.com/, "");
  const hideScrollbar = (e: React.SyntheticEvent<HTMLIFrameElement>) => {
    try {
      const doc = e.currentTarget.contentDocument;
      if (!doc) return;
      const style = doc.createElement("style");
      style.textContent = "html,body,*{scrollbar-width:none!important}*::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}";
      doc.head.appendChild(style);
    } catch { /* 다른 주소로 열린 경우엔 그대로 둠 */ }
  };
  return <iframe key={sameOrigin} src={sameOrigin} title={title} onLoad={hideScrollbar} className="block w-full h-full" />;
}

// 교회 소식 목록: 온라인 주보에 들어간 교회 소식을 주보(주)별로 한 줄씩, 교회 주보와 같은 투박한 표
function NewsTable({ c, A }: { c: SiteContent; A: LinkComp }) {
  const PAGE = 10;
  const [page, setPage] = useState(1);
  // 온라인 주보 플랫폼의 교회 소식만(빌더에서 직접 쓴 소식 site-* 은 제외), 날짜 최신순
  const list = c.news.filter((n) => !n.id.startsWith("site-")).sort((a, z) => z.date.localeCompare(a.date));
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const cur = Math.min(page, pages);
  const shown = list.slice((cur - 1) * PAGE, cur * PAGE);
  // 제목은 "2026. 11. 29 교회 소식" 형태(날짜 없는 예전 소식만 첫 제목으로)
  const titleOf = (n: SiteContent["news"][number]) => {
    if (n.date) return `${n.date.replace(/-/g, ". ")} 교회 소식`;
    const titles = n.items.map((i) => i.title).filter(Boolean);
    return titles.length === 0 ? "교회 소식" : titles.length === 1 ? titles[0] : `${titles[0]} 외 ${titles.length - 1}건`;
  };
  return (
    <div>
      <div className="overflow-x-auto border-y border-gray-300 bg-white">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-gray-100 border-b border-gray-300 text-gray-700">
            <tr>
              <th className="hidden sm:table-cell w-16 border-r border-gray-300 px-4 py-3 text-center font-bold">번호</th>
              <th className="border-r border-gray-300 px-4 py-3 font-bold">제목</th>
              <th className="hidden sm:table-cell w-32 border-r border-gray-300 px-4 py-3 text-center font-bold">작성일</th>
              <th className="w-20 px-4 py-3 text-center font-bold">보기</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-14 text-center text-gray-400">아직 교회 소식이 없어요</td></tr>
            )}
            {shown.map((n, i) => (
              <tr key={n.id} className="border-b border-gray-200 hover:bg-gray-50">
                <td className="hidden sm:table-cell border-r border-gray-200 px-4 py-3.5 text-center tabular-nums text-gray-500">{list.length - ((cur - 1) * PAGE + i)}</td>
                <td className="border-r border-gray-200 px-4 py-3.5">
                  <A to={`/news/${n.id}`} className="block text-gray-900 hover:underline break-keep">{titleOf(n)}</A>
                  <span className="sm:hidden mt-0.5 block text-xs tabular-nums text-gray-400">{n.date.replace(/-/g, ".")}</span>
                </td>
                <td className="hidden sm:table-cell border-r border-gray-200 px-4 py-3.5 text-center tabular-nums text-gray-600">{n.date.replace(/-/g, ".")}</td>
                <td className="px-4 py-3.5 text-center">
                  {/* 토스 느낌의 보기 버튼: 연한 파랑 바탕 + 파랑 글씨, 누르면 살짝 눌림 */}
                  <A to={`/news/${n.id}`} className="inline-flex items-center justify-center rounded-lg bg-[#E8F3FF] px-3.5 py-1.5 text-[13px] font-bold text-[#3182F6] transition-all duration-150 hover:bg-[#D7E9FF] active:scale-95">보기</A>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="mt-6 flex justify-center gap-1">
          {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
            <button key={n} onClick={() => setPage(n)}
              className={`h-9 min-w-9 border px-3 text-sm font-bold ${n === cur ? "border-gray-700 bg-gray-700 text-white" : "border-gray-300 text-gray-600 hover:bg-gray-100"}`}>{n}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// 교회 소식 상세: 게시판 글처럼 제목 줄 / 등록일 / 소식 내용 / 목록 버튼만
function NewsPost({ c, id, A }: { c: SiteContent; id: string; A: LinkComp }) {
  const n = c.news.find((x) => x.id === id);
  if (!n) return <p className="py-16 text-center text-gray-400">소식을 찾을 수 없습니다.</p>;
  const date = n.date.replace(/-/g, ".");
  return (
    <div>
      <div className="border-t-2 border-gray-700">
        <p className="border-b border-gray-300 bg-gray-50 px-4 py-4 text-lg font-bold text-gray-900">{n.date.replace(/-/g, ". ")} 교회 소식</p>
        <p className="border-b border-gray-200 px-4 py-2.5 text-sm text-gray-500">등록일 {date}</p>
        <div className="divide-y divide-gray-100 px-4">
          {/* 전체 안내: 번호 없이 맨 위 */}
          {n.notice && <div className="py-6"><p className="leading-[1.9] text-gray-800">{nlBold(n.notice)}</p></div>}
          {n.items.map((it, i) => (
            <div key={i} className="py-6">
              {it.title && <p className="font-bold text-gray-900">{i + 1}. {it.title}</p>}
              {it.content && <p className="mt-2 leading-[1.9] text-gray-700">{nl(it.content)}</p>}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-6 border-t border-gray-300 pt-6 text-right">
        <A to="/news" className="inline-block border border-gray-300 bg-white px-5 py-2 text-sm font-bold text-gray-700 hover:bg-gray-100">목록</A>
      </div>
    </div>
  );
}

// 교회 주보 = 교회가 빌더에서 올린 종이 주보 파일(한글·워드·PDF·사진). 누르면 그 파일이 열림
// (PDF·사진은 새 창에서 바로 보기, 한글·워드는 내려받기). 온라인 주보로 넘어가지 않음.
// 오른쪽 위 아이콘으로 보기 방식 전환: ☰ 목록형(기본, 딱딱한 표) / ⊞ 카드형(월별 묶음 + 날짜 칩)
const VIEWABLE = ["pdf", "jpg", "jpeg", "png", "webp", "images", "link"];
const fileLabel = (t: string) => (t === "hwp" || t === "hwpx" ? "한글" : t === "doc" || t === "docx" ? "워드" : t === "pdf" ? "PDF" : t === "link" ? "링크" : "사진");
const openLabel = (t: string) => (t === "link" ? "열기" : VIEWABLE.includes(t) ? "보기" : "내려받기");
// 교회 주보 상세(2026-11-17): 목록·홈 화면에서 누르면 교회 소식처럼 별도 화면(/bulletins/{주보 id})으로 이동.
// 사진은 위→아래로 이어서, PDF는 화면 안에 펼쳐서(+새 창 열기), 링크는 바로가기 버튼, 한글·워드는 내려받기
type PaperItem = SiteContent["paperBulletins"][number];
const paperPath = (b: PaperItem) => `/bulletins/${b.id}`;
const isPhotoPaper = (b: PaperItem) => b.fileType === "images" || ["jpg", "jpeg", "png", "webp"].includes(b.fileType);
function PaperPost({ c, b, A, color }: { c: SiteContent; b: PaperItem; A: LinkComp; color: string }) {
  const date = b.date.replace(/-/g, ".");
  const imgs = b.images.length ? b.images : [b.fileUrl];
  // 이전·다음 주보(날짜순)
  const list = [...c.paperBulletins].sort((x, z) => z.date.localeCompare(x.date));
  const idx = list.findIndex((x) => x.id === b.id);
  const newer = idx > 0 ? list[idx - 1] : null;
  const older = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null;
  const btn = "inline-flex items-center justify-center gap-1.5 rounded-lg px-5 py-3 text-sm font-bold text-white transition hover:brightness-110";
  return (
    <div>
      <div className="border-t-2 border-gray-700">
        <p className="border-b border-gray-300 bg-gray-50 px-4 py-4 text-lg font-bold text-gray-900">{b.title || `${date} 주보`}</p>
        <p className="border-b border-gray-200 px-4 py-2.5 text-sm text-gray-500">주보 날짜 {date} · {fileLabel(b.fileType)}{b.fileType === "images" && imgs.length > 1 ? ` ${imgs.length}장` : ""}</p>
        <div className="px-0 sm:px-4 py-6">
          {isPhotoPaper(b) ? (
            <div className="mx-auto flex max-w-3xl flex-col gap-4">
              {imgs.map((u, i) => <img key={u + i} src={u} alt={`${b.title || "주보"} ${i + 1}`} loading={i < 2 ? "eager" : "lazy"} className="block w-full rounded-lg border border-gray-100 shadow-sm" />)}
            </div>
          ) : b.fileType === "pdf" ? (
            <div>
              {/* PC는 화면 안에 펼쳐서, 휴대폰은 화면 안 보기가 잘 안 돼서 새 창 버튼 위주 */}
              <iframe src={b.fileUrl} title={b.title || "주보"} className="hidden md:block h-[80vh] w-full rounded-lg border border-gray-200 bg-gray-50" />
              <div className="mt-4 text-center">
                <a href={b.fileUrl} target="_blank" rel="noopener noreferrer" className={btn} style={{ background: color }}>PDF 새 창에서 보기 →</a>
              </div>
            </div>
          ) : b.fileType === "link" ? (
            <div className="rounded-2xl bg-gray-50 px-6 py-10 text-center">
              <p className="text-gray-600">이 주보는 아래 주소에 올려져 있어요.</p>
              <p className="mt-1 truncate text-sm text-gray-400">{b.fileUrl}</p>
              <a href={b.fileUrl} target="_blank" rel="noopener noreferrer" className={`${btn} mt-5`} style={{ background: color }}>주보 보러 가기 →</a>
            </div>
          ) : (
            <div className="rounded-2xl bg-gray-50 px-6 py-10 text-center">
              <p className="text-gray-600">{fileLabel(b.fileType)} 파일이라 내려받아서 볼 수 있어요.</p>
              <p className="mt-1 truncate text-sm text-gray-400">{b.fileName}</p>
              <a href={b.fileUrl} download={b.fileName} className={`${btn} mt-5`} style={{ background: color }}>주보 내려받기</a>
            </div>
          )}
        </div>
      </div>
      {/* 이전·다음 주보 + 목록 */}
      <div className="mt-6 border-t border-gray-300">
        {newer && <A to={paperPath(newer)} className="flex gap-4 border-b border-gray-100 px-2 py-3 text-sm hover:bg-gray-50"><span className="w-14 shrink-0 font-bold text-gray-400">다음 주보</span><span className="truncate text-gray-800">{newer.title || `${newer.date.replace(/-/g, ".")} 주보`}</span></A>}
        {older && <A to={paperPath(older)} className="flex gap-4 border-b border-gray-100 px-2 py-3 text-sm hover:bg-gray-50"><span className="w-14 shrink-0 font-bold text-gray-400">이전 주보</span><span className="truncate text-gray-800">{older.title || `${older.date.replace(/-/g, ".")} 주보`}</span></A>}
        <div className="pt-6 text-right">
          <A to="/bulletins" className="inline-block border border-gray-300 bg-white px-5 py-2 text-sm font-bold text-gray-700 hover:bg-gray-100">목록</A>
        </div>
      </div>
    </div>
  );
}

function BulletinTable({ c, color, A }: { c: SiteContent; color: string; A: LinkComp }) {
  const PAGE = 10;
  const [view, setView] = useState<"table" | "grid">("table");
  const [q, setQ] = useState("");
  const [desc, setDesc] = useState(true);
  const [page, setPage] = useState(1);
  const keyword = q.trim().toLowerCase();
  const rows = c.paperBulletins
    .filter((b) => !keyword || [b.title, b.date, b.fileName].join(" ").toLowerCase().includes(keyword))
    .sort((a, z) => (desc ? z.date.localeCompare(a.date) : a.date.localeCompare(z.date)));
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const cur = Math.min(page, pages);
  const shown = rows.slice((cur - 1) * PAGE, cur * PAGE);
  const fmtDate = (d: string) => d.replace(/-/g, ".");

  return (
    <div>
      <div className="mb-4 flex items-center justify-end gap-3">
        <div className="flex w-full sm:w-80 items-center rounded-lg border border-gray-200 bg-white focus-within:border-gray-400 transition-colors">
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="제목·날짜 검색"
            className="min-w-0 flex-1 bg-transparent px-4 py-2.5 text-sm outline-none" />
          <Search className="mr-3 h-4 w-4 text-gray-400" />
        </div>
        {/* 보기 방식 전환 */}
        <div className="inline-flex shrink-0 rounded-2xl bg-gray-100 p-1">
          {([["grid", LayoutGrid, "카드형으로 보기"], ["table", ListIcon, "목록형으로 보기"]] as const).map(([v, Icon, label]) => (
            <button key={v} onClick={() => setView(v)} aria-label={label} title={label}
              className={`flex h-10 w-11 items-center justify-center rounded-xl transition-all ${view === v ? "bg-white shadow-sm text-[#3182F6]" : "text-gray-400 hover:text-gray-600"}`}>
              <Icon className="h-5 w-5" />
            </button>
          ))}
        </div>
      </div>

      {view === "table" ? (
        <>
          <div className="overflow-x-auto border-y border-gray-300 bg-white">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-gray-100 border-b border-gray-300 text-gray-700">
                <tr>
                  <th className="hidden sm:table-cell w-16 px-4 py-3 text-center font-bold">번호</th>
                  <th className="px-4 py-3 font-bold">제목</th>
                  <th className="hidden md:table-cell w-24 px-4 py-3 font-bold">파일</th>
                  <th className="hidden sm:table-cell w-32 px-4 py-3 font-bold">
                    <button onClick={() => setDesc((v) => !v)} className="inline-flex items-center gap-1 hover:text-gray-900">날짜 <span className="text-xs">{desc ? "▼" : "▲"}</span></button>
                  </th>
                  <th className="w-24 px-4 py-3 text-center font-bold">보기</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {shown.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-14 text-center text-gray-400">{c.paperBulletins.length === 0 ? "아직 올린 주보가 없어요" : "찾는 주보가 없어요"}</td></tr>
                )}
                {shown.map((b, i) => {
                  const no = desc ? rows.length - ((cur - 1) * PAGE + i) : (cur - 1) * PAGE + i + 1;
                  return (
                    <tr key={b.id} className="hover:bg-gray-50 transition-colors">
                      <td className="hidden sm:table-cell px-4 py-4 text-center tabular-nums text-gray-400">{no}</td>
                      <td className="px-4 py-4">
                        <A to={paperPath(b)} className="block">
                          <span className="font-bold text-gray-900 hover:underline break-keep">{b.title || `${fmtDate(b.date)} 주보`}</span>
                          <span className="sm:hidden mt-0.5 block text-xs tabular-nums text-gray-400">{fmtDate(b.date)} · {fileLabel(b.fileType)}</span>
                        </A>
                      </td>
                      <td className="hidden md:table-cell px-4 py-4 text-gray-600">{fileLabel(b.fileType)}</td>
                      <td className="hidden sm:table-cell px-4 py-4 tabular-nums text-gray-500">{fmtDate(b.date)}</td>
                      <td className="px-4 py-4 text-center">
                        <A to={paperPath(b)} className="inline-block border border-gray-300 bg-white px-3 py-1 text-xs font-bold text-gray-700 hover:bg-gray-100">보기</A>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="mt-6 flex justify-center gap-1">
              {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
                <button key={n} onClick={() => setPage(n)}
                  className={`h-9 min-w-9 px-3 rounded-lg text-sm font-bold transition-colors ${n === cur ? "text-white" : "text-gray-500 hover:bg-gray-100"}`}
                  style={n === cur ? { background: color } : undefined}>{n}</button>
              ))}
            </div>
          )}
        </>
      ) : (
        <BulletinCards rows={rows} color={color} A={A} />
      )}
    </div>
  );
}

// 카드형 보기: 월별 묶음 + 줄 앞 날짜 칩(날짜·요일) + 제목·파일 형식, 줄 전체가 파일 링크. 12개씩 "이전 주보 더 보기"
function BulletinCards({ rows, color, A }: { rows: SiteContent["paperBulletins"]; color: string; A: LinkComp }) {
  const STEP = 12;
  const [limit, setLimit] = useState(STEP);
  const shown = rows.slice(0, limit);
  const months: { label: string; items: typeof shown }[] = [];
  shown.forEach((b) => {
    const [y, m] = b.date.split("-");
    const label = y && m ? `${y}년 ${Number(m)}월` : "날짜 미정";
    let g = months.find((x) => x.label === label);
    if (!g) { g = { label, items: [] }; months.push(g); }
    g.items.push(b);
  });
  const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
  const dayOf = (d: string) => { const t = new Date(`${d}T00:00:00`); return Number.isNaN(t.getTime()) ? "" : WEEK[t.getDay()]; };
  return (
    <div className="pt-4">
      {months.length === 0 && <p className="py-16 text-center text-gray-400">찾는 주보가 없어요</p>}
      <div className="space-y-10">
        {months.map((g) => (
          <section key={g.label}>
            <p className="mb-3 text-sm font-black" style={{ color }}>{g.label}</p>
            <ul className="border-t border-gray-200">
              {g.items.map((b) => (
                <li key={b.id} className="border-b border-gray-100">
                  <A to={paperPath(b)} className="group flex items-center gap-4 sm:gap-5 py-4 transition-colors hover:bg-gray-50/80">
                    <span className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl" style={{ background: `${color}12` }}>
                      <span className="text-xl font-black leading-none tabular-nums" style={{ color }}>{Number(b.date.split("-")[2]) || "-"}</span>
                      <span className="mt-1 text-[11px] font-bold text-gray-500">{dayOf(b.date)}요일</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold text-gray-900 truncate">{b.title || "주보"}</span>
                      <span className="mt-1 block text-sm text-gray-500">{fileLabel(b.fileType)} 파일 · {openLabel(b.fileType)}</span>
                    </span>
                    <span aria-hidden className="shrink-0 pr-1 text-2xl text-gray-300 transition-transform group-hover:translate-x-1 group-hover:text-gray-500">›</span>
                  </A>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {rows.length > limit && (
        <div className="mt-10 text-center">
          <button onClick={() => setLimit((n) => n + STEP)} className="rounded-full border border-gray-200 px-6 py-3 text-sm font-bold text-gray-700 transition hover:bg-gray-50">
            이전 주보 더 보기 ({rows.length - limit})
          </button>
        </div>
      )}
    </div>
  );
}

// 온라인 주보: 왼쪽 주보 목록 | 가운데 스마트폰 화면 | 오른쪽 제목·버튼·QR.
// 목록을 누르면 페이지 이동 없이 가운데 화면만 그 주보로 바뀜. QR은 항상 고정 주소(/view/교회ID)
// 안의 내용 높이가 바뀌면(페이지를 넘겨 줄 수가 달라질 때 등) 틱 바뀌지 않고 부드럽게 늘었다 줄었다 함(투명해지는 효과 없음)
function SmoothHeight({ children }: { children: React.ReactNode }) {
  const inner = useRef<HTMLDivElement>(null);
  const [h, setH] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    setH(el.offsetHeight);
    const ro = new ResizeObserver(() => setH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div style={{ height: h, overflow: "hidden", transition: "height 560ms cubic-bezier(0.22, 1, 0.36, 1)" }}>
      <div ref={inner}>{children}</div>
    </div>
  );
}

// 페이지 번호: 한 번에 4개까지만(1~4, 5~8 …). 4개가 넘으면 양옆 < > 로 앞뒤 묶음으로 넘김
function PageNav({ pages, cur, onChange }: { pages: number; cur: number; onChange: (n: number) => void }) {
  if (pages <= 1) return null;
  const SHOW = 4;
  const start = Math.floor((cur - 1) / SHOW) * SHOW + 1;
  const end = Math.min(pages, start + SHOW - 1);
  const btn = "h-9 min-w-9 border px-3 text-sm font-bold";
  return (
    <div className="mt-5 flex justify-center gap-1">
      {pages > SHOW && (
        <button type="button" aria-label="이전 페이지들" disabled={start === 1} onClick={() => onChange(start - 1)}
          className={`${btn} border-gray-300 text-gray-600 hover:bg-gray-100 disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent`}>&lt;</button>
      )}
      {Array.from({ length: end - start + 1 }, (_, i) => start + i).map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)}
          className={`${btn} ${n === cur ? "border-gray-700 bg-gray-700 text-white" : "border-gray-300 text-gray-600 hover:bg-gray-100"}`}>{n}</button>
      ))}
      {pages > SHOW && (
        <button type="button" aria-label="다음 페이지들" disabled={end === pages} onClick={() => onChange(end + 1)}
          className={`${btn} border-gray-300 text-gray-600 hover:bg-gray-100 disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent`}>&gt;</button>
      )}
    </div>
  );
}

function JuboPage({ c, color, initialId, A }: { c: SiteContent; color: string; initialId?: string; A: LinkComp }) {
  const [selectedId, setSelectedId] = useState(initialId || c.latestBulletinId);
  const selected = c.bulletins.find((b) => b.id === selectedId) || c.bulletins.find((b) => b.id === c.latestBulletinId);
  const isLatest = !selected || selected.id === c.latestBulletinId;
  const url = isLatest ? fixedBulletinUrl(c.ownerId) : `https://bulletin.stayon-platform.com/view/${selected!.id}`;
  // 왼쪽 목록: 한 화면에 7개까지, 나머지는 아래 번호로 넘김(처음엔 선택된 주보가 있는 페이지)
  const PER = 7;
  const pages = Math.max(1, Math.ceil(c.bulletins.length / PER));
  const [page, setPage] = useState(() => {
    const idx = c.bulletins.findIndex((b) => b.id === (initialId || c.latestBulletinId));
    return idx >= 0 ? Math.floor(idx / PER) + 1 : 1;
  });
  const cur = Math.min(page, pages);
  return (
    <div className="grid gap-8 lg:gap-10 lg:grid-cols-[minmax(0,1fr)_360px_260px] items-start">
      {/* 왼쪽: 온라인 주보 목록 — 칸마다 선이 있는 단순한 표. 누르면 가운데 화면만 바뀜 */}
      {/* 휴대폰: 목록 → 휴대폰 화면 → 정보 순(목록을 맨 위로). PC: 왼쪽 목록 | 가운데 휴대폰 | 오른쪽 정보 */}
      <div className="order-1 lg:order-1">
      {/* 표 오른쪽 위 "더보기" → 교회 주보 목록(/bulletins) */}
      <div className="mb-2 flex justify-end">
        <A to="/bulletins" className="text-sm font-bold text-gray-500 hover:text-gray-900">더보기 +</A>
      </div>
      <SmoothHeight>
      <div className="border-y border-gray-300">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="w-12 border-b border-r border-gray-300 px-2 py-4 text-center font-bold text-gray-700">번호</th>
              <th className="w-24 border-b border-r border-gray-300 px-2 py-4 text-center font-bold text-gray-700">날짜</th>
              <th className="border-b border-gray-300 px-3 py-4 text-left font-bold text-gray-700">제목</th>
            </tr>
          </thead>
          <tbody>
            {c.bulletins.slice((cur - 1) * PER, cur * PER).map((b, k) => {
              const i = (cur - 1) * PER + k;
              const on = b.id === (selected?.id || "");
              const live = b.status === "published"; // 지금 발행 중인 주보 = 이번 주
              return (
                <tr key={b.id} onClick={() => setSelectedId(b.id)} className={`cursor-pointer ${on ? "bg-gray-100" : "hover:bg-gray-50"}`}>
                  <td className="border-b border-r border-gray-200 px-2 py-4 text-center tabular-nums text-gray-500">{c.bulletins.length - i}</td>
                  <td className="border-b border-r border-gray-200 px-2 py-4 text-center tabular-nums text-gray-600">{b.date.replace(/-/g, ".")}</td>
                  <td className={`border-b border-gray-200 px-3 py-4 ${on ? "font-bold text-gray-900" : "text-gray-800"}`}>
                    {/* 이번 주(발행 중) 주보: 제목 앞에 작은 사각 배지 */}
                    {live && <span className="mr-1.5 inline-block align-[1px] rounded-sm px-1.5 py-px text-[11px] font-bold leading-[18px] text-white" style={{ background: color }}>이번 주</span>}
                    {b.title || "주보"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </SmoothHeight>
      <PageNav pages={pages} cur={cur} onChange={setPage} />
      {/* 휴대폰에서만: 목록을 누르면 바로 아래 휴대폰 화면에서 그 주보를 볼 수 있다는 안내 */}
      <p className="lg:hidden mt-5 flex items-center justify-center gap-1.5 rounded-xl bg-gray-50 px-4 py-3 text-center text-[13px] font-semibold text-gray-600 break-keep">
        목록에서 주보를 누르면 바로 아래 화면에서 실시간 주보를 볼 수 있어요
        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 animate-bounce" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></svg>
      </p>
      </div>
      {/* 가운데: 스마트폰 화면 */}
      <div className="order-2 lg:order-2 mx-auto w-[320px] sm:w-[360px] h-[640px] rounded-[2.5rem] border-[10px] border-gray-900 overflow-hidden shadow-xl bg-white">
        <PhoneFrame src={url} title={selected ? `${selected.date} 주보` : "온라인 주보"} />
      </div>
      {/* 오른쪽: 제목·버튼·QR */}
      {/* 휴대폰(2026-11-25): 위 휴대폰 화면 바로 아래에 붙는 카드 하나로 정리(날짜·제목 + 꽉 찬 버튼).
          QR은 이미 휴대폰으로 보고 있으니 PC에서만 */}
      <div className="order-3 lg:order-3 w-full max-w-[320px] sm:max-w-[360px] mx-auto lg:mx-0 lg:max-w-none lg:w-auto flex flex-col items-stretch lg:items-start gap-5 lg:pt-4">
        <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 lg:border-0 lg:bg-transparent lg:p-0">
          <div className="flex items-center gap-2 lg:block">
            <p className="text-[11px] lg:text-xs font-black tracking-[0.2em]" style={{ color }}>{isLatest ? "THIS WEEK" : "ARCHIVE"}</p>
            {selected && <p className="lg:hidden text-[13px] font-bold tabular-nums text-gray-400">· {selected.date.replace(/-/g, ".")}</p>}
          </div>
          <p className="hidden lg:block mt-2 text-2xl font-black text-gray-900">{isLatest ? "이번 주 온라인 주보" : "지난 주보"}</p>
          {/* PC: 날짜와 제목을 줄바꿈해서 따로 — 날짜는 작게, 제목은 한 단계 크게. 휴대폰: 날짜는 위 이름표 옆 */}
          {selected && (
            <div className="mt-1.5 lg:mt-3">
              <p className="hidden lg:block text-sm font-bold tabular-nums text-gray-400">{selected.date}</p>
              <p className="lg:mt-1 text-[17px] lg:text-lg font-bold leading-snug text-gray-900 lg:text-gray-800 break-keep">{selected.title || (isLatest ? "이번 주 온라인 주보" : "지난 주보")}</p>
            </div>
          )}
          <a href={url} target="_blank" rel="noopener noreferrer"
            className="mt-4 flex lg:hidden w-full items-center justify-center gap-1.5 rounded-xl py-3.5 text-[15px] font-bold text-white" style={{ background: color }}>
            주보 크게 보기 <span aria-hidden>↗</span>
          </a>
        </div>
        <a href={url} target="_blank" rel="noopener noreferrer" className="hidden lg:inline-block px-6 py-3 rounded-lg text-white font-bold" style={{ background: color }}>모바일 주보 보기</a>
        <div className="hidden lg:inline-flex flex-col items-center gap-2 rounded-2xl border border-gray-100 p-5 shadow-sm">
          <QRCodeSVG value={fixedBulletinUrl(c.ownerId)} size={160} />
          <p className="text-xs text-gray-500">휴대폰 카메라로 찍으면 이번 주 주보가 열려요</p>
        </div>
      </div>
    </div>
  );
}

function BulletinPreview({ title, sub, url, color, qr }: { title: string; sub: string; url: string; color: string; qr?: boolean }) {
  return (
    <div className="grid gap-8 md:grid-cols-[400px_1fr] items-start">
      <div className="mx-auto w-[320px] sm:w-[360px] h-[640px] rounded-[2.5rem] border-[10px] border-gray-900 overflow-hidden shadow-xl bg-white">
        <PhoneFrame src={url} title={title} />
      </div>
      {/* 휴대폰: 휴대폰 화면 아래 카드 하나(제목 + 꽉 찬 버튼), QR은 PC에서만 */}
      <div className="w-full max-w-[320px] sm:max-w-[360px] mx-auto md:mx-0 md:max-w-none flex flex-col items-stretch md:items-start gap-5 rounded-2xl border border-gray-100 bg-gray-50 p-4 md:border-0 md:bg-transparent md:p-0">
        <div>
          <p className="text-[17px] md:text-2xl font-black text-gray-900 break-keep">{title}</p>
          {sub && <p className="mt-1 text-sm md:text-base text-gray-500">{sub}</p>}
        </div>
        <a href={url} target="_blank" rel="noopener noreferrer" className="flex md:inline-block w-full md:w-auto items-center justify-center -mt-1 md:mt-0 px-6 py-3.5 md:py-3 rounded-xl md:rounded-lg text-white font-bold" style={{ background: color }}>모바일 주보 보기</a>
        {qr && (
          <div className="hidden md:inline-flex flex-col items-center gap-2 rounded-2xl border border-gray-100 p-5 shadow-sm">
            <QRCodeSVG value={url} size={160} />
            <p className="text-xs text-gray-500">휴대폰 카메라로 찍으면 주보가 열립니다</p>
          </div>
        )}
      </div>
    </div>
  );
}
