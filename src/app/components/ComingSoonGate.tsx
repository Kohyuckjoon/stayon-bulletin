import { useState, type ReactNode } from "react";
import { auth } from "../../firebase";
import { isOperatorEmail } from "../../utils/operator";

// "준비중" 화면 잠금(2026-11-24) — 종이 주보 · 수련회 설정이 같이 씀.
// locked면: 안의 화면은 보이되 흐리게 + 누르기·입력·Tab 이동 모두 막고, 위에 "스테이온에서 열심히 만드는 중이에요" 안내.
// 운영자에게만 안내 상자 안 "운영자로 계속 편집" 버튼(누르면 그 화면에서만 풀림, 새로고침하면 다시 잠김).
// children 을 함수로 주면 (previewOnly) 를 받아 잠김 여부에 따라 다르게 그릴 수 있음(예: 예시 내용 채우기)
export function ComingSoonGate({ locked, desc, children }: {
  locked: boolean;
  desc: ReactNode;
  children: ReactNode | ((previewOnly: boolean) => ReactNode);
}) {
  const isOp = isOperatorEmail(auth.currentUser?.email);
  const [opUnlocked, setOpUnlocked] = useState(false);
  const previewOnly = locked && !(isOp && opUnlocked);
  return (
    <div style={{ position: "relative" }}>
      {previewOnly && (
        <div style={{ position: "absolute", inset: 0, zIndex: 5, display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: 120 }}>
          <div style={{ position: "sticky", top: 140, background: "white", borderRadius: 20, padding: "22px 28px", boxShadow: "0 12px 40px rgba(15,23,42,0.16)", textAlign: "center", maxWidth: 360 }}>
            <p style={{ fontSize: 30, lineHeight: 1 }}>🛠️</p>
            <p style={{ marginTop: 10, fontSize: 17, fontWeight: 800, color: "#1B3A6B" }}>스테이온에서 열심히 만드는 중이에요</p>
            <p style={{ marginTop: 6, fontSize: 13, color: "#6B7280", lineHeight: 1.6 }}>{desc}</p>
            {isOp && (
              <button type="button" onClick={() => setOpUnlocked(true)} style={{ marginTop: 14, border: "1px solid #E5E7EB", background: "white", borderRadius: 999, padding: "8px 16px", fontSize: 12.5, fontWeight: 700, color: "#1B3A6B", cursor: "pointer", fontFamily: "inherit" }}>운영자로 계속 편집</button>
            )}
          </div>
        </div>
      )}
      <div aria-hidden={previewOnly}
        ref={(el) => { if (!el) return; if (previewOnly) el.setAttribute("inert", ""); else el.removeAttribute("inert"); }}
        style={previewOnly ? { opacity: 0.4, filter: "grayscale(0.4)", pointerEvents: "none", userSelect: "none", minHeight: 420 } : undefined}>
        {typeof children === "function" ? children(previewOnly) : children}
      </div>
    </div>
  );
}
