import { useEffect, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { updateChurchSite } from "../../../../utils/churchSite";
import { PaperSheet, PAPER_FONTS_HREF, SHEET_W_MM, SHEET_H_MM } from "./PaperSheet";
import { BLOCK_LABELS, PAGE_NAMES, emptyBlock, emptyJubo, sampleJubo, type PaperJubo, type PjBlock, type PjBlockType, type PjRow } from "./types";

// 홈페이지 편집 화면 > "교회 주보" 탭: 종이 주보(A4 한 장 양면 → 반 접어 4면) 만들기(2026-11-17)
// 왼쪽: 면 고르기 · 칸 편집(순서 위/아래, 다른 면으로 옮기기, 추가·삭제) / 오른쪽: 실제 인쇄 모양 미리보기
// "PDF 내려받기": A4 가로 2쪽(바깥면·안쪽면) PDF 파일 바로 저장 / "바로 인쇄": 새 창에 띄워 브라우저 인쇄

const C = { navy: "#1B3A6B", sky: "#3182F6", border: "#E5E7EB", muted: "#6B7280", text: "#111827", bg: "#F9FAFB" };
const input: React.CSSProperties = { width: "100%", boxSizing: "border-box", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", outline: "none", background: "white" };
const small: React.CSSProperties = { border: `1px solid ${C.border}`, background: "white", borderRadius: 6, padding: "4px 8px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" };

function useFonts() {
  useEffect(() => {
    if (document.getElementById("paper-jubo-fonts")) return;
    const l = document.createElement("link");
    l.id = "paper-jubo-fonts"; l.rel = "stylesheet"; l.href = PAPER_FONTS_HREF;
    document.head.appendChild(l);
  }, []);
}

export function PaperJuboEditor({ slug, initial, churchName, onSaved }: { slug: string; initial: PaperJubo | null; churchName: string; onSaved: (pj: PaperJubo) => void }) {
  useFonts();
  const [pj, setPj] = useState<PaperJubo | null>(initial);
  const [pageIdx, setPageIdx] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [side, setSide] = useState<"outside" | "inside">("outside");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { setPj(initial); setDirty(false); }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  // 미리보기 배율: 오른쪽 칸 너비에 A4 가로를 맞춤
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  useEffect(() => {
    const el = boxRef.current; if (!el) return;
    const fit = () => setScale(el.clientWidth / (SHEET_W_MM * 3.7795));
    fit(); const ro = new ResizeObserver(fit); ro.observe(el); return () => ro.disconnect();
  }, [pj]);

  const update = (fn: (p: PaperJubo) => PaperJubo) => { setPj((p) => (p ? fn(structuredClone(p)) : p)); setDirty(true); };
  const updateBlock = (id: string, fn: (b: PjBlock) => void) => update((p) => { p.pages.forEach((pg) => pg.blocks.forEach((b) => { if (b.id === id) fn(b); })); return p; });

  const save = async () => {
    if (!pj) return;
    setSaving(true);
    try {
      const next = { ...pj, updatedAt: Date.now() };
      await updateChurchSite(slug, { paperJubo: next } as never);
      onSaved(next); setDirty(false);
    } catch (e) {
      console.error("종이 주보 저장 실패:", e);
      alert("저장하지 못했습니다. 다시 시도해 주세요.");
    } finally { setSaving(false); }
  };

  // PDF 바로 내려받기(2026-11-17): 숨겨 둔 실제 크기 주보 2장(바깥면·안쪽면)을 고해상도로 찍어 A4 가로 2쪽 PDF로 저장
  const pdfRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  // PDF 만들기 진행 팝업(2026-11-17): 만드는 중(로딩·단계) → 완료(파일 이름) / 실패
  const [pdfPopup, setPdfPopup] = useState<{ state: "working" | "done" | "error"; step: string; file?: string } | null>(null);
  const downloadPdf = async () => {
    if (!pj || !pdfRef.current) return;
    setDownloading(true);
    setPdfPopup({ state: "working", step: "글꼴을 준비하고 있어요" });
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas-pro"), import("jspdf")]);
      // 글꼴이 다 받아진 뒤에 찍어야 글자가 바뀌지 않음
      try {
        await Promise.all(["400", "700", "900"].flatMap((w) => [document.fonts.load(`${w} 12px "Noto Serif KR"`, "가나다"), document.fonts.load(`${w} 12px "Noto Sans KR"`, "가나다")]));
        await document.fonts.ready;
      } catch { /* 글꼴 확인 실패해도 계속 */ }
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
      const sheets = Array.from(pdfRef.current.querySelectorAll<HTMLElement>("[data-sheet]"));
      for (let i = 0; i < sheets.length; i++) {
        setPdfPopup({ state: "working", step: `${i === 0 ? "바깥면 (4면 · 1면)" : "안쪽면 (2면 · 3면)"} 만드는 중 · ${i + 1}/${sheets.length}` });
        await new Promise((r) => setTimeout(r, 30)); // 팝업 글자가 먼저 바뀌어 보이게
        const canvas = await html2canvas(sheets[i], { scale: 3, useCORS: true, backgroundColor: "#ffffff", logging: false });
        if (i > 0) doc.addPage("a4", "landscape");
        doc.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, SHEET_W_MM, SHEET_H_MM);
      }
      const cover = pj.pages[0].blocks.find((b) => b.type === "cover")?.cover;
      const date = (cover?.date || "").replace(/[^0-9]+/g, ".").replace(/^\.|\.$/g, "");
      const fileName = `${churchName || "교회"}_주보${date ? `_${date}` : ""}.pdf`;
      setPdfPopup({ state: "working", step: "PDF 파일로 저장하는 중" });
      doc.save(fileName);
      setPdfPopup({ state: "done", step: "", file: fileName });
    } catch (e) {
      console.error("주보 PDF 만들기 실패: " + (e instanceof Error ? e.message : String(e)));
      setPdfPopup({ state: "error", step: "" });
    } finally { setDownloading(false); }
  };

  const print = () => {
    if (!pj) return;
    const w = window.open("", "_blank");
    if (!w) { alert("팝업이 막혀 있어요. 브라우저에서 팝업을 허용해 주세요."); return; }
    const sheets = renderToStaticMarkup(<><div className="pg"><PaperSheet jubo={pj} side="outside" guide={false} /></div><div className="pg"><PaperSheet jubo={pj} side="inside" guide={false} /></div></>);
    w.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${churchName || "교회"} 주보</title>
<link rel="stylesheet" href="${PAPER_FONTS_HREF}">
<style>@page{size:A4 landscape;margin:0}html,body{margin:0;padding:0;background:#e5e7eb}.pg{width:${SHEET_W_MM}mm;height:${SHEET_H_MM}mm;margin:0 auto;page-break-after:always;break-after:page;overflow:hidden;background:#fff}
@media screen{.pg{margin:8mm auto;box-shadow:0 2px 12px rgba(0,0,0,.15)}}@media print{html,body{background:#fff}.pg:last-child{page-break-after:auto;break-after:auto}}
*{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body>${sheets}</body></html>`);
    w.document.close();
    const go = () => { w.focus(); w.print(); };
    const fonts = (w.document as Document & { fonts?: FontFaceSet }).fonts;
    if (fonts?.ready) fonts.ready.then(() => setTimeout(go, 300)); else setTimeout(go, 1200);
  };

  if (!pj) {
    return (
      <div style={{ background: "white", border: `1px solid ${C.border}`, borderRadius: 16, padding: 40, textAlign: "center" }}>
        <p style={{ fontSize: 18, fontWeight: 800, color: C.navy }}>종이 주보 만들기</p>
        <p style={{ marginTop: 8, fontSize: 13, color: C.muted, lineHeight: 1.7 }}>A4 용지 한 장에 양면으로 인쇄해서 반으로 접는 4면 주보를 만들어요.<br />다 만든 뒤 <b>PDF 내려받기</b>를 누르면 인쇄용 PDF 파일이 바로 저장돼요.</p>
        <div style={{ marginTop: 20, display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <button type="button" onClick={() => { setPj(sampleJubo()); setDirty(true); }} style={{ ...small, padding: "12px 18px", fontSize: 14, fontWeight: 700, background: C.navy, color: "white", border: "none", borderRadius: 10 }}>예시 주보로 시작하기</button>
          <button type="button" onClick={() => { setPj(emptyJubo(churchName)); setDirty(true); }} style={{ ...small, padding: "12px 18px", fontSize: 14, fontWeight: 700, borderRadius: 10 }}>빈 주보로 시작하기</button>
        </div>
      </div>
    );
  }

  const page = pj.pages[pageIdx];
  const move = (i: number, d: -1 | 1) => update((p) => { const bs = p.pages[pageIdx].blocks; const j = i + d; if (j < 0 || j >= bs.length) return p; [bs[i], bs[j]] = [bs[j], bs[i]]; return p; });
  const moveTo = (i: number, to: number) => update((p) => { const [b] = p.pages[pageIdx].blocks.splice(i, 1); p.pages[to].blocks.push(b); return p; });
  const remove = (i: number) => { if (!confirm("이 칸을 지울까요?")) return; update((p) => { p.pages[pageIdx].blocks.splice(i, 1); return p; }); };
  const add = (t: PjBlockType) => { const b = emptyBlock(t); update((p) => { p.pages[pageIdx].blocks.push(b); return p; }); setOpenId(b.id); };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.15fr)", gap: 24, alignItems: "start" }}>
      {/* 왼쪽: 편집 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ background: "white", border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
          <p style={{ fontWeight: 800, color: C.navy, fontSize: 15 }}>디자인</p>
          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {([["classic", "클래식 (흑백 · 테두리)"], ["modern", "모던 (포인트 색)"]] as const).map(([v, l]) => (
              <button key={v} type="button" onClick={() => update((p) => ({ ...p, template: v }))}
                style={{ ...small, padding: "8px 12px", fontWeight: 700, borderColor: pj.template === v ? C.sky : C.border, background: pj.template === v ? "#EFF6FF" : "white", color: pj.template === v ? C.sky : C.text }}>{l}</button>
            ))}
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: C.muted, marginLeft: 4 }}>
              포인트 색 <input type="color" value={pj.color} onChange={(e) => update((p) => ({ ...p, color: e.target.value }))} style={{ width: 32, height: 28, border: "none", background: "none", padding: 0, cursor: "pointer" }} />
            </label>
          </div>
        </div>

        <div style={{ background: "white", border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
          {/* 면 고르기 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6 }}>
            {PAGE_NAMES.map((n, i) => (
              <button key={n} type="button" onClick={() => { setPageIdx(i); setSide(i === 0 || i === 3 ? "outside" : "inside"); }}
                style={{ ...small, padding: "9px 4px", fontWeight: 700, borderColor: pageIdx === i ? C.navy : C.border, background: pageIdx === i ? C.navy : "white", color: pageIdx === i ? "white" : C.text }}>{n}</button>
            ))}
          </div>
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{PAGE_NAMES[pageIdx]} · 칸 {page.blocks.length}개</span>
            <span style={{ display: "inline-flex", gap: 4 }}>
              {([1, 2] as const).map((n) => (
                <button key={n} type="button" onClick={() => update((p) => { p.pages[pageIdx].columns = n; return p; })}
                  style={{ ...small, fontWeight: 700, borderColor: page.columns === n ? C.sky : C.border, color: page.columns === n ? C.sky : C.muted }}>{n}단</button>
              ))}
            </span>
          </div>

          {/* 칸 목록 */}
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {page.blocks.map((b, i) => (
              <div key={b.id} style={{ border: `1px solid ${openId === b.id ? C.sky : C.border}`, borderRadius: 12, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 12px", background: openId === b.id ? "#EFF6FF" : C.bg }}>
                  <button type="button" onClick={() => setOpenId(openId === b.id ? null : b.id)} style={{ flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 }}>
                    <span style={{ fontSize: 11, color: C.muted, marginRight: 6 }}>{BLOCK_LABELS[b.type]}</span>
                    <b style={{ fontSize: 13, color: C.text }}>{b.type === "cover" ? (b.cover?.churchName || "표지") : (b.title || "(제목 없음)")}</b>
                  </button>
                  {page.columns === 2 && (
                    <select value={b.col === 2 ? "2" : "1"} onChange={(e) => updateBlock(b.id, (x) => { x.col = e.target.value === "2" ? 2 : 1; })} style={{ ...small, padding: "4px 4px" }} title="2단에서 놓을 단">
                      <option value="1">왼쪽 단</option><option value="2">오른쪽 단</option>
                    </select>
                  )}
                  <button type="button" title="위로" onClick={() => move(i, -1)} disabled={i === 0} style={{ ...small, opacity: i === 0 ? 0.4 : 1 }}>↑</button>
                  <button type="button" title="아래로" onClick={() => move(i, 1)} disabled={i === page.blocks.length - 1} style={{ ...small, opacity: i === page.blocks.length - 1 ? 0.4 : 1 }}>↓</button>
                  <select value="" onChange={(e) => { if (e.target.value !== "") moveTo(i, Number(e.target.value)); }} style={{ ...small, padding: "4px 4px" }} title="다른 면으로 옮기기">
                    <option value="">면 이동</option>
                    {PAGE_NAMES.map((n, k) => k !== pageIdx && <option key={k} value={k}>{n.split(" ")[0]}으로</option>)}
                  </select>
                  <button type="button" onClick={() => remove(i)} style={{ ...small, color: "#DC2626" }}>삭제</button>
                </div>
                {openId === b.id && <BlockEditor b={b} onChange={(fn) => updateBlock(b.id, fn)} />}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(["list", "order", "kv", "text", "cover"] as PjBlockType[]).map((t) => (
              <button key={t} type="button" onClick={() => add(t)} style={{ ...small, padding: "7px 10px", borderStyle: "dashed", color: C.navy, fontWeight: 700 }}>+ {BLOCK_LABELS[t]}</button>
            ))}
          </div>
        </div>
      </div>

      {/* 오른쪽: 미리보기 + 저장·인쇄 */}
      <div style={{ position: "sticky", top: 90, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span style={{ display: "inline-flex", background: "#F3F4F6", borderRadius: 10, padding: 3 }}>
            {([["outside", "바깥면 (4면 · 1면)"], ["inside", "안쪽면 (2면 · 3면)"]] as const).map(([v, l]) => (
              <button key={v} type="button" onClick={() => setSide(v)} style={{ border: "none", borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", background: side === v ? "white" : "transparent", color: side === v ? C.navy : C.muted, boxShadow: side === v ? "0 1px 2px rgba(0,0,0,.08)" : "none" }}>{l}</button>
            ))}
          </span>
          <span style={{ fontSize: 12, color: dirty ? "#DC2626" : C.muted }}>{dirty ? "저장하지 않은 변경이 있어요" : "저장됨"}</span>
        </div>
        <div ref={boxRef} style={{ width: "100%", height: SHEET_H_MM * 3.7795 * scale, overflow: "hidden", borderRadius: 6, boxShadow: "0 4px 20px rgba(0,0,0,.12)", background: "white" }}>
          <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: `${SHEET_W_MM}mm` }}>
            <PaperSheet jubo={pj} side={side} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <button type="button" onClick={save} disabled={saving} style={{ padding: "13px", borderRadius: 10, border: `1px solid ${C.navy}`, background: "white", color: C.navy, fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>{saving ? "저장 중..." : "💾 주보 저장"}</button>
          <button type="button" onClick={downloadPdf} disabled={downloading} style={{ padding: "13px", borderRadius: 10, border: "none", background: C.navy, color: "white", fontWeight: 800, fontSize: 14, cursor: downloading ? "wait" : "pointer", fontFamily: "inherit" }}>{downloading ? "PDF 만드는 중..." : "📥 PDF 내려받기"}</button>
        </div>
        <button type="button" onClick={print} style={{ padding: "11px", borderRadius: 10, border: `1px solid ${C.border}`, background: "white", color: C.text, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>🖨 바로 인쇄 (인쇄 창 열기)</button>
        <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
          <b>PDF 내려받기</b>를 누르면 A4 가로 2쪽(바깥면·안쪽면) PDF 파일이 바로 저장돼요. 인쇄할 때는 <b>용지 A4 · 가로 · 양면 인쇄(짧은 쪽으로 넘기기)</b>로 인쇄한 뒤 반으로 접으면 돼요.
          글이 넘치면 미리보기에서 잘려 보여요 — 글을 줄이거나 칸을 다른 면으로 옮겨 주세요.
        </p>
      </div>
      {pdfPopup && <PdfPopup p={pdfPopup} onClose={() => setPdfPopup(null)} onPrint={() => { setPdfPopup(null); print(); }} />}
      {/* PDF용 실제 크기 주보(화면 밖에 숨김) */}
      <div ref={pdfRef} aria-hidden style={{ position: "fixed", left: -20000, top: 0, pointerEvents: "none" }}>
        <div data-sheet><PaperSheet jubo={pj} side="outside" guide={false} /></div>
        <div data-sheet><PaperSheet jubo={pj} side="inside" guide={false} /></div>
      </div>
    </div>
  );
}

// ── 칸 편집 ──────────────────────────────────────────────
function BlockEditor({ b, onChange }: { b: PjBlock; onChange: (fn: (b: PjBlock) => void) => void }) {
  const label = (t: string) => <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>{t}</span>;
  const wrap: React.CSSProperties = { padding: 14, display: "flex", flexDirection: "column", gap: 10, background: "white" };
  if (b.type === "cover" && b.cover) {
    const c = b.cover;
    const f = (k: keyof typeof c, t: string, ph = "") => (
      <label>{label(t)}<input style={input} value={String(c[k] ?? "")} placeholder={ph} onChange={(e) => onChange((x) => { (x.cover as unknown as Record<string, string>)[k] = e.target.value; })} /></label>
    );
    return (
      <div style={wrap}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>{f("founded", "설립", "설립 2006. 1. 1.")}{f("issue", "호수", "제2026-46")}{f("date", "날짜", "2026. 11. 15.")}</div>
        {f("motto", "표어(큰 글씨)", "교회비전 : “1백 1천 세계비전”")}
        {f("slogan", "표어 아래 문구", "“여호와를 기뻐하라!”")}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 8 }}>{f("verse", "말씀")}{f("verseRef", "말씀 출처", "시편37:4")}</div>
        <label>{label("짧은 줄 (한 줄에 하나)")}<textarea style={{ ...input, minHeight: 80 }} value={c.lines.join("\n")} onChange={(e) => onChange((x) => { x.cover!.lines = e.target.value.split("\n"); })} /></label>
        {f("imageUrl", "표지 사진 주소 (선택)", "https://...")}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>{f("denomination", "교단")}{f("churchName", "교회 이름")}</div>
        {f("englishName", "영문 이름")}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>{f("pastor", "담임목사", "담임목사 : 홍길동")}{f("phone", "전화")}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>{f("address", "주소")}{f("email", "이메일")}</div>
      </div>
    );
  }
  const rowsEditor = (twoLabel: [string, string]) => (
    <div>
      {label(`${twoLabel[0]} / ${twoLabel[1]}`)}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {(b.rows || []).map((r: PjRow, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 6 }}>
            <input style={input} value={r.label} placeholder={twoLabel[0]} onChange={(e) => onChange((x) => { x.rows![i].label = e.target.value; })} />
            <input style={input} value={r.value} placeholder={twoLabel[1]} onChange={(e) => onChange((x) => { x.rows![i].value = e.target.value; })} />
            <button type="button" onClick={() => onChange((x) => { x.rows!.splice(i, 1); })} style={{ ...small, color: "#DC2626" }}>삭제</button>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => onChange((x) => { x.rows = [...(x.rows || []), { label: "", value: "" }]; })} style={{ ...small, marginTop: 6, color: C.navy, fontWeight: 700 }}>+ 줄 추가</button>
    </div>
  );
  return (
    <div style={wrap}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: 8 }}>
        <label>{label("제목")}<input style={input} value={b.title} onChange={(e) => onChange((x) => { x.title = e.target.value; })} /></label>
        <label>{label("제목 옆 작은 글씨")}<input style={input} value={b.subtitle || ""} placeholder="오전 11:00" onChange={(e) => onChange((x) => { x.subtitle = e.target.value; })} /></label>
      </div>
      {b.type === "list" && (
        <>
          <label>{label("앞 표시")}
            <select style={input} value={b.marker || "number"} onChange={(e) => onChange((x) => { x.marker = e.target.value as PjBlock["marker"]; })}>
              <option value="number">1. 2. 3. 숫자</option><option value="bullet">♠ 기호</option><option value="none">없음</option>
            </select>
          </label>
          <label>{label("내용 (한 줄에 하나)")}<textarea style={{ ...input, minHeight: 140 }} value={(b.items || []).join("\n")} onChange={(e) => onChange((x) => { x.items = e.target.value.split("\n"); })} /></label>
        </>
      )}
      {b.type === "order" && (
        <>
          <label>{label("인도 (제목 아래 오른쪽)")}<input style={input} value={b.note || ""} placeholder="인도 : 홍길동 목사" onChange={(e) => onChange((x) => { x.note = e.target.value; })} /></label>
          {rowsEditor(["순서", "담당"])}
        </>
      )}
      {b.type === "kv" && rowsEditor(["항목", "내용"])}
      {b.type === "text" && (
        <label>{label("내용")}<textarea style={{ ...input, minHeight: 160 }} value={b.text || ""} onChange={(e) => onChange((x) => { x.text = e.target.value; })} /></label>
      )}
    </div>
  );
}

// PDF 만들기 팝업(머티리얼 스타일): 만드는 중엔 원형 로딩 + 단계 안내(닫기 없음), 끝나면 완료/실패 안내
function PdfPopup({ p, onClose, onPrint }: { p: { state: "working" | "done" | "error"; step: string; file?: string }; onClose: () => void; onPrint: () => void }) {
  return (
    <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: "rgba(15,23,42,.45)", backdropFilter: "blur(2px)" }}>
      <style>{`@keyframes pjSpin{to{transform:rotate(360deg)}}@keyframes pjDash{0%{stroke-dasharray:1,150;stroke-dashoffset:0}50%{stroke-dasharray:90,150;stroke-dashoffset:-35}100%{stroke-dasharray:90,150;stroke-dashoffset:-124}}@keyframes pjPop{from{opacity:0;transform:translateY(8px) scale(.97)}to{opacity:1;transform:none}}`}</style>
      <div style={{ width: "100%", maxWidth: 340, background: "white", borderRadius: 24, padding: "30px 26px 22px", textAlign: "center", boxShadow: "0 24px 60px rgba(0,0,0,.25)", animation: "pjPop .22s ease-out" }}>
        {p.state === "working" ? (
          <>
            <svg viewBox="0 0 50 50" width="52" height="52" style={{ display: "block", margin: "0 auto", animation: "pjSpin 1.4s linear infinite" }} aria-hidden>
              <circle cx="25" cy="25" r="20" fill="none" stroke="#E8F0FE" strokeWidth="5" />
              <circle cx="25" cy="25" r="20" fill="none" stroke={C.sky} strokeWidth="5" strokeLinecap="round" style={{ animation: "pjDash 1.4s ease-in-out infinite" }} />
            </svg>
            <p style={{ marginTop: 16, fontSize: 17, fontWeight: 800, color: C.text }}>PDF를 만들고 있어요</p>
            <p style={{ marginTop: 6, fontSize: 13, color: C.muted, lineHeight: 1.6 }}>잠시만 기다려 주세요.<br />창을 닫거나 다른 화면으로 이동하지 마세요.</p>
            <p style={{ marginTop: 14, display: "inline-block", borderRadius: 999, background: "#F3F4F6", padding: "6px 12px", fontSize: 12, fontWeight: 700, color: C.navy }}>{p.step}</p>
          </>
        ) : p.state === "done" ? (
          <>
            <div style={{ margin: "0 auto", width: 52, height: 52, borderRadius: "50%", background: "#E7F8EE", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#12B76A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            </div>
            <p style={{ marginTop: 16, fontSize: 17, fontWeight: 800, color: C.text }}>PDF를 저장했어요</p>
            <p style={{ marginTop: 6, fontSize: 13, color: C.muted, lineHeight: 1.6, wordBreak: "break-all" }}>{p.file}<br />다운로드 폴더에서 확인해 주세요.</p>
            <button type="button" onClick={onClose} style={{ marginTop: 20, width: "100%", padding: "13px", borderRadius: 12, border: "none", background: C.sky, color: "white", fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>확인</button>
          </>
        ) : (
          <>
            <div style={{ margin: "0 auto", width: 52, height: 52, borderRadius: "50%", background: "#FEECEC", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 900, color: "#F04452" }}>!</div>
            <p style={{ marginTop: 16, fontSize: 17, fontWeight: 800, color: C.text }}>PDF를 만들지 못했어요</p>
            <p style={{ marginTop: 6, fontSize: 13, color: C.muted, lineHeight: 1.6 }}>표지 사진이 있다면 빼고 다시 해 보시거나,<br />바로 인쇄 창에서 "PDF로 저장"을 골라 주세요.</p>
            <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <button type="button" onClick={onClose} style={{ padding: "12px", borderRadius: 12, border: `1px solid ${C.border}`, background: "white", color: C.text, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>닫기</button>
              <button type="button" onClick={onPrint} style={{ padding: "12px", borderRadius: 12, border: "none", background: C.navy, color: "white", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>바로 인쇄</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
