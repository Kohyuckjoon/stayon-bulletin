import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "react-router";
import { getRetreat, retreatApplyState, retreatDateText, submitApplication, RETREAT_FIELD_LABELS, type Retreat, type RetreatFieldKey } from "../../../utils/retreat";

// 수련회 성도 화면(2026-11-24) — /retreat/{id}.
// 디자인: 주보 커스텀 디자인 "모던 & 미니멀(커버형)"(bulletinTemplates/WarmIvoryTemplate)과 같은 톤 —
//  첫 화면을 꽉 채우는 사진 커버(날짜 · 골드 줄 · 말씀 · 큰 제목) → 아이보리 바탕 위에
//  작은 영문 라벨 + 굵은 한글 제목 섹션(안내 · 회비 · 준비물 · 일정표 · 조편성 · 포스터), 아래에 신청 버튼 고정.
// 신청은 구글폼 대신 자체 신청서 → retreats/{id}/applications. 로그인 없이 누구나.

const ACCENT = "#2F5C52";      // 짙은 틸 — 라벨·포인트
const GOLD = "#D4A359";
const PAGE_BG = "#FDFAF5";     // 아이보리
const ALT_BG = "#F8F4EE";      // 한 톤 진한 아이보리
const DIVIDER = "#F0EDE9";     // 행 사이 얇은 줄
const SECTION_LINE = "#EEE6D4";// 섹션 사이 2px 줄
const INK = "#1F241F";
const MUTED = "#8a8272";
const FONT = "'Pretendard', 'Apple SD Gothic Neo', 'Malgun Gothic', -apple-system, sans-serif";

function useCountdown(target: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const diff = target - now;
  if (!target || diff <= 0) return null;
  return { d: Math.floor(diff / 86400000), h: Math.floor(diff / 3600000) % 24, m: Math.floor(diff / 60000) % 60, s: Math.floor(diff / 1000) % 60 };
}
const pad = (n: number) => String(n).padStart(2, "0");

function Section({ label, title, right, bg = PAGE_BG, children }: { label: string; title: string; right?: ReactNode; bg?: string; children: ReactNode }) {
  return (
    <section className="px-6 py-9 border-b-2" style={{ backgroundColor: bg, borderColor: SECTION_LINE }}>
      <p className="text-[10px] font-black tracking-[0.25em] uppercase mb-1" style={{ color: ACCENT }}>{label}</p>
      <div className="flex items-center justify-between gap-3 mb-5">
        <h3 className="text-lg font-black" style={{ color: INK }}>{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

export function RetreatPage() {
  const { id = "" } = useParams<{ id: string }>();
  const [r, setR] = useState<Retreat | null | "none">(null);
  const [day, setDay] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [zoom, setZoom] = useState<string>("");
  const [copied, setCopied] = useState(false);
  // 아래 고정 신청 버튼: 커버(첫 화면)를 반쯤 지나 내려가면 올라옴 — 커버 위에선 커버 안의 버튼을 씀
  const [pastCover, setPastCover] = useState(false);
  useEffect(() => {
    const on = () => setPastCover(window.scrollY > window.innerHeight * 0.55);
    on(); window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  const load = () => getRetreat(id).then((x) => setR(x && x.enabled ? x : "none")).catch(() => setR("none"));
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (r && r !== "none") document.title = `${r.title || "수련회"} | ${r.churchName || "스테이온"}`; }, [r]);
  useEffect(() => { document.body.style.overflow = formOpen || done || zoom ? "hidden" : ""; return () => { document.body.style.overflow = ""; }; }, [formOpen, done, zoom]);

  // 카운트다운: 신청 마감일이 있으면 그날 끝까지, 없으면 수련회 시작일까지
  const target = r && r !== "none"
    ? (r.form.deadline ? new Date(`${r.form.deadline}T23:59:59+09:00`).getTime() : r.startDate ? new Date(`${r.startDate}T00:00:00+09:00`).getTime() : 0)
    : 0;
  const cd = useCountdown(target);
  const revealAt = r && r !== "none" && r.groupRevealAt ? new Date(`${r.groupRevealAt}:00+09:00`).getTime() : 0;
  const revealCd = useCountdown(revealAt);

  if (r === null) return <div className="min-h-screen grid place-items-center text-sm" style={{ background: PAGE_BG, color: MUTED, fontFamily: FONT }}>불러오는 중이에요…</div>;
  if (r === "none") return (
    <div className="min-h-screen grid place-items-center px-6 text-center" style={{ background: PAGE_BG, fontFamily: FONT }}>
      <div><p className="text-[10px] font-black tracking-[0.25em] uppercase" style={{ color: ACCENT }}>RETREAT</p><p className="mt-2 text-lg font-black" style={{ color: INK }}>수련회 안내가 아직 열리지 않았어요</p><p className="mt-1 text-sm" style={{ color: MUTED }}>주소를 다시 확인하시거나 교회에 문의해 주세요.</p></div>
    </div>
  );

  const st = retreatApplyState(r);
  const dateText = retreatDateText(r);
  const cover = r.coverUrl || "/background_image_1.png"; // 커버 사진이 없으면 기본 배경(주보 배경 이미지 01). 포스터는 커버로 안 씀
  const copy = async (t: string) => { try { await navigator.clipboard.writeText(t); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* 복사 실패는 조용히 */ } };
  const account = [r.bankName, r.accountNumber].filter(Boolean).join(" ");
  const infoRows = [
    { k: "일시", v: dateText },
    { k: "장소", v: r.location, sub: r.address },
    { k: "문의", v: r.contact, tel: (r.contact.match(/0[\d-]{8,}/) || [""])[0] },
  ].filter((x) => x.v);
  const hasSchedule = r.schedule.some((d) => d.rows.some((x) => x.label.trim()));
  const items = r.items.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

  return (
    <div className="min-h-screen" style={{ background: "#EDE7DC", fontFamily: FONT }}>
      <style>{`@keyframes rt-scroll-hint{0%,100%{transform:translate(-50%,0);opacity:.55}50%{transform:translate(-50%,5px);opacity:.9}}`}</style>
      <div className="mx-auto max-w-[480px] min-h-screen shadow-[0_0_40px_rgba(0,0,0,0.06)]" style={{ backgroundColor: PAGE_BG }}>
        {/* ── 커버: 첫 화면을 꽉 채우는 사진, 아래쪽 그라데이션 위에 글 ── */}
        <div className="relative h-[100svh] min-h-[560px] bg-cover bg-center bg-no-repeat flex flex-col justify-end overflow-hidden"
          style={{ backgroundImage: `linear-gradient(rgba(10,12,10,0.12) 0%, rgba(10,12,10,0.32) 48%, rgba(10,10,8,0.88) 100%), url(${cover})` }}>
          <div className="px-6 pt-8" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 64px)" }}>
            <p className="text-white/70 text-xs font-medium tracking-wide mb-3">{[r.churchName, dateText].filter(Boolean).join(" · ")}</p>
            <div className="w-10 h-[2px] mb-4" style={{ backgroundColor: GOLD }} />
            {(r.verseRef || r.verse) && (
              <p className="text-[13px] font-bold tracking-wide mb-2 break-keep" style={{ color: "#E0B368" }}>{r.verseRef}{r.verseRef && r.verse ? " · " : ""}{r.verse && `“${r.verse}”`}</p>
            )}
            <h1 className="text-white font-black leading-snug break-keep text-[28px] sm:text-[32px] mb-1">{r.theme || r.title || "수련회"}</h1>
            {r.theme && r.title && <p className="text-white/80 text-sm font-semibold mt-1">{r.title}</p>}
            {/* 마감 카운트다운(유리 느낌 칩) */}
            <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-2 backdrop-blur-md">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: st.ok ? GOLD : "#9CA3AF" }} />
              <span className="text-[12px] font-bold text-white/90 tabular-nums">
                {!st.ok ? st.reason : cd ? <>{r.form.deadline ? "신청 마감까지" : "수련회까지"} {cd.d}일 {pad(cd.h)}:{pad(cd.m)}:{pad(cd.s)}</> : "곧 만나요"}
              </span>
            </div>
            {/* 커버 안 신청 버튼(유리 느낌) */}
            <button type="button" disabled={!st.ok} onClick={() => setFormOpen(true)}
              className="mt-4 flex h-13 w-full items-center justify-center rounded-2xl py-4 text-[15px] font-extrabold transition active:scale-[0.98] disabled:cursor-not-allowed"
              style={st.ok ? { backgroundColor: "#fff", color: ACCENT } : { backgroundColor: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.7)" }}>
              {st.ok ? "수련회 신청하기" : st.reason}
            </button>
          </div>
          <div className="absolute left-1/2 flex flex-col items-center gap-1.5 text-white text-[10px] font-medium tracking-[0.15em] pointer-events-none"
            style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)", animation: "rt-scroll-hint 2s ease-in-out infinite" }}>
            SCROLL
            <span className="w-px h-5" style={{ background: "linear-gradient(to bottom, rgba(212,163,89,.6), transparent)" }} />
          </div>
        </div>

        {/* ── 안내 ── */}
        {infoRows.length > 0 && (
          <Section label="INFORMATION" title="수련회 안내">
            <div>
              {infoRows.map((x, i) => (
                <div key={x.k} className="flex gap-4 py-3.5" style={{ borderTop: i ? `1px solid ${DIVIDER}` : "none" }}>
                  <span className="w-10 shrink-0 text-[13px] font-medium pt-0.5" style={{ color: MUTED }}>{x.k}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-bold break-keep" style={{ color: INK }}>{x.v}</p>
                    {x.sub && <p className="mt-0.5 text-[13px] break-keep" style={{ color: MUTED }}>{x.sub}</p>}
                  </div>
                  {x.tel && <a href={`tel:${x.tel.replace(/-/g, "")}`} className="shrink-0 self-center rounded-full px-3 py-1.5 text-[12px] font-bold text-white" style={{ backgroundColor: ACCENT }}>전화</a>}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ── 회비: 커버형 주보의 남색 칸 ── */}
        {r.fee && (
          <div className="px-6 py-8" style={{ background: "linear-gradient(135deg, #141E33, #0B1220)" }}>
            <p className="text-[10px] font-black tracking-[0.25em] uppercase text-white/45 mb-1.5">FEE</p>
            <h4 className="text-lg font-black text-white tracking-tight mb-5">회비 안내</h4>
            <div className="space-y-3 text-[13px]">
              <div className="flex gap-4"><span className="text-white/45 font-medium w-12 shrink-0">회비</span><span className="text-white font-black text-[17px] tabular-nums">{r.fee}</span></div>
              {account && (
                <div className="flex items-center gap-4 pt-3 mt-3 border-t border-white/10">
                  <span className="text-white/45 font-medium w-12 shrink-0">계좌</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-white font-bold text-[15px] tabular-nums break-all">{account}</p>
                    {r.accountHolder && <p className="text-white/45 text-xs font-semibold mt-0.5">예금주 {r.accountHolder}</p>}
                  </div>
                  {r.accountNumber && <button type="button" onClick={() => copy(r.accountNumber)} className="shrink-0 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[12px] font-bold text-white active:scale-95">{copied ? "복사됨" : "복사"}</button>}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── 준비물 ── */}
        {(items.length > 0 || r.caution) && (
          <Section label="CHECKLIST" title="준비물" bg={ALT_BG}>
            {items.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {items.map((x) => <span key={x} className="rounded-full px-3 py-1.5 text-[13px] font-semibold" style={{ backgroundColor: PAGE_BG, color: INK, border: `1px solid ${SECTION_LINE}` }}>{x}</span>)}
              </div>
            )}
            {r.caution && <p className="mt-4 text-[13px] font-bold" style={{ color: "#B4533C" }}>※ {r.caution}</p>}
          </Section>
        )}

        {/* ── 일정표 ── */}
        {hasSchedule && (
          <Section label="SCHEDULE" title="일정표">
            <div className="flex gap-2 mb-4 overflow-x-auto">
              {r.schedule.map((d, i) => (
                <button key={i} type="button" onClick={() => setDay(i)}
                  className="shrink-0 rounded-full px-4 py-2 text-[13px] font-bold transition-colors"
                  style={day === i ? { backgroundColor: ACCENT, color: "#fff" } : { backgroundColor: ALT_BG, color: MUTED }}>{d.title || `${i + 1}일차`}</button>
              ))}
            </div>
            <div key={day} className="animate-in fade-in duration-300">
              {(r.schedule[day]?.rows || []).filter((x) => x.label.trim()).map((x, i) => (
                <div key={i} className="flex items-center gap-4 py-3" style={{ borderTop: i ? `1px solid ${DIVIDER}` : "none" }}>
                  <span className="w-14 shrink-0 text-[13px] font-bold tabular-nums" style={{ color: x.highlight ? ACCENT : MUTED }}>{x.time}</span>
                  <span className="text-[15px] break-keep" style={{ color: x.highlight ? ACCENT : INK, fontWeight: x.highlight ? 900 : 600 }}>{x.label}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ── 조편성: 공개 시각 전에는 카운트다운 ── */}
        {(r.groupImageUrl || revealCd) && (
          <Section label="GROUPS" title="조 편성" bg={ALT_BG}>
            {revealCd ? (
              <div className="rounded-2xl px-5 py-8 text-center" style={{ backgroundColor: PAGE_BG, border: `1px solid ${SECTION_LINE}` }}>
                <p className="text-sm font-bold" style={{ color: INK }}>조 편성은 곧 공개돼요</p>
                <p className="mt-2 text-[15px] font-black tabular-nums" style={{ color: ACCENT }}>{revealCd.d}일 {pad(revealCd.h)}:{pad(revealCd.m)}:{pad(revealCd.s)}</p>
              </div>
            ) : (
              <button type="button" onClick={() => setZoom(r.groupImageUrl)} className="block w-full">
                <img src={r.groupImageUrl} alt="조 편성" className="w-full rounded-2xl" style={{ border: `1px solid ${SECTION_LINE}` }} />
                <p className="mt-2 text-center text-xs" style={{ color: MUTED }}>눌러서 크게 보기</p>
              </button>
            )}
          </Section>
        )}

        {/* ── 포스터 ── */}
        {r.posterUrl && (
          <Section label="POSTER" title="포스터">
            <button type="button" onClick={() => setZoom(r.posterUrl)} className="block w-full">
              <img src={r.posterUrl} alt="수련회 포스터" className="w-full rounded-2xl" />
            </button>
          </Section>
        )}

        <p className="px-6 pt-8 pb-32 text-center text-[11px]" style={{ color: "#B5AD9C" }}>{r.churchName ? `${r.churchName} · ` : ""}Powered by STAYON</p>
      </div>

      {/* ── 아래 고정: 신청하기 ── */}
      <div className={`fixed inset-x-0 bottom-0 z-30 pointer-events-none transition-all duration-300 ${pastCover ? "translate-y-0 opacity-100" : "translate-y-full opacity-0"}`}>
        <div className={`mx-auto max-w-[480px] px-5 pt-6 ${pastCover ? "pointer-events-auto" : ""}`} style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)", background: `linear-gradient(to top, ${PAGE_BG} 60%, rgba(253,250,245,0))` }}>
          <button type="button" disabled={!st.ok} onClick={() => setFormOpen(true)}
            className="h-14 w-full rounded-2xl text-[16px] font-extrabold text-white transition active:scale-[0.98] disabled:cursor-not-allowed"
            style={{ backgroundColor: st.ok ? ACCENT : "#BDB6A8", boxShadow: st.ok ? "0 10px 24px rgba(47,92,82,0.28)" : "none" }}>
            {st.ok ? "수련회 신청하기" : st.reason}
          </button>
          {st.ok && r.form.capacity > 0 && <p className="mt-1.5 text-center text-[11px] font-semibold" style={{ color: MUTED }}>정원 {r.form.capacity}명 · 지금 {r.appCount || 0}명 신청</p>}
        </div>
      </div>

      {/* 신청서(아래에서 올라오는 창) */}
      {formOpen && (
        <Sheet onClose={() => setFormOpen(false)}>
          <ApplyForm r={r} onCancel={() => setFormOpen(false)} onDone={() => { setFormOpen(false); setDone(true); load(); }} />
        </Sheet>
      )}
      {done && (
        <Sheet onClose={() => setDone(false)}>
          <div className="text-center py-4">
            <p className="text-[10px] font-black tracking-[0.25em] uppercase" style={{ color: ACCENT }}>COMPLETE</p>
            <p className="mt-2 text-xl font-black" style={{ color: INK }}>신청이 완료됐어요</p>
            <p className="mt-1.5 text-sm" style={{ color: MUTED }}>수련회에서 만나요.</p>
            {r.accountNumber && (
              <div className="mt-6 rounded-2xl px-5 py-4 text-left" style={{ background: "linear-gradient(135deg, #141E33, #0B1220)" }}>
                <p className="text-[10px] font-black tracking-[0.25em] uppercase text-white/45">FEE</p>
                <p className="mt-1 text-[17px] font-black text-white tabular-nums">{r.fee}</p>
                <p className="mt-1 text-[13px] text-white/80 tabular-nums">{account}{r.accountHolder ? ` (${r.accountHolder})` : ""}</p>
                <button type="button" onClick={() => copy(r.accountNumber)} className="mt-3 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[12px] font-bold text-white">{copied ? "복사됨" : "계좌번호 복사"}</button>
              </div>
            )}
            <button type="button" onClick={() => setDone(false)} className="mt-6 h-12 w-full rounded-2xl text-[15px] font-bold" style={{ backgroundColor: ALT_BG, color: INK }}>확인</button>
          </div>
        </Sheet>
      )}

      {zoom && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-3 animate-in fade-in duration-200" onClick={() => setZoom("")}>
          <img src={zoom} alt="크게 보기" className="max-h-full max-w-full rounded-lg" />
          <button type="button" className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/15 text-white text-xl" aria-label="닫기">✕</button>
        </div>
      )}
    </div>
  );
}

// 아래에서 올라오는 창(배경 누르면 닫힘)
function Sheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/45 animate-in fade-in duration-200" onClick={onClose}>
      <div className="w-full max-w-[480px] max-h-[92svh] overflow-y-auto rounded-t-[28px] px-6 pt-3 animate-in slide-in-from-bottom-8 duration-300"
        style={{ backgroundColor: PAGE_BG, paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }} onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-4 h-1 w-10 rounded-full" style={{ backgroundColor: SECTION_LINE }} />
        {children}
      </div>
    </div>
  );
}

// 신청서 연락처(2026-11-24): 휴대폰 번호(010·011·016·017·018·019)는 칠 때마다 010-0000-0000 으로 하이픈 자동,
// 그 형식이 아닌 번호(안심번호 050 · 집 전화 등)는 하이픈 없이 숫자만
function formatMobile(v: string): string {
  const d = v.replace(/[^0-9]/g, "").slice(0, 12);
  if (!/^01[016789]/.test(d)) return d;
  const m = d.slice(0, 11);
  if (m.length <= 3) return m;
  if (m.length <= 7) return `${m.slice(0, 3)}-${m.slice(3)}`;
  if (m.length === 10) return `${m.slice(0, 3)}-${m.slice(3, 6)}-${m.slice(6)}`;
  return `${m.slice(0, 3)}-${m.slice(3, 7)}-${m.slice(7)}`;
}

// 자체 신청서: 이름·연락처(필수) + 교회가 켠 항목 + 추가 질문 + 개인정보 동의
function ApplyForm({ r, onCancel, onDone }: { r: Retreat; onCancel: () => void; onDone: () => void }) {
  const [v, setV] = useState<Record<string, string>>({});
  const [agree, setAgree] = useState(false);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: string, x: string) => setV((p) => ({ ...p, [k]: x }));
  const on = (k: RetreatFieldKey) => r.form.fields[k];
  const input = "w-full rounded-xl bg-white px-4 py-3.5 text-[15px] outline-none transition-shadow focus:ring-2";
  const inputStyle = { border: `1px solid ${SECTION_LINE}`, color: INK, ["--tw-ring-color" as string]: "rgba(47,92,82,0.2)" } as React.CSSProperties;
  const label = "mb-1.5 block text-[12px] font-bold";
  const choice = (sel: boolean) => ({ border: `1px solid ${sel ? ACCENT : SECTION_LINE}`, backgroundColor: sel ? ACCENT : "#fff", color: sel ? "#fff" : INK });

  const submit = async () => {
    setErr("");
    if (!v.name?.trim()) return setErr("이름을 입력해 주세요");
    if (!/^[0-9-\s]{9,}$/.test(v.phone || "")) return setErr("연락처를 정확히 입력해 주세요");
    for (const q of r.form.questions) if (q.label.trim() && q.required && !v[`q:${q.id}`]?.trim()) return setErr(`'${q.label}'에 답해 주세요`);
    if (!agree) return setErr("개인정보 수집 · 이용에 동의해 주세요");
    setSending(true);
    try {
      const answers: Record<string, string> = {};
      r.form.questions.filter((q) => q.label.trim()).forEach((q) => { answers[q.id] = (v[`q:${q.id}`] || "").trim(); });
      const pick = (k: RetreatFieldKey) => (on(k) ? (v[k] || "").trim() : "");
      await submitApplication(r.id, {
        name: v.name.trim(), phone: v.phone.trim(),
        gender: pick("gender"), group: pick("group"), attendance: pick("attendance"), depositor: pick("depositor"), memo: pick("memo"),
        answers, agree: true,
      });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "신청하지 못했어요. 다시 시도해 주세요.");
    } finally { setSending(false); }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-[10px] font-black tracking-[0.25em] uppercase" style={{ color: ACCENT }}>APPLICATION</p>
        <p className="mt-1 text-lg font-black" style={{ color: INK }}>수련회 신청서</p>
      </div>
      <div><label className={label} style={{ color: MUTED }}>이름 *</label><input className={input} style={inputStyle} value={v.name || ""} onChange={(e) => set("name", e.target.value)} placeholder="홍길동" /></div>
      <div><label className={label} style={{ color: MUTED }}>연락처 *</label><input className={input} style={inputStyle} inputMode="tel" value={v.phone || ""} onChange={(e) => set("phone", formatMobile(e.target.value))} placeholder="010-1234-5678" /></div>
      {on("gender") && (
        <div><label className={label} style={{ color: MUTED }}>{RETREAT_FIELD_LABELS.gender}</label>
          <div className="grid grid-cols-2 gap-2">{["남", "여"].map((g) => <button key={g} type="button" onClick={() => set("gender", g)} className="rounded-xl py-3 text-[15px] font-bold transition-colors" style={choice(v.gender === g)}>{g}</button>)}</div>
        </div>
      )}
      {on("group") && <div><label className={label} style={{ color: MUTED }}>{RETREAT_FIELD_LABELS.group}</label><input className={input} style={inputStyle} value={v.group || ""} onChange={(e) => set("group", e.target.value)} placeholder="예: 청년부 2셀" /></div>}
      {on("attendance") && (
        <div><label className={label} style={{ color: MUTED }}>{RETREAT_FIELD_LABELS.attendance}</label>
          <div className="grid grid-cols-2 gap-2">{["참석", "불참"].map((g) => <button key={g} type="button" onClick={() => set("attendance", g)} className="rounded-xl py-3 text-[15px] font-bold transition-colors" style={choice(v.attendance === g)}>{g}</button>)}</div>
        </div>
      )}
      {on("depositor") && <div><label className={label} style={{ color: MUTED }}>{RETREAT_FIELD_LABELS.depositor}</label><input className={input} style={inputStyle} value={v.depositor || ""} onChange={(e) => set("depositor", e.target.value)} placeholder="이름과 다르면 적어 주세요" /></div>}
      {/* 추가 질문: 관리자가 적은 질문을 그대로 보여 주고, 성도는 아래에 답변을 적음(질문을 안 적은 빈 칸은 안 보임) */}
      {r.form.questions.filter((q) => q.label.trim()).map((q) => (
        <div key={q.id} className="rounded-2xl px-4 py-4" style={{ backgroundColor: "#fff", border: `1px solid ${SECTION_LINE}` }}>
          <p className="text-[15px] font-bold break-keep" style={{ color: INK }}>
            <span className="mr-1.5 font-black" style={{ color: ACCENT }}>Q.</span>{q.label}{q.required && <span className="ml-1 text-[12px] font-bold" style={{ color: "#B4533C" }}>필수</span>}
          </p>
          <textarea rows={2} className="mt-2.5 w-full resize-y rounded-xl px-3.5 py-3 text-[15px] outline-none" style={{ backgroundColor: PAGE_BG, border: `1px solid ${SECTION_LINE}`, color: INK }}
            value={v[`q:${q.id}`] || ""} onChange={(e) => set(`q:${q.id}`, e.target.value)} placeholder="답변을 적어 주세요" />
        </div>
      ))}
      {on("memo") && <div><label className={label} style={{ color: MUTED }}>{RETREAT_FIELD_LABELS.memo}</label><textarea className={`${input} min-h-[88px] resize-y`} style={inputStyle} value={v.memo || ""} onChange={(e) => set("memo", e.target.value)} /></div>}
      <label className="flex items-start gap-2.5 rounded-xl px-4 py-3.5 text-[13px] cursor-pointer" style={{ backgroundColor: ALT_BG, color: MUTED }}>
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4" style={{ accentColor: ACCENT }} />
        <span className="break-keep">수련회 신청 · 운영을 위해 이름 · 연락처 등 입력한 정보를 수집하고, 수련회가 끝나면 교회가 정리하는 것에 동의합니다. (필수)</span>
      </label>
      {err && <p className="text-sm font-bold" style={{ color: "#B4533C" }}>{err}</p>}
      <div className="grid grid-cols-[1fr_2fr] gap-2 mt-1">
        <button type="button" onClick={onCancel} className="h-14 rounded-2xl text-[15px] font-bold" style={{ backgroundColor: ALT_BG, color: INK }}>취소</button>
        <button type="button" disabled={sending} onClick={submit} className="h-14 rounded-2xl text-[16px] font-extrabold text-white disabled:opacity-60 active:scale-[0.98]" style={{ backgroundColor: ACCENT }}>{sending ? "보내는 중…" : "신청하기"}</button>
      </div>
    </div>
  );
}
