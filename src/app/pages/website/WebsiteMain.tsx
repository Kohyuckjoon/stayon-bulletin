import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import {
    Sparkles, CheckCircle2, ArrowRight, ShieldCheck, ChevronDown, ChevronUp, ChevronRight,
    XCircle, Check, MapPin, Users, Zap, UserPlus, Search, Clock, Building2, BookOpen, HeartHandshake, PhoneCall, HelpCircle, Tag,
    FileEdit, Wand2, Rocket, Smartphone, Globe2, LayoutTemplate, Lock
} from 'lucide-react';
import { auth, db } from '../../../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { setLoginReturnTo } from '../../../utils/loginReturn';
import { getPublishedChurchSites, ChurchSite } from '../../../utils/churchSite';

export function WebsiteMain() {
    const navigate = useNavigate();
    const [openFaq, setOpenFaq] = useState<number | null>(null);
    const [billingType, setBillingType] = useState<'monthly' | 'quarterly'>('monthly');
    const [isScrolled, setIsScrolled] = useState(false);
    // "스테이온과 함께 하고 있는 교회" 섹션용 — 실제 배포된 사이트 목록, 새 사이트가
    // 배포될 때마다 자동으로 반영됨(수동으로 추가할 필요 없음)
    const [partnerSites, setPartnerSites] = useState<ChurchSite[]>([]);

    // 주보 플랫폼과 동일한 Firebase 프로젝트를 쓰기 때문에, 이미 로그인되어 있으면 여기서도 그대로 인식됨
    const [currentUser, setCurrentUser] = useState<{ email: string; churchName: string } | null>(null);

    const toggleFaq = (index: number) => {
        setOpenFaq(openFaq === index ? null : index);
    };

    // 상단 네비게이션의 #process 같은 앵커 링크가 원래 브라우저 기본 동작(순간이동)이라
    // 화면이 뚝 끊겨 보였음 — 부드럽게 스크롤되도록 직접 계산해서 이동. sticky 헤더 높이만큼
    // 보정하지 않으면 섹션 상단이 헤더 뒤에 가려서 시작됨
    const scrollToSection = (id: string) => (e: React.MouseEvent) => {
        e.preventDefault();
        const el = document.getElementById(id);
        if (!el) return;
        // 모바일은 헤더 아래에 칩 메뉴가 하나 더 sticky로 붙어 있어서, PC보다 더 많이 보정해야
        // 섹션 제목이 그 밑에 가려지지 않음
        const isMobile = window.innerWidth < 768;
        const headerOffset = isMobile ? 132 : 88;
        const top = el.getBoundingClientRect().top + window.scrollY - headerOffset;
        window.scrollTo({ top, behavior: 'smooth' });
    };

    const navItems = [
        { id: 'process', label: '만드는 방법' },
        { id: 'features', label: '서비스 특징' },
        { id: 'why', label: '왜 필요한가?' },
        { id: 'comparison', label: '기존 방식 비교' },
        { id: 'pricing', label: '요금 안내' },
        { id: 'faq', label: 'FAQ' },
    ];

    useEffect(() => {
        const handleScroll = () => setIsScrolled(window.scrollY > 20);
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    useEffect(() => {
        getPublishedChurchSites().then(setPartnerSites).catch((error) => {
            console.error('배포된 교회 사이트 목록 로드 실패:', error);
        });
    }, []);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (!user) {
                setCurrentUser(null);
                return;
            }
            try {
                const userDoc = await getDoc(doc(db, 'users', user.uid));
                const churchName = userDoc.exists() ? (userDoc.data().churchName || '우리 교회') : '우리 교회';
                setCurrentUser({ email: user.email || '', churchName });
            } catch (error) {
                console.error('로그인 정보 로드 실패:', error);
                setCurrentUser({ email: user.email || '', churchName: '우리 교회' });
            }
        });
        return () => unsubscribe();
    }, []);

    const mockupRows = [
        { icon: Clock, title: '주일 1·2·3부 예배 안내', sub: '오전 9시 · 11시 · 오후 2시 (본당)' },
        { icon: BookOpen, title: '이번 주 주보 및 설교', sub: '제 2026-30호 말씀 요약 보기' },
        { icon: MapPin, title: '교회 오시는 길 & 주차', sub: '서울특별시 서초구 방배로 123' },
    ];

    const processSteps = [
        { icon: FileEdit, num: '1', title: '빈칸만 채우기', desc: '교회 이름, 예배 시간, 주소만 입력하면 끝. 어려운 설정은 하나도 없습니다.' },
        { icon: Wand2, num: '2', title: '실시간으로 바로 확인', desc: '입력하는 즉시 화면에 그대로 반영돼요. 저장하고 새로고침할 필요가 없습니다.' },
        { icon: Rocket, num: '3', title: '내 교회 주소로 오픈', desc: '교회이름.stayon-platform.com 주소로 바로 오픈, 네이버·구글 검색까지 자동 대응.' },
    ];

    const whyCards = [
        { icon: UserPlus, title: '새가족을 위한 첫인상', desc: '처음 교회를 찾는 성도가 가장 먼저 예배 시간과 위치를 스마트폰으로 확인합니다. 깔끔하고 신뢰가는 공식 홈페이지가 곧 최고의 전도입니다.' },
        { icon: MapPin, title: '이사 및 정착 성도 맞이', desc: '우리 지역으로 이사 오신 성도분들이 교회의 비전, 목회자 소개, 소속 공동체 정보를 투명하고 쉽게 찾아볼 수 있도록 돕습니다.' },
        { icon: Search, title: '네이버·구글 검색 최적화(SEO)', desc: '포털 사이트에 우리 교회를 검색했을 때 정확한 위치와 예배 안내가 최상단에 노출되도록 필수 설정을 완벽하게 지원해 드립니다.' },
    ];

    const featureCards = [
        {
            step: '01',
            icon: Smartphone,
            title: '예배 안내 및 설교 영상 연동',
            desc: '매주 바뀌는 주일 설교 영상과 예배 시간을 성도들이 가장 보기 편한 구조로 실시간 업데이트할 수 있습니다.'
        },
        {
            step: '02',
            icon: LayoutTemplate,
            title: '교회 소개 및 목회철학',
            desc: '담임목사 인사말, 교회 연혁, 사역 비전을 담아 보수적이고 안정감 있는 정통 교회 디자인을 완성합니다.'
        },
        {
            step: '03',
            icon: Globe2,
            title: '모바일 완벽 호환 반응형',
            desc: '어르신들도 스마트폰으로 보시기 편하도록 글자 크기와 터치 버튼이 최적화된 모바일 전용 뷰를 제공합니다.'
        }
    ];

    return (
        <div className="min-h-screen bg-[#F4F6F8] text-[#191F28] font-sans antialiased selection:bg-blue-100 selection:text-blue-900 pb-20 md:pb-0">

            {/* 토스 스타일 상단 네비게이션바 (스크롤 시 배경/그림자 전환 + 시그니처 컬러톤 적용) */}
            <header className={`sticky top-0 z-50 transition-all duration-500 ${isScrolled
                ? 'bg-white/80 backdrop-blur-2xl border-b border-[#F2F4F6] shadow-[0_4px_20px_rgba(0,0,0,0.03)]'
                : 'bg-white border-b border-transparent'
                }`}>
                <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
                    <div className="flex items-center gap-2 sm:gap-3 cursor-pointer group" onClick={() => navigate('/')}>
                        <div className="w-8 h-8 sm:w-10 sm:h-10 bg-[#191F28] rounded-xl sm:rounded-[14px] flex items-center justify-center font-black text-base sm:text-lg text-white shadow-lg shadow-gray-200 transition-all duration-300 group-hover:scale-105 group-hover:rotate-[-5deg]">
                            S
                        </div>
                        <div className="flex flex-col leading-tight">
                            <span className="font-black text-[15px] sm:text-[18px] tracking-tight text-[#191F28]">STAYON</span>
                            <span className="hidden sm:block text-[10px] font-black text-[#3182F6] tracking-widest uppercase">교회 홈 빌더</span>
                        </div>
                    </div>

                    <nav className="hidden md:flex items-center gap-1">
                        <a href="#process" onClick={scrollToSection('process')} className="px-3.5 py-2.5 text-[14px] font-bold rounded-2xl text-[#4E5968] hover:bg-[#F9FAFB] hover:text-[#3182F6] transition-all">만드는 방법</a>
                        <a href="#features" onClick={scrollToSection('features')} className="px-3.5 py-2.5 text-[14px] font-bold rounded-2xl text-[#4E5968] hover:bg-[#F9FAFB] hover:text-[#3182F6] transition-all">서비스 특징</a>
                        <a href="#why" onClick={scrollToSection('why')} className="px-3.5 py-2.5 text-[14px] font-bold rounded-2xl text-[#4E5968] hover:bg-[#F9FAFB] hover:text-[#3182F6] transition-all">왜 필요한가?</a>
                        <a href="#comparison" onClick={scrollToSection('comparison')} className="px-3.5 py-2.5 text-[14px] font-bold rounded-2xl text-[#4E5968] hover:bg-[#F9FAFB] hover:text-[#3182F6] transition-all">기존 방식 비교</a>
                        <a href="#pricing" onClick={scrollToSection('pricing')} className="px-3.5 py-2.5 text-[14px] font-bold rounded-2xl text-[#4E5968] hover:bg-[#F9FAFB] hover:text-[#3182F6] transition-all">요금 안내</a>
                        <a href="#faq" onClick={scrollToSection('faq')} className="px-3.5 py-2.5 text-[14px] font-bold rounded-2xl text-[#4E5968] hover:bg-[#F9FAFB] hover:text-[#3182F6] transition-all">FAQ</a>
                    </nav>

                    <div className="flex items-center gap-1 sm:gap-3">
                        {currentUser ? (
                            <button
                                onClick={() => navigate('/admin')}
                                className="flex items-center gap-2 text-[14px] font-bold text-[#4E5968] hover:text-[#191F28] px-2 sm:px-3 py-2 rounded-2xl hover:bg-[#F9FAFB] transition-all"
                            >
                                <span className="w-6 h-6 rounded-full bg-blue-50 text-[#3182F6] flex items-center justify-center text-[11px] font-black flex-shrink-0">
                                    {currentUser.churchName.slice(0, 1)}
                                </span>
                                <span className="hidden sm:inline">{currentUser.churchName}</span>
                            </button>
                        ) : (
                            <button
                                onClick={() => { setLoginReturnTo('/website'); navigate('/login'); }}
                                className="text-[13px] sm:text-[14px] font-bold text-[#4E5968] hover:text-[#191F28] px-2 sm:px-4 py-2.5 transition-colors"
                            >
                                로그인
                            </button>
                        )}
                        <div className="hidden sm:block w-[1px] h-4 bg-[#E5E8EB]" />
                        {currentUser ? (
                            <button
                                onClick={() => navigate('/website-builder')}
                                className="bg-[#191F28] hover:bg-black text-white text-[13px] sm:text-[14px] font-bold px-3 sm:px-5 py-2 sm:py-3 rounded-full shadow-[0_8px_16px_rgba(0,0,0,0.15)] transition-all active:scale-95 flex items-center gap-1 sm:gap-1.5 whitespace-nowrap"
                            >
                                사이트 관리자 <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            </button>
                        ) : (
                            <button
                                onClick={() => navigate('/website-builder')}
                                className="bg-[#3182F6] hover:bg-[#1B64DA] text-white text-[13px] sm:text-[14px] font-bold px-3 sm:px-5 py-2 sm:py-3 rounded-full shadow-[0_8px_16px_rgba(49,130,246,0.2)] transition-all active:scale-95 flex items-center gap-1 sm:gap-1.5 whitespace-nowrap"
                            >
                                무료로 시작하기 <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            </button>
                        )}
                    </div>
                </div>
            </header>

            {/* 모바일 전용 퀵 네비게이션 — PC 메뉴(nav, hidden md:flex)가 모바일에선 아예 안 보여서
                섹션 이동 수단이 없었음. 같은 앵커 목록을 가로 스크롤 칩으로 노출 */}
            <nav className="md:hidden sticky top-14 z-40 bg-white/95 backdrop-blur-xl border-b border-gray-100 overflow-x-auto no-scrollbar">
                <div className="flex gap-2 px-4 py-2.5 w-max">
                    {navItems.map((item) => (
                        <a
                            key={item.id}
                            href={`#${item.id}`}
                            onClick={scrollToSection(item.id)}
                            className="shrink-0 px-3.5 py-2 rounded-full text-[13px] font-bold text-[#4E5968] bg-[#F9FAFB] border border-gray-100 whitespace-nowrap active:scale-95 active:bg-blue-50 active:text-[#3182F6] transition-all"
                        >
                            {item.label}
                        </a>
                    ))}
                </div>
            </nav>

            {/* 히어로 섹션 - 스테이온 플랫폼 통일감 적용 (상단 알림 배너 + 카드형 레이아웃) */}
            <section className="px-4 sm:px-6 pt-6 sm:pt-8 pb-10 sm:pb-16 md:pt-14 md:pb-24">
                <div className="max-w-6xl mx-auto">

                    {/* 상단 프로모션 인포 배너 (스마트 주보/수련회 플랫폼 레이아웃 계승) */}
                    <div className="bg-white rounded-2xl sm:rounded-3xl p-4 md:p-5 border border-gray-100 shadow-sm mb-6 sm:mb-8 flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-3.5">
                            <div className="w-10 h-10 rounded-2xl bg-blue-50 text-[#3182F6] flex items-center justify-center font-bold flex-shrink-0">
                                <Sparkles className="w-5 h-5" />
                            </div>
                            <div>
                                <div className="text-xs font-bold text-[#3182F6] mb-0.5">STAYON CHURCH WEB PLATFORM</div>
                                <div className="text-sm md:text-base font-extrabold text-gray-900 break-keep">견적서 비교 없이, 빈칸 3개만 채우면 완성되는 우리 교회 공식 홈페이지</div>
                            </div>
                        </div>
                        <button
                            onClick={() => navigate('/website-create')}
                            className="w-full sm:w-auto bg-gray-50 hover:bg-gray-100 text-gray-900 text-xs font-bold px-5 py-3 rounded-xl border border-gray-200/60 transition-all flex items-center justify-center gap-1.5 flex-shrink-0"
                        >
                            <span>지금 시작하기</span>
                            <ArrowRight className="w-3.5 h-3.5 text-gray-500" />
                        </button>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 sm:gap-12 items-center">

                        <div className="lg:col-span-7 space-y-6 sm:space-y-8">
                            <div className="space-y-3 sm:space-y-4">
                                <div className="inline-flex items-center gap-1.5 bg-blue-50 text-[#3182F6] text-xs font-extrabold px-3.5 py-1.5 rounded-full break-keep">
                                    주보·수련회에 이은 세 번째 스테이온 서비스
                                </div>
                                <h1 className="text-[26px] sm:text-5xl md:text-[52px] font-black tracking-tight text-[#191F28] leading-[1.25] sm:leading-[1.2] break-keep">
                                    수백만 원짜리 교회 홈페이지,<br />
                                    <span className="text-[#3182F6]">이제 커피값이면 됩니다</span>
                                </h1>
                                <p className="text-sm sm:text-lg md:text-xl text-gray-500 font-medium leading-relaxed break-keep">
                                    복잡한 외주 미팅과 유지보수 스트레스 없이, 빈칸만 채우면 우리 교회만의 품격 있는 사이트가 화면에 바로 나타납니다.
                                </p>
                            </div>

                            <div className="grid grid-cols-3 gap-2 sm:gap-3 pt-2">
                                <div className="bg-white p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-gray-100 shadow-2xs">
                                    <div className="text-[10px] sm:text-xs text-gray-400 font-bold mb-1">초기 비용</div>
                                    <div className="text-sm sm:text-base font-black text-[#17325C]">0원</div>
                                </div>
                                <div className="bg-white p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-gray-100 shadow-2xs">
                                    <div className="text-[10px] sm:text-xs text-gray-400 font-bold mb-1">제작 소요시간</div>
                                    <div className="text-sm sm:text-base font-black text-[#17325C]">단 5분</div>
                                </div>
                                <div className="bg-white p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-gray-100 shadow-2xs">
                                    <div className="text-[10px] sm:text-xs text-gray-400 font-bold mb-1">월 이용요금</div>
                                    <div className="text-sm sm:text-base font-black text-[#3182F6]">9,900원</div>
                                </div>
                            </div>

                            <div className="space-y-3 pt-2 hidden md:block">
                                <button
                                    onClick={() => navigate('/website-create')}
                                    className="w-full sm:w-auto px-8 py-4 bg-[#3182F6] hover:bg-[#1B64DA] text-white text-base font-bold rounded-2xl shadow-lg shadow-blue-500/20 transition-all active:scale-98 flex items-center justify-center gap-3"
                                >
                                    <span>교회 홈페이지 무료로 만들기</span>
                                    <ArrowRight className="w-5 h-5" />
                                </button>
                                <div className="text-xs text-gray-400 font-medium pl-1">
                                    ✨ 첫 1개월 무료 체험 · 당회 및 재정부 보고서용 투명한 비용 · 언제든 해지 가능
                                </div>
                            </div>
                        </div>

                        <div className="lg:col-span-5 relative">
                            <div className="absolute -inset-4 bg-gradient-to-tr from-blue-100/60 to-indigo-50/30 rounded-[2.5rem] blur-2xl -z-10" />

                            <div className="bg-white rounded-[2.5rem] border border-gray-100 p-6 shadow-2xl">
                                <div className="flex items-center justify-between pb-4 mb-4 border-b border-gray-100">
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-3 h-3 rounded-full bg-red-400/80" />
                                        <span className="w-3 h-3 rounded-full bg-amber-400/80" />
                                        <span className="w-3 h-3 rounded-full bg-emerald-400/80" />
                                    </div>
                                    <div className="bg-gray-50 px-3 py-1 rounded-lg text-[11px] text-gray-400 font-mono flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                        gracedum.stayon.kr
                                    </div>
                                    <div className="w-4" />
                                </div>

                                <div className="bg-gray-50 rounded-2xl p-4 mb-4 flex items-center justify-between">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-8 h-8 rounded-xl bg-[#17325C] text-white flex items-center justify-center font-bold text-xs">은</div>
                                        <div>
                                            <div className="font-extrabold text-xs text-gray-900">은혜로운교회</div>
                                            <div className="text-[10px] text-gray-400">대한예수교장로회</div>
                                        </div>
                                    </div>
                                    <div className="text-[11px] font-bold text-[#3182F6]">메뉴보기</div>
                                </div>

                                <div className="bg-[#17325C] rounded-2xl p-5 mb-4 text-white relative overflow-hidden shadow-md">
                                    <div className="absolute right-2 -bottom-2 opacity-10 text-7xl font-black">⛪</div>
                                    <div className="text-[11px] font-bold text-blue-200 mb-1">주일 대예배 안내</div>
                                    <div className="text-base font-black leading-snug mb-2">"온 마음으로 섬기고 사랑하는 공동체"</div>
                                    <div className="text-[11px] text-blue-100/80">2026년 8월 첫째 주일 예배 안내 및 주보 보기</div>
                                </div>

                                <div className="space-y-2.5">
                                    {mockupRows.map((row) => (
                                        <div key={row.title} className="bg-gray-50/80 hover:bg-gray-100/80 transition-colors rounded-2xl p-3.5 flex items-center gap-3 border border-gray-100/60">
                                            <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center text-[#17325C] shadow-2xs flex-shrink-0">
                                                <row.icon className="w-4 h-4" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-xs font-bold text-gray-900 truncate">{row.title}</div>
                                                <div className="text-[11px] text-gray-500 truncate">{row.sub}</div>
                                            </div>
                                            <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                        </div>
                                    ))}
                                </div>

                                <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-center gap-1.5 text-[11px] font-bold text-gray-400">
                                    <Smartphone className="w-3.5 h-3.5" /> 실제 완성되는 화면 미리보기
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* 만드는 방법 (HOW IT WORKS) - 실제 순서가 있는 프로세스이므로 번호 사용 */}
            <section id="process" className="py-12 sm:py-20 bg-white border-y border-gray-100 px-4 sm:px-6">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center max-w-2xl mx-auto mb-8 sm:mb-16">
                        <span className="text-xs font-extrabold text-[#3182F6] bg-blue-50 px-3.5 py-1.5 rounded-full inline-block mb-3">HOW IT WORKS</span>
                        <h2 className="text-xl sm:text-2xl md:text-4xl font-black text-[#191F28] tracking-tight break-keep">
                            디자인 몰라도 괜찮아요,<br />3단계면 우리 교회 홈페이지 완성
                        </h2>
                        <p className="text-gray-500 mt-3 text-sm md:text-base break-keep">코딩도, 디자인 툴도 필요 없습니다. 순서대로 따라오시면 됩니다.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 relative">
                        {processSteps.map((proc) => (
                            <div key={proc.num} className="bg-[#F8F9FA] p-6 sm:p-8 rounded-[1.5rem] sm:rounded-[2rem] border border-gray-100 relative">
                                <div className="flex items-center justify-between mb-6">
                                    <div className="w-12 h-12 rounded-2xl bg-white text-[#3182F6] flex items-center justify-center shadow-2xs border border-gray-100">
                                        <proc.icon className="w-5 h-5" />
                                    </div>
                                    <span className="text-3xl font-black text-gray-200">{proc.num}</span>
                                </div>
                                <h3 className="text-lg font-extrabold text-gray-900 mb-2.5">{proc.title}</h3>
                                <p className="text-gray-500 text-sm leading-relaxed break-keep">{proc.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* 스테이온과 함께 하고 있는 교회 — 실제 배포된 사이트로 가는 진짜 링크(<a href>)를 걸어서
                검색엔진이 이 페이지를 크롤링할 때 그 교회 사이트들을 같이 발견할 수 있게 함.
                배포된 사이트가 아직 하나도 없으면 섹션 자체를 숨김 */}
            {partnerSites.length > 0 && (
                <section className="py-12 sm:py-20 bg-white border-y border-gray-100 px-4 sm:px-6">
                    <div className="max-w-6xl mx-auto">
                        <div className="text-center mb-8 sm:mb-12">
                            <p className="text-xs font-bold tracking-[0.25em] text-[#3182F6] mb-3">PARTNER CHURCHES</p>
                            <h2 className="text-xl sm:text-2xl md:text-4xl font-black text-gray-900 break-keep">
                                스테이온과 함께 하고 있는 교회
                            </h2>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                            {partnerSites.map((site) => (
                                <a
                                    key={site.slug}
                                    href={`https://${site.slug}.stayon-platform.com`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block bg-gray-50 hover:bg-gray-100 border border-gray-100 rounded-xl sm:rounded-2xl p-4 sm:p-6 text-center transition-colors"
                                >
                                    <p className="font-bold text-gray-900 break-keep">{site.churchName}</p>
                                </a>
                            ))}
                        </div>
                    </div>
                </section>
            )}

            {/* 서비스 특징 섹션 (FEATURES) */}
            <section id="features" className="py-12 sm:py-20 px-4 sm:px-6 max-w-6xl mx-auto">
                <div className="text-center max-w-2xl mx-auto mb-8 sm:mb-16">
                    <span className="text-xs font-extrabold text-[#3182F6] bg-blue-50 px-3.5 py-1.5 rounded-full inline-block mb-3">SERVICE FEATURES</span>
                    <h2 className="text-xl sm:text-2xl md:text-4xl font-black text-[#191F28] tracking-tight break-keep">
                        교회 홈페이지에 꼭 필요한<br />핵심 기능만 담았습니다
                    </h2>
                    <p className="text-gray-500 mt-3 text-sm md:text-base break-keep">어르신부터 새가족까지 누구나 한눈에 알아볼 수 있는 직관적인 구성</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-8">
                    {featureCards.map((feat) => (
                        <div key={feat.step} className="bg-white p-6 sm:p-8 rounded-[1.5rem] sm:rounded-[2rem] border border-gray-100 shadow-2xs flex flex-col justify-between hover:shadow-md transition-shadow">
                            <div>
                                <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#3182F6] flex items-center justify-center mb-6">
                                    <feat.icon className="w-5 h-5" />
                                </div>
                                <h3 className="text-lg font-extrabold text-gray-900 mb-2.5">{feat.title}</h3>
                                <p className="text-gray-500 text-sm leading-relaxed break-keep">{feat.desc}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* 왜 필요한가? (WHY SECTION) */}
            <section id="why" className="py-12 sm:py-20 bg-white border-y border-gray-100 px-4 sm:px-6">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center max-w-2xl mx-auto mb-8 sm:mb-16">
                        <span className="text-xs font-extrabold text-[#3182F6] bg-blue-50 px-3.5 py-1.5 rounded-full inline-block mb-3">WHY STAYON</span>
                        <h2 className="text-xl sm:text-2xl md:text-4xl font-black text-[#191F28] tracking-tight break-keep">
                            우리 교회에 공식 홈페이지가<br />반드시 필요한 이유
                        </h2>
                        <p className="text-gray-500 mt-3 text-sm md:text-base break-keep">온라인상의 첫인상이 곧 교회의 신뢰도와 전도로 이어집니다.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
                        {whyCards.map((card) => (
                            <div key={card.title} className="bg-[#F8F9FA] p-6 sm:p-8 rounded-[1.5rem] sm:rounded-[2rem] border border-gray-100">
                                <div className="w-12 h-12 bg-white shadow-2xs rounded-2xl flex items-center justify-center text-[#3182F6] mb-6">
                                    <card.icon className="w-6 h-6" />
                                </div>
                                <h3 className="text-base font-extrabold mb-2.5 text-gray-900">{card.title}</h3>
                                <p className="text-gray-500 text-sm leading-relaxed break-keep">{card.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* 기존 방식 비교 섹션 (COMPARISON) */}
            <section id="comparison" className="py-12 sm:py-24 bg-white border-y border-gray-100 px-4 sm:px-6">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center max-w-2xl mx-auto mb-8 sm:mb-16">
                        <span className="text-xs font-extrabold text-[#3182F6] bg-blue-50 px-3.5 py-1.5 rounded-full inline-block mb-3">COMPARISON</span>
                        <h2 className="text-xl sm:text-2xl md:text-4xl font-black text-[#191F28] tracking-tight break-keep">
                            외주 제작 vs 스테이온 교회 플랫폼
                        </h2>
                        <p className="text-gray-500 mt-3 text-sm md:text-base break-keep">비용은 확 낮추고, 관리의 편리함은 극대화했습니다.</p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 max-w-5xl mx-auto items-stretch">

                        {/* 좌측: 기존 방식 카드 (소프트 그레이 스타일 & 토스 감성 마감) */}
                        <div className="lg:col-span-6 bg-[#F8F9FA] rounded-[1.75rem] sm:rounded-[2.5rem] border border-gray-100 p-6 md:p-10 flex flex-col justify-between transition-all hover:bg-[#F2F4F6]">
                            <div>
                                <div className="inline-flex items-center gap-1.5 bg-gray-200/60 text-gray-600 font-bold text-xs px-3.5 py-1.5 rounded-full mb-4 sm:mb-6">
                                    <XCircle className="w-4 h-4 text-gray-400" /> 기존 웹에이전시 외주 제작
                                </div>
                                <h3 className="text-lg sm:text-xl md:text-2xl font-black text-gray-900 mb-3 tracking-tight break-keep">
                                    비싸고 수정이 번거로운<br />구식 에이전시 방식
                                </h3>
                                <p className="text-gray-500 text-sm md:text-base leading-relaxed mb-6 sm:mb-8 break-keep">
                                    제작업체와 미팅하고 수백만 원을 지불해야 하며, 예배 시간 하나를 바꿀 때마다 추가 비용과 불필요한 연락 지연이 발생합니다.
                                </p>
                            </div>

                            <div className="space-y-4 border-t border-gray-200/60 pt-6">
                                <div className="flex items-center gap-3 text-sm font-semibold text-gray-500">
                                    <div className="w-6 h-6 rounded-full bg-gray-200/70 text-gray-400 flex items-center justify-center flex-shrink-0 text-xs font-bold">✕</div>
                                    <span>초기 제작비 최소 300만 ~ 500만 원 이상</span>
                                </div>
                                <div className="flex items-center gap-3 text-sm font-semibold text-gray-500">
                                    <div className="w-6 h-6 rounded-full bg-gray-200/70 text-gray-400 flex items-center justify-center flex-shrink-0 text-xs font-bold">✕</div>
                                    <span>매달 부담되는 비싼 서버 유지비</span>
                                </div>
                                <div className="flex items-center gap-3 text-sm font-semibold text-gray-500">
                                    <div className="w-6 h-6 rounded-full bg-gray-200/70 text-gray-400 flex items-center justify-center flex-shrink-0 text-xs font-bold">✕</div>
                                    <span>텍스트 하나 수정에도 업체 연락 지연</span>
                                </div>
                            </div>
                        </div>

                        {/* 우측: 스테이온 솔루션 카드 (첫 번째 섹션과 동일한 딥 네이비 #191F28 + 블루 포인트 스타일) */}
                        <div className="lg:col-span-6 bg-[#191F28] text-white rounded-[1.75rem] sm:rounded-[2.5rem] p-6 md:p-10 flex flex-col justify-between relative overflow-hidden shadow-xl shadow-slate-200">
                            <div className="absolute top-0 right-0 w-48 h-48 bg-blue-500/20 rounded-bl-full blur-xl pointer-events-none"></div>

                            <div>
                                <div className="inline-flex items-center gap-1.5 bg-blue-500/20 text-blue-400 font-bold text-xs px-3.5 py-1.5 rounded-full mb-4 sm:mb-6 border border-blue-500/30">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-400" /> 스테이온 교회 플랫폼
                                </div>
                                <h3 className="text-lg sm:text-xl md:text-2xl font-black text-white mb-3 tracking-tight break-keep">
                                    누구나 직접 고치고 관리하는<br />스마트 홈 솔루션
                                </h3>
                                <p className="text-slate-400 text-sm md:text-base leading-relaxed mb-6 sm:mb-8 break-keep">
                                    스마트폰이나 PC에서 빈칸만 채우면 PC와 모바일 반응형 사이트가 즉시 완성됩니다. 서버비와 도메인 비용이 모두 포함되어 있습니다.
                                </p>
                            </div>

                            <div className="space-y-3 sm:space-y-4 border-t border-white/10 pt-5 sm:pt-6 relative z-10">
                                <div className="flex items-center gap-3 text-sm font-semibold text-white">
                                    <div className="w-6 h-6 rounded-full bg-emerald-400/20 text-emerald-400 flex items-center justify-center flex-shrink-0 text-xs font-bold">✓</div>
                                    <span>초기 제작비 0원 <span className="text-slate-400 text-xs font-normal">(첫 1개월 무료 체험)</span></span>
                                </div>
                                <div className="flex items-center gap-3 text-sm font-semibold text-white">
                                    <div className="w-6 h-6 rounded-full bg-emerald-400/20 text-emerald-400 flex items-center justify-center flex-shrink-0 text-xs font-bold">✓</div>
                                    <span>도메인 및 SSL 보안서버 비용 완전 포함</span>
                                </div>
                                <div className="flex items-center gap-3 text-sm font-semibold text-white">
                                    <div className="w-6 h-6 rounded-full bg-emerald-400/20 text-emerald-400 flex items-center justify-center flex-shrink-0 text-xs font-bold">✓</div>
                                    <span>월 9,900원의 투명하고 합리적인 비용</span>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </section>

            {/* 요금 안내 섹션 (PRICING) - 토스 스타일 배너 카드 조합으로 직관성 극대화 */}
            <section id="pricing" className="py-12 sm:py-24 bg-white border-y border-gray-100 px-4 sm:px-6">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center max-w-2xl mx-auto mb-8 sm:mb-16">
                        <span className="text-xs font-extrabold text-[#3182F6] bg-blue-50 px-3.5 py-1.5 rounded-full inline-block mb-3">PRICING PLAN</span>
                        <h2 className="text-xl sm:text-2xl md:text-4xl font-black text-[#191F28] tracking-tight break-keep">
                            합리적이고 투명한 요금 안내
                        </h2>
                        <p className="text-gray-500 mt-3 text-sm md:text-base break-keep">숨겨진 추가 비용이 전혀 없습니다. 교회 재정에 맞게 선택하세요.</p>

                        <div className="inline-flex items-center bg-gray-100 p-1.5 rounded-full mt-6 sm:mt-8">
                            <button
                                onClick={() => setBillingType('monthly')}
                                className={`relative z-10 px-4 sm:px-7 py-2.5 sm:py-3 rounded-full text-[13px] sm:text-sm font-bold transition-colors whitespace-nowrap ${billingType === 'monthly' ? 'text-gray-900' : 'text-gray-500 hover:text-gray-900'
                                    }`}
                            >
                                {billingType === 'monthly' && (
                                    <motion.span
                                        layoutId="billingPill"
                                        className="absolute inset-0 -z-10 bg-white rounded-full shadow-sm"
                                        transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                                    />
                                )}
                                월간 결제
                            </button>
                            <button
                                onClick={() => setBillingType('quarterly')}
                                className={`relative z-10 px-4 sm:px-7 py-2.5 sm:py-3 rounded-full text-[13px] sm:text-sm font-bold transition-colors flex items-center gap-1.5 sm:gap-2 whitespace-nowrap ${billingType === 'quarterly' ? 'text-gray-900' : 'text-gray-500 hover:text-gray-900'
                                    }`}
                            >
                                {billingType === 'quarterly' && (
                                    <motion.span
                                        layoutId="billingPill"
                                        className="absolute inset-0 -z-10 bg-white rounded-full shadow-sm"
                                        transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                                    />
                                )}
                                <span>3개월 결제</span>
                                <span className="text-[10px] sm:text-[11px] px-2 sm:px-2.5 py-0.5 rounded-full font-black bg-[#3182F6] text-white whitespace-nowrap">
                                    45% 할인
                                </span>
                            </button>
                        </div>
                    </div>

                    {/* 토스 레퍼런스 스타일의 강조형 와이드 프로모션 배너 카드 컨테이너 */}
                    <div className="max-w-5xl mx-auto bg-[#F8F9FA] rounded-[1.75rem] sm:rounded-[2.5rem] border border-gray-100 overflow-hidden mb-6 sm:mb-8">
                        <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">

                            {/* 좌측: 혜택 안내 설명 영역 */}
                            <div className="lg:col-span-7 p-6 md:p-12 flex flex-col justify-between">
                                <div>
                                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 text-[#3182F6] text-xs font-bold mb-4 sm:mb-6">
                                        <Tag className="w-3.5 h-3.5 shrink-0" /> <span className="break-keep">정식 출시 전, 최저가 교회 홈 오픈 혜택</span>
                                    </div>
                                    <h3 className="text-xl sm:text-2xl md:text-3xl font-black text-[#191F28] tracking-tight mb-3 sm:mb-4 break-keep">
                                        초기 구축 비용 0원,<br />
                                        가장 스마트한 교회 홈페이지
                                    </h3>
                                    <p className="text-gray-500 text-sm md:text-base leading-relaxed mb-5 sm:mb-6 break-keep">
                                        현재 서비스 안정화를 위한 특별 베네핏이 적용 중입니다. 부담 없는 가격으로 우리 교회만의 품격 있는 공식 사이트를 오픈해보세요.
                                    </p>

                                    <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-gray-100 flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#3182F6] flex items-center justify-center flex-shrink-0">
                                            <Sparkles className="w-4 h-4" />
                                        </div>
                                        <div className="text-xs md:text-sm font-bold text-[#17325C] break-keep">첫 1개월 무료 체험 기간을 제공해 드립니다.</div>
                                    </div>
                                </div>

                                <div className="pt-5 sm:pt-6">
                                    <a href="#faq" onClick={scrollToSection('faq')} className="text-xs font-bold text-gray-400 hover:text-gray-600 transition-colors inline-flex items-center gap-1">
                                        요금제 상세 약관 및 환불 규정 확인하기 <ChevronRight className="w-3.5 h-3.5" />
                                    </a>
                                </div>
                            </div>

                            {/* 우측: 다크 프리미엄 프라이싱 카드 영역 (토스 핀테크 스타일, 비교 섹션과 동일한 시그니처 네이비 #191F28) */}
                            <div className="lg:col-span-5 bg-[#191F28] text-white p-6 md:p-12 flex flex-col justify-between relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-40 h-40 bg-blue-500/20 rounded-bl-full pointer-events-none blur-xl"></div>

                                <div>
                                    <div className="flex items-center justify-between mb-4 gap-2">
                                        <span className="text-xs font-bold text-blue-200 uppercase tracking-wider">Church Standard Plan</span>
                                        <span className="text-[10px] bg-amber-400 text-gray-900 font-black px-2.5 py-1 rounded-full shrink-0 whitespace-nowrap">
                                            인기 추천
                                        </span>
                                    </div>

                                    <div className="relative space-y-1 mb-5 sm:mb-6 overflow-hidden">
                                        <AnimatePresence mode="wait" initial={false}>
                                            <motion.div
                                                key={billingType}
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -10 }}
                                                transition={{ duration: 0.2, ease: 'easeOut' }}
                                            >
                                                <div className="text-xs text-gray-400 line-through font-semibold">
                                                    {billingType === 'monthly' ? '월 14,900원' : '3개월 44,700원'}
                                                </div>
                                                <div className="flex items-baseline gap-1.5 flex-wrap">
                                                    <span className="text-4xl sm:text-5xl font-black tracking-tight text-white">
                                                        {billingType === 'monthly' ? '9,900' : '27,900'}
                                                    </span>
                                                    <span className="text-blue-200 text-xs sm:text-sm font-medium whitespace-nowrap">
                                                        {billingType === 'monthly' ? '원 / 월' : '원 / 년 (12개월)'}
                                                    </span>
                                                </div>
                                            </motion.div>
                                        </AnimatePresence>
                                    </div>

                                    <div className="w-full h-px bg-white/10 mb-5 sm:mb-6"></div>

                                    <ul className="space-y-3 text-xs md:text-sm text-white font-medium mb-6 sm:mb-8">
                                        <li className="flex items-center gap-2.5"><CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" /> 교회 공식 홈페이지 정식 운영</li>
                                        <li className="flex items-center gap-2.5"><CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" /> 도메인 연결 기본 지원</li>
                                        <li className="flex items-center gap-3"><CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" /> 네이버/구글 SEO 검색 최적화</li>
                                    </ul>
                                </div>

                                <div>
                                    <button
                                        onClick={() => navigate('/website-offer', { viewTransition: true })}
                                        className="w-full bg-[#3182F6] hover:bg-[#1B64DA] text-white font-bold py-4 rounded-2xl transition-all shadow-lg text-sm flex items-center justify-center gap-2 active:scale-98"
                                    >
                                        <span>홈페이지 상품 선택하기</span>
                                        <ArrowRight className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 서브 플랜 카드 (운영 관리 대행 옵션) */}
                    <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                        <div className="relative bg-white p-6 sm:p-8 rounded-[1.5rem] sm:rounded-[2rem] border border-gray-100 shadow-2xs flex flex-col justify-between opacity-60 pointer-events-none cursor-not-allowed select-none">
                            <div>
                                <div className="flex items-center justify-between mb-3 gap-2">
                                    <h3 className="text-sm font-extrabold text-gray-400 flex items-center gap-1.5 break-keep">
                                        <Lock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                        운영 관리 대행 서비스 (선택 옵션)
                                    </h3>
                                    <span className="text-xs bg-gray-100 text-gray-500 font-bold px-2.5 py-1 rounded-full shrink-0 whitespace-nowrap">준비중</span>
                                </div>
                                <p className="text-gray-400 text-xs md:text-sm leading-relaxed mb-4 break-keep">
                                    컴퓨터나 홈페이지 관리가 부담스러우신 목회자님이나 교역자분들을 위해 스테이온 전담 팀이 직접 수정 및 업데이트를 대행해 드립니다.
                                </p>
                            </div>
                            <div className="text-xs text-gray-400 font-medium break-keep">
                                🔒 준비 중인 서비스입니다. 출시되면 바로 알려드릴게요.
                            </div>
                        </div>

                        <div className="bg-white p-6 sm:p-8 rounded-[1.5rem] sm:rounded-[2rem] border border-gray-100 shadow-2xs flex flex-col justify-between">
                            <div>
                                <div className="flex items-center justify-between mb-3 gap-2">
                                    <h3 className="text-sm font-extrabold text-[#17325C] break-keep">독립 도메인 및 SSL 보안서버</h3>
                                    <span className="text-xs bg-emerald-50 text-emerald-600 font-bold px-2.5 py-1 rounded-full shrink-0 whitespace-nowrap">기본 포함무상</span>
                                </div>
                                <p className="text-gray-500 text-xs md:text-sm leading-relaxed mb-4 break-keep">
                                    보안에 민감한 교회 사이트를 위해 안전한 HTTPS SSL 인증서와 고유 도메인 연결을 추가 비용 없이 기본으로 세팅해 드립니다.
                                </p>
                            </div>
                            <div className="text-xs text-emerald-600 font-medium break-keep">
                                ✨ 별도의 서버 유지비나 구축 외주비가 일체 없습니다.
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* 자주 묻는 질문 (FAQ) */}
            <section id="faq" className="py-12 sm:py-20 px-4 sm:px-6">
                <div className="max-w-3xl mx-auto">
                    <div className="text-center mb-8 sm:mb-16">
                        <span className="text-xs font-extrabold text-[#3182F6] bg-blue-50 px-3.5 py-1.5 rounded-full inline-block mb-3">FAQ</span>
                        <h2 className="text-xl sm:text-2xl md:text-4xl font-black text-[#191F28] tracking-tight">자주 묻는 질문</h2>
                    </div>

                    <div className="space-y-2.5 sm:space-y-3">
                        {[
                            { q: '정말 초기 제작비나 외주 비용이 전혀 없나요?', a: '네, 별도의 외주 개발 비용이나 초기 세팅비가 전혀 없습니다. 스탠다드 플랜 첫 1개월은 무료로 충분히 체험해 보실 수 있습니다.' },
                            { q: '컴퓨터를 잘 다루지 못하는 교역자나 성도도 만들 수 있나요?', a: '물론입니다! 스마트폰이나 PC에서 안내에 따라 빈칸에 교회 이름과 예배 시간, 주소를 입력하기만 하면 누구나 5분 만에 정돈된 사이트가 완성됩니다.' },
                            { q: '교회 고유의 도메인(주소)을 연결할 수 있나요?', a: '네, 스테이온 기본 주소 제공은 물론, 교회에서 이미 보유하고 계신 독립 도메인 연결도 무상으로 지원해 드립니다.' },
                            { q: '교회 재정 결제 및 환불 규정은 어떻게 되나요?', a: '교회 통장 자동이체 및 카드 결제 모두 지원하며, 이용 중 해지 시 언제든지 남은 일수 기준으로 투명하게 정산해 드립니다.' }
                        ].map((faq, idx) => (
                            <div key={idx} className="bg-white border border-gray-100 rounded-2xl overflow-hidden transition-all shadow-2xs">
                                <button
                                    onClick={() => toggleFaq(idx)}
                                    className="w-full p-4 sm:p-5 text-left font-extrabold text-sm md:text-base flex justify-between items-center gap-3 hover:bg-gray-50/60 text-gray-900"
                                >
                                    <span className="break-keep">{faq.q}</span>
                                    {openFaq === idx ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
                                </button>
                                {openFaq === idx && (
                                    <div className="p-4 sm:p-5 pt-0 text-gray-500 text-xs md:text-sm leading-relaxed break-keep">
                                        {faq.a}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* 하단 최종 CTA 섹션 */}
            <section className="bg-[#17325C] text-white py-12 sm:py-20 px-4 sm:px-6 text-center">
                <div className="max-w-3xl mx-auto space-y-4 sm:space-y-6">
                    <h2 className="text-xl sm:text-2xl md:text-4xl font-black break-keep">우리 교회 공식 홈페이지, 지금 바로 시작하세요</h2>
                    <p className="text-blue-200 text-sm md:text-base font-normal break-keep">첫 1개월 무료 체험 · 설치비 0원 · 보수적이고 안정적인 플랫폼</p>
                    <div>
                        <button
                            onClick={() => navigate('/website-create')}
                            className="bg-[#3182F6] hover:bg-[#1B64DA] text-white font-bold px-8 py-4 rounded-2xl shadow-xl transition-all text-sm md:text-base active:scale-95 inline-flex items-center gap-2"
                        >
                            <span>🚀 무료로 교회 홈페이지 만들기</span>
                        </button>
                    </div>
                </div>
            </section>

            {/* 모바일 고정 하단 CTA바 (토스 앱 스타일) */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-xl border-t border-gray-100 p-4">
                <button
                    onClick={() => navigate('/website-create')}
                    className="w-full px-6 py-4 bg-[#3182F6] active:bg-[#1B64DA] text-white text-base font-bold rounded-2xl shadow-lg shadow-blue-500/20 transition-all active:scale-98 flex items-center justify-center gap-2"
                >
                    <span>교회 홈페이지 무료로 만들기</span>
                    <ArrowRight className="w-5 h-5" />
                </button>
            </div>

            {/* 모바일 퀵 네비게이션 가로 스크롤바 숨기기 */}
            <style dangerouslySetInnerHTML={{
                __html: `
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}} />

        </div>
    );
}
