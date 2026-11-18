import type { CSSProperties, ReactNode } from "react";
import type { PaperJubo, PjBlock, PjPage } from "./types";

// 종이 주보 한 장(A4 가로 297 × 210mm)을 그림. 인쇄 창에서도 똑같이 나오도록 스타일은 전부 인라인(mm·pt 단위).
// 바깥면 = [4면 | 1면], 안쪽면 = [2면 | 3면]
export const SHEET_W_MM = 297;
export const SHEET_H_MM = 210;

const FONT_CLASSIC = "'Noto Serif KR', 'Nanum Myeongjo', serif";
const FONT_MODERN = "'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";
export const PAPER_FONTS_HREF = "https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;900&family=Noto+Serif+KR:wght@400;700;900&display=swap";

// guide: 가운데 접는 선(화면 미리보기에만, 인쇄할 때는 false)
export function PaperSheet({ jubo, side, guide = true }: { jubo: PaperJubo; side: "outside" | "inside"; guide?: boolean }) {
  const [left, right] = side === "outside" ? [3, 0] : [1, 2];
  return (
    <div style={{ width: `${SHEET_W_MM}mm`, height: `${SHEET_H_MM}mm`, display: "flex", background: "#fff", boxSizing: "border-box", overflow: "hidden" }}>
      <Panel jubo={jubo} page={jubo.pages[left]} pageNo={left + 1} />
      {guide && <div style={{ width: 0, borderLeft: "0.2mm dashed #d1d5db" }} />}
      <Panel jubo={jubo} page={jubo.pages[right]} pageNo={right + 1} />
    </div>
  );
}

function Panel({ jubo, page, pageNo }: { jubo: PaperJubo; page: PjPage; pageNo: number }) {
  const classic = jubo.template === "classic";
  const isCover = page.blocks.length === 1 && page.blocks[0].type === "cover";
  const frame: CSSProperties = classic && !isCover ? { border: "0.5mm solid #111", padding: "4mm" } : { padding: "4mm" };
  return (
    <div style={{ width: `${SHEET_W_MM / 2}mm`, height: `${SHEET_H_MM}mm`, padding: "7mm", boxSizing: "border-box", fontFamily: classic ? FONT_CLASSIC : FONT_MODERN, color: "#111", fontSize: "8.4pt", lineHeight: 1.5 }}>
      {/* 2단: 칸마다 정한 왼쪽/오른쪽 단(col)으로 나눔 — PDF 내려받기(화면 캡처)가 CSS 자동 단 나눔을 못 그려서 직접 나눔(2026-11-17) */}
      <div style={{ ...frame, height: "100%", boxSizing: "border-box", overflow: "hidden", display: "flex", gap: "5mm" }}>
        {page.columns === 2 ? (
          <>
            <div style={{ flex: 1, minWidth: 0 }}>{page.blocks.filter((b) => b.col !== 2).map((b) => <Block key={b.id} jubo={jubo} b={b} />)}</div>
            {classic && <div style={{ width: 0, borderLeft: "0.3mm solid #111" }} />}
            <div style={{ flex: 1, minWidth: 0 }}>{page.blocks.filter((b) => b.col === 2).map((b) => <Block key={b.id} jubo={jubo} b={b} />)}</div>
          </>
        ) : (
          <div style={{ flex: 1, minWidth: 0, height: isCover ? "100%" : undefined }}>{page.blocks.map((b) => <Block key={b.id} jubo={jubo} b={b} />)}</div>
        )}
        {page.blocks.length === 0 && <p style={{ flex: 1, color: "#9ca3af", textAlign: "center", marginTop: "40mm" }}>{pageNo}면 — 칸을 추가해 주세요</p>}
      </div>
    </div>
  );
}

function Title({ jubo, title, subtitle }: { jubo: PaperJubo; title: string; subtitle?: string }) {
  if (!title && !subtitle) return null;
  if (jubo.template === "classic") {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "2mm", marginBottom: "2mm" }}>
        <span style={{ display: "inline-block", minWidth: 0, whiteSpace: "nowrap", border: "0.3mm solid #111", background: "#e5e7eb", padding: "0.6mm 2.5mm", fontWeight: 900, fontSize: "10pt", letterSpacing: "0.06em" }}>{title}</span>
        {subtitle && <span style={{ flexShrink: 0, whiteSpace: "nowrap", fontSize: "8pt", fontWeight: 700 }}>{subtitle}</span>}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "2mm", borderBottom: `0.6mm solid ${jubo.color}`, paddingBottom: "1mm", marginBottom: "2mm" }}>
      <span style={{ fontWeight: 900, fontSize: "11pt", color: jubo.color }}>{title}</span>
      {subtitle && <span style={{ flexShrink: 0, whiteSpace: "nowrap", fontSize: "8pt", fontWeight: 700, color: "#4b5563" }}>{subtitle}</span>}
    </div>
  );
}

function Block({ jubo, b }: { jubo: PaperJubo; b: PjBlock }) {
  const wrap: CSSProperties = { breakInside: "avoid", marginBottom: "4mm" };
  if (b.type === "cover" && b.cover) return <Cover jubo={jubo} b={b} />;
  let body: ReactNode = null;
  if (b.type === "list") {
    const items = (b.items || []).filter((x) => x.trim());
    body = (
      <div>
        {items.map((it, i) => (
          <div key={i} style={{ display: "flex", gap: "1.5mm", marginBottom: "0.8mm" }}>
            {b.marker !== "none" && <span style={{ flexShrink: 0, fontWeight: 700, color: jubo.template === "modern" ? jubo.color : "#111" }}>{b.marker === "number" ? `${i + 1}.` : "♠"}</span>}
            <span style={{ whiteSpace: "pre-wrap" }}>{it}</span>
          </div>
        ))}
      </div>
    );
  } else if (b.type === "order") {
    body = (
      <div>
        {b.note && <p style={{ textAlign: "right", margin: "0 0 1.5mm", fontSize: "8pt" }}>{b.note}</p>}
        {(b.rows || []).filter((r) => r.label || r.value).map((r, i) => (
          <div key={i} style={{ display: "flex", alignItems: "baseline", gap: "1mm", marginBottom: "0.7mm" }}>
            <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{r.label}</span>
            <span style={{ flex: 1, borderBottom: "0.3mm dotted #6b7280", transform: "translateY(-0.8mm)" }} />
            <span style={{ whiteSpace: "nowrap" }}>{r.value}</span>
          </div>
        ))}
      </div>
    );
  } else if (b.type === "kv") {
    body = (
      <div style={{ display: "grid", gridTemplateColumns: "max-content 1fr", columnGap: "3mm", rowGap: "0.7mm" }}>
        {(b.rows || []).filter((r) => r.label || r.value).map((r, i) => [
          <span key={`l${i}`} style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{r.label}</span>,
          <span key={`v${i}`}>{r.value}</span>,
        ])}
      </div>
    );
  } else if (b.type === "text") {
    body = <p style={{ margin: 0, whiteSpace: "pre-wrap", textAlign: "justify" }}>{b.text}</p>;
  }
  return (
    <div style={wrap}>
      <Title jubo={jubo} title={b.title} subtitle={b.subtitle} />
      {body}
    </div>
  );
}

function Cover({ jubo, b }: { jubo: PaperJubo; b: PjBlock }) {
  const c = b.cover!;
  const classic = jubo.template === "classic";
  const accent = classic ? "#111" : jubo.color;
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", border: classic ? "0.5mm solid #111" : "none", padding: classic ? "5mm" : "2mm", boxSizing: "border-box" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "8pt" }}>
        <span>{c.founded}</span><span>{c.issue}</span><span>{c.date}</span>
      </div>
      <div style={{ marginTop: "8mm", textAlign: "center" }}>
        {c.motto && <p style={{ margin: 0, fontSize: "13pt", fontWeight: 900, color: accent }}>{c.motto}</p>}
        {c.slogan && <p style={{ margin: "3mm 0 0", fontSize: "11pt", fontWeight: 700 }}>{c.slogan}</p>}
        {c.verse && <p style={{ margin: "3mm 0 0", fontSize: "8.5pt" }}>“{c.verse}”{c.verseRef && <span style={{ display: "block", textAlign: "right", marginTop: "1mm" }}>({c.verseRef})</span>}</p>}
      </div>
      {c.lines.filter((x) => x.trim()).length > 0 && (
        <div style={{ margin: "6mm auto 0", fontSize: "9.5pt", fontWeight: 700, lineHeight: 1.9 }}>
          {c.lines.filter((x) => x.trim()).map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}
      {c.imageUrl
        ? <div style={{ flex: 1, margin: "5mm 0", minHeight: 0, backgroundImage: `url('${c.imageUrl}')`, backgroundSize: "cover", backgroundPosition: "center", borderRadius: classic ? 0 : "3mm" }} />
        : <div style={{ flex: 1 }} />}
      <div style={{ textAlign: "center" }}>
        {c.denomination && <p style={{ margin: 0, fontSize: "9pt", fontWeight: 700, letterSpacing: "0.3em" }}>{c.denomination}</p>}
        {c.churchName && <p style={{ margin: "1mm 0 0", fontSize: "24pt", fontWeight: 900, letterSpacing: "0.25em", color: accent }}>{c.churchName}</p>}
        {c.englishName && <p style={{ margin: "0.5mm 0 0", fontSize: "8pt", fontWeight: 700, letterSpacing: "0.08em" }}>{c.englishName}</p>}
        {c.pastor && <p style={{ margin: "2mm 0 0", fontSize: "10pt", fontWeight: 700 }}>{c.pastor}</p>}
        {c.phone && <p style={{ margin: "1mm 0 0", fontSize: "8.5pt", fontWeight: 700 }}>☎ {c.phone}</p>}
        {c.address && <p style={{ margin: "1mm 0 0", fontSize: "8pt" }}>{c.address}</p>}
        {c.email && <p style={{ margin: "0.5mm 0 0", fontSize: "8pt" }}>email : {c.email}</p>}
      </div>
    </div>
  );
}
