import React, { useState } from "react";
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

// 이미지 예시 기반 기본 데이터
const DEFAULT_NEWS_ITEMS: NewsItem[] = [
    { id: "notice-1", title: "THINK 기초양육반(세례를 받기 위한 과정)", author: "관리자", date: "2026.03.10", isNotice: true },
    { id: "notice-2", title: "판교채플 주차장 안내 (제2주차장 포함)", author: "관리자", date: "2023.09.01", isNotice: true },
    { id: "notice-3", title: "온라인 새가족등록카드", author: "관리자", date: "2021.08.12", isNotice: true },
    { id: "notice-4", title: "유아세례 온라인신청서", author: "관리자", date: "2021.06.14", isNotice: true },
    { id: 1827, title: "2026 하반기 THINK양육, THINK양육교사 신청 안내", author: "관리자", date: "2026.08.02" },
    { id: 1826, title: "8월 봉사위원안내_판교", author: "관리자", date: "2026.07.23" },
    { id: 1825, title: "8월 봉사위원안내_휘문", author: "관리자", date: "2026.07.20" },
    { id: 1824, title: "8월 예배위원", author: "관리자", date: "2026.07.16" },
    { id: 1823, title: "담임목사님 케냐, 튀르키예 사역일정", author: "관리자", date: "2026.07.04" },
    { id: 1822, title: "2026년 목장편성표(하반기)", author: "관리자", date: "2026.07.03" },
    { id: 1821, title: "7월 예배위원", author: "관리자", date: "2026.06.26" },
    { id: 1820, title: "7월 봉사위원안내_판교", author: "관리자", date: "2026.06.25" },
    { id: 1819, title: "7월 봉사위원안내_휘문", author: "관리자", date: "2026.06.22" },
    { id: 1818, title: "2026 해외 THINK TRIP 신청(3차)", author: "관리자", date: "2026.06.20" },
];

export function NewsSection({
    items = DEFAULT_NEWS_ITEMS,
    primaryColor = "#1B3A6B",
    onItemClick,
}: NewsSectionProps) {
    const [searchCategory, setSearchCategory] = useState("title");
    const [searchKeyword, setSearchKeyword] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    // 검색 필터링
    const filteredItems = items.filter((item) => {
        if (!searchKeyword.trim()) return true;
        const kw = searchKeyword.toLowerCase();
        if (searchCategory === "title") return item.title.toLowerCase().includes(kw);
        if (searchCategory === "author") return item.author?.toLowerCase().includes(kw);
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
            <div className="max-w-5xl mx-auto">
                {/* 상단 타이틀 */}
                <h2 className="text-2xl sm:text-3xl font-black text-gray-900 mb-8 tracking-tight">
                    공지사항
                </h2>

                {/* 검색 필터 바 */}
                <div className="bg-[#F8FAFC] border border-gray-100 rounded-2xl p-3 sm:p-4 mb-6 flex flex-col sm:flex-row gap-2 sm:gap-3 items-center">
                    <select
                        value={searchCategory}
                        onChange={(e) => setSearchCategory(e.target.value)}
                        className="w-full sm:w-32 bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs sm:text-sm text-gray-700 outline-none focus:border-blue-500 font-medium"
                    >
                        <option value="title">제목</option>
                        <option value="author">작성자</option>
                        <option value="all">제목+내용</option>
                    </select>

                    <div className="relative w-full flex-1">
                        <input
                            type="text"
                            placeholder="검색어를 입력해 주세요."
                            value={searchKeyword}
                            onChange={(e) => {
                                setSearchKeyword(e.target.value);
                                setCurrentPage(1);
                            }}
                            className="w-full bg-white border border-gray-200 rounded-xl pl-4 pr-10 py-2 text-xs sm:text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-blue-500 transition-all"
                        />
                        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    </div>
                </div>

                {/* 게시판 리스트 (PC / 태블릿 전용 테이블) */}
                <div className="hidden sm:block overflow-hidden border border-gray-100 rounded-2xl shadow-sm">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-[#F8FAFC] border-b border-gray-100 text-xs font-bold text-gray-500">
                                <th className="py-3.5 px-6 w-20 text-center">번호</th>
                                <th className="py-3.5 px-6">제목</th>
                                <th className="py-3.5 px-6 w-28 text-center">작성자</th>
                                <th className="py-3.5 px-6 w-32 text-center">날짜</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-sm">
                            {paginatedItems.length > 0 ? (
                                paginatedItems.map((item) => (
                                    <tr
                                        key={item.id}
                                        onClick={() => onItemClick?.(item)}
                                        className={`hover:bg-slate-50/80 transition-colors cursor-pointer ${
                                            item.isNotice ? "bg-red-50/20" : ""
                                        }`}
                                    >
                                        {/* 번호 / 공지 뱃지 */}
                                        <td className="py-4 px-6 text-center font-medium">
                                            {item.isNotice ? (
                                                <span className="inline-block bg-[#E5484D] text-white text-[11px] font-bold px-2.5 py-0.5 rounded-full">
                                                    공지
                                                </span>
                                            ) : (
                                                <span className="text-gray-400 text-xs">{item.id}</span>
                                            )}
                                        </td>

                                        {/* 제목 */}
                                        <td className="py-4 px-6 font-semibold text-gray-800 hover:underline">
                                            {item.title}
                                        </td>

                                        {/* 작성자 */}
                                        <td className="py-4 px-6 text-center text-xs text-gray-500">
                                            {item.author || "-"}
                                        </td>

                                        {/* 날짜 */}
                                        <td className="py-4 px-6 text-center text-xs text-gray-400">
                                            {item.date}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={4} className="py-12 text-center text-gray-400 text-sm">
                                        등록된 게시글이 없습니다.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* 모바일 전용 카드 리스트 */}
                <div className="block sm:hidden divide-y divide-gray-100 border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                    {paginatedItems.length > 0 ? (
                        paginatedItems.map((item) => (
                            <div
                                key={item.id}
                                onClick={() => onItemClick?.(item)}
                                className="p-4 bg-white active:bg-gray-50 transition-colors"
                            >
                                <div className="flex items-center gap-2 mb-1.5">
                                    {item.isNotice ? (
                                        <span className="bg-[#E5484D] text-white text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0">
                                            공지
                                        </span>
                                    ) : (
                                        <span className="text-gray-400 text-xs shrink-0">#{item.id}</span>
                                    )}
                                    <p className="text-xs text-gray-400 font-medium ml-auto">{item.date}</p>
                                </div>
                                <h3 className="text-sm font-bold text-gray-900 leading-snug break-keep">
                                    {item.title}
                                </h3>
                                {item.author && (
                                    <p className="text-[11px] text-gray-400 mt-2">작성자: {item.author}</p>
                                )}
                            </div>
                        ))
                    ) : (
                        <div className="py-10 text-center text-gray-400 text-xs">
                            등록된 게시글이 없습니다.
                        </div>
                    )}
                </div>

                {/* 페이지네이션 */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-1.5 mt-8">
                        <button
                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 text-gray-400 disabled:opacity-30 hover:bg-gray-50 transition-all"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>

                        {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                            <button
                                key={page}
                                onClick={() => setCurrentPage(page)}
                                className={`w-8 h-8 rounded-full text-xs font-bold transition-all ${
                                    currentPage === page
                                        ? "text-white shadow-sm"
                                        : "text-gray-500 hover:bg-gray-100"
                                }`}
                                style={{
                                    backgroundColor: currentPage === page ? primaryColor : "transparent",
                                }}
                            >
                                {page}
                            </button>
                        ))}

                        <button
                            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 text-gray-400 disabled:opacity-30 hover:bg-gray-50 transition-all"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                )}
            </div>
        </section>
    );
}
