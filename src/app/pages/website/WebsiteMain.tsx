import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import {
    Sparkles, CheckCircle2, ArrowRight, ShieldCheck, ChevronDown, ChevronUp, ChevronRight,
    XCircle, Check, MapPin, Users, Zap, UserPlus, Search, Clock, Building2, BookOpen, HeartHandshake, PhoneCall, HelpCircle, Tag,
    FileEdit, Wand2, Rocket, Smartphone, Globe2, LayoutTemplate, Lock, LogOut, ChevronLeft, MessageCircle, Camera
} from 'lucide-react';
import { auth, db } from '../../../firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { QuickMenu } from '../../components/QuickMenu';
import { doc, getDoc } from 'firebase/firestore';
import { setLoginReturnTo } from '../../../utils/loginReturn';
import { WEBSITE_PATHS, bulletinUrlWithLogin, prefetchLoginToken, isWebsiteHost, readWebsiteHostName, saveWebsiteHostName, isHandoffPending, whenHandoffDone } from '../../../utils/websiteHost';
import { getPublishedChurchSites, ChurchSite } from '../../../utils/churchSite';
import { resolveDenomination, denominationLogoSrc, denominationDisplayName } from '../../../utils/denominations';
import { MANAGED_PLANS } from '../../../utils/pricingMatrix'; // 관리형 라이트·맥스 가격·환급(/pricing과 같은 값)

// ── 요금 안내 > 오픈 이벤트 배너 왼쪽: 슬라이드(2026-11-12) ─────────────────────────
// 1장은 기존 오픈 이벤트 문구, 2~5장은 관리형(스테이온이 대신 관리) 소개 카드뉴스를 짧게 정리.
// 6초마다 자동으로 넘어가고(마우스 올리면 멈춤), 점·화살표·휴대폰 밀기로 넘김.
// 모든 장을 같은 칸에 겹쳐 두어 칸 높이 = 가장 긴 장 → 넘길 때 아래 화면이 들썩이지 않음
const SLIDE_EASE = 'cubic-bezier(0.2, 0, 0, 1)';
const SlideChip = ({ children, dark }: { children: React.ReactNode; dark?: boolean }) => (
    <div className={`inline-flex w-fit items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold mb-4 sm:mb-6 ${dark ? 'bg-[#191F28] text-white' : 'bg-blue-50 text-[#3182F6]'}`}>
        {children}
    </div>
);
const SlideCheck = ({ children }: { children: React.ReactNode }) => (
    <li className="flex items-center gap-2.5 text-sm md:text-base font-bold text-[#191F28]">
        <span className="w-5 h-5 rounded-full bg-[#3182F6] text-white flex items-center justify-center shrink-0"><Check className="w-3 h-3" strokeWidth={3.5} /></span>
        <span className="break-keep">{children}</span>
    </li>
);
const OPEN_EVENT_SLIDES: React.ReactNode[] = [
    // 1. 기존 오픈 이벤트 문구 그대로
    <>
        <SlideChip><Tag className="w-3.5 h-3.5 shrink-0" /> <span className="break-keep">정식 오픈 이벤트</span></SlideChip>
        <h3 className="text-xl sm:text-2xl md:text-3xl font-black text-[#191F28] tracking-tight mb-3 sm:mb-4 break-keep">
            오픈 이벤트 기간,<br />
            <span className="text-[#3182F6]">모든 기능 무료</span>로 이용하세요
        </h3>
        <p className="text-gray-500 text-sm md:text-base leading-relaxed break-keep">
            구축비·월 이용료 없이 우리 교회 공식 홈페이지를 바로 열 수 있어요. 이벤트가 끝나기 전에 미리 알려 드리고, 그 전까지는 요금이 청구되지 않습니다.
        </p>
    </>,
    // 2. 관리가 더 어렵다
    <>
        <SlideChip dark>관리형 교회 홈페이지</SlideChip>
        <h3 className="text-xl sm:text-2xl md:text-3xl font-black text-[#191F28] tracking-tight mb-3 sm:mb-4 break-keep">
            홈페이지, 만드는 것보다<br />
            <span className="text-[#3182F6]">관리</span>가 더 어렵습니다.
        </h3>
        <p className="text-gray-500 text-sm md:text-base leading-relaxed break-keep mb-4">스테이온이 매주 대신 챙겨 드릴게요.</p>
        <ul className="flex flex-wrap gap-x-5 gap-y-2.5">
            <SlideCheck>주보</SlideCheck><SlideCheck>행사 포스터</SlideCheck><SlideCheck>교회 소식</SlideCheck>
        </ul>
    </>,
    // 3. 주보 + 홈페이지 업데이트
    <>
        <SlideChip dark>이런 고민 있으셨죠</SlideChip>
        <h3 className="text-xl sm:text-2xl md:text-3xl font-black text-[#191F28] tracking-tight mb-4 break-keep">
            주보도, 홈페이지도<br />
            매주 업데이트, <span className="text-[#3182F6]">힘들죠.</span>
        </h3>
        <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="rounded-xl bg-white border border-gray-200 px-3 py-2 text-sm font-bold text-[#191F28]">주보 업데이트</span>
            <span className="text-[#3182F6] font-black text-lg">+</span>
            <span className="rounded-xl bg-white border border-gray-200 px-3 py-2 text-sm font-bold text-[#191F28]">홈페이지 업데이트</span>
        </div>
        <p className="text-gray-500 text-sm md:text-base leading-relaxed break-keep">특히 개척교회일수록 꾸준히 신경 쓰기 어렵고, 가끔은 놓치기도 하고요.</p>
    </>,
    // 4. 이용 방법
    <>
        <SlideChip>이용 방법</SlideChip>
        <h3 className="text-xl sm:text-2xl md:text-3xl font-black text-[#191F28] tracking-tight mb-4 break-keep">
            <span className="text-[#3182F6]">사진 한 장</span>이면 끝
        </h3>
        <ol className="space-y-3">
            {[
                ['스테이온이 먼저 알림을 보내드려요', '업데이트할 때가 되면 먼저 연락드려요. 놓칠 일이 없어요.'],
                ['사진만 보내 주세요', '주보 사진, 행사 포스터, 메모 캡처 다 괜찮아요.'],
                ['반영은 스테이온이', '보내 주신 내용은 저희가 홈페이지에 직접 반영해 드려요.'],
            ].map(([t, d], i) => (
                <li key={t} className="flex gap-3">
                    <span className="w-6 h-6 rounded-full bg-[#3182F6] text-white text-xs font-black flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                    <div className="min-w-0">
                        <p className="text-sm md:text-base font-black text-[#191F28] break-keep">{t}</p>
                        <p className="text-xs md:text-sm text-gray-500 break-keep mt-0.5">{d}</p>
                    </div>
                </li>
            ))}
        </ol>
    </>,
    // 5. FAQ
    <>
        <SlideChip>자주 묻는 질문</SlideChip>
        <div className="space-y-2.5">
            <div className="rounded-2xl bg-[#3182F6] text-white px-4 py-3.5">
                <p className="text-xs md:text-sm font-bold text-blue-100 break-keep">Q. 새벽에 작업할 때도 있는데, 새벽에도 요청 가능한가요?</p>
                <p className="text-lg md:text-xl font-black mt-1">A. 그럼요, 당연하죠.</p>
            </div>
            <div className="rounded-2xl bg-white border border-gray-100 px-4 py-3">
                <p className="text-sm font-black text-[#191F28] break-keep">Q. 업데이트 요청 횟수 제한이 있나요?</p>
                <p className="text-xs md:text-sm text-gray-500 mt-0.5 break-keep">A. 없습니다. 필요할 때마다 편하게 보내 주세요.</p>
            </div>
            <div className="rounded-2xl bg-white border border-gray-100 px-4 py-3">
                <p className="text-sm font-black text-[#191F28] break-keep">Q. 직접 수정하고 싶을 때는요?</p>
                <p className="text-xs md:text-sm text-gray-500 mt-0.5 break-keep">A. 관리자 화면에서 직접 수정하셔도 돼요. 맡기셔도, 직접 하셔도 됩니다.</p>
            </div>
        </div>
    </>,
];

function OpenEventSlider() {
    const n = OPEN_EVENT_SLIDES.length;
    const [idx, setIdx] = useState(0);
    const [paused, setPaused] = useState(false);
    const startX = React.useRef<number | null>(null);
    const go = (to: number) => setIdx(((to % n) + n) % n);
    useEffect(() => {
        if (paused) return;
        const t = setTimeout(() => go(idx + 1), 6000);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [idx, paused]);
    return (
        <div
            className="relative h-full flex flex-col"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onPointerDown={(e) => { if (e.pointerType !== 'mouse') startX.current = e.clientX; }}
            onPointerUp={(e) => {
                if (startX.current === null) return;
                const dx = e.clientX - startX.current;
                startX.current = null;
                if (Math.abs(dx) > 40) go(idx + (dx < 0 ? 1 : -1));
            }}
            style={{ touchAction: 'pan-y' }}
        >
            <div className="grid flex-1 items-center overflow-hidden">
                {OPEN_EVENT_SLIDES.map((slide, i) => {
                    const active = i === idx;
                    return (
                        <div
                            key={i}
                            aria-hidden={!active}
                            className="col-start-1 row-start-1"
                            style={{
                                opacity: active ? 1 : 0,
                                transform: active ? 'translateX(0)' : `translateX(${i < idx ? -40 : 40}px)`, // 지난 장은 왼쪽, 다음 장은 오른쪽에서 대기
                                transition: `opacity 450ms ${SLIDE_EASE}, transform 600ms ${SLIDE_EASE}`,
                                pointerEvents: active ? 'auto' : 'none',
                            }}
                        >
                            {slide}
                        </div>
                    );
                })}
            </div>
            {/* 아래: 점(현재 장은 길게) + ‹ › */}
            <div className="mt-6 sm:mt-8 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                    {OPEN_EVENT_SLIDES.map((_, i) => (
                        <button key={i} type="button" aria-label={`${i + 1}번째 안내`} onClick={() => go(i)}
                            className="h-2 rounded-full transition-all duration-500"
                            style={{ width: i === idx ? 22 : 8, background: i === idx ? '#3182F6' : '#D1D6DB' }} />
                    ))}
                    <span className="ml-2 text-xs font-bold text-gray-400 tabular-nums">{idx + 1} / {n}</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <button type="button" aria-label="이전" onClick={() => go(idx - 1)}
                        className="w-8 h-8 rounded-full bg-white border border-gray-200 text-gray-500 hover:text-[#191F28] hover:border-gray-300 active:scale-90 transition-all flex items-center justify-center">
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button type="button" aria-label="다음" onClick={() => go(idx + 1)}
                        className="w-8 h-8 rounded-full bg-white border border-gray-200 text-gray-500 hover:text-[#191F28] hover:border-gray-300 active:scale-90 transition-all flex items-center justify-center">
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── 맨 위(히어로) 큰 제목 슬라이드(2026-11-12) ─────────────────────────────
// 1장 = 기존 대표 문구(h1 — 검색엔진이 읽는 대표 제목 그대로), 2·3장 = 관리형 소개(보조 문구, h1 아님).
// 7초마다 자동으로 넘어가고(마우스 올리면 멈춤), 아래 점·휴대폰 밀기로 넘김. 카드 3개·버튼·오른쪽 화면은 고정
// PC(lg 이상)는 첫 화면에 히어로 전체(제목~버튼·오른쪽 미리보기)가 다 들어오도록 글자·여백을 조금 줄임(lg: 접두어)
const HERO_TITLE = "text-[26px] sm:text-5xl md:text-[52px] lg:text-[42px] font-black tracking-tight text-[#191F28] leading-[1.25] sm:leading-[1.2] break-keep";
const HERO_DESC = "text-sm sm:text-lg md:text-xl lg:text-lg text-gray-500 font-medium leading-relaxed break-keep";
const HERO_SLIDES: React.ReactNode[] = [
    <>
        <h1 className={HERO_TITLE}>
            수백만 원짜리 교회 홈페이지,<br />
            <span className="text-[#3182F6]">이제 커피값이면 됩니다</span>
        </h1>
        <p className={`${HERO_DESC} mt-3 sm:mt-4`}>
            복잡한 외주 미팅과 유지보수 스트레스 없이, 빈칸만 채우면 우리 교회만의 품격 있는 사이트가 화면에 바로 나타납니다.
        </p>
    </>,
    <>
        <p className={HERO_TITLE}>
            홈페이지, 만드는 것보다<br />
            <span className="text-[#3182F6]">관리가 더 어렵습니다</span>
        </p>
        <p className={`${HERO_DESC} mt-3 sm:mt-4`}>
            스테이온이 매주 대신 챙겨 드릴게요. 주보·행사 포스터·교회 소식까지.
        </p>
    </>,
    <>
        <p className={HERO_TITLE}>
            업데이트는<br />
            <span className="text-[#3182F6]">사진 한 장이면 끝</span>
        </p>
        <p className={`${HERO_DESC} mt-3 sm:mt-4`}>
            알림이 가면 사진만 보내 주세요. 반영은 스테이온이 해 드려요.
        </p>
    </>,
];

function HeroSlider() {
    const n = HERO_SLIDES.length;
    const [idx, setIdx] = useState(0);
    const [paused, setPaused] = useState(false);
    const startX = React.useRef<number | null>(null);
    const go = (to: number) => setIdx(((to % n) + n) % n);
    useEffect(() => {
        if (paused) return;
        const t = setTimeout(() => go(idx + 1), 7000);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [idx, paused]);
    return (
        <div
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onPointerDown={(e) => { if (e.pointerType !== 'mouse') startX.current = e.clientX; }}
            onPointerUp={(e) => {
                if (startX.current === null) return;
                const dx = e.clientX - startX.current;
                startX.current = null;
                if (Math.abs(dx) > 40) go(idx + (dx < 0 ? 1 : -1));
            }}
            style={{ touchAction: 'pan-y' }}
        >
            {/* 모든 장을 같은 칸에 겹쳐 둠 → 칸 높이 = 가장 긴 장(넘길 때 아래 카드·버튼이 들썩이지 않음) */}
            <div className="grid items-start overflow-hidden">
                {HERO_SLIDES.map((slide, i) => {
                    const active = i === idx;
                    return (
                        <div
                            key={i}
                            aria-hidden={!active}
                            className="col-start-1 row-start-1"
                            style={{
                                opacity: active ? 1 : 0,
                                transform: active ? 'translateY(0)' : `translateY(${i < idx ? -18 : 18}px)`, // 지난 장은 위로, 다음 장은 아래에서 올라옴
                                transition: `opacity 500ms ${SLIDE_EASE}, transform 700ms ${SLIDE_EASE}`,
                                pointerEvents: active ? 'auto' : 'none',
                            }}
                        >
                            {slide}
                        </div>
                    );
                })}
            </div>
            {/* 넘기기(2026-11-20): 점만으로는 누를 수 있는지 몰라서 양옆에 ‹ › 버튼 추가. 점도 누르기 쉽게 터치 영역을 키움 */}
            <div className="mt-4 sm:mt-5 lg:mt-3.5 flex items-center gap-1">
                <button type="button" aria-label="이전 문구" onClick={() => go(idx - 1)}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-2xs transition-colors hover:border-gray-300 hover:text-gray-900 active:scale-95">
                    <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="flex items-center px-1">
                {HERO_SLIDES.map((_, i) => (
                    <button key={i} type="button" aria-label={`${i + 1}번째 문구`} onClick={() => go(i)}
                        className="flex h-8 items-center px-[3px]">
                    <span
                        className="relative block h-1.5 rounded-full overflow-hidden transition-all duration-500"
                        style={{ width: i === idx ? 28 : 8, background: '#D1D6DB' }}>
                        {/* 현재 장: 다음 장으로 넘어갈 때까지 파란 막대가 차오름(멈추면 같이 멈춤) */}
                        {i === idx && (
                            <span key={`${idx}-${paused}`} className="absolute inset-y-0 left-0 rounded-full bg-[#3182F6]"
                                style={{ width: paused ? '100%' : undefined, animation: paused ? undefined : 'heroFill 7s linear forwards' }} />
                        )}
                    </span>
                    </button>
                ))}
                </div>
                <button type="button" aria-label="다음 문구" onClick={() => go(idx + 1)}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-2xs transition-colors hover:border-gray-300 hover:text-gray-900 active:scale-95">
                    <ChevronRight className="w-4 h-4" />
                </button>
                <style>{`@keyframes heroFill{from{width:0}to{width:100%}}`}</style>
            </div>
        </div>
    );
}

export function WebsiteMain() {
    const routerNavigate = useNavigate();
    // website.stayon-platform.com 에서는 첫 화면 외 주소(빌더·주보 관리자·로그인 등)를 bulletin 주소로 "바로" 이동.
    // 앱 안에서 먼저 이동(/admin 등)한 뒤 넘기면 그 기록이 남아, 뒤로가기 때 website 주소에 관리자 화면이 되살아나는 문제가 있었음
    const navigate = (to: string, opts?: { viewTransition?: boolean }) => {
        // 로그인 안 된 상태로 빌더·홈페이지 만들기를 누르면 → 로그인 화면, 로그인 후 그 화면으로 이어짐
        if ((to === '/website-builder' || to === '/website-create') && !auth.currentUser && !isHandoffPending()) {
            setLoginReturnTo(to);
            to = '/login';
        }
        if (isWebsiteHost() && !WEBSITE_PATHS.includes(to)) {
            // website 주소에선 빌더·주보 관리자 등을 bulletin 주소로 "바로" 이동(로그인했으면 열쇠를 붙여 로그인 유지).
            // 앱 안에서 먼저 이동한 뒤 넘기면 그 기록이 남아 뒤로가기 때 website에 다른 화면이 되살아나는 문제가 있었음
            void bulletinUrlWithLogin(to).then((url) => window.location.assign(url));
            return;
        }
        // bulletin.../website 화면에서 빌더로 갈 땐 "여기서 왔다"고 표시(빌더 "뒤로"가 이 화면으로 돌아오게)
        routerNavigate(to, to === '/website-builder' ? { ...opts, state: { from: 'site' } } : opts);
    };
    const [openFaq, setOpenFaq] = useState<number | null>(null);
    // 만드는 방법: 직접 만들기 / STAYON에 맡기기(제작 비용 없음) 선택
    const [processMode, setProcessMode] = useState<'self' | 'request'>('self');
    const [billingType, setBillingType] = useState<'monthly' | 'quarterly'>('monthly');
    const [isScrolled, setIsScrolled] = useState(false);
    // "스테이온과 함께 하고 있는 교회" 섹션용 — 실제 배포된 사이트 목록, 새 사이트가
    // 배포될 때마다 자동으로 반영됨(수동으로 추가할 필요 없음)
    const [partnerSites, setPartnerSites] = useState<ChurchSite[]>([]);

    // 주보 플랫폼과 동일한 Firebase 프로젝트를 쓰기 때문에, 이미 로그인되어 있으면 여기서도 그대로 인식됨
    // website.stayon-platform.com: bulletin에서 넘겨준 교회 이름이 있으면 처음부터 로그인 상태로 그림(깜빡임 없이)
    const [currentUser, setCurrentUser] = useState<{ email: string; churchName: string } | null>(() => {
        const name = isWebsiteHost() ? readWebsiteHostName() : null;
        return name ? { email: '', churchName: name } : null;
    });
    // 로그인 확인이 끝났는지 — 끝나기 전엔 오른쪽 위 버튼을 그리지 않음("로그인"이 잠깐 보였다 바뀌는 깜빡임 방지)
    const [authChecked, setAuthChecked] = useState(false);

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

    // 스크롤하면 각 섹션 내용이 하나씩 떠오르며 나타남(2026-11-10). 섹션 제목 → 카드들이 차례로(살짝 시차).
    // 처음 화면에 이미 보이는 내용은 그대로 두고(깜빡임 방지), 아래쪽 내용만 숨겼다가 화면에 들어올 때 보여 줌.
    // "동작 줄이기"를 켠 기기에서는 효과 없음
    useEffect(() => {
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
        const root = document.querySelector('[data-website-root]');
        if (!root) return;
        const targets: HTMLElement[] = [];
        root.querySelectorAll<HTMLElement>('section[id]:not(#pricing-old), section[data-reveal]').forEach((sec) => {
            const inner = (sec.firstElementChild as HTMLElement | null)?.className.includes('max-w') && !sec.className.includes('max-w')
                ? sec.firstElementChild as HTMLElement : sec;
            Array.from(inner.children).forEach((child) => {
                const el = child as HTMLElement;
                // 카드 묶음(grid)은 카드 하나하나를 차례로
                const grid = el.className.includes('grid') ? el : null;
                if (grid && grid.children.length > 1) {
                    Array.from(grid.children).forEach((c, i) => { (c as HTMLElement).dataset.revealDelay = String(i * 90); targets.push(c as HTMLElement); });
                } else {
                    targets.push(el);
                }
            });
        });
        const show = (el: HTMLElement) => { el.style.opacity = '1'; el.style.transform = 'none'; };
        const io = new IntersectionObserver((entries) => {
            entries.forEach((e) => {
                if (!e.isIntersecting) return;
                const el = e.target as HTMLElement;
                el.style.transitionDelay = `${el.dataset.revealDelay || 0}ms`;
                show(el);
                io.unobserve(el);
            });
        }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
        targets.forEach((el) => {
            if (el.getBoundingClientRect().top < window.innerHeight) return; // 이미 보이는 건 그대로
            el.style.opacity = '0';
            el.style.transform = 'translateY(28px)';
            el.style.transition = 'opacity 0.7s ease-out, transform 0.7s cubic-bezier(0.22, 1, 0.36, 1)';
            io.observe(el);
        });
        return () => { io.disconnect(); targets.forEach(show); };
    }, []);

    useEffect(() => {
        getPublishedChurchSites().then(setPartnerSites).catch((error) => {
            console.error('배포된 교회 사이트 목록 로드 실패:', error);
        });
    }, []);

    useEffect(() => {
        const onWebsite = isWebsiteHost();
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (!user) {
                // website 주소에서 열쇠로 로그인하는 중이면 잠깐 "로그인 안 됨"으로 와도 기다림
                if (onWebsite && isHandoffPending()) return;
                setCurrentUser(null);
                setAuthChecked(true);
                if (onWebsite) saveWebsiteHostName(null);
                return;
            }
            try {
                const userDoc = await getDoc(doc(db, 'users', user.uid));
                const churchName = userDoc.exists() ? (userDoc.data().churchName || '우리 교회') : '우리 교회';
                setCurrentUser({ email: user.email || '', churchName });
                if (onWebsite) { saveWebsiteHostName(churchName); prefetchLoginToken(); } // 새로고침해도 바로 그리게 + bulletin으로 갈 때 쓸 로그인 열쇠 미리 받기
            } catch (error) {
                console.error('로그인 정보 로드 실패:', error);
                setCurrentUser((prev) => prev ?? { email: user.email || '', churchName: '우리 교회' });
            }
            setAuthChecked(true);
        });
        // 열쇠 로그인이 실패로 끝났으면 로그아웃 상태로 정리
        if (onWebsite) {
            void whenHandoffDone().then(() => {
                if (!auth.currentUser && !isHandoffPending()) { setCurrentUser(null); setAuthChecked(true); }
            });
        }
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
        // 들어올 때 살짝 아래에서 올라오며 서서히 나타남(메인에서 "교회 홈페이지 제작"으로 넘어올 때 자연스럽게)
        <div data-website-root className="min-h-screen bg-[#F4F6F8] text-[#191F28] font-sans antialiased selection:bg-blue-100 selection:text-blue-900 pb-20 md:pb-0 animate-in fade-in slide-in-from-bottom-2 duration-700 ease-out">

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

                    {/* 로그인 확인 전(교회 이름도 모를 때)엔 투명하게 두었다가 확인되면 부드럽게 나타남 */}
                    <div data-auth-slot className={`flex items-center gap-1 sm:gap-3 transition-opacity duration-300 ${currentUser || authChecked ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                        {currentUser ? (
                            // 로그인 정보: 마우스를 올리면(휴대폰은 누르면) "로그아웃" 메뉴
                            <QuickMenu
                                width={200}
                                button={(open) => (
                                    <button
                                        type="button"
                                        className={`flex items-center gap-2 text-[14px] font-bold px-2 sm:px-3 py-2 rounded-2xl transition-all ${open ? 'bg-[#F2F4F6] text-[#191F28]' : 'text-[#4E5968] hover:text-[#191F28] hover:bg-[#F9FAFB]'}`}
                                    >
                                        <span className="w-6 h-6 rounded-full bg-blue-50 text-[#3182F6] flex items-center justify-center text-[11px] font-black flex-shrink-0">
                                            {currentUser.churchName.slice(0, 1)}
                                        </span>
                                        <span className="hidden sm:inline">{currentUser.churchName}</span>
                                        <ChevronDown className={`w-3.5 h-3.5 text-[#8B95A1] transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
                                    </button>
                                )}
                                items={[{
                                    label: '로그아웃',
                                    icon: <LogOut className="w-4 h-4" />,
                                    tone: 'red',
                                    onSelect: async () => {
                                        try { await signOut(auth); } catch (e) { console.error('로그아웃 실패:', e); }
                                        if (isWebsiteHost()) saveWebsiteHostName(null);
                                        setCurrentUser(null);
                                    },
                                }]}
                            />
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
                            // 바로 가기: 마우스를 올리면 "사이트 관리자 / 주보 관리자" (홈페이지 화면이라 사이트 관리자가 먼저)
                            <QuickMenu
                                button={(open) => (
                                    <button
                                        type="button"
                                        className={`bg-[#191F28] hover:bg-black text-white text-[13px] sm:text-[14px] font-bold px-3 sm:px-5 py-2 sm:py-3 rounded-full transition-all active:scale-95 flex items-center gap-1 sm:gap-1.5 whitespace-nowrap ${open ? 'shadow-[0_10px_22px_rgba(0,0,0,0.22)]' : 'shadow-[0_8px_16px_rgba(0,0,0,0.15)]'}`}
                                    >
                                        바로 가기 <ChevronDown className={`w-3.5 h-3.5 sm:w-4 sm:h-4 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
                                    </button>
                                )}
                                items={[
                                    { label: '사이트 관리자', desc: '우리 교회 홈페이지 편집', icon: <Globe2 className="w-4 h-4" />, tone: 'blue', onSelect: () => navigate('/website-builder') },
                                    { label: '주보 관리자', desc: '이번 주 주보 만들기·관리', icon: <BookOpen className="w-4 h-4" />, tone: 'dark', onSelect: () => navigate('/admin') },
                                ]}
                            />
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
            <section className="px-4 sm:px-6 pt-6 sm:pt-8 pb-10 sm:pb-16 md:pt-14 md:pb-24 lg:pt-4 lg:pb-8">
                <div className="max-w-6xl mx-auto">

                    {/* 상단 프로모션 인포 배너("견적서 비교 없이, 빈칸 3개만 채우면…" + 지금 시작하기) — 숨김(2026-11-12, 요청).
                        다시 보이게 하려면 아래 false를 지우면 됨 */}
                    {false && (
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
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 sm:gap-12 lg:gap-10 items-center">

                        <div className="lg:col-span-7 space-y-6 sm:space-y-8 lg:space-y-4">
                            <div className="space-y-3 sm:space-y-4">
                                <div className="inline-flex items-center gap-1.5 bg-blue-50 text-[#3182F6] text-xs font-extrabold px-3.5 py-1.5 rounded-full break-keep">
                                    주보·수련회에 이은 세 번째 스테이온 서비스
                                </div>
                                {/* 큰 제목·설명: 3장 슬라이드(위 HeroSlider). 1장은 기존 문구(h1) 그대로 */}
                                <HeroSlider />
                            </div>

                            <div className="grid grid-cols-3 gap-2 sm:gap-3 pt-2 lg:pt-0">
                                <div className="bg-white p-3 sm:p-4 lg:py-3 rounded-xl sm:rounded-2xl border border-gray-100 shadow-2xs">
                                    <div className="text-[10px] sm:text-xs text-gray-400 font-bold mb-1">초기 비용</div>
                                    <div className="text-sm sm:text-base font-black text-[#17325C]">0원</div>
                                </div>
                                <div className="bg-white p-3 sm:p-4 lg:py-3 rounded-xl sm:rounded-2xl border border-gray-100 shadow-2xs">
                                    <div className="text-[10px] sm:text-xs text-gray-400 font-bold mb-1">제작 소요시간</div>
                                    <div className="text-sm sm:text-base font-black text-[#17325C]">단 5분</div>
                                </div>
                                <div className="bg-white p-3 sm:p-4 lg:py-3 rounded-xl sm:rounded-2xl border border-gray-100 shadow-2xs">
                                    <div className="text-[10px] sm:text-xs text-gray-400 font-bold mb-1">월 이용요금</div>
                                    {/* 오픈 프로모션(2026-11-20): 원래 가격에 취소선 + 무료 */}
                                    <div className="flex flex-wrap items-baseline gap-x-1.5">
                                        <span className="text-[11px] sm:text-sm font-bold text-gray-400 line-through decoration-gray-400 decoration-2">7,900원~</span>
                                        <span className="text-sm sm:text-base font-black text-[#F04452] break-keep">오픈 프로모션 무료!</span>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3 pt-2 hidden md:block">
                                <button
                                    onClick={() => navigate('/website-create')}
                                    className="w-full sm:w-auto px-8 py-4 lg:py-3 bg-[#3182F6] hover:bg-[#1B64DA] text-white text-base font-bold rounded-2xl shadow-lg shadow-blue-500/20 transition-all active:scale-98 flex items-center justify-center gap-3"
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
                            {/* 눌러 볼 수 있다는 걸 알려 주는 말풍선(늘 보임, 살짝 둥실). 누르면 아래 미리보기 링크로 그대로 통과 */}
                            <span className="pointer-events-none absolute -top-3 right-3 sm:-top-4 sm:right-5 z-10 animate-[previewFloat_2.4s_ease-in-out_infinite]">
                                <span className="relative block whitespace-nowrap rounded-full bg-[#3182F6] px-3 py-1.5 sm:px-3.5 sm:py-2 text-[11px] sm:text-[13px] font-bold text-white shadow-[0_6px_16px_rgba(49,130,246,0.35)]">
                                    👆 눌러서 실제 홈페이지 구경하기
                                    <span className="absolute -bottom-1 right-6 h-2.5 w-2.5 rotate-45 bg-[#3182F6]" />
                                </span>
                            </span>
                            <style>{`@keyframes previewFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}`}</style>

                            {/* 실제 교회 홈페이지 미리보기(2026-11-12): 스테이온으로 만든 실제 홈페이지(스테이 교회) 화면을
                                브라우저 창 모양 안에 그대로 보여 줌 → 처음 보는 분도 "홈페이지가 이렇게 생기는구나" 바로 알 수 있게.
                                예전 미리보기의 글(예배 안내·주보·오시는 길 등)은 검색엔진용으로 화면엔 안 보이게 남겨 둠(sr-only) */}
                            <a href="https://stay.stayon-platform.com" target="_blank" rel="noopener noreferrer"
                                className="group block bg-white rounded-[1.75rem] border border-gray-100 shadow-2xl overflow-hidden transition-transform duration-500 hover:-translate-y-1">
                                {/* 브라우저 창 윗부분 */}
                                <div className="flex items-center gap-3 px-4 py-3 lg:py-2.5 border-b border-gray-100 bg-white">
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <span className="w-2.5 h-2.5 rounded-full bg-red-400/80" />
                                        <span className="w-2.5 h-2.5 rounded-full bg-amber-400/80" />
                                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/80" />
                                    </div>
                                    <div className="flex-1 min-w-0 bg-gray-50 px-3 py-1 rounded-lg text-[11px] text-gray-500 font-mono flex items-center gap-1.5">
                                        <Lock className="w-3 h-3 text-gray-400 shrink-0" />
                                        <span className="truncate">stay.stayon-platform.com</span>
                                    </div>
                                </div>
                                {/* 실제 홈페이지 화면 */}
                                {/* 아래 카드 끝부분만 살짝 잘라(1132→1040) 첫 화면에 다 들어오게 — 위쪽 기준으로 보여 줌 */}
                                <div className="relative overflow-hidden bg-gray-50" style={{ aspectRatio: '1222 / 1040' }}>
                                    <img
                                        src="/homePageSample.jpg"
                                        alt="스테이온으로 만든 실제 교회 홈페이지 예시 — 스테이 교회 첫 화면(교회 소개·예배·말씀/영상·주일학교·주보·앨범 메뉴, 처음 오셨나요·예배 시간 및 장소 안내·유튜브 채널·찾아오시는 길)"
                                        className="absolute inset-0 h-full w-full object-cover object-top transition-transform duration-[1200ms] ease-out group-hover:scale-[1.03]"
                                        loading="eager"
                                    />
                                    <span className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-black/60 backdrop-blur px-3 py-1.5 text-[11px] font-bold text-white opacity-0 translate-y-1 transition-all duration-300 group-hover:opacity-100 group-hover:translate-y-0">
                                        실제 홈페이지 보기 <ArrowRight className="w-3 h-3" />
                                    </span>
                                </div>
                                <div className="flex items-center justify-center gap-1.5 py-2.5 border-t border-gray-100 text-[12px] sm:text-[13px] font-bold text-[#3182F6] group-hover:bg-[#F2F8FF] transition-colors">
                                    스테이온으로 만든 실제 교회 홈페이지 보러 가기 <ArrowRight className="w-3.5 h-3.5" />
                                </div>
                            </a>
                            {/* 검색엔진용(화면엔 안 보임): 예전 미리보기 글 */}
                            <div className="sr-only">
                                <p>주일 대예배 안내 — "온 마음으로 섬기고 사랑하는 공동체" 2026년 8월 첫째 주일 예배 안내 및 주보 보기</p>
                                <ul>
                                    {mockupRows.map((row) => <li key={row.title}>{row.title} — {row.sub}</li>)}
                                </ul>
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
                        <p key={processMode} className="text-gray-500 mt-3 text-sm md:text-base break-keep animate-in fade-in duration-500">
                            {processMode === 'self'
                                ? '코딩도, 디자인 툴도 필요 없습니다. 순서대로 따라오시면 됩니다.'
                                : '직접 만들기 어려우시면 STAYON에 맡기세요. 제작 비용 없이 만들어 드려요.'}
                        </p>
                        {/* 직접 만들기 / STAYON에 맡기기 — 고르면 파란 배경이 미끄러지듯 옮겨 감 */}
                        <div className="relative mt-6 sm:mt-8 inline-grid grid-cols-2 rounded-2xl bg-gray-100 p-1">
                            <span
                                className="absolute top-1 bottom-1 left-1 rounded-xl bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08)] transition-transform duration-500"
                                style={{ width: 'calc(50% - 4px)', transform: processMode === 'self' ? 'translateX(0)' : 'translateX(100%)', transitionTimingFunction: 'cubic-bezier(0.2, 0, 0, 1)' }}
                            />
                            {([['self', '직접 만들기', Wand2], ['request', 'STAYON에 맡기기', HeartHandshake]] as const).map(([mode, label, Icon]) => (
                                <button key={mode} type="button" onClick={() => setProcessMode(mode)}
                                    className={`relative z-10 flex items-center justify-center gap-1.5 px-3 sm:px-6 py-2.5 rounded-xl text-[13px] sm:text-sm font-extrabold transition-colors duration-300 whitespace-nowrap ${processMode === mode ? 'text-[#191F28]' : 'text-gray-400 hover:text-gray-600'}`}>
                                    <Icon className={`w-4 h-4 ${processMode === mode ? 'text-[#3182F6]' : ''}`} /> {label}
                                    {/* 휴대폰은 칸이 좁아 "제작비 0원" 표시는 숨김(아래 설명·버튼에 같은 안내 있음) */}
                                    {mode === 'request' && <span className="ml-0.5 hidden sm:inline rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-black text-gray-900">제작비 0원</span>}
                                </button>
                            ))}
                        </div>
                    </div>

                    {processMode === 'self' ? (
                        <div key="self" className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 relative">
                            {processSteps.map((proc, i) => (
                                <div key={proc.num} className="bg-[#F8F9FA] p-6 sm:p-8 rounded-[1.5rem] sm:rounded-[2rem] border border-gray-100 relative animate-in fade-in slide-in-from-bottom-3 fill-mode-both duration-500" style={{ animationDelay: `${i * 80}ms` }}>
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
                    ) : (
                        <div key="request">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 relative">
                                {[
                                    { num: '01', icon: MessageCircle, title: '카카오톡으로 요청', desc: "STAYON 카카오톡 채널로 \"홈페이지 만들어 주세요\" 한마디면 돼요." },
                                    { num: '02', icon: Camera, title: '자료만 보내 주세요', desc: '교회 사진, 주보, 예배 시간처럼 가지고 계신 자료를 사진으로 보내 주시면 돼요.' },
                                    { num: '03', icon: Rocket, title: 'STAYON이 만들어 드려요', desc: '제작부터 오픈까지 저희가 해 드려요. 제작 비용은 없습니다.' },
                                ].map((proc, i) => (
                                    <div key={proc.num} className="bg-[#F5F9FF] p-6 sm:p-8 rounded-[1.5rem] sm:rounded-[2rem] border border-blue-100/70 relative animate-in fade-in slide-in-from-bottom-3 fill-mode-both duration-500" style={{ animationDelay: `${i * 80}ms` }}>
                                        <div className="flex items-center justify-between mb-6">
                                            <div className="w-12 h-12 rounded-2xl bg-[#3182F6] text-white flex items-center justify-center shadow-md shadow-blue-500/20">
                                                <proc.icon className="w-5 h-5" />
                                            </div>
                                            <span className="text-3xl font-black text-blue-100">{proc.num}</span>
                                        </div>
                                        <h3 className="text-lg font-extrabold text-gray-900 mb-2.5">{proc.title}</h3>
                                        <p className="text-gray-500 text-sm leading-relaxed break-keep">{proc.desc}</p>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-6 sm:mt-8 flex flex-col items-center gap-2 animate-in fade-in fill-mode-both duration-500" style={{ animationDelay: '260ms' }}>
                                <a href="http://pf.kakao.com/_xexmExnX/chat" target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 rounded-2xl bg-[#FEE500] hover:bg-[#F5DC00] px-7 py-3.5 text-[15px] font-extrabold text-[#191F28] shadow-sm transition-all active:scale-95">
                                    <MessageCircle className="w-4 h-4" /> 카카오톡으로 제작 요청하기
                                </a>
                                <p className="text-xs text-gray-400 font-medium">제작 비용 없음 · 오픈 후 수정 요청도 편하게</p>
                            </div>
                        </div>
                    )}
                </div>
            </section>

            {/* 스테이온과 함께 하고 있는 교회 — 실제 배포된 사이트로 가는 진짜 링크(<a href>)를 걸어서
                검색엔진이 이 페이지를 크롤링할 때 그 교회 사이트들을 같이 발견할 수 있게 함.
                배포된 사이트가 아직 하나도 없으면 섹션 자체를 숨김 */}
            {partnerSites.length > 0 && (
                <section data-reveal className="py-12 sm:py-20 bg-white border-y border-gray-100 px-4 sm:px-6">
                    <div className="max-w-6xl mx-auto">
                        <div className="text-center mb-8 sm:mb-12">
                            <p className="text-xs font-bold tracking-[0.25em] text-[#3182F6] mb-3">PARTNER CHURCHES</p>
                            <h2 className="text-xl sm:text-2xl md:text-4xl font-black text-gray-900 break-keep">
                                스테이온과 함께 하고 있는 교회
                            </h2>
                        </div>
                        {/* 가로로 긴 직사각형 카드: 교단 마크 | 교회 이름 · 교단 이름 (2026-11-10). 교단이 없으면 교회 이름 첫 글자 */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                            {partnerSites.map((site) => {
                                const denom = resolveDenomination((site as { denomination?: unknown }).denomination);
                                return (
                                    <a
                                        key={site.slug}
                                        href={`https://${site.slug}.stayon-platform.com`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="group flex items-center gap-4 bg-white border border-gray-200 hover:border-[#3182F6] rounded-lg px-5 py-4 transition-colors"
                                    >
                                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-gray-50 overflow-hidden">
                                            {denom ? (
                                                <img src={denominationLogoSrc(denom.id)} alt={denom.name} className="h-10 w-10 object-contain" loading="lazy"
                                                    onError={(e) => { e.currentTarget.style.display = "none"; }} />
                                            ) : (
                                                <span className="text-lg font-black text-gray-400">{site.churchName.slice(0, 1)}</span>
                                            )}
                                        </span>
                                        <span className="min-w-0 flex-1 text-left">
                                            <span className="block font-bold text-gray-900 truncate group-hover:text-[#3182F6] transition-colors">{site.churchName}</span>
                                            {denom && <span className="block text-xs text-gray-400 truncate">{denominationDisplayName(denom, (site as { denominationFullName?: unknown }).denominationFullName === true)}</span>}
                                        </span>
                                        <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-[#3182F6] shrink-0 transition-colors" />
                                    </a>
                                );
                            })}
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
                                    <span>월 7,900원부터 투명하고 합리적인 비용 <span className="text-slate-400 text-xs font-normal">(관리형 라이트 {MANAGED_PLANS.lite.monthly.toLocaleString()}원 · 관리형 맥스 {MANAGED_PLANS.max.monthly.toLocaleString()}원)</span></span>
                                </div>
                            </div>
                        </div>

                    </div>

                    {/* 관리형 안내 카드: 비교 카드 두 장 아래에 따로, 눈에 띄게(2026-11-10 추가) */}
                    <div className="max-w-5xl mx-auto mt-4 sm:mt-6 rounded-[1.75rem] sm:rounded-[2.5rem] bg-gradient-to-r from-[#3182F6] to-[#1B64DA] text-white p-6 md:p-10 relative overflow-hidden shadow-xl shadow-blue-200/60">
                        <div className="absolute -top-10 -right-10 w-48 h-48 bg-white/10 rounded-full pointer-events-none"></div>
                        <div className="relative grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                            <div>
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-black">
                                    <Sparkles className="w-3.5 h-3.5" /> 관리형 NEW
                                </span>
                                <h3 className="mt-3 text-xl sm:text-2xl md:text-3xl font-black tracking-tight break-keep">
                                    관리형까지 도입!
                                </h3>
                                <p className="mt-2 text-sm md:text-base text-blue-50 leading-relaxed break-keep">
                                    직접 관리하기 어려운 교회를 위해, 스테이온이 교회를 대신해서 홈페이지를 주기적으로 관리해 드립니다.
                                </p>
                                <ul className="mt-4 flex flex-wrap gap-2 text-xs sm:text-sm font-bold">
                                    {['교회 소식·사진 업데이트', '예배 시간·행사 변경 반영', '주보·설교 내용 정리'].map((t) => (
                                        <li key={t} className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5">
                                            <Check className="w-3.5 h-3.5" /> {t}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            <a href="http://pf.kakao.com/_xexmExnX/chat" target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white text-[#1B64DA] font-black text-sm px-6 py-4 hover:bg-blue-50 transition whitespace-nowrap">
                                관리형 문의하기 <ArrowRight className="w-4 h-4" />
                            </a>
                        </div>
                    </div>
                </div>
            </section>

            {/* 요금 안내 (2026-11-10 새 버전): 오픈 이벤트 무료 + 스테이온 제작 대행 문의 + 항목별 비용 세분화 */}
            <section id="pricing" className="py-12 sm:py-24 bg-white border-y border-gray-100 px-4 sm:px-6">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center max-w-2xl mx-auto mb-8 sm:mb-14">
                        <span className="text-xs font-extrabold text-[#3182F6] bg-blue-50 px-3.5 py-1.5 rounded-full inline-block mb-3">PRICING PLAN</span>
                        <h2 className="text-xl sm:text-2xl md:text-4xl font-black text-[#191F28] tracking-tight break-keep">
                            지금은 무료로 시작하세요
                        </h2>
                        <p className="text-gray-500 mt-3 text-sm md:text-base break-keep">정식 오픈 기념 이벤트 기간에는 교회 홈페이지를 무료로 만들고 운영할 수 있어요.</p>
                    </div>

                    {/* 1) 오픈 이벤트 배너: 왼쪽 안내 / 오른쪽 가격(0원) */}
                    <div className="max-w-5xl mx-auto bg-[#F8F9FA] rounded-[1.75rem] sm:rounded-[2.5rem] border border-gray-100 overflow-hidden mb-6 sm:mb-8">
                        <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">
                            {/* 왼쪽: 오픈 이벤트·관리형 소개 슬라이드(위 OpenEventSlider) */}
                            <div className="lg:col-span-7 p-6 md:p-12 flex flex-col justify-center">
                                <OpenEventSlider />
                            </div>
                            <div className="lg:col-span-5 bg-[#191F28] text-white p-6 md:p-12 flex flex-col justify-between relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-40 h-40 bg-blue-500/20 rounded-bl-full pointer-events-none blur-xl"></div>
                                <div>
                                    <div className="flex items-center justify-between mb-4 gap-2">
                                        <span className="text-xs font-bold text-blue-200 uppercase tracking-wider">Open Event</span>
                                        <span className="text-[10px] bg-amber-400 text-gray-900 font-black px-2.5 py-1 rounded-full shrink-0 whitespace-nowrap">기간 한정</span>
                                    </div>
                                    {/* 요금(2026-11-20 /pricing과 통일): 프로·셀프형 월 7,900원 / 관리형 라이트 14,900원 / 관리형 맥스 19,900원 — 모두 모바일 주보 포함.
                                        관리형은 정기결제 12개월 다 채우면 환급. 오픈 이벤트 기간에는 무료라는 안내를 아래에 */}
                                    <div className="space-y-2.5">
                                        <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/5 px-4 py-3">
                                            <div className="min-w-0">
                                                <p className="text-sm font-black text-white">프로 · 셀프형</p>
                                                <p className="text-[11px] text-slate-400 break-keep">직접 편집 + 모바일 주보 포함</p>
                                            </div>
                                            <p className="shrink-0 text-white"><span className="text-xs text-blue-200 mr-1">월</span><span className="text-2xl sm:text-3xl font-black tracking-tight">7,900</span><span className="text-xs text-blue-200 ml-0.5">원</span></p>
                                        </div>
                                        <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/5 px-4 py-3">
                                            <div className="min-w-0">
                                                <p className="text-sm font-black text-white">관리형 라이트</p>
                                                <p className="text-[11px] text-slate-400 break-keep">스테이온이 월 2회 대신 업데이트 + 검색 노출(SEO) 지원 + 모바일 주보</p>
                                                <p className="mt-0.5 text-[11px] font-bold text-emerald-300 break-keep">정기결제 1년 다 채우면 {MANAGED_PLANS.lite.refund.toLocaleString()}원 환급</p>
                                            </div>
                                            <p className="shrink-0 text-white"><span className="text-xs text-blue-200 mr-1">월</span><span className="text-2xl sm:text-3xl font-black tracking-tight">{MANAGED_PLANS.lite.monthly.toLocaleString()}</span><span className="text-xs text-blue-200 ml-0.5">원</span></p>
                                        </div>
                                        {/* 관리형 맥스(추천) — /pricing 관리형 카드에서 "맥스"를 골라 결제 */}
                                        <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#3182F6]/20 ring-1 ring-[#3182F6]/50 px-4 py-3">
                                            <div className="min-w-0">
                                                <p className="text-sm font-black text-white flex items-center gap-1.5">관리형 맥스 <span className="text-[10px] bg-amber-400 text-gray-900 font-black px-1.5 py-0.5 rounded-full">추천</span></p>
                                                <p className="text-[11px] text-slate-400 break-keep">매주 1회 대신 업데이트(월 4회, 5주인 달은 5회 모두) + 검색 노출(SEO) 지원 + 모바일 주보</p>
                                                <p className="mt-0.5 text-[11px] font-bold text-emerald-300 break-keep">정기결제 1년 다 채우면 {MANAGED_PLANS.max.refund.toLocaleString()}원 환급</p>
                                            </div>
                                            <p className="shrink-0 text-white"><span className="text-xs text-blue-200 mr-1">월</span><span className="text-2xl sm:text-3xl font-black tracking-tight">{MANAGED_PLANS.max.monthly.toLocaleString()}</span><span className="text-xs text-blue-200 ml-0.5">원</span></p>
                                        </div>
                                    </div>
                                    <div className="mt-3 mb-5 sm:mb-6 inline-flex items-center gap-1.5 rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-bold text-emerald-300">
                                        <Sparkles className="w-3.5 h-3.5" /> 오픈 이벤트 기간에는 무료
                                    </div>
                                    <div className="w-full h-px bg-white/10 mb-5 sm:mb-6"></div>
                                    <ul className="space-y-3 text-xs md:text-sm text-white font-medium mb-6 sm:mb-8">
                                        <li className="flex items-center gap-2.5"><CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" /> 교회 공식 홈페이지 정식 운영</li>
                                        <li className="flex items-center gap-2.5"><CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" /> 온라인 주보·설교 영상 자동 연동</li>
                                        <li className="flex items-center gap-2.5"><CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" /> 네이버/구글 검색 최적화</li>
                                    </ul>
                                </div>
                                <button
                                    onClick={() => navigate('/website-builder')} // 바로 홈페이지 편집 화면으로(상단 "무료로 시작하기"와 같음)
                                    className="w-full bg-[#3182F6] hover:bg-[#1B64DA] text-white font-bold py-4 rounded-2xl transition-all shadow-lg text-sm flex items-center justify-center gap-2 active:scale-98"
                                >
                                    <span>무료로 홈페이지 만들기</span>
                                    <ArrowRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* 2) 비용 세분화: 항목별로 얼마인지 한눈에 */}
                    <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5 mb-6 sm:mb-8">
                        <div className="bg-white p-6 sm:p-7 rounded-[1.5rem] border border-gray-100 shadow-2xs flex flex-col">
                            <div className="flex items-center justify-between gap-2 mb-3">
                                <h3 className="text-sm font-extrabold text-[#17325C] break-keep">직접 만들기</h3>
                                <span className="text-[11px] bg-blue-50 text-[#3182F6] font-bold px-2.5 py-1 rounded-full whitespace-nowrap">오픈 이벤트 무료</span>
                            </div>
                            <p className="text-gray-500 text-xs md:text-sm leading-relaxed break-keep flex-1">교회가 편집 화면에서 직접 내용을 넣어 만드는 방식이에요. 주보 플랫폼을 쓰면 대부분 자동으로 채워져요.</p>
                            <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500 space-y-1">
                                <div className="flex justify-between"><span>구축비</span><b className="text-[#191F28]">0원</b></div>
                                <div className="flex justify-between"><span>월 이용료</span><b className="text-[#3182F6]">이벤트 기간 무료</b></div>
                                <div className="flex justify-between"><span>이벤트 종료 이후</span><b className="text-[#191F28]">월 7,900원</b></div>
                            </div>
                        </div>
                        <div className="bg-white p-6 sm:p-7 rounded-[1.5rem] border-2 border-[#3182F6]/30 shadow-2xs flex flex-col">
                            <div className="flex items-center justify-between gap-2 mb-3">
                                <h3 className="text-sm font-extrabold text-[#17325C] break-keep">제작 대행</h3>
                                <span className="text-[11px] bg-amber-50 text-amber-600 font-bold px-2.5 py-1 rounded-full whitespace-nowrap">문의</span>
                            </div>
                            <p className="text-gray-500 text-xs md:text-sm leading-relaxed break-keep flex-1">바쁘시거나 컴퓨터가 어려우시면 스테이온에 문의해 주세요. 교회 자료만 보내 주시면 홈페이지를 대신 만들어 드려요.</p>
                            <a href="http://pf.kakao.com/_xexmExnX/chat" target="_blank" rel="noopener noreferrer"
                                className="mt-4 w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#FEE500] hover:brightness-95 text-[#191919] font-bold text-sm py-3 transition">
                                카카오톡으로 제작 문의하기 <ArrowRight className="w-4 h-4" />
                            </a>
                        </div>
                        <div className="bg-white p-6 sm:p-7 rounded-[1.5rem] border border-gray-100 shadow-2xs flex flex-col">
                            <div className="flex items-center justify-between gap-2 mb-3">
                                <h3 className="text-sm font-extrabold text-[#17325C] break-keep">도메인 · SSL 보안서버</h3>
                                <span className="text-[11px] bg-emerald-50 text-emerald-600 font-bold px-2.5 py-1 rounded-full whitespace-nowrap">기본 포함</span>
                            </div>
                            <p className="text-gray-500 text-xs md:text-sm leading-relaxed break-keep flex-1">교회 주소(○○.stayon-platform.com)와 HTTPS 보안 인증서를 추가 비용 없이 기본으로 세팅해 드려요.</p>
                            <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500 space-y-1">
                                <div className="flex justify-between"><span>서버 유지비</span><b className="text-[#191F28]">0원</b></div>
                                <div className="flex justify-between"><span>SSL 인증서</span><b className="text-[#191F28]">0원</b></div>
                            </div>
                        </div>
                    </div>

                    {/* 3) 준비 중인 옵션 */}
                    {/* 운영 관리 대행: 준비중이 아닌 제공 중인 서비스로 눈에 띄게(2026-11-10) */}
                    <div className="max-w-5xl mx-auto rounded-[1.5rem] border-2 border-[#3182F6]/30 bg-blue-50/60 p-5 sm:p-7 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
                        <div className="w-11 h-11 rounded-2xl bg-[#3182F6] text-white flex items-center justify-center shrink-0">
                            <HeartHandshake className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="text-base sm:text-lg font-black text-[#191F28] break-keep">운영 관리 대행</h3>
                                <span className="text-[11px] bg-[#3182F6] text-white font-black px-2.5 py-0.5 rounded-full whitespace-nowrap">관리형</span>
                            </div>
                            <p className="mt-1 text-sm md:text-[15px] text-gray-600 leading-relaxed break-keep">매주 소식·사진 업데이트까지 스테이온이 맡아 드려요. 교회는 주보만 보내 주시면 됩니다.</p>
                        </div>
                        <a href="http://pf.kakao.com/_xexmExnX/chat" target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#3182F6] hover:bg-[#1B64DA] text-white font-bold text-sm px-5 py-3 whitespace-nowrap transition">
                            관리 대행 문의하기 <ArrowRight className="w-4 h-4" />
                        </a>
                    </div>
                    <div className="max-w-5xl mx-auto pt-5 text-center">
                        <a href="#faq" onClick={scrollToSection('faq')} className="text-xs font-bold text-gray-400 hover:text-gray-600 transition-colors inline-flex items-center gap-1">
                            요금제 상세 약관 및 환불 규정 확인하기 <ChevronRight className="w-3.5 h-3.5" />
                        </a>
                    </div>
                </div>
            </section>

            {/* [이전 요금 안내 — 보관용, 화면에 안 나옴] 2026-11-10 오픈 이벤트·제작 대행 안내로 바꾸면서 꺼 둠.
                되살리려면 아래 `false &&` 를 지우면 됨(안쪽에 주석이 있어 주석으로는 감쌀 수 없음) */}
            {false && (
            <section id="pricing-old" className="py-12 sm:py-24 bg-white border-y border-gray-100 px-4 sm:px-6">
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
            )}

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
            <section data-reveal className="bg-[#17325C] text-white py-12 sm:py-20 px-4 sm:px-6 text-center">
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
