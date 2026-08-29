import { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router";
import { getChurchSite, ChurchSite, MENU_ITEMS } from "../../../utils/churchSite";
import { sectionPath } from "./sections/shared";
import { HomeSection } from "./sections/HomeSection";
import { WorshipSection } from "./sections/WorshipSection";
import { CommunitySection } from "./sections/CommunitySection";
import { NewsSection } from "./sections/NewsSection";
import { LocationSection } from "./sections/LocationSection";
import { OnlineWorshipSection } from "./sections/OnlineWorshipSection";

interface Props {
    slug?: string;        // 배포된 실제 페이지에서 씀 (Firestore 조회)
    site?: ChurchSite;     // 에디터 라이브 미리보기에서 씀 (즉시 렌더링)
    // 지정하면 해당 섹션 하나만 별도 페이지로 렌더링(실제 배포된 사이트의 하위 페이지 이동용).
    // 지정하지 않으면 모든 섹션을 한 페이지에 이어서 렌더링(BuilderPage.tsx 미리보기 패널 전용)
    section?: "home" | "worship" | "community" | "news" | "location" | "online-worship";
}

// 이 파일은 상단 네비게이션 + 화면 전환 로직 + 푸터만 담당하는 얇은 껍데기(shell)임.
// 화면별 실제 내용은 ./sections/*.tsx 각 파일에 따로 있고, 여기서는 그중 어느 화면을 보여줄지만 결정함.
// section prop이 있으면(실제 배포 사이트) 메뉴 클릭 시 진짜 하위 페이지(/worship, /community 등)로
// 이동하고, 없으면(BuilderPage 미리보기 / /website-preview) ?view= 쿼리로 화면을 전환함.
export function WebsiteRenderer({ slug, site: liveSite, section }: Props) {
    const [fetchedSite, setFetchedSite] = useState<ChurchSite | null>(null);
    const isRouted = section !== undefined;
    const location = useLocation();
    // isRouted가 아닐 때(BuilderPage 미리보기, /website-preview)는 진짜 라우트(/worship 등)가 없어서
    // 대신 ?view= 쿼리 파라미터로 "지금 보고 있는 화면"을 저장함 — URL이 실제로 바뀌니까 주소 복사,
    // 새로고침, 브라우저 뒤로가기/앞으로가기가 전부 정상 동작함 (내부 state로만 처리하지 않음)
    const [searchParams, setSearchParams] = useSearchParams();
    const activeLocalSection = (searchParams.get("view") as "home" | "worship" | "community" | "news" | "location" | "online-worship") || "home";

    useEffect(() => {
        if (slug && !liveSite) getChurchSite(slug).then(setFetchedSite);
    }, [slug, liveSite]);

    useEffect(() => {
        if (isRouted) window.scrollTo(0, 0);
    }, [isRouted, section]);

    const site = liveSite ?? fetchedSite;

    // 브라우저 탭 제목을 이 교회 이름으로 덮어씀. routes.tsx의 SEOManager는 경로만 보고 판단하는데
    // 교회 사이트 홈도 주보 플랫폼 랜딩과 똑같이 "/"라서 구분을 못 함 — SEOManager는 그대로 두고,
    // 여기서 데이터 로딩이 끝난 뒤 한 번 더 덮어써서 해결(주보 플랫폼 쪽 코드는 전혀 안 건드림)
    useEffect(() => {
        if (site) document.title = site.metaTitle || `${site.churchName} | STAYON`;
    }, [site]);

    if (!site) return null;

    const primaryColor = site.primaryColor || "#1B3A6B";
    const activeMenus = site.activeMenus?.length ? site.activeMenus : ["home", "worship", "community", "news", "online-worship", "location"];
    const showSection = (id: string) => (isRouted ? section === id : activeLocalSection === id);

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
    // "온라인 예배" 전용 화면(OnlineWorshipSection)에는 3개로 안 자르고 전부 전달
    const allSermons = onlineWorshipEnabled ? sermonsWithVideo : [];
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

    // isRouted가 아닐 때(미리보기) 메뉴를 누르면 스크롤 대신 ?view= 쿼리를 바꿔서 실제 URL이 바뀌는
    // "화면 이동"처럼 동작함 — 실제 배포 사이트(isRouted)는 이미 <Link>로 진짜 페이지 이동을 하므로
    // 이 함수를 안 씀. push(기본값)라서 브라우저 뒤로가기로 이전 화면으로 돌아갈 수 있음
    const scrollToSection = (id: string) => (e: React.MouseEvent) => {
        e.preventDefault();
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            if (id === "home") next.delete("view");
            else next.set("view", id);
            return next;
        });
        window.scrollTo({ top: 0, behavior: "auto" });
    };

    return (
        <div className="min-h-screen w-full bg-white" style={{ scrollBehavior: "smooth" }}>
            {/* 상단 네비게이션 - 배경은 화면 전체 폭, 내부 콘텐츠만 넓은 컨테이너로 정렬 */}
            <div className="sticky top-0 z-40 w-full shadow-sm" style={{ background: primaryColor }}>
                <div className="max-w-6xl mx-auto flex items-center justify-between gap-3 px-4 sm:px-8 py-3 sm:py-4">
                    {isRouted ? (
                        <Link to="/" className="flex items-center gap-2 shrink-0">
                            {site.logoUrl ? (
                                <img src={site.logoUrl} alt={site.churchName} className="h-7 sm:h-9 object-contain" />
                            ) : (
                                <span className="text-white font-bold text-sm sm:text-lg truncate max-w-[45vw]">{site.churchName}</span>
                            )}
                        </Link>
                    ) : (
                        <a href="#home" onClick={scrollToSection("home")} className="flex items-center gap-2 shrink-0">
                            {site.logoUrl ? (
                                <img src={site.logoUrl} alt={site.churchName} className="h-7 sm:h-9 object-contain" />
                            ) : (
                                <span className="text-white font-bold text-sm sm:text-lg truncate max-w-[45vw]">{site.churchName}</span>
                            )}
                        </a>
                    )}
                    <nav className="flex items-center gap-4 sm:gap-7 overflow-x-auto">
                        {activeMenus.map((m) => {
                            const item = MENU_ITEMS.find((i) => i.id === m);
                            if (!item) return null;
                            if (isRouted) {
                                const isActive = location.pathname === sectionPath(m);
                                return (
                                    <Link
                                        key={m}
                                        to={sectionPath(m)}
                                        className={`text-xs sm:text-sm whitespace-nowrap transition-colors ${isActive ? "text-white font-bold" : "text-white/85 hover:text-white font-medium"}`}
                                    >
                                        {item.label}
                                    </Link>
                                );
                            }
                            return (
                                <a
                                    key={m}
                                    href={`#${m}`}
                                    onClick={scrollToSection(m)}
                                    className="text-white/85 hover:text-white text-xs sm:text-sm font-medium whitespace-nowrap transition-colors"
                                >
                                    {item.label}
                                </a>
                            );
                        })}
                    </nav>
                </div>
            </div>

            {showSection("home") && (
                <HomeSection
                    site={site}
                    primaryColor={primaryColor}
                    activeMenus={activeMenus}
                    isRouted={isRouted}
                    worshipServices={worshipServices}
                    worshipGroups={worshipGroups}
                    worshipNotes={worshipNotes}
                    displaySermons={displaySermons}
                    newsItems={newsItems}
                    onNavigate={scrollToSection}
                />
            )}
            {showSection("worship") && <WorshipSection />}
            {showSection("community") && <CommunitySection />}
            {showSection("news") && <NewsSection items={newsSectionItems} primaryColor={primaryColor} />}
            {showSection("location") && <LocationSection />}
            {showSection("online-worship") && <OnlineWorshipSection sermons={allSermons} primaryColor={primaryColor} />}

            {showSection("home") && activeMenus.includes("location") && (
                <section className="w-full px-4 sm:px-8 py-12">
                    <div className="max-w-4xl mx-auto text-center bg-white border border-gray-100 rounded-2xl sm:rounded-3xl shadow-sm p-8 sm:p-12">
                        <p className="text-gray-900 text-lg sm:text-xl font-bold mb-5 break-keep">
                            처음이신가요? 언제든 편하게 찾아오세요.
                        </p>
                        {isRouted ? (
                            <Link
                                to={sectionPath("location")}
                                className="inline-block rounded-full px-7 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 shadow-md"
                                style={{ background: primaryColor }}
                            >
                                새가족 안내 보기 →
                            </Link>
                        ) : (
                            <a
                                href="#location"
                                onClick={scrollToSection("location")}
                                className="inline-block rounded-full px-7 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 shadow-md"
                                style={{ background: primaryColor }}
                            >
                                새가족 안내 보기 →
                            </a>
                        )}
                    </div>
                </section>
            )}

            {/* 푸터 - 화면 전체 폭 배경 */}
            <footer className="w-full px-4 sm:px-8 py-10 sm:py-14" style={{ background: primaryColor }}>
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
