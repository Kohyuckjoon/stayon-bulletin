// 상단 메뉴 "온라인 예배" 전용 화면. 홈 화면의 "ONLINE WORSHIP" 카드 스타일을 그대로 가져와서
// 3개로 자르지 않고 등록된 설교 전부를 보여줌.
export interface OnlineWorshipSermon {
    title: string;
    speaker?: string;
    scripture?: string;
    youtubeVideoId?: string;
    date?: string;
    comments?: number;
    views?: string;
}

interface OnlineWorshipSectionProps {
    sermons: OnlineWorshipSermon[];
    primaryColor?: string;
}

export function OnlineWorshipSection({ sermons, primaryColor = "#1B3A6B" }: OnlineWorshipSectionProps) {
    return (
        <section className="w-full px-4 sm:px-8 py-14 sm:py-20">
            <div className="max-w-6xl mx-auto">
                <div className="mb-8">
                    <p className="text-xs font-bold tracking-[0.25em] mb-2" style={{ color: primaryColor }}>
                        ONLINE WORSHIP
                    </p>
                    <h3 className="text-2xl sm:text-3xl font-black text-gray-900 break-keep">
                        온라인 예배
                    </h3>
                </div>

                {sermons.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {sermons.map((item, index) => (
                            <div
                                key={index}
                                className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden flex flex-col justify-between transition-all duration-200 hover:-translate-y-1 hover:shadow-md"
                            >
                                {/* 카드 상단: 유튜브 플레이어 (16:9) */}
                                <div className="aspect-video w-full bg-black">
                                    <iframe
                                        src={`https://www.youtube.com/embed/${item.youtubeVideoId}`}
                                        className="w-full h-full border-0"
                                        title={item.title || "설교 영상"}
                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                        allowFullScreen
                                    />
                                </div>

                                {/* 카드 하단: 본문 정보 영역 */}
                                <div className="p-6 sm:p-7 flex flex-col justify-between flex-1">
                                    <div>
                                        <p className="text-xs font-bold tracking-[0.2em] mb-2.5" style={{ color: primaryColor }}>
                                            MESSAGE
                                        </p>
                                        <h4 className="text-xl sm:text-2xl font-black text-gray-900 line-clamp-2 break-keep leading-snug mb-6">
                                            {item.title}
                                        </h4>
                                        <div className="space-y-2 text-sm sm:text-base font-semibold mb-6">
                                            <div className="flex items-center gap-4">
                                                <span className="text-gray-400 shrink-0 w-10">설교</span>
                                                <span className="text-gray-700 break-keep">{item.speaker || "담임목사"}</span>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <span className="text-gray-400 shrink-0 w-10">본문</span>
                                                <span className="text-gray-700 break-keep">{item.scripture || "-"}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="pt-4 border-t border-gray-100 flex items-center gap-2 text-xs text-gray-400 font-medium">
                                        <span>• 댓글 {item.comments ?? 0}</span>
                                        <span>• 조회 {item.views ?? 0}</span>
                                        <span>• 날짜 {item.date || "-"}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-gray-400 text-sm text-center py-20">등록된 온라인 예배 영상이 없습니다.</p>
                )}
            </div>
        </section>
    );
}
