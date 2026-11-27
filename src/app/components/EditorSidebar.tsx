import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

// 편집 화면 공통 사이드바 부품(2026-11-24) — 홈페이지 편집(/website-builder)과 주보 편집(/admin 주보 수정)이 같이 씀.
// 한쪽에서 고치면 두 화면 모양·움직임이 같이 바뀜.
//  - SlidingTabs: 선택 표시(남색 알약)가 누른 탭으로 스르륵 미끄러짐. vertical이면 사이드바용 세로 배치
//  - SidebarItem: 사이드바 큰 메뉴(아이콘 · 이름 · 작은 부제, 준비중 잠금)
//  - SidebarCollapse: 큰 메뉴 아래 하위 메뉴를 부드럽게 펼치고/접음
export const SIDEBAR_COLORS = { navy: "#1B3A6B", muted: "#6B7280", sky: "#3182F6" };

export type SidebarTab = { key: string; label: string };

// 화면 폭이 좁아 가로 탭이 두 줄로 접혀도 위치·크기를 실제 버튼에서 재서 맞춤
export function SlidingTabs({ tabs, active, onChange, vertical }: { tabs: SidebarTab[]; active: string; onChange: (key: string) => void; vertical?: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [pill, setPill] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const b = btnRefs.current[active];
      setPill(b ? { left: b.offsetLeft, top: b.offsetTop, width: b.offsetWidth, height: b.offsetHeight } : null);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [active, tabs.length]);

  const ease = "0.32s cubic-bezier(0.22, 1, 0.36, 1)";
  return (
    <div ref={wrapRef} style={{ position: "relative", display: "flex", flexDirection: vertical ? "column" : "row", gap: 4, flexWrap: vertical ? "nowrap" : "wrap", background: "#F3F4F6", borderRadius: 12, padding: 4, marginBottom: vertical ? 0 : 24 }}>
      {pill && (
        <span aria-hidden style={{
          position: "absolute", left: pill.left, top: pill.top, width: pill.width, height: pill.height,
          background: SIDEBAR_COLORS.navy, borderRadius: 9, boxShadow: "0 4px 12px rgba(27,58,107,0.28)",
          transition: `left ${ease}, top ${ease}, width ${ease}, height ${ease}`,
        }} />
      )}
      {tabs.map((tab) => {
        const on = tab.key === active;
        return (
          <button
            key={tab.key}
            type="button"
            ref={(el) => { btnRefs.current[tab.key] = el; }}
            onClick={() => onChange(tab.key)}
            className="active:scale-[0.97]"
            style={{
              position: "relative", zIndex: 1, flex: vertical ? "none" : "1 1 100px",
              background: "transparent", border: "none", borderRadius: 9,
              padding: vertical ? "12px 16px" : "10px 8px", fontFamily: "inherit", fontSize: vertical ? 14 : 13,
              textAlign: vertical ? "left" : "center",
              fontWeight: on ? 700 : 500,
              color: on ? "white" : SIDEBAR_COLORS.muted,
              cursor: "pointer",
              transition: "color 0.25s, transform 0.1s",
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

// locked: 회색·반투명 + 자물쇠 표시 / blocked: 눌러도 안 열림(운영자처럼 잠겨도 열 수 있으면 blocked=false)
export function SidebarItem({ icon, label, sub, subColor, subTitle, on, locked, blocked, title, onClick }: {
  icon: ReactNode; label: string; sub?: string; subColor?: string; subTitle?: string;
  on: boolean; locked?: boolean; blocked?: boolean; title?: string; onClick: () => void;
}) {
  const dim = locked && !on;
  return (
    <button type="button" disabled={blocked} title={title} onClick={() => { if (!blocked) onClick(); }} className={blocked ? undefined : "active:scale-[0.98]"}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 8, textAlign: "left", border: "none", borderRadius: 12, padding: "12px 14px", fontFamily: "inherit",
        cursor: blocked ? "not-allowed" : "pointer", opacity: dim ? 0.45 : 1, filter: dim ? "grayscale(1)" : "none",
        background: on ? "white" : "transparent", boxShadow: on ? "0 1px 4px rgba(0,0,0,.08)" : "none", transition: "background 0.2s, box-shadow 0.2s, transform 0.1s",
      }}>
      <span style={{ fontSize: 17, display: "inline-flex", alignItems: "center" }}>{icon}</span>
      <span style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 14.5, fontWeight: 800, color: on ? SIDEBAR_COLORS.navy : SIDEBAR_COLORS.muted }}>{label}</span>
        {sub && <span title={subTitle} style={{ fontSize: 11, fontWeight: subColor ? 700 : 600, color: subColor || SIDEBAR_COLORS.muted, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</span>}
      </span>
      {locked && (
        <svg aria-label="잠김" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke={SIDEBAR_COLORS.muted} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
      )}
    </button>
  );
}

// 높이가 부드럽게 펼쳐지고/접힘(grid 0fr↔1fr)
export function SidebarCollapse({ open, children }: { open: boolean; children: ReactNode }) {
  const ease = "0.38s cubic-bezier(0.22, 1, 0.36, 1)";
  return (
    <div aria-hidden={!open} style={{ display: "grid", gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0, transition: `grid-template-rows ${ease}, opacity 0.28s ease` }}>
      <div style={{ minHeight: 0, overflow: "hidden" }}>
        <div style={{ paddingTop: 8, paddingLeft: 10, transform: open ? "translateY(0)" : "translateY(-6px)", transition: `transform ${ease}` }}>
          {children}
        </div>
      </div>
    </div>
  );
}
