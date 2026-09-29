import { useState } from "react";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";

export interface NewsItem {
    id: string | number;
    title: string;
    content?: string;
    author?: string;
    date: string;
    isNotice?: boolean; // 공지사항 여부
}

interface NewsSectionProps {
    items?: NewsItem[];
    primaryColor?: string;
    onItemClick?: (item: NewsItem) => void;
}

// 게시판 느낌(검색 옵션 박스 + 표 + 동그란 페이지 번호)을 걷어내고, 다른 섹션들과 같은
// 명단형 리스트로 통일 — 제목 한 줄 + 공지 표시 + 날짜만 담백하게 보여줌
export function NewsSection({
    items = [],
    primaryColor = "#1B3A6B",
    onItemClick,
}: NewsSectionProps) {
    const [searchKeyword, setSearchKeyword] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    // 검색(제목+내용 통합) — 카테고리 선택 드롭다운은 없애고 하나로 단순화
    const filteredItems = items.filter((item) => {
        if (!searchKeyword.trim()) return true;
        const kw = searchKeyword.toLowerCase();
        return item.title.toLowerCase().includes(kw) || item.content?.toLowerCase().includes(kw);
    });

    // 페이지네이션 계산
    const totalPages = Math.ceil(filteredItems.length / itemsPerPage) || 1;
    const paginatedItems = filteredItems.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    return (
        <section className="w-full bg-white py-10 sm:py-16 px-4 sm:px-8">
            <div className="max-w-6xl mx-auto">
                {/* 상단 타이틀 — 다른 섹션과 같은 결: 흰 배경에 왼쪽 정렬 라벨+제목, 오른쪽에 검색창 */}
                <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8 sm:mb-10">
                    <div>
                        <p className="text-xs font-bold tracking-[0.25em] mb-2" style={{ color: primaryColor }}>NEWS</p>
                        <h2 className="text-2xl sm:text-3xl font-black text-gray-900 break-keep">공지사항</h2>
                    </div>
                    <div className="relative w-full sm:w-64">
                        <input
                            type="text"
                            placeholder="검색어를 입력하세요"
                            value={searchKeyword}
                            onChange={(e) => {
                                setSearchKeyword(e.target.value);
                                setCurrentPage(1);
                            }}
                            className="w-full border-b border-gray-200 focus:border-gray-900 pl-1 pr-8 py-2 text-sm text-gray-800 placeholder-gray-400 outline-none transition-colors bg-transparent"
                        />
                        <Search className="absolute right-1 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 pointer-events-none" />
                    </div>
                </div>

                {/* 게시글 명단 — PC/모바일 공통 한 가지 레이아웃 */}
                <div className="divide-y divide-gray-100 border-t border-b border-gray-100">
                    {paginatedItems.length > 0 ? (
                        paginatedItems.map((item) => (
                            <div
                                key={item.id}
                                onClick={() => onItemClick?.(item)}
                                className={`flex items-center gap-3 sm:gap-4 py-4 sm:py-5 ${onItemClick ? "cursor-pointer hover:bg-gray-50/60 transition-colors" : ""}`}
                            >
                                {item.isNotice ? (
                                    <span
                                        className="shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full"
                                        style={{ color: primaryColor, background: `${primaryColor}14` }}
                                    >
                                        공지
                                    </span>
                                ) : (
                                    <span className="shrink-0 text-xs text-gray-300 w-6 text-center">{item.id}</span>
                                )}
                                <p className="flex-1 min-w-0 truncate text-sm sm:text-base font-semibold text-gray-800 break-keep">
                                    {item.title}
                                </p>
                                {item.author && (
                                    <span className="hidden sm:block shrink-0 text-xs text-gray-400 w-20 truncate text-right">
                                        {item.author}
                                    </span>
                                )}
                                <span className="shrink-0 text-xs text-gray-400 w-16 sm:w-20 text-right">
                                    {item.date}
                                </span>
                            </div>
                        ))
                    ) : (
                        <p className="py-16 text-center text-gray-400 text-sm">등록된 게시글이 없습니다.</p>
                    )}
                </div>

                {/* 페이지네이션 — 동그란 번호 버튼 대신 이전/다음 + 쪽수 표시로 단순화 */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-6 mt-8 text-sm">
                        <button
                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="flex items-center gap-1 font-semibold text-gray-500 disabled:opacity-30 hover:text-gray-900 transition-colors"
                        >
                            <ChevronLeft className="w-4 h-4" /> 이전
                        </button>
                        <span className="text-gray-400 font-medium">{currentPage} / {totalPages}</span>
                        <button
                            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="flex items-center gap-1 font-semibold text-gray-500 disabled:opacity-30 hover:text-gray-900 transition-colors"
                        >
                            다음 <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                )}
            </div>
        </section>
    );
}
