import { Link } from "react-router";
import { ChevronDown } from "lucide-react";
import { ChurchSite } from "../../../../utils/churchSite";
import { sectionPath } from "./shared";
import { GalleryBand } from "./GalleryBand";

type WorshipService = { title: string; time: string; note?: string; group?: string };
type Sermon = {
    title: string;
    speaker?: string;
    scripture?: string;
    youtubeVideoId?: string;
    date?: string;
    comments?: number;
    views?: string;
};
type NewsItem = { title: string; date: string; content: string };

interface HomeSectionProps {
    site: ChurchSite;
    primaryColor: string;
    activeMenus: string[];
    isRouted: boolean;
    worshipServices: WorshipService[];
    worshipGroups: { title: string; items: WorshipService[] }[];
    worshipNotes: WorshipService[];
    displaySermons: Sermon[];
    newsItems: NewsItem[];
    onNavigate: (id: string) => (e: React.MouseEvent) => void;
}

// 교회 사이트 홈 화면 — 히어로, 이번 주 예배 시간, 온라인 예배(설교 영상), 최근 소식, 오시는 길
// 요약을 한 화면에 이어서 보여줌. 각 하위 화면(WorshipSection 등)의 "더 보기"는 여기서 다시 눌러도
// 진짜 하위 페이지(isRouted)로 가거나, 미리보기에서는 화면만 전환됨(onNavigate)
export function HomeSection({
    site,
    primaryColor,
    activeMenus,
    isRouted,
    worshipServices,
    worshipGroups,
    worshipNotes,
    displaySermons,
    newsItems,
    onNavigate,
}: HomeSectionProps) {
    return (
        <>
            {/* 히어로 - 화면 전체 폭 배경. 업로드한 사진이 있으면 그 위에 어두운 그라데이션을 얹어 글씨 가독성 확보.
                처음 페이지가 열렸을 때 PC든 모바일이든 첫 화면을 꽉 채우도록 min-h-svh(작은 뷰포트 높이) 사용 —
                100vh 대신 svh를 써야 모바일 브라우저 주소창이 접히고 펴질 때 높이가 덜컥거리지 않음 */}
            <section id="home" className="relative overflow-hidden w-full text-center scroll-mt-16 bg-slate-900 min-h-svh flex flex-col">
                {/* 1. 이미지 배경 레이어 */}
                {site.heroImageUrl ? (
                    <div
                        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
                        style={{ backgroundImage: `url(${site.heroImageUrl})` }}
                    />
                ) : (
                    <div
                        className="absolute inset-0"
                        style={{
                            background: `linear-gradient(150deg, ${primaryColor} 0%, ${primaryColor}cc 55%, ${primaryColor}88 100%)`,
                        }}
                    />
                )}

                {/* 2. 어두운 오버레이 (글자 가독성을 위해 이미지 전체를 살짝 어둡게 처리) */}
                <div className="absolute inset-0 bg-black/45" />

                {/* 3. 하단 페이드아웃 그라데이션 (이미지 하단이 아래 흰색 배경과 자연스럽게 연결됨) */}
                <div className="absolute bottom-0 left-0 w-full h-32 bg-gradient-to-b from-transparent to-white pointer-events-none" />

                {/* 4. 텍스트 및 버튼 컨텐츠 — flex-1로 남은 세로 공간을 다 차지하면서 그 안에서 가운데 정렬 */}
                <div className="relative z-10 flex-1 flex flex-col items-center justify-center max-w-6xl mx-auto px-4 sm:px-8 py-16">
                    <p className="text-white/70 text-[11px] sm:text-xs tracking-[0.3em] mb-4 font-medium">WELCOME TO</p>
                    <h1
                        className="text-white font-black text-3xl sm:text-5xl md:text-6xl mb-5 break-keep leading-tight drop-shadow-md"
                        style={{ fontFamily: "'Noto Serif KR', serif" }}
                    >
                        {site.churchName}
                    </h1>
                    {site.intro && (
                        <p className="text-white/90 text-sm sm:text-lg leading-relaxed max-w-xl mx-auto mb-9 break-keep drop-shadow">
                            {site.intro}
                        </p>
                    )}
                    <div className="flex flex-wrap items-center justify-center gap-3">
                        {activeMenus.includes("worship") && worshipServices.length > 0 && (
                            isRouted ? (
                                <Link
                                    to={sectionPath("worship")}
                                    className="inline-block bg-white rounded-full px-6 py-3 text-sm font-bold hover:opacity-90 transition-opacity shadow-lg"
                                    style={{ color: primaryColor }}
                                >
                                    예배 안내 →
                                </Link>
                            ) : (
                                <a
                                    href="#worship"
                                    onClick={onNavigate("worship")}
                                    className="inline-block bg-white rounded-full px-6 py-3 text-sm font-bold hover:opacity-90 transition-opacity shadow-lg"
                                    style={{ color: primaryColor }}
                                >
                                    예배 안내 →
                                </a>
                            )
                        )}
                        {activeMenus.includes("location") && (
                            isRouted ? (
                                <Link
                                    to={sectionPath("location")}
                                    className="inline-block border border-white/60 text-white rounded-full px-6 py-3 text-sm font-bold hover:bg-white/10 transition-colors"
                                >
                                    오시는 길
                                </Link>
                            ) : (
                                <a
                                    href="#location"
                                    onClick={onNavigate("location")}
                                    className="inline-block border border-white/60 text-white rounded-full px-6 py-3 text-sm font-bold hover:bg-white/10 transition-colors"
                                >
                                    오시는 길
                                </a>
                            )
                        )}
                    </div>
                </div>
                {/* 스크롤 힌트 화살표 — flex-1이 위 콘텐츠를 가운데로 밀어준 뒤, 남는 자리에서 화면 맨 아래로 붙음 */}
                {!isRouted && (
                    <div className="relative z-10 pb-8 sm:pb-12 flex justify-center">
                        <ChevronDown className="w-6 h-6 text-white/70 animate-bounce" />
                    </div>
                )}
            </section>

            {site.intro && (
                <section className="w-full px-4 sm:px-8 pt-20 sm:pt-28 pb-14 sm:pb-20 mt-6 sm:mt-10">
                    <div className="max-w-3xl mx-auto text-center">
                        <p className="text-xs font-bold tracking-[0.25em] mb-3" style={{ color: primaryColor }}>WELCOME</p>
                        <h3 className="text-2xl sm:text-3xl font-black text-gray-900 mb-5 break-keep">
                            {site.churchName}에 오신 것을 환영합니다
                        </h3>
                        <p className="text-sm sm:text-base text-gray-600 leading-relaxed break-keep whitespace-pre-wrap">
                            {site.intro}
                        </p>
                    </div>
                </section>
            )}

            {site.galleryImages && site.galleryImages.length > 0 && (
                <div className="max-w-6xl mx-auto px-4 sm:px-8 pt-12 sm:pt-16 mb-16 sm:mb-24">
                    <div className="overflow-hidden rounded-2xl sm:rounded-3xl shadow-sm">
                        <GalleryBand images={site.galleryImages} />
                    </div>
                </div>
            )}

            {worshipServices.length > 0 && (
                <section id="worship" className="w-full px-4 sm:px-8 py-16 sm:py-24 scroll-mt-16 bg-white">
                    <div className="max-w-3xl mx-auto">
                        <div className="text-center mb-10 sm:mb-14">
                            <h3
                                className="text-2xl sm:text-3xl font-bold text-gray-900 break-keep"
                                style={{ fontFamily: "'Noto Serif KR', serif" }}
                            >
                                예배 안내
                            </h3>
                            <div className="w-10 h-0.5 mx-auto mt-4 rounded-full" style={{ background: primaryColor }} />
                        </div>

                        <div className={`grid grid-cols-1 ${worshipGroups.length > 1 ? "sm:grid-cols-2" : ""} gap-6`}>
                            {worshipGroups.map((g, gi) => (
                                <div key={gi} className="border border-gray-100 rounded-2xl px-6 sm:px-8 py-7 sm:py-8">
                                    <div className="flex items-center gap-2 mb-5">
                                        <p className="text-sm font-bold text-gray-800 break-keep">{g.title}</p>
                                        {site.mainWorshipGroup === g.title && (
                                            <span className="text-[11px] font-semibold" style={{ color: primaryColor }}>
                                                · 본 예배
                                            </span>
                                        )}
                                    </div>
                                    <div className="divide-y divide-gray-100">
                                        {g.items.map((s, i) => (
                                            <div key={i} className="flex items-baseline justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
                                                <p className="text-sm text-gray-500 break-keep shrink-0">{s.title}</p>
                                                <p className="text-base sm:text-lg font-bold tracking-tight text-right" style={{ color: primaryColor }}>{s.time}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {worshipNotes.length > 0 && (
                            <div className="mt-6 space-y-1 text-center">
                                {worshipNotes.map((s, i) => (
                                    <p key={i} className="text-xs text-gray-400 break-keep">※ {s.note}</p>
                                ))}
                            </div>
                        )}
                    </div>
                </section>
            )}

            {/* 영상(youtubeVideoId) 또는 텍스트(sermonExcerpt) 둘 중 실제로 채워진 게 있을 때만 표시.
                sermonDisplayMode가 "text"가 아니면(미설정 포함) 기존과 동일하게 영상 모드로 취급 */}
            {(site.sermonDisplayMode === "text" ? !!site.sermonExcerpt : !!site.youtubeVideoId) && site.introVideoEnabled !== false && (
                <section className="w-full px-4 sm:px-8 py-14 sm:py-20 bg-white">
                    <div className="max-w-6xl mx-auto">
                        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-8">
                            <div>
                                <p className="text-xs font-bold tracking-[0.25em] mb-2" style={{ color: primaryColor }}>ABOUT OUR CHURCH</p>
                                <h3 className="text-2xl sm:text-3xl font-black text-gray-900 break-keep">
                                    교회 소개 영상
                                </h3>
                            </div>
                        </div>
                        {site.sermonDisplayMode === "text" ? (
                            // 텍스트 모드 — 영상 없이 발췌문을 인용구처럼 보여주는 단일 카드.
                            // "주일 예배 안내"와 같은 결(세리프 제목, 담백한 테두리 카드)로 맞춤
                            <div className="max-w-2xl mx-auto bg-white rounded-2xl sm:rounded-3xl border border-gray-100 p-8 sm:p-12 text-center">
                                <p
                                    className="text-lg sm:text-xl font-bold text-gray-900 break-keep leading-snug mb-5"
                                    style={{ fontFamily: "'Noto Serif KR', serif" }}
                                >
                                    {site.latestSermonTitle || `${site.churchName} 소개`}
                                </p>
                                <p className="text-sm sm:text-base text-gray-600 leading-relaxed break-keep whitespace-pre-line">
                                    {site.sermonExcerpt}
                                </p>
                                {site.latestSermonSpeaker && (
                                    <p className="text-sm text-gray-400 font-semibold mt-6">{site.latestSermonSpeaker}</p>
                                )}
                            </div>
                        ) : (
                            <div className="bg-white rounded-2xl sm:rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                                <div className="grid grid-cols-1 lg:grid-cols-2">
                                    <div className="aspect-video">
                                        <iframe
                                            src={`https://www.youtube.com/embed/${site.youtubeVideoId}`}
                                            className="w-full h-full"
                                            title="설교 영상"
                                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                            allowFullScreen
                                        />
                                    </div>
                                    <div className="flex flex-col justify-center p-8 sm:p-10">
                                        <p className="text-lg sm:text-xl font-bold text-gray-900 break-keep leading-snug">
                                            {site.latestSermonTitle || `${site.churchName} 소개`}
                                        </p>
                                        {site.latestSermonSpeaker && (
                                            <p className="text-sm text-gray-500 mt-3 leading-relaxed break-keep">
                                                {site.latestSermonSpeaker}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </section>
            )}

            {/* 온라인 예배 (MESSAGE) 섹션 — 실제로 등록된 설교가 있을 때만 표시 */}
            {displaySermons.length > 0 && (
                <section className="w-full px-4 sm:px-8 py-14 sm:py-20 mt-6 sm:mt-10" style={{ background: "#F8FAFC" }}>
                    <div className="max-w-6xl mx-auto">
                        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-8">
                            <div>
                                <p className="text-xs font-bold tracking-[0.25em] mb-2" style={{ color: primaryColor }}>
                                    ONLINE WORSHIP
                                </p>
                                <h3 className="text-2xl sm:text-3xl font-black text-gray-900 break-keep">
                                    온라인 예배
                                </h3>
                            </div>
                            {/* "더 보기"는 사이트 안의 또 다른 온라인 예배 섹션이 아니라, 교회 유튜브
                                채널로 바로 연결함(youtubeLink가 등록돼 있을 때만) */}
                            {site.youtubeLink && (
                                <a
                                    href={site.youtubeLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm font-bold hover:underline shrink-0"
                                    style={{ color: primaryColor }}
                                >
                                    더 보기 →
                                </a>
                            )}
                        </div>

                        {/* 카드뷰 리스트 — 모바일은 2열, md 이상은 화면 폭에 따라 2~3열 */}
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
                            {displaySermons.map((item, index) => {
                                const videoId = item.youtubeVideoId || site.youtubeVideoId;
                                return (
                                    <div
                                        key={index}
                                        className="bg-white rounded-2xl sm:rounded-3xl shadow-sm border border-gray-100 overflow-hidden flex flex-col justify-between transition-all duration-200 hover:-translate-y-1 hover:shadow-md"
                                    >
                                        {/* 카드 상단: 유튜브 플레이어 (16:9) */}
                                        <div className="aspect-video w-full bg-black">
                                            <iframe
                                                src={`https://www.youtube.com/embed/${videoId}`}
                                                className="w-full h-full border-0"
                                                title={item.title || "설교 영상"}
                                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                                allowFullScreen
                                            />
                                        </div>

                                        {/* 카드 하단: 본문 정보 영역 */}
                                        <div className="p-3 sm:p-7 flex flex-col justify-between flex-1">
                                            <div>
                                                {/* MESSAGE 서브 라벨 */}
                                                <p className="text-[10px] sm:text-xs font-bold tracking-[0.2em] mb-1.5 sm:mb-2.5" style={{ color: primaryColor }}>
                                                    MESSAGE
                                                </p>

                                                {/* 설교 제목 */}
                                                <h4 className="text-sm sm:text-2xl font-black text-gray-900 line-clamp-2 break-keep leading-snug mb-2 sm:mb-6">
                                                    {item.title}
                                                </h4>

                                                {/* 설교자 및 본문 정보 */}
                                                <div className="space-y-1 sm:space-y-2 text-[11px] sm:text-base font-semibold mb-2 sm:mb-6">
                                                    <div className="flex items-center gap-1.5 sm:gap-4">
                                                        <span className="text-gray-400 shrink-0 w-7 sm:w-10">설교</span>
                                                        <span className="text-gray-700 break-keep truncate">{item.speaker || "담임목사"}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 sm:gap-4">
                                                        <span className="text-gray-400 shrink-0 w-7 sm:w-10">본문</span>
                                                        <span className="text-gray-700 break-keep truncate">{item.scripture || "-"}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* 하단 구분선 및 댓글 / 조회 / 날짜 메타 정보 — 카드가 좁아지는 모바일 2열에서는 숨김 */}
                                            <div className="hidden sm:flex pt-4 border-t border-gray-100 items-center gap-2 text-xs text-gray-400 font-medium">
                                                <span>• 댓글 {item.comments ?? 0}</span>
                                                <span>• 조회 {item.views ?? 0}</span>
                                                <span>• 날짜 {item.date || "-"}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </section>
            )}

            {/* "최근 소식" 홈 미리보기 섹션 임시 비활성화 (요청에 따라 숨김)
            {newsItems.length > 0 && (
                <section className="w-full px-4 sm:px-8 py-14 sm:py-20 bg-white">
                    <div className="max-w-6xl mx-auto">
                        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-8">
                            <div>
                                <p className="text-xs font-bold tracking-[0.25em] mb-2" style={{ color: primaryColor }}>NEWS</p>
                                <h3 className="text-2xl sm:text-3xl font-black text-gray-900 break-keep">최근 소식</h3>
                            </div>

                            {activeMenus.includes("news") && (
                                isRouted ? (
                                    <Link
                                        to={sectionPath("news")}
                                        className="text-sm font-bold hover:underline shrink-0"
                                        style={{ color: primaryColor }}
                                    >
                                        소식 더 보기 →
                                    </Link>
                                ) : (
                                    <a
                                        href="#news"
                                        onClick={onNavigate("news")}
                                        className="text-sm font-bold hover:underline shrink-0"
                                        style={{ color: primaryColor }}
                                    >
                                        소식 더 보기 →
                                    </a>
                                )
                            )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                            {newsItems.slice(0, 3).map((n, i) => (
                                <div key={i} className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
                                    <div className="flex items-baseline justify-between gap-2 mb-2">
                                        <p className="text-sm font-bold text-gray-900 break-keep">{n.title}</p>
                                        {n.date && <p className="text-[11px] text-gray-400 shrink-0">{n.date}</p>}
                                    </div>
                                    <p className="text-xs text-gray-500 leading-relaxed break-keep whitespace-pre-wrap line-clamp-3">{n.content}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            )}
            */}
        </>
    );
}
