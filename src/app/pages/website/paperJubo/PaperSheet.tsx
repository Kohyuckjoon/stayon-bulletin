import type { CSSProperties, ReactNode } from "react";
import type { PaperJubo, PjBlock, PjCover, PjPage } from "./types";
import { px, themeOf, type PjTheme } from "./themes";

// 종이 주보 한 장(A4 가로 297 × 210mm)을 그림. 인쇄 창·PDF에서도 똑같이 나오도록 스타일은 전부 인라인(mm·pt 단위).
// 바깥면 = [4면 | 1면], 안쪽면 = [2면 | 3면]
// 디자인 테마 7종(2026-11-24, themes.ts): 칸 제목 모양·글꼴·포인트 색·표지 배치가 테마마다 다름. 내용은 그대로.
export const SHEET_W_MM = 297;
export const SHEET_H_MM = 210;

export const PAPER_FONTS_HREF = "https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&family=Noto+Serif+KR:wght@400;600;700;900&family=IBM+Plex+Sans+KR:wght@400;500;700&display=swap";
// PDF 만들 때 미리 받아 둘 글꼴(이름, 굵기들)
export const PAPER_FONT_FACES: [string, string[]][] = [
  ["Noto Serif KR", ["400", "600", "700", "900"]], ["Noto Sans KR", ["400", "500", "700", "900"]], ["IBM Plex Sans KR", ["400", "500", "700"]],
];

type Ctx = { jubo: PaperJubo; t: PjTheme; a: string; guide: boolean };

// guide: 가운데 접는 선·빈 사진 자리 안내(화면 미리보기에만, 인쇄·PDF는 false)
export function PaperSheet({ jubo, side, guide = true }: { jubo: PaperJubo; side: "outside" | "inside"; guide?: boolean }) {
  const t = themeOf(jubo.template);
  const ctx: Ctx = { jubo, t, a: jubo.color || t.accent, guide };
  const [left, right] = side === "outside" ? [3, 0] : [1, 2];
  return (
    <div style={{ width: `${SHEET_W_MM}mm`, height: `${SHEET_H_MM}mm`, display: "flex", background: "#fff", boxSizing: "border-box", overflow: "hidden" }}>
      <Panel ctx={ctx} page={jubo.pages[left]} pageNo={left + 1} />
      {guide && <div style={{ width: 0, borderLeft: "0.2mm dashed #d1d5db" }} />}
      <Panel ctx={ctx} page={jubo.pages[right]} pageNo={right + 1} />
    </div>
  );
}

function Panel({ ctx, page, pageNo }: { ctx: Ctx; page: PjPage; pageNo: number }) {
  const { jubo, t, a } = ctx;
  const isCover = page.blocks.length === 1 && page.blocks[0].type === "cover";
  const base: CSSProperties = { width: `${SHEET_W_MM / 2}mm`, height: `${SHEET_H_MM}mm`, boxSizing: "border-box", fontFamily: t.font, color: t.ink, fontSize: "8.6pt", lineHeight: 1.55, overflow: "hidden" };
  if (isCover) return <div style={base}><Cover ctx={ctx} c={page.blocks[0].cover!} /></div>;
  const churchName = jubo.pages[0]?.blocks.find((b) => b.type === "cover")?.cover?.churchName || "";
  return (
    <div style={{ ...base, padding: `${px(40)} ${px(40)} ${px(28)}`, display: "flex", flexDirection: "column" }}>
      {/* 2단: 칸마다 정한 왼쪽/오른쪽 단(col)으로 나눔 — PDF 내려받기(화면 캡처)가 CSS 자동 단 나눔을 못 그려서 직접 나눔(2026-11-17) */}
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", gap: px(20) }}>
        {page.columns === 2 ? (
          <>
            <div style={{ flex: 1, minWidth: 0 }}>{page.blocks.filter((b) => b.col !== 2).map((b) => <Block key={b.id} ctx={ctx} b={b} />)}</div>
            {t.id === "classic" && <div style={{ width: 0, borderLeft: `0.3mm solid ${a}` }} />}
            <div style={{ flex: 1, minWidth: 0 }}>{page.blocks.filter((b) => b.col === 2).map((b) => <Block key={b.id} ctx={ctx} b={b} />)}</div>
          </>
        ) : (
          <div style={{ flex: 1, minWidth: 0 }}>{page.blocks.map((b) => <Block key={b.id} ctx={ctx} b={b} />)}</div>
        )}
        {page.blocks.length === 0 && <p style={{ flex: 1, color: "#9ca3af", textAlign: "center", marginTop: "40mm" }}>{pageNo}면 — 칸을 추가해 주세요</p>}
      </div>
      {/* 아래쪽: 면 번호 | ○○교회 주보 */}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "8pt", color: t.muted, paddingTop: px(8) }}>
        <span>{pageNo}</span><span>{churchName ? `${churchName} 주보` : ""}</span>
      </div>
    </div>
  );
}

function Title({ ctx, title, subtitle }: { ctx: Ctx; title: string; subtitle?: string }) {
  const { t, a } = ctx;
  if (!title && !subtitle) return null;
  const color = t.titleInk ? (t.id === "charcoal" ? "#2B2B2B" : t.ink) : a;
  const font = t.titleFont || t.font;
  const sub = subtitle ? <span style={{ flexShrink: 0, whiteSpace: "nowrap", fontSize: "8pt", fontWeight: 700, color: t.muted, letterSpacing: 0 }}>{subtitle}</span> : null;
  const mb: CSSProperties = { marginBottom: px(6) };
  switch (t.title) {
    case "double": // 위 굵은 줄 + 아래 가는 줄, 가운데 글씨(01 클래식)
      return (
        <div style={{ ...mb, display: "flex", alignItems: "center", justifyContent: "center", gap: "2mm", fontFamily: font, fontWeight: 700, fontSize: "9.75pt", letterSpacing: px(2), color, borderTop: `${px(2)} solid ${color}`, borderBottom: `${px(1)} solid ${color}`, padding: `${px(4)} 0`, textAlign: "center" }}>
          <span>{title}</span>{sub}
        </div>
      );
    case "pill": // 포인트 색 알약(05 딥그린 아치)
      return (
        <div style={{ ...mb, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "2mm" }}>
          <span style={{ fontFamily: font, fontWeight: 700, fontSize: "10.5pt", color: "#fff", background: a, borderRadius: 999, padding: `${px(3)} ${px(14)}`, whiteSpace: "nowrap" }}>{title}</span>{sub}
        </div>
      );
    case "spaced": // 작은 회색 글씨, 자간 넓게(03 미니멀)
      return (
        <div style={{ ...mb, display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "2mm", fontFamily: font, fontWeight: 500, fontSize: "9pt", letterSpacing: px(3), color: t.muted }}>
          <span>{title}</span>{sub}
        </div>
      );
    case "plain": // 포인트 색 굵은 글씨만(19 스트라이프)
      return (
        <div style={{ ...mb, display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "2mm", fontFamily: font, fontWeight: 700, fontSize: "10.5pt", color }}>
          <span>{title}</span>{sub}
        </div>
      );
    case "bar": // 포인트 색 글씨 + 굵은 밑줄(02 네이비)
    case "thin": // 가는 밑줄(11 차콜 · 20 사진)
    default:
      return (
        <div style={{ ...mb, display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "2mm", fontFamily: font, fontWeight: 700, fontSize: "10.5pt", color, borderBottom: `${px(t.title === "bar" ? 2 : 1)} solid ${color}`, paddingBottom: px(4) }}>
          <span>{title}</span>{sub}
        </div>
      );
  }
}

function Block({ ctx, b }: { ctx: Ctx; b: PjBlock }) {
  const { t, a } = ctx;
  const wrap: CSSProperties = { breakInside: "avoid", marginBottom: px(16) };
  const numColor = t.id === "classic" ? t.ink : a;
  let body: ReactNode = null;
  if (b.type === "list") {
    const items = (b.items || []).filter((x) => x.trim());
    body = (
      <div>
        {items.map((it, i) => (
          <div key={i} style={{ display: "flex", gap: px(6), marginBottom: px(3) }}>
            {b.marker !== "none" && <span style={{ flexShrink: 0, minWidth: b.marker === "number" ? px(14) : undefined, fontWeight: 700, color: b.marker === "number" ? numColor : t.ink }}>{b.marker === "number" ? `${i + 1}.` : "·"}</span>}
            <span style={{ whiteSpace: "pre-wrap" }}>{it}</span>
          </div>
        ))}
      </div>
    );
  } else if (b.type === "order") {
    body = (
      <div>
        {b.note && <p style={{ textAlign: "right", margin: `0 0 ${px(5)}`, fontSize: "8pt", color: t.muted }}>{b.note}</p>}
        {(b.rows || []).filter((r) => r.label || r.value).map((r, i) => (
          <div key={i} style={{ display: "flex", alignItems: "baseline", gap: "1mm", marginBottom: px(3) }}>
            <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{r.label}</span>
            <span style={{ flex: 1, borderBottom: `0.3mm dotted ${t.muted}`, transform: "translateY(-0.8mm)" }} />
            <span style={{ whiteSpace: "nowrap" }}>{r.value}</span>
          </div>
        ))}
      </div>
    );
  } else if (b.type === "kv") {
    // 항목 : 내용 — 시안의 "섬기는 이"처럼 줄마다 옅은 밑줄
    body = (
      <div>
        {(b.rows || []).filter((r) => r.label || r.value).map((r, i) => (
          <div key={i} style={{ display: "flex", gap: px(12), borderBottom: `${px(1)} solid ${t.line}`, padding: `${px(3)} 0` }}>
            <span style={{ flexShrink: 0, fontWeight: 700, whiteSpace: "nowrap" }}>{r.label}</span>
            <span style={{ flex: 1, minWidth: 0, textAlign: "right" }}>{r.value}</span>
          </div>
        ))}
      </div>
    );
  } else if (b.type === "text") {
    body = <p style={{ margin: 0, whiteSpace: "pre-wrap", textAlign: "justify" }}>{b.text}</p>;
  }
  return (
    <div style={wrap}>
      <Title ctx={ctx} title={b.title} subtitle={b.subtitle} />
      {body}
    </div>
  );
}

// ── 표지 ────────────────────────────────────────────────────────────────
// 표어 "교회비전 : “예배로 하나 되는 교회”" → 작은 이름표(교회비전) + 큰 글(예배로 하나 되는 교회)
function splitMotto(m: string): { label: string; main: string } {
  const unq = (s: string) => s.trim().replace(/^[“"']+|[”"']+$/g, "").trim();
  const i = m.indexOf(":");
  if (i > 0 && i < 12) return { label: m.slice(0, i).trim(), main: unq(m.slice(i + 1)) };
  return { label: "", main: unq(m) };
}
const unquote = (s: string) => s.trim().replace(/^[“"']+|[”"']+$/g, "").trim();
const stripNo = (s: string) => s.replace(/^\s*\d+\s*[.)]\s*/, "").trim();

function coverData(c: PjCover) {
  const { label, main } = splitMotto(c.motto || "");
  const lines = (c.lines || []).filter((x) => x.trim());
  return {
    meta: [c.founded, c.issue, c.date].filter((x) => x && x.trim()),
    label, main,
    slogan: unquote(c.slogan || ""),
    verseLine: c.verse ? `${c.verse}${c.verseRef ? ` (${c.verseRef})` : ""}` : "",
    lines, plain: lines.map(stripNo),
    contact: [c.pastor, c.phone && `TEL ${c.phone}`].filter(Boolean).join(" · "),
  };
}

function PhotoBox({ ctx, url, style }: { ctx: Ctx; url: string; style: CSSProperties }) {
  if (url) return <div style={{ ...style, backgroundImage: `url('${url}')`, backgroundSize: "cover", backgroundPosition: "center" }} />;
  return (
    <div style={{ ...style, background: "#DCE3E0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: px(8), color: "#5C6560" }}>
      <svg aria-hidden width={px(48)} height={px(48)} viewBox="0 0 24 24" fill="none" stroke="#5C6560" strokeWidth="1.5"><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="11" r="2" /><path d="M21 17l-5-5-9 7" /></svg>
      {ctx.guide && <span style={{ fontSize: "9.75pt" }}>표지 사진을 넣어 주세요</span>}
    </div>
  );
}

function Cover({ ctx, c }: { ctx: Ctx; c: PjCover }) {
  const { t, a } = ctx;
  const v = coverData(c);
  const fill: CSSProperties = { height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column" };
  const muted = t.muted;

  switch (t.id) {
    case "navy": // 02: 위쪽 포인트 색 블록(교회 이름) + 아래 표어 · 4칸 카드
      return (
        <div style={fill}>
          <div style={{ background: a, color: "#fff", padding: `${px(44)} ${px(44)} ${px(36)}`, display: "flex", flexDirection: "column", gap: px(6) }}>
            {c.denomination && <div style={{ fontSize: "9pt", letterSpacing: px(3), opacity: 0.85 }}>{c.denomination}</div>}
            <div style={{ fontSize: "39pt", fontWeight: 900, letterSpacing: `-${px(1)}`, lineHeight: 1.1 }}>{c.churchName}</div>
            {c.englishName && <div style={{ fontSize: "9pt", letterSpacing: px(4), opacity: 0.85 }}>{c.englishName}</div>}
            {v.meta.length > 0 && <div style={{ marginTop: px(20), display: "flex", gap: px(16), fontSize: "9pt", opacity: 0.9 }}>{v.meta.map((m, i) => <span key={i}>{m}</span>)}</div>}
          </div>
          <div style={{ padding: `${px(36)} ${px(44)}`, display: "flex", flexDirection: "column", gap: px(12), flex: 1, minHeight: 0 }}>
            {v.label && <div style={{ fontSize: "9pt", fontWeight: 700, color: a, letterSpacing: px(2) }}>{v.label}</div>}
            <div style={{ fontSize: "22.5pt", fontWeight: 900, lineHeight: 1.25 }}>{v.main}{v.main && v.slogan && <br />}{v.slogan}</div>
            {v.verseLine && <div style={{ fontSize: "9pt", color: muted }}>{v.verseLine}</div>}
            {v.plain.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: px(10), marginTop: px(8) }}>
                {v.plain.map((l, i) => (
                  <div key={i} style={{ background: `${a}14`, borderRadius: px(8), padding: `${px(12)} ${px(14)}` }}>
                    <div style={{ fontSize: "9pt", color: a, fontWeight: 700 }}>{String(i + 1).padStart(2, "0")}</div>
                    <div style={{ fontSize: "11.25pt", fontWeight: 700 }}>{l}</div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop: "auto", fontSize: "9pt", color: muted, lineHeight: 1.6 }}>{[v.contact, c.address].filter(Boolean).join(" · ")}</div>
          </div>
        </div>
      );

    case "minimal": // 03: 여백 많은 흰 표지, 아래 큰 교회 이름
      return (
        <div style={{ ...fill, padding: `${px(56)} ${px(52)} ${px(44)}` }}>
          <div style={{ fontSize: "9pt", color: muted, letterSpacing: px(2) }}>{[c.date, c.issue].filter(Boolean).join(" · ")}</div>
          <div style={{ marginTop: "auto", fontSize: "9pt", letterSpacing: px(3), color: muted }}>{v.label || v.main}</div>
          <div style={{ marginTop: px(10), fontSize: "16.5pt", fontWeight: 500, lineHeight: 1.5 }}>{v.slogan || v.main}</div>
          {c.verseRef && <div style={{ fontSize: "9pt", color: muted }}>{c.verseRef}</div>}
          {v.plain.length > 0 && <div style={{ marginTop: px(20), display: "flex", flexWrap: "wrap", gap: `${px(6)} ${px(18)}`, fontSize: "9.75pt" }}>{v.plain.map((l, i) => <span key={i}>{l}</span>)}</div>}
          <div style={{ marginTop: px(72), width: px(40), borderTop: `${px(2)} solid ${t.ink}` }} />
          <div style={{ marginTop: px(20), fontSize: "42pt", fontWeight: 700, letterSpacing: `-${px(2)}`, lineHeight: 1 }}>{c.churchName}</div>
          <div style={{ marginTop: px(10), fontSize: "9pt", letterSpacing: px(2), color: muted }}>{[c.denomination, c.englishName].filter(Boolean).join(" · ")}</div>
          {v.contact && <div style={{ marginTop: px(6), fontSize: "9pt", color: muted }}>{v.contact}</div>}
        </div>
      );

    case "arch": // 05: 옅은 바탕 + 포인트 색 아치(십자가 · 표어)
      return (
        <div style={{ ...fill, padding: `${px(40)} ${px(48)}`, alignItems: "center", textAlign: "center", fontFamily: t.titleFont, background: `${a}12` }}>
          {v.meta.length > 0 && <div style={{ fontSize: "9pt", color: muted, letterSpacing: px(2) }}>{v.meta.join(" · ")}</div>}
          <div style={{ marginTop: px(24), width: px(300), height: px(330), background: a, borderRadius: `${px(150)} ${px(150)} 0 0`, color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: px(10), padding: px(24), boxSizing: "border-box" }}>
            <svg aria-hidden width={px(28)} height={px(36)} viewBox="0 0 28 36" fill="none" stroke="#fff" strokeWidth="2.5"><path d="M14 2v32M4 12h20" /></svg>
            {v.main && <div style={{ fontSize: "9pt", letterSpacing: px(3), opacity: 0.85 }}>{v.main}</div>}
            {v.slogan && <div style={{ fontSize: "19.5pt", fontWeight: 700, lineHeight: 1.3, wordBreak: "keep-all" }}>{v.slogan}</div>}
            {c.verseRef && <div style={{ fontSize: "9pt", opacity: 0.85 }}>{c.verseRef}</div>}
          </div>
          {v.plain.length > 0 && <div style={{ marginTop: px(20), display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: `${px(6)} ${px(28)}`, fontSize: "10.5pt", fontWeight: 600 }}>{v.plain.map((l, i) => <span key={i}>{l}</span>)}</div>}
          <div style={{ marginTop: "auto", fontSize: "9pt", letterSpacing: px(2), color: muted }}>{c.denomination}</div>
          <div style={{ fontSize: "28.5pt", fontWeight: 900, letterSpacing: px(10), color: a }}>{c.churchName}</div>
          {v.contact && <div style={{ fontSize: "9pt", color: muted }}>{v.contact}</div>}
        </div>
      );

    case "charcoal": // 11: 위 흰 바탕(표어) + 아래 절반 진회색(교회 이름)
      return (
        <div style={fill}>
          <div style={{ padding: px(44), display: "flex", flexDirection: "column", gap: px(8), flex: 1, minHeight: 0 }}>
            {v.meta.length > 0 && <div style={{ fontSize: "9pt", color: muted, display: "flex", gap: px(14) }}>{v.meta.map((m, i) => <span key={i}>{m}</span>)}</div>}
            {v.main && <div style={{ marginTop: "auto", fontSize: "9pt", fontWeight: 700, color: a, letterSpacing: px(3), filter: "brightness(0.75)" }}>{v.main}</div>}
            {v.slogan && <div style={{ marginTop: v.main ? 0 : "auto", fontSize: "25.5pt", fontWeight: 900, lineHeight: 1.2 }}>{v.slogan}</div>}
            {v.verseLine && <div style={{ fontSize: "9pt", color: muted }}>{v.verseLine}</div>}
          </div>
          <div style={{ background: "#2B2B2B", color: "#fff", padding: `${px(32)} ${px(44)} ${px(40)}`, display: "flex", flexDirection: "column", gap: px(6) }}>
            {v.plain.length > 0 && <div style={{ display: "flex", gap: px(16), fontSize: "9.75pt", color: a, fontWeight: 700, flexWrap: "wrap" }}>{v.plain.map((l, i) => <span key={i}>{l}</span>)}</div>}
            {c.denomination && <div style={{ marginTop: px(18), fontSize: "9pt", letterSpacing: px(2), opacity: 0.8 }}>{c.denomination}</div>}
            <div style={{ fontSize: "33pt", fontWeight: 900, letterSpacing: px(2) }}>{c.churchName}</div>
            {v.contact && <div style={{ fontSize: "9pt", opacity: 0.8 }}>{v.contact}</div>}
          </div>
        </div>
      );

    case "stripe": // 19: 포인트 색 줄무늬 3줄
      return (
        <div style={{ ...fill, padding: px(44) }}>
          {v.meta.length > 0 && <div style={{ fontSize: "9pt", color: muted, display: "flex", gap: px(14) }}>{v.meta.map((m, i) => <span key={i}>{m}</span>)}</div>}
          <div style={{ margin: `${px(40)} -${px(44)} 0`, display: "flex", flexDirection: "column", gap: px(6) }}>
            <div style={{ height: px(28), background: a }} /><div style={{ height: px(14), background: `${a}B3` }} /><div style={{ height: px(6), background: `${a}59` }} />
          </div>
          {v.main && <div style={{ marginTop: px(36), fontSize: "9pt", fontWeight: 700, color: a, letterSpacing: px(3) }}>{v.main}</div>}
          {v.slogan && <div style={{ marginTop: v.main ? 0 : px(36), fontSize: "25.5pt", fontWeight: 700, lineHeight: 1.25 }}>{v.slogan}</div>}
          {v.verseLine && <div style={{ fontSize: "9pt", color: muted, marginTop: px(4) }}>{v.verseLine}</div>}
          {v.plain.length > 0 && <div style={{ marginTop: px(20), display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: `${px(6)} ${px(24)}`, fontSize: "10.5pt", fontWeight: 500 }}>{v.plain.map((l, i) => <span key={i}>— {l}</span>)}</div>}
          <div style={{ marginTop: "auto", fontSize: "9pt", color: muted }}>{[c.denomination, c.englishName].filter(Boolean).join(" · ")}</div>
          <div style={{ fontSize: "33pt", fontWeight: 700, letterSpacing: `-${px(1)}` }}>{c.churchName}</div>
          {v.contact && <div style={{ fontSize: "9pt", color: muted }}>{v.contact}</div>}
        </div>
      );

    case "photo": // 20: 위쪽 절반 교회 사진
      return (
        <div style={fill}>
          <PhotoBox ctx={ctx} url={c.imageUrl} style={{ height: px(390), flexShrink: 0 }} />
          <div style={{ padding: `${px(28)} ${px(44)} ${px(40)}`, display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
            {v.meta.length > 0 && <div style={{ fontSize: "9pt", color: muted, display: "flex", gap: px(14) }}>{v.meta.map((m, i) => <span key={i}>{m}</span>)}</div>}
            {(v.main || c.verseRef) && <div style={{ marginTop: px(14), fontSize: "9pt", fontWeight: 700, color: a, letterSpacing: px(2) }}>{[v.main, c.verseRef].filter(Boolean).join(" · ")}</div>}
            {v.slogan && <div style={{ fontSize: "21pt", fontWeight: 900 }}>{v.slogan}</div>}
            {v.plain.length > 0 && <div style={{ marginTop: px(10), display: "flex", gap: `${px(6)} ${px(14)}`, flexWrap: "wrap", fontSize: "9.75pt", fontWeight: 700 }}>{v.plain.map((l, i) => <span key={i}>{l}</span>)}</div>}
            <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: px(12) }}>
              <div>
                {c.denomination && <div style={{ fontSize: "9pt", color: muted }}>{c.denomination}</div>}
                <div style={{ fontSize: "25.5pt", fontWeight: 900 }}>{c.churchName}</div>
              </div>
              <div style={{ fontSize: "9pt", color: muted, textAlign: "right", lineHeight: 1.6 }}>{c.pastor}{c.pastor && c.phone && <br />}{c.phone && `TEL ${c.phone}`}</div>
            </div>
          </div>
        </div>
      );

    case "classic": // 01: 이중 테두리, 가운데 정렬 명조
    default:
      return (
        <div style={{ ...fill, border: `${px(3)} double ${a}`, padding: `${px(36)} ${px(32)}`, alignItems: "center", textAlign: "center" }}>
          {v.meta.length > 0 && <div style={{ width: "100%", display: "flex", justifyContent: "space-between", fontSize: "9pt" }}>{v.meta.map((m, i) => <span key={i}>{m}</span>)}</div>}
          {v.label && <div style={{ marginTop: px(56), fontSize: "9.75pt", letterSpacing: px(4) }}>{v.label}</div>}
          {v.main && <div style={{ marginTop: v.label ? px(8) : px(56), fontSize: "21pt", fontWeight: 900 }}>{v.main}</div>}
          {c.slogan && <div style={{ marginTop: px(28), fontSize: "15pt", fontWeight: 700 }}>{c.slogan}</div>}
          {v.verseLine && <div style={{ marginTop: px(8), fontSize: "9pt", color: "#444" }}>{v.verseLine}</div>}
          {v.lines.length > 0 && <div style={{ marginTop: px(28), display: "flex", flexDirection: "column", gap: px(6), fontSize: "10.5pt", fontWeight: 600 }}>{v.lines.map((l, i) => <span key={i}>{l}</span>)}</div>}
          {c.imageUrl ? <div style={{ flex: 1, width: "100%", margin: `${px(20)} 0`, minHeight: 0, backgroundImage: `url('${c.imageUrl}')`, backgroundSize: "cover", backgroundPosition: "center" }} /> : <div style={{ flex: 1 }} />}
          {c.denomination && <div style={{ fontSize: "9pt", letterSpacing: px(3) }}>{c.denomination}</div>}
          <div style={{ marginTop: px(6), fontSize: "30pt", fontWeight: 900, letterSpacing: px(14) }}>{c.churchName}</div>
          {c.englishName && <div style={{ fontSize: "9pt", letterSpacing: px(3) }}>{c.englishName}</div>}
          {(v.contact || c.address || c.email) && (
            <div style={{ marginTop: px(12), width: "60%", borderTop: `${px(1)} solid ${a}`, paddingTop: px(8), fontSize: "9pt", lineHeight: 1.6 }}>
              {v.contact}{v.contact && c.address && <br />}{c.address}{c.email && <><br />{c.email}</>}
            </div>
          )}
        </div>
      );
  }
}
