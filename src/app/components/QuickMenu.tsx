import { useEffect, useRef, useState, type ReactNode, type PointerEvent as RPointerEvent } from "react";

// 머티리얼 스타일 드롭다운 메뉴 — 메인(주보 플랫폼)·교회 홈페이지 제작 화면 우측 상단 "바로 가기", 로그인 정보(로그아웃)
//  - trigger "hover": 마우스를 올리면 열리고 벗어나면 닫힘(휴대폰은 눌러서 열고 닫음)
//  - trigger "click": 눌러서 열고, 바깥을 누르거나 Esc로 닫음
//  - 열릴 때: 오른쪽 위 기준으로 살짝 커지며 나타나고(감속 곡선), 항목이 하나씩 차례로 내려옴
//  - 항목을 누르면 물결(ripple) 효과
export type QuickMenuItem = {
  label: string;
  desc?: string;
  icon?: ReactNode;
  tone?: "blue" | "dark" | "red";
  onSelect: () => void;
};

const TONE = {
  blue: { bg: "#E8F3FF", fg: "#3182F6" },
  dark: { bg: "#F2F4F6", fg: "#191F28" },
  red: { bg: "#FFEEEE", fg: "#F04452" },
};

const EASE = "cubic-bezier(0.2, 0, 0, 1)"; // 머티리얼 3 emphasized decelerate

export function QuickMenu({ trigger = "hover", button, items, width = 248, align = "right" }: {
  trigger?: "hover" | "click";
  align?: "left" | "right"; // 메뉴를 버튼 오른쪽 끝(기본) 또는 왼쪽 끝에 맞춤
  button: (open: boolean) => ReactNode;
  items: QuickMenuItem[];
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  // 휴대폰처럼 좁은 화면에서 메뉴가 화면 밖으로 잘리지 않게 위치·너비 보정
  const [fit, setFit] = useState<{ w: number; shift: number }>({ w: width, shift: 0 });
  const wrapRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 휴대폰처럼 마우스가 없는 기기는 눌러서 여닫음
  const canHover = typeof window !== "undefined" && window.matchMedia?.("(hover: hover)").matches;
  const useHover = trigger === "hover" && canHover;

  useEffect(() => {
    if (!open || !wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const w = Math.min(width, vw - 24);
    if (align === "right") {
      const overflowLeft = 12 - (r.right - w); // 메뉴 왼쪽 끝이 화면 왼쪽 12px 안쪽으로 오도록
      setFit({ w, shift: overflowLeft > 0 ? overflowLeft : 0 });
    } else {
      const overflowRight = r.left + w - (vw - 12); // 메뉴 오른쪽 끝이 화면 오른쪽 12px 안쪽으로 오도록
      setFit({ w, shift: overflowRight > 0 ? overflowRight : 0 });
    }
  }, [open, width, align]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  const enter = () => { if (!useHover) return; if (closeTimer.current) clearTimeout(closeTimer.current); setOpen(true); };
  // 버튼과 메뉴 사이를 지나가는 동안 닫히지 않게 살짝 늦게 닫음
  const leave = () => { if (!useHover) return; closeTimer.current = setTimeout(() => setOpen(false), 140); };

  const ripple = (e: RPointerEvent<HTMLButtonElement>) => {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 2;
    const dot = document.createElement("span");
    dot.className = "qm-ripple";
    dot.style.width = dot.style.height = `${size}px`;
    dot.style.left = `${e.clientX - r.left - size / 2}px`;
    dot.style.top = `${e.clientY - r.top - size / 2}px`;
    el.appendChild(dot);
    setTimeout(() => dot.remove(), 600);
  };

  return (
    <div ref={wrapRef} className="relative" onMouseEnter={enter} onMouseLeave={leave}>
      <style>{`
        .qm-ripple{position:absolute;border-radius:9999px;background:currentColor;opacity:.14;transform:scale(0);animation:qm-ripple .6s ${EASE} forwards;pointer-events:none}
        @keyframes qm-ripple{to{transform:scale(1);opacity:0}}
      `}</style>
      <div
        role="button"
        tabIndex={-1}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => { if (!useHover) setOpen((v) => !v); else setOpen(true); }}
      >
        {button(open)}
      </div>

      {/* 메뉴 판 — 닫혀 있을 땐 투명·살짝 작게(그대로 두어 닫힐 때도 애니메이션) */}
      <div
        role="menu"
        className="absolute top-full z-[60] pt-2"
        style={{
          width: fit.w,
          ...(align === "right" ? { right: -fit.shift } : { left: -fit.shift }),
          pointerEvents: open ? "auto" : "none",
        }}
      >
        <div
          className="overflow-hidden rounded-2xl bg-white py-2"
          style={{
            boxShadow: "0 12px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)",
            transformOrigin: align === "right" ? "top right" : "top left",
            transform: open ? "translateY(0) scale(1)" : "translateY(-8px) scale(0.94)",
            opacity: open ? 1 : 0,
            transition: `transform 220ms ${EASE}, opacity 160ms ${EASE}`,
          }}
        >
          {items.map((it, i) => {
            const tone = TONE[it.tone || "dark"];
            return (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                tabIndex={open ? 0 : -1}
                onPointerDown={ripple}
                onClick={() => { setOpen(false); it.onSelect(); }}
                className="group relative flex w-full items-center gap-3 overflow-hidden px-3.5 py-2.5 text-left transition-colors hover:bg-[#F7F8FA] focus:bg-[#F7F8FA] focus:outline-none"
                style={{
                  color: tone.fg,
                  opacity: open ? 1 : 0,
                  transform: open ? "translateY(0)" : "translateY(-6px)",
                  transition: `opacity 200ms ${EASE} ${open ? 60 + i * 45 : 0}ms, transform 260ms ${EASE} ${open ? 60 + i * 45 : 0}ms, background-color 150ms`,
                }}
              >
                {it.icon && (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-110"
                    style={{ background: tone.bg, color: tone.fg }}>
                    {it.icon}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-bold text-[#191F28]" style={it.tone === "red" ? { color: tone.fg } : undefined}>{it.label}</span>
                  {it.desc && <span className="mt-0.5 block truncate text-[12px] text-[#8B95A1]">{it.desc}</span>}
                </span>
                <span className="text-[#B0B8C1] opacity-0 -translate-x-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0">›</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
