import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { toast } from "sonner";
import { Plus, Trash2, ChevronUp, ChevronDown, Bookmark, ListChecks, Copy } from "lucide-react";
import { auth, db } from "../../firebase";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { useConfirm } from "./ConfirmDialog";

// 예배 형식(2026-11-25) — 주보 편집의 별도 화면(왼쪽 메뉴 "예배 형식")에서 예배 순서를 형식(템플릿)으로 만들어 두고,
// 주보 내용 > 예배 순서의 "예배 형식 불러오기"로 그 주에 맞는 형식을 골라 씀.
// 예: 1예배 형식 = 경배와 찬양 · 기도회 · 말씀선포 · 축도 / 2예배 형식 = 묵상과 기도로 예배를 시작 · 기도회 · 말씀선포 · 기도회 · 축도
// 담는 것: 항목 · 내용(담당자) · 짧은 문구 · 상세 전문. 저장 위치: 교회 계정 users/{uid}.worshipTemplates
export type OrderItem = { id: string; label: string; value: string; preview?: string; content?: string; hidden?: boolean };
type Row = { label: string; value: string; preview?: string; content?: string };
export type WorshipForm = { id: string; name: string; items: Row[]; updatedAt: number };

// 교회 계정의 예배 형식 목록 읽기/쓰기
export function useWorshipForms() {
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid || null);
  const [list, setList] = useState<WorshipForm[] | null>(null);
  useEffect(() => onAuthStateChanged(auth, (u) => setUid(u?.uid || null)), []);
  useEffect(() => {
    if (!uid) return;
    getDoc(doc(db, "users", uid)).then((s) => setList((s.data()?.worshipTemplates as WorshipForm[]) || [])).catch(() => setList([]));
  }, [uid]);
  const save = async (next: WorshipForm[]) => {
    if (!uid) throw new Error("no user");
    await setDoc(doc(db, "users", uid), { worshipTemplates: next }, { merge: true });
    setList(next);
  };
  return { list, save };
}
const toRows = (s: OrderItem[]): Row[] => s.filter((x) => x.label.trim() || x.value.trim())
  .map((x) => ({ label: x.label, value: x.value, ...(x.preview ? { preview: x.preview } : {}), ...(x.content ? { content: x.content } : {}) }));

// ── 별도 화면: 예배 형식 만들기·고치기 ─────────────────────────────────────────
export function WorshipFormsManager({ currentSections, onApply }: { currentSections: OrderItem[]; onApply: (items: OrderItem[]) => void }) {
  const { list, save } = useWorshipForms();
  const { ask, node } = useConfirm();
  const [selId, setSelId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [dirty, setDirty] = useState(false);
  const [openRow, setOpenRow] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // 처음 열 때 첫 형식을 고름
  useEffect(() => {
    if (list && selId === null && list.length) pick(list[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list]);

  function pick(f: WorshipForm) { setSelId(f.id); setName(f.name); setRows(f.items.map((x) => ({ ...x }))); setDirty(false); setOpenRow(null); }
  const guard = (go: () => void) => {
    if (!dirty) { go(); return; }
    ask({ title: "저장하지 않은 내용이 있어요", desc: "저장하지 않고 넘어가면 고친 내용이 사라져요.", confirmLabel: "저장 안 하고 넘어가기", danger: true, onConfirm: go });
  };
  const startNew = (from?: Row[]) => guard(() => {
    setSelId("new"); setName(""); setRows(from && from.length ? from : [{ label: "", value: "" }]); setDirty(true); setOpenRow(null);
  });
  const edit = (i: number, p: Partial<Row>) => { setRows((r) => r.map((x, k) => (k === i ? { ...x, ...p } : x))); setDirty(true); };
  const move = (i: number, d: -1 | 1) => { setRows((r) => { const n = [...r]; const j = i + d; if (j < 0 || j >= n.length) return r; [n[i], n[j]] = [n[j], n[i]]; return n; }); setDirty(true); };

  const submit = async () => {
    const n = name.trim();
    const clean = rows.filter((x) => x.label.trim() || x.value.trim());
    if (!n) { toast.error("형식 이름을 적어 주세요."); return; }
    if (!clean.length) { toast.error("순서를 하나 이상 적어 주세요."); return; }
    setSaving(true);
    try {
      const cur = list || [];
      if (selId === "new" || !selId) {
        const f: WorshipForm = { id: `w${Date.now().toString(36)}`, name: n, items: clean, updatedAt: Date.now() };
        await save([...cur, f]);
        setSelId(f.id);
      } else {
        await save(cur.map((f) => (f.id === selId ? { ...f, name: n, items: clean, updatedAt: Date.now() } : f)));
      }
      setRows(clean); setDirty(false);
      toast.success(`"${n}" 저장했어요.`);
    } catch {
      toast.error("저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  };
  const removeForm = () => {
    const f = (list || []).find((x) => x.id === selId);
    if (!f) return;
    ask({ title: "형식을 지울까요?", desc: "지워도 이미 만든 주보는 그대로예요.", rows: [{ label: "형식", value: f.name }], confirmLabel: "지우기", danger: true,
      onConfirm: async () => { const next = (list || []).filter((x) => x.id !== f.id); await save(next); if (next.length) pick(next[0]); else { setSelId(null); setName(""); setRows([]); } toast.success("지웠어요."); } });
  };
  const applyNow = () => {
    const clean = rows.filter((x) => x.label.trim() || x.value.trim());
    if (!clean.length) return;
    ask({ title: "이번 주보에 적용할까요?", desc: "이번 주보의 예배 순서가 이 형식으로 바뀌어요. 주보 편집의 저장하기를 눌러야 반영돼요.",
      rows: [{ label: "형식", value: name || "이름 없음" }, { label: "순서", value: `${clean.length}개` }], confirmLabel: "적용하기",
      onConfirm: () => { onApply(clean.map((x, i) => ({ id: `${Date.now()}${i}`, ...x }))); toast.success("이번 주보 예배 순서에 적용했어요."); } });
  };

  const inputCls = "h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-[15px] outline-none focus:border-purple-400";
  return (
    <div className="container mx-auto px-4 py-6 max-w-5xl">
      {node}
      <div className="mb-5">
        <h2 className="text-xl sm:text-2xl font-black text-slate-900 flex items-center gap-2"><ListChecks className="w-6 h-6 text-purple-500" /> 예배 형식</h2>
        <p className="mt-1 text-[13.5px] text-slate-500 break-keep">예배 순서를 형식으로 만들어 두고, 주보 내용 › 예배 순서에서 <b>예배 형식 불러오기</b>로 골라 쓰세요.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-[240px_minmax(0,1fr)] items-start">
        {/* 왼쪽: 형식 목록 */}
        <div className="rounded-[1.5rem] bg-white p-3 shadow-xl shadow-purple-500/5">
          <button type="button" onClick={() => startNew()} className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-purple-600 py-2.5 text-[14px] font-bold text-white hover:bg-purple-700">
            <Plus className="w-4 h-4" /> 새 형식 만들기
          </button>
          {list === null ? (
            <p className="py-6 text-center text-sm text-slate-400">불러오는 중이에요…</p>
          ) : list.length === 0 && selId !== "new" ? (
            <div className="py-6 text-center">
              <Bookmark className="mx-auto h-5 w-5 text-slate-300" />
              <p className="mt-1.5 text-[13px] text-slate-400 break-keep">아직 만든 형식이 없어요</p>
              {toRows(currentSections).length > 0 && (
                <button type="button" onClick={() => startNew(toRows(currentSections))} className="mt-2 text-[12.5px] font-bold text-purple-600 hover:underline">이번 주보 순서로 시작하기</button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {selId === "new" && <div className="rounded-xl bg-purple-50 px-3 py-2.5 text-[14px] font-bold text-purple-700">{name || "새 형식"} <span className="text-[11px] font-medium text-purple-400">(저장 전)</span></div>}
              {list.map((f) => (
                <button key={f.id} type="button" onClick={() => guard(() => pick(f))}
                  className={`rounded-xl px-3 py-2.5 text-left transition-colors ${selId === f.id ? "bg-purple-50 text-purple-700" : "text-slate-700 hover:bg-slate-50"}`}>
                  <span className="block truncate text-[14px] font-bold">{f.name}</span>
                  <span className="block truncate text-[11.5px] text-slate-400">{f.items.length}개 순서</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 오른쪽: 형식 편집 */}
        <div className="rounded-[1.5rem] bg-white p-5 shadow-xl shadow-purple-500/5">
          {selId === null ? (
            <div className="py-16 text-center text-[14px] text-slate-400 break-keep">왼쪽에서 형식을 고르거나 <b className="text-purple-600">새 형식 만들기</b>를 눌러 주세요.</div>
          ) : (
            <>
              <label className="block text-[13px] font-bold text-slate-600">형식 이름</label>
              <input value={name} onChange={(e) => { setName(e.target.value.slice(0, 20)); setDirty(true); }} placeholder="예: 1예배 형식, 기도회 예배" className={`${inputCls} mt-1.5`} />

              <div className="mt-5 flex items-center justify-between">
                <p className="text-[13px] font-bold text-slate-600">예배 순서 <span className="font-medium text-slate-400">{rows.length}개</span></p>
                {toRows(currentSections).length > 0 && (
                  <button type="button" onClick={() => ask({ title: "이번 주보 순서를 가져올까요?", desc: "지금 편집 중인 형식의 순서가 이번 주보의 예배 순서로 바뀌어요.", confirmLabel: "가져오기",
                    onConfirm: () => { setRows(toRows(currentSections)); setDirty(true); } })}
                    className="inline-flex items-center gap-1 text-[12.5px] font-bold text-slate-500 hover:text-purple-600"><Copy className="w-3.5 h-3.5" /> 이번 주보 순서 가져오기</button>
                )}
              </div>
              <div className="mt-2 flex flex-col gap-2">
                {rows.map((r, i) => (
                  <div key={i} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-3">
                    <div className="flex items-center gap-2">
                      <span className="w-6 shrink-0 text-center text-[13px] font-bold text-slate-400">{i + 1}</span>
                      <input value={r.label} onChange={(e) => edit(i, { label: e.target.value })} placeholder="항목 (예: 경배와 찬양)" className={`${inputCls} flex-[3]`} />
                      <input value={r.value} onChange={(e) => edit(i, { value: e.target.value })} placeholder="담당 (예: 다같이)" className={`${inputCls} flex-[2]`} />
                      <div className="flex shrink-0 flex-col">
                        <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30"><ChevronUp className="w-4 h-4" /></button>
                        <button type="button" disabled={i === rows.length - 1} onClick={() => move(i, 1)} className="rounded p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30"><ChevronDown className="w-4 h-4" /></button>
                      </div>
                      <button type="button" onClick={() => { setRows((x) => x.filter((_, k) => k !== i)); setDirty(true); }} className="shrink-0 rounded-lg p-2 text-slate-300 hover:bg-red-50 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                    </div>
                    <button type="button" onClick={() => setOpenRow(openRow === i ? null : i)} className="ml-8 mt-1.5 text-[12px] font-medium text-slate-400 hover:text-slate-600">
                      {openRow === i ? "문구 접기 ▴" : (r.preview || r.content) ? "문구 · 전문 있음 ▾" : "+ 문구 · 전문 추가 ▾"}
                    </button>
                    {openRow === i && (
                      <div className="ml-8 mt-2 grid gap-2">
                        <textarea value={r.preview || ""} onChange={(e) => edit(i, { preview: e.target.value })} rows={2} placeholder="[선택] 항목 아래 짧게 보일 문구 (예: 찬송가 가사)" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-purple-400" />
                        <textarea value={r.content || ""} onChange={(e) => edit(i, { content: e.target.value })} rows={2} placeholder="[선택] 성도가 눌렀을 때 보일 전문 (사도신경, 주기도문 등)" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-purple-400" />
                      </div>
                    )}
                  </div>
                ))}
                <button type="button" onClick={() => { setRows((r) => [...r, { label: "", value: "" }]); setDirty(true); }}
                  className="flex items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-purple-100 py-3 text-[14px] font-bold text-purple-600 hover:bg-purple-50">
                  <Plus className="w-4 h-4" /> 순서 추가
                </button>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                {selId !== "new" && <button type="button" onClick={removeForm} className="rounded-xl px-3 py-2.5 text-[13px] font-bold text-red-500 hover:bg-red-50">형식 지우기</button>}
                <div className="ml-auto flex gap-2">
                  <button type="button" onClick={applyNow} disabled={!rows.some((x) => x.label.trim() || x.value.trim())} className="rounded-xl border border-purple-200 bg-white px-4 py-2.5 text-[14px] font-bold text-purple-700 hover:bg-purple-50 disabled:opacity-40">이번 주보에 적용</button>
                  <button type="button" onClick={submit} disabled={saving} className="rounded-xl bg-purple-600 px-5 py-2.5 text-[14px] font-bold text-white shadow-[0_6px_16px_rgba(147,51,234,0.25)] hover:bg-purple-700 disabled:opacity-50">
                    {saving ? "저장 중…" : dirty ? "형식 저장" : "저장됨 ✓"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 예배 순서 칸의 "예배 형식 불러오기" ─────────────────────────────────────────
export function WorshipFormPicker({ currentSections, onApply, onManage }: { currentSections: OrderItem[]; onApply: (items: OrderItem[]) => void; onManage: () => void }) {
  const { list } = useWorshipForms();
  const [open, setOpen] = useState(false);
  const { ask, node } = useConfirm();
  const apply = (f: WorshipForm) => {
    const doIt = () => { onApply(f.items.map((x, i) => ({ id: `${Date.now()}${i}`, ...x }))); setOpen(false); toast.success(`"${f.name}"을 불러왔어요. 저장하기를 눌러야 주보에 반영돼요.`); };
    if (!toRows(currentSections).length) { doIt(); return; }
    setOpen(false);
    ask({ title: "이 형식으로 바꿀까요?", desc: "지금 적혀 있는 예배 순서가 이 형식으로 바뀌어요.", rows: [{ label: "형식", value: f.name }, { label: "순서", value: `${f.items.length}개` }], confirmLabel: "불러오기", onConfirm: doIt });
  };
  return (
    <>
      {node}
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-full border border-purple-200 bg-purple-50 px-4 h-10 text-[13px] font-bold text-purple-700 hover:bg-purple-100">
        <ListChecks className="w-4 h-4" /> 예배 형식 불러오기
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-md max-h-[85svh] overflow-y-auto rounded-[1.75rem] border-0 bg-white p-6">
          <DialogTitle className="text-[19px] font-black text-slate-900">예배 형식 불러오기</DialogTitle>
          <DialogDescription className="mt-1 text-[13px] text-slate-500 break-keep">이번 주에 맞는 형식을 고르면 예배 순서가 그대로 채워져요.</DialogDescription>
          <div className="mt-4 flex flex-col gap-2">
            {list === null ? <p className="py-6 text-center text-sm text-slate-400">불러오는 중이에요…</p>
              : list.length === 0 ? <p className="rounded-2xl bg-slate-50 py-8 text-center text-[13.5px] text-slate-500">아직 만든 예배 형식이 없어요.</p>
              : list.map((f) => (
                <button key={f.id} type="button" onClick={() => apply(f)} className="rounded-2xl border border-slate-200 px-4 py-3 text-left transition-all hover:border-purple-300 hover:bg-purple-50/40">
                  <span className="block text-[15px] font-bold text-slate-900">{f.name}</span>
                  <span className="mt-0.5 block text-[12.5px] leading-relaxed text-slate-500 break-keep">{f.items.map((x) => x.label).filter(Boolean).join(" → ")}</span>
                </button>
              ))}
          </div>
          <button type="button" onClick={() => { setOpen(false); onManage(); }} className="mt-4 w-full rounded-xl bg-slate-100 py-3 text-[14px] font-bold text-slate-600 hover:bg-slate-200">예배 형식 만들기 · 고치기 →</button>
        </DialogContent>
      </Dialog>
    </>
  );
}
