import React, { useState, useEffect } from "react";
import { MapPin, Phone, Printer, Download, Train, Bus, Car } from "lucide-react";

export interface SubwayGuide {
    lineName: string;      // ex. "분당선", "신분당선"
    lineColor?: string;     // 호선 대표 색상 (기본값 제공)
    description: string;   // 이용 상세 설명
}

export interface BusGuide {
    direction: string;     // ex. "안양방면", "강남/양재방면"
    busNumbers: string[];  // ex. ["1303", "310"]
    routeInfo?: string;    // 경유지 상세
}

interface LocationSectionProps {
    churchName?: string;
    address?: string;
    phone?: string;
    fax?: string;
    kakaoMapKey?: string;   // Kakao Map API Key (선택 사항)
    mapDownloadUrl?: string; // 약도 다운로드 링크
    subwayGuides?: SubwayGuide[];
    busGuides?: BusGuide[];
    parkingInfo?: string;   // 주차 안내 텍스트
    primaryColor?: string;
}

export function LocationSection({
    churchName = "",
    address = "",
    phone,
    fax,
    mapDownloadUrl,
    subwayGuides = [],
    busGuides = [],
    parkingInfo,
    primaryColor = "#1B3A6B",
}: LocationSectionProps) {
    // 주차 안내는 교회가 실제로 입력한 내용이 있을 때만 탭 자체를 보여줌(가짜 안내문 대체 없음)
    const [activeTab, setActiveTab] = useState<"location" | "parking">("location");

    // 카카오 지도 기본 길찾기 URL 생성
    const kakaoMapSearchUrl = `https://map.kakao.com/link/search/${encodeURIComponent(address)}`;

    return (
        <section className="w-full bg-white py-10 sm:py-16 px-4 sm:px-8">
            <div className="max-w-6xl mx-auto">
                {/* 1. 상단 타이틀 — 다른 섹션(최근 소식 등)과 같은 결: 흰 배경에 왼쪽 정렬 라벨+제목 */}
                <div className="mb-8 sm:mb-10">
                    <p className="text-xs font-bold tracking-[0.25em] mb-2" style={{ color: primaryColor }}>VISIT US</p>
                    <h2 className="text-2xl sm:text-3xl font-black text-gray-900 mb-3 break-keep">
                        {churchName} 오시는 길
                    </h2>
                    <p className="text-sm text-gray-500 font-medium break-keep">
                        대중교통과 주차 정보를 한눈에 확인하세요.
                    </p>
                </div>

                {/* 2. 탭 스위처 (오시는 방법 / 주차안내) — 주차 안내는 실제로 입력된 내용이 있을 때만 노출 */}
                {parkingInfo && (
                    <div className="flex justify-center mb-10">
                        <div className="bg-[#F1F5F9] p-1.5 rounded-full flex gap-1">
                            <button
                                onClick={() => setActiveTab("location")}
                                className={`px-6 py-2.5 rounded-full text-xs sm:text-sm font-bold transition-all ${
                                    activeTab === "location"
                                        ? "bg-[#1E293B] text-white shadow-sm"
                                        : "text-gray-500 hover:text-gray-900"
                                }`}
                            >
                                오시는 방법
                            </button>
                            <button
                                onClick={() => setActiveTab("parking")}
                                className={`px-6 py-2.5 rounded-full text-xs sm:text-sm font-bold transition-all ${
                                    activeTab === "parking"
                                        ? "bg-[#1E293B] text-white shadow-sm"
                                        : "text-gray-500 hover:text-gray-900"
                                }`}
                            >
                                주차안내
                            </button>
                        </div>
                    </div>
                )}

                {/* TAB 1: 오시는 방법 */}
                {activeTab === "location" && (
                    <div className="space-y-10">
                        {/* 메인 정보 카드 — 카카오맵 지도 미리보기(iframe)는 빼고, 정보 카드 + 길찾기 버튼만 사용 */}
                        <div className="bg-[#F8FAFC] border border-gray-100 rounded-3xl p-7 sm:p-10 max-w-xl">
                            <h3 className="text-xl sm:text-2xl font-black text-gray-900 mb-6 break-keep">
                                {churchName}
                            </h3>
                            <div className="space-y-4 text-xs sm:text-sm font-medium text-gray-600">
                                <div className="flex items-start gap-3">
                                    <MapPin className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                                    <div>
                                        <span className="font-bold text-gray-900 block mb-0.5">주소</span>
                                        <span className="break-keep">{address}</span>
                                    </div>
                                </div>
                                {phone && (
                                    <div className="flex items-start gap-3">
                                        <Phone className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                                        <div>
                                            <span className="font-bold text-gray-900 block mb-0.5">전화</span>
                                            <span>{phone}</span>
                                        </div>
                                    </div>
                                )}
                                {fax && (
                                    <div className="flex items-start gap-3">
                                        <Printer className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                                        <div>
                                            <span className="font-bold text-gray-900 block mb-0.5">팩스</span>
                                            <span>{fax}</span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="mt-8 pt-6 border-t border-gray-100">
                                <a
                                    href={kakaoMapSearchUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center justify-center w-full bg-[#FEE500] text-[#191919] font-bold text-xs sm:text-sm py-3 px-4 rounded-2xl hover:bg-[#FADA0A] transition-all gap-2"
                                >
                                    카카오맵에서 길찾기 →
                                </a>
                            </div>
                        </div>

                        {/* 약도 다운로드 밴드 — 실제로 등록된 파일이 있을 때만 노출(항상 실패하는 버튼 방지) */}
                        {mapDownloadUrl && (
                        <div className="bg-[#F8FAFC] border border-gray-100 rounded-2xl p-4 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                            <p className="text-xs sm:text-sm text-gray-600 font-medium text-center sm:text-left break-keep">
                                교회의 인쇄용 약도 파일이 필요하신 분은 아래 버튼을 눌러 다운로드하세요.
                            </p>
                            <a
                                href={mapDownloadUrl}
                                download
                                className="inline-flex items-center gap-2 bg-white border border-gray-200 text-xs sm:text-sm font-bold text-gray-800 px-5 py-2.5 rounded-xl hover:bg-gray-50 transition-all shrink-0 shadow-sm"
                            >
                                <Download className="w-4 h-4 text-gray-500" />
                                약도 다운로드
                            </a>
                        </div>
                        )}

                        {/* 지하철 안내 */}
                        {subwayGuides.length > 0 && (
                            <div className="space-y-4">
                                <div className="flex items-center gap-2.5">
                                    <div className="p-2 rounded-xl bg-slate-100 text-slate-800">
                                        <Train className="w-5 h-5" />
                                    </div>
                                    <h4 className="text-lg sm:text-xl font-bold text-gray-900">
                                        지하철로 오실 때
                                    </h4>
                                </div>

                                <div className="bg-[#F8FAFC] border border-gray-100 rounded-3xl p-6 sm:p-8 space-y-6">
                                    {subwayGuides.map((guide, idx) => (
                                        <div key={idx} className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 pb-6 border-b border-gray-200/60 last:pb-0 last:border-b-0">
                                            {/* 지하철 호선 아이콘 뱃지 */}
                                            <div className="flex items-center gap-2 shrink-0 sm:w-36">
                                                <div className="w-10 h-10 rounded-full bg-white border border-gray-200 flex items-center justify-center shadow-sm">
                                                    <Train className="w-5 h-5 text-gray-700" />
                                                </div>
                                                <span className="text-xs font-bold text-gray-800 break-keep">
                                                    {guide.lineName}
                                                </span>
                                            </div>
                                            {/* 가이드 설명 */}
                                            <p className="text-xs sm:text-sm text-gray-700 font-medium leading-relaxed break-keep">
                                                {guide.description}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* 버스 안내 */}
                        {busGuides.length > 0 && (
                            <div className="space-y-4">
                                <div className="flex items-center gap-2.5">
                                    <div className="p-2 rounded-xl bg-slate-100 text-slate-800">
                                        <Bus className="w-5 h-5" />
                                    </div>
                                    <h4 className="text-lg sm:text-xl font-bold text-gray-900">
                                        버스로 오실 때
                                    </h4>
                                </div>

                                <div className="bg-[#F8FAFC] border border-gray-100 rounded-3xl p-6 sm:p-8 space-y-6">
                                    {busGuides.map((bus, idx) => (
                                        <div key={idx} className="pb-6 border-b border-gray-200/60 last:pb-0 last:border-b-0">
                                            <div className="flex items-center gap-3 mb-2">
                                                <Bus className="w-4 h-4 text-gray-400 shrink-0" />
                                                <span className="text-sm font-bold text-gray-900">
                                                    {bus.direction}
                                                </span>
                                            </div>
                                            
                                            {/* 버스 번호 뱃지 */}
                                            <div className="flex flex-wrap gap-1.5 ml-7 mb-2">
                                                {bus.busNumbers.map((num, i) => (
                                                    <span
                                                        key={i}
                                                        className="bg-white border border-gray-200 text-[#E5484D] text-xs font-black px-2.5 py-1 rounded-lg shadow-2xs"
                                                    >
                                                        {num}
                                                    </span>
                                                ))}
                                            </div>

                                            {/* 노선 경로 */}
                                            {bus.routeInfo && (
                                                <p className="text-xs text-gray-500 font-medium ml-7 leading-relaxed break-keep">
                                                    {bus.routeInfo}
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* TAB 2: 주차 안내 */}
                {activeTab === "parking" && parkingInfo && (
                    <div className="bg-[#F8FAFC] border border-gray-100 rounded-3xl p-8 sm:p-12">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-3 rounded-2xl bg-white border border-gray-200 shadow-sm text-gray-800">
                                <Car className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-xl sm:text-2xl font-bold text-gray-900">주차 안내</h3>
                                <p className="text-xs text-gray-500">교회 방문객 및 성도용 주차 시설 안내</p>
                            </div>
                        </div>

                        <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
                            <p className="text-xs sm:text-sm text-gray-700 leading-relaxed whitespace-pre-wrap font-medium break-keep">
                                {parkingInfo}
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
}
