import { useEffect, useState } from "react";
import { getChurchSite, ChurchSite, MENU_ITEMS } from "../../../utils/churchSite";
import { applySiteFavicon } from "../../../utils/churchFavicon";
import { readSiteCache, writeSiteCache, removeSiteCache } from "../../../utils/siteLocalCache";
import { HomeSection } from "./sections/HomeSection";
import { CommunitySection } from "./sections/CommunitySection";
import { NewsSection } from "./sections/NewsSection";
import { LocationSection } from "./sections/LocationSection";
import { MultiPageSite } from "./MultiPageSite";

interface Props {
    slug?: string;        // 배포된 실제 페이지 / /website-preview에서 씀 (Firestore 조회)
    site?: ChurchSite;     // BuilderPage.tsx 라이브 미리보기에서 씀 (지금 입력 중인 값으로 즉시 렌더링)
    // 실제 배포된 서브도메인(/worship 등)으로 들어왔을 때만 넘어옴 — 어느 섹션까지 스크롤해서
    // 보여줄지 결정하는 용도. 그 외(홈, 미리보기)는 항상 맨 위부터 시작
    section?: "home" | "worship" | "community" | "news" | "location" | "online-worship";
    // 페이지 전환형에서 지금 보여줄 주소(/about 등). 실제 배포 사이트에서만 넘어옴
    pathname?: string;
}

// 이 파일은 상단 네비게이션 + 푸터만 담당하는 얇은 껍데기(shell)임. 화면별 실제 내용은
// ./sections/*.tsx 각 파일에 따로 있음. 실제 배포 사이트, /website-preview, BuilderPage
// 라이브 미리보기 전부 이 컴포넌트 하나를 그대로 씀 — 항상 모든 섹션을 한 페이지에 이어 붙여서
// 보여주고, 메뉴를 누르면 페이지 이동 없이 그 위치로 스크롤됨(원페이지 사이트).
// /worship, /community 같은 개별 주소는 아직 검색엔진에 걸려있거나 공유된 링크가 있을 수 있어
// 계속 살려두되, 이제는 "전체 페이지를 열고 그 위치까지 스크롤해서 보여주는" 진입점 역할만 함.
// 메뉴를 옮길 때마다 화면이 새로 만들어져도 다시 빈 화면부터 시작하지 않도록, 한 번 불러온
// 교회 사이트 데이터는 기억해 뒀다가 바로 보여주고 최신 내용은 뒤에서 다시 받아옴(깜빡임 방지)
const siteCache = new Map<string, ChurchSite>();

export function WebsiteRenderer({ slug, site: liveSite, section, pathname }: Props) {
    // 지난 방문 때 이 브라우저에 저장해 둔 교회 사이트 정보가 있으면 바로 그림(최신 내용은 아래에서 다시 받아 바꿈)
    const [fetchedSite, setFetchedSite] = useState<ChurchSite | null>(() =>
        slug && !liveSite ? siteCache.get(slug) ?? readSiteCache<ChurchSite>(`site:${slug}`) : null);

    useEffect(() => {
        if (!slug || liveSite) return;
        let cancelled = false;
        getChurchSite(slug).then((s) => {
            if (cancelled) return;
            // 사이트가 삭제됐으면 저장본도 지우고 화면을 비움(저장본으로 옛 사이트가 계속 보이지 않게)
            if (!s) {
                siteCache.delete(slug);
                removeSiteCache(`site:${slug}`);
                setFetchedSite(null);
                return;
            }
            siteCache.set(slug, s);
            writeSiteCache(`site:${slug}`, s);
            setFetchedSite(s);
        });
        return () => { cancelled = true; };
    }, [slug, liveSite]);

    const site = liveSite ?? fetchedSite;

    // section prop으로 들어온 실제 배포 서브도메인 진입만 해당 위치로 스크롤. 데이터 로딩이
    // 끝나 해당 id를 가진 DOM이 실제로 생긴 뒤에 점프해야 하므로 site가 준비된 뒤에 실행
    useEffect(() => {
        if (!section || section === "home" || !site) return;
        const el = document.getElementById(section);
        if (el) el.scrollIntoView({ behavior: "auto" });
    }, [section, site]);

    // 브라우저 탭 제목을 이 교회 이름으로 덮어씀. routes.tsx의 SEOManager는 경로만 보고 판단하는데
    // 교회 사이트 홈도 주보 플랫폼 랜딩과 똑같이 "/"라서 구분을 못 함 — SEOManager는 그대로 두고,
    // 여기서 데이터 로딩이 끝난 뒤 한 번 더 덮어써서 해결(주보 플랫폼 쪽 코드는 전혀 안 건드림)
    useEffect(() => {
        // 페이지 전환형은 MultiPageSite가 페이지마다 제목을 따로 정함
        if (site && site.layoutMode === "onepage") document.title = site.metaTitle || `${site.churchName} | STAYON`;
    }, [site]);

    // 브라우저 탭 아이콘을 이 교회 교단 마크로. 빌더 미리보기(liveSite)에서는 빌더 탭 아이콘을 바꾸지 않음
    useEffect(() => {
        if (!site || liveSite) return;
        applySiteFavicon((site as { denomination?: unknown }).denomination, site.ownerId);
    }, [site, liveSite]);

    if (!site) return null;

    // 페이지 전환형(기본). 원페이지를 고른 교회만 아래 기존 한 페이지 화면을 그대로 씀
    if (site.layoutMode !== "onepage") {
        return <MultiPageSite site={site} pathname={pathname || "/"} preview={!!liveSite} />;
    }

    const primaryColor = site.primaryColor || "#1B3A6B";
    const activeMenus = site.activeMenus?.length ? site.activeMenus : ["home", "worship", "community", "news", "online-worship", "location"];

    // 구버전 단일 worshipTime 문자열만 저장된 사이트도 예배 안내 1건으로 자연스럽게 표시
    const worshipServices = site.worshipServices?.length
        ? site.worshipServices
        : site.worshipTime
            ? [{ title: "예배 안내", time: site.worshipTime, note: "" }]
            : [];

    // 예배들을 group 값 기준으로 묶어서 카드 여러 개로 나눔 (ex. "주일예배" / "주중예배와 기도회").
    // group을 안 적은 예배는 전부 하나의 기본 카드로 묶임
    const worshipGroups = (() => {
        const order: string[] = [];
        const map = new Map<string, typeof worshipServices>();
        worshipServices.forEach((s) => {
            const key = s.group?.trim() || "예배 시간";
            if (!map.has(key)) { map.set(key, []); order.push(key); }
            map.get(key)!.push(s);
        });
        return order.map((title) => ({ title, items: map.get(title)! }));
    })();
    const worshipNotes = worshipServices.filter((s) => s.note?.trim());

    // "온라인 예배" 섹션: BuilderPage에서 onlineWorshipEnabled를 끄면 통째로 숨기고,
    // 켜져 있어도 유튜브 영상이 실제로 등록된 설교만 보여줌(더 이상 예시 하드코딩 없음)
    const onlineWorshipEnabled = site.onlineWorshipEnabled !== false;
    const sermonsWithVideo = (site.sermons || []).filter((s) => s.youtubeVideoId?.trim());
    const displaySermons = onlineWorshipEnabled ? sermonsWithVideo.slice(0, 3) : [];
    // 새 소식은 배열 끝에 추가되므로(오래된 게 앞, 최신이 뒤), 화면에는 최신이 먼저 보이도록 뒤집음
    const newsItems = [...(site.newsItems || [])].reverse();
    // "소식" 전체 화면(NewsSection)에 실제 등록된 소식만 전달 — 게시판처럼 최신 글이 가장 큰 번호,
    // 가장 오래된 글이 1번이 되게 계산(화면 표시용일 뿐 저장 데이터에는 영향 없음)
    const newsSectionItems = newsItems.map((n, i) => ({
        id: newsItems.length - i,
        title: n.title,
        content: n.content,
        date: n.date,
    }));

    // CommunitySection/LocationSection은 실제 데이터가 없으면 "판교채플" 같은 예시(가짜) 정보를
    // 그대로 보여주는 컴포넌트라, 진짜 데이터가 있을 때만 그 섹션을 만들고 메뉴에도 노출한다
    // (BuilderPage 라이브 미리보기도 마찬가지 — 아직 안 채운 탭은 가짜 정보 대신 그냥 안 보이는
    // 게 "저장하면 실제로 이렇게 보인다"는 미리보기 취지에 더 맞음). 예배 안내는 별도 전용
    // 컴포넌트가 없어 HomeSection 안의 실제 요약(worshipServices)을 그대로 앵커로 씀
    const hasWorship = worshipServices.length > 0;
    const hasCommunity = (site.staffMembers?.length ?? 0) > 0;
    const hasLocationData = !!site.address;
    const hasNews = newsItems.length > 0;
    // "온라인 예배"는 사이트 안에 별도 전체 목록 섹션을 또 두지 않고(홈 화면 미리보기와
    // 내용이 겹쳐 혼란스러웠음), 교회 유튜브 채널로 바로 연결하는 메뉴로만 둠
    const sectionDataMap: Record<string, boolean> = {
        home: true,
        worship: hasWorship,
        community: hasCommunity,
        news: false, // 공지사항 섹션 임시 비활성화(요청에 따라 숨김) — 원래는 hasNews
        location: hasLocationData,
        "online-worship": !!site.youtubeLink,
    };

    // scrollIntoView는 window뿐 아니라 스크롤 가능한 조상(예: BuilderPage 미리보기 패널의
    // overflow-y:auto 박스)도 알아서 같이 스크롤해줘서, 실제 배포 사이트/미리보기 어디서든
    // 그대로 재사용 가능함
    const scrollToId = (id: string) => (e: React.MouseEvent) => {
        e.preventDefault();
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    };

    return (
        <div className="min-h-screen w-full flex flex-col bg-white" style={{ scrollBehavior: "smooth" }}>
            {/* 상단 네비게이션 - 배경은 화면 전체 폭, 내부 콘텐츠만 넓은 컨테이너로 정렬 */}
            <div className="sticky top-0 z-40 w-full shadow-sm" style={{ background: primaryColor }}>
                <div className="max-w-6xl mx-auto flex items-center justify-between gap-3 px-4 sm:px-8 py-3 sm:py-4">
                    <a href="#home" onClick={scrollToId("home")} className="flex items-center gap-2 shrink-0">
                        {site.logoUrl ? (
                            <img src={site.logoUrl} alt={site.churchName} className="h-7 sm:h-9 object-contain" />
                        ) : (
                            <span className="text-white font-bold text-sm sm:text-lg truncate max-w-[45vw]">{site.churchName}</span>
                        )}
                    </a>
                    <nav className="flex items-center gap-4 sm:gap-7 overflow-x-auto">
                        {activeMenus.map((m) => {
                            const item = MENU_ITEMS.find((i) => i.id === m);
                            if (!item) return null;
                            // 실제 데이터가 없는 섹션은 메뉴에 노출하지 않음 — 눌러도 없는 곳으로
                            // 가는 죽은 링크를 막기 위함
                            if (!sectionDataMap[m]) return null;
                            // "온라인 예배"는 사이트 안의 앵커가 아니라 교회 유튜브 채널로 바로 연결
                            if (m === "online-worship") {
                                return (
                                    <a
                                        key={m}
                                        href={site.youtubeLink}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-white/85 hover:text-white text-xs sm:text-sm font-medium whitespace-nowrap transition-colors"
                                    >
                                        {item.label}
                                    </a>
                                );
                            }
                            return (
                                <a
                                    key={m}
                                    href={`#${m}`}
                                    onClick={scrollToId(m)}
                                    className="text-white/85 hover:text-white text-xs sm:text-sm font-medium whitespace-nowrap transition-colors"
                                >
                                    {item.label}
                                </a>
                            );
                        })}
                    </nav>
                </div>
            </div>

            <HomeSection
                site={site}
                primaryColor={primaryColor}
                activeMenus={activeMenus}
                isRouted={false}
                worshipServices={worshipServices}
                worshipGroups={worshipGroups}
                worshipNotes={worshipNotes}
                displaySermons={displaySermons}
                newsItems={newsItems}
                onNavigate={scrollToId}
            />
            {hasCommunity && (
                <div id="community" className="scroll-mt-16">
                    <CommunitySection
                        churchName={site.churchName}
                        primaryColor={primaryColor}
                        staffMembers={site.staffMembers}
                    />
                </div>
            )}
            {/* 공지사항 섹션 임시 비활성화 (요청에 따라 숨김)
            {hasNews && (
                <div id="news" className="scroll-mt-16">
                    <NewsSection items={newsSectionItems} primaryColor={primaryColor} />
                </div>
            )}
            */}
            {hasLocationData && (
                <div id="location" className="scroll-mt-16">
                    <LocationSection
                        churchName={site.churchName}
                        address={site.address}
                        phone={site.phone}
                        primaryColor={primaryColor}
                    />
                </div>
            )}

            {/* {hasLocationData && (
                <section className="w-full px-4 sm:px-8 py-12">
                    <div className="max-w-4xl mx-auto text-center bg-white border border-gray-100 rounded-2xl sm:rounded-3xl shadow-sm p-8 sm:p-12">
                        <p className="text-gray-900 text-lg sm:text-xl font-bold mb-5 break-keep">
                            처음이신가요? 언제든 편하게 찾아오세요.
                        </p>
                        <a
                            href="#location"
                            onClick={scrollToId("location")}
                            className="inline-block rounded-full px-7 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 shadow-md"
                            style={{ background: primaryColor }}
                        >
                            새가족 안내 보기 →
                        </a>
                    </div>
                </section>
            )} */}

            {/* 푸터 - 화면 전체 폭 배경 */}
            {/* mt-auto: 내용이 짧아도 하단이 항상 화면 맨 아래에 붙음 */}
            <footer className="mt-auto w-full px-4 sm:px-8 py-10 sm:py-14" style={{ background: primaryColor }}>
                <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center sm:items-end justify-between gap-4">
                    <div className="text-center sm:text-left">
                        <p className="text-white font-bold text-base mb-1">{site.churchName}</p>
                        {site.address && <p className="text-white/60 text-xs mb-0.5 break-keep">{site.address}</p>}
                        {site.phone && <p className="text-white/60 text-xs">{site.phone}{site.email ? ` · ${site.email}` : ""}</p>}
                    </div>
                    <p className="text-white/50 text-xs">© {new Date().getFullYear()} {site.churchName} · Powered by STAYON</p>
                </div>
            </footer>
        </div>
    );
}
