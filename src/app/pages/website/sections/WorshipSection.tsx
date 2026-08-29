import React from "react";
import {
    Baby,
    Smile,
    Heart,
    Dribbble,
    School,
    BookOpen,
    MonitorPlay,
    Laptop,
    GraduationCap,
} from "lucide-react";

interface SundaySchoolInfo {
    title: string;
    target: string;
    timeLocation: string;
    icon: React.ElementType;
}

interface SmallGroupInfo {
    title: string;
    description: string;
}

interface WorshipSectionProps {
    chapelName?: string;
    primaryColor?: string;
    accentColor?: string;
}

// 시안 기반 주일학교 데이터
const SUNDAY_SCHOOL_DATA: SundaySchoolInfo[] = [
    { title: "영아부", target: "0~3세, 엄마, 아빠와 함께 드리는 예배", timeLocation: "오전 10 : 45, 영아부실(2층)", icon: Baby },
    { title: "유아유치부(통합)", target: "4~7세, 말씀으로 쑥쑥 자라는 시간", timeLocation: "오전 09 : 00, 유아부실(2층)", icon: Smile },
    { title: "유아부", target: "4~5세, 말씀으로 쑥쑥 자라는 시간", timeLocation: "오전 11 : 30, 4세: 유아부실(2층) / 5세: 유아부실(3층)", icon: Heart },
    { title: "유치부", target: "6~7세, 말씀으로 쑥쑥 자라는 시간", timeLocation: "오전 11 : 30, 유치부실(5층)", icon: Dribbble },
    { title: "유년부", target: "초1~초2, 어린이예배", timeLocation: "오전 09 : 00 / 오전 11 : 30, 유년부실(5층)", icon: School },
    { title: "초등부", target: "초3~초4, 어린이예배", timeLocation: "오전 09 : 00 / 오전 11 : 30, 초등부실(6층)", icon: BookOpen },
    { title: "소년부", target: "초5~초6, 어린이예배", timeLocation: "오전 09 : 00 / 오전 11 : 30, 연수홀(4층)", icon: MonitorPlay },
    { title: "중등부", target: "중등과정에 해당하는 청소년", timeLocation: "오전 09 : 00, 3층 식당 / 오전 11 : 30, 탄설홀(7층)", icon: Laptop },
    { title: "고등부", target: "고등과정에 해당하는 청소년", timeLocation: "오전 09 : 00, 탄설홀(7층)", icon: GraduationCap },
];

// 시안 기반 소그룹 모임 데이터
const SMALL_GROUP_DATA: SmallGroupInfo[] = [
    { title: "새가족교육", description: "모든 예배 후, 새가족&VIP실(3층)" },
    { title: "기초양육반", description: "주일반 오후 02 : 00, 교사회의실(5층)" },
    { title: "목장모임", description: "각 목장별로 정해진 시간과 장소에서" },
];

// 섹션 타이틀 컴포넌트 (좌측 붉은색 바 포함)
const SectionTitle = ({ title, accentColor = "#E5484D" }: { title: string, accentColor?: string }) => (
    <div className="flex items-center gap-2.5 mb-6 mt-16 first:mt-0">
        <div className="w-1 h-5 rounded-full" style={{ backgroundColor: accentColor }}></div>
        <h3 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">{title}</h3>
    </div>
);

export function WorshipSection({
    chapelName = "판교채플",
    primaryColor = "#1B3A6B",
    accentColor = "#E5484D",
}: WorshipSectionProps) {
    return (
        <section className="w-full bg-white py-10 sm:py-16 px-4 sm:px-8">
            <div className="max-w-5xl mx-auto">
                {/* 1. 상단 히어로 배너 */}
                <div 
                    className="relative rounded-3xl p-8 sm:p-12 text-white mb-14 shadow-sm overflow-hidden"
                    style={{ backgroundColor: primaryColor }}
                >
                    <div className="relative z-10">
                        <p className="text-xs font-bold tracking-[0.25em] text-white/70 mb-3">WORSHIP SCHEDULE</p>
                        <h2 className="text-2xl sm:text-4xl font-black mb-4 leading-snug break-keep">
                            말씀과 예배로<br />한 주를 시작합니다.
                        </h2>
                        <p className="text-xs sm:text-sm text-white/80 font-medium break-keep">
                            {chapelName}의 예배와 다음 세대를 위한 부서별 모임 시간을 안내합니다.
                        </p>
                    </div>
                    {/* 우측 하단 라벨 */}
                    <div className="absolute bottom-6 right-8 hidden sm:block">
                        <span className="px-4 py-1.5 rounded-full border border-white/20 text-[10px] font-bold tracking-widest text-white/60">
                            PANGYO CHAPEL
                        </span>
                    </div>
                    {/* 배경 장식 패턴 (옵션) */}
                    <div className="absolute top-0 right-0 w-64 h-full bg-gradient-to-l from-white/5 to-transparent skew-x-12 translate-x-10"></div>
                </div>

                {/* 2. 예배시간 (비대칭 2단 구조) */}
                <SectionTitle title="예배시간" accentColor={accentColor} />
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                    {/* 좌측: 주일예배 */}
                    <div className="lg:col-span-7 bg-white border border-gray-100 rounded-3xl p-7 sm:p-9 shadow-sm">
                        <h4 className="text-base font-bold text-gray-900 mb-5">주일예배</h4>
                        <div className="space-y-4 text-sm font-medium text-gray-600">
                            <p className="flex gap-2 break-keep">
                                <span className="font-bold text-gray-800 shrink-0">· 1부 :</span> 
                                모든 성도, 오전 06 : 50, 본당(우리들홀)
                            </p>
                            <p className="flex gap-2 break-keep">
                                <span className="font-bold text-gray-800 shrink-0">· 2부 :</span> 
                                모든 성도, 오전 08 : 50, 본당(우리들홀)
                            </p>
                            <p className="flex gap-2 break-keep">
                                <span className="font-bold text-gray-800 shrink-0">· 3부 :</span> 
                                모든 성도, 오전 11 : 30, 본당(우리들홀)
                            </p>
                            <p className="flex gap-2 break-keep">
                                <span className="font-bold text-gray-800 shrink-0">· 4부 :</span> 
                                모든 성도(청년중심), 오후 02 : 00, 본당(우리들홀)
                            </p>
                        </div>
                    </div>

                    {/* 우측: 수요모임 & 새벽기도 (세로 스택) */}
                    <div className="lg:col-span-5 flex flex-col gap-5">
                        <div className="bg-white border border-gray-100 rounded-3xl p-7 sm:p-9 shadow-sm flex-1">
                            <h4 className="text-base font-bold text-gray-900 mb-4">수요오전큐티모임</h4>
                            <p className="text-sm font-medium text-gray-600 flex gap-2 break-keep">
                                <span className="font-bold text-gray-800 shrink-0">·</span> 
                                모든 성도, 오전 10 : 00, 본당(우리들홀)
                            </p>
                        </div>
                        <div className="bg-white border border-gray-100 rounded-3xl p-7 sm:p-9 shadow-sm flex-1">
                            <h4 className="text-base font-bold text-gray-900 mb-4">새벽기도</h4>
                            <p className="text-sm font-medium text-gray-600 flex gap-2 break-keep">
                                <span className="font-bold text-gray-800 shrink-0">· 새벽기도회 :</span> 
                                모든 성도, 오전 05 : 30, 연수홀(4층)
                            </p>
                        </div>
                    </div>
                </div>

                {/* 3. 주일학교 (그리드 카드뷰) */}
                <SectionTitle title="주일학교" accentColor={accentColor} />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {SUNDAY_SCHOOL_DATA.map((item, idx) => {
                        const IconComponent = item.icon;
                        return (
                            <div key={idx} className="relative bg-white border border-gray-100 rounded-3xl p-6 sm:p-8 shadow-sm overflow-hidden min-h-[160px] flex flex-col justify-between group">
                                <div className="relative z-10">
                                    <h4 className="text-lg font-bold text-gray-900 mb-3">{item.title}</h4>
                                    <div className="space-y-1.5 text-xs sm:text-sm text-gray-600 font-medium">
                                        <p className="flex gap-1.5 break-keep">
                                            <span className="shrink-0 text-gray-400">·</span>
                                            {item.target}
                                        </p>
                                        <p className="flex gap-1.5 break-keep">
                                            <span className="shrink-0 text-gray-400">·</span>
                                            {item.timeLocation}
                                        </p>
                                    </div>
                                </div>
                                {/* 우측 하단 연한 아이콘 워터마크 */}
                                <div className="absolute -bottom-4 -right-4 w-24 h-24 text-gray-100 opacity-50 group-hover:scale-110 group-hover:text-gray-100 transition-transform duration-300 pointer-events-none flex items-center justify-center">
                                    <IconComponent strokeWidth={1} className="w-16 h-16" />
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* 4. 소그룹 모임 */}
                <SectionTitle title="소그룹모임" accentColor={accentColor} />
                <div className="bg-white border border-gray-100 rounded-3xl p-6 sm:p-8 shadow-sm">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
                        {/* 좌측 리스트 */}
                        <div className="flex flex-col">
                            {SMALL_GROUP_DATA.map((group, idx) => (
                                <div key={idx} className="flex flex-col sm:flex-row py-4 border-b border-gray-100 last:border-0 gap-2 sm:gap-6">
                                    <h5 className="w-32 text-sm font-bold text-gray-900 shrink-0">
                                        {group.title}
                                    </h5>
                                    <p className="text-sm font-medium text-gray-600 break-keep">
                                        {group.description}
                                    </p>
                                </div>
                            ))}
                        </div>
                        {/* 우측 이미지 (더미 이미지 삽입) */}
                        <div className="aspect-[16/9] lg:aspect-[4/3] rounded-2xl overflow-hidden shadow-sm bg-gray-100">
                            <img 
                                src="https://images.unsplash.com/photo-1529156069898-49953eb1f5f4?q=80&w=2940&auto=format&fit=crop" 
                                alt="소그룹 모임"
                                className="w-full h-full object-cover"
                            />
                        </div>
                    </div>
                </div>
                
            </div>
        </section>
    );
}
