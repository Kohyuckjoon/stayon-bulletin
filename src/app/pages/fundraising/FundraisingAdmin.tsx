import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where, writeBatch, deleteDoc,
} from "firebase/firestore";
import { onAuthStateChanged, type User } from "firebase/auth";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { QRCodeCanvas } from "qrcode.react";
import {
  LayoutGrid, Gift, QrCode, ListChecks, Smartphone, GripVertical, ImageIcon, Trash2, Info, Check, Download, Copy,
} from "lucide-react";
import { auth, db, storage } from "../../../firebase";
import { isOperatorEmail } from "../../../utils/operator";

// 모금 프로젝트(러브링 등) 교회 관리자 화면 — /admin/fundraising, /admin/fundraising/:projectId
// 시안 07(모니터링) · 08(소원·랜덤 선물 관리) · 09(입금 계좌·QR) + 입금 알림 내역.
// fundraisers 컬렉션만 읽고 씀. 주보·결제·정기결제·성도 주보 화면 코드는 쓰지도 고치지도 않음.
// 볼 수 있는 사람: 연결된 교회 계정 · 담당자 이메일 · 운영자 (firestore.rules canManage 와 같은 기준)
// 합계는 아직 서버 함수(다음 단계)가 없어서, 담당자가 읽을 수 있는 입금 알림 목록으로 화면에서 계산해 보여 줌

type Status = "draft" | "open" | "closed";
type DStatus = "pending" | "confirmed" | "rejected";
interface Bank { name: string; account: string; holder: string; memoGuide: string }
interface RandomGift { enabled: boolean; label: string; desc: string; goal: number | null }
interface Project {
  id: string; ownerUid: string; churchName: string; title: string; startDate: string; endDate: string; status: Status;
  bank: Bank; displayMode: "instant" | "confirmed"; randomGift: RandomGift; displayShowQr?: boolean;
  qrIssuedAt?: { toDate?: () => Date } | null;
  headline: string; notice: string; // 성도 화면·9:16 화면 큰 제목 / 맨 아래 안내 문구
}
interface Wish { id: string; name: string; desc: string; imageUrl: string; goal: number; order: number; visible: boolean }
interface Donation { id: string; wishId: string; amount: number; name: string; anonymous: boolean; status: DStatus; createdAt?: { toDate?: () => Date } | null }

const C = { bg: "#F4F5F7", card: "#FFFFFF", ink: "#191F28", sub: "#4E5968", muted: "#8B95A1", line: "#E5E8EB", blue: "#3182F6", blueBg: "#E8F3FF", red: "#F04452", redBg: "#FFEEEE", green: "#00A661", greenBg: "#E5F8EE", orange: "#B76E00", orangeBg: "#FFF4DE", gold: "#F2C36B", goldBg: "#FFFAF0" };
const won = (n?: number | null) => `${Math.round(n || 0).toLocaleString("ko-KR")}원`;
const toNum = (v: string) => Number(v.replace(/[^\d]/g, "")) || 0;
const pct = (a: number, b: number) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0);
const tsDate = (t?: { toDate?: () => Date } | null) => (t && typeof t.toDate === "function" ? t.toDate() : null);
const hm = (d: Date | null) => (d ? `${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : "-");
const md = (s: string) => (s ? `${Number(s.slice(5, 7))}.${Number(s.slice(8, 10))}` : "");
const dday = (end: string) => {
  if (!end) return "-";
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const e = new Date(`${end}T00:00:00`);
  const n = Math.round((e.getTime() - t.getTime()) / 86400000);
  return n > 0 ? `D-${n}` : n === 0 ? "D-DAY" : "종료";
};
const BANKS = ["KB국민", "신한", "우리", "하나", "NH농협", "IBK기업", "카카오뱅크", "토스뱅크", "BNK부산", "BNK경남", "DGB대구", "광주", "전북", "제주", "SC제일", "씨티", "새마을금고", "신협", "우체국", "수협", "케이뱅크", "산업"];
const giveUrl = (pid: string) => `${window.location.origin}/give/${pid}`;

// 사진을 줄여서 올림(긴 쪽 maxSize, jpg)
async function resizeToBlob(file: File, maxSize: number, quality = 0.82): Promise<Blob> {
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

// 토스 스타일 ON/OFF 스위치
const Toggle = ({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
    className="relative h-8 w-[52px] shrink-0 rounded-full transition-colors" style={{ background: on ? C.blue : "#D1D6DB" }}>
    <span className="absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all" style={{ left: on ? 24 : 4 }} />
  </button>
);
const Bar = ({ value, color = C.blue }: { value: number; color?: string }) => (
  <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "#E5E8EB" }}>
    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${value}%`, background: color }} />
  </div>
);
const Card = ({ children, className = "", style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) => (
  <div className={`rounded-[20px] bg-white ${className}`} style={style}>{children}</div>
);
const StatusPill = ({ s }: { s: DStatus }) => {
  const m = { pending: ["확인 대기", C.orange, C.orangeBg], confirmed: ["확인 완료", C.green, C.greenBg], rejected: ["반려", C.muted, C.bg] }[s];
  return <span className="inline-block rounded-full px-2.5 py-1 text-xs font-bold" style={{ color: m[1], background: m[2] }}>{m[0]}</span>;
};

// ── 권한 확인 + 실시간 데이터 ─────────────────────────────
function useProject(pid: string) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [role, setRole] = useState("");
  const [project, setProject] = useState<Project | null>(null);
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => onAuthStateChanged(auth, setUser), []);
  useEffect(() => {
    if (user === undefined) return;
    if (!user) { setAllowed(false); return; }
    let cancelled = false;
    (async () => {
      if (isOperatorEmail(user.email)) { if (!cancelled) { setAllowed(true); setRole("운영자"); } return; }
      try {
        const acl = await getDoc(doc(db, "fundraisers", pid, "meta", "acl"));
        const a = acl.data() || {};
        const ok = acl.exists() && (a.ownerUid === user.uid || (Array.isArray(a.managerEmails) && a.managerEmails.includes((user.email || "").toLowerCase())));
        if (!cancelled) { setAllowed(ok); setRole(a.ownerUid === user.uid ? "교회 계정" : "담당자"); }
      } catch {
        if (!cancelled) setAllowed(false); // 규칙상 담당자가 아니면 읽기 자체가 막힘
      }
    })();
    return () => { cancelled = true; };
  }, [user, pid]);
  useEffect(() => {
    if (!allowed) return;
    const u1 = onSnapshot(doc(db, "fundraisers", pid), (s) => {
      if (!s.exists()) { setNotFound(true); return; }
      const d = s.data() as Partial<Project>;
      setProject({
        id: s.id, ownerUid: d.ownerUid || "", churchName: d.churchName || "", title: d.title || "", startDate: d.startDate || "", endDate: d.endDate || "",
        status: (d.status as Status) || "draft",
        bank: { name: "", account: "", holder: "", memoGuide: "", ...(d.bank || {}) },
        displayMode: d.displayMode === "confirmed" ? "confirmed" : "instant",
        randomGift: { enabled: false, label: "", desc: "", goal: null, ...(d.randomGift || {}) },
        displayShowQr: d.displayShowQr !== false,
        qrIssuedAt: d.qrIssuedAt || null,
        headline: d.headline || "", notice: d.notice || "",
      });
    });
    const u2 = onSnapshot(query(collection(db, "fundraisers", pid, "wishes"), orderBy("order")), (s) => {
      setWishes(s.docs.map((x) => {
        const d = x.data();
        return { id: x.id, name: d.name || "", desc: d.desc || "", imageUrl: d.imageUrl || "", goal: Number(d.goal) || 0, order: Number(d.order) || 0, visible: d.visible !== false };
      }));
    });
    const u3 = onSnapshot(query(collection(db, "fundraisers", pid, "donations"), orderBy("createdAt", "desc")), (s) => {
      setDonations(s.docs.map((x) => {
        const d = x.data();
        return { id: x.id, wishId: d.wishId || "", amount: Number(d.amount) || 0, name: d.name || "", anonymous: !!d.anonymous, status: (d.status as DStatus) || "pending", createdAt: d.createdAt || null };
      }));
    });
    return () => { u1(); u2(); u3(); };
  }, [allowed, pid]);
  return { user, allowed, role, project, wishes, donations, notFound };
}

// 입금 알림으로 계산한 합계(서버 함수 생기기 전까지 화면 계산)
function useStats(project: Project | null, wishes: Wish[], donations: Donation[]) {
  return useMemo(() => {
    const valid = donations.filter((d) => d.status !== "rejected");
    const counts = (d: Donation) => (project?.displayMode === "confirmed" ? d.status === "confirmed" : d.status !== "rejected");
    const raisedOf = (wid: string) => donations.filter((d) => d.wishId === wid && counts(d)).reduce((a, d) => a + d.amount, 0);
    const pending = donations.filter((d) => d.status === "pending");
    const goal = wishes.filter((w) => w.visible).reduce((a, w) => a + w.goal, 0);
    return {
      reported: valid.reduce((a, d) => a + d.amount, 0),
      confirmed: donations.filter((d) => d.status === "confirmed").reduce((a, d) => a + d.amount, 0),
      pendingCount: pending.length,
      pendingSum: pending.reduce((a, d) => a + d.amount, 0),
      count: valid.length,
      anon: valid.filter((d) => d.anonymous || !d.name).length,
      goal,
      raisedOf,
    };
  }, [project?.displayMode, wishes, donations]);
}

// ── QR (화면용 + 내려받기용) ─────────────────────────────
function downloadCanvas(canvas: HTMLCanvasElement | null, filename: string) {
  if (!canvas) return;
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = filename;
  a.click();
}

// ── 화면: 모니터링 (시안 07) ─────────────────────────────
function Monitoring({ project, wishes, donations, stats, onTab, qrSmallRef }: {
  project: Project; wishes: Wish[]; donations: Donation[]; stats: ReturnType<typeof useStats>; onTab: (t: Tab) => void; qrSmallRef: React.RefObject<HTMLCanvasElement | null>;
}) {
  const wishName = (id: string) => (id === "random" ? (project.randomGift.label || "랜덤 선물") : wishes.find((w) => w.id === id)?.name || "-");
  const exportCsv = () => {
    const rows = [["시간", "이름", "익명", "소원", "금액", "상태"], ...donations.map((d) => [hm(tsDate(d.createdAt)), d.name, d.anonymous ? "Y" : "", wishName(d.wishId), String(d.amount), { pending: "확인 대기", confirmed: "확인 완료", rejected: "반려" }[d.status]])];
    const csv = "﻿" + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `${project.churchName}_${project.title}_입금알림.csv`;
    a.click();
  };
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-black" style={{ color: C.ink }}>전체 모니터링</h1>
          <p className="mt-1 text-[15px]" style={{ color: C.sub }}>{project.title} 모금 현황과 입금 알림을 한눈에 확인해요.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => window.open(`/give/${project.id}/display`, "_blank")} className="rounded-xl border bg-white px-4 py-2.5 text-sm font-bold" style={{ borderColor: C.line, color: C.ink }}>DID 화면 열기</button>
          <button type="button" onClick={() => downloadCanvas(qrSmallRef.current, `${project.churchName}_${project.title}_QR.png`)} className="rounded-xl border bg-white px-4 py-2.5 text-sm font-bold" style={{ borderColor: C.line, color: C.ink }}>QR 이미지 받기</button>
          <button type="button" onClick={exportCsv} className="rounded-xl px-4 py-2.5 text-sm font-bold text-white" style={{ background: C.blue }}>엑셀로 내려받기</button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-6"><p className="text-sm" style={{ color: C.sub }}>신고된 모금액</p><p className="mt-3 text-[28px] font-black tabular-nums" style={{ color: C.ink }}>{won(stats.reported)}</p><p className="mt-2 text-sm" style={{ color: C.blue }}>목표 {won(stats.goal)} · {pct(stats.reported, stats.goal)}%</p></Card>
        <Card className="p-6"><p className="text-sm" style={{ color: C.sub }}>재정부 확인 완료</p><p className="mt-3 text-[28px] font-black tabular-nums" style={{ color: C.ink }}>{won(stats.confirmed)}</p><p className="mt-2 text-sm" style={{ color: C.sub }}>확인 대기 {stats.pendingCount}건 · {won(stats.pendingSum)}</p></Card>
        <Card className="p-6"><p className="text-sm" style={{ color: C.sub }}>참여 건수</p><p className="mt-3 text-[28px] font-black tabular-nums" style={{ color: C.ink }}>{stats.count}건</p><p className="mt-2 text-sm" style={{ color: C.sub }}>익명 {stats.anon}건</p></Card>
        <Card className="p-6"><p className="text-sm" style={{ color: C.sub }}>모금 기간</p><p className="mt-3 text-[28px] font-black" style={{ color: C.ink }}>{dday(project.endDate)}</p><p className="mt-2 text-sm" style={{ color: C.sub }}>{md(project.startDate)} ~ {md(project.endDate)}</p></Card>
      </div>

      <Card className="mt-6 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black" style={{ color: C.ink }}>소원 항목</h2>
          <button type="button" onClick={() => onTab("wishes")} className="rounded-xl px-4 py-2 text-sm font-bold" style={{ background: C.blueBg, color: C.blue }}>+ 소원 추가</button>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[15px]">
            <thead><tr className="border-b" style={{ borderColor: C.line, color: C.sub }}>
              {["순서", "소원 이름", "목표액", "모금액", "달성률", "공개", "관리"].map((h) => <th key={h} className="px-3 py-3 font-medium">{h}</th>)}
            </tr></thead>
            <tbody>
              {wishes.length === 0 && <tr><td colSpan={7} className="px-3 py-10 text-center" style={{ color: C.muted }}>아직 소원이 없어요. [+ 소원 추가]로 만들어 주세요.</td></tr>}
              {wishes.map((w, i) => {
                const r = stats.raisedOf(w.id); const p = pct(r, w.goal);
                return (
                  <tr key={w.id} className="border-b" style={{ borderColor: "#F2F4F6" }}>
                    <td className="px-3 py-4" style={{ color: C.sub }}>{i + 1}</td>
                    <td className="px-3 py-4 font-bold" style={{ color: C.ink }}>{w.name}</td>
                    <td className="px-3 py-4 tabular-nums">{won(w.goal)}</td>
                    <td className="px-3 py-4 tabular-nums">{won(r)}</td>
                    <td className="px-3 py-4 font-bold tabular-nums" style={{ color: p >= 100 ? C.red : C.ink }}>{p}%{p >= 100 ? " 완료" : ""}</td>
                    <td className="px-3 py-4">{w.visible ? "공개" : <span style={{ color: C.muted }}>숨김</span>}</td>
                    <td className="px-3 py-4"><button type="button" onClick={() => onTab("wishes")} className="font-bold underline" style={{ color: C.blue }}>수정</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mt-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-black" style={{ color: C.ink }}>입금 알림 내역</h2>
          <p className="text-sm" style={{ color: C.sub }}>통장 내역과 대조 후 [확인]을 눌러주세요. 잘못된 신고는 [수정]·[삭제]하면 게이지에 바로 반영돼요.</p>
        </div>
        <DonationTable project={project} wishes={wishes} donations={donations.slice(0, 8)} />
        {donations.length > 8 && <button type="button" onClick={() => onTab("donations")} className="mt-3 text-sm font-bold" style={{ color: C.blue }}>전체 {donations.length}건 보기 →</button>}
      </Card>

      <Card className="mt-6 grid gap-5 p-6 md:grid-cols-3">
        <div>
          <p className="text-sm" style={{ color: C.sub }}>입금 계좌</p>
          <button type="button" onClick={() => onTab("account")} className="mt-2 w-full truncate rounded-xl border px-4 py-3 text-left text-[15px] font-bold" style={{ borderColor: C.line, color: project.bank.account ? C.ink : C.muted }}>
            {project.bank.account ? `${project.bank.name} ${project.bank.account} ${project.bank.holder}` : "계좌를 입력해 주세요"}
          </button>
        </div>
        <div>
          <p className="text-sm" style={{ color: C.sub }}>모금 기간</p>
          <p className="mt-2 rounded-xl border px-4 py-3 text-[15px] font-bold tabular-nums" style={{ borderColor: C.line, color: C.ink }}>{project.startDate || "-"} ~ {project.endDate || "-"}</p>
        </div>
        <div>
          <p className="text-sm" style={{ color: C.sub }}>DID 표시 기준</p>
          <select value={project.displayMode} onChange={(e) => updateDoc(doc(db, "fundraisers", project.id), { displayMode: e.target.value, updatedAt: serverTimestamp() })}
            className="mt-2 w-full rounded-xl border bg-white px-4 py-3 text-[15px] font-bold outline-none" style={{ borderColor: C.line, color: C.ink }}>
            <option value="instant">신고 즉시 반영 (기본)</option>
            <option value="confirmed">재정부 확인 후 반영</option>
          </select>
        </div>
      </Card>
    </div>
  );
}

// 입금 알림 표(모니터링 · 입금 알림 내역 공통)
function DonationTable({ project, wishes, donations }: { project: Project; wishes: Wish[]; donations: Donation[] }) {
  const [editing, setEditing] = useState<Donation | null>(null);
  const [eAmount, setEAmount] = useState("");
  const [eName, setEName] = useState("");
  const wishName = (id: string) => (id === "random" ? (project.randomGift.label || "랜덤 선물") : wishes.find((w) => w.id === id)?.name || "-");
  const ref = (d: Donation) => doc(db, "fundraisers", project.id, "donations", d.id);
  const setStatus = async (d: Donation, status: DStatus) => {
    try { await updateDoc(ref(d), { status }); } catch (e) { console.error(e); notify({ tone: "error", title: "바꾸지 못했어요", desc: "잠시 후 다시 시도해 주세요." }); }
  };
  const remove = async (d: Donation) => {
    if (!confirm(`${d.name || "(익명)"} · ${won(d.amount)} 입금 알림을 삭제할까요?`)) return;
    try { await deleteDoc(ref(d)); } catch (e) { console.error(e); notify({ tone: "error", title: "삭제하지 못했어요", desc: "잠시 후 다시 시도해 주세요." }); }
  };
  const saveEdit = async () => {
    if (!editing) return;
    const amount = toNum(eAmount);
    if (amount < 1000) { notify({ tone: "warn", title: "금액을 확인해 주세요", desc: "금액은 1,000원 이상이어야 해요." }); return; }
    try { await updateDoc(ref(editing), { amount, name: eName.trim().slice(0, 20) }); setEditing(null); }
    catch (e) { console.error(e); notify({ tone: "error", title: "저장하지 못했어요", desc: "인터넷 연결을 확인하고 다시 시도해 주세요." }); }
  };
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-[15px]">
        <thead><tr className="border-b" style={{ borderColor: C.line, color: C.sub }}>
          {["시간", "이름", "소원", "금액", "상태", "관리"].map((h) => <th key={h} className="px-3 py-3 font-medium">{h}</th>)}
        </tr></thead>
        <tbody>
          {donations.length === 0 && <tr><td colSpan={6} className="px-3 py-10 text-center" style={{ color: C.muted }}>아직 들어온 입금 알림이 없어요.</td></tr>}
          {donations.map((d) => (
            <tr key={d.id} className="border-b" style={{ borderColor: "#F2F4F6", opacity: d.status === "rejected" ? 0.55 : 1 }}>
              <td className="px-3 py-4 tabular-nums" style={{ color: C.sub }}>{hm(tsDate(d.createdAt))}</td>
              <td className="px-3 py-4">{d.anonymous || !d.name ? <span style={{ color: C.sub }}>(익명){d.name ? ` ${d.name}` : ""}</span> : d.name}</td>
              <td className="px-3 py-4">{wishName(d.wishId)}</td>
              <td className="px-3 py-4 font-bold tabular-nums">{won(d.amount)}</td>
              <td className="px-3 py-4"><StatusPill s={d.status} /></td>
              <td className="px-3 py-4">
                <div className="flex flex-wrap gap-3 text-[15px] font-bold underline" style={{ color: C.blue }}>
                  {d.status !== "confirmed" && <button type="button" onClick={() => setStatus(d, "confirmed")}>확인</button>}
                  {d.status === "confirmed" && <button type="button" onClick={() => setStatus(d, "pending")} style={{ color: C.sub }}>확인 취소</button>}
                  <button type="button" onClick={() => { setEditing(d); setEAmount(String(d.amount)); setEName(d.name); }}>수정</button>
                  {d.status !== "rejected" && <button type="button" onClick={() => setStatus(d, "rejected")} style={{ color: C.sub }}>반려</button>}
                  <button type="button" onClick={() => remove(d)} style={{ color: C.red }}>삭제</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {editing && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4" onClick={() => setEditing(null)}>
          <div className="w-full max-w-sm rounded-[24px] bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-lg font-black" style={{ color: C.ink }}>입금 알림 수정</p>
            <label className="mt-4 block text-sm font-bold" style={{ color: C.sub }}>금액</label>
            <input value={Number(toNum(eAmount)).toLocaleString("ko-KR")} onChange={(e) => setEAmount(e.target.value)} inputMode="numeric" className="mt-2 w-full rounded-xl border px-4 py-3 text-right text-lg font-bold outline-none focus:border-[#3182F6]" style={{ borderColor: C.line }} />
            <label className="mt-4 block text-sm font-bold" style={{ color: C.sub }}>이름</label>
            <input value={eName} onChange={(e) => setEName(e.target.value)} maxLength={20} className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-[#3182F6]" style={{ borderColor: C.line }} />
            <div className="mt-6 flex gap-2">
              <button type="button" onClick={() => setEditing(null)} className="h-12 flex-1 rounded-2xl font-bold" style={{ background: C.bg, color: C.sub }}>취소</button>
              <button type="button" onClick={saveEdit} className="h-12 flex-1 rounded-2xl font-bold text-white" style={{ background: C.blue }}>저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 화면: 소원 · 랜덤 선물 관리 (시안 08) ─────────────────────────────
type WishDraft = Wish & { isNew?: boolean };
// 머티리얼 스타일 안내 팝업(2026-11-13): 어두운 배경 위로 카드가 살짝 커지며 나타나고, 아이콘이 그려짐.
// tone: success(초록 체크) / error(빨간 ✕) / warn(주황 !). 확인·배경·Esc·Enter로 닫힘
// 이 화면 어디서든 notify({...})로 띄움(브라우저 알림창 alert 대신) — 화면 맨 위에 <NoticeHost /> 하나만 둠
type NoticeTone = "success" | "error" | "warn";
type Notice = { tone: NoticeTone; title: string; desc?: string };
let pushNotice: ((n: Notice) => void) | null = null;
const notify = (n: Notice) => { if (pushNotice) pushNotice(n); else alert([n.title, n.desc].filter(Boolean).join("\n")); };
const NOTICE_TONE: Record<NoticeTone, { bg: string; fg: string }> = {
  success: { bg: C.greenBg, fg: C.green },
  error: { bg: C.redBg, fg: C.red },
  warn: { bg: C.orangeBg, fg: "#F59E0B" },
};
function DonePopup({ open, tone = "success", title, desc, onClose }: { open: boolean; tone?: NoticeTone; title: string; desc?: string; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" || e.key === "Enter") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  const t = NOTICE_TONE[tone];
  const path = tone === "success" ? "M5 12.5l4.5 4.5L19 7.5" : tone === "error" ? "M7 7l10 10M17 7 7 17" : "M12 6v8M12 18h.01";
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-5" role="dialog" aria-modal="true" onClick={onClose}>
      <style>{`
        @keyframes dpScrim{from{opacity:0}to{opacity:1}}
        @keyframes dpCard{from{opacity:0;transform:translateY(12px) scale(.92)}to{opacity:1;transform:translateY(0) scale(1)}}
        @keyframes dpRing{from{transform:scale(.4);opacity:0}60%{transform:scale(1.08);opacity:1}to{transform:scale(1)}}
        @keyframes dpCheck{from{stroke-dashoffset:30}to{stroke-dashoffset:0}}
        @keyframes dpShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}
      `}</style>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" style={{ animation: "dpScrim .2s ease-out both" }} />
      <div className="relative w-full max-w-[340px] rounded-[28px] bg-white px-6 pt-8 pb-5 text-center"
        style={{ boxShadow: "0 24px 48px rgba(0,0,0,.18), 0 4px 12px rgba(0,0,0,.08)", animation: "dpCard .32s cubic-bezier(.2,0,0,1) both" }}
        onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full"
          style={{ background: t.bg, animation: `dpRing .45s cubic-bezier(.2,0,0,1) .08s both${tone === "error" ? ", dpShake .35s ease-in-out .55s" : ""}` }}>
          <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke={t.fg} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d={path} style={{ strokeDasharray: 30, animation: "dpCheck .4s ease-out .35s both" }} />
          </svg>
        </div>
        <p className="mt-5 text-[20px] font-bold break-keep" style={{ color: C.ink }}>{title}</p>
        {desc && <p className="mt-2 text-[15px] leading-relaxed break-keep" style={{ color: C.sub }}>{desc}</p>}
        <button type="button" autoFocus onClick={onClose}
          className="mt-7 w-full rounded-2xl py-3.5 text-[16px] font-bold text-white transition-transform active:scale-[0.98]" style={{ background: tone === "error" ? C.ink : C.blue }}>확인</button>
      </div>
    </div>
  );
}
function NoticeHost() {
  const [n, setN] = useState<Notice | null>(null);
  useEffect(() => { pushNotice = setN; return () => { pushNotice = null; }; }, []);
  return <DonePopup open={!!n} tone={n?.tone} title={n?.title || ""} desc={n?.desc} onClose={() => setN(null)} />;
}

function WishesEditor({ project, wishes, stats, uid }: { project: Project; wishes: Wish[]; stats: ReturnType<typeof useStats>; uid: string }) {
  const [list, setList] = useState<WishDraft[]>(wishes);
  const [removed, setRemoved] = useState<string[]>([]);
  const [gift, setGift] = useState<RandomGift>(project.randomGift);
  const [headline, setHeadline] = useState(project.headline);
  const [notice, setNotice] = useState(project.notice);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const dirty = useRef(false);
  // 다른 곳에서 바뀐 내용은 아직 고치는 중이 아닐 때만 다시 받음
  useEffect(() => { if (!dirty.current) setList(wishes); }, [wishes]);
  useEffect(() => { if (!dirty.current) setGift(project.randomGift); }, [project.randomGift]);
  useEffect(() => { if (!dirty.current) { setHeadline(project.headline); setNotice(project.notice); } }, [project.headline, project.notice]);
  const touch = () => { dirty.current = true; };
  const patch = (i: number, p: Partial<WishDraft>) => { touch(); setList((prev) => prev.map((w, j) => (j === i ? { ...w, ...p } : w))); };
  const add = () => { touch(); setList((prev) => [...prev, { id: doc(collection(db, "fundraisers", project.id, "wishes")).id, name: "", desc: "", imageUrl: "", goal: 0, order: prev.length, visible: true, isNew: true }]); };
  const del = (i: number) => {
    const w = list[i];
    if (!confirm(`"${w.name || "새 소원"}"을(를) 지울까요? (변경사항 저장을 눌러야 반영돼요)`)) return;
    touch();
    if (!w.isNew) setRemoved((r) => [...r, w.id]);
    setList((prev) => prev.filter((_, j) => j !== i));
  };
  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= list.length) return;
    touch();
    setList((prev) => { const n = [...prev]; const [x] = n.splice(from, 1); n.splice(to, 0, x); return n; });
  };
  const upload = async (i: number, file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { notify({ tone: "warn", title: "사진 파일만 올릴 수 있어요", desc: "JPG·PNG 같은 사진 파일을 골라 주세요." }); return; }
    const w = list[i];
    setUploading(w.id);
    try {
      const blob = await resizeToBlob(file, 1000);
      const r = storageRef(storage, `fundraisers/${project.id}/wishes/${w.id}-${Date.now()}.jpg`);
      await uploadBytes(r, blob, { contentType: "image/jpeg", customMetadata: { uploadedBy: uid } });
      patch(i, { imageUrl: await getDownloadURL(r) });
    } catch (e) {
      console.error(e); notify({ tone: "error", title: "사진을 올리지 못했어요", desc: "인터넷 연결을 확인하고 다시 시도해 주세요." });
    } finally {
      setUploading(null);
    }
  };
  const save = async () => {
    if (list.some((w) => !w.name.trim())) { notify({ tone: "warn", title: "이름이 비어 있는 소원이 있어요", desc: "소원 이름을 모두 입력해 주세요." }); return; }
    if (gift.enabled && !gift.label.trim()) { notify({ tone: "warn", title: "랜덤 선물 이름을 입력해 주세요", desc: "성도 화면에 보여줄 이름이 필요해요." }); return; }
    setSaving(true);
    try {
      const b = writeBatch(db);
      list.forEach((w, i) => {
        const data = { name: w.name.trim(), desc: w.desc.trim(), imageUrl: w.imageUrl, goal: Math.max(0, Math.round(w.goal)), order: i, visible: w.visible };
        const r = doc(db, "fundraisers", project.id, "wishes", w.id);
        if (w.isNew) b.set(r, data); else b.update(r, data);
      });
      removed.forEach((id) => b.delete(doc(db, "fundraisers", project.id, "wishes", id)));
      b.update(doc(db, "fundraisers", project.id), {
        randomGift: { enabled: gift.enabled, label: gift.label.trim(), desc: gift.desc.trim(), goal: gift.goal && gift.goal > 0 ? Math.round(gift.goal) : null },
        headline: headline.trim(),
        notice: notice.trim(),
        updatedAt: serverTimestamp(),
      });
      await b.commit();
      dirty.current = false;
      setRemoved([]);
      setList((prev) => prev.map((w) => ({ ...w, isNew: false })));
      notify({ tone: "success", title: "저장했어요", desc: "성도 화면과 9:16 화면에 바로 반영돼요." });
    } catch (e) {
      console.error(e); notify({ tone: "error", title: "저장하지 못했어요", desc: "인터넷 연결을 확인하고 다시 시도해 주세요." });
    } finally {
      setSaving(false);
    }
  };
  const giftRaised = stats.raisedOf("random");
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-black" style={{ color: C.ink }}>소원 · 랜덤 선물 관리</h1>
          <p className="mt-1 text-[15px]" style={{ color: C.sub }}>여기서 입력한 내용이 성도 화면과 9:16 화면에 그대로 보여요.</p>
        </div>
        <button type="button" onClick={add} className="rounded-xl px-5 py-3 text-[15px] font-bold text-white" style={{ background: C.blue }}>+ 소원 추가</button>
      </div>

      {/* 성도 화면·9:16 화면의 큰 제목과 맨 아래 안내 문구(비우면 기본 문구) */}
      <Card className="mt-6 grid gap-4 p-6 md:grid-cols-2">
        <div>
          <p className="text-sm font-bold" style={{ color: C.sub }}>화면 큰 제목 <span className="font-normal" style={{ color: C.muted }}>(엔터로 줄바꿈)</span></p>
          <textarea value={headline} onChange={(e) => { touch(); setHeadline(e.target.value); }} rows={2} placeholder={"ex. 아이들의 겨울에\n따뜻한 선물을 보내요"}
            className="mt-2 w-full resize-none rounded-xl border px-4 py-3 text-[16px] font-bold outline-none focus:border-[#3182F6]" style={{ borderColor: C.line, color: C.ink }} />
        </div>
        <div>
          <p className="text-sm font-bold" style={{ color: C.sub }}>성도 화면 맨 아래 안내 <span className="font-normal" style={{ color: C.muted }}>(선택)</span></p>
          <textarea value={notice} onChange={(e) => { touch(); setNotice(e.target.value); }} rows={2} placeholder="ex. 받는 가정의 이름과 사진은 공개하지 않아요. 모은 사랑은 12월 20일 성탄 주일에 선물로 전해져요."
            className="mt-2 w-full resize-none rounded-xl border px-4 py-3 text-[15px] outline-none focus:border-[#3182F6]" style={{ borderColor: C.line, color: C.sub }} />
        </div>
      </Card>

      <Card className="mt-6 p-6">
        <div className="flex items-center justify-between border-b pb-4" style={{ borderColor: "#F2F4F6" }}>
          <p className="text-lg font-black" style={{ color: C.ink }}>소원 목록 <span style={{ color: C.blue }}>{list.length}</span></p>
          <p className="hidden sm:block text-sm" style={{ color: C.sub }}>왼쪽 손잡이를 끌어서 순서를 바꿀 수 있어요</p>
        </div>
        {list.length === 0 && <p className="py-12 text-center text-sm" style={{ color: C.muted }}>아직 소원이 없어요. 오른쪽 위 [+ 소원 추가]를 눌러 주세요.</p>}
        {list.map((w, i) => {
          const r = stats.raisedOf(w.id); const p = pct(r, w.goal);
          return (
            <div key={w.id} draggable onDragStart={() => setDragIdx(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (dragIdx !== null) move(dragIdx, i); setDragIdx(null); }}
              className="grid items-center gap-3 border-b py-5 md:grid-cols-[24px_100px_minmax(0,1fr)_200px_200px_auto]" style={{ borderColor: "#F2F4F6", opacity: dragIdx === i ? 0.5 : 1 }}>
              <span className="hidden md:flex cursor-grab items-center justify-center" style={{ color: "#B0B8C1" }}><GripVertical className="h-5 w-5" /></span>
              <label className="relative flex h-[100px] w-[100px] cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl border border-dashed text-xs" style={{ borderColor: "#D1D6DB", color: C.sub, background: "#FAFAFB" }}>
                {w.imageUrl ? <img src={w.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <><ImageIcon className="h-6 w-6" />{uploading === w.id ? "올리는 중…" : "사진 바꾸기"}</>}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => { void upload(i, e.target.files?.[0]); e.target.value = ""; }} />
              </label>
              <div className="space-y-2">
                <input value={w.name} onChange={(e) => patch(i, { name: e.target.value })} placeholder="소원 이름 (ex. 학교에 가져갈 가방)" className="w-full rounded-xl border px-4 py-3 text-[16px] font-bold outline-none focus:border-[#3182F6]" style={{ borderColor: C.line, color: C.ink }} />
                <input value={w.desc} onChange={(e) => patch(i, { desc: e.target.value })} placeholder="한 줄 설명 (ex. 새로운 학기를 준비하는 아이에게)" className="w-full rounded-xl border px-4 py-2.5 text-[15px] outline-none focus:border-[#3182F6]" style={{ borderColor: C.line, color: C.sub }} />
              </div>
              <div>
                <p className="text-sm" style={{ color: C.sub }}>목표 금액</p>
                <div className="mt-1.5 flex items-center rounded-xl border px-4 py-3" style={{ borderColor: C.line }}>
                  <input value={w.goal ? w.goal.toLocaleString("ko-KR") : ""} onChange={(e) => patch(i, { goal: toNum(e.target.value) })} inputMode="numeric" placeholder="0"
                    className="min-w-0 flex-1 bg-transparent text-right text-[18px] font-bold tabular-nums outline-none" style={{ color: C.ink }} />
                  <span className="ml-1.5 font-bold" style={{ color: C.ink }}>원</span>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-sm"><span style={{ color: C.sub }}>모금 현황</span><b style={{ color: p >= 100 ? C.red : C.blue }}>{p}%</b></div>
                <div className="mt-2"><Bar value={p} color={p >= 100 ? C.red : C.blue} /></div>
                <p className="mt-2 text-sm" style={{ color: C.sub }}>{won(r)} 모임{p >= 100 ? " · 모금 완료" : ""}</p>
              </div>
              <div className="flex items-center gap-3 md:justify-end">
                <span className="text-sm" style={{ color: C.sub }}>공개</span>
                <Toggle on={w.visible} onChange={(v) => patch(i, { visible: v })} label="공개" />
                <div className="flex md:hidden gap-1">
                  <button type="button" onClick={() => move(i, i - 1)} className="rounded-lg px-2 py-1 text-sm" style={{ background: C.bg }}>↑</button>
                  <button type="button" onClick={() => move(i, i + 1)} className="rounded-lg px-2 py-1 text-sm" style={{ background: C.bg }}>↓</button>
                </div>
                <button type="button" aria-label="소원 지우기" onClick={() => del(i)} className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: C.bg, color: C.sub }}><Trash2 className="h-5 w-5" /></button>
              </div>
            </div>
          );
        })}
      </Card>

      <Card className="mt-6 p-6" style={{ border: `2px solid ${C.gold}` }}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: "#FDEBC8", color: C.orange }}><Gift className="h-7 w-7" /></span>
            <div>
              <p className="text-lg font-black" style={{ color: C.ink }}>랜덤 선물</p>
              <p className="text-sm" style={{ color: C.sub }}>켜면 소원 목록 맨 아래에 랜덤 선물 칸이 생겨요 · 지금까지 {won(giftRaised)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[15px] font-bold" style={{ color: gift.enabled ? C.blue : C.muted }}>{gift.enabled ? "사용 중" : "꺼짐"}</span>
            <Toggle on={gift.enabled} onChange={(v) => { touch(); setGift((g) => ({ ...g, enabled: v })); }} label="랜덤 선물 사용" />
          </div>
        </div>
        {gift.enabled && (
          <>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-sm" style={{ color: C.sub }}>보여줄 이름</p>
                <input value={gift.label} onChange={(e) => { touch(); setGift((g) => ({ ...g, label: e.target.value })); }} placeholder="랜덤 선물" className="mt-1.5 w-full rounded-xl border px-4 py-3 text-[16px] font-bold outline-none focus:border-[#3182F6]" style={{ borderColor: C.line }} />
              </div>
              <div>
                <p className="text-sm" style={{ color: C.sub }}>한 줄 안내</p>
                <input value={gift.desc} onChange={(e) => { touch(); setGift((g) => ({ ...g, desc: e.target.value })); }} placeholder="가장 필요한 소원에 대신 보내드려요" className="mt-1.5 w-full rounded-xl border px-4 py-3 text-[16px] font-bold outline-none focus:border-[#3182F6]" style={{ borderColor: C.line }} />
              </div>
              <div>
                <p className="text-sm" style={{ color: C.sub }}>목표 금액</p>
                <div className="mt-1.5 flex items-center rounded-xl border px-4 py-3" style={{ borderColor: C.line, opacity: gift.goal === null ? 0.45 : 1 }}>
                  <input disabled={gift.goal === null} value={gift.goal ? gift.goal.toLocaleString("ko-KR") : ""} onChange={(e) => { touch(); setGift((g) => ({ ...g, goal: toNum(e.target.value) })); }} inputMode="numeric" placeholder="0"
                    className="min-w-0 flex-1 bg-transparent text-right text-[18px] font-bold tabular-nums outline-none" />
                  <span className="ml-1.5 font-bold">원</span>
                </div>
              </div>
            </div>
            <label className="mt-5 flex cursor-pointer items-center gap-3 text-[15px]" style={{ color: C.ink }}>
              <input type="checkbox" checked={gift.goal === null} onChange={(e) => { touch(); setGift((g) => ({ ...g, goal: e.target.checked ? null : 0 })); }} className="h-5 w-5" />
              목표 금액 없이 받기 (게이지 대신 모인 금액만 보여줘요)
            </label>
            <div className="mt-5 flex gap-3 rounded-2xl p-5" style={{ background: C.goldBg }}>
              <Info className="mt-0.5 h-5 w-5 shrink-0" style={{ color: C.orange }} />
              <div>
                <p className="font-bold" style={{ color: "#7A4A00" }}>금액을 정하지 않는 자유 후원 칸이에요</p>
                <p className="mt-1 text-sm leading-relaxed" style={{ color: C.sub }}>성도는 정해진 금액 없이 원하는 만큼 자유롭게 보낼 수 있어요. 특정 소원을 고르기 어려운 분들을 위한 칸이며, 모인 금액은 담당 부서가 가장 필요한 소원에 나눠 사용해요.</p>
              </div>
            </div>
          </>
        )}
      </Card>

      <div className="mt-6 flex flex-wrap items-center justify-end gap-4">
        <p className="text-sm" style={{ color: C.sub }}>저장하면 성도 화면과 9:16 화면에 바로 반영돼요</p>
        <button type="button" onClick={save} disabled={saving} className="rounded-xl px-6 py-3.5 text-[16px] font-bold text-white disabled:opacity-50" style={{ background: C.blue }}>{saving ? "저장 중…" : "변경사항 저장"}</button>
      </div>
    </div>
  );
}

// 은행 고르기(2026-11-13, 머티리얼 스타일): 누르면 어두운 배경 위로 선택 창이 올라옴(휴대폰은 아래에서, PC는 가운데).
// 위쪽 검색 + 은행 버튼 3칸 격자(고른 은행은 파란 테두리·체크) + "그 외 (직접 입력)"
const BANK_TINT = ["#E8F3FF", "#E5F8EE", "#FFF4DE", "#F3E8FF", "#FFEEEE", "#E6F7F8"];
const BANK_INK = ["#3182F6", "#00A661", "#B76E00", "#7C3AED", "#F04452", "#0E9AA7"];
function BankPicker({ value, custom, onPick }: { value: string; custom: boolean; onPick: (name: string, custom: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const list = BANKS.filter((b) => b.includes(q.trim()));
  const tone = (name: string) => { const i = Math.max(0, BANKS.indexOf(name)) % BANK_TINT.length; return { bg: BANK_TINT[i], fg: BANK_INK[i] }; };
  return (
    <>
      <button type="button" onClick={() => { setQ(""); setOpen(true); }}
        className="mt-2 flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors hover:border-[#3182F6]"
        style={{ borderColor: C.line, background: "white" }}>
        {value && !custom ? (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-black" style={{ background: tone(value).bg, color: tone(value).fg }}>{value.slice(0, 1)}</span>
        ) : (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: C.bg, color: C.muted }}>₩</span>
        )}
        <span className="flex-1 text-[16px] font-bold" style={{ color: value || custom ? C.ink : C.muted }}>{custom ? "그 외 (직접 입력)" : value || "은행 선택"}</span>
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-5" role="dialog" aria-modal="true" onClick={() => setOpen(false)}>
          <style>{`
            @keyframes bpScrim{from{opacity:0}to{opacity:1}}
            @keyframes bpSheet{from{opacity:0;transform:translateY(24px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
            @keyframes bpItem{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
          `}</style>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" style={{ animation: "bpScrim .2s ease-out both" }} />
          <div className="relative w-full sm:max-w-[460px] max-h-[86vh] flex flex-col rounded-t-[28px] sm:rounded-[28px] bg-white"
            style={{ boxShadow: "0 24px 48px rgba(0,0,0,.18), 0 4px 12px rgba(0,0,0,.08)", animation: "bpSheet .32s cubic-bezier(.2,0,0,1) both" }}
            onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mt-3 h-1.5 w-10 rounded-full sm:hidden" style={{ background: C.line }} />
            <div className="flex items-center justify-between px-6 pt-5 sm:pt-6">
              <p className="text-[20px] font-bold" style={{ color: C.ink }}>은행을 골라 주세요</p>
              <button type="button" aria-label="닫기" onClick={() => setOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-[#F2F4F6]">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke={C.sub} strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="px-6 pt-4">
              <div className="flex items-center gap-2 rounded-2xl px-4 py-3" style={{ background: C.bg }}>
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="은행 이름 검색" className="w-full bg-transparent text-[15px] outline-none" style={{ color: C.ink }} />
              </div>
            </div>
            <div className="mt-4 flex-1 overflow-y-auto px-6 pb-2">
              {list.length === 0 && <p className="py-8 text-center text-sm" style={{ color: C.muted }}>찾는 은행이 없어요. 아래 "그 외 (직접 입력)"을 눌러 주세요.</p>}
              <div className="grid grid-cols-3 gap-2">
                {list.map((b, i) => {
                  const on = !custom && value === b;
                  const t = tone(b);
                  return (
                    <button key={b} type="button" onClick={() => { onPick(b, false); setOpen(false); }}
                      className="relative flex flex-col items-center gap-2 rounded-2xl border-2 px-2 py-3.5 transition-all hover:-translate-y-0.5 active:scale-95"
                      style={{ borderColor: on ? C.blue : "transparent", background: on ? C.blueBg : "#F9FAFB", animation: `bpItem .28s cubic-bezier(.2,0,0,1) ${Math.min(i, 18) * 18}ms both` }}>
                      <span className="flex h-10 w-10 items-center justify-center rounded-full text-[15px] font-black" style={{ background: t.bg, color: t.fg }}>{b.slice(0, 1)}</span>
                      <span className="text-[13px] font-bold break-keep text-center leading-tight" style={{ color: C.ink }}>{b}</span>
                      {on && (
                        <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full" style={{ background: C.blue }}>
                          <Check className="h-3 w-3 text-white" strokeWidth={3} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="px-6 pt-2 pb-6">
              <button type="button" onClick={() => { onPick(custom ? value : "", true); setOpen(false); }}
                className="w-full rounded-2xl border py-3.5 text-[15px] font-bold transition-colors hover:bg-[#F9FAFB]"
                style={{ borderColor: custom ? C.blue : C.line, color: custom ? C.blue : C.sub }}>
                그 외 (직접 입력)
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── 화면: 입금 계좌 · QR 발급 (시안 09) ─────────────────────────────
function AccountQr({ project, qrSmallRef }: { project: Project; qrSmallRef: React.RefObject<HTMLCanvasElement | null> }) {
  const [bank, setBank] = useState<Bank>(project.bank);
  const [custom, setCustom] = useState(!!project.bank.name && !BANKS.includes(project.bank.name));
  const [saving, setSaving] = useState(false);
  const bigRef = useRef<HTMLCanvasElement | null>(null);
  const url = giveUrl(project.id);
  const issued = tsDate(project.qrIssuedAt);
  const set = (k: keyof Bank) => (v: string) => setBank((b) => ({ ...b, [k]: v }));
  const save = async () => {
    if (!bank.name.trim() || !bank.account.trim() || !bank.holder.trim()) { notify({ tone: "warn", title: "계좌 정보를 모두 입력해 주세요", desc: "은행·계좌번호·예금주가 모두 필요해요." }); return; }
    setSaving(true);
    try {
      await updateDoc(doc(db, "fundraisers", project.id), {
        bank: { name: bank.name.trim(), account: bank.account.trim(), holder: bank.holder.trim(), memoGuide: bank.memoGuide.trim() || `${project.title} + 이름` },
        qrIssuedAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      notify({ tone: "success", title: "저장했어요", desc: "QR 코드가 발급됐어요. 9:16 화면과 성도 화면에 새 계좌가 바로 반영돼요." });
    } catch (e) {
      console.error(e); notify({ tone: "error", title: "저장하지 못했어요", desc: "인터넷 연결을 확인하고 다시 시도해 주세요." });
    } finally {
      setSaving(false);
    }
  };
  const field = "mt-2 w-full rounded-xl border px-4 py-3.5 text-[16px] font-bold outline-none focus:border-[#3182F6]";
  return (
    <div>
      <h1 className="text-[28px] font-black" style={{ color: C.ink }}>입금 계좌 · QR 발급</h1>
      <p className="mt-1 text-[15px]" style={{ color: C.sub }}>계좌를 저장하면 QR 코드가 바로 만들어지고, 9:16 화면에 자동으로 나와요.</p>
      <div className="mt-6 grid gap-3 md:grid-cols-3">
        {["입금 계좌 입력", "QR 코드 자동 발급", "9:16 화면에 바로 표시"].map((t, i) => (
          <Card key={t} className="flex items-center gap-4 px-6 py-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-full text-base font-black text-white" style={{ background: C.blue }}>{i + 1}</span>
            <span className="text-[16px] font-bold" style={{ color: C.ink }}>{t}</span>
          </Card>
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2 items-start">
        <Card className="p-7">
          <p className="text-lg font-black" style={{ color: C.ink }}>입금 계좌</p>
          <label className="mt-5 block text-sm" style={{ color: C.sub }}>은행</label>
          {/* 은행 선택: 기본 드롭다운 → 머티리얼 선택 창(BankPicker) */}
          <BankPicker value={bank.name} custom={custom} onPick={(name, isCustom) => { setCustom(isCustom); set("name")(name); }} />
          {custom && <input autoFocus value={bank.name} onChange={(e) => set("name")(e.target.value)} placeholder="은행 이름 (ex. 산림조합)" className={field} style={{ borderColor: C.line }} />}
          <label className="mt-5 block text-sm" style={{ color: C.sub }}>계좌번호</label>
          <input value={bank.account} onChange={(e) => set("account")(e.target.value)} placeholder="ex. 123-456-789012" inputMode="numeric" className={field} style={{ borderColor: C.line }} />
          <label className="mt-5 block text-sm" style={{ color: C.sub }}>예금주</label>
          <input value={bank.holder} onChange={(e) => set("holder")(e.target.value)} placeholder={project.churchName || "예금주"} className={field} style={{ borderColor: C.line }} />
          <label className="mt-5 block text-sm" style={{ color: C.sub }}>받는 분 통장 표시 안내</label>
          <input value={bank.memoGuide} onChange={(e) => set("memoGuide")(e.target.value)} placeholder={`${project.title} + 이름`} className={field} style={{ borderColor: C.line }} />
          <p className="mt-2 text-sm" style={{ color: C.muted }}>성도가 은행 앱에서 적을 표시 이름이에요. 재정부가 입금을 구분할 때 써요.</p>
          <p className="mt-5 rounded-2xl p-5 text-sm leading-relaxed" style={{ background: C.bg, color: C.sub }}>계좌를 바꾸면 9:16 화면과 성도 화면이 모두 새 계좌로 바뀌어요. QR은 계좌가 아니라 모금 페이지 주소를 담고 있어서, <b>이미 인쇄한 리플렛의 QR은 그대로 쓸 수 있어요.</b></p>
          <button type="button" onClick={save} disabled={saving} className="mt-6 h-14 w-full rounded-2xl text-[17px] font-bold text-white disabled:opacity-50" style={{ background: C.blue }}>{saving ? "저장 중…" : "저장하고 QR 발급하기"}</button>
        </Card>
        <Card className="p-7">
          <div className="flex items-center justify-between gap-3">
            <p className="text-lg font-black" style={{ color: C.ink }}>QR 코드</p>
            {issued && project.bank.account
              ? <span className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-bold" style={{ background: C.greenBg, color: C.green }}><Check className="h-4 w-4" /> 발급 완료 · {hm(issued)}</span>
              : <span className="rounded-full px-3 py-1.5 text-sm font-bold" style={{ background: C.bg, color: C.muted }}>계좌 저장 전</span>}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-6">
            <div className="rounded-2xl border p-4" style={{ borderColor: C.line, opacity: project.bank.account ? 1 : 0.35 }}>
              <QRCodeCanvas ref={qrSmallRef} value={url} size={200} marginSize={1} level="M" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm" style={{ color: C.sub }}>찍으면 열리는 주소</p>
              <p className="mt-2 break-all text-[15px] font-bold" style={{ color: C.ink }}>{url}</p>
              <button type="button" onClick={() => navigator.clipboard.writeText(url).then(() => notify({ tone: "success", title: "주소를 복사했어요", desc: "원하는 곳에 붙여넣기 해 주세요." }))} className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border py-3 text-[15px] font-bold" style={{ borderColor: C.line, color: C.ink }}><Copy className="h-4 w-4" /> 주소 복사</button>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button type="button" onClick={() => downloadCanvas(qrSmallRef.current, `${project.churchName}_${project.title}_QR.png`)} className="inline-flex items-center justify-center gap-1.5 rounded-xl py-3.5 text-[15px] font-bold" style={{ background: C.blueBg, color: C.blue }}><Download className="h-4 w-4" /> QR 이미지 받기 (PNG)</button>
            <button type="button" onClick={() => downloadCanvas(bigRef.current, `${project.churchName}_${project.title}_QR_인쇄용.png`)} className="inline-flex items-center justify-center gap-1.5 rounded-xl py-3.5 text-[15px] font-bold" style={{ background: C.blueBg, color: C.blue }}><Download className="h-4 w-4" /> 인쇄용 크게 받기</button>
          </div>
          {/* 인쇄용(2000px) — 화면에는 안 보임 */}
          <div className="hidden"><QRCodeCanvas ref={bigRef} value={url} size={2000} marginSize={2} level="H" /></div>
          <div className="mt-5 flex items-center gap-4 rounded-2xl p-5" style={{ background: C.bg }}>
            <Smartphone className="h-12 w-12 shrink-0" style={{ color: C.ink }} />
            <div className="min-w-0 flex-1">
              <p className="font-bold" style={{ color: C.ink }}>9:16 화면에 QR 표시</p>
              <p className="mt-1 text-sm leading-relaxed" style={{ color: C.sub }}>발급된 QR이 9:16 화면 맨 아래 칸에 바로 들어가요. 화면은 새로고침 없이 자동으로 바뀌어요.</p>
            </div>
            <Toggle on={project.displayShowQr !== false} onChange={(v) => updateDoc(doc(db, "fundraisers", project.id), { displayShowQr: v, updatedAt: serverTimestamp() })} label="9:16 화면에 QR 표시" />
          </div>
        </Card>
      </div>
    </div>
  );
}

// ── 화면: 입금 알림 내역 ─────────────────────────────
function DonationsPage({ project, wishes, donations }: { project: Project; wishes: Wish[]; donations: Donation[] }) {
  const [f, setF] = useState<"all" | DStatus>("all");
  const shown = f === "all" ? donations : donations.filter((d) => d.status === f);
  const n = (s: DStatus) => donations.filter((d) => d.status === s).length;
  return (
    <div>
      <h1 className="text-[28px] font-black" style={{ color: C.ink }}>입금 알림 내역</h1>
      <p className="mt-1 text-[15px]" style={{ color: C.sub }}>성도가 "보냈어요"를 누르면 여기에 바로 들어와요. 통장 내역과 대조 후 [확인]을 눌러 주세요.</p>
      <Card className="mt-6 p-6">
        <div className="flex flex-wrap gap-2">
          {([["all", `전체 ${donations.length}`], ["pending", `확인 대기 ${n("pending")}`], ["confirmed", `확인 완료 ${n("confirmed")}`], ["rejected", `반려 ${n("rejected")}`]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setF(k)} className="rounded-full px-4 py-2 text-sm font-bold" style={f === k ? { background: C.ink, color: "white" } : { background: C.bg, color: C.sub }}>{l}</button>
          ))}
        </div>
        <DonationTable project={project} wishes={wishes} donations={shown} />
      </Card>
    </div>
  );
}

// ── 레이아웃(왼쪽 메뉴) ─────────────────────────────
type Tab = "monitor" | "wishes" | "account" | "donations";
export function FundraisingAdmin() {
  const { projectId = "" } = useParams();
  const navigate = useNavigate();
  const { user, allowed, role, project, wishes, donations, notFound } = useProject(projectId);
  const stats = useStats(project, wishes, donations);
  const [tab, setTab] = useState<Tab>(() => {
    const h = window.location.hash.slice(1) as Tab;
    return ["monitor", "wishes", "account", "donations"].includes(h) ? h : "monitor";
  });
  const qrSmallRef = useRef<HTMLCanvasElement | null>(null);
  const go = (t: Tab) => { setTab(t); window.history.replaceState(null, "", `#${t}`); window.scrollTo({ top: 0 }); };

  if (user === undefined || allowed === null) return <div className="flex min-h-screen items-center justify-center text-sm" style={{ background: C.bg, color: C.muted }}>확인 중…</div>;
  if (!user || !allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4" style={{ background: C.bg }}>
        <Card className="max-w-md p-8 text-center">
          <p className="text-lg font-black" style={{ color: C.ink }}>{user ? "이 모금 프로젝트를 관리할 권한이 없어요" : "로그인이 필요해요"}</p>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: C.sub }}>{user ? "연결된 교회 계정이나 담당자로 등록된 이메일로 로그인해 주세요." : "교회 계정이나 담당자 이메일로 로그인한 뒤 다시 열어 주세요."}</p>
          <a href="/login" className="mt-5 inline-block rounded-xl px-5 py-2.5 text-sm font-bold text-white" style={{ background: C.blue }}>로그인하러 가기</a>
        </Card>
      </div>
    );
  }
  if (notFound) return <div className="flex min-h-screen items-center justify-center text-sm" style={{ background: C.bg, color: C.muted }}>모금 프로젝트를 찾을 수 없어요.</div>;
  if (!project) return <div className="flex min-h-screen items-center justify-center text-sm" style={{ background: C.bg, color: C.muted }}>불러오는 중…</div>;

  const nav: { key: Tab | "display"; label: string; icon: React.ReactNode; badge?: number; badgeRed?: boolean }[] = [
    { key: "monitor", label: "모니터링", icon: <LayoutGrid className="h-5 w-5" /> },
    { key: "wishes", label: "소원 · 랜덤 선물 관리", icon: <Gift className="h-5 w-5" />, badge: wishes.length },
    { key: "account", label: "입금 계좌 · QR", icon: <QrCode className="h-5 w-5" /> },
    { key: "donations", label: "입금 알림 내역", icon: <ListChecks className="h-5 w-5" />, badge: stats.pendingCount, badgeRed: true },
    { key: "display", label: "9:16 화면 열기", icon: <Smartphone className="h-5 w-5" /> },
  ];
  const statusLabel = { draft: "준비 중", open: "진행 중", closed: "종료" }[project.status];

  return (
    <div className="min-h-screen lg:flex" style={{ background: C.bg }}>
      <NoticeHost />
      <aside className="border-b bg-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-[300px] lg:shrink-0 lg:flex-col lg:border-b-0 lg:border-r" style={{ borderColor: C.line }}>
        <div className="flex items-center gap-3 px-6 pt-6 lg:pt-8">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl text-lg font-black text-white" style={{ background: C.blue }}>S</span>
          <div>
            <p className="text-lg font-black" style={{ color: C.ink }}>StayOn Admin</p>
            <p className="text-sm" style={{ color: C.sub }}>{project.title} 모금 관리자</p>
          </div>
        </div>
        <p className="mt-6 px-6 text-sm" style={{ color: C.muted }}>{project.title} · {project.churchName} <span className="ml-1 rounded-md px-1.5 py-0.5 text-xs font-bold" style={{ background: project.status === "open" ? C.greenBg : C.bg, color: project.status === "open" ? C.green : C.muted }}>{statusLabel}</span></p>
        <nav className="mt-3 flex gap-1 overflow-x-auto px-4 pb-4 lg:flex-col lg:overflow-visible lg:pb-0">
          {nav.map((n) => {
            const on = n.key === tab;
            return (
              <button key={n.key} type="button" onClick={() => (n.key === "display" ? window.open(`/give/${project.id}/display`, "_blank") : go(n.key))}
                className="flex shrink-0 items-center gap-3 rounded-2xl px-4 py-3.5 text-left text-[16px] font-bold transition-colors"
                style={on ? { background: C.blue, color: "white" } : { color: C.ink }}>
                {n.icon}
                <span className="flex-1 whitespace-nowrap">{n.label}</span>
                {!!n.badge && <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={on ? { background: "rgba(255,255,255,0.25)", color: "white" } : n.badgeRed ? { background: C.red, color: "white" } : { background: C.bg, color: C.sub }}>{n.badge}</span>}
              </button>
            );
          })}
        </nav>
        <div className="mt-auto hidden items-center gap-3 border-t px-6 py-5 lg:flex" style={{ borderColor: C.line }}>
          <span className="flex h-11 w-11 items-center justify-center rounded-full text-sm font-black" style={{ background: C.bg, color: C.ink }}>{(user.email || "AD").slice(0, 2).toUpperCase()}</span>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-bold" style={{ color: C.ink }}>{user.email}</p>
            <p className="text-sm" style={{ color: C.sub }}>{role}</p>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 lg:px-10 lg:py-10">
        {project.status !== "open" && (
          <div className="mb-5 flex items-center gap-2 rounded-2xl px-5 py-3.5 text-sm" style={{ background: C.orangeBg, color: "#7A4A00" }}>
            <Info className="h-4 w-4 shrink-0" />
            {project.status === "draft" ? "아직 준비 중이에요. 소원·계좌를 다 넣으면 스테이온에 열어 달라고 말씀해 주세요. 열리기 전에는 성도가 입금 알림을 보낼 수 없어요." : "모금이 종료됐어요. 성도는 더 이상 입금 알림을 보낼 수 없어요."}
          </div>
        )}
        {tab === "monitor" && <Monitoring project={project} wishes={wishes} donations={donations} stats={stats} onTab={go} qrSmallRef={qrSmallRef} />}
        {tab === "wishes" && <WishesEditor project={project} wishes={wishes} stats={stats} uid={user.uid} />}
        {tab === "account" && <AccountQr project={project} qrSmallRef={qrSmallRef} />}
        {tab === "donations" && <DonationsPage project={project} wishes={wishes} donations={donations} />}
        {/* 모니터링 화면의 "QR 이미지 받기"용(다른 탭에서도 내려받을 수 있게 늘 하나 그려 둠) */}
        {tab !== "account" && <div className="hidden"><QRCodeCanvas ref={qrSmallRef} value={giveUrl(project.id)} size={600} marginSize={2} level="M" /></div>}
        <button type="button" onClick={() => navigate("/admin/fundraising")} className="mt-10 text-sm font-bold" style={{ color: C.muted }}>← 모금 프로젝트 목록</button>
      </main>
    </div>
  );
}

// /admin/fundraising — 내 교회 계정에 연결된 프로젝트 목록(하나면 바로 그 관리 화면으로)
// 담당자(교회 계정이 아닌 이메일)는 담당자 문서가 비공개라 목록으로 찾을 수 없어 운영자가 준 관리 화면 주소로 들어옴
export function FundraisingList() {
  const navigate = useNavigate();
  const [state, setState] = useState<"loading" | "login" | "list">("loading");
  const [rows, setRows] = useState<{ id: string; title: string; churchName: string; status: Status }[]>([]);
  useEffect(() => onAuthStateChanged(auth, async (u) => {
    if (!u) { setState("login"); return; }
    try {
      const q = isOperatorEmail(u.email) ? collection(db, "fundraisers") : query(collection(db, "fundraisers"), where("ownerUid", "==", u.uid));
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({ id: d.id, title: d.data().title || "", churchName: d.data().churchName || "", status: (d.data().status as Status) || "draft" }));
      if (list.length === 1 && !isOperatorEmail(u.email)) { navigate(`/admin/fundraising/${list[0].id}`, { replace: true }); return; }
      setRows(list);
      setState("list");
    } catch (e) {
      console.error(e);
      setRows([]);
      setState("list");
    }
  }), [navigate]);
  if (state === "loading") return <div className="flex min-h-screen items-center justify-center text-sm" style={{ background: C.bg, color: C.muted }}>불러오는 중…</div>;
  return (
    <div className="min-h-screen px-4 py-12" style={{ background: C.bg }}>
      <div className="mx-auto max-w-xl">
        <h1 className="text-2xl font-black" style={{ color: C.ink }}>모금 프로젝트</h1>
        {state === "login" ? (
          <Card className="mt-6 p-8 text-center">
            <p className="font-bold" style={{ color: C.ink }}>로그인이 필요해요</p>
            <a href="/login" className="mt-4 inline-block rounded-xl px-5 py-2.5 text-sm font-bold text-white" style={{ background: C.blue }}>로그인하러 가기</a>
          </Card>
        ) : rows.length === 0 ? (
          <Card className="mt-6 p-8 text-center">
            <p className="font-bold" style={{ color: C.ink }}>연결된 모금 프로젝트가 없어요</p>
            <p className="mt-2 text-sm" style={{ color: C.sub }}>담당자로 등록되셨다면 스테이온에서 받은 관리 화면 주소로 들어와 주세요.</p>
          </Card>
        ) : (
          <div className="mt-6 space-y-3">
            {rows.map((r) => (
              <button key={r.id} type="button" onClick={() => navigate(`/admin/fundraising/${r.id}`)} className="block w-full rounded-2xl bg-white p-5 text-left hover:shadow-md">
                <p className="text-lg font-bold" style={{ color: C.ink }}>{r.churchName} · {r.title}</p>
                <p className="mt-1 text-sm" style={{ color: C.muted }}>{{ draft: "준비 중", open: "진행 중", closed: "종료" }[r.status]}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default FundraisingAdmin;

