import { Fragment, useEffect, useMemo, useState } from "react";
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, updateDoc, Timestamp } from "firebase/firestore";
import { db } from "../../../firebase";
import { getExpiryInfo } from "../../../utils/subscriptionTier";
import { useConfirm } from "../../components/ConfirmDialog";

// 이용 기간 늘리기(결제 서버와 같은 "한 달 = 같은 날짜", 말일은 그 달 마지막 날)
const addMonthsClamped = (d: Date, n: number) => {
  const r = new Date(d);
  const dd = r.getDate();
  r.setDate(1);
  r.setMonth(r.getMonth() + n);
  r.setDate(Math.min(dd, new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate()));
  return r;
};
const fmtDate = (d: Date) => `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;

// /super 신청 관리(2026-11-25) — 교회가 보낸 신청을 한곳에서 보고 처리 상태를 바꿈.
// 저장소: refundRequests (종류: annualRequest = 1년치 결제 신청 / jarCoupon = 주보 1년 완납 1개월 무료 쿠폰 / 그 밖 = 셀프형·관리형 환급 요청)
// 상태: requested(처리 대기) → done(처리 완료) / canceled(취소). 바꾸면 교회 화면에도 바로 반영
//   - 환급 요청 done → 교회 나무·항아리에 "환급을 마쳤어요" / canceled → 다시 요청할 수 있음
//   - 1년 결제 신청 done·canceled → 교회 화면의 "신청 완료" 표시가 사라짐
type Req = Record<string, unknown> & { id: string };
type Kind = "annual" | "jar" | "refund";
const kindOf = (r: Req): Kind => (r.kind === "annualRequest" ? "annual" : r.kind === "jarCoupon" ? "jar" : "refund");
const KIND_LABEL: Record<Kind, string> = { annual: "1년 결제", jar: "1개월 무료 쿠폰", refund: "완납 환급" };
const STATUS_LABEL: Record<string, string> = { requested: "처리 대기", done: "처리 완료", canceled: "취소" };
const STATUS_DOT: Record<string, string> = { requested: "bg-amber-500", done: "bg-emerald-500", canceled: "bg-gray-300" };
const won = (n: unknown) => `${Number(n || 0).toLocaleString()}원`;
const day = (s: unknown) => {
  const d = new Date(String(s || ""));
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("ko-KR");
};
const ms = (r: Req) => {
  const t = r.requestedAt as { toMillis?: () => number } | undefined;
  return t?.toMillis ? t.toMillis() : 0;
};

export function AdminRequests() {
  const [rows, setRows] = useState<Req[] | null>(null);
  const [statusFilter, setStatusFilter] = useState<"requested" | "all" | "done">("requested");
  const [kindFilter, setKindFilter] = useState<"all" | Kind>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const { ask, node: confirmNode } = useConfirm(); // 머티리얼 확인 창

  const load = () => {
    getDocs(collection(db, "refundRequests"))
      .then((snap) => setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => ms(b) - ms(a))))
      .catch((e) => { console.error("신청 목록 불러오기 실패:", e); setRows([]); });
  };
  useEffect(load, []);

  const shown = useMemo(() => (rows || []).filter((r) =>
    (statusFilter === "all" || String(r.status || "requested") === statusFilter) && (kindFilter === "all" || kindOf(r) === kindFilter)), [rows, statusFilter, kindFilter]);
  const waiting = (rows || []).filter((r) => String(r.status || "requested") === "requested" && !r.test).length;

  const setStatus = async (r: Req, status: "requested" | "done" | "canceled") => {
    setBusyId(r.id);
    try {
      await updateDoc(doc(db, "refundRequests", r.id), { status, processedAt: serverTimestamp() });
      setRows((prev) => (prev || []).map((x) => (x.id === r.id ? { ...x, status } : x)));
    } catch {
      alert("상태를 바꾸지 못했습니다.");
    } finally {
      setBusyId(null);
    }
  };
  // 처리 완료(2026-11-25): 상태만 바꾸지 않고, 필요한 경우 이용 기간 연장(+ 1년 결제면 정기결제 해지)까지 한 번에.
  //  - 1년 결제 신청 → 이용 기간 +12개월, 정기결제 중이면 해지할지 물음
  //  - 1개월 무료(쿠폰·1개월+커피)인데 정기결제가 없는 교회 → +1개월
  //  - 1개월 무료 + 정기결제 중 → 기간은 그대로(13번째 달 결제를 포트원에서 환불하는 방식) / 현금 환급 → 기간 그대로
  //  같은 신청으로 두 번 늘어나지 않게 extendedAt을 남김
  const complete = async (r: Req) => {
    const k = kindOf(r);
    const ownerId = String(r.ownerId || "");
    // 기간 연장은 1년 결제만(+12개월). 1개월 무료는 정기결제 중일 때 13번째 달 결제 환불로 드리고,
    // 정기결제를 해지한 교회는 혜택 대상이 아님(2026-11-25 확정) — 기간을 늘리지 않음
    const months = r.extendedAt ? 0 : k === "annual" ? 12 : 0;
    const church = String(r.churchName || "이 교회");
    const save = async (userPatch: Record<string, unknown> | null, patch: Record<string, unknown>) => {
      setBusyId(r.id);
      try {
        if (userPatch && ownerId) await updateDoc(doc(db, "users", ownerId), userPatch);
        await updateDoc(doc(db, "refundRequests", r.id), patch);
        setRows((prev) => (prev || []).map((x) => (x.id === r.id ? { ...x, ...patch, extendedAt: patch.extendedAt ? true : x.extendedAt } : x)));
      } catch (e) {
        console.error("처리 완료 오류:", e);
        alert("처리하지 못했습니다.");
      } finally {
        setBusyId(null);
      }
    };
    const base: Record<string, unknown> = { status: "done", processedAt: serverTimestamp() };
    if (months > 0 && ownerId) {
      const u = (await getDoc(doc(db, "users", ownerId))).data() || {};
      const cur = getExpiryInfo(u).date;
      const from = cur && cur.getTime() > Date.now() ? cur : new Date();
      const next = addMonthsClamped(from, months);
      const tier = k === "annual" ? ({ basic: "basic", standard: "standard", pro: "pro", lite: "allinone", max: "allinone" } as Record<string, string>)[String(r.plan || "")] : "";
      const recurringOn = k === "annual" && u.subscriptionActive === true;
      ask({
        title: k === "annual" ? "1년 결제를 처리할까요?" : "1개월 무료를 처리할까요?",
        desc: k === "annual" ? "입금을 확인하셨다면 이용 기간을 늘리고 처리 완료로 바꿔요." : "이용 기간을 한 달 늘리고 처리 완료로 바꿔요.",
        rows: [
          { label: "교회", value: church },
          ...(k === "annual" ? [{ label: "요금제", value: `${String(r.planLabel || "")} · ${won(r.amount)}` }] : []),
          { label: "이용 기간", value: <>{cur ? fmtDate(cur) : "없음"} → <span className="text-blue-600">{fmtDate(next)}</span> <span className="font-medium text-slate-400">(+{months}개월)</span></> },
          ...(tier ? [{ label: "이용 등급", value: String(r.planLabel || "") }] : []),
        ],
        check: recurringOn ? { label: <>지금 정기결제를 쓰고 있어요. <b>정기결제도 해지</b>해서 두 번 결제되지 않게 할게요. (다음 결제일부터 청구 안 됨)</>, defaultChecked: true } : undefined,
        confirmLabel: "처리 완료",
        onConfirm: async (cancelRecurring) => {
          const userPatch: Record<string, unknown> = { lastPaymentDate: Timestamp.fromDate(next) };
          if (tier) { userPatch.status = tier; userPatch.isPaidUser = true; userPatch.currentPlan = `${String(r.planLabel || "")} 1년 결제`; }
          const patch: Record<string, unknown> = { ...base, extendedMonths: months, extendedTo: fmtDate(next), extendedAt: serverTimestamp() };
          if (recurringOn && cancelRecurring) { userPatch.subscriptionActive = false; patch.recurringCanceled = true; }
          await save(userPatch, patch);
        },
      });
      return;
    }
    ask({
      title: "처리 완료로 바꿀까요?",
      desc: `${church} 신청을 처리 완료로 표시해요.`,
      rows: [{ label: "혜택", value: summary(r) }],
      note: k !== "annual" && r.choice === "extend" && !r.recurringActive ? "정기결제를 해지한 교회라 1년 완납 혜택 대상이 아니에요. 처리 완료 대신 취소로 바꾸시는 걸 권해요."
        : k !== "annual" && r.choice === "extend" && r.recurringActive ? "13번째 달 결제는 포트원에서 직접 환불(취소)해 주세요. 이용 기간은 그대로 둬요."
        : k !== "annual" && r.choice !== "extend" ? `현금 ${won(r.refund)} 환급(결제 일부 취소 또는 계좌 입금)은 직접 해 주세요. 이용 기간은 그대로 둬요.` : undefined,
      confirmLabel: "처리 완료",
      onConfirm: async () => { await save(null, base); },
    });
  };
  const remove = (r: Req) => {
    ask({
      title: "신청을 지울까요?",
      desc: "지우면 되돌릴 수 없어요.",
      rows: [{ label: "교회", value: String(r.churchName || "-") }, { label: "내용", value: summary(r) }],
      confirmLabel: "지우기",
      danger: true,
      onConfirm: async () => {
        setBusyId(r.id);
        try {
          await deleteDoc(doc(db, "refundRequests", r.id));
          setRows((prev) => (prev || []).filter((x) => x.id !== r.id));
        } catch {
          alert("지우지 못했습니다.");
        } finally {
          setBusyId(null);
        }
      },
    });
  };

  const st = (r: Req) => String(r.status || "requested");
  // 한 줄 요약(표의 "내용" 칸)
  const summary = (r: Req) => {
    const k = kindOf(r);
    if (k === "annual") return `${String(r.planLabel || "-")} · ${won(r.amount)}`;
    const plan = String(r.planName || "-").replace(/ ?(주보·홈페이지|주보)? ?정기결제 플랜.*$/, "");
    return `${plan} · ${r.choice === "extend" ? (k === "jar" ? "1개월 무료" : "1개월 + 커피 쿠폰") : `현금 ${won(r.refund)}`}`;
  };
  // 할 일(펼친 줄)
  const todo = (r: Req) => {
    const k = kindOf(r);
    if (k === "annual") return `입금 안내 → 입금 확인 → 상태를 "처리 완료"로 바꾸면 이용 기간 +12개월${r.recurringActive ? " · 정기결제 해지" : ""}까지 한 번에 처리돼요`;
    if (r.choice === "extend") return r.recurringActive
      ? `${day(r.nextBillingAt)} 결제가 나가면 포트원에서 취소(환불)${k === "refund" ? " · 커피 쿠폰 발송" : ""} → 처리 완료`
      : "정기결제를 해지한 교회라 혜택 대상이 아니에요 → 취소로 바꿔 주세요";
    return `포트원 결제 일부 취소 또는 계좌 입금으로 ${won(r.refund)} 환급 → 처리 완료`;
  };
  const [openId, setOpenId] = useState<string | null>(null);
  const tab = (on: boolean) => `px-3 py-1.5 text-[13px] font-semibold rounded-md transition-colors ${on ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"}`;
  const statusSelect = (r: Req) => (
    <select value={st(r)} disabled={busyId === r.id} onChange={(e) => { const v = e.target.value as "requested" | "done" | "canceled"; if (v === "done") void complete(r); else void setStatus(r, v); }}
      className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[13px] font-medium text-gray-700 focus:outline-none focus:border-blue-400 disabled:opacity-50">
      <option value="requested">처리 대기</option>
      <option value="done">처리 완료</option>
      <option value="canceled">취소</option>
    </select>
  );
  const statusText = (r: Req) => (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-gray-700">
      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[st(r)] || STATUS_DOT.requested}`} />{STATUS_LABEL[st(r)] || "처리 대기"}
    </span>
  );
  const detail = (r: Req) => (
    <div className="grid gap-x-8 gap-y-1.5 text-[13px] text-gray-600 sm:grid-cols-2">
      {kindOf(r) === "annual" ? (
        <>
          <p><span className="text-gray-400">요금제</span> {String(r.planLabel || "-")} (월 {won(r.monthly)})</p>
          <p><span className="text-gray-400">1년 금액</span> {won(r.amount)} <span className="text-gray-400 line-through">{won(r.fullAmount)}</span></p>
          <p><span className="text-gray-400">결제 방법</span> {String(r.method || "계좌이체")}</p>
          <p><span className="text-gray-400">지금 정기결제</span> {r.recurringActive ? "사용 중" : "없음"}</p>
          {!!r.memo && <p className="sm:col-span-2"><span className="text-gray-400">요청 사항</span> {String(r.memo)}</p>}
        </>
      ) : (
        <>
          <p><span className="text-gray-400">고른 혜택</span> {String(r.choiceLabel || "-")}</p>
          <p><span className="text-gray-400">다음 결제 예정</span> {r.recurringActive ? day(r.nextBillingAt) : "정기결제 없음"}</p>
          <p><span className="text-gray-400">정기결제 시작</span> {day(r.cycleStartedAt) || "-"}</p>
          <p><span className="text-gray-400">결제 횟수</span> {Array.isArray(r.payments) ? `${(r.payments as unknown[]).length}번` : "-"}</p>
        </>
      )}
      {r.extendedMonths ? (
        <p className="sm:col-span-2 mt-1"><span className="text-gray-400">처리한 내용</span> 이용 기간 +{String(r.extendedMonths)}개월{r.extendedTo ? ` (${String(r.extendedTo)}까지)` : ""}{r.recurringCanceled ? " · 정기결제 해지" : ""}</p>
      ) : (
        <p className="sm:col-span-2 mt-1"><span className="text-gray-400">할 일</span> {todo(r)}</p>
      )}
      <div className="sm:col-span-2 mt-1 flex justify-end">
        <button type="button" disabled={busyId === r.id} onClick={() => remove(r)} className="text-[12px] font-medium text-gray-400 hover:text-red-500 disabled:opacity-50">신청 지우기</button>
      </div>
    </div>
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {confirmNode}
      <div className="mb-5">
        <h1 className="text-xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">신청 관리</h1>
        <p className="text-gray-500 mt-1.5 md:mt-2 text-xs sm:text-base font-medium">
          1년 결제 신청 · 1년 완납 환급 · 1개월 무료 쿠폰 (처리 대기 <span className="text-amber-600 font-bold">{waiting}</span>건)
        </p>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg bg-gray-100 p-1">
          {([["requested", "처리 대기"], ["done", "처리 완료"], ["all", "전체"]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setStatusFilter(k)} className={tab(statusFilter === k)}>{l}</button>
          ))}
        </div>
        <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value as "all" | Kind)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-[13px] font-medium text-gray-700 focus:outline-none focus:border-blue-400">
          <option value="all">모든 종류</option>
          <option value="annual">1년 결제</option>
          <option value="refund">완납 환급</option>
          <option value="jar">1개월 무료 쿠폰</option>
        </select>
        <button type="button" onClick={() => { setRows(null); load(); }} className="ml-auto rounded-lg border border-gray-200 bg-white px-3 py-2 text-[13px] font-medium text-gray-600 hover:bg-gray-50">새로고침</button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {rows === null ? (
          <div className="p-10 md:p-12 text-center text-gray-400 font-bold text-sm">신청 목록을 불러오는 중입니다...</div>
        ) : shown.length === 0 ? (
          <div className="p-10 md:p-12 text-center text-gray-400 font-bold text-sm">해당하는 신청이 없습니다.</div>
        ) : (
          <>
            {/* 모바일: 줄 목록 */}
            <div className="md:hidden divide-y divide-gray-100">
              {shown.map((r) => (
                <div key={r.id} className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] text-gray-400">{KIND_LABEL[kindOf(r)]}{r.test ? " · 테스트" : ""}</span>
                    {statusText(r)}
                  </div>
                  <button type="button" onClick={() => setOpenId(openId === r.id ? null : r.id)} className="mt-1 block w-full text-left">
                    <p className="text-[15px] font-bold text-gray-900">{String(r.churchName || "이름 없는 교회")}</p>
                    <p className="mt-0.5 text-[13px] text-gray-600">{summary(r)}</p>
                    {kindOf(r) === "annual" && <p className="mt-0.5 text-[12.5px] text-gray-500">{String(r.contactName || "")} {String(r.contactPhone || "")}</p>}
                    <p className="mt-0.5 text-[11.5px] text-gray-400">{String(r.requestedAtText || "")}</p>
                  </button>
                  <div className="mt-2">{statusSelect(r)}</div>
                  {openId === r.id && <div className="mt-3 rounded-lg bg-gray-50 p-3">{detail(r)}</div>}
                </div>
              ))}
            </div>

            {/* 데스크톱: 표 */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr className="text-xs font-bold text-gray-500 whitespace-nowrap">
                    <th className="px-4 py-3">신청일</th>
                    <th className="px-4 py-3">종류</th>
                    <th className="px-4 py-3">교회</th>
                    <th className="px-4 py-3">내용</th>
                    <th className="px-4 py-3">담당자</th>
                    <th className="px-4 py-3">상태</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {shown.map((r) => (
                    <Fragment key={r.id}>
                      <tr className="hover:bg-gray-50/70 transition-colors">
                        <td className="px-4 py-3 text-gray-500 tabular-nums whitespace-nowrap">{day(r.requestedAt && (r.requestedAt as { toDate?: () => Date }).toDate ? (r.requestedAt as { toDate: () => Date }).toDate().toISOString() : "") || String(r.requestedAtText || "").split(" 오")[0]}</td>
                        <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{KIND_LABEL[kindOf(r)]}{r.test ? <span className="ml-1.5 text-[11px] text-gray-400">테스트</span> : null}</td>
                        <td className="px-4 py-3 font-semibold text-gray-900">{String(r.churchName || "-")}</td>
                        <td className="px-4 py-3 text-gray-700">{summary(r)}</td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          {kindOf(r) === "annual" ? <>{String(r.contactName || "-")}<br /><a href={`tel:${String(r.contactPhone || "")}`} className="text-[12.5px] text-blue-600 hover:underline">{String(r.contactPhone || "")}</a></> : <span className="text-gray-300">-</span>}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">{statusSelect(r)}</td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button type="button" onClick={() => setOpenId(openId === r.id ? null : r.id)} className="text-[13px] font-medium text-gray-500 hover:text-gray-900">{openId === r.id ? "접기" : "자세히"}</button>
                        </td>
                      </tr>
                      {openId === r.id && (
                        <tr className="bg-gray-50/60">
                          <td colSpan={7} className="px-4 pb-4 pt-2">{detail(r)}</td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
