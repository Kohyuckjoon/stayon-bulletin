import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where, type Timestamp } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../../../firebase";
import { isOperatorEmail } from "../../../utils/operator";
import { RefreshCcw, Receipt, Wallet, ExternalLink } from "lucide-react";

// /super > 결제·정산(2026-11-20) — 보기 전용. 결제 코드는 건드리지 않음.
//  ① 정기결제 중: users 문서(subscriptionActive)  ② 결제 내역 · ③ 월별 정산: 포트원에 남은 실제 결제 기록(서버 함수 superPayments가 읽어 옴)
const PAYMENTS_URL = "https://asia-northeast3-stayonsbplatform.cloudfunctions.net/superPayments";

interface Pay {
  id: string; status: "PAID" | "PARTIAL_CANCELLED" | "CANCELLED" | string; orderName: string;
  paidAt: string; cancelledAt: string; total: number; paid: number; cancelled: number;
  customerName: string; customerEmail: string; recurring: boolean; uid: string; method: string; receiptUrl: string;
}
interface Sub {
  uid: string; churchName: string; email: string; planName: string; amount: number;
  startedAt: Date | null; nextAt: Date | null; failCount: number; refund: number;
}

const won = (n: number) => `${n.toLocaleString()}원`;
const ymd = (d: Date | null) => (d ? d.toLocaleDateString("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit" }) : "—");
const toDate = (v: unknown) => ((v as Timestamp)?.toDate ? (v as Timestamp).toDate() : v instanceof Date ? v : null);
const STATUS: Record<string, [string, string]> = {
  PAID: ["결제 완료", "bg-blue-50 text-blue-600"],
  PARTIAL_CANCELLED: ["부분 취소", "bg-amber-50 text-amber-600"],
  CANCELLED: ["취소", "bg-gray-100 text-gray-500"],
};
const RANGES = [
  { key: "month", label: "이번 달" },
  { key: "last", label: "지난 달" },
  { key: "3m", label: "최근 3개월" },
  { key: "year", label: "올해" },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];
const rangeOf = (k: RangeKey) => {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  if (k === "month") return [new Date(y, m, 1), now];
  if (k === "last") return [new Date(y, m - 1, 1), new Date(y, m, 1)];
  if (k === "3m") return [new Date(y, m - 2, 1), now];
  return [new Date(y, 0, 1), now];
};

export const AdminPayments = () => {
  const [tab, setTab] = useState<"subs" | "list" | "settle">("subs");
  const [range, setRange] = useState<RangeKey>("month");
  const [subs, setSubs] = useState<Sub[] | null>(null);
  const [pays, setPays] = useState<Pay[] | null>(null);
  const [allRecurring, setAllRecurring] = useState<Pay[]>([]); // 정기결제 횟수 세기용(올해 전체)
  const [err, setErr] = useState("");
  const [churchByEmail, setChurchByEmail] = useState<Record<string, string>>({});
  const [churchByUid, setChurchByUid] = useState<Record<string, string>>({});

  useEffect(() => onAuthStateChanged(auth, (u) => {
    if (!u || !isOperatorEmail(u.email)) { alert("접근 권한이 없습니다."); window.location.href = "/login"; }
  }), []);

  // ① 정기결제 중인 교회
  useEffect(() => {
    getDocs(query(collection(db, "users"), where("subscriptionActive", "==", true))).then((snap) => {
      setSubs(snap.docs.map((d) => {
        const v = d.data();
        return {
          uid: d.id, churchName: v.churchName || "(교회 이름 없음)", email: v.email || "",
          planName: v.billingPlanName || v.currentPlan || "", amount: v.billingAmount || 0,
          startedAt: toDate(v.billingStartedAt) ?? toDate(v.billingKeyRegisteredAt),
          nextAt: toDate(v.nextBillingDate), failCount: v.billingFailCount || 0, refund: v.billingRefundAmount || 0,
        };
      }).sort((a, b) => (a.nextAt?.getTime() ?? 0) - (b.nextAt?.getTime() ?? 0)));
    }).catch(() => setSubs([]));
  }, []);

  // 결제 기록의 교회 이름을 찾기 위한 교회 목록(이메일·uid → 교회 이름)
  useEffect(() => {
    getDocs(collection(db, "users")).then((snap) => {
      const e: Record<string, string> = {}, u: Record<string, string> = {};
      snap.docs.forEach((d) => { const v = d.data(); if (v.churchName) { u[d.id] = v.churchName; if (v.email) e[String(v.email).toLowerCase()] = v.churchName; } });
      setChurchByEmail(e); setChurchByUid(u);
    }).catch(() => {});
  }, []);

  const fetchPays = async (from: Date, until: Date) => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error("로그인이 필요해요");
    const r = await fetch(`${PAYMENTS_URL}?from=${encodeURIComponent(from.toISOString())}&until=${encodeURIComponent(until.toISOString())}`, { headers: { Authorization: `Bearer ${token}` } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return (j.items ?? []) as Pay[];
  };

  // ②③ 기간별 결제 기록
  useEffect(() => {
    let alive = true;
    setPays(null); setErr("");
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) return;
      const [from, until] = rangeOf(range);
      try { const items = await fetchPays(from, until); if (alive) setPays(items); }
      catch (e) { if (alive) { setErr(String((e as Error).message)); setPays([]); } }
    });
    return () => { alive = false; unsub(); };
  }, [range]);

  // 정기결제 횟수(올해 1월부터 — 12개월 환급 진행 확인용)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) return;
      const y = new Date().getFullYear();
      try { setAllRecurring((await fetchPays(new Date(y - 1, 0, 1), new Date())).filter((p) => p.recurring && p.status !== "CANCELLED")); } catch { /* 결제 내역 탭에서 오류 표시 */ }
    });
    return () => unsub();
  }, []);

  const churchOf = (p: Pay) => churchByUid[p.uid] || churchByEmail[p.customerEmail.toLowerCase()] || p.customerName || p.customerEmail || "—";
  const paidCount = (uid: string, since: Date | null) => allRecurring.filter((p) => p.uid === uid && (!since || new Date(p.paidAt) >= new Date(since.getTime() - 86400000))).length;

  // ③ 월별 정산
  const months = useMemo(() => {
    const m = new Map<string, { count: number; total: number; cancelled: number; recurring: number; once: number }>();
    (pays ?? []).forEach((p) => {
      const d = new Date(p.paidAt);
      const k = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}`;
      const row = m.get(k) ?? { count: 0, total: 0, cancelled: 0, recurring: 0, once: 0 };
      row.count++; row.total += p.total; row.cancelled += p.cancelled;
      if (p.recurring) row.recurring += p.total - p.cancelled; else row.once += p.total - p.cancelled;
      m.set(k, row);
    });
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [pays]);
  const sum = months.reduce((a, [, r]) => ({ total: a.total + r.total, cancelled: a.cancelled + r.cancelled, count: a.count + r.count }), { total: 0, cancelled: 0, count: 0 });

  const card = "bg-white rounded-2xl md:rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100";
  const th = "px-4 py-3 text-left text-[12px] font-bold text-gray-400 whitespace-nowrap";
  const td = "px-4 py-3 text-[13px] text-gray-700 whitespace-nowrap";

  const RangeTabs = () => (
    <div className="flex flex-wrap gap-1.5 mb-4">
      {RANGES.map((r) => (
        <button key={r.key} type="button" onClick={() => setRange(r.key)}
          className={`h-9 rounded-full px-4 text-[13px] font-bold ${range === r.key ? "bg-gray-900 text-white" : "bg-white border border-gray-200 text-gray-600"}`}>{r.label}</button>
      ))}
    </div>
  );
  const Loading = () => <div className={`${card} p-12 text-center text-sm text-gray-400`}>불러오는 중입니다...</div>;
  const ErrBox = () => err ? <div className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-600">결제 기록을 불러오지 못했어요: {err}</div> : null;

  return (
    <div className="p-4 sm:p-8 md:p-12">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">결제 · 정산</h1>
          <p className="text-gray-500 mt-1.5 text-xs sm:text-base font-medium">정기결제 중인 교회, 결제 내역, 월별 정산을 한 곳에서 봐요. 결제 내역은 포트원에 남은 실제 기록이에요.</p>
        </div>

        <div className="mb-5 inline-grid grid-cols-3 gap-1 rounded-2xl bg-white border border-gray-200 p-1">
          {([["subs", "정기결제 중", RefreshCcw], ["list", "결제 내역", Receipt], ["settle", "월별 정산", Wallet]] as const).map(([k, label, Icon]) => (
            <button key={k} type="button" onClick={() => setTab(k)}
              className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3 sm:px-5 py-2 text-[13px] font-bold ${tab === k ? "bg-blue-600 text-white" : "text-gray-500 hover:text-gray-800"}`}>
              <Icon className="w-4 h-4" />{label}
            </button>
          ))}
        </div>

        {/* ① 정기결제 중 */}
        {tab === "subs" && (subs === null ? <Loading /> : (
          <div className={`${card} overflow-x-auto`}>
            <div className="px-4 pt-4 pb-2 text-sm font-bold text-gray-900">정기결제 중 <span className="text-blue-600">{subs.length}</span>곳 · 매월 {won(subs.reduce((a, s) => a + s.amount, 0))}</div>
            <table className="w-full min-w-[860px]">
              <thead><tr className="border-b border-gray-100"><th className={th}>교회</th><th className={th}>요금제</th><th className={th}>월 금액</th><th className={th}>시작일</th><th className={th}>다음 결제일</th><th className={th}>결제 횟수 (12개월 환급)</th><th className={th}>상태</th></tr></thead>
              <tbody>
                {subs.map((s) => {
                  const n = paidCount(s.uid, s.startedAt);
                  return (
                    <tr key={s.uid} className="border-b border-gray-50 last:border-0">
                      <td className={td}><p className="font-bold text-gray-900">{s.churchName}</p><p className="text-[11px] text-gray-400">{s.email}</p></td>
                      <td className={td}>{s.planName || "—"}</td>
                      <td className={`${td} font-bold`}>{won(s.amount)}</td>
                      <td className={td}>{ymd(s.startedAt)}</td>
                      <td className={td}>{ymd(s.nextAt)}</td>
                      <td className={td}>
                        {s.refund > 0 ? (
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, (n / 12) * 100)}%` }} /></div>
                            <span className={n >= 12 ? "font-bold text-emerald-600" : ""}>{n}/12{n >= 12 ? ` · ${won(s.refund)} 환급 대상` : ""}</span>
                          </div>
                        ) : <span>{n}회</span>}
                      </td>
                      <td className={td}>{s.failCount > 0 ? <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-500">결제 실패 {s.failCount}회</span> : <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-600">정상</span>}</td>
                    </tr>
                  );
                })}
                {!subs.length && <tr><td colSpan={7} className="py-10 text-center text-sm text-gray-400">정기결제 중인 교회가 없어요</td></tr>}
              </tbody>
            </table>
          </div>
        ))}

        {/* ② 결제 내역 */}
        {tab === "list" && (
          <>
            <RangeTabs /><ErrBox />
            {pays === null ? <Loading /> : (
              <div className={`${card} overflow-x-auto`}>
                <div className="px-4 pt-4 pb-2 text-sm font-bold text-gray-900">{pays.length}건 · 결제 {won(sum.total)}{sum.cancelled > 0 && <span className="text-gray-400"> · 취소 {won(sum.cancelled)}</span>}</div>
                <table className="w-full min-w-[900px]">
                  <thead><tr className="border-b border-gray-100"><th className={th}>결제일</th><th className={th}>교회</th><th className={th}>상품</th><th className={th}>구분</th><th className={th}>금액</th><th className={th}>상태</th><th className={th}>영수증</th></tr></thead>
                  <tbody>
                    {pays.map((p) => {
                      const [label, cls] = STATUS[p.status] ?? [p.status, "bg-gray-100 text-gray-500"];
                      return (
                        <tr key={p.id} className="border-b border-gray-50 last:border-0">
                          <td className={td}>{new Date(p.paidAt).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                          <td className={td}><p className="font-bold text-gray-900">{churchOf(p)}</p><p className="text-[11px] text-gray-400">{p.customerEmail}</p></td>
                          <td className={td}>{p.orderName}</td>
                          <td className={td}>{p.recurring ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-600">정기</span> : <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-bold text-gray-500">1회</span>}</td>
                          <td className={`${td} font-bold`}>{won(p.total)}{p.cancelled > 0 && <span className="ml-1 text-[11px] font-semibold text-gray-400">(취소 {won(p.cancelled)})</span>}</td>
                          <td className={td}><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${cls}`}>{label}</span></td>
                          <td className={td}>{p.receiptUrl ? <a href={p.receiptUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline">보기 <ExternalLink className="w-3 h-3" /></a> : "—"}</td>
                        </tr>
                      );
                    })}
                    {!pays.length && <tr><td colSpan={7} className="py-10 text-center text-sm text-gray-400">이 기간 결제 내역이 없어요</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ③ 월별 정산 */}
        {tab === "settle" && (
          <>
            <RangeTabs /><ErrBox />
            {pays === null ? <Loading /> : (
              <>
                <div className="mb-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {[["결제 금액", won(sum.total)], ["취소 금액", won(sum.cancelled)], ["실제 매출 (결제 − 취소)", won(sum.total - sum.cancelled)], ["결제 건수", `${sum.count}건`]].map(([k, v]) => (
                    <div key={k} className={`${card} p-4`}><p className="text-[12px] font-bold text-gray-400">{k}</p><p className="mt-1 text-lg sm:text-xl font-extrabold text-gray-900">{v}</p></div>
                  ))}
                </div>
                <div className={`${card} overflow-x-auto`}>
                  <table className="w-full min-w-[640px]">
                    <thead><tr className="border-b border-gray-100"><th className={th}>월</th><th className={th}>건수</th><th className={th}>결제 금액</th><th className={th}>취소</th><th className={th}>실제 매출</th><th className={th}>정기결제</th><th className={th}>1회 결제</th></tr></thead>
                    <tbody>
                      {months.map(([k, r]) => (
                        <tr key={k} className="border-b border-gray-50 last:border-0">
                          <td className={`${td} font-bold text-gray-900`}>{k}</td><td className={td}>{r.count}건</td><td className={td}>{won(r.total)}</td>
                          <td className={td}>{r.cancelled ? won(r.cancelled) : "—"}</td><td className={`${td} font-bold text-blue-600`}>{won(r.total - r.cancelled)}</td>
                          <td className={td}>{won(r.recurring)}</td><td className={td}>{won(r.once)}</td>
                        </tr>
                      ))}
                      {!months.length && <tr><td colSpan={7} className="py-10 text-center text-sm text-gray-400">이 기간 결제 내역이 없어요</td></tr>}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-[12px] text-gray-400">카드 수수료·정산 입금일은 KCP 관리자 화면 기준이에요. 여기 금액은 결제·취소 금액 합계예요.</p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};
