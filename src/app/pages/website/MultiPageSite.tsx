import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { QRCodeSVG } from "qrcode.react";
import { LayoutGrid, List as ListIcon, Search } from "lucide-react";
import { ChurchSite } from "../../../utils/churchSite";
import { denominationLogoSrc } from "../../../utils/denominations";
import { fetchOwnerData, buildSiteContent, OwnerData, SiteContent, fixedBulletinUrl } from "../../../utils/churchSiteContent";

// 교회 홈페이지 "페이지 전환형" 화면. 메뉴마다 주소(/about, /worship …)가 따로 있고,
// 각 페이지가 따로 검색엔진에 걸리도록 진짜 <a href> 링크로 이동한다.
// 내용은 utils/churchSiteContent.ts가 모바일 주보 데이터를 먼저, 없으면 빌더 입력값으로 채운다.
// 서버 검색봇용 페이지(functions/src/churchSiteSeo.ts)와 메뉴 주소·표시 조건이 같아야 한다.

type PageKey =
  | "home" | "about" | "pastor" | "history" | "staff" | "location"
  | "worship" | "online" | "sermons" | "bulletins" | "jubo"
  | "news" | "column" | "prayer";

interface PageDef { key: PageKey; path: string; label: string }
interface GroupDef { en: string; label: string; pages: PageDef[] }

export const SITE_GROUPS: GroupDef[] = [
  { en: "ABOUT", label: "교회소개", pages: [
    { key: "about", path: "/about", label: "교회 소개" },
    { key: "pastor", path: "/about/pastor", label: "담임목사 인사말" },
    { key: "history", path: "/about/history", label: "교회 연혁" },
    { key: "staff", path: "/about/staff", label: "섬기는 사람들" },
    { key: "location", path: "/location", label: "오시는 길" },
  ] },
  { en: "WORSHIP", label: "예배", pages: [
    { key: "worship", path: "/worship", label: "예배 안내" },
    { key: "online", path: "/worship/online", label: "온라인 예배" },
    { key: "sermons", path: "/sermons", label: "설교" },
  ] },
  { en: "BULLETIN", label: "주보", pages: [
    { key: "bulletins", path: "/bulletins", label: "교회 주보" },
    { key: "jubo", path: "/jubo", label: "온라인 주보" },
    // 교회 소식은 주보 페이지 탭에도 같이 둠(상단 "교회소식" 메뉴에도 그대로 있음 — 같은 페이지)
    { key: "news", path: "/news", label: "교회 소식" },
  ] },
  { en: "NEWS", label: "교회소식", pages: [
    { key: "news", path: "/news", label: "교회소식" },
    { key: "column", path: "/column", label: "교회 칼럼" },
    { key: "prayer", path: "/prayer", label: "중보기도" },
  ] },
];

// 페이지에 보여줄 내용이 실제로 있는지 — 없는 메뉴는 숨김(눌러도 빈 화면인 죽은 링크 방지)
function hasPage(key: PageKey, c: SiteContent, site: ChurchSite): boolean {
  switch (key) {
    case "home": return true;
    case "about": return !!(c.intro || c.vision || c.mission || c.motto || c.visionItems.length);
    case "pastor": return !!(c.pastor && (c.pastor.greeting || c.pastor.greetingTitle));
    case "history": return Array.isArray((site as any).historyItems) && (site as any).historyItems.length > 0;
    case "staff": return c.staff.length > 0 || c.officers.length > 0;
    case "location": return !!c.address;
    case "worship": return c.worship.length > 0;
    case "online": return !!c.youtubeLink || c.sermonVideos.length > 0;
    case "sermons": return c.sermons.length > 0 || c.sermonVideos.length > 0;
    // 교회 주보(올린 종이 주보 파일)는 파일이 없어도 탭을 항상 보여줌(온라인 주보 탭과 나란히)
    case "bulletins": return true;
    case "jubo": return !!(c.ownerId && c.latestBulletinId);
    case "news": return c.news.length > 0;
    case "column": return c.columns.length > 0;
    case "prayer": return c.prayers.length > 0;
  }
}

// 주소 → (페이지, 상세 id). 예전 원페이지 시절 주소(/community, /online-worship)도 받아준다
function parsePath(pathname: string): { key: PageKey; id: string } {
  const p = pathname.replace(/\/+$/, "") || "/";
  const seg = p.split("/").filter(Boolean);
  if (p === "/") return { key: "home", id: "" };
  if (p === "/community") return { key: "staff", id: "" };
  if (p === "/online-worship") return { key: "online", id: "" };
  for (const g of SITE_GROUPS) {
    for (const pg of g.pages) {
      if (p === pg.path) return { key: pg.key, id: "" };
    }
  }
  if (["bulletins", "news", "column", "prayer"].includes(seg[0]) && seg[1]) {
    return { key: seg[0] as PageKey, id: seg[1] };
  }
  return { key: "home", id: "" };
}

const groupOf = (key: PageKey) => SITE_GROUPS.find((g) => g.pages.some((p) => p.key === key));
const pageOf = (key: PageKey) => SITE_GROUPS.flatMap((g) => g.pages).find((p) => p.key === key);
const nl = (t: string) => <span className="whitespace-pre-line">{t}</span>;

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
  const [owner, setOwner] = useState<OwnerData | null>(() => ownerCache.get(String(site.ownerId || "")) ?? null);
  const [previewPath, setPreviewPath] = useState("/");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchOwnerData(site.ownerId).then((o) => {
      ownerCache.set(String(site.ownerId || ""), o);
      if (!cancelled) setOwner(o);
    });
    return () => { cancelled = true; };
  }, [site.ownerId]);
  const content = useMemo(() => (owner ? buildSiteContent(site, owner) : null), [site, owner]);

  const current = preview ? previewPath : pathname;
  const { key, id } = parsePath(current);

  const go = (path: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    setMenuOpen(false);
    if (preview) setPreviewPath(path);
    else { navigate(path); window.scrollTo(0, 0); }
  };
  const A = ({ to, className, style, children }: { to: string; className?: string; style?: React.CSSProperties; children: React.ReactNode }) => (
    <a href={to} onClick={go(to)} className={className} style={style}>{children}</a>
  );

  const groups = useMemo(() => {
    if (!content) return [];
    return SITE_GROUPS
      .map((g) => ({ ...g, pages: g.pages.filter((p) => hasPage(p.key, content, site)) }))
      .filter((g) => g.pages.length > 0);
  }, [content, site]);

  const group = groupOf(key);
  const page = pageOf(key);

  useEffect(() => {
    if (!content || preview) return;
    document.title = key === "home"
      ? (site.metaTitle || `${content.churchName} | STAYON`)
      : `${page?.label || ""} | ${content.churchName}`;
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
                  {c.denomination && <span className="block text-[11px] sm:text-xs text-gray-500 truncate">{c.denomination.name.replace(/\s*\(.*\)$/, "")}</span>}
                </span>
              </span>
            )}
          </A>
          <DesktopNav groups={groups} activeLabel={group?.label} color={color} A={A} />
          <button className="md:hidden p-2 -mr-2 text-gray-700" aria-label="메뉴" onClick={() => setMenuOpen((v) => !v)}>
            <span className="block w-5 h-0.5 bg-current mb-1.5" /><span className="block w-5 h-0.5 bg-current mb-1.5" /><span className="block w-5 h-0.5 bg-current" />
          </button>
        </div>
        {menuOpen && (
          <div className="md:hidden border-t border-gray-100 bg-white px-4 py-3 max-h-[70vh] overflow-y-auto">
            {groups.map((g) => (
              <div key={g.label} className="py-2">
                <p className="text-xs font-black text-gray-400 mb-1">{g.label}</p>
                <div className="flex flex-wrap gap-2">
                  {g.pages.map((p) => (
                    <A key={p.key} to={p.path} className="px-3 py-1.5 rounded-lg bg-gray-50 text-sm font-semibold text-gray-700 transition-colors active:bg-gray-100">{p.label}</A>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </header>

      {/* 페이지를 옮길 때마다 가운데 내용만 부드럽게 나타남(디졸브). 상단 메뉴·하단은 그대로 */}
      <div key={current} className="flex-1 animate-in fade-in slide-in-from-bottom-1 duration-300 ease-out">
      {key === "home" ? (
        <HomePage c={c} color={color} A={A} groups={groups} />
      ) : (
        <>
          {/* 페이지 제목 띠 */}
          <section className="w-full" style={{ background: `${color}0d` }}>
            <div className="max-w-6xl mx-auto px-4 sm:px-8 py-10 sm:py-14">
              <p className="text-xs font-black tracking-[0.2em]" style={{ color }}>{group?.en}</p>
              <h1 className="mt-2 text-3xl sm:text-4xl font-black text-gray-900">{page?.label}</h1>
              <p className="mt-3 text-xs text-gray-400"><A to="/" className="hover:underline">홈</A> › {page?.label}</p>
            </div>
          </section>
          <main className="max-w-6xl mx-auto px-4 sm:px-8 py-8 sm:py-12">
            {group && groups.find((g) => g.label === group.label)!.pages.length > 1 && (
              <SubTabs pages={groups.find((g) => g.label === group.label)!.pages} activeKey={key} color={color} A={A} />
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
            {c.sns.length > 0 && (
              <p className="flex flex-wrap gap-3 pt-1">
                {c.sns.map((x) => <a key={x.url} href={x.url} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">{x.label}</a>)}
              </p>
            )}
          </div>
          <p className="text-white/50">© {new Date().getFullYear()} {c.churchName} · Powered by STAYON</p>
        </div>
      </footer>
    </div>
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
          <A to={g.pages[0].path} className="relative z-10 block px-4 py-2 text-[15px] font-bold transition-colors duration-200" style={{ color: activeLabel === g.label ? color : "#374151" }}>
            {g.label}
          </A>
          {g.pages.length > 1 && (
            <div className="absolute left-1/2 -translate-x-1/2 top-full pt-2 z-20 invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-[opacity,visibility] duration-200">
              {/* 패널은 위에서부터 살짝 펼쳐지고, 항목은 위에서부터 하나씩 차례로 내려옴 */}
              <div className="min-w-[160px] origin-top rounded-xl border border-gray-100 bg-white shadow-lg p-1.5 scale-y-90 -translate-y-1 group-hover:scale-y-100 group-hover:translate-y-0 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]">
                {g.pages.map((p, j) => (
                  <div key={p.key} className="opacity-0 -translate-y-1.5 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 ease-out" style={{ transitionDelay: `${60 + j * 45}ms` }}>
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
function SubTabs({ pages, activeKey, color, A }: { pages: PageDef[]; activeKey: PageKey; color: string; A: LinkComp }) {
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const [bar, setBar] = useState<{ left: number; width: number }>({ left: 0, width: 0 });
  const idx = pages.findIndex((p) => p.key === activeKey);
  useLayoutEffect(() => {
    const el = refs.current[idx];
    if (el) setBar({ left: el.offsetLeft, width: el.offsetWidth });
  }, [idx, pages]);
  return (
    <div className="mb-10 -mx-4 sm:mx-0 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
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
function HeroImages({ images, mode, alt }: { images: string[]; mode: "slide" | "fade"; alt: string }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    setIdx(0);
    if (images.length < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % images.length), 5000);
    return () => clearInterval(t);
  }, [images.length]);
  if (images.length === 0) return null;
  const Frame = ({ src }: { src: string }) => (
    <img src={src} alt={alt} className="absolute inset-0 w-full h-full object-cover" />
  );
  return (
    <>
      {mode === "fade" ? (
        images.map((src, i) => (
          <div key={src} className="absolute inset-0 overflow-hidden transition-opacity duration-[1200ms] ease-in-out" style={{ opacity: i === idx ? 1 : 0 }}>
            <Frame src={src} />
          </div>
        ))
      ) : (
        <div className="absolute inset-0 flex transition-transform duration-700 ease-in-out" style={{ transform: `translateX(-${idx * 100}%)` }}>
          {images.map((src) => (
            <div key={src} className="relative w-full h-full shrink-0 overflow-hidden"><Frame src={src} /></div>
          ))}
        </div>
      )}
      {images.length > 1 && (
        <div className="absolute z-10 bottom-5 right-5 sm:bottom-8 sm:right-8 flex gap-2">
          {images.map((_, i) => (
            <button key={i} aria-label={`${i + 1}번째 사진`} onClick={() => setIdx(i)}
              className={`h-2 rounded-full transition-all ${i === idx ? "w-6 bg-white" : "w-2 bg-white/50"}`} />
          ))}
        </div>
      )}
    </>
  );
}

function HomePage({ c, color, A, groups }: { c: SiteContent; color: string; A: LinkComp; groups: GroupDef[] }) {
  const has = (k: PageKey) => groups.some((g) => g.pages.some((p) => p.key === k));
  const latest = c.bulletins.find((b) => b.id === c.latestBulletinId);
  return (
    <>
      <section className="relative w-full min-h-[50vh] sm:min-h-0 sm:aspect-[16/9] sm:max-h-[calc((135vh-64px)*2/3)] flex items-end overflow-hidden" style={{ background: color }}>
        <HeroImages images={c.heroImages} mode={c.heroTransition} alt={c.churchName} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
        <div className="relative max-w-6xl mx-auto w-full px-4 sm:px-8 pb-10 sm:pb-16 text-white">
          <p className="text-xs sm:text-sm font-bold tracking-[0.25em] text-white/80">WELCOME</p>
          <h1 className="mt-2 text-3xl sm:text-5xl font-black">{c.churchName}</h1>
          {c.motto && <p className="mt-3 text-sm sm:text-lg text-white/90">{c.motto.text}{c.motto.reference ? ` (${c.motto.reference})` : ""}</p>}
        </div>
      </section>
      <main className="max-w-6xl mx-auto px-4 sm:px-8 py-10 grid gap-5 md:grid-cols-3">
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
    </>
  );
}

function PageBody({ pageKey, id, c, site, color, A }: { pageKey: PageKey; id: string; c: SiteContent; site: ChurchSite; color: string; A: LinkComp }) {
  switch (pageKey) {
    case "about":
      return (
        <div className="space-y-6">
          {c.buildingImageUrl && <img src={c.buildingImageUrl} alt={c.churchName} className="w-full max-h-[420px] object-cover rounded-2xl" />}
          {c.motto && <Card><H2>표어</H2><p className="text-lg font-bold" style={{ color }}>{nl(c.motto.text)}</p>{c.motto.reference && <p className="mt-1 text-sm text-gray-500">{c.motto.reference}</p>}</Card>}
          {c.intro && <Card><H2>교회 소개</H2><p className="leading-relaxed">{nl(c.intro)}</p></Card>}
          {c.vision && <Card><H2>비전</H2><p className="leading-relaxed">{nl(c.vision)}</p></Card>}
          {c.mission && <Card><H2>사명</H2><p className="leading-relaxed">{nl(c.mission)}</p></Card>}
          {c.visionItems.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              {c.visionItems.map((v, i) => <Card key={i}><p className="font-black text-gray-900">{v.title}</p><p className="mt-1 text-sm text-gray-600">{nl(v.desc)}</p></Card>)}
            </div>
          )}
        </div>
      );
    case "pastor": {
      // 왼쪽: 인사말 / 오른쪽: 세로 사진 카드. 사진 뒤에 대표 색 판을 어긋나게 겹치고,
      // 왼쪽 아래 모서리에 반투명 이름표를 걸쳐 둠. PC에서는 스크롤해도 사진이 따라옴
      if (!c.pastor) return null;
      const p = c.pastor;
      return (
        <div className={`grid gap-10 lg:gap-20 items-start ${p.photoUrl ? "md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]" : ""}`}>
          <div className="order-2 md:order-1 md:pt-6">
            <p className="text-xs sm:text-sm font-black tracking-[0.25em]" style={{ color }}>GREETINGS</p>
            {p.greetingTitle && <p className="mt-4 text-2xl sm:text-[34px] leading-snug font-black tracking-tight text-gray-900 break-keep">{nl(p.greetingTitle)}</p>}
            <div className="mt-6 h-px w-12" style={{ background: color }} />
            <p className="mt-6 text-[15px] sm:text-[17px] leading-[1.95] text-gray-700 break-keep">{nl(p.greeting)}</p>
            {p.name && (
              <p className="mt-10 text-right text-gray-500">
                {p.role} <span className="ml-1 text-xl font-black text-gray-900">{p.name}</span>
              </p>
            )}
          </div>
          {p.photoUrl && (
            // 위가 반원인 아치형 틀(교회 창문 모양). 안쪽 바탕을 대표 색으로 옅게 깔아
            // 흰 배경 사진도 틀이 또렷하게 보이게 함. 이름은 사진 아래 가운데에
            <div className="order-1 md:order-2 md:sticky md:top-24">
              <div className="mx-auto w-full max-w-[300px] md:max-w-[380px]">
                {/* 3:4 틀에서 위쪽 가로 반지름 50%·세로 37.5% = 정확한 반원(rounded-full을 쓰면 아래 모서리가 0으로 줄어듦).
                    바깥 아치(대표 색 옅게) 안에 사진 아치를 한 겹 더 넣어 흰 배경 사진도 윤곽이 보이게 */}
                <div className="p-2.5" style={{ background: `${color}1f`, borderRadius: "50% 50% 28px 28px / 37.5% 37.5% 28px 28px" }}>
                  <div className="overflow-hidden bg-white" style={{ borderRadius: "50% 50% 20px 20px / 37.5% 37.5% 20px 20px" }}>
                    <img src={p.photoUrl} alt={p.name} className="block w-full aspect-[3/4] object-cover object-top" />
                  </div>
                </div>
                {p.name && (
                  <p className="mt-5 text-center">
                    <span className="text-sm text-gray-500">{p.role}</span>
                    <span className="mx-2 text-gray-300">·</span>
                    <span className="text-lg font-black text-gray-900">{p.name}</span>
                  </p>
                )}
              </div>
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
    case "staff":
      // 온라인 예배 영상 카드처럼: 세로 사진이 카드 위를 꽉 채우고, 이름·직분만 아래에 딱 붙임
      return (
        <div className="space-y-12">
          {/* 직분별로 묶어서 담임목사 → 부목사 → 강도사 → 전도사 → 그 밖의 직분 순서로(직분명은 입력값 그대로) */}
          {staffGroups(c.staff).map((grp) => (
            <div key={grp.role}>
              <H2>{grp.role}</H2>
              <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {grp.people.map((p, i) => (
                  <div key={i} className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
                    {p.photoUrl ? (
                      <img src={p.photoUrl} alt={p.name} className="block w-full aspect-[1/1] object-cover object-top bg-gray-50" />
                    ) : (
                      <div className="w-full aspect-[4/5] flex items-center justify-center text-5xl font-black" style={{ background: `${color}14`, color }}>{p.name.slice(0, 1)}</div>
                    )}
                    <div className="px-3.5 py-2.5">
                      <p className="text-xs font-bold" style={{ color }}>{[p.role, p.department].filter(Boolean).join(" · ") || "교역자"}</p>
                      <p className="mt-0.5 text-base font-black text-gray-900 truncate">{p.name}</p>
                      {p.desc && <p className="mt-1 text-xs leading-relaxed text-gray-500 line-clamp-2">{p.desc}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {c.officers.length > 0 && (
            <div>
              <H2>중직자</H2>
              <ul className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
                {c.officers.map((o, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 rounded-xl border border-gray-100 bg-white px-4 py-3.5 shadow-sm">
                    <span className="font-black text-gray-900 truncate">{o.name}</span>
                    <span className="shrink-0 text-xs font-bold" style={{ color }}>{o.role}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      );
    case "location":
      return (
        <Card>
          <p className="text-lg font-black text-gray-900">{c.address}</p>
          {c.addressDetail && <p className="mt-1 text-gray-600">{nl(c.addressDetail)}</p>}
          {c.phone && <p className="mt-3 text-sm">교회 전화 <a href={`tel:${c.phone}`} className="font-bold">{c.phone}</a></p>}
          <div className="mt-5 flex flex-wrap gap-2">
            <a href={`https://map.naver.com/p/search/${encodeURIComponent(c.address)}`} target="_blank" rel="noopener noreferrer" className="px-4 py-2.5 rounded-lg text-sm font-bold text-white bg-[#03C75A]">네이버 지도</a>
            <a href={`https://map.kakao.com/?q=${encodeURIComponent(c.address)}`} target="_blank" rel="noopener noreferrer" className="px-4 py-2.5 rounded-lg text-sm font-bold text-gray-900 bg-[#FEE500]">카카오맵</a>
          </div>
        </Card>
      );
    case "worship": {
      const groupsW: { title: string; items: SiteContent["worship"] }[] = [];
      c.worship.forEach((w) => {
        let g = groupsW.find((x) => x.title === w.group);
        if (!g) { g = { title: w.group, items: [] }; groupsW.push(g); }
        g.items.push(w);
      });
      return (
        <div className="grid gap-5 md:grid-cols-2">
          {groupsW.map((g) => (
            <Card key={g.title}>
              <H2>{g.title}</H2>
              <ul className="divide-y divide-gray-100">
                {g.items.map((w, i) => (
                  <li key={i} className="py-3 flex justify-between gap-4">
                    <span className="font-bold text-gray-900">{w.title}{w.note && <span className="block text-xs font-normal text-gray-500">{w.note}</span>}</span>
                    <span className="text-right text-gray-600">{w.time}{w.place && <span className="block text-xs text-gray-400">{w.place}</span>}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      );
    }
    case "online":
      return (
        <div className="space-y-6">
          {c.youtubeLink && <a href={c.youtubeLink} target="_blank" rel="noopener noreferrer" className="inline-block px-5 py-3 rounded-lg bg-[#FF0000] text-white font-bold text-sm">유튜브 채널에서 예배 보기</a>}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {c.sermonVideos.map((v, i) => (
              // 영상은 카드 끝까지 꽉 차게, 제목·정보만 아래에 딱 붙임(공통 Card의 안쪽 여백을 쓰지 않음)
              <div key={i} className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
                <div className="aspect-video bg-black"><iframe className="block w-full h-full" src={`https://www.youtube.com/embed/${v.youtubeVideoId}`} title={v.title} allowFullScreen /></div>
                <div className="px-4 py-3">
                  <p className="font-bold text-gray-900 truncate">{v.title}</p>
                  <p className="mt-0.5 text-xs text-gray-500 truncate">{[v.date, v.speaker, v.scripture].filter(Boolean).join(" · ")}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    case "sermons":
      return (
        <Card>
          <ul className="divide-y divide-gray-100">
            {c.sermons.map((s) => {
              const inner = (
                <>
                  <span><b className="text-gray-900">{s.title || "말씀"}</b>{s.scripture && <span className="ml-2 text-sm text-gray-500">{s.scripture}</span>}</span>
                  <span className="text-sm text-gray-400 shrink-0">{[s.preacher, s.date].filter(Boolean).join(" · ")}</span>
                </>
              );
              const cls = "flex flex-col sm:flex-row sm:items-center justify-between gap-1 py-3.5 hover:underline";
              // 종이 주보에서 읽어온 설교는 그 주보 파일을 열고, 온라인 주보 설교는 주보 화면으로
              return (
                <li key={s.id}>
                  {s.id.startsWith("paper-")
                    ? (s.fileUrl ? <a href={s.fileUrl} target="_blank" rel="noopener noreferrer" className={cls}>{inner}</a> : <div className={cls.replace(" hover:underline", "")}>{inner}</div>)
                    : <A to={`/bulletins/${s.id}`} className={cls}>{inner}</A>}
                </li>
              );
            })}
          </ul>
        </Card>
      );
    case "bulletins": {
      if (id) {
        const b = c.bulletins.find((x) => x.id === id);
        if (!b) return <p className="py-16 text-center text-gray-400">주보를 찾을 수 없습니다.</p>;
        return <BulletinPreview title={`${b.date} 주보`} sub={[b.title, b.scripture, b.preacher].filter(Boolean).join(" · ")} url={`https://bulletin.stayon-platform.com/view/${b.id}`} color={color} />;
      }
      return <BulletinTable c={c} color={color} A={A} />;
    }
    case "jubo":
      return <JuboPage c={c} color={color} />;
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
    default:
      return null;
  }
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
  const titleOf = (n: SiteContent["news"][number]) => {
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
              <th className="hidden sm:table-cell w-32 border-r border-gray-300 px-4 py-3 text-center font-bold">날짜</th>
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
        <p className="border-b border-gray-300 bg-gray-50 px-4 py-4 text-lg font-bold text-gray-900">{date} 교회 소식</p>
        <p className="border-b border-gray-200 px-4 py-2.5 text-sm text-gray-500">등록일 {date}</p>
        <div className="divide-y divide-gray-100 px-4">
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
const VIEWABLE = ["pdf", "jpg", "jpeg", "png"];
const fileLabel = (t: string) => (t === "hwp" || t === "hwpx" ? "한글" : t === "doc" || t === "docx" ? "워드" : t === "pdf" ? "PDF" : "사진");
const openLabel = (t: string) => (VIEWABLE.includes(t) ? "보기" : "내려받기");

function BulletinTable({ c, color }: { c: SiteContent; color: string; A: LinkComp }) {
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
  const fileLink = (b: SiteContent["paperBulletins"][number]) => ({ href: b.fileUrl, target: "_blank", rel: "noopener noreferrer", download: VIEWABLE.includes(b.fileType) ? undefined : b.fileName });

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
                        <a {...fileLink(b)} className="block">
                          <span className="font-bold text-gray-900 hover:underline break-keep">{b.title || `${fmtDate(b.date)} 주보`}</span>
                          <span className="sm:hidden mt-0.5 block text-xs tabular-nums text-gray-400">{fmtDate(b.date)} · {fileLabel(b.fileType)}</span>
                        </a>
                      </td>
                      <td className="hidden md:table-cell px-4 py-4 text-gray-600">{fileLabel(b.fileType)}</td>
                      <td className="hidden sm:table-cell px-4 py-4 tabular-nums text-gray-500">{fmtDate(b.date)}</td>
                      <td className="px-4 py-4 text-center">
                        <a {...fileLink(b)} className="inline-block border border-gray-300 bg-white px-3 py-1 text-xs font-bold text-gray-700 hover:bg-gray-100">{openLabel(b.fileType)}</a>
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
        <BulletinCards rows={rows} color={color} fileLink={fileLink} />
      )}
    </div>
  );
}

// 카드형 보기: 월별 묶음 + 줄 앞 날짜 칩(날짜·요일) + 제목·파일 형식, 줄 전체가 파일 링크. 12개씩 "이전 주보 더 보기"
function BulletinCards({ rows, color, fileLink }: { rows: SiteContent["paperBulletins"]; color: string; fileLink: (b: SiteContent["paperBulletins"][number]) => React.AnchorHTMLAttributes<HTMLAnchorElement> }) {
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
                  <a {...fileLink(b)} className="group flex items-center gap-4 sm:gap-5 py-4 transition-colors hover:bg-gray-50/80">
                    <span className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl" style={{ background: `${color}12` }}>
                      <span className="text-xl font-black leading-none tabular-nums" style={{ color }}>{Number(b.date.split("-")[2]) || "-"}</span>
                      <span className="mt-1 text-[11px] font-bold text-gray-500">{dayOf(b.date)}요일</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold text-gray-900 truncate">{b.title || "주보"}</span>
                      <span className="mt-1 block text-sm text-gray-500">{fileLabel(b.fileType)} 파일 · {openLabel(b.fileType)}</span>
                    </span>
                    <span aria-hidden className="shrink-0 pr-1 text-2xl text-gray-300 transition-transform group-hover:translate-x-1 group-hover:text-gray-500">›</span>
                  </a>
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
function JuboPage({ c, color }: { c: SiteContent; color: string }) {
  const [selectedId, setSelectedId] = useState(c.latestBulletinId);
  const selected = c.bulletins.find((b) => b.id === selectedId) || c.bulletins.find((b) => b.id === c.latestBulletinId);
  const isLatest = !selected || selected.id === c.latestBulletinId;
  const url = isLatest ? fixedBulletinUrl(c.ownerId) : `https://bulletin.stayon-platform.com/view/${selected!.id}`;
  return (
    <div className="grid gap-8 lg:gap-10 lg:grid-cols-[minmax(0,1fr)_360px_260px] items-start">
      {/* 왼쪽: 온라인 주보 목록 — 칸마다 선이 있는 단순한 표. 누르면 가운데 화면만 바뀜 */}
      <div className="order-3 lg:order-1 max-h-[640px] overflow-y-auto border-y border-gray-300">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-gray-100">
            <tr>
              <th className="w-12 border-b border-r border-gray-300 px-2 py-2.5 text-center font-bold text-gray-700">번호</th>
              <th className="w-24 border-b border-r border-gray-300 px-2 py-2.5 text-center font-bold text-gray-700">날짜</th>
              <th className="border-b border-gray-300 px-3 py-2.5 text-left font-bold text-gray-700">제목</th>
            </tr>
          </thead>
          <tbody>
            {c.bulletins.map((b, i) => {
              const on = b.id === (selected?.id || "");
              const live = b.status === "published"; // 지금 발행 중인 주보 = 이번 주
              return (
                <tr key={b.id} onClick={() => setSelectedId(b.id)} className={`cursor-pointer ${on ? "bg-gray-100" : "hover:bg-gray-50"}`}>
                  <td className="border-b border-r border-gray-200 px-2 py-2.5 text-center tabular-nums text-gray-500">{c.bulletins.length - i}</td>
                  <td className="border-b border-r border-gray-200 px-2 py-2.5 text-center tabular-nums text-gray-600">{b.date.replace(/-/g, ".")}</td>
                  <td className={`border-b border-gray-200 px-3 py-2.5 ${on ? "font-bold text-gray-900" : "text-gray-800"}`}>
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
      {/* 가운데: 스마트폰 화면 */}
      <div className="order-1 lg:order-2 mx-auto w-[320px] sm:w-[360px] h-[640px] rounded-[2.5rem] border-[10px] border-gray-900 overflow-hidden shadow-xl bg-white">
        <PhoneFrame src={url} title={selected ? `${selected.date} 주보` : "온라인 주보"} />
      </div>
      {/* 오른쪽: 제목·버튼·QR */}
      <div className="order-2 lg:order-3 flex flex-col items-start gap-5 lg:pt-4">
        <div>
          <p className="text-xs font-black tracking-[0.2em]" style={{ color }}>{isLatest ? "THIS WEEK" : "ARCHIVE"}</p>
          <p className="mt-2 text-2xl font-black text-gray-900">{isLatest ? "이번 주 온라인 주보" : "지난 주보"}</p>
          {/* 날짜와 제목을 줄바꿈해서 따로 — 날짜는 작게, 제목은 한 단계 크게 */}
          {selected && (
            <div className="mt-3">
              <p className="text-sm font-bold tabular-nums text-gray-400">{selected.date}</p>
              {selected.title && <p className="mt-1 text-lg font-bold leading-snug text-gray-800 break-keep">{selected.title}</p>}
            </div>
          )}
        </div>
        <a href={url} target="_blank" rel="noopener noreferrer" className="inline-block px-6 py-3 rounded-lg text-white font-bold" style={{ background: color }}>모바일 주보 보기</a>
        <div className="inline-flex flex-col items-center gap-2 rounded-2xl border border-gray-100 p-5 shadow-sm">
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
      <div className="flex flex-col items-start gap-5">
        <div>
          <p className="text-2xl font-black text-gray-900">{title}</p>
          {sub && <p className="mt-1 text-gray-500">{sub}</p>}
        </div>
        <a href={url} target="_blank" rel="noopener noreferrer" className="inline-block px-6 py-3 rounded-lg text-white font-bold" style={{ background: color }}>모바일 주보 보기</a>
        {qr && (
          <div className="inline-flex flex-col items-center gap-2 rounded-2xl border border-gray-100 p-5 shadow-sm">
            <QRCodeSVG value={url} size={160} />
            <p className="text-xs text-gray-500">휴대폰 카메라로 찍으면 주보가 열립니다</p>
          </div>
        )}
      </div>
    </div>
  );
}
