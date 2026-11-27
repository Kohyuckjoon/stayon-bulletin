import { useRef, useState } from "react";

// 사진 "보일 부분" 고르기(2026-11-25) — 틀(가로:세로 비율)에 꽉 차게 잘린 사진을 손가락/마우스로 끌어서
// 틀 안에 보일 부분을 정함. 값은 CSS object-position("50% 30%")으로 저장하고, 성도 화면도 같은 값을 씀.
// 사진이 틀보다 넘치는 방향으로만 움직임(가로로 긴 사진은 좌우, 세로로 긴 사진은 위아래)
const parse = (v: string) => {
  const m = /^(\d+(?:\.\d+)?)% (\d+(?:\.\d+)?)%$/.exec(v || "");
  return m ? { x: Number(m[1]), y: Number(m[2]) } : { x: 50, y: 50 };
};
const clamp = (n: number) => Math.min(100, Math.max(0, n));

export function ImageFocusPicker({ src, value, onChange, ratio = 4 / 5, label }: {
  src: string; value: string; onChange: (v: string) => void; ratio?: number; label?: string;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [drag, setDrag] = useState(false);
  const start = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const pos = parse(value);

  // 틀 크기 대비 사진이 넘치는 픽셀(object-fit: cover 기준)
  const overflow = () => {
    const el = frame.current;
    if (!el || !nat) return { ox: 0, oy: 0 };
    const fw = el.clientWidth, fh = el.clientHeight;
    const scale = Math.max(fw / nat.w, fh / nat.h);
    return { ox: nat.w * scale - fw, oy: nat.h * scale - fh };
  };

  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    start.current = { px: e.clientX, py: e.clientY, x: pos.x, y: pos.y };
    setDrag(true);
  };
  const onMove = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s) return;
    const { ox, oy } = overflow();
    // 사진을 아래로 끌면 사진 윗부분이 보여야 함 → 위치 값은 반대로 줄어듦
    const x = ox > 1 ? clamp(s.x - ((e.clientX - s.px) / ox) * 100) : 50;
    const y = oy > 1 ? clamp(s.y - ((e.clientY - s.py) / oy) * 100) : 50;
    onChange(`${Math.round(x)}% ${Math.round(y)}%`);
  };
  const onUp = () => { start.current = null; setDrag(false); };

  const { ox, oy } = overflow();
  const hint = !nat ? "" : oy > 1 ? "위아래로 끌어서 보일 부분을 고르세요" : ox > 1 ? "좌우로 끌어서 보일 부분을 고르세요" : "사진이 틀에 딱 맞아서 움직일 필요가 없어요";

  return (
    <div>
      {label && <p style={{ fontSize: 13, fontWeight: 700, color: "#1E293B", marginBottom: 8 }}>{label}</p>}
      <div ref={frame}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        style={{ position: "relative", width: "100%", maxWidth: 280, aspectRatio: String(ratio), borderRadius: 16, overflow: "hidden",
          cursor: drag ? "grabbing" : "grab", touchAction: "none", userSelect: "none", background: "#F1F5F9",
          boxShadow: drag ? "0 0 0 3px #3B82F6" : "0 0 0 1px #E2E8F0", transition: "box-shadow .15s" }}>
        <img src={src} alt="" draggable={false}
          onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: `${pos.x}% ${pos.y}%`, pointerEvents: "none", display: "block" }} />
        {!drag && nat && (ox > 1 || oy > 1) && (
          <span style={{ position: "absolute", left: "50%", bottom: 10, transform: "translateX(-50%)", whiteSpace: "nowrap",
            background: "rgba(15,23,42,.72)", color: "white", fontSize: 12, fontWeight: 700, padding: "6px 10px", borderRadius: 999 }}>
            {oy > 1 ? "↕" : "↔"} 끌어서 위치 조정
          </span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "#64748B" }}>{hint}</span>
        {value && value !== "50% 50%" && (
          <button type="button" onClick={() => onChange("50% 50%")}
            style={{ fontSize: 12, color: "#64748B", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0 }}>가운데로</button>
        )}
      </div>
    </div>
  );
}
