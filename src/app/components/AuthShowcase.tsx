import { useEffect, useRef, useState } from "react";
import { Smartphone, FileText, Globe, Sparkles } from "lucide-react";

// 미리보기 묶음(홈페이지 + 휴대폰)을 그려 두는 기준 크기. 실제로는 남는 공간에 맞춰 통째로 줄이거나 키움
// → 어떤 화면 크기에서도 잘리거나 문구를 가리지 않음(2026-11-13)
const STAGE_W = 616;
const STAGE_H = 452;
// 기준 묶음 안에서 이미지가 실제로 차지하는 세로 범위(휴대폰 위 끝 ~ 기울어진 홈페이지 아래 끝, 떠오르는 움직임 포함)
// → 이 범위가 화면 안에 다 들어오게 배율을 정함: 잘리지 않고 한 화면에 다 보임(2026-11-13)
const TOP_SKIP = 10;
const CONTENT_BOTTOM = 420;
// 문구 아래(이미지와의) 최소 간격(px). 문구 위(로고와의) 간격은 화면 높이의 7%(최대 84px) — 문구 위치를 더 내리려면 이 값을 키우면 됨
const MIN_GAP = 20;
const topGap = (h: number) => Math.min(84, h * 0.07);

// 로그인·회원가입 화면 왼쪽 서비스 소개(PC만) — 두 화면이 같이 씀(2026-11-13).
// 짙은 남색 + 문구(한 줄씩 떠오름·파란 줄 반짝임·밑줄) + 체크 3줄 + 실제 홈페이지·모바일 주보 화면이 떠 있음.
// 위치·크기는 여기 한 곳만 고치면 두 화면에 같이 반영됨. onHome: 왼쪽 위 STAYON 로고 눌렀을 때
export function AuthShowcase({ onHome }: { onHome: () => void }) {
  // 이미지 배율 계산(화면 크기가 바뀌면 다시 계산): 가로폭에 맞추되, 로고·문구가 들어갈 높이는 꼭 남김.
  // 이미지 영역 높이를 정한 뒤, 남은 공간(로고 ~ 이미지 사이) 한가운데에 문구가 옴(2026-11-13)
  const asideRef = useRef<HTMLElement>(null);
  const logoRef = useRef<HTMLButtonElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useEffect(() => {
    const aside = asideRef.current, logo = logoRef.current, text = textRef.current, box = boxRef.current;
    if (!aside || !logo || !text || !box) return;
    const usable = CONTENT_BOTTOM - TOP_SKIP; // 이미지가 차지하는 높이(기준 크기)
    const fit = () => {
      const padTop = parseFloat(getComputedStyle(aside).paddingTop) || 0;
      const padBottom = parseFloat(getComputedStyle(aside).paddingBottom) || 0;
      const avail = aside.clientHeight - padTop - padBottom - logo.offsetHeight - text.offsetHeight - topGap(window.innerHeight) - MIN_GAP;
      setScale(Math.max(0.3, Math.min(box.clientWidth / STAGE_W, avail / usable, 1.6)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(aside);
    ro.observe(text);
    return () => ro.disconnect();
  }, []);
  const boxH = scale * (CONTENT_BOTTOM - TOP_SKIP);
  return (
    <>
      <style>{`
        @keyframes lgFloatA{0%,100%{transform:translateY(0) rotate(-3deg)}50%{transform:translateY(-12px) rotate(-3deg)}}
        @keyframes lgFloatB{0%,100%{transform:translateY(0) rotate(4deg)}50%{transform:translateY(-16px) rotate(4deg)}}
        /* 왼쪽 문구 애니메이션(2026-11-13): 한 줄씩 아래에서 떠오름 → 파란 줄은 빛이 흐르듯 반짝 + 밑줄이 그려짐 → 체크 아이콘이 차례로 은은하게 빛남 */
        @keyframes lgRise{from{opacity:0;transform:translateY(22px);filter:blur(6px)}to{opacity:1;transform:translateY(0);filter:blur(0)}}
        @keyframes lgShine{0%{background-position:200% 0}100%{background-position:-200% 0}}
        @keyframes lgUnderline{from{transform:scaleX(0)}to{transform:scaleX(1)}}
        @keyframes lgGlow{0%,70%,100%{box-shadow:0 0 0 0 rgba(110,168,255,0);background:rgba(255,255,255,.1)}35%{box-shadow:0 0 0 6px rgba(110,168,255,.18);background:rgba(110,168,255,.28)}}
        .lg-shine{background:linear-gradient(100deg,#6EA8FF 0%,#6EA8FF 40%,#E3EEFF 50%,#6EA8FF 60%,#6EA8FF 100%);background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:lgShine 4.5s linear 1.4s infinite}

      `}</style>
      {/* 왼쪽: 서비스 소개(PC만) — 짙은 남색 + 실제 홈페이지·주보 화면이 은은하게 떠 있음 */}
      {/* 화면 높이에 고정(sticky): 오른쪽 폼이 길어져도(회원가입) 왼쪽은 항상 한 화면 안에 다 보임 */}
      <aside ref={asideRef} className="relative hidden lg:flex lg:sticky lg:top-0 lg:h-screen flex-col overflow-hidden bg-[#0F1B33] px-14 pt-[min(48px,5vh)] pb-[min(28px,3vh)] text-white">
        <div className="pointer-events-none absolute -top-24 -left-24 h-80 w-80 rounded-full bg-[#3182F6]/25 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-96 w-96 rounded-full bg-indigo-500/20 blur-3xl" />
        <button ref={logoRef} type="button" onClick={onHome} className="relative flex shrink-0 items-center gap-2.5 w-fit">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10"><Smartphone className="h-5 w-5" /></span>
          <span className="flex flex-col items-start leading-none">
            <span className="text-lg font-black tracking-tight">STAYON</span>
            <span className="mt-1 text-[10px] font-bold tracking-widest text-blue-300">JUBO · WEBSITE</span>
          </span>
        </button>
        {/* 문구: 위 로고와 아래 이미지 사이 한가운데(flex-1 + 가운데 정렬). 글자 크기는 화면 높이에 따라 조금씩 줄어듦 */}
        <div className="relative flex min-h-0 flex-1 flex-col justify-center pt-[min(84px,7vh)] pb-5">
        <div ref={textRef}>
          <h2 className="text-[clamp(28px,3.4vh,38px)] font-black leading-[1.2] tracking-tight">
            <span className="block" style={{ animation: "lgRise .8s cubic-bezier(.2,0,0,1) .1s both" }}>주보부터 홈페이지까지,</span>
            <span className="relative inline-block" style={{ animation: "lgRise .8s cubic-bezier(.2,0,0,1) .35s both" }}>
              <span className="lg-shine">우리 교회를 한 곳에서</span>
              {/* 밑줄이 왼쪽에서 오른쪽으로 그려짐 */}
              <span className="absolute left-0 -bottom-1 h-[6px] w-full origin-left rounded-full bg-[#3182F6]/40" style={{ animation: "lgUnderline .9s cubic-bezier(.2,0,0,1) 1s both" }} />
            </span>
          </h2>
          <ul className="mt-[min(32px,3vh)] space-y-[min(14px,1.4vh)]">
            {[
              [FileText, "모바일 주보 무제한 발행"],
              [Globe, "교회 홈페이지 함께 운영(연동)"],
              [Sparkles, "가성비 요금 · 쉬운 관리"],
            ].map(([Icon, t], i) => {
              const I = Icon as typeof FileText;
              return (
                <li key={t as string} className="group flex w-fit items-center gap-3 text-[16px] font-semibold text-white/90 transition-transform hover:translate-x-1.5 animate-in fade-in slide-in-from-left-3 fill-mode-both duration-500" style={{ animationDelay: `${900 + i * 140}ms` }}>
                  {/* 아이콘이 하나씩 차례로 은은하게 빛남(3개가 번갈아 6초 주기) */}
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 transition-transform duration-300 group-hover:scale-110"
                    style={{ animation: `lgGlow 6s ease-in-out ${1.8 + i * 2}s infinite` }}><I className="h-4 w-4 text-[#6EA8FF]" /></span>
                  {t as string}
                </li>
              );
            })}
          </ul>
        </div>
        </div>
        {/* 떠 있는 미리보기: 홈페이지(왼쪽 기준) + 휴대폰 주보(오른쪽 기준) — 기준 크기 묶음을 배율(scale)로 맞춰 넣음.
            위치·크기를 바꾸려면 아래 기준 묶음(616×452) 안의 left/top/width 값을 고치면 됨 */}
        <div ref={boxRef} className="relative w-full shrink-0" style={{ height: boxH }}>
          <div className="absolute left-0 origin-top-left" style={{ top: -TOP_SKIP * scale, width: STAGE_W, height: STAGE_H, transform: `scale(${scale})`, opacity: scale ? 1 : 0, transition: "opacity .3s" }}>
            <div className="absolute left-0 top-[100px] w-[476px] overflow-hidden rounded-2xl bg-white shadow-2xl shadow-black/40" style={{ animation: "lgFloatA 7s ease-in-out infinite" }}>
              <div className="flex items-center gap-1.5 px-3 py-2 border-b border-gray-100">
                <span className="h-2 w-2 rounded-full bg-red-400" /><span className="h-2 w-2 rounded-full bg-amber-400" /><span className="h-2 w-2 rounded-full bg-emerald-400" />
                <span className="ml-2 truncate text-[10px] text-gray-400 font-mono">stay.stayon-platform.com</span>
              </div>
              <img src="/homePageSample.jpg" alt="" className="block w-full aspect-[1222/700] object-cover object-top" />
            </div>
          </div>
          {/* 휴대폰은 따로 오른쪽 끝 기준으로 붙임(2026-11-13) — 화면이 넓든 좁든 홈페이지는 왼쪽, 휴대폰은 오른쪽에 치우쳐 보임 */}
          <div className="absolute right-0 origin-top-right" style={{ top: -TOP_SKIP * scale, width: STAGE_W, height: STAGE_H, transform: `scale(${scale})`, opacity: scale ? 1 : 0, transition: "opacity .3s" }}>
            {/* 실제 폰처럼(2026-11-13): 얇은 금속 테두리(1.5px) + 얇은 검은 베젤(4px) + 다이내믹 아일랜드 + 옆 버튼 */}
            <div className="absolute right-[10px] top-[30px] w-[196px] rounded-[32px] p-[1.5px] shadow-2xl shadow-black/50"
              style={{ animation: "lgFloatB 8s ease-in-out infinite", background: "linear-gradient(145deg,#6b7280 0%,#2b2f36 30%,#1a1d22 60%,#5b616b 100%)" }}>
              {/* 옆 버튼: 왼쪽 동작 버튼·음량 2개, 오른쪽 전원 */}
              <span className="absolute -left-[2px] top-[68px] h-[16px] w-[2px] rounded-l-sm bg-[#3a3f47]" />
              <span className="absolute -left-[2px] top-[96px] h-[28px] w-[2px] rounded-l-sm bg-[#3a3f47]" />
              <span className="absolute -left-[2px] top-[130px] h-[28px] w-[2px] rounded-l-sm bg-[#3a3f47]" />
              <span className="absolute -right-[2px] top-[104px] h-[42px] w-[2px] rounded-r-sm bg-[#3a3f47]" />
              <div className="relative rounded-[30.5px] bg-black p-[4px]">
                {/* 실제 성도 모바일 주보 화면(지금 쓰는 주보 디자인 캡처 — public/login_phone.jpeg, 1206×2296 고해상도) */}
                <div className="relative overflow-hidden rounded-[27px] bg-white aspect-[334/616]">
                  <img src="/login_phone.jpeg" alt="스테이온 모바일 주보 화면" className="block h-full w-full object-cover object-top" />
                  {/* 다이내믹 아일랜드 */}
                  <span className="absolute left-1/2 top-[7px] h-[17px] w-[56px] -translate-x-1/2 rounded-full bg-black" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
