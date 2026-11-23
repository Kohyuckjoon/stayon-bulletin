import { useEffect, useState } from "react";
import {
  collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc,
} from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db, storage } from "../../../firebase";
import { Plus, Trash2, Pencil, ImagePlus, BookOpen, ExternalLink, X } from "lucide-react";
import { isOperatorEmail } from "../../../utils/operator";
import { DatePickerField } from "../../components/DatePickerField";
import {
  DEFAULT_STORY_CATEGORIES, sortStories, storyDate, storyImage, toStory, type Story, type StoryLinkType,
} from "../../../utils/stories";

// "함께한 이야기" 운영자 화면 — /super/stories
// 메인 화면 상단 "함께한 이야기"(/story)에 보이는 카드를 추가·수정·숨기기·삭제, 분류 관리.
// stories / storyMeta 컬렉션만 씀(firestore.rules: 누구나 읽기, 운영자만 쓰기).
// 모금 프로젝트(fundraisers)는 목록에서 골라 사진·제목을 채우는 데 "읽기"만 함.

const C = { bg: "#F2F4F6", card: "#FFFFFF", ink: "#191F28", sub: "#4E5968", muted: "#8B95A1", line: "#E5E8EB", blue: "#3182F6", blueBg: "#E8F3FF", red: "#F04452", green: "#00A661", greenBg: "#E5F8EE" };
const inputCls = "w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:border-[#3182F6]";
const inputStyle = { borderColor: C.line, background: C.card, color: C.ink };
const LINK_TYPES: { v: StoryLinkType; label: string }[] = [
  { v: "give", label: "나눔 모금 화면" },
  { v: "youtube", label: "유튜브 영상" },
  { v: "url", label: "직접 넣은 링크" },
  { v: "none", label: "링크 없음" },
];
type FundOption = { id: string; title: string; churchName: string; startDate: string; cover: string };
type Draft = Omit<Story, "id">;
const emptyDraft = (category: string): Draft => ({
  category, title: "", churchName: "", desc: "", date: new Date().toISOString().slice(0, 10),
  imageUrl: "", linkType: "none", link: "", fundraiserId: "", visible: true,
});

// 사진을 줄여서 올림(긴 쪽 maxSize, jpg)
async function resizeToBlob(file: File, maxSize: number, quality = 0.85): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = URL.createObjectURL(file);
  });
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
  const cv = document.createElement("canvas");
  cv.width = Math.round(img.width * scale);
  cv.height = Math.round(img.height * scale);
  cv.getContext("2d")!.drawImage(img, 0, 0, cv.width, cv.height);
  URL.revokeObjectURL(img.src);
  return new Promise((res) => cv.toBlob((b) => res(b!), "image/jpeg", quality));
}

const Field = ({ label, children, help }: { label: string; children: React.ReactNode; help?: string }) => (
  <label className="block">
    <span className="mb-1.5 block text-[13px] font-bold" style={{ color: C.sub }}>{label}</span>
    {children}
    {help && <span className="mt-1 block text-xs" style={{ color: C.muted }}>{help}</span>}
  </label>
);

// 카드 추가·수정 폼 (오른쪽에 실제 카드 미리보기)
const StoryForm = ({ initial, categories, funds, onSubmit, onClose }: {
  initial: Draft;
  categories: string[];
  funds: FundOption[];
  onSubmit: (d: Draft) => Promise<void>;
  onClose: () => void;
}) => {
  const [d, setD] = useState<Draft>(initial);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));

  const upload = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const blob = await resizeToBlob(file, 1400);
      const r = storageRef(storage, `stories/${Date.now()}.jpg`);
      await uploadBytes(r, blob, { contentType: "image/jpeg" });
      set({ imageUrl: await getDownloadURL(r) });
    } catch (e) {
      console.error("사진 올리기 오류:", e);
      alert("사진을 올리지 못했어요.");
    } finally {
      setUploading(false);
    }
  };

  // 모금 프로젝트 고르면 비어 있는 칸만 채움
  const pickFund = (id: string) => {
    const f = funds.find((x) => x.id === id);
    if (!f) { set({ fundraiserId: "" }); return; }
    setD((x) => ({
      ...x,
      fundraiserId: f.id,
      title: x.title || `${f.churchName} ${f.title}`.trim(),
      churchName: x.churchName || f.churchName,
      date: f.startDate || x.date,
      imageUrl: x.imageUrl || f.cover,
      category: x.category || categories[0] || "",
    }));
  };

  const submit = async () => {
    if (!d.title.trim()) { alert("제목을 적어 주세요."); return; }
    if (d.linkType === "give" && !d.fundraiserId) { alert("연결할 모금 프로젝트를 골라 주세요."); return; }
    if ((d.linkType === "youtube" || d.linkType === "url") && !/^https?:\/\//.test(d.link.trim())) { alert("링크 주소를 https:// 로 시작하게 적어 주세요."); return; }
    setSaving(true);
    try { await onSubmit({ ...d, title: d.title.trim(), churchName: d.churchName.trim(), link: d.link.trim() }); }
    finally { setSaving(false); }
  };

  const preview = storyImage({ ...d, id: "" });

  return (
    <div className="rounded-2xl p-5 sm:p-6" style={{ background: C.card }}>
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <Field label="분류">
            <div className="flex flex-wrap gap-1.5">
              {categories.map((c) => (
                <button key={c} type="button" onClick={() => set({ category: c })}
                  className="rounded-lg border px-3 py-1.5 text-sm font-semibold"
                  style={d.category === c ? { background: C.ink, borderColor: C.ink, color: "#fff" } : { borderColor: C.line, color: C.sub }}>
                  {c}
                </button>
              ))}
            </div>
          </Field>
          <Field label="눌렀을 때 이동">
            <div className="flex flex-wrap gap-1.5">
              {LINK_TYPES.map((t) => (
                <button key={t.v} type="button" onClick={() => set({ linkType: t.v })}
                  className="rounded-lg border px-3 py-1.5 text-sm font-semibold"
                  style={d.linkType === t.v ? { background: C.blueBg, borderColor: C.blue, color: C.blue } : { borderColor: C.line, color: C.sub }}>
                  {t.label}
                </button>
              ))}
            </div>
          </Field>
          {d.linkType === "give" && (
            <Field label="모금 프로젝트" help="고르면 비어 있는 제목·교회 이름·사진을 자동으로 채워요. 진행 중이면 카드에 '진행 중'이 붙어요.">
              <select value={d.fundraiserId} onChange={(e) => pickFund(e.target.value)} className={inputCls} style={inputStyle}>
                <option value="">선택해 주세요</option>
                {funds.map((f) => <option key={f.id} value={f.id}>{f.churchName} · {f.title}</option>)}
              </select>
            </Field>
          )}
          {(d.linkType === "youtube" || d.linkType === "url") && (
            <Field label={d.linkType === "youtube" ? "유튜브 영상 주소" : "링크 주소"} help={d.linkType === "youtube" ? "사진을 안 올리면 영상 썸네일이 카드 사진으로 쓰여요." : undefined}>
              <input value={d.link} onChange={(e) => set({ link: e.target.value })} placeholder="https://" className={inputCls} style={inputStyle} />
            </Field>
          )}
          <Field label="제목">
            <input value={d.title} onChange={(e) => set({ title: e.target.value })} placeholder="ex. 해운대제일교회 러브링 나눔" className={inputCls} style={inputStyle} />
          </Field>
          <Field label="간단한 내용" help="카드에 제목 아래로 한두 줄 보여요.">
            <textarea value={d.desc} onChange={(e) => set({ desc: e.target.value })} rows={2} placeholder="ex. 결연 아동과 가정을 위한 2주간의 집중 모금, 함께해 주세요." className={inputCls} style={{ ...inputStyle, resize: "vertical" }} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="교회 이름">
              <input value={d.churchName} onChange={(e) => set({ churchName: e.target.value })} placeholder="ex. 해운대제일교회" className={inputCls} style={inputStyle} />
            </Field>
            <Field label="날짜" help="최신 날짜가 앞에 와요.">
              <DatePickerField value={d.date} onChange={(v) => set({ date: v })} />
            </Field>
          </div>
          <Field label="대표 사진" help="가로 사진(3:2)이 가장 예쁘게 보여요.">
            <div className="flex items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold" style={{ background: C.bg, color: C.sub }}>
                <ImagePlus className="h-4 w-4" /> {uploading ? "올리는 중…" : d.imageUrl ? "사진 바꾸기" : "사진 올리기"}
                <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
              </label>
              {d.imageUrl && <button type="button" onClick={() => set({ imageUrl: "" })} className="text-xs font-bold" style={{ color: C.red }}>사진 빼기</button>}
            </div>
          </Field>
        </div>

        {/* 미리보기 — /story 카드와 같은 모양 */}
        <div>
          <p className="mb-2 text-[13px] font-bold" style={{ color: C.sub }}>미리보기</p>
          <div className="relative aspect-[3/2] overflow-hidden rounded-xl" style={{ background: C.bg }}>
            {preview && <img src={preview} alt="" className="h-full w-full object-cover" />}
            <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/45 to-transparent" />
            <span className="absolute left-3.5 top-3 text-[13px] font-bold text-white">{d.category}</span>
          </div>
          <p className="mt-3 text-[16px] font-bold leading-snug" style={{ color: C.ink }}>{d.title || "제목"}</p>
          <p className="mt-1 text-sm" style={{ color: C.sub }}>{d.churchName || "교회 이름"}</p>
          <p className="mt-0.5 text-sm" style={{ color: C.muted }}>{storyDate(d.date)}</p>
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2 border-t pt-4" style={{ borderColor: C.line }}>
        <button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm font-bold" style={{ background: C.bg, color: C.sub }}>취소</button>
        <button type="button" disabled={saving || uploading} onClick={submit} className="rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50" style={{ background: C.blue }}>
          {saving ? "저장 중…" : "저장"}
        </button>
      </div>
    </div>
  );
};

// 분류 관리(추가·빼기)
const CategoryEditor = ({ value, onSave }: { value: string[]; onSave: (v: string[]) => Promise<void> }) => {
  const [text, setText] = useState("");
  const add = () => {
    const t = text.trim();
    if (!t) return;
    if (value.includes(t)) { alert("이미 있는 분류예요."); return; }
    void onSave([...value, t]);
    setText("");
  };
  return (
    <div className="rounded-2xl p-5" style={{ background: C.card }}>
      <p className="text-[15px] font-bold" style={{ color: C.ink }}>분류</p>
      <p className="mt-1 text-xs" style={{ color: C.muted }}>/story 위쪽 버튼으로 보여요. 카드가 하나도 없는 분류는 버튼이 안 보여요.</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {value.map((c) => (
          <span key={c} className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-semibold" style={{ borderColor: C.line, color: C.sub }}>
            {c}
            <button type="button" aria-label={`${c} 빼기`} onClick={() => { if (confirm(`"${c}" 분류를 뺄까요?\n이 분류의 카드는 그대로 남아요.`)) void onSave(value.filter((x) => x !== c)); }}>
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="새 분류 (ex. 수련회 촬영)" className={inputCls} style={inputStyle} />
        <button type="button" onClick={add} className="shrink-0 rounded-xl px-4 text-sm font-bold" style={{ background: C.bg, color: C.sub }}>추가</button>
      </div>
    </div>
  );
};

export const AdminStories = () => {
  const [authState, setAuthState] = useState<"loading" | "ok" | "denied">("loading");
  const [rows, setRows] = useState<Story[]>([]);
  const [categories, setCategories] = useState<string[]>(DEFAULT_STORY_CATEGORIES);
  const [funds, setFunds] = useState<FundOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // 운영자 이메일로 로그인돼 있어야 저장 가능(firestore.rules isOperator)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => setAuthState(user && isOperatorEmail(user.email) ? "ok" : "denied"));
    return () => unsub();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [snap, meta, fundSnap] = await Promise.all([
        getDocs(collection(db, "stories")),
        getDoc(doc(db, "storyMeta", "categories")),
        getDocs(collection(db, "fundraisers")).catch(() => null),
      ]);
      setRows(sortStories(snap.docs.map((d) => toStory(d.id, d.data()))));
      const cats = meta.data()?.list;
      if (Array.isArray(cats) && cats.length) setCategories(cats.map(String));
      if (fundSnap) {
        const list = await Promise.all(fundSnap.docs.map(async (f) => {
          let cover = "";
          try {
            const w = await getDocs(collection(db, "fundraisers", f.id, "wishes"));
            cover = String(w.docs.find((x) => x.get("imageUrl"))?.get("imageUrl") || "");
          } catch { /* 무시 */ }
          return { id: f.id, title: String(f.get("title") || ""), churchName: String(f.get("churchName") || ""), startDate: String(f.get("startDate") || ""), cover };
        }));
        setFunds(list);
      }
    } catch (e) {
      console.error("함께한 이야기 목록 오류:", e);
      alert("목록을 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { if (authState === "ok") void load(); }, [authState]);

  const save = async (id: string | null, d: Draft) => {
    try {
      const ref = id ? doc(db, "stories", id) : doc(collection(db, "stories"));
      await setDoc(ref, { ...d, updatedAt: serverTimestamp(), ...(id ? {} : { createdAt: serverTimestamp() }) }, { merge: true });
      setEditing(null);
      await load();
    } catch (e) {
      console.error("함께한 이야기 저장 오류:", e);
      alert("저장하지 못했어요. 운영자 계정으로 로그인했는지, firestore.rules가 배포됐는지 확인해 주세요.");
    }
  };

  const saveCategories = async (list: string[]) => {
    try {
      await setDoc(doc(db, "storyMeta", "categories"), { list, updatedAt: serverTimestamp() });
      setCategories(list);
    } catch (e) {
      console.error("분류 저장 오류:", e);
      alert("분류를 저장하지 못했어요.");
    }
  };

  const toggleVisible = async (s: Story) => {
    setBusyId(s.id);
    try {
      await updateDoc(doc(db, "stories", s.id), { visible: !s.visible, updatedAt: serverTimestamp() });
      setRows((prev) => prev.map((x) => (x.id === s.id ? { ...x, visible: !s.visible } : x)));
    } catch (e) {
      console.error(e);
      alert("바꾸지 못했어요.");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (s: Story) => {
    if (!confirm(`"${s.title}" 카드를 삭제할까요?\n되돌릴 수 없어요. 잠깐 내리려면 '숨기기'를 써 주세요.`)) return;
    setBusyId(s.id);
    try {
      await deleteDoc(doc(db, "stories", s.id));
      setRows((prev) => prev.filter((x) => x.id !== s.id));
    } catch (e) {
      console.error(e);
      alert("삭제하지 못했어요.");
    } finally {
      setBusyId(null);
    }
  };

  if (authState === "loading") return <p className="py-20 text-center text-sm" style={{ color: C.muted }}>확인 중…</p>;
  if (authState === "denied") {
    return (
      <div className="p-4 md:p-8">
        <div className="mx-auto max-w-md rounded-2xl p-8 text-center" style={{ background: C.card }}>
          <BookOpen className="mx-auto h-10 w-10" style={{ color: C.blue }} />
          <p className="mt-4 text-[17px] font-bold" style={{ color: C.ink }}>운영자 계정으로 로그인해 주세요</p>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: C.muted }}>메인 화면에 공개되는 카드라서, 운영자 이메일로 로그인한 상태에서만 고칠 수 있어요.</p>
          <a href="/login" className="mt-5 inline-block rounded-xl px-5 py-2.5 text-sm font-bold text-white" style={{ background: C.blue }}>로그인하러 가기</a>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8" style={{ background: C.bg, minHeight: "100%" }}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: C.ink }}>함께한 이야기 관리</h1>
          <p className="mt-1 text-sm" style={{ color: C.muted }}>메인 화면 상단 "함께한 이야기"(/story)에 보이는 카드를 관리해요.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => window.open("/story", "_blank")} className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold" style={{ background: C.card, color: C.sub }}>
            <ExternalLink className="h-4 w-4" /> 화면 보기
          </button>
          {editing === null && (
            <button type="button" onClick={() => setEditing("new")} className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold text-white" style={{ background: C.blue }}>
              <Plus className="h-4 w-4" /> 새 카드
            </button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {editing === "new" && (
          <StoryForm initial={emptyDraft(categories[0] || "")} categories={categories} funds={funds}
            onSubmit={(d) => save(null, d)} onClose={() => setEditing(null)} />
        )}

        {loading ? (
          <p className="py-10 text-center text-sm" style={{ color: C.muted }}>불러오는 중…</p>
        ) : rows.length === 0 && editing !== "new" ? (
          <div className="rounded-2xl p-10 text-center" style={{ background: C.card }}>
            <p className="text-[15px] font-bold" style={{ color: C.ink }}>아직 카드가 없어요</p>
            <p className="mt-1 text-sm" style={{ color: C.muted }}>"새 카드"로 첫 이야기를 올려 보세요.</p>
          </div>
        ) : (
          rows.map((s) => (
            editing === s.id ? (
              <StoryForm key={s.id} initial={(({ id: _id, ...rest }) => rest)(s)} categories={categories} funds={funds}
                onSubmit={(d) => save(s.id, d)} onClose={() => setEditing(null)} />
            ) : (
              <div key={s.id} className="flex flex-col gap-4 rounded-2xl p-4 sm:flex-row sm:items-center" style={{ background: C.card, opacity: s.visible ? 1 : 0.55 }}>
                <div className="aspect-[3/2] w-full shrink-0 overflow-hidden rounded-xl sm:w-36" style={{ background: C.bg }}>
                  {storyImage(s) && <img src={storyImage(s)} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-md px-2 py-0.5 text-xs font-bold" style={{ background: C.bg, color: C.sub }}>{s.category || "분류 없음"}</span>
                    {!s.visible && <span className="rounded-md px-2 py-0.5 text-xs font-bold" style={{ background: C.bg, color: C.muted }}>숨김</span>}
                    <span className="text-xs" style={{ color: C.muted }}>{LINK_TYPES.find((t) => t.v === s.linkType)?.label}</span>
                  </div>
                  <p className="mt-1.5 truncate text-[15px] font-bold" style={{ color: C.ink }}>{s.title}</p>
                  <p className="mt-0.5 text-sm" style={{ color: C.muted }}>{[s.churchName, storyDate(s.date)].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button type="button" disabled={busyId === s.id} onClick={() => toggleVisible(s)} className="rounded-lg px-3 py-1.5 text-xs font-bold"
                    style={s.visible ? { background: C.bg, color: C.sub } : { background: C.greenBg, color: C.green }}>
                    {s.visible ? "숨기기" : "보이기"}
                  </button>
                  <button type="button" onClick={() => setEditing(s.id)} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold" style={{ background: C.blueBg, color: C.blue }}>
                    <Pencil className="h-3.5 w-3.5" /> 수정
                  </button>
                  <button type="button" disabled={busyId === s.id} onClick={() => remove(s)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold" style={{ color: C.red }}>
                    <Trash2 className="h-3.5 w-3.5" /> 삭제
                  </button>
                </div>
              </div>
            )
          ))
        )}

        <CategoryEditor value={categories} onSave={saveCategories} />
      </div>
    </div>
  );
};

export default AdminStories;
