import { Fragment, useEffect, useState } from "react";
import { collection, getDocs, query, where, doc, setDoc, Timestamp } from "firebase/firestore";
import { auth, db } from "../../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { ExternalLink, Trash2, Globe, CalendarClock, ShieldCheck, Pencil, Plus, Link2 } from "lucide-react";
import { deleteChurchSite, createChurchSite, ChurchSite } from "../../../utils/churchSite";
import { checkSlugFormat, isSlugTaken, confirmPermanentAddress } from "../../../utils/slugValidation";

// 교회 사이트 제작 플랫폼(주보 플랫폼과는 완전히 별개 기능) 전용 운영자 페이지.
// 발행된 교회 사이트 조회 + 바로가기 + 삭제 + 이용 기간 조정 + 네이버 소유확인 코드.
// 주보 관련 컬렉션/화면은 건드리지 않음 — churchSites 컬렉션만 다룸.
// 이용 기간은 운영자 재량 조정용으로 accessExpiresAt만 직접 바꾼다. 결제 흐름의 연장 함수
// (utils/churchSite.ts extendChurchSiteAccess, hooks/useWebsitePayment.ts)는 쓰지도 고치지도 않음.

interface SiteRow extends ChurchSite {
  ownerEmail: string;
  naverSiteVerification?: string;
  // 아직 가입 안 한 교회 사이트를 운영자가 먼저 만든 경우(2026-11-16): 운영자 계정 소유로 두고,
  // 교회가 가입하면 "교회 계정 연결"로 소유자를 그 교회로 바꿈
  pendingOwner?: boolean;
}

const toDate = (v: unknown): Date | null => {
  const t = v as { toDate?: () => Date } | null | undefined;
  if (t && typeof t.toDate === "function") return t.toDate();
  return v instanceof Date ? v : null;
};
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmt = (d: Date | null) => (d ? `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.` : "-");
const daysLeft = (d: Date | null) => {
  if (!d) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const end = new Date(d); end.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - today.getTime()) / 86400000);
};

// 메타 태그 전체를 붙여넣어도 content 값만 저장(functions/src/bulletinSeo.ts verificationCode와 같은 규칙)
const toVerificationCode = (v: string) => {
  const m = v.trim().match(/content=["']([^"']+)["']/);
  return (m ? m[1] : v).trim();
};

// 토스 스타일 공통 색
const C = { bg: "#F2F4F6", card: "#FFFFFF", ink: "#191F28", sub: "#4E5968", muted: "#8B95A1", line: "#E5E8EB", blue: "#3182F6", blueBg: "#E8F3FF", red: "#F04452", redBg: "#FFEEEE", green: "#00A661", greenBg: "#E5F8EE" };

const Badge = ({ d }: { d: Date | null }) => {
  const n = daysLeft(d);
  const pill = "rounded-md px-2 py-0.5 text-xs font-bold whitespace-nowrap";
  if (n === null) return <span className={pill} style={{ background: C.bg, color: C.muted }}>기간 없음</span>;
  if (n < 0) return <span className={pill} style={{ background: C.redBg, color: C.red }}>만료 {Math.abs(n)}일 지남</span>;
  if (n <= 7) return <span className={pill} style={{ background: C.redBg, color: C.red }}>D-{n}</span>;
  return <span className={pill} style={{ background: C.greenBg, color: C.green }}>D-{n}</span>;
};

const inputStyle = { borderColor: C.line, background: C.card, color: C.ink };

// 이용 기간 조정: 빠른 연장 버튼(남은 기간 뒤로 이어 붙임) 또는 만료일 직접 지정
const PeriodEditor = ({ site, onSaved, onClose }: { site: SiteRow; onSaved: (d: Date) => void; onClose: () => void }) => {
  const current = toDate(site.accessExpiresAt);
  const [value, setValue] = useState<string>(current ? ymd(current) : ymd(new Date()));
  const [saving, setSaving] = useState(false);

  const extend = (days: number, months: number) => {
    // 아직 기간이 남았으면 그 날짜 뒤로, 이미 지난 날짜면 오늘부터 연장
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const picked = new Date(`${value}T00:00:00`);
    const base = !Number.isNaN(picked.getTime()) && picked.getTime() > today.getTime() ? picked : today;
    const next = new Date(base);
    if (months) next.setMonth(next.getMonth() + months);
    next.setDate(next.getDate() + days);
    setValue(ymd(next));
  };

  const handleSave = async () => {
    const next = new Date(`${value}T23:59:59`);
    if (Number.isNaN(next.getTime())) { alert("날짜를 확인해 주세요."); return; }
    if (!window.confirm(`"${site.churchName}" 이용 기간을 ${fmt(next)}까지로 바꿀까요?`)) return;
    setSaving(true);
    try {
      await setDoc(doc(db, "churchSites", site.slug), { accessExpiresAt: Timestamp.fromDate(next) }, { merge: true });
      onSaved(next);
    } catch (error) {
      console.error("이용 기간 저장 오류:", error);
      alert("저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const chip = "rounded-xl px-3.5 py-2 text-sm font-bold transition-colors hover:brightness-95";
  return (
    <div className="rounded-2xl p-5" style={{ background: C.bg }}>
      <p className="text-[15px] font-bold" style={{ color: C.ink }}>이용 기간 조정</p>
      <p className="mt-1 text-xs" style={{ color: C.muted }}>지금 만료일 {fmt(current)} · 버튼을 누르면 아래 날짜가 바뀌고, 저장을 눌러야 적용돼요.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {([["+7일", 7, 0], ["+1개월", 0, 1], ["+3개월", 0, 3], ["+6개월", 0, 6], ["+1년", 0, 12]] as const).map(([label, d, m]) => (
          <button key={label} onClick={() => extend(d, m)} className={chip} style={{ background: C.card, color: C.blue }}>{label}</button>
        ))}
        <button onClick={() => setValue(ymd(new Date()))} className={chip} style={{ background: C.card, color: C.sub }}>오늘로</button>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="text-sm font-bold" style={{ color: C.sub }}>만료일</label>
        <input type="date" value={value} onChange={(e) => setValue(e.target.value)} className="rounded-xl border px-3 py-2 text-sm outline-none focus:border-[#3182F6]" style={inputStyle} />
        <span className="text-xs" style={{ color: C.muted }}>이 날 하루 끝까지 이용할 수 있어요</span>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm font-bold" style={{ color: C.sub }}>닫기</button>
        <button onClick={handleSave} disabled={saving} className="rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50" style={{ background: C.blue }}>{saving ? "저장 중..." : "저장"}</button>
      </div>
    </div>
  );
};

// 교회 홈페이지를 네이버 서치어드바이저에 교회별 사이트로 등록할 때 쓰는 소유확인 코드
const VerificationEditor = ({ site, onSaved, onClose }: { site: SiteRow; onSaved: (code: string) => void; onClose: () => void }) => {
  const [value, setValue] = useState<string>(site.naverSiteVerification || "");
  const [saving, setSaving] = useState(false);
  const handleSave = async () => {
    setSaving(true);
    try {
      const code = toVerificationCode(value);
      await setDoc(doc(db, "churchSites", site.slug), { naverSiteVerification: code }, { merge: true });
      onSaved(code);
    } catch (error) {
      console.error("네이버 소유확인 코드 저장 오류:", error);
      alert("저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="rounded-2xl p-5" style={{ background: C.bg }}>
      <p className="text-[15px] font-bold" style={{ color: C.ink }}>네이버 소유확인 코드</p>
      <p className="mt-1 text-xs" style={{ color: C.muted }}>네이버 서치어드바이저에 https://{site.slug}.stayon-platform.com 을 등록한 뒤, HTML 태그 방식의 메타 태그를 통째로 붙여 넣어 주세요.</p>
      <input value={value} onChange={(e) => setValue(e.target.value)} placeholder='<meta name="naver-site-verification" content="..." />' className="mt-3 w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:border-[#3182F6]" style={inputStyle} />
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm font-bold" style={{ color: C.sub }}>닫기</button>
        <button onClick={handleSave} disabled={saving} className="rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50" style={{ background: C.blue }}>{saving ? "저장 중..." : "저장"}</button>
      </div>
    </div>
  );
};

type UserOption = { uid: string; email: string; churchName: string };

// 교회 계정 찾기(교회 이름·이메일) — 대신 만들기와 계정 연결에서 같이 씀
const UserSearch = ({ users, onPick }: { users: UserOption[]; onPick: (u: UserOption) => void }) => {
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const matches = q ? users.filter((u) => u.churchName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)).slice(0, 8) : [];
  return (
    <>
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="교회 이름 또는 이메일로 찾기" className="mt-2 w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:border-[#3182F6]" style={inputStyle} />
      {matches.length > 0 && (
        <div className="mt-2 rounded-xl border overflow-hidden" style={{ borderColor: C.line }}>
          {matches.map((u) => (
            <button key={u.uid} onClick={() => { onPick(u); setSearch(""); }} className="block w-full text-left px-3 py-2.5 text-sm hover:bg-[#F9FAFB]" style={{ borderBottom: `1px solid ${C.line}` }}>
              <b style={{ color: C.ink }}>{u.churchName || "(교회 이름 없음)"}</b> <span style={{ color: C.muted }}>{u.email}</span>
            </button>
          ))}
        </div>
      )}
      {q && matches.length === 0 && <p className="mt-2 text-xs" style={{ color: C.muted }}>찾는 계정이 없어요.</p>}
    </>
  );
};

// 교회 계정 연결: 운영자가 먼저 만든 사이트의 소유자를 가입한 교회 계정으로 바꿈.
// 바꾸면 그 교회 편집 화면에 보이고, 그 교회 주보 내용이 홈페이지에 연결됨. 무료체험 기간은 그대로(첫 배포 기준)
const LinkOwnerEditor = ({ site, users, ownedSlugs, onSaved, onClose }: { site: SiteRow; users: UserOption[]; ownedSlugs: Map<string, string>; onSaved: (u: UserOption) => void; onClose: () => void }) => {
  const [picked, setPicked] = useState<UserOption | null>(null);
  const [saving, setSaving] = useState(false);
  const already = picked ? ownedSlugs.get(picked.uid) : undefined;
  const handleSave = async () => {
    if (!picked) return;
    if (already && !window.confirm(`이 계정은 이미 ${already}.stayon-platform.com 홈페이지를 갖고 있어요. 그래도 연결할까요?`)) return;
    if (!window.confirm(`"${site.churchName}" 홈페이지를 ${picked.churchName || picked.email} 계정에 연결할까요?`)) return;
    setSaving(true);
    try {
      await setDoc(doc(db, "churchSites", site.slug), { ownerId: picked.uid, pendingOwner: false }, { merge: true });
      onSaved(picked);
    } catch (error) {
      console.error("교회 계정 연결 오류:", error);
      alert("연결에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="rounded-2xl p-5" style={{ background: C.bg }}>
      <p className="text-[15px] font-bold" style={{ color: C.ink }}>교회 계정 연결</p>
      <p className="mt-1 text-xs" style={{ color: C.muted }}>가입한 교회 계정을 고르면 이 홈페이지가 그 교회 소유로 바뀌어요. 그 교회 편집 화면에 보이고, 주보 내용도 연결돼요.</p>
      {picked ? (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm" style={inputStyle}>
          <span><b>{picked.churchName || "(교회 이름 없음)"}</b> <span style={{ color: C.muted }}>{picked.email}</span></span>
          <button onClick={() => setPicked(null)} className="text-xs font-bold" style={{ color: C.blue }}>다시 고르기</button>
        </div>
      ) : <UserSearch users={users} onPick={setPicked} />}
      {already && <p className="mt-2 text-xs font-bold" style={{ color: C.red }}>이 계정은 이미 {already}.stayon-platform.com 홈페이지를 갖고 있어요.</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm font-bold" style={{ color: C.sub }}>닫기</button>
        <button onClick={handleSave} disabled={!picked || saving} className="rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50" style={{ background: C.blue }}>{saving ? "연결 중..." : "연결"}</button>
      </div>
    </div>
  );
};

// 교회 대신 만들기: 가입한 교회 계정을 골라 그 교회 소유(ownerId)로 사이트를 만든다.
// 소유자가 그 교회라서 ① 그 교회 주보가 홈페이지에 자동으로 들어가고 ② 그 교회 계정으로
// 로그인하면 편집 화면에 "내 프로젝트"로 보인다. 운영자는 목록의 "편집" 버튼으로 같은 사이트를 편집.
const CreateForChurch = ({ users, onCreated, onClose }: { users: UserOption[]; onCreated: (site: SiteRow) => void; onClose: () => void }) => {
  const [picked, setPicked] = useState<UserOption | null>(null);
  // 아직 가입 안 한 교회: 계정 없이 먼저 만들고(운영자 계정 소유) 나중에 "교회 계정 연결"
  const [later, setLater] = useState(false);
  const [churchName, setChurchName] = useState("");
  const [slug, setSlug] = useState("");
  const [saving, setSaving] = useState(false);

  const pick = (u: UserOption) => {
    setPicked(u);
    setChurchName(u.churchName);
  };

  const handleCreate = async () => {
    if (!picked && !later) { alert("교회 계정을 골라 주세요. 아직 가입 안 한 교회면 \"아직 가입 안 한 교회\"를 눌러 주세요."); return; }
    const operatorUid = auth.currentUser?.uid;
    if (!picked && !operatorUid) { alert("로그인 정보를 확인할 수 없어요. 다시 로그인해 주세요."); return; }
    if (!churchName.trim()) { alert("교회 이름을 입력해 주세요."); return; }
    const s = slug.trim().toLowerCase();
    const fmtCheck = checkSlugFormat(s);
    if (!fmtCheck.valid) { alert(fmtCheck.reason); return; }
    setSaving(true);
    try {
      if (await isSlugTaken(s)) { alert("이미 사용 중인 주소입니다."); return; }
      if (!confirmPermanentAddress(`${s}.stayon-platform.com`)) return;
      const ownerId = picked ? picked.uid : (operatorUid as string);
      await createChurchSite(s, churchName.trim(), ownerId);
      await setDoc(doc(db, "churchSites", s), { createdByOperator: true, pendingOwner: !picked }, { merge: true });
      onCreated({ slug: s, churchName: churchName.trim(), ownerId, published: false, ownerEmail: picked ? picked.email : "", pendingOwner: !picked });
    } catch (error) {
      console.error("교회 사이트 대신 만들기 오류:", error);
      alert(error instanceof Error ? error.message : "만들기에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl p-5 mb-6" style={{ background: C.card }}>
      <p className="text-[15px] font-bold" style={{ color: C.ink }}>교회 대신 만들기</p>
      <p className="mt-1 text-xs" style={{ color: C.muted }}>고른 교회 계정 소유로 만들어져요. 그 교회 주보가 자동으로 들어가고, 교회 계정으로 로그인하면 편집 화면에서 바로 보여요.</p>

      <label className="mt-4 block text-sm font-bold" style={{ color: C.sub }}>교회 계정</label>
      {/* 가입한 교회 / 아직 가입 안 한 교회(먼저 만들고 나중에 연결) */}
      <div className="mt-2 inline-flex rounded-xl p-1" style={{ background: C.bg }}>
        {([[false, "가입한 교회"], [true, "아직 가입 안 한 교회"]] as const).map(([v, label]) => (
          <button key={label} onClick={() => { setLater(v); if (v) setPicked(null); }} className="rounded-lg px-3 py-1.5 text-xs font-bold transition-colors"
            style={later === v ? { background: C.card, color: C.ink, boxShadow: "0 1px 2px rgba(0,0,0,.06)" } : { color: C.muted }}>{label}</button>
        ))}
      </div>
      {later ? (
        <p className="mt-2 rounded-xl px-3 py-2.5 text-xs leading-relaxed" style={{ background: C.blueBg, color: C.blue }}>
          계정 없이 먼저 만들어요(운영자 계정 소유). 교회가 가입하면 목록에서 <b>"교회 계정 연결"</b>을 눌러 연결해 주세요.
          연결 전에는 주보 내용 없이 편집 화면에 직접 입력한 내용만 나오고, 무료체험 30일은 첫 배포부터 시작돼요.
        </p>
      ) : picked ? (
        <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm" style={inputStyle}>
          <span><b>{picked.churchName || "(교회 이름 없음)"}</b> <span style={{ color: C.muted }}>{picked.email}</span></span>
          <button onClick={() => setPicked(null)} className="text-xs font-bold" style={{ color: C.blue }}>다시 고르기</button>
        </div>
      ) : (
        <UserSearch users={users} onPick={pick} />
      )}

      <label className="mt-4 block text-sm font-bold" style={{ color: C.sub }}>교회 이름</label>
      <input value={churchName} onChange={(e) => setChurchName(e.target.value)} placeholder="예: 통영베다니감리교회" className="mt-2 w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:border-[#3182F6]" style={inputStyle} />

      <label className="mt-4 block text-sm font-bold" style={{ color: C.sub }}>홈페이지 주소</label>
      <div className="mt-2 flex items-center gap-2">
        <input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder="bethany" className="w-48 rounded-xl border px-3 py-2.5 text-sm outline-none focus:border-[#3182F6]" style={inputStyle} />
        <span className="text-sm" style={{ color: C.sub }}>.stayon-platform.com</span>
      </div>
      <p className="mt-1 text-xs font-bold" style={{ color: C.red }}>주소는 한 번 정하면 바꿀 수 없어요. 교회와 먼저 확정해 주세요.</p>

      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm font-bold" style={{ color: C.sub }}>닫기</button>
        <button onClick={handleCreate} disabled={saving} className="rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50" style={{ background: C.blue }}>{saving ? "만드는 중..." : "만들고 편집하기"}</button>
      </div>
    </div>
  );
};

export const AdminChurchSites = () => {
  const [rows, setRows] = useState<SiteRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ slug: string; kind: "period" | "naver" | "link" } | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const ADMIN_EMAILS = ["akhj123akhjk@gmail.com", "stayon.platform@gmail.com"];

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user || !ADMIN_EMAILS.includes(user.email || "")) {
        alert("접근 권한이 없습니다.");
        window.location.href = "/login";
        return;
      }

      const fetchSites = async () => {
        try {
          const [usersSnap, sitesSnap] = await Promise.all([
            getDocs(collection(db, "users")),
            getDocs(query(collection(db, "churchSites"), where("published", "==", true))),
          ]);
          const emailByUid = new Map<string, string>();
          const userOptions: UserOption[] = [];
          usersSnap.forEach((d) => {
            const data = d.data() as { email?: string; churchName?: string };
            emailByUid.set(d.id, data.email || d.id);
            userOptions.push({ uid: d.id, email: data.email || "", churchName: data.churchName || "" });
          });
          setUsers(userOptions);
          const published = sitesSnap.docs.map((d) => {
            const site = d.data() as ChurchSite & { naverSiteVerification?: string };
            return { ...site, ownerEmail: emailByUid.get(site.ownerId) || site.ownerId };
          });
          // 운영자가 교회 대신 만든 사이트는 발행 전(초안)이어도 목록에 보여야 "편집"으로 들어갈 수 있음
          const draftsSnap = await getDocs(query(collection(db, "churchSites"), where("createdByOperator", "==", true)));
          const drafts = draftsSnap.docs
            .map((d) => d.data() as ChurchSite & { naverSiteVerification?: string })
            .filter((s) => !s.published)
            .map((site) => ({ ...site, ownerEmail: emailByUid.get(site.ownerId) || site.ownerId }));
          setRows([...drafts, ...published]);
        } catch (error) {
          console.error("교회 사이트 목록 조회 오류:", error);
        } finally {
          setLoading(false);
        }
      };
      fetchSites();
    });
    return () => unsubscribe();
  }, []);

  const handleDelete = async (slug: string, churchName: string) => {
    if (!window.confirm(`"${churchName}"(${slug}) 사이트를 정말 삭제하시겠습니까? 되돌릴 수 없습니다.`)) return;
    setDeletingSlug(slug);
    try {
      await deleteChurchSite(slug);
      setRows((prev) => prev.filter((r) => r.slug !== slug));
    } catch (error) {
      console.error("사이트 삭제 오류:", error);
      alert("삭제 중 오류가 발생했습니다.");
    } finally {
      setDeletingSlug(null);
    }
  };

  const patchRow = (slug: string, patch: Partial<SiteRow>) => {
    setRows((prev) => prev.map((r) => (r.slug === slug ? { ...r, ...patch } : r)));
    setEditing(null);
  };
  const toggle = (slug: string, kind: "period" | "naver" | "link") =>
    setEditing((cur) => (cur && cur.slug === slug && cur.kind === kind ? null : { slug, kind }));

  const expiringSoon = rows.filter((r) => { const n = daysLeft(toDate(r.accessExpiresAt)); return n !== null && n <= 7; }).length;

  const editorFor = (site: SiteRow) => {
    if (editing?.slug !== site.slug) return null;
    if (editing.kind === "link") {
      const ownedSlugs = new Map(rows.filter((r) => !r.pendingOwner && r.slug !== site.slug).map((r) => [r.ownerId, r.slug] as const));
      return <LinkOwnerEditor site={site} users={users} ownedSlugs={ownedSlugs} onClose={() => setEditing(null)}
        onSaved={(u) => patchRow(site.slug, { ownerId: u.uid, ownerEmail: u.email, pendingOwner: false })} />;
    }
    return editing.kind === "period"
      ? <PeriodEditor site={site} onSaved={(d) => patchRow(site.slug, { accessExpiresAt: Timestamp.fromDate(d) })} onClose={() => setEditing(null)} />
      : <VerificationEditor site={site} onSaved={(code) => patchRow(site.slug, { naverSiteVerification: code })} onClose={() => setEditing(null)} />;
  };

  // 운영자가 그 교회 사이트 편집 화면으로 바로 들어감(BuilderPage가 ?site=주소를 운영자에게만 열어 줌)
  const openBuilder = (slug: string) => { window.location.href = `/website-builder?site=${encodeURIComponent(slug)}`; };

  const actionBtn = "inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold whitespace-nowrap transition-colors hover:brightness-95";
  const Actions = ({ site }: { site: SiteRow }) => (
    <>
      <button onClick={() => openBuilder(site.slug)} className={actionBtn} style={{ background: C.blue, color: "#fff" }}><Pencil className="w-3.5 h-3.5" /> 편집</button>
      {site.pendingOwner && <button onClick={() => toggle(site.slug, "link")} className={actionBtn} style={{ background: C.greenBg, color: C.green }}><Link2 className="w-3.5 h-3.5" /> 교회 계정 연결</button>}
      <button onClick={() => toggle(site.slug, "period")} className={actionBtn} style={{ background: C.blueBg, color: C.blue }}><CalendarClock className="w-3.5 h-3.5" /> 기간 조정</button>
      <button onClick={() => toggle(site.slug, "naver")} className={actionBtn} style={{ background: C.bg, color: C.sub }}><ShieldCheck className="w-3.5 h-3.5" /> 네이버</button>
      <a href={`https://${site.slug}.stayon-platform.com`} target="_blank" rel="noopener noreferrer" className={actionBtn} style={{ background: C.bg, color: C.sub }}>바로가기 <ExternalLink className="w-3.5 h-3.5" /></a>
      <button onClick={() => handleDelete(site.slug, site.churchName)} disabled={deletingSlug === site.slug} className={`${actionBtn} disabled:opacity-50`} style={{ background: C.redBg, color: C.red }}><Trash2 className="w-3.5 h-3.5" /> {deletingSlug === site.slug ? "삭제 중" : "삭제"}</button>
    </>
  );

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8" style={{ background: C.bg }}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
        <h1 className="text-2xl sm:text-[28px] font-bold tracking-tight" style={{ color: C.ink }}>교회 홈페이지 발행 관리</h1>
        <p className="mt-2 text-sm sm:text-base" style={{ color: C.sub }}>
          발행된 교회 홈페이지 <b style={{ color: C.blue }}>{rows.filter((r) => r.published).length}</b>곳
          {rows.some((r) => !r.published) && <> · 대신 만든 초안 <b style={{ color: C.ink }}>{rows.filter((r) => !r.published).length}</b>곳</>}
          {expiringSoon > 0 && <> · 만료 임박·만료 <b style={{ color: C.red }}>{expiringSoon}</b>곳</>}
        </p>
        </div>
        {!showCreate && (
          <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold text-white" style={{ background: C.blue }}><Plus className="w-4 h-4" /> 교회 대신 만들기</button>
        )}
      </div>

      {showCreate && (
        <CreateForChurch
          users={users}
          onClose={() => setShowCreate(false)}
          onCreated={(site) => { setRows((prev) => [site, ...prev]); setShowCreate(false); openBuilder(site.slug); }}
        />
      )}

      <div className="rounded-3xl overflow-hidden" style={{ background: C.card }}>
        {loading ? (
          <div className="p-12 text-center text-sm font-bold" style={{ color: C.muted }}>목록을 불러오는 중이에요</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-sm font-bold" style={{ color: C.muted }}>발행된 사이트가 없어요</div>
        ) : (
          <>
            {/* 모바일: 카드 */}
            <div className="md:hidden">
              {rows.map((site) => {
                const exp = toDate(site.accessExpiresAt);
                return (
                  <div key={site.slug} className="p-5 space-y-3" style={{ borderBottom: `1px solid ${C.line}` }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold truncate" style={{ color: C.ink }}>{site.churchName}{!site.published && <span className="ml-2 rounded-md px-1.5 py-0.5 text-[11px]" style={{ background: C.bg, color: C.muted }}>초안</span>}</p>
                        <p className="text-xs truncate" style={{ color: C.muted }}>{site.slug}.stayon-platform.com · {site.pendingOwner ? "계정 연결 필요" : site.ownerEmail}</p>
                      </div>
                      <Badge d={exp} />
                    </div>
                    <p className="text-sm" style={{ color: C.sub }}>만료일 {fmt(exp)} · 네이버 {site.naverSiteVerification ? "등록됨" : "미설정"}</p>
                    <div className="flex flex-wrap gap-2"><Actions site={site} /></div>
                    {editorFor(site)}
                  </div>
                );
              })}
            </div>

            {/* 데스크톱: 화면 폭을 다 쓰는 표 */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="text-[13px] font-bold whitespace-nowrap" style={{ color: C.muted, borderBottom: `1px solid ${C.line}` }}>
                    <th className="px-5 py-4">교회</th>
                    <th className="px-5 py-4">계정</th>
                    <th className="px-5 py-4">최초 발행일</th>
                    <th className="px-5 py-4">이용 기간</th>
                    <th className="px-5 py-4">네이버 소유확인</th>
                    <th className="px-5 py-4 text-right">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((site) => {
                    const exp = toDate(site.accessExpiresAt);
                    return (
                      <Fragment key={site.slug}>
                        <tr className="whitespace-nowrap transition-colors hover:bg-[#F9FAFB]" style={{ borderBottom: `1px solid ${C.line}` }}>
                          <td className="px-5 py-4">
                            <span className="flex items-center gap-3">
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: C.blueBg }}><Globe className="w-4 h-4" style={{ color: C.blue }} /></span>
                              <span>
                                <span className="block font-bold" style={{ color: C.ink }}>{site.churchName}{!site.published && <span className="ml-2 rounded-md px-1.5 py-0.5 text-[11px]" style={{ background: C.bg, color: C.muted }}>초안</span>}</span>
                                <span className="block text-xs" style={{ color: C.muted }}>{site.slug}.stayon-platform.com</span>
                              </span>
                            </span>
                          </td>
                          <td className="px-5 py-4" style={{ color: C.sub }}>{site.pendingOwner ? <span className="rounded-md px-1.5 py-0.5 text-[11px] font-bold" style={{ background: C.redBg, color: C.red }}>계정 연결 필요</span> : site.ownerEmail}</td>
                          <td className="px-5 py-4 tabular-nums" style={{ color: C.sub }}>{fmt(toDate(site.firstDeployedAt))}</td>
                          <td className="px-5 py-4">
                            <span className="flex items-center gap-2">
                              <span className="tabular-nums font-semibold" style={{ color: C.ink }}>{fmt(exp)}</span>
                              <Badge d={exp} />
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <span className="text-xs font-bold" style={{ color: site.naverSiteVerification ? C.green : C.muted }}>{site.naverSiteVerification ? "등록됨" : "미설정"}</span>
                          </td>
                          <td className="px-5 py-4"><span className="flex justify-end gap-2"><Actions site={site} /></span></td>
                        </tr>
                        {editing?.slug === site.slug && (
                          <tr style={{ borderBottom: `1px solid ${C.line}` }}>
                            <td colSpan={6} className="px-5 py-4">{editorFor(site)}</td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
