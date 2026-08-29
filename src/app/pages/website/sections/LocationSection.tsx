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

// 이미지 시안 기준 기본 데이터
const DEFAULT_SUBWAY_GUIDES: SubwayGuide[] = [
    {
        lineName: "분당선/신분당선",
        lineColor: "#F5A623",
        description: "정자역(2번 출구)에서 220번 버스 환승 → 백현교차로(남서울 골프장 입구) 정류장(4 정거장)에서 하차",
    },
    {
        lineName: "분당선",
        lineColor: "#F5A623",
        description: "수내역(2번 또는 3번 출구)에서 200m 직진 → 하나은행 앞 버스정류소에서 220번, 370번 버스 환승 → 백현교차로 정류장(2 정거장)에서 하차",
    },
    {
        lineName: "신분당선",
        lineColor: "#D0021B",
        description: "판교역(1번 출구)에서 150m 직진 후 횡단보도 건너편 → 판교역북편 버스정류장에서 마을버스 107번, 117번 환승 → 백현교차로 정류장(4 정거장)에서 하차",
    },
];

const DEFAULT_BUS_GUIDES: BusGuide[] = [
    {
        direction: "안양방면",
        busNumbers: ["1303"],
        routeInfo: "안양역 - 안양시청 - 관양동 - 인덕원역 - 백현교차로 - 정자역 - 죽전 - 단국대학교 - 외국어대학교",
    },
    {
        direction: "강남/양재방면",
        busNumbers: ["1241"],
        routeInfo: "신논현역 - 강남역티월드 - 서초구청 - 낙생고등학교 - 오리역 - 법무연수원 - 청덕중고교",
    },
    {
        direction: "휘문/잠실방면",
        busNumbers: ["6900"],
        routeInfo: "휘문고입구 - 삼성역 - 잠실종합운동장 - 잠실역 - 석촌역 - 수서역 - 낙생고등학교 - 동천 - 광교차고지",
    },
    {
        direction: "판교역방면",
        busNumbers: ["310", "370", "누리1"],
        routeInfo: "판교역동편 - 성남역 - 서현역 - 수내역 - 한국석유관리원.교회앞",
    },
];

export function LocationSection({
    churchName = "판교채플",
    address = "경기도 성남시 분당구 안양판교로 1219 (판교동)",
    phone = "031-719-3882",
    fax = "031-716-3881",
    mapDownloadUrl,
    subwayGuides = DEFAULT_SUBWAY_GUIDES,
    busGuides = DEFAULT_BUS_GUIDES,
    parkingInfo = "성전 내 주차장 및 제2주차장을 이용하실 수 있습니다. 주일 예배 시간대에는 안내위원의 지시에 따라 주차해 주시기 바랍니다.",
    primaryColor = "#1B3A6B",
}: LocationSectionProps) {
    const [activeTab, setActiveTab] = useState<"location" | "parking">("location");

    // 카카오 지도 기본 길찾기 URL 생성
    const kakaoMapSearchUrl = `https://map.kakao.com/link/search/${encodeURIComponent(address)}`;

    return (
        <section className="w-full bg-white py-10 sm:py-16 px-4 sm:px-8">
            <div className="max-w-5xl mx-auto">
                {/* 1. 상단 히어로 타이틀 밴드 */}
                <div 
                    className="rounded-3xl p-8 sm:p-12 text-white mb-8 shadow-sm transition-all"
                    style={{ backgroundColor: primaryColor }}
                >
                    <p className="text-xs font-bold tracking-[0.25em] text-white/70 mb-2">VISIT US</p>
                    <h2 className="text-2xl sm:text-4xl font-black mb-3 break-keep">
                        {churchName} 오시는 길
                    </h2>
                    <p className="text-xs sm:text-sm text-white/80 font-medium break-keep">
                        대중교통과 주차 정보를 한눈에 확인하세요.
                    </p>
                </div>

                {/* 2. 탭 스위처 (오시는 방법 / 주차안내) */}
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

                {/* TAB 1: 오시는 방법 */}
                {activeTab === "location" && (
                    <div className="space-y-10">
                        {/* 지도 & 메인 정보 카드 */}
                        <div className="bg-[#F8FAFC] border border-gray-100 rounded-3xl overflow-hidden shadow-sm grid grid-cols-1 lg:grid-cols-12">
                            {/* 좌측: 정보 영역 */}
                            <div className="lg:col-span-5 p-7 sm:p-10 flex flex-col justify-between bg-white lg:bg-transparent">
                                <div>
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

                            {/* 우측: 지도 영역 (Iframe / Kakao Map) */}
                            <div className="lg:col-span-7 aspect-square sm:aspect-video lg:aspect-auto min-h-[300px] bg-gray-200 relative">
                                <iframe
                                    title={`${churchName} 지도`}
                                    src={`https://m.map.kakao.com/actions/searchView?q=${encodeURIComponent(address)}`}
                                    className="w-full h-full border-0"
                                />
                            </div>
                        </div>

                        {/* 약도 다운로드 밴드 */}
                        <div className="bg-[#F8FAFC] border border-gray-100 rounded-2xl p-4 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                            <p className="text-xs sm:text-sm text-gray-600 font-medium text-center sm:text-left break-keep">
                                교회의 인쇄용 약도 파일이 필요하신 분은 아래 버튼을 눌러 다운로드하세요.
                            </p>
                            <a
                                href={mapDownloadUrl || "#"}
                                download
                                onClick={(e) => {
                                    if (!mapDownloadUrl) {
                                        e.preventDefault();
                                        alert("준비된 약도 다운로드 파일이 없습니다.");
                                    }
                                }}
                                className="inline-flex items-center gap-2 bg-white border border-gray-200 text-xs sm:text-sm font-bold text-gray-800 px-5 py-2.5 rounded-xl hover:bg-gray-50 transition-all shrink-0 shadow-sm"
                            >
                                <Download className="w-4 h-4 text-gray-500" />
                                약도 다운로드
                            </a>
                        </div>

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
                {activeTab === "parking" && (
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
