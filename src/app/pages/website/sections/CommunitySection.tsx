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

// 예시 데이터 (다른 sections 파일들과 동일한 방식으로, 실제 데이터 연결 전까지 보여줄 기본값)
const DEFAULT_STAFF_MEMBERS: StaffMember[] = [
    { role: "부목사", name: "김은혜", department: "청년부", phone: "031-719-3882", email: "youth@church.org" },
    { role: "부목사", name: "이소망", department: "교육부", phone: "031-719-3882", email: "edu@church.org" },
    { role: "전도사", name: "박믿음", department: "유아유치부" },
];

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
    staffMembers = DEFAULT_STAFF_MEMBERS,
}: CommunitySectionProps) {
    return (
        <section className="w-full bg-white py-10 sm:py-16 px-4 sm:px-8">
            <div className="max-w-5xl mx-auto">
                {/* 1. 상단 히어로 배너 */}
                <div
                    className="rounded-3xl p-8 sm:p-12 text-white mb-8 shadow-sm"
                    style={{ backgroundColor: primaryColor }}
                >
                    <p className="text-xs font-bold tracking-[0.25em] text-white/70 mb-2">OUR COMMUNITY</p>
                    <h2 className="text-2xl sm:text-4xl font-black mb-3 break-keep">
                        {churchName} 공동체
                    </h2>
                    <p className="text-xs sm:text-sm text-white/80 font-medium break-keep">
                        함께 섬기고 함께 자라가는 사람들을 소개합니다.
                    </p>
                </div>

                {/* 2. 섬기는 사람들 */}
                <SectionTitle title="섬기는 사람들" accentColor={accentColor} />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {staffMembers.map((s, i) => (
                        <div
                            key={i}
                            className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm hover:shadow-md transition-shadow"
                        >
                            {s.photoUrl ? (
                                <img
                                    src={s.photoUrl}
                                    alt={s.name}
                                    className="w-16 h-16 rounded-full object-cover mb-4"
                                />
                            ) : (
                                <div
                                    className="w-16 h-16 rounded-full flex items-center justify-center mb-4 font-bold text-lg"
                                    style={{ background: `${primaryColor}14`, color: primaryColor }}
                                >
                                    {s.name.slice(0, 1)}
                                </div>
                            )}
                            <p className="text-[11px] font-bold tracking-wide mb-1" style={{ color: primaryColor }}>{s.role}</p>
                            <p className="text-base font-bold text-gray-900 mb-1 break-keep">{s.name}</p>
                            <p className="text-sm text-gray-500 mb-3 break-keep">{s.department}</p>
                            {(s.phone || s.email) && (
                                <div className="pt-3 border-t border-gray-100 space-y-1.5">
                                    {s.phone && (
                                        <a href={`tel:${s.phone}`} className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-900 transition-colors">
                                            <Phone className="w-3.5 h-3.5" /> {s.phone}
                                        </a>
                                    )}
                                    {s.email && (
                                        <a href={`mailto:${s.email}`} className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-900 transition-colors truncate">
                                            <Mail className="w-3.5 h-3.5" /> {s.email}
                                        </a>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
