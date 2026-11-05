import { Fragment, useEffect, useState } from "react";
import { collection, getDocs, query, where, doc, setDoc, Timestamp } from "firebase/firestore";
import { auth, db } from "../../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { ExternalLink, Trash2, Globe, CalendarClock, ShieldCheck } from "lucide-react";
import { deleteChurchSite, ChurchSite } from "../../../utils/churchSite";

// 교회 사이트 제작 플랫폼(주보 플랫폼과는 완전히 별개 기능) 전용 운영자 페이지.
// 발행된 교회 사이트 조회 + 바로가기 + 삭제 + 이용 기간 조정 + 네이버 소유확인 코드.
// 주보 관련 컬렉션/화면은 건드리지 않음 — churchSites 컬렉션만 다룸.
// 이용 기간은 운영자 재량 조정용으로 accessExpiresAt만 직접 바꾼다. 결제 흐름의 연장 함수
// (utils/churchSite.ts extendChurchSiteAccess, hooks/useWebsitePayment.ts)는 쓰지도 고치지도 않음.

interface SiteRow extends ChurchSite {
  ownerEmail: string;
  naverSiteVerification?: string;
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

export const AdminChurchSites = () => {
  const [rows, setRows] = useState<SiteRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ slug: string; kind: "period" | "naver" } | null>(null);
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
          usersSnap.forEach((d) => {
            const data = d.data() as { email?: string };
            emailByUid.set(d.id, data.email || d.id);
          });
          setRows(sitesSnap.docs.map((d) => {
            const site = d.data() as ChurchSite & { naverSiteVerification?: string };
            return { ...site, ownerEmail: emailByUid.get(site.ownerId) || site.ownerId };
          }));
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
  const toggle = (slug: string, kind: "period" | "naver") =>
    setEditing((cur) => (cur && cur.slug === slug && cur.kind === kind ? null : { slug, kind }));

  const expiringSoon = rows.filter((r) => { const n = daysLeft(toDate(r.accessExpiresAt)); return n !== null && n <= 7; }).length;

  const editorFor = (site: SiteRow) => {
    if (editing?.slug !== site.slug) return null;
    return editing.kind === "period"
      ? <PeriodEditor site={site} onSaved={(d) => patchRow(site.slug, { accessExpiresAt: Timestamp.fromDate(d) })} onClose={() => setEditing(null)} />
      : <VerificationEditor site={site} onSaved={(code) => patchRow(site.slug, { naverSiteVerification: code })} onClose={() => setEditing(null)} />;
  };

  const actionBtn = "inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold whitespace-nowrap transition-colors hover:brightness-95";
  const Actions = ({ site }: { site: SiteRow }) => (
    <>
      <button onClick={() => toggle(site.slug, "period")} className={actionBtn} style={{ background: C.blueBg, color: C.blue }}><CalendarClock className="w-3.5 h-3.5" /> 기간 조정</button>
      <button onClick={() => toggle(site.slug, "naver")} className={actionBtn} style={{ background: C.bg, color: C.sub }}><ShieldCheck className="w-3.5 h-3.5" /> 네이버</button>
      <a href={`https://${site.slug}.stayon-platform.com`} target="_blank" rel="noopener noreferrer" className={actionBtn} style={{ background: C.bg, color: C.sub }}>바로가기 <ExternalLink className="w-3.5 h-3.5" /></a>
      <button onClick={() => handleDelete(site.slug, site.churchName)} disabled={deletingSlug === site.slug} className={`${actionBtn} disabled:opacity-50`} style={{ background: C.redBg, color: C.red }}><Trash2 className="w-3.5 h-3.5" /> {deletingSlug === site.slug ? "삭제 중" : "삭제"}</button>
    </>
  );

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8" style={{ background: C.bg }}>
      <div className="mb-6">
        <h1 className="text-2xl sm:text-[28px] font-bold tracking-tight" style={{ color: C.ink }}>교회 홈페이지 발행 관리</h1>
        <p className="mt-2 text-sm sm:text-base" style={{ color: C.sub }}>
          발행된 교회 홈페이지 <b style={{ color: C.blue }}>{rows.length}</b>곳
          {expiringSoon > 0 && <> · 만료 임박·만료 <b style={{ color: C.red }}>{expiringSoon}</b>곳</>}
        </p>
      </div>

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
                        <p className="font-bold truncate" style={{ color: C.ink }}>{site.churchName}</p>
                        <p className="text-xs truncate" style={{ color: C.muted }}>{site.slug}.stayon-platform.com · {site.ownerEmail}</p>
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
                                <span className="block font-bold" style={{ color: C.ink }}>{site.churchName}</span>
                                <span className="block text-xs" style={{ color: C.muted }}>{site.slug}.stayon-platform.com</span>
                              </span>
                            </span>
                          </td>
                          <td className="px-5 py-4" style={{ color: C.sub }}>{site.ownerEmail}</td>
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
