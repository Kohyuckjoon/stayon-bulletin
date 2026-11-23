import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { onAuthStateChanged, type User } from "firebase/auth";
import { getApp } from "firebase/app";
import {
  arrayRemove, arrayUnion, collection, deleteDoc, deleteField, doc, getDocs, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where,
} from "firebase/firestore";
import {
  child, getDatabase, onDisconnect, onValue, ref as rtRef, remove, serverTimestamp as rtNow, set as rtSet, update as rtUpdate,
  type DatabaseReference,
} from "firebase/database";
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { AlertTriangle, ArrowLeft, Link2, Plus, Printer, ShieldCheck, Shuffle, Trash2, Users, X } from "lucide-react";
import { auth, db } from "../../firebase";
import { setLoginReturnTo, type LoginReturnTarget } from "../../utils/loginReturn";

// ─────────────────────────────────────────────────────────────
// 소그룹(셀그룹·반) 편성 (2026-11-20)
//  /cell-group          로그인 O → 내 편성표 목록 / 로그인 X → 바로 쓰는 화면(저장 안 됨 경고)
//  /cell-group/:planId  공유 주소. 로그인한 사람은 같이 편집, 로그인 안 한 사람은 보기만
// 저장: Firestore cellGroupPlans/{planId}. 사람·반을 지도(map) 형태로 두고 칸 하나씩만 고쳐서
//       두 사람이 동시에 옮겨도 서로 덮어쓰지 않음
// 실시간 마우스·끌기: Realtime Database cellLive/{planId}/{접속 하나}. 창을 닫으면 자동으로 지워짐
// ─────────────────────────────────────────────────────────────

interface Person { name: string; isNew: boolean; groupId: string | null; order: number }
interface Group { name: string; leader: string; order: number }
interface Member { name: string; email: string }
interface PlanData {
  title: string; people: Record<string, Person>; groups: Record<string, Group>;
  ownerUid?: string; ownerEmail?: string;
  editorUids?: string[];                          // 편집 허락받은 사람(만든 사람이 허락)
  editorInfo?: Record<string, Member>;            // 그 사람들 이름·이메일(권한 관리 화면 표시용)
  requests?: Record<string, Member & { at: number }>; // 편집 권한 요청(로그인한 사람만)
}
type Updates = Record<string, unknown>;

const RTDB_URL = "https://stayonsbplatform-default-rtdb.asia-southeast1.firebasedatabase.app";
const PLANS = "cellGroupPlans";
const POOL = "pool";
const DEL = "__delete__"; // 지우기 표시(로그인 안 한 화면·Firestore 둘 다 씀)
const DRAFT_KEY = "stayon_cellgroup_draft"; // 로그인 안 한 상태에서 만든 내용을 로그인하러 가는 동안만 잠깐 들고 감
const NICK_KEY = "stayon_cell_nick";
const COLORS = ["#3182F6", "#F04452", "#00B386", "#FF8A00", "#8B5CF6", "#E5487D", "#0EA5E9", "#65A30D"];

const newId = () => Math.random().toString(36).slice(2, 10);
const colorOf = (s: string) => COLORS[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
const emptyPlan = (): PlanData => {
  const t = Date.now();
  return {
    title: `${new Date().getFullYear() + 1}년 소그룹 편성`,
    people: {},
    groups: Object.fromEntries([1, 2, 3].map((n) => [newId(), { name: `${n}반`, leader: "", order: t + n }])),
  };
};

// "people.abc.groupId" 같은 주소로 로그인 안 한 화면의 내용을 고침
function applyUpdates(plan: PlanData, ups: Updates): PlanData {
  const next = { ...plan } as Record<string, unknown>;
  for (const [path, val] of Object.entries(ups)) {
    const keys = path.split(".");
    let cur = next;
    keys.forEach((k, i) => {
      if (i === keys.length - 1) {
        if (val === DEL) delete cur[k]; else cur[k] = val;
      } else {
        cur[k] = { ...((cur[k] as Record<string, unknown>) ?? {}) };
        cur = cur[k] as Record<string, unknown>;
      }
    });
  }
  return next as unknown as PlanData;
}

async function createPlan(user: User, data: PlanData) {
  const r = doc(collection(db, PLANS));
  await setDoc(r, { ...data, ownerUid: user.uid, ownerEmail: user.email ?? "", memberUids: [user.uid], editorUids: [], editorInfo: {}, requests: {}, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return r.id;
}

const myNick = (user: User | null) => {
  try { const v = localStorage.getItem(NICK_KEY); if (v) return v; } catch { /* 무시 */ }
  return user?.displayName || user?.email?.split("@")[0] || "나";
};

const goLogin = (navigate: (to: string) => void, back: LoginReturnTarget) => { setLoginReturnTo(back); navigate("/login"); };

// ─────────────────────────────────────────────────────────────
// 실시간 마우스 위치 주고받기
// 화면 크기가 사람마다 달라서, 좌표는 "어느 칸(data-zone) 안의 몇 % 위치"로 보냄
// ─────────────────────────────────────────────────────────────
interface LiveState { uid: string; name: string; color: string; zone: string | null; fx: number; fy: number; dragId: string | null }

function useLive(planId: string | null, user: User | null, nick: string) {
  const [others, setOthers] = useState<Record<string, LiveState>>({});
  const mine = useRef<DatabaseReference | null>(null);
  const st = useRef({ zone: null as string | null, fx: 0, fy: 0, dragId: null as string | null });
  const last = useRef(0);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!planId) return;
    let offRoom = () => {};
    try {
      const room = rtRef(getDatabase(getApp(), RTDB_URL), `cellLive/${planId}`);
      const clientId = newId();
      offRoom = onValue(room, (snap) => {
        const v = { ...(snap.val() ?? {}) } as Record<string, LiveState>;
        delete v[clientId];
        setOthers(v);
      }, () => setOthers({}));
      if (user) {
        const me = child(room, clientId);
        mine.current = me;
        onDisconnect(me).remove().catch(() => {});
        rtSet(me, { uid: user.uid, name: nick, color: colorOf(user.uid), zone: null, fx: 0, fy: 0, dragId: null, t: rtNow() }).catch(() => {});
      }
    } catch { /* Realtime Database가 아직 없으면 실시간 표시만 빠지고 나머지는 그대로 */ }
    return () => {
      offRoom();
      if (mine.current) { remove(mine.current).catch(() => {}); mine.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId, user?.uid]);

  useEffect(() => { if (mine.current) rtUpdate(mine.current, { name: nick }).catch(() => {}); }, [nick]);

  // 너무 자주 보내지 않게 0.05초에 한 번. 함수는 한 번만 만들어 둠(화면이 다시 그려져도 같은 함수)
  const fns = useMemo(() => {
    const push = () => {
      const r = mine.current;
      if (!r) return;
      const send = () => { last.current = Date.now(); rtUpdate(r, { ...st.current }).catch(() => {}); };
      window.clearTimeout(timer.current);
      if (Date.now() - last.current > 50) send(); else timer.current = window.setTimeout(send, 50);
    };
    return {
      report: (zone: string | null, fx: number, fy: number) => { Object.assign(st.current, { zone, fx, fy }); push(); },
      setDrag: (id: string | null) => { st.current.dragId = id; push(); },
    };
  }, []);
  return { others, ...fns };
}

// 다른 사람 마우스(화살표 + 이름표 + 끌고 있는 이름)
function RemoteCursors({ others, people }: { others: Record<string, LiveState>; people: Record<string, Person> }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const f = () => setTick((n) => n + 1);
    window.addEventListener("scroll", f, true);
    window.addEventListener("resize", f);
    return () => { window.removeEventListener("scroll", f, true); window.removeEventListener("resize", f); };
  }, []);
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] print:hidden">
      {Object.entries(others).map(([cid, o]) => {
        if (!o?.zone) return null;
        const el = document.querySelector<HTMLElement>(`[data-zone="${o.zone}"]`) ?? document.querySelector<HTMLElement>('[data-zone="root"]');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const x = r.left + o.fx * r.width;
        const y = r.top + o.fy * r.height;
        const dragging = o.dragId ? people[o.dragId] : undefined;
        return (
          <div key={cid} className="absolute left-0 top-0 transition-transform duration-75 ease-linear" style={{ transform: `translate(${x}px, ${y}px)` }}>
            <svg width="20" height="20" viewBox="0 0 20 20" className="drop-shadow"><path d="M2 2l6.5 16 2.3-6.7L17.5 9z" fill={o.color} stroke="white" strokeWidth="1.5" strokeLinejoin="round" /></svg>
            <div className="ml-4 -mt-1 flex items-center gap-1.5">
              <span className="whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-bold text-white shadow" style={{ background: o.color }}>{o.name}</span>
              {dragging && (
                <span className="whitespace-nowrap rounded-xl border-2 bg-white px-3 py-1.5 text-[14px] font-semibold text-[#191F28] shadow-lg" style={{ borderColor: o.color }}>{dragging.name}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 이름 칩 · 놓는 칸 · 입력칸
// ─────────────────────────────────────────────────────────────
function PersonChip({ id, p, onRemove, readOnly, heldBy }: { id: string; p: Person; onRemove?: () => void; readOnly?: boolean; heldBy?: LiveState }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, disabled: readOnly || !!heldBy });
  return <ChipView p={p} onRemove={readOnly ? undefined : onRemove} isDragging={isDragging} heldBy={heldBy} readOnly={readOnly}
    dragRef={setNodeRef} dragProps={readOnly ? {} : { ...listeners, ...attributes }} />;
}

function ChipView({ p, onRemove, overlay, isDragging, heldBy, readOnly, dragRef, dragProps }: {
  p: Person; onRemove?: () => void; overlay?: boolean; isDragging?: boolean; heldBy?: LiveState; readOnly?: boolean;
  dragRef?: (el: HTMLElement | null) => void; dragProps?: Record<string, unknown>;
}) {
  return (
    <div ref={dragRef} {...dragProps} style={heldBy ? { borderColor: heldBy.color, boxShadow: `0 0 0 2px ${heldBy.color}33` } : undefined}
      className={`relative inline-flex items-center gap-1.5 rounded-xl border bg-white h-10 text-[15px] font-semibold text-[#191F28] select-none
        ${onRemove ? "pl-3 pr-1.5" : "px-3"} ${readOnly ? "" : "cursor-grab active:cursor-grabbing"}
        ${overlay ? "pointer-events-none border-[#3182F6] shadow-[0_8px_24px_rgba(49,130,246,0.3)] scale-105" : "border-[#E5E8EB] hover:border-[#3182F6]"}
        ${isDragging || heldBy ? "opacity-40" : ""}`}>
      {p.isNew && <span className="rounded-md bg-[#FFF0F1] px-1.5 py-0.5 text-[11px] font-bold text-[#F04452]">신입</span>}
      <span className="whitespace-nowrap">{p.name}</span>
      {onRemove && !overlay && (
        <button type="button" onPointerDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} onClick={onRemove}
          aria-label={`${p.name} 빼기`} className="flex h-7 w-7 items-center justify-center rounded-lg text-[#B0B8C1] hover:bg-[#F2F4F6] hover:text-[#4E5968]">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function DropBox({ id, children, className }: { id: string; children: React.ReactNode; className: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return <div ref={setNodeRef} data-zone={id} className={`${className} transition-colors ${isOver ? "!border-[#3182F6] !bg-[#E8F3FF]" : ""}`}>{children}</div>;
}

// 글자 칸: 치는 동안은 내 화면에만, 0.4초 쉬거나 칸을 벗어나면 저장(한 글자마다 저장하지 않게)
function LazyInput({ value, onCommit, readOnly, className, placeholder }: { value: string; onCommit: (v: string) => void; readOnly?: boolean; className: string; placeholder?: string }) {
  const [v, setV] = useState(value);
  const focused = useRef(false);
  const t = useRef<number | undefined>(undefined);
  useEffect(() => { if (!focused.current) setV(value); }, [value]);
  return (
    <input value={v} readOnly={readOnly} placeholder={placeholder} className={className}
      onFocus={() => { focused.current = true; }}
      onBlur={() => { focused.current = false; window.clearTimeout(t.current); if (v !== value) onCommit(v); }}
      onChange={(e) => { const nv = e.target.value; setV(nv); window.clearTimeout(t.current); t.current = window.setTimeout(() => onCommit(nv), 400); }} />
  );
}

// ─────────────────────────────────────────────────────────────
// 편성 화면(로그인 안 한 화면·공유 편성표 둘 다 씀)
// ─────────────────────────────────────────────────────────────
function Editor({ plan, write, mode, onBack, headerRight, banner, live, onDeletePlan }: {
  plan: PlanData;
  write: (u: Updates) => void;
  mode: "local" | "edit" | "view";
  onBack: () => void;
  headerRight: React.ReactNode;
  banner?: React.ReactNode;
  live?: ReturnType<typeof useLive>;
  onDeletePlan?: () => void;
}) {
  const readOnly = mode === "view";
  const [names, setNames] = useState("");
  const [asNew, setAsNew] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const groups = useMemo(() => Object.entries(plan.groups ?? {}).sort((a, b) => a[1].order - b[1].order), [plan.groups]);
  const people = plan.people ?? {};
  const membersOf = (gid: string | null) => Object.entries(people).filter(([, p]) => (gid ? p.groupId === gid : !p.groupId || !plan.groups?.[p.groupId])).sort((a, b) => a[1].order - b[1].order);
  const pool = membersOf(null);
  const assignedCount = Object.keys(people).length - pool.length;

  // 다른 사람이 지금 끌고 있는 이름 → 그 사람 색 테두리
  const heldBy = useMemo(() => {
    const m: Record<string, LiveState> = {};
    Object.values(live?.others ?? {}).forEach((o) => { if (o?.dragId) m[o.dragId] = o; });
    return m;
  }, [live?.others]);

  // 내 마우스·손가락 위치 보내기
  useEffect(() => {
    if (!live || mode !== "edit") return;
    const at = (x: number, y: number) => {
      const hit = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-zone]");
      const el = hit ?? rootRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      live.report(el.dataset.zone ?? "root", (x - r.left) / r.width, (y - r.top) / r.height);
    };
    const pm = (e: PointerEvent) => at(e.clientX, e.clientY);
    const tm = (e: TouchEvent) => { const t = e.touches[0]; if (t) at(t.clientX, t.clientY); };
    const leave = () => live.report(null, 0, 0);
    window.addEventListener("pointermove", pm, { passive: true });
    window.addEventListener("touchmove", tm, { passive: true });
    document.documentElement.addEventListener("mouseleave", leave);
    return () => {
      window.removeEventListener("pointermove", pm);
      window.removeEventListener("touchmove", tm);
      document.documentElement.removeEventListener("mouseleave", leave);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live?.report, mode]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  const move = (pid: string, to: string) => write({ [`people.${pid}.groupId`]: to === POOL ? null : to, [`people.${pid}.order`]: Date.now() });
  const onDragStart = (e: DragStartEvent) => { setDragId(String(e.active.id)); live?.setDrag(String(e.active.id)); };
  const onDragEnd = (e: DragEndEvent) => {
    setDragId(null); live?.setDrag(null);
    if (e.over) move(String(e.active.id), String(e.over.id));
  };

  const addNames = () => {
    const list = names.split(/[\n,\t]/).map((s) => s.trim()).filter(Boolean);
    if (!list.length) return;
    const t = Date.now();
    write(Object.fromEntries(list.map((name, i) => [`people.${newId()}`, { name, isNew: asNew, groupId: null, order: t + i }])));
    setNames("");
  };

  // 아직 반이 없는 친구를 섞어서 인원이 적은 반부터(신입생도 고루 나뉘게 신입생 먼저)
  const autoAssign = () => {
    if (!pool.length || !groups.length) return;
    const shuffle = <T,>(a: T[]) => a.map((v) => [Math.random(), v] as const).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
    const order = [...shuffle(pool.filter(([, p]) => p.isNew)), ...shuffle(pool.filter(([, p]) => !p.isNew))];
    const count = Object.fromEntries(groups.map(([gid]) => [gid, membersOf(gid).length]));
    const ups: Updates = {};
    const t = Date.now();
    order.forEach(([pid], i) => {
      const gid = groups.reduce((min, [g]) => (count[g] < count[min] ? g : min), groups[0][0]);
      count[gid]++;
      ups[`people.${pid}.groupId`] = gid;
      ups[`people.${pid}.order`] = t + i;
    });
    write(ups);
  };

  const clearAll = () => {
    if (!confirm("모든 친구를 반에서 빼서 '아직 반이 없는 친구'로 돌려놓을까요?")) return;
    write(Object.fromEntries(Object.keys(people).map((pid) => [`people.${pid}.groupId`, null])));
  };

  const deleteGroup = (gid: string, g: Group) => {
    const mem = membersOf(gid);
    if (mem.length && !confirm(`'${g.name}'을 지울까요? 이 반 친구들은 '아직 반이 없는 친구'로 돌아가요.`)) return;
    write({ [`groups.${gid}`]: DEL, ...Object.fromEntries(mem.map(([pid]) => [`people.${pid}.groupId`, null])) });
  };

  const dragging = dragId ? people[dragId] : undefined;
  const input = "w-full rounded-xl border border-[#E5E8EB] bg-white px-3 text-[15px] font-semibold text-[#191F28] outline-none focus:border-[#3182F6] read-only:bg-[#F9FAFB]";

  return (
    <>
      <div ref={rootRef} data-zone="root" className="min-h-screen bg-[#F9FAFB] print:hidden">
        <header className="sticky top-0 z-20 border-b border-[#F2F4F6] bg-white/90 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4">
            <button type="button" onClick={onBack} aria-label="뒤로" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl hover:bg-[#F2F4F6]"><ArrowLeft className="h-5 w-5 text-[#191F28]" /></button>
            <p className="flex-1 truncate text-[17px] font-bold text-[#191F28]">소그룹 편성</p>
            {headerRight}
            <button type="button" onClick={() => window.print()} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-[#191F28] px-3.5 text-[14px] font-semibold text-white hover:bg-black">
              <Printer className="h-4 w-4" /><span className="hidden sm:inline">출력</span>
            </button>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-5 space-y-4">
          {banner}

          <div className="flex items-center gap-2">
            <LazyInput value={plan.title} readOnly={readOnly} onCommit={(v) => write({ title: v })} placeholder="편성표 제목 (예: 2027 중등부 소그룹)" className={`${input} h-12 text-[18px] font-bold`} />
            {onDeletePlan && (
              <button type="button" onClick={onDeletePlan} aria-label="편성표 지우기" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-[#B0B8C1] hover:bg-white hover:text-[#F04452]"><Trash2 className="h-5 w-5" /></button>
            )}
          </div>

          {!readOnly && (
            <section data-zone="names" className="rounded-3xl bg-white p-5">
              <p className="text-[17px] font-bold text-[#191F28]"><span className="text-[#3182F6]">1</span> 이름 넣기</p>
              <p className="mt-1 text-[14px] text-[#8B95A1] break-keep">한 줄에 한 명씩 쓰거나, 엑셀에서 이름 칸을 복사해 붙여 넣으세요</p>
              <textarea value={names} onChange={(e) => setNames(e.target.value)} rows={3} placeholder={"김하늘\n이바다\n박사랑"}
                className="mt-3 w-full resize-none rounded-xl border border-[#E5E8EB] p-3 text-[15px] font-medium outline-none focus:border-[#3182F6]" />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <label className="inline-flex cursor-pointer items-center gap-2 text-[14px] font-semibold text-[#4E5968]">
                  <input type="checkbox" checked={asNew} onChange={(e) => setAsNew(e.target.checked)} className="h-5 w-5 accent-[#F04452]" />
                  신입생으로 넣기
                </label>
                <button type="button" onClick={addNames} disabled={!names.trim()} className="h-11 rounded-xl bg-[#3182F6] px-5 text-[15px] font-semibold text-white hover:bg-[#1B64DA] disabled:bg-[#D1D6DB]">이름 추가</button>
              </div>
            </section>
          )}

          <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => { setDragId(null); live?.setDrag(null); }}>
            <section className="rounded-3xl bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[17px] font-bold text-[#191F28]">{!readOnly && <span className="text-[#3182F6]">2 </span>}아직 반이 없는 친구 <span className="text-[#3182F6]">{pool.length}</span>명</p>
                {!readOnly && (
                  <div className="flex gap-1.5">
                    <button type="button" onClick={autoAssign} disabled={!pool.length || !groups.length}
                      className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#E8F3FF] px-3.5 text-[14px] font-semibold text-[#1B64DA] hover:bg-[#D6E8FF] disabled:opacity-40">
                      <Shuffle className="h-4 w-4" />골고루 자동 배치
                    </button>
                    <button type="button" onClick={clearAll} disabled={!assignedCount}
                      className="h-10 rounded-xl px-3 text-[14px] font-semibold text-[#8B95A1] hover:bg-[#F2F4F6] disabled:opacity-40">전부 빼기</button>
                  </div>
                )}
              </div>
              {!readOnly && <p className="mt-1 text-[14px] text-[#8B95A1] break-keep">이름을 꾹 눌러 아래 반으로 끌어다 놓으세요</p>}
              <DropBox id={POOL} className="mt-3 min-h-[72px] rounded-2xl border-2 border-dashed border-[#E5E8EB] bg-[#F9FAFB] p-3 flex flex-wrap gap-2 content-start">
                {pool.length ? pool.map(([pid, p]) => (
                  <PersonChip key={pid} id={pid} p={p} readOnly={readOnly} heldBy={heldBy[pid]} onRemove={() => write({ [`people.${pid}`]: DEL })} />
                )) : <p className="w-full self-center text-center text-[14px] text-[#B0B8C1]">{Object.keys(people).length ? "모두 반을 정했어요 👏" : readOnly ? "아직 이름이 없어요" : "위에서 이름을 넣어 주세요"}</p>}
              </DropBox>
            </section>

            <section>
              <div className="mb-3 flex items-center justify-between px-1">
                <p className="text-[17px] font-bold text-[#191F28]">{!readOnly && <span className="text-[#3182F6]">3 </span>}반 <span className="text-[#8B95A1] font-semibold">{groups.length}개</span></p>
                {!readOnly && (
                  <button type="button" onClick={() => write({ [`groups.${newId()}`]: { name: `${groups.length + 1}반`, leader: "", order: Date.now() } })}
                    className="inline-flex h-10 items-center gap-1 rounded-xl bg-white border border-[#E5E8EB] px-3.5 text-[14px] font-semibold text-[#191F28] hover:bg-[#F2F4F6]">
                    <Plus className="h-4 w-4" />반 추가
                  </button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {groups.map(([gid, g]) => {
                  const mem = membersOf(gid);
                  return (
                    <DropBox key={gid} id={gid} className="rounded-3xl border-2 border-transparent bg-white p-4">
                      <div className="flex items-center gap-2">
                        <LazyInput value={g.name} readOnly={readOnly} onCommit={(v) => write({ [`groups.${gid}.name`]: v })} placeholder="반 이름" className={`${input} h-11 text-[16px] font-bold`} />
                        <span className="shrink-0 rounded-lg bg-[#F2F4F6] px-2.5 py-1 text-[14px] font-bold text-[#4E5968]">{mem.length}명</span>
                        {!readOnly && (
                          <button type="button" aria-label="반 지우기" onClick={() => deleteGroup(gid, g)}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#B0B8C1] hover:bg-[#F2F4F6] hover:text-[#F04452]"><Trash2 className="h-4 w-4" /></button>
                        )}
                      </div>
                      {(!readOnly || g.leader) && (
                        <LazyInput value={g.leader} readOnly={readOnly} onCommit={(v) => write({ [`groups.${gid}.leader`]: v })} placeholder="담당 선생님 (선택)" className={`${input} mt-2 h-10 text-[14px] font-medium`} />
                      )}
                      <div className="mt-3 min-h-[88px] rounded-2xl bg-[#F9FAFB] p-2.5 flex flex-wrap gap-2 content-start">
                        {mem.length ? mem.map(([pid, p]) => (
                          <PersonChip key={pid} id={pid} p={p} readOnly={readOnly} heldBy={heldBy[pid]} onRemove={() => move(pid, POOL)} />
                        )) : <p className="w-full self-center text-center text-[13px] text-[#B0B8C1]">{readOnly ? "비어 있어요" : "여기로 끌어다 놓으세요"}</p>}
                      </div>
                    </DropBox>
                  );
                })}
              </div>
            </section>

            <DragOverlay dropAnimation={null}>{dragging ? <ChipView p={dragging} overlay /> : null}</DragOverlay>
          </DndContext>
        </main>
      </div>

      {live && <RemoteCursors others={live.others} people={people} />}

      {/* 인쇄용(A4): 화면에선 숨기고 인쇄할 때만 */}
      <div className="hidden print:block p-6 text-black">
        <p className="mb-5 text-center text-[22px] font-bold">{plan.title}</p>
        <div className="grid grid-cols-2 gap-4">
          {groups.map(([gid, g]) => {
            const mem = membersOf(gid);
            return (
              <div key={gid} className="break-inside-avoid rounded-lg border border-black/60 p-3">
                <div className="flex items-baseline justify-between border-b border-black/30 pb-1.5">
                  <p className="text-[16px] font-bold">{g.name}</p>
                  <p className="text-[12px]">{g.leader && `담당: ${g.leader} · `}{mem.length}명</p>
                </div>
                <ol className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[13px]">
                  {mem.map(([pid, p], i) => <li key={pid}>{i + 1}. {p.name}{p.isNew ? " (신입)" : ""}</li>)}
                </ol>
              </div>
            );
          })}
        </div>
        {pool.length > 0 && <p className="mt-4 text-[12px]">미배정: {pool.map(([, p]) => p.name).join(", ")}</p>}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// 화면들
// ─────────────────────────────────────────────────────────────
const Spinner = () => <div className="min-h-screen flex items-center justify-center bg-[#F9FAFB]"><div className="h-8 w-8 rounded-full border-[3px] border-gray-200 border-t-[#3182F6] animate-spin" /></div>;

// 로그인 안 한 상태: 바로 쓰되 저장 안 됨
function LocalEditor() {
  const navigate = useNavigate();
  const [plan, setPlan] = useState<PlanData>(emptyPlan);
  const hasData = Object.keys(plan.people).length > 0;

  // 이름을 넣은 뒤 창을 닫거나 새로고침하면 브라우저가 한 번 더 물어봄
  useEffect(() => {
    if (!hasData) return;
    const f = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", f);
    return () => window.removeEventListener("beforeunload", f);
  }, [hasData]);

  const loginAndSave = () => {
    try { if (hasData) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(plan)); } catch { /* 무시 */ }
    goLogin(navigate, "/cell-group");
  };

  return (
    <Editor plan={plan} mode="local" write={(u) => setPlan((p) => applyUpdates(p, u))} onBack={() => navigate("/")}
      headerRight={<span className="hidden sm:inline text-[13px] font-semibold text-[#F04452]">저장 안 됨</span>}
      banner={
        <div className="flex flex-col gap-3 rounded-2xl border border-[#FFD8A8] bg-[#FFF8EE] p-4 sm:flex-row sm:items-center">
          <div className="flex flex-1 items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#FF8A00]" />
            <div>
              <p className="text-[15px] font-bold text-[#191F28]">로그인하지 않으면 저장되지 않아요</p>
              <p className="mt-0.5 text-[14px] text-[#4E5968] break-keep">창을 닫거나 새로고침하면 넣은 내용이 모두 사라져요. 로그인하면 저장되고, 주소를 보내 다른 선생님과 함께 편성할 수 있어요.</p>
            </div>
          </div>
          <button type="button" onClick={loginAndSave} className="h-11 shrink-0 rounded-xl bg-[#191F28] px-4 text-[14px] font-semibold text-white hover:bg-black">로그인하고 저장하기</button>
        </div>
      } />
  );
}

// 로그인한 상태: 내 편성표 목록
function PlanList({ user }: { user: User }) {
  const navigate = useNavigate();
  const [list, setList] = useState<{ id: string; title: string; count: number; mine: boolean; canEdit: boolean; at: number }[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      // 로그인 전에 만든 내용이 있으면 새 편성표로 저장하고 바로 엶
      let draft: PlanData | null = null;
      try { const s = sessionStorage.getItem(DRAFT_KEY); if (s) draft = JSON.parse(s); sessionStorage.removeItem(DRAFT_KEY); } catch { /* 무시 */ }
      if (draft) {
        try { const id = await createPlan(user, draft); if (alive) navigate(`/cell-group/${id}`, { replace: true }); return; } catch { /* 실패하면 목록 */ }
      }
      const snap = await getDocs(query(collection(db, PLANS), where("memberUids", "array-contains", user.uid))).catch(() => null);
      if (!alive) return;
      setList((snap?.docs ?? []).map((d) => {
        const v = d.data();
        return { id: d.id, title: v.title || "제목 없음", count: Object.keys(v.people ?? {}).length, mine: v.ownerUid === user.uid, canEdit: v.ownerUid === user.uid || (v.editorUids ?? []).includes(user.uid), at: v.updatedAt?.toMillis?.() ?? 0 };
      }).sort((a, b) => b.at - a.at));
    })();
    return () => { alive = false; };
  }, [user, navigate]);

  const create = async () => {
    setBusy(true);
    try { navigate(`/cell-group/${await createPlan(user, emptyPlan())}`); } catch { alert("편성표를 만들지 못했어요. 잠시 후 다시 해 주세요."); setBusy(false); }
  };

  if (!list) return <Spinner />;
  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      <header className="sticky top-0 z-20 border-b border-[#F2F4F6] bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-4">
          <button type="button" onClick={() => navigate("/")} aria-label="뒤로" className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-[#F2F4F6]"><ArrowLeft className="h-5 w-5 text-[#191F28]" /></button>
          <p className="flex-1 text-[17px] font-bold text-[#191F28]">소그룹 편성</p>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">
        <p className="text-[22px] font-bold text-[#191F28]">내 편성표</p>
        <p className="mt-1 text-[15px] text-[#8B95A1] break-keep">편성표 주소를 보내면 다른 선생님과 실시간으로 함께 편성할 수 있어요</p>
        <button type="button" onClick={create} disabled={busy}
          className="mt-5 flex h-16 w-full items-center justify-center gap-2 rounded-2xl bg-[#3182F6] text-[17px] font-semibold text-white hover:bg-[#1B64DA] disabled:opacity-60">
          <Plus className="h-5 w-5" />{busy ? "만드는 중…" : "새 편성표 만들기"}
        </button>
        <div className="mt-4 space-y-2">
          {list.map((p) => (
            <button key={p.id} type="button" onClick={() => navigate(`/cell-group/${p.id}`)}
              className="flex w-full items-center gap-3 rounded-2xl bg-white p-4 text-left hover:bg-[#F2F4F6]">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#E8F3FF]"><Users className="h-5 w-5 text-[#3182F6]" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[16px] font-bold text-[#191F28]">{p.title}</span>
                <span className="block text-[13px] text-[#8B95A1]">{p.count}명{!p.mine && (p.canEdit ? " · 함께 편집 중" : " · 보기 전용")}</span>
              </span>
            </button>
          ))}
          {!list.length && <p className="py-10 text-center text-[14px] text-[#B0B8C1]">아직 만든 편성표가 없어요</p>}
        </div>
      </main>
    </div>
  );
}

// 안내 띠(주황 = 경고, 파랑 = 안내)
function Notice({ tone, title, desc, action }: { tone: "warn" | "info"; title: string; desc: string; action?: React.ReactNode }) {
  const warn = tone === "warn";
  return (
    <div className={`flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center ${warn ? "border-[#FFD8A8] bg-[#FFF8EE]" : "border-[#C9E2FF] bg-[#F2F8FF]"}`}>
      <div className="flex flex-1 items-start gap-2.5">
        {warn ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#FF8A00]" /> : <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#3182F6]" />}
        <div>
          <p className="text-[15px] font-bold text-[#191F28]">{title}</p>
          <p className="mt-0.5 text-[14px] text-[#4E5968] break-keep">{desc}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

// 권한 관리(만든 사람만): 편집 권한 요청 허락·거절, 편집하는 사람 빼기
function AccessPanel({ plan, onApprove, onDeny, onRemove, onClose }: {
  plan: PlanData; onApprove: (uid: string) => void; onDeny: (uid: string) => void; onRemove: (uid: string) => void; onClose: () => void;
}) {
  const reqs = Object.entries(plan.requests ?? {}).sort((a, b) => a[1].at - b[1].at);
  const editors = (plan.editorUids ?? []).map((uid) => [uid, plan.editorInfo?.[uid] ?? { name: "이름 없음", email: "" }] as const);
  const Row = ({ m, children }: { m: Member; children: React.ReactNode }) => (
    <div className="flex items-center gap-3 rounded-2xl bg-[#F9FAFB] px-4 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E8F3FF] text-[14px] font-bold text-[#3182F6]">{m.name.slice(0, 1)}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-[#191F28]">{m.name}</span>
        {m.email && <span className="block truncate text-[13px] text-[#8B95A1]">{m.email}</span>}
      </span>
      <span className="flex shrink-0 gap-1.5">{children}</span>
    </div>
  );
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 sm:items-center sm:p-6 print:hidden" onClick={onClose} role="dialog" aria-modal="true">
      <div className="max-h-[85vh] w-full overflow-y-auto rounded-t-[28px] bg-white px-6 pt-6 pb-[max(20px,env(safe-area-inset-bottom))] sm:max-w-[440px] sm:rounded-[28px]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="text-[20px] font-bold text-[#191F28]">편집 권한 관리</p>
          <button type="button" onClick={onClose} aria-label="닫기" className="flex h-9 w-9 items-center justify-center rounded-xl text-[#8B95A1] hover:bg-[#F2F4F6]"><X className="h-5 w-5" /></button>
        </div>
        <p className="mt-1 text-[14px] text-[#8B95A1] break-keep">허락한 사람만 함께 고칠 수 있어요. 나머지는 보기만 할 수 있어요.</p>

        <p className="mt-6 text-[14px] font-bold text-[#4E5968]">요청 <span className="text-[#F04452]">{reqs.length}</span></p>
        <div className="mt-2 space-y-2">
          {reqs.map(([uid, m]) => (
            <Row key={uid} m={m}>
              <button type="button" onClick={() => onDeny(uid)} className="h-9 rounded-xl px-3 text-[14px] font-semibold text-[#8B95A1] hover:bg-[#F2F4F6]">거절</button>
              <button type="button" onClick={() => onApprove(uid)} className="h-9 rounded-xl bg-[#3182F6] px-3.5 text-[14px] font-semibold text-white hover:bg-[#1B64DA]">허락</button>
            </Row>
          ))}
          {!reqs.length && <p className="rounded-2xl bg-[#F9FAFB] py-4 text-center text-[14px] text-[#B0B8C1]">새 요청이 없어요</p>}
        </div>

        <p className="mt-6 text-[14px] font-bold text-[#4E5968]">함께 편집하는 사람 <span className="text-[#3182F6]">{editors.length}</span></p>
        <div className="mt-2 space-y-2">
          {editors.map(([uid, m]) => (
            <Row key={uid} m={m}>
              <button type="button" onClick={() => { if (confirm(`${m.name} 님의 편집 권한을 뺄까요? 보기만 할 수 있게 바뀌어요.`)) onRemove(uid); }}
                className="h-9 rounded-xl px-3 text-[14px] font-semibold text-[#F04452] hover:bg-[#FFF0F1]">빼기</button>
            </Row>
          ))}
          {!editors.length && <p className="rounded-2xl bg-[#F9FAFB] py-4 text-center text-[14px] text-[#B0B8C1]">아직 없어요</p>}
        </div>
      </div>
    </div>
  );
}

// 공유 편성표(/cell-group/:planId)
// 만든 사람·허락받은 사람만 편집. 로그인한 다른 사람은 보기 + 편집 권한 요청. 로그인 안 한 사람은 보기만
function SharedEditor({ planId, user }: { planId: string; user: User | null }) {
  const navigate = useNavigate();
  const [plan, setPlan] = useState<PlanData | null | "missing">(null);
  const [nick, setNick] = useState(() => myNick(user));
  const [copied, setCopied] = useState(false);
  const [saveErr, setSaveErr] = useState(false);
  const [panel, setPanel] = useState(false);
  const live = useLive(planId, user, nick);
  const ref = useMemo(() => doc(db, PLANS, planId), [planId]);

  useEffect(() => onSnapshot(ref, (s) => setPlan(s.exists() ? (s.data() as PlanData) : "missing"), () => setPlan("missing")), [ref]);
  useEffect(() => { setNick(myNick(user)); }, [user]);
  // 주소로 들어온 사람도 내 목록에 보이게
  useEffect(() => { if (user) updateDoc(ref, { memberUids: arrayUnion(user.uid) }).catch(() => {}); }, [user, ref]);

  if (plan === null) return <Spinner />;
  if (plan === "missing") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#F9FAFB] px-4 text-center">
        <p className="text-[18px] font-bold text-[#191F28]">편성표를 찾을 수 없어요</p>
        <p className="text-[14px] text-[#8B95A1]">지워졌거나 주소가 잘못되었어요</p>
        <button type="button" onClick={() => navigate("/cell-group")} className="h-11 rounded-xl bg-[#3182F6] px-5 text-[15px] font-semibold text-white">소그룹 편성으로</button>
      </div>
    );
  }

  const isOwner = !!user && plan.ownerUid === user.uid;
  const canEdit = !!user && (isOwner || (plan.editorUids ?? []).includes(user.uid));
  const pending = !!user && !!plan.requests?.[user.uid];
  const reqCount = Object.keys(plan.requests ?? {}).length;

  const save = (u: Record<string, unknown>) =>
    updateDoc(ref, u).then(() => setSaveErr(false)).catch(() => setSaveErr(true));

  const write = (u: Updates) => {
    if (!canEdit) return;
    save({ ...Object.fromEntries(Object.entries(u).map(([k, v]) => [k, v === DEL ? deleteField() : v])), updatedAt: serverTimestamp() });
  };

  const me = (): Member => ({ name: nick, email: user?.email ?? "" });
  const requestEdit = () => { if (user) save({ [`requests.${user.uid}`]: { ...me(), at: Date.now() } }); };
  const cancelRequest = () => { if (user) save({ [`requests.${user.uid}`]: deleteField() }); };
  const approve = (uid: string) => {
    const r = plan.requests?.[uid];
    save({ editorUids: arrayUnion(uid), [`editorInfo.${uid}`]: { name: r?.name ?? "", email: r?.email ?? "" }, [`requests.${uid}`]: deleteField() });
  };
  const deny = (uid: string) => save({ [`requests.${uid}`]: deleteField() });
  const removeEditor = (uid: string) => save({ editorUids: arrayRemove(uid), [`editorInfo.${uid}`]: deleteField() });

  const share = async () => {
    const url = `${window.location.origin}/cell-group/${planId}`;
    try { await navigator.clipboard.writeText(url); } catch { prompt("이 주소를 복사해서 보내 주세요", url); }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const changeNick = () => {
    const v = prompt("다른 선생님들에게 보일 내 이름", nick)?.trim();
    if (!v) return;
    try { localStorage.setItem(NICK_KEY, v); } catch { /* 무시 */ }
    setNick(v);
  };

  // 지금 같이 보고 있는 사람(같은 사람이 창 여러 개면 한 번만)
  const viewers = Object.values(live.others).filter((o, i, a) => o?.uid && a.findIndex((x) => x?.uid === o.uid && x?.name === o.name) === i);

  const darkBtn = "h-11 shrink-0 rounded-xl bg-[#191F28] px-4 text-[14px] font-semibold text-white hover:bg-black";
  const banner = !user ? (
    <Notice tone="warn" title="지금은 보기만 할 수 있어요"
      desc="로그인하지 않으면 고친 내용이 저장되지 않아요. 로그인하면 편성표를 만든 분에게 편집 권한을 요청할 수 있어요."
      action={<button type="button" onClick={() => goLogin(navigate, `/cell-group/${planId}`)} className={darkBtn}>로그인하기</button>} />
  ) : !canEdit ? (
    pending ? (
      <Notice tone="info" title="편집 권한을 요청했어요" desc="편성표를 만든 분이 허락하면 이 화면 그대로 바로 편집할 수 있게 바뀌어요."
        action={<button type="button" onClick={cancelRequest} className="h-11 shrink-0 rounded-xl px-4 text-[14px] font-semibold text-[#4E5968] hover:bg-white">요청 취소</button>} />
    ) : (
      <Notice tone="info" title="보기만 할 수 있어요" desc="편성표를 만든 분이 허락하면 함께 편집할 수 있어요."
        action={<button type="button" onClick={requestEdit} className="h-11 shrink-0 rounded-xl bg-[#3182F6] px-4 text-[14px] font-semibold text-white hover:bg-[#1B64DA]">편집 권한 요청하기</button>} />
    )
  ) : isOwner && reqCount > 0 ? (
    <Notice tone="info" title={`편집 권한 요청이 ${reqCount}건 있어요`} desc={Object.values(plan.requests ?? {}).map((r) => r.name).join(", ") + " 님이 함께 편집하고 싶어 해요."}
      action={<button type="button" onClick={() => setPanel(true)} className="h-11 shrink-0 rounded-xl bg-[#3182F6] px-4 text-[14px] font-semibold text-white hover:bg-[#1B64DA]">확인하기</button>} />
  ) : undefined;

  return (
    <>
      <Editor plan={plan} mode={canEdit ? "edit" : "view"} write={write} live={live} onBack={() => navigate("/cell-group")}
        onDeletePlan={isOwner ? () => {
          if (!confirm(`'${plan.title}' 편성표를 지울까요? 같이 쓰던 분들도 더 이상 볼 수 없어요.`)) return;
          deleteDoc(ref).then(() => navigate("/cell-group")).catch(() => alert("지우지 못했어요."));
        } : undefined}
        headerRight={
          <>
            <div className="hidden min-[400px]:flex -space-x-2">
              {user && (
                <button type="button" onClick={changeNick} title={`${nick} (나) · 눌러서 이름 바꾸기`}
                  className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-[12px] font-bold text-white" style={{ background: colorOf(user.uid) }}>
                  {nick.slice(0, 1)}
                </button>
              )}
              {viewers.slice(0, 4).map((o) => (
                <span key={`${o.uid}${o.name}`} title={o.name} className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-[12px] font-bold text-white" style={{ background: o.color }}>
                  {o.name.slice(0, 1)}
                </span>
              ))}
            </div>
            {saveErr && <span className="text-[13px] font-semibold text-[#F04452]">저장 실패</span>}
            {isOwner && (
              <button type="button" onClick={() => setPanel(true)} aria-label="편집 권한 관리"
                className="relative inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-[#F2F4F6] px-3 text-[14px] font-semibold text-[#191F28] hover:bg-[#E5E8EB]">
                <ShieldCheck className="h-4 w-4" /><span className="hidden sm:inline">권한</span>
                {reqCount > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#F04452] px-1 text-[11px] font-bold text-white">{reqCount}</span>}
              </button>
            )}
            <button type="button" onClick={share} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-[#E8F3FF] px-3 text-[14px] font-semibold text-[#1B64DA] hover:bg-[#D6E8FF]">
              <Link2 className="h-4 w-4" />{copied ? "복사됨" : <span>공유<span className="hidden sm:inline">하기</span></span>}
            </button>
          </>
        }
        banner={banner} />
      {panel && isOwner && <AccessPanel plan={plan} onApprove={approve} onDeny={deny} onRemove={removeEditor} onClose={() => setPanel(false)} />}
    </>
  );
}

export function CellGroupPage() {
  const { planId } = useParams();
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => onAuthStateChanged(auth, setUser), []);

  if (user === undefined) return <Spinner />;
  if (planId) return <SharedEditor key={planId} planId={planId} user={user} />;
  return user ? <PlanList user={user} /> : <LocalEditor />;
}
