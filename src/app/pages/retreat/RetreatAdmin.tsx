import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../../../firebase";
// 날짜: 주보 날짜와 같은 토스·머티리얼 스타일 달력 팝업
import { DatePickerField, TimePickerField } from "../../components/DatePickerField";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import {
  createRetreat, deleteApplication, getRetreatByOwner, listApplications, newQuestionId, retreatDateText, saveRetreat,
  setApplicationPaid, uploadRetreatImage, RETREAT_FIELD_LABELS,
  type Retreat, type RetreatApplication, type RetreatFieldKey,
} from "../../../utils/retreat";

// 주보 편집 > 수련회 설정(2026-11-24): 수련회 안내 · 일정표 · 조편성 · 포스터 · 신청서 설정 · 신청자 목록.
// 성도 화면은 /retreat/{id}. 지금은 교회(계정)마다 수련회 하나(가장 최근 것)만 다룸

const card = "rounded-[1.75rem] bg-white p-5 sm:p-6 shadow-xl shadow-slate-500/5";
const input = "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15";
const label = "mb-1 block text-xs font-bold text-slate-500";
const h2 = "text-lg font-bold text-gray-800";

// 은행 목록(주보 편집 > 헌금 계좌와 같음)
const RETREAT_BANKS = [
  "NH농협", "KB국민", "신한", "우리", "하나", "IBK기업", "카카오뱅크", "토스뱅크", "케이뱅크", "SC제일", "한국씨티", "우체국",
  "새마을금고", "신협", "수협", "광주은행", "전북은행", "경남은행", "부산은행", "대구은행", "제주은행", "산림조합", "저축은행",
];

// 전화번호 하이픈 자동(2026-11-24): 글 속의 0으로 시작하는 번호를 칠 때마다 정리.
//  010-1234-5678 · 02-123-4567 · 031-123-4567. 안심번호(050으로 시작)는 하이픈 없이 숫자만
function formatPhone(d: string): string {
  if (d.startsWith("050")) return d;
  if (d.startsWith("02")) {
    if (d.length <= 2) return d;
    if (d.length <= 5) return `${d.slice(0, 2)}-${d.slice(2)}`;
    if (d.length <= 9) return `${d.slice(0, 2)}-${d.slice(2, d.length - 4)}-${d.slice(-4)}`.replace(/-$/, "");
    return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6, 10)}`;
  }
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length <= 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7, 11)}`;
}
function formatPhonesInText(t: string): string {
  return t.replace(/(?<!\d)0[\d-]{2,}/g, (m) => formatPhone(m.replace(/-/g, "").slice(0, 12)));
}

export function RetreatAdmin() {
  const [uid, setUid] = useState<string | null>(null);
  const [r, setR] = useState<Retreat | null>(null);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [apps, setApps] = useState<RetreatApplication[] | null>(null);
  const [uploading, setUploading] = useState<"" | "cover" | "poster" | "group">("");
  const [copied, setCopied] = useState(false);
  const [bankCustom, setBankCustom] = useState(false); // 은행 "기타(직접 입력)"를 고른 상태

  useEffect(() => onAuthStateChanged(auth, async (u) => {
    if (!u) { setLoading(false); return; }
    setUid(u.uid);
    try { setR(await getRetreatByOwner(u.uid)); } catch (e) { console.error("수련회 불러오기 실패:", e); }
    setLoading(false);
  }), []);
  useEffect(() => { if (r?.id) listApplications(r.id).then(setApps).catch(() => setApps([])); }, [r?.id]);

  const up = (fn: (x: Retreat) => void) => { setR((p) => { if (!p) return p; const n = structuredClone(p); fn(n); return n; }); setDirty(true); };
  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(""), 2200); };

  const start = async () => {
    if (!uid) return;
    const snap = await getDoc(doc(db, "users", uid)).catch(() => null);
    const churchName = (snap?.data()?.churchName as string) || "";
    setR(await createRetreat(uid, churchName));
  };
  const save = async () => {
    if (!r) return;
    setSaving(true);
    try { await saveRetreat(r); setDirty(false); flash("저장했어요"); }
    catch (e) { console.error("수련회 저장 실패:", e); flash("저장하지 못했어요. 다시 시도해 주세요."); }
    finally { setSaving(false); }
  };
  const upload = async (kind: "cover" | "poster" | "group", f?: File | null) => {
    if (!f || !uid) return;
    setUploading(kind);
    try { const url = await uploadRetreatImage(uid, kind, f); up((x) => { if (kind === "cover") x.coverUrl = url; else if (kind === "poster") x.posterUrl = url; else x.groupImageUrl = url; }); }
    catch (e) { console.error("이미지 올리기 실패:", e); flash("이미지를 올리지 못했어요"); }
    finally { setUploading(""); }
  };

  // 주소 찾기: 주보 편집 화면 교회 주소와 같은 다음(카카오) 우편번호 검색. 장소가 비어 있으면 건물 이름도 채움
  useEffect(() => {
    if ((window as unknown as { daum?: { Postcode?: unknown } }).daum?.Postcode || document.getElementById("daum-postcode-js")) return;
    const sc = document.createElement("script");
    sc.id = "daum-postcode-js"; sc.src = "//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js"; sc.async = true;
    document.head.appendChild(sc);
  }, []);
  const findAddress = () => {
    const daum = (window as unknown as { daum?: { Postcode?: new (o: { oncomplete: (d: { address: string; buildingName?: string }) => void }) => { open: () => void } } }).daum;
    if (!daum?.Postcode) { flash("주소 검색을 불러오는 중이에요. 잠시 후 다시 눌러 주세요."); return; }
    new daum.Postcode({
      oncomplete: (d) => up((x) => { x.address = d.address; if (!x.location.trim() && d.buildingName) x.location = d.buildingName; }),
    }).open();
  };

  const url = r ? `${window.location.origin}/retreat/${r.id}` : "";
  const paidCount = useMemo(() => (apps || []).filter((a) => a.paid).length, [apps]);

  if (loading) return <div className="container mx-auto px-4 py-10 max-w-4xl text-center text-sm text-slate-400">불러오는 중이에요…</div>;
  if (!r) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <div className={`${card} text-center py-12 animate-in fade-in slide-in-from-bottom-2 duration-300`}>
          <p className="text-4xl">⛺</p>
          <h2 className="mt-3 text-xl font-black text-slate-900">수련회 안내 페이지를 만들어 보세요</h2>
          <p className="mt-2 text-sm text-slate-500 break-keep leading-relaxed">일시 · 장소 · 회비 안내, 일정표, 조편성, 포스터를 한 페이지에 모으고<br />신청서도 바로 받을 수 있어요. 신청자 목록은 여기서 확인해요.</p>
          <button type="button" onClick={start} className="mt-6 rounded-full bg-blue-600 hover:bg-blue-700 px-6 py-3 text-sm font-bold text-white active:scale-95">수련회 만들기</button>
        </div>
      </div>
    );
  }

  const csv = () => {
    const qs = r.form.questions;
    const head = ["신청 시각", "이름", "연락처", "성별", "소속", "참석", "입금자명", "입금 확인", ...qs.map((q) => q.label), "하고 싶은 말"];
    const rows = (apps || []).map((a) => [
      a.createdAt?.toDate?.().toLocaleString("ko-KR") || "", a.name, a.phone, a.gender || "", a.group || "", a.attendance || "", a.depositor || "", a.paid ? "확인" : "",
      ...qs.map((q) => a.answers?.[q.id] || ""), a.memo || "",
    ]);
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const blob = new Blob(["﻿" + [head, ...rows].map((row) => row.map(esc).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${r.title || "수련회"}_신청자.csv`; a.click();
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* 공개 · 주소 · 저장 */}
      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className={h2}>수련회 안내 페이지</h2>
            <p className="mt-0.5 text-xs text-slate-400">켜면 아래 주소로 누구나 볼 수 있어요. 주보·카톡으로 주소를 나눠 주세요.</p>
          </div>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <span className={`text-sm font-bold ${r.enabled ? "text-blue-600" : "text-slate-400"}`}>{r.enabled ? "공개 중" : "비공개"}</span>
            <input type="checkbox" checked={r.enabled} onChange={(e) => up((x) => { x.enabled = e.target.checked; })} className="h-5 w-5 accent-blue-600" />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl bg-slate-50 px-4 py-3">
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700">{url}</span>
          <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* 무시 */ } }} className="rounded-lg bg-white border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600">{copied ? "복사됨" : "주소 복사"}</button>
          <a href={url} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-white border border-slate-200 px-3 py-1.5 text-xs font-bold text-blue-600">열어 보기</a>
        </div>
        {!r.enabled && dirty === false && <p className="mt-2 text-xs text-slate-400">비공개일 때는 성도 화면에 "아직 열리지 않았어요"가 보여요.</p>}
      </div>

      {/* 기본 안내 */}
      <div className={card}>
        <h2 className={`${h2} mb-4`}>기본 안내</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><label className={label}>큰 제목</label><input className={input} value={r.title} onChange={(e) => up((x) => { x.title = e.target.value; })} placeholder="예: 2026 청년부 여름 수련회" /></div>
          <div className="sm:col-span-2"><label className={label}>대주제</label><input className={input} value={r.theme} onChange={(e) => up((x) => { x.theme = e.target.value; })} placeholder='예: "나라가 임하시오며"' /></div>
          <div className="sm:col-span-2"><label className={label}>말씀</label><input className={input} value={r.verse} onChange={(e) => up((x) => { x.verse = e.target.value; })} placeholder="나라가 임하시오며 뜻이 하늘에서 이루어진 것 같이…" /></div>
          <div><label className={label}>말씀 출처</label><input className={input} value={r.verseRef} onChange={(e) => up((x) => { x.verseRef = e.target.value; })} placeholder="마태복음 6:10" /></div>
          <div />
          <div><label className={label}>시작일 (카운트다운 기준)</label><DatePickerField value={r.startDate} onChange={(v) => up((x) => { x.startDate = v; if (!x.endDate || x.endDate < v) x.endDate = v; })} placeholder="시작일 선택" /></div>
          <div><label className={label}>종료일</label><DatePickerField value={r.endDate} onChange={(v) => up((x) => { x.endDate = v; })} placeholder="종료일 선택" /></div>
          <div className="sm:col-span-2"><label className={label}>일시 문구 (비우면 자동: {retreatDateText({ ...r, dateText: "" }) || "시작일을 고르세요"})</label><input className={input} value={r.dateText} onChange={(e) => up((x) => { x.dateText = e.target.value; })} placeholder="직접 쓰고 싶을 때만" /></div>
          <div><label className={label}>장소</label><input className={input} value={r.location} onChange={(e) => up((x) => { x.location = e.target.value; })} placeholder="예: ○○수양관" /></div>
          <div><label className={label}>주소</label>
            <div className="flex gap-1.5">
              <input className={input} value={r.address} onChange={(e) => up((x) => { x.address = e.target.value; })} placeholder="주소 찾기를 눌러 주세요" />
              <button type="button" onClick={findAddress} className="shrink-0 rounded-xl bg-slate-900 px-3.5 text-xs font-bold text-white active:scale-95">주소 찾기</button>
            </div>
          </div>
          <div><label className={label}>회비</label>
            {/* 숫자만 입력 → 1,000,000 처럼 반점 자동, 저장은 "55,000원" 형태 */}
            <div className="relative">
              <input className={`${input} pr-9 text-right tabular-nums`} inputMode="numeric" value={r.fee.replace(/원$/, "")}
                onChange={(e) => up((x) => { const d = e.target.value.replace(/[^0-9]/g, "").replace(/^0+(?=\d)/, ""); x.fee = d ? `${Number(d).toLocaleString("ko-KR")}원` : ""; })} placeholder="55,000" />
              <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">원</span>
            </div>
          </div>
          <div><label className={label}>문의 (번호는 하이픈 자동 · 안심번호 050은 하이픈 없이)</label><input className={input} value={r.contact} onChange={(e) => up((x) => { x.contact = formatPhonesInText(e.target.value); })} placeholder="예: 회장 010-0000-0000" /></div>
          <div><label className={label}>은행</label>
            {/* 헌금 계좌와 같은 은행 목록 · 머티리얼 스타일 선택 상자. "기타"면 직접 입력 */}
            {(() => {
              const custom = !!r.bankName && !RETREAT_BANKS.includes(r.bankName) || bankCustom;
              return (
                <div className="space-y-1.5">
                  <Select value={custom ? "custom" : r.bankName || undefined} onValueChange={(v) => { if (v === "custom") { setBankCustom(true); up((x) => { x.bankName = ""; }); } else { setBankCustom(false); up((x) => { x.bankName = v; }); } }}>
                    <SelectTrigger className="w-full rounded-xl border-slate-200 bg-white !h-[42px] px-3.5 text-sm font-medium focus:ring-blue-500/30">
                      <SelectValue placeholder="은행 선택" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl max-h-64 border-slate-100 shadow-xl">
                      {RETREAT_BANKS.map((b) => <SelectItem key={b} value={b} className="rounded-xl font-medium">{b}</SelectItem>)}
                      <SelectItem value="custom" className="rounded-xl font-medium">기타 (직접 입력)</SelectItem>
                    </SelectContent>
                  </Select>
                  {custom && <input className={input} value={r.bankName} onChange={(e) => up((x) => { x.bankName = e.target.value; })} placeholder="은행 이름 입력" autoFocus />}
                </div>
              );
            })()}
          </div>
          <div><label className={label}>계좌번호</label><input className={input} value={r.accountNumber} onChange={(e) => up((x) => { x.accountNumber = e.target.value; })} /></div>
          <div><label className={label}>예금주</label><input className={input} value={r.accountHolder} onChange={(e) => up((x) => { x.accountHolder = e.target.value; })} /></div>
          <div />
          <div className="sm:col-span-2"><label className={label}>준비물 (쉼표로 나눠 주세요)</label><input className={input} value={r.items} onChange={(e) => up((x) => { x.items = e.target.value; })} placeholder="성경책, 여벌옷, 세면도구, 수건" /></div>
          <div className="sm:col-span-2"><label className={label}>주의사항</label><input className={input} value={r.caution} onChange={(e) => up((x) => { x.caution = e.target.value; })} placeholder="예: 캐리어 반입 금지" /></div>
        </div>
      </div>

      {/* 일정표 */}
      <div className={card}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className={h2}>일정표</h2>
          <button type="button" onClick={() => up((x) => { x.schedule.push({ title: `${x.schedule.length + 1}일차`, rows: [{ time: "", label: "" }] }); })} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600">＋ 날 추가</button>
        </div>
        <div className="space-y-4">
          {r.schedule.map((d, di) => (
            <div key={di} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-3.5">
              <div className="mb-2 flex items-center gap-2">
                <input className={`${input} max-w-[160px] font-bold`} value={d.title} onChange={(e) => up((x) => { x.schedule[di].title = e.target.value; })} />
                <span className="flex-1" />
                {r.schedule.length > 1 && <button type="button" onClick={() => { if (confirm(`${d.title || "이 날"} 일정을 지울까요?`)) up((x) => { x.schedule.splice(di, 1); }); }} className="text-xs font-bold text-red-500">날 삭제</button>}
              </div>
              <div className="space-y-1.5">
                {d.rows.map((row, ri) => (
                  <div key={ri} className="grid grid-cols-[88px_minmax(0,1fr)_auto_auto] items-center gap-1.5">
                    <input className={input} value={row.time} onChange={(e) => up((x) => { x.schedule[di].rows[ri].time = e.target.value; })} placeholder="13:00" />
                    <input className={input} value={row.label} onChange={(e) => up((x) => { x.schedule[di].rows[ri].label = e.target.value; })} placeholder="개회예배" />
                    <button type="button" title="강조" onClick={() => up((x) => { x.schedule[di].rows[ri].highlight = !row.highlight; })} className={`rounded-lg px-2 py-2 text-xs font-bold ${row.highlight ? "bg-blue-50 text-blue-600" : "text-slate-300"}`}>★</button>
                    <button type="button" onClick={() => up((x) => { x.schedule[di].rows.splice(ri, 1); })} className="rounded-lg px-2 py-2 text-xs text-slate-400 hover:text-red-500">✕</button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => up((x) => { x.schedule[di].rows.push({ time: "", label: "" }); })} className="mt-2 text-xs font-bold text-blue-600">＋ 순서 추가</button>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-400">★를 누르면 그 순서가 파란색으로 강조돼요(예: 집회 · 특강).</p>
      </div>

      {/* 조편성 · 포스터 */}
      <div className={card}>
        <h2 className={`${h2} mb-4`}>커버 · 조편성 · 포스터</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {(["cover", "group", "poster"] as const).map((k) => {
            const src = k === "cover" ? r.coverUrl : k === "group" ? r.groupImageUrl : r.posterUrl;
            return (
              <div key={k}>
                <p className={label}>{k === "cover" ? "커버 사진 (첫 화면 전체)" : k === "group" ? "조편성 이미지" : "포스터 이미지"}</p>
                <div className="aspect-[3/4] overflow-hidden rounded-2xl border border-dashed border-slate-200 bg-slate-50 grid place-items-center">
                  {src ? <img src={src} alt="" className="h-full w-full object-contain" /> : <span className="text-xs text-slate-400">아직 없어요</span>}
                </div>
                <div className="mt-2 flex gap-2">
                  <label className="cursor-pointer rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white">
                    {uploading === k ? "올리는 중…" : src ? "바꾸기" : "올리기"}
                    <input type="file" accept="image/*" className="hidden" disabled={!!uploading} onChange={(e) => upload(k, e.target.files?.[0])} />
                  </label>
                  {src && <button type="button" onClick={() => up((x) => { if (k === "cover") x.coverUrl = ""; else if (k === "group") x.groupImageUrl = ""; else x.posterUrl = ""; })} className="text-xs font-bold text-slate-400">지우기</button>}
                </div>
                {/* 이미지 크기 안내 — 성도 화면에서 실제로 보이는 방식 기준 */}
                <ul className="mt-2.5 space-y-1 rounded-xl bg-slate-50 px-3 py-2.5 text-[11.5px] leading-relaxed text-slate-500 break-keep">
                  {(k === "cover" ? [
                    "추천 크기: 세로 1080 × 1920px (9:16, 휴대폰 화면 비율)",
                    "휴대폰 첫 화면을 꽉 채워서, 비율이 다르면 위아래나 양옆이 조금 잘려요",
                    "아래쪽에 제목 글씨가 올라가니, 중요한 부분은 사진 위쪽·가운데에 두세요",
                  ] : k === "group" ? [
                    "추천 크기: 가로 1080px 이상 (세로 길이는 자유)",
                    "자르지 않고 화면 폭에 맞춰 그대로 보여요",
                    "이름 글씨가 작으면 성도가 눌러서 크게 볼 수 있어요",
                  ] : [
                    "추천 크기: 세로 1080 × 1528px (A4 세로 비율)",
                    "자르지 않고 화면 폭에 맞춰 그대로 보여요",
                    "인쇄용 포스터 이미지를 그대로 올려도 돼요",
                  ]).map((t) => <li key={t}>· {t}</li>)}
                </ul>
              </div>
            );
          })}
        </div>
        <div className="mt-4">
          <label className={label}>조편성 공개 시각 (비우면 바로 공개 · 그 전에는 성도 화면에 카운트다운)</label>
          {/* 날짜(달력) + 시간(오전·오후 · 시 · 분) — 값은 "YYYY-MM-DDTHH:mm" */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-[200px]"><DatePickerField compact value={r.groupRevealAt.slice(0, 10)} onChange={(v) => up((x) => { x.groupRevealAt = `${v}T${x.groupRevealAt.slice(11, 16) || "12:00"}`; })} placeholder="공개 날짜" /></div>
            <div className="w-[160px]"><TimePickerField value={r.groupRevealAt.slice(11, 16)} onChange={(t) => up((x) => { x.groupRevealAt = `${x.groupRevealAt.slice(0, 10) || new Date().toISOString().slice(0, 10)}T${t}`; })} placeholder="공개 시간" /></div>
            {r.groupRevealAt && <button type="button" onClick={() => up((x) => { x.groupRevealAt = ""; })} className="text-xs font-bold text-slate-400">지우기</button>}
          </div>
        </div>
      </div>

      {/* 신청서 설정 */}
      <div className={card}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className={h2}>신청서</h2>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <span className={`text-sm font-bold ${r.form.open ? "text-blue-600" : "text-slate-400"}`}>{r.form.open ? "신청 받는 중" : "신청 닫힘"}</span>
            <input type="checkbox" checked={r.form.open} onChange={(e) => up((x) => { x.form.open = e.target.checked; })} className="h-5 w-5 accent-blue-600" />
          </label>
        </div>
        <p className={label}>받을 항목 (이름 · 연락처는 항상 받아요)</p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(RETREAT_FIELD_LABELS) as RetreatFieldKey[]).map((k) => (
            <button key={k} type="button" onClick={() => up((x) => { x.form.fields[k] = !x.form.fields[k]; })}
              className={`rounded-full border px-3 py-1.5 text-xs font-bold ${r.form.fields[k] ? "border-blue-500 bg-blue-50 text-blue-600" : "border-slate-200 text-slate-400"}`}>{r.form.fields[k] ? "✓ " : ""}{RETREAT_FIELD_LABELS[k]}</button>
          ))}
        </div>
        <p className={`${label} mt-4`}>추가 질문</p>
        <div className="space-y-1.5">
          {r.form.questions.map((q, i) => (
            <div key={q.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1.5">
              <input className={input} value={q.label} onChange={(e) => up((x) => { x.form.questions[i].label = e.target.value; })} placeholder="질문을 적어 주세요 (예: 교회 차량을 이용하시나요?)" />
              <label className="flex items-center gap-1 text-xs font-bold text-slate-500 px-1"><input type="checkbox" checked={q.required} onChange={(e) => up((x) => { x.form.questions[i].required = e.target.checked; })} className="accent-blue-600" />필수</label>
              <button type="button" onClick={() => up((x) => { x.form.questions.splice(i, 1); })} className="rounded-lg px-2 py-2 text-xs text-slate-400 hover:text-red-500">✕</button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => up((x) => { x.form.questions.push({ id: newQuestionId(), label: "", required: false }); })} className="mt-2 text-xs font-bold text-blue-600">＋ 질문 추가</button>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div><label className={label}>정원 (0 = 제한 없음)</label><input type="number" min={0} className={input} value={r.form.capacity} onChange={(e) => up((x) => { x.form.capacity = Math.max(0, Number(e.target.value) || 0); })} /></div>
          <div><label className={label}>신청 마감일 (그날 끝까지 받아요)</label><div className="flex items-center gap-2"><div className="flex-1"><DatePickerField value={r.form.deadline} onChange={(v) => up((x) => { x.form.deadline = v; })} placeholder="마감일 없음" /></div>{r.form.deadline && <button type="button" onClick={() => up((x) => { x.form.deadline = ""; })} className="shrink-0 text-xs font-bold text-slate-400">지우기</button>}</div></div>
        </div>
      </div>

      {/* 신청자 목록 */}
      <div className={card}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className={h2}>신청자 <span className="text-blue-600">{apps?.length ?? 0}</span>명 <span className="text-sm font-semibold text-slate-400">· 입금 확인 {paidCount}명</span></h2>
          <div className="flex gap-2">
            <button type="button" onClick={() => listApplications(r.id).then(setApps)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600">새로고침</button>
            <button type="button" disabled={!apps?.length} onClick={csv} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40">엑셀(CSV) 내려받기</button>
          </div>
        </div>
        {apps === null ? <p className="py-6 text-center text-sm text-slate-400">불러오는 중이에요…</p>
          : apps.length === 0 ? <p className="py-6 text-center text-sm text-slate-400">아직 신청자가 없어요</p>
          : (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full min-w-[560px] text-left text-sm border-collapse">
                <thead><tr className="border-b-2 border-slate-800 text-xs text-slate-500">
                  <th className="px-2 py-2">이름</th><th className="px-2 py-2">연락처</th><th className="px-2 py-2">소속</th><th className="px-2 py-2">참석</th><th className="px-2 py-2">입금자</th><th className="px-2 py-2 text-center">입금 확인</th><th className="px-2 py-2" />
                </tr></thead>
                <tbody>
                  {apps.map((a) => (
                    <tr key={a.id} className="border-b border-slate-100 align-top">
                      <td className="px-2 py-2.5 font-bold text-slate-800">{a.name}{a.gender ? <span className="ml-1 text-xs font-semibold text-slate-400">{a.gender}</span> : null}
                        {(a.memo || Object.values(a.answers || {}).some(Boolean)) && (
                          <div className="mt-1 text-xs font-normal text-slate-500 space-y-0.5">
                            {r.form.questions.map((q) => a.answers?.[q.id] ? <div key={q.id}>{q.label}: {a.answers[q.id]}</div> : null)}
                            {a.memo && <div>💬 {a.memo}</div>}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2.5 whitespace-nowrap"><a href={`tel:${a.phone}`} className="text-blue-600">{a.phone}</a></td>
                      <td className="px-2 py-2.5">{a.group}</td>
                      <td className="px-2 py-2.5 whitespace-nowrap">{a.attendance}</td>
                      <td className="px-2 py-2.5">{a.depositor}</td>
                      <td className="px-2 py-2.5 text-center">
                        <input type="checkbox" checked={a.paid} className="h-4 w-4 accent-blue-600"
                          onChange={async (e) => { const v = e.target.checked; setApps((p) => p?.map((x) => x.id === a.id ? { ...x, paid: v } : x) ?? p); try { await setApplicationPaid(r.id, a.id, v); } catch { flash("저장하지 못했어요"); } }} />
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        <button type="button" onClick={async () => { if (!confirm(`${a.name} 님의 신청을 지울까요?`)) return; await deleteApplication(r.id, a.id); setApps((p) => p?.filter((x) => x.id !== a.id) ?? p); }} className="text-xs text-slate-400 hover:text-red-500">삭제</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>

      {/* 저장(아래에 붙어 있음) */}
      <div className="sticky bottom-4 z-30 flex justify-end">
        <div className="flex items-center gap-3 rounded-full bg-white/90 backdrop-blur px-3 py-2 shadow-lg border border-slate-100">
          {msg ? <span className="text-sm font-bold text-blue-600 pl-2">{msg}</span> : dirty ? <span className="text-sm font-semibold text-slate-500 pl-2">저장하지 않은 변경이 있어요</span> : <span className="text-sm text-slate-400 pl-2">모두 저장됨</span>}
          <button type="button" disabled={saving || !dirty} onClick={save} className="rounded-full bg-blue-600 hover:bg-blue-700 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40 active:scale-95">{saving ? "저장 중…" : "저장하기"}</button>
        </div>
      </div>
    </div>
  );
}
