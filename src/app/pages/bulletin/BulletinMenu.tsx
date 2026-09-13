import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router";
import { Menu, X, Home, Church, Users, Clock, Share2, MapPin, Network, Lock, ChevronRight, Landmark, MessageCircleHeart, Newspaper } from "lucide-react";
import { toast } from "sonner";

// 성도 화면(및 그 하위 메뉴 화면) 우측 상단의 메뉴 버튼 + 우측 슬라이드 시트.
// 항목은 하나씩 순차적으로 여는 중이라, 아직 준비 안 된 항목은 "준비중"으로 잠가 둔다.

type MenuVariant = "over-hero" | "solid";

interface BulletinMenuProps {
  bulletinId: string; // 현재 주보의 :id (교회마다 다름)
  churchLogo?: string;
  variant?: MenuVariant; // over-hero: 어두운 히어로 위 반투명 버튼 / solid: 서브 화면 헤더용
  accent?: string; // 적용된 템플릿의 포인트색 (기본 파랑)
  pastoralColumnsEnabled?: boolean; // false면 "목회 칼럼" 메뉴 항목 자체를 목록에서 뺀다
}

export function BulletinMenu({ bulletinId, churchLogo, variant = "over-hero", accent = "#2563eb", pastoralColumnsEnabled = true }: BulletinMenuProps) {
  const [open, setOpen] = useState(false); // 사용자 의도(열림/닫힘)
  const [mounted, setMounted] = useState(false); // DOM 유지 여부 (닫는 애니메이션 동안 남겨둠)
  const [show, setShow] = useState(false); // transform 구동 (열림=제자리, 닫힘=우측 밖)
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // 열 때: 마운트(우측 밖 상태로) → 다음 프레임 2번 뒤에 show=true → 브라우저가 시작 상태를
  //        먼저 그린 뒤에 트랜지션이 걸려서 "스르륵" 등장이 확실히 재생된다.
  // 닫을 때: show=false로 우측 밖으로 밀어내고 300ms 뒤 언마운트.
  useEffect(() => {
    if (open) {
      setMounted(true);
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setShow(true));
      });
      return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
    }
    setShow(false);
    if (mounted) {
      const t = setTimeout(() => setMounted(false), 420);
      return () => clearTimeout(t);
    }
  }, [open, mounted]);

  // 메뉴가 떠 있는 동안엔 뒤 화면이 스크롤되지 않게 잠근다(html·body 둘 다). 닫히면 원래대로.
  useEffect(() => {
    if (!mounted) return;
    const b = document.body.style.overflow;
    const h = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = b;
      document.documentElement.style.overflow = h;
    };
  }, [mounted]);

  const base = `/view/${bulletinId}`;

  const items: {
    key: string;
    label: string;
    sub?: string;
    icon: any;
    to?: string;
    ready: boolean;
    active?: boolean;
  }[] = [
    { key: "home", label: "홈", icon: Home, to: base, ready: true, active: pathname === base },
    { key: "about", label: "교회 소개", sub: "우리 교회 이야기", icon: Church, to: `${base}/about`, ready: true, active: pathname === `${base}/about` },
    { key: "pastor-greeting", label: "담임목사 인사말", sub: "인사말 · 연락처", icon: MessageCircleHeart, to: `${base}/pastor`, ready: true, active: pathname === `${base}/pastor` },
    { key: "team", label: "섬기시는 분", sub: "담임 목사 · 부교역자", icon: Users, to: `${base}/team`, ready: true, active: pathname === `${base}/team` },
    { key: "officers", label: "중직자", sub: "장로 · 권사 · 안수집사", icon: Landmark, to: `${base}/officers`, ready: true, active: pathname === `${base}/officers` },
    { key: "column", label: "목회 칼럼", sub: "지난 칼럼 모아보기", icon: Newspaper, to: `${base}/column`, ready: true, active: pathname === `${base}/column` },
    { key: "location", label: "오시는 길", sub: "약도 · 주소 · 길찾기", icon: MapPin, to: `${base}/location`, ready: true, active: pathname === `${base}/location` },
    { key: "history", label: "교회 연혁", icon: Clock, ready: false },
    { key: "sns", label: "교회 SNS · 유튜브 · 네이버 카페", icon: Share2, ready: false },
    { key: "org", label: "부서 · 기관 조직도", icon: Network, ready: false },
  ].filter((item) => item.key !== "column" || pastoralColumnsEnabled);

  const go = (item: (typeof items)[number]) => {
    if (!item.ready) {
      toast("준비 중인 기능이에요. 곧 열릴게요!");
      return;
    }
    setOpen(false);
    // 시트가 어느 정도 닫힌 뒤에 화면을 바꿔서 전환이 뚝 끊기지 않게 한다.
    if (item.to && item.to !== pathname) setTimeout(() => navigate(item.to!), 260);
  };

  return (
    <>
      {/* 우측 상단 메뉴 버튼 */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="메뉴 열기"
        className={`fixed top-4 right-4 z-[55] w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
          variant === "over-hero"
            ? "bg-black/35 text-white backdrop-blur-md border border-white/20 hover:bg-black/50"
            : "bg-white text-slate-700 shadow-lg border border-slate-200 hover:bg-slate-50"
        }`}
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 16px)" }}
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* 오버레이 + 우측 시트 */}
      {mounted && (
        <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true">
          <div
            className={`absolute inset-0 bg-black/50 overscroll-none transition-opacity duration-[420ms] ${show ? "opacity-100" : "opacity-0"}`}
            onClick={() => setOpen(false)}
            onTouchMove={(e) => e.preventDefault()}
          />
          <div
            className={`absolute top-0 right-0 h-full w-[82%] max-w-[340px] bg-white shadow-2xl flex flex-col transition-transform duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
              show ? "translate-x-0" : "translate-x-full"
            }`}
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 20px)" }}>
              <div className="min-w-0 flex items-center gap-2.5">
                {churchLogo ? (
                  <img src={churchLogo} alt="교회 로고" className="max-h-8 w-auto max-w-[140px] object-contain" />
                ) : (
                  <p className="text-base font-extrabold text-slate-900">메뉴</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="닫기"
                className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto py-2">
              {items.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => go(item)}
                    className={`w-full flex items-center gap-3.5 px-5 py-3.5 text-left transition-colors ${
                      item.active ? "" : "hover:bg-slate-50"
                    } ${item.ready ? "" : "opacity-55"}`}
                    style={item.active ? { backgroundColor: `${accent}12` } : undefined}
                  >
                    <span
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        item.active ? "text-white" : "bg-slate-100 text-slate-500"
                      }`}
                      style={item.active ? { backgroundColor: accent } : undefined}
                    >
                      <Icon className="w-[18px] h-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold" style={{ color: item.active ? accent : "#1e293b" }}>
                        {item.label}
                      </span>
                      {item.sub && <span className="block text-[11px] text-slate-400 font-medium mt-0.5">{item.sub}</span>}
                    </span>
                    {item.ready ? (
                      <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                    ) : (
                      <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-full">
                        <Lock className="w-2.5 h-2.5" /> 준비중
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            <p className="px-5 py-4 text-[10px] text-slate-300 font-medium border-t border-slate-100">
              STAYON 온라인 주보
            </p>
          </div>
        </div>
      )}
    </>
  );
}
