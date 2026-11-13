import { useEffect, useMemo, useState } from "react";
import {
  collection, doc, getDoc, getDocs, serverTimestamp, updateDoc, writeBatch,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../../../firebase";
import { Plus, Trash2, Pencil, Copy, HeartHandshake } from "lucide-react";
import { isOperatorEmail } from "../../../utils/operator";
import { DatePickerField } from "../../components/DatePickerField";

// 모금 프로젝트(러브링 등) 운영자 화면 — /super/fundraisers
// 프로젝트를 만들고 교회 계정(users/{uid})에 연결, 담당자 이메일 지정, 열기·닫기.
// fundraisers 컬렉션만 다룸. 주보·결제·정기결제·성도 화면 코드는 쓰지도 고치지도 않음.
//
// 데이터(firestore.rules 와 같게)
//   fundraisers/{pid}            공개: 교회 이름·제목·기간·상태·계좌·게이지 기준·랜덤 선물·합계
//   fundraisers/{pid}/meta/acl   비공개: ownerUid(교회 계정) · managerEmails(담당자)
// 쓰기 권한: firestore.rules 의 isOperator() — 운영자 이메일로 "로그인"해야 저장됨(/super 비밀번호와 별개)

type Status = "draft" | "open" | "closed";
interface Project {
  id: string;
  ownerUid: string;
  churchName: string;
  title: string;
  startDate: string;
  endDate: string;
  status: Status;
  totals?: { reported?: number; confirmed?: number; count?: number };
  managerEmails: string[];
}
type UserOption = { uid: string; email: string; churchName: string };

const C = { bg: "#F2F4F6", card: "#FFFFFF", ink: "#191F28", sub: "#4E5968", muted: "#8B95A1", line: "#E5E8EB", blue: "#3182F6", blueBg: "#E8F3FF", red: "#F04452", redBg: "#FFEEEE", green: "#00A661", greenBg: "#E5F8EE", orange: "#F59E0B", orangeBg: "#FFF4DE" };
const inputCls = "w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:border-[#3182F6]";
const inputStyle = { borderColor: C.line, background: C.card, color: C.ink };
const STATUS: Record<Status, { label: string; color: string; bg: string }> = {
  draft: { label: "준비 중", color: C.orange, bg: C.orangeBg },
  open: { label: "진행 중", color: C.green, bg: C.greenBg },
  closed: { label: "종료", color: C.muted, bg: C.bg },
};
const won = (n?: number) => `${(n || 0).toLocaleString("ko-KR")}원`;
const dot = (d: string) => (d ? d.replace(/-/g, ". ") : "-");
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

// 담당자 이메일 입력: 입력하고 Enter(또는 쉼표)로 추가, ×로 빼기
const EmailChips = ({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) => {
  const [text, setText] = useState("");
  const add = () => {
    const parts = text.split(/[,\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
    const bad = parts.filter((p) => !isEmail(p));
    if (bad.length) { alert(`이메일 형식이 아니에요: ${bad.join(", ")}`); return; }
    onChange([...new Set([...value, ...parts])]);
    setText("");
  };
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {value.map((e) => (
          <span key={e} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: C.blueBg, color: C.blue }}>
            {e}
            <button type="button" aria-label={`${e} 빼기`} onClick={() => onChange(value.filter((x) => x !== e))} className="leading-none">×</button>
          </span>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="담당자 이메일 (ex. pastor@church.com)"
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); if (text.trim()) add(); } }}
          className={inputCls} style={inputStyle} />
        <button type="button" onClick={() => text.trim() && add()} className="shrink-0 rounded-xl px-4 text-sm font-bold" style={{ background: C.bg, color: C.sub }}>추가</button>
      </div>
      <p className="mt-1 text-xs" style={{ color: C.muted }}>교회 계정 외에 관리 화면을 함께 쓸 분(전도사님·재정부 등)이에요. 그분 이메일로 가입·로그인하면 관리할 수 있어요.</p>
    </div>
  );
};

// 교회 계정 고르기(가입한 주보 플랫폼 계정에서 교회 이름·이메일로 검색)
const ChurchPicker = ({ users, picked, onPick }: { users: UserOption[]; picked: UserOption | null; onPick: (u: UserOption | null) => void }) => {
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const matches = q ? users.filter((u) => u.churchName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)).slice(0, 8) : [];
  if (picked) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm" style={inputStyle}>
        <span><b>{picked.churchName || "(교회 이름 없음)"}</b> <span style={{ color: C.muted }}>{picked.email}</span></span>
        <button type="button" onClick={() => onPick(null)} className="text-xs font-bold" style={{ color: C.blue }}>다시 고르기</button>
      </div>
    );
  }
  return (
    <>
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="교회 이름 또는 이메일로 찾기" className={inputCls} style={inputStyle} />
      {matches.length > 0 && (
        <div className="mt-2 rounded-xl border overflow-hidden" style={{ borderColor: C.line }}>
          {matches.map((u) => (
            <button type="button" key={u.uid} onClick={() => { onPick(u); setSearch(""); }} className="block w-full text-left px-3 py-2.5 text-sm hover:bg-[#F9FAFB]" style={{ borderBottom: `1px solid ${C.line}` }}>
              <b style={{ color: C.ink }}>{u.churchName || "(교회 이름 없음)"}</b> <span style={{ color: C.muted }}>{u.email}</span>
            </button>
          ))}
        </div>
      )}
      {q && matches.length === 0 && <p className="mt-2 text-xs" style={{ color: C.muted }}>찾는 계정이 없어요. 교회가 주보 플랫폼에 먼저 가입해야 해요.</p>}
    </>
  );
};

// 새 프로젝트 만들기 / 기본 정보 고치기 공통 폼
const ProjectForm = ({ users, initial, onSubmit, onClose, submitLabel }: {
  users: UserOption[];
  initial?: Project;
  onSubmit: (v: { owner: UserOption; churchName: string; title: string; startDate: string; endDate: string; managerEmails: string[] }) => Promise<void>;
  onClose: () => void;
  submitLabel: string;
}) => {
  const initOwner = initial ? (users.find((u) => u.uid === initial.ownerUid) || { uid: initial.ownerUid, email: "", churchName: initial.churchName }) : null;
  const [owner, setOwner] = useState<UserOption | null>(initOwner);
  const [churchName, setChurchName] = useState(initial?.churchName || "");
  const [title, setTitle] = useState(initial?.title || "러브링");
  const [startDate, setStartDate] = useState(initial?.startDate || "");
  const [endDate, setEndDate] = useState(initial?.endDate || "");
  const [managerEmails, setManagerEmails] = useState<string[]>(initial?.managerEmails || []);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!owner) { alert("교회 계정을 골라 주세요."); return; }
    if (!churchName.trim()) { alert("교회 이름을 입력해 주세요."); return; }
    if (!title.trim()) { alert("프로젝트 제목을 입력해 주세요."); return; }
    if (startDate && endDate && startDate > endDate) { alert("끝나는 날짜가 시작 날짜보다 빨라요."); return; }
    setSaving(true);
    try {
      await onSubmit({ owner, churchName: churchName.trim(), title: title.trim(), startDate, endDate, managerEmails });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl p-5 mb-6" style={{ background: C.card }}>
      <p className="text-[15px] font-bold" style={{ color: C.ink }}>{initial ? "프로젝트 정보 고치기" : "새 모금 프로젝트"}</p>
      <p className="mt-1 text-xs" style={{ color: C.muted }}>고른 교회 계정에 연결돼요. 교회 담당자가 소원·계좌·QR을 설정한 뒤 "열기"를 누르면 성도 화면이 열려요.</p>

      <label className="mt-4 block text-sm font-bold" style={{ color: C.sub }}>교회 계정</label>
      <div className="mt-2">
        <ChurchPicker users={users} picked={owner} onPick={(u) => { setOwner(u); if (u && !churchName.trim()) setChurchName(u.churchName); }} />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-bold" style={{ color: C.sub }}>교회 이름 (화면에 보임)</label>
          <input value={churchName} onChange={(e) => setChurchName(e.target.value)} placeholder="예: 해운대제일교회" className={`mt-2 ${inputCls}`} style={inputStyle} />
        </div>
        <div>
          <label className="block text-sm font-bold" style={{ color: C.sub }}>프로젝트 제목</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 러브링" className={`mt-2 ${inputCls}`} style={inputStyle} />
        </div>
        <div>
          <label className="block text-sm font-bold" style={{ color: C.sub }}>시작 날짜</label>
          <div className="mt-2"><DatePickerField value={startDate} onChange={setStartDate} /></div>
        </div>
        <div>
          <label className="block text-sm font-bold" style={{ color: C.sub }}>끝나는 날짜</label>
          <div className="mt-2"><DatePickerField value={endDate} onChange={setEndDate} /></div>
        </div>
      </div>

      <label className="mt-4 block text-sm font-bold" style={{ color: C.sub }}>담당자 (선택)</label>
      <div className="mt-2"><EmailChips value={managerEmails} onChange={setManagerEmails} /></div>

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm font-bold" style={{ color: C.sub }}>닫기</button>
        <button type="button" onClick={submit} disabled={saving} className="rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50" style={{ background: C.blue }}>{saving ? "저장 중..." : submitLabel}</button>
      </div>
    </div>
  );
};

export const AdminFundraisers = () => {
  const [authState, setAuthState] = useState<"loading" | "ok" | "denied">("loading");
  const [rows, setRows] = useState<Project[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // 운영자 이메일로 로그인돼 있어야 저장 가능(firestore.rules isOperator). /super 비밀번호만으로는 안 됨
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => setAuthState(user && isOperatorEmail(user.email) ? "ok" : "denied"));
    return () => unsub();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [usersSnap, fundSnap] = await Promise.all([getDocs(collection(db, "users")), getDocs(collection(db, "fundraisers"))]);
      setUsers(usersSnap.docs.map((d) => {
        const data = d.data() as { email?: string; churchName?: string };
        return { uid: d.id, email: data.email || "", churchName: data.churchName || "" };
      }));
      const list = await Promise.all(fundSnap.docs.map(async (d) => {
        const data = d.data() as Partial<Project> & { createdAt?: { toMillis?: () => number } };
        let managerEmails: string[] = [];
        try {
          const acl = await getDoc(doc(db, "fundraisers", d.id, "meta", "acl"));
          managerEmails = Array.isArray(acl.data()?.managerEmails) ? acl.data()!.managerEmails : [];
        } catch { /* 권한 없으면 빈 목록 */ }
        return {
          id: d.id, ownerUid: data.ownerUid || "", churchName: data.churchName || "", title: data.title || "",
          startDate: data.startDate || "", endDate: data.endDate || "", status: (data.status as Status) || "draft",
          totals: data.totals, managerEmails, _t: data.createdAt?.toMillis?.() || 0,
        };
      }));
      list.sort((a, z) => z._t - a._t);
      setRows(list);
    } catch (e) {
      console.error("모금 프로젝트 목록 조회 오류:", e);
      alert("목록을 불러오지 못했어요. 운영자 계정으로 로그인했는지 확인해 주세요.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { if (authState === "ok") void load(); }, [authState]);

  const emailOf = useMemo(() => new Map(users.map((u) => [u.uid, u.email])), [users]);

  // 만들기: 공개 문서 + 비공개 담당자 문서를 한 번에
  const create = async (v: { owner: UserOption; churchName: string; title: string; startDate: string; endDate: string; managerEmails: string[] }) => {
    const ref = doc(collection(db, "fundraisers"));
    const batch = writeBatch(db);
    batch.set(ref, {
      ownerUid: v.owner.uid,
      churchName: v.churchName,
      title: v.title,
      startDate: v.startDate,
      endDate: v.endDate,
      status: "draft",
      bank: { name: "", account: "", holder: "", memoGuide: `${v.title} + 이름` },
      displayMode: "instant",
      randomGift: { enabled: false, label: "", desc: "", goal: null },
      totals: { reported: 0, confirmed: 0, count: 0 },
      recent: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, "fundraisers", ref.id, "meta", "acl"), { ownerUid: v.owner.uid, managerEmails: v.managerEmails });
    try {
      await batch.commit();
      setShowCreate(false);
      await load();
    } catch (e) {
      console.error("모금 프로젝트 만들기 오류:", e);
      alert("만들지 못했어요. 운영자 계정으로 로그인했는지, firestore.rules가 배포됐는지 확인해 주세요.");
    }
  };

  // 기본 정보·연결 교회·담당자 고치기
  const saveEdit = async (p: Project, v: { owner: UserOption; churchName: string; title: string; startDate: string; endDate: string; managerEmails: string[] }) => {
    const batch = writeBatch(db);
    batch.update(doc(db, "fundraisers", p.id), {
      ownerUid: v.owner.uid, churchName: v.churchName, title: v.title, startDate: v.startDate, endDate: v.endDate, updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, "fundraisers", p.id, "meta", "acl"), { ownerUid: v.owner.uid, managerEmails: v.managerEmails });
    try {
      await batch.commit();
      setEditingId(null);
      await load();
    } catch (e) {
      console.error("모금 프로젝트 수정 오류:", e);
      alert("저장하지 못했어요.");
    }
  };

  const setStatus = async (p: Project, status: Status) => {
    const msg = status === "open" ? `"${p.title}"을(를) 열까요?\n성도 화면에서 입금 알림을 받기 시작해요.`
      : status === "closed" ? `"${p.title}"을(를) 닫을까요?\n더 이상 입금 알림을 받지 않아요.`
      : `"${p.title}"을(를) 준비 중으로 되돌릴까요?`;
    if (!confirm(msg)) return;
    setBusyId(p.id);
    try {
      await updateDoc(doc(db, "fundraisers", p.id), { status, updatedAt: serverTimestamp() });
      setRows((prev) => prev.map((x) => (x.id === p.id ? { ...x, status } : x)));
    } catch (e) {
      console.error("상태 변경 오류:", e);
      alert("바꾸지 못했어요.");
    } finally {
      setBusyId(null);
    }
  };

  // 삭제: 소원·입금 알림·담당자 문서까지 지운 뒤 프로젝트 삭제
  const remove = async (p: Project) => {
    if (!confirm(`"${p.churchName} · ${p.title}" 프로젝트를 삭제할까요?\n소원 항목과 입금 알림 기록도 모두 지워지고 되돌릴 수 없어요.`)) return;
    if (p.status === "open" && !confirm("지금 진행 중인 프로젝트예요. 정말 삭제할까요?")) return;
    setBusyId(p.id);
    try {
      for (const sub of ["wishes", "donations"]) {
        const snap = await getDocs(collection(db, "fundraisers", p.id, sub));
        for (let i = 0; i < snap.docs.length; i += 400) {
          const b = writeBatch(db);
          snap.docs.slice(i, i + 400).forEach((d) => b.delete(d.ref));
          await b.commit();
        }
      }
      const b = writeBatch(db);
      b.delete(doc(db, "fundraisers", p.id, "meta", "acl"));
      b.delete(doc(db, "fundraisers", p.id));
      await b.commit();
      setRows((prev) => prev.filter((x) => x.id !== p.id));
    } catch (e) {
      console.error("모금 프로젝트 삭제 오류:", e);
      alert("삭제하지 못했어요.");
    } finally {
      setBusyId(null);
    }
  };

  const copyLink = async (p: Project, kind: "give" | "admin") => {
    const url = kind === "give" ? `${window.location.origin}/give/${p.id}` : `${window.location.origin}/admin/fundraising/${p.id}`;
    const label = kind === "give" ? "성도 화면 주소" : "관리 화면 주소(교회 계정·담당자에게 전달)";
    try { await navigator.clipboard.writeText(url); alert(`${label}를 복사했어요.\n${url}${kind === "give" ? "\n(성도 화면은 다음 단계에서 만들어요)" : ""}`); }
    catch { prompt(label, url); }
  };

  if (authState === "loading") return <p className="py-20 text-center text-sm" style={{ color: C.muted }}>확인 중…</p>;
  if (authState === "denied") {
    return (
      <div className="mx-auto max-w-md rounded-2xl p-8 text-center" style={{ background: C.card }}>
        <HeartHandshake className="mx-auto h-10 w-10" style={{ color: C.blue }} />
        <p className="mt-4 text-[17px] font-bold" style={{ color: C.ink }}>운영자 계정으로 로그인해 주세요</p>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: C.muted }}>모금 프로젝트는 계좌 정보가 걸려 있어서, 운영자 이메일로 로그인한 상태에서만 만들고 고칠 수 있어요.</p>
        <a href="/login" className="mt-5 inline-block rounded-xl px-5 py-2.5 text-sm font-bold text-white" style={{ background: C.blue }}>로그인하러 가기</a>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: C.ink }}>모금 프로젝트 관리</h1>
          <p className="mt-1 text-sm" style={{ color: C.muted }}>러브링 같은 모금 프로젝트를 만들고 교회 계정에 연결해요.</p>
        </div>
        {!showCreate && (
          <button type="button" onClick={() => { setShowCreate(true); setEditingId(null); }} className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold text-white" style={{ background: C.blue }}>
            <Plus className="w-4 h-4" /> 새 프로젝트
          </button>
        )}
      </div>

      {showCreate && <ProjectForm users={users} onSubmit={create} onClose={() => setShowCreate(false)} submitLabel="만들기" />}

      {loading ? (
        <p className="py-16 text-center text-sm" style={{ color: C.muted }}>불러오는 중…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl py-16 text-center" style={{ background: C.card }}>
          <p className="text-sm" style={{ color: C.muted }}>아직 만든 모금 프로젝트가 없어요.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((p) => (
            editingId === p.id ? (
              <ProjectForm key={p.id} users={users} initial={p} onSubmit={(v) => saveEdit(p, v)} onClose={() => setEditingId(null)} submitLabel="저장" />
            ) : (
              <div key={p.id} className="rounded-2xl p-5" style={{ background: C.card, opacity: busyId === p.id ? 0.6 : 1 }}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md px-2 py-0.5 text-xs font-bold" style={{ background: STATUS[p.status].bg, color: STATUS[p.status].color }}>{STATUS[p.status].label}</span>
                      <p className="truncate text-[16px] font-bold" style={{ color: C.ink }}>{p.churchName} · {p.title}</p>
                    </div>
                    <p className="mt-1.5 text-xs" style={{ color: C.muted }}>
                      교회 계정 {emailOf.get(p.ownerUid) || p.ownerUid} · 기간 {dot(p.startDate)} ~ {dot(p.endDate)}
                    </p>
                    <p className="mt-1 text-xs" style={{ color: C.muted }}>
                      담당자 {p.managerEmails.length ? p.managerEmails.join(", ") : "없음"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs" style={{ color: C.muted }}>입금 알림 {p.totals?.count || 0}건</p>
                    <p className="text-[15px] font-bold tabular-nums" style={{ color: C.ink }}>{won(p.totals?.reported)}</p>
                    <p className="text-xs tabular-nums" style={{ color: C.green }}>확인 {won(p.totals?.confirmed)}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4" style={{ borderColor: C.line }}>
                  {p.status === "draft" && <button type="button" disabled={busyId === p.id} onClick={() => setStatus(p, "open")} className="rounded-lg px-3 py-1.5 text-xs font-bold text-white" style={{ background: C.green }}>열기</button>}
                  {p.status === "open" && <button type="button" disabled={busyId === p.id} onClick={() => setStatus(p, "closed")} className="rounded-lg px-3 py-1.5 text-xs font-bold" style={{ background: C.redBg, color: C.red }}>닫기</button>}
                  {p.status === "closed" && <button type="button" disabled={busyId === p.id} onClick={() => setStatus(p, "open")} className="rounded-lg px-3 py-1.5 text-xs font-bold" style={{ background: C.greenBg, color: C.green }}>다시 열기</button>}
                  {p.status !== "draft" && <button type="button" disabled={busyId === p.id} onClick={() => setStatus(p, "draft")} className="rounded-lg px-3 py-1.5 text-xs font-bold" style={{ background: C.bg, color: C.sub }}>준비 중으로</button>}
                  <button type="button" onClick={() => { setEditingId(p.id); setShowCreate(false); }} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold" style={{ background: C.blueBg, color: C.blue }}><Pencil className="w-3.5 h-3.5" /> 정보·담당자</button>
                  <button type="button" onClick={() => copyLink(p, "admin")} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold" style={{ background: C.bg, color: C.sub }}><Copy className="w-3.5 h-3.5" /> 관리 화면 주소</button>
                  <button type="button" onClick={() => window.open(`/admin/fundraising/${p.id}`, "_blank")} className="rounded-lg px-3 py-1.5 text-xs font-bold" style={{ background: C.bg, color: C.sub }}>관리 화면 열기</button>
                  <button type="button" onClick={() => copyLink(p, "give")} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold" style={{ background: C.bg, color: C.sub }}><Copy className="w-3.5 h-3.5" /> 성도 화면 주소</button>
                  <span className="flex-1" />
                  <button type="button" disabled={busyId === p.id} onClick={() => remove(p)} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold" style={{ color: C.red }}><Trash2 className="w-3.5 h-3.5" /> 삭제</button>
                </div>
              </div>
            )
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminFundraisers;
