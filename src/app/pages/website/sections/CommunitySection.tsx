import { Phone, Mail } from "lucide-react";

export interface StaffMember {
    role: string;        // ex. "부목사", "전도사"
    name: string;
    department: string;  // ex. "청년부", "교육부"
    phone?: string;
    email?: string;
    photoUrl?: string;
}

interface CommunitySectionProps {
    churchName?: string;
    primaryColor?: string;
    accentColor?: string;
    staffMembers?: StaffMember[];
}

const SectionTitle = ({ title, accentColor = "#E5484D" }: { title: string; accentColor?: string }) => (
    <div className="flex items-center gap-2.5 mb-6 mt-16 first:mt-0">
        <div className="w-1 h-5 rounded-full" style={{ backgroundColor: accentColor }}></div>
        <h3 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">{title}</h3>
    </div>
);

export function CommunitySection({
    churchName = "우리 교회",
    primaryColor = "#1B3A6B",
    accentColor = "#E5484D",
    staffMembers = [],
}: CommunitySectionProps) {
    return (
        <section className="w-full bg-white py-10 sm:py-16 px-4 sm:px-8">
            <div className="max-w-6xl mx-auto">
                {/* 1. 상단 타이틀 — 다른 섹션(최근 소식 등)과 같은 결: 흰 배경에 왼쪽 정렬 라벨+제목 */}
                <div className="mb-8 sm:mb-10">
                    <p className="text-xs font-bold tracking-[0.25em] mb-2" style={{ color: primaryColor }}>OUR COMMUNITY</p>
                    <h2 className="text-2xl sm:text-3xl font-black text-gray-900 mb-3 break-keep">
                        {churchName} 공동체
                    </h2>
                    <p className="text-sm text-gray-500 font-medium break-keep">
                        함께 섬기고 함께 자라가는 사람들을 소개합니다.
                    </p>
                </div>

                {/* 2. 섬기는 사람들 — 카드 그리드 대신 명단처럼 한 줄씩 나열(주일 예배 안내와 같은 결) */}
                <SectionTitle title="섬기는 사람들" accentColor={accentColor} />
                <div className="divide-y divide-gray-100 border-t border-b border-gray-100">
                    {staffMembers.map((s, i) => (
                        <div key={i} className="flex items-start gap-4 py-5">
                            {s.photoUrl ? (
                                <img
                                    src={s.photoUrl}
                                    alt={s.name}
                                    className="w-12 h-12 rounded-full object-cover shrink-0"
                                />
                            ) : (
                                <div
                                    className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm shrink-0"
                                    style={{ background: `${primaryColor}14`, color: primaryColor }}
                                >
                                    {s.name.slice(0, 1)}
                                </div>
                            )}
                            <div className="min-w-0 flex-1">
                                <div className="flex items-baseline gap-2 flex-wrap mb-0.5">
                                    <p className="text-base font-bold text-gray-900 break-keep">{s.name}</p>
                                    <p className="text-xs font-semibold" style={{ color: primaryColor }}>{s.role}</p>
                                </div>
                                <p className="text-sm text-gray-500 break-keep">{s.department}</p>
                                {(s.phone || s.email) && (
                                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                                        {s.phone && (
                                            <a href={`tel:${s.phone}`} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-900 transition-colors">
                                                <Phone className="w-3.5 h-3.5" /> {s.phone}
                                            </a>
                                        )}
                                        {s.email && (
                                            <a href={`mailto:${s.email}`} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-900 transition-colors">
                                                <Mail className="w-3.5 h-3.5" /> {s.email}
                                            </a>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
