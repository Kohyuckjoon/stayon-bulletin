import { useEffect, useState } from "react";
import { collection, addDoc, getDocs, query, where, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import { auth, db } from "../../firebase";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";

// 1년치 한 번에 결제 신청(2026-11-25) — 주보 관리자 결제 관리(항아리 위) · 홈페이지 편집 요금제(나무 위)에 같이 씀.
// 카드로 1년치를 한 번에 결제하는 건 카드사 정책상 막혀 있어서 "신청"만 받음 → 운영자가 입금 안내 → 입금 확인 → 이용 기간 12개월 연장.
// 금액 = 11개월 값(1개월 무료). 결제 방법 = 계좌이체. 환불: 7일 이내 100% · 14일 이내 50% · 15일부터 불가.
// 신청은 refundRequests/{자동 id}(kind: "annualRequest")에 저장 → 서버 onRefundRequest가 운영자 메일로 알림
export type AnnualPlanKey = "basic" | "standard" | "pro" | "lite" | "max";
export const ANNUAL_PLANS: { key: AnnualPlanKey; label: string; monthly: number; scope: string }[] = [
  { key: "basic", label: "베이직", monthly: 990, scope: "온라인 주보" },
  { key: "standard", label: "스탠다드", monthly: 2900, scope: "온라인 주보" },
  { key: "pro", label: "프로 · 셀프형", monthly: 9900, scope: "주보 + 교회 홈페이지(직접 관리)" },
  { key: "lite", label: "관리형 라이트", monthly: 14900, scope: "주보 + 홈페이지 · 월 2회 대신 업데이트" },
  { key: "max", label: "관리형 맥스", monthly: 19900, scope: "주보 + 홈페이지 · 매주 대신 업데이트" },
];
const won = (n: number) => `${n.toLocaleString()}원`;

export function AnnualRequestButton({ ownerId, churchName, plans, currentAmount = 0, recurringActive = false, readOnly = false }: {
  ownerId: string | null; churchName: string; plans: AnnualPlanKey[]; currentAmount?: number; recurringActive?: boolean; readOnly?: boolean;
}) {
  const list = ANNUAL_PLANS.filter((p) => plans.includes(p.key));
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<AnnualPlanKey>(list.find((p) => p.monthly === currentAmount)?.key || list[0]?.key || "basic");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [memo, setMemo] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ label: string; at: string } | null>(null);

  // 처리 중인 신청이 있으면 버튼 대신 "신청 완료" 표시
  useEffect(() => {
    if (!ownerId) return;
    let alive = true;
    getDocs(query(collection(db, "refundRequests"), where("ownerId", "==", ownerId), where("kind", "==", "annualRequest")))
      .then((snap) => {
        if (!alive) return;
        const open = snap.docs.map((d) => d.data()).filter((x) => x.status === "requested" && !x.test)
          .sort((a, b) => String(b.requestedAtText || "").localeCompare(String(a.requestedAtText || "")))[0];
        setPending(open ? { label: String(open.planLabel || ""), at: String(open.requestedAtText || "") } : null);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [ownerId]);

  const sel = list.find((p) => p.key === pick) || list[0];
  if (!sel) return null;
  const full = sel.monthly * 12;
  const yearly = sel.monthly * 11;
  const phoneFmt = (v: string) => {
    const d = v.replace(/\D/g, "").slice(0, 11);
    return d.length < 4 ? d : d.length < 8 ? `${d.slice(0, 3)}-${d.slice(3)}` : `${d.slice(0, 3)}-${d.slice(3, d.length - 4)}-${d.slice(-4)}`;
  };

  const submit = async () => {
    if (!ownerId) return;
    if (!name.trim() || phone.replace(/\D/g, "").length < 9) { toast.error("담당자 이름과 연락처를 적어 주세요."); return; }
    if (!agree) { toast.error("환불 규정을 확인하고 체크해 주세요."); return; }
    setBusy(true);
    const at = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
    try {
      await addDoc(collection(db, "refundRequests"), {
        kind: "annualRequest", ownerId, churchName, requestedBy: auth.currentUser?.uid || "",
        plan: sel.key, planLabel: sel.label, monthly: sel.monthly, fullAmount: full, amount: yearly, refund: 0,
        method: "계좌이체", contactName: name.trim(), contactPhone: phone.trim(), memo: memo.trim(),
        recurringActive, refundPolicyAgreed: true,
        status: "requested", requestedAt: serverTimestamp(), requestedAtText: at,
      });
      setPending({ label: sel.label, at });
      setOpen(false);
      toast.success("1년 결제 신청을 보냈어요. 스테이온이 입금 안내를 드릴게요.");
    } catch {
      toast.error("신청을 보내지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  if (readOnly) return null;
  if (pending) {
    return (
      <div className="mb-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-900 break-keep">
        <b>📅 1년 결제 신청 완료</b> · {pending.label} · 스테이온이 입금 안내를 드려요.
        {pending.at && <span className="block text-[11.5px] text-emerald-700/70">신청한 날: {pending.at}</span>}
      </div>
    );
  }
  return (
    <>
      <button type="button" onClick={() => { setAgree(false); setOpen(true); }}
        className="mb-3 flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-left shadow-sm transition-all hover:border-blue-300 hover:shadow-md active:scale-[0.99]">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-xl">📅</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px] font-black text-slate-900">1년치 한 번에 결제 신청</span>
          <span className="mt-0.5 block text-[12px] text-slate-500 break-keep">11개월 값으로 1년 이용 · 계좌이체</span>
        </span>
        <span className="shrink-0 rounded-full bg-blue-600 px-2.5 py-1 text-[11px] font-black text-white">1개월 무료</span>
      </button>

      <Dialog open={open} onOpenChange={(o) => { if (!busy) setOpen(o); }}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-md max-h-[88svh] overflow-y-auto rounded-[1.75rem] border-0 p-5 sm:p-7">
          <DialogHeader className="text-center sm:text-center">
            <DialogTitle className="text-[20px] font-black text-slate-900">1년치 한 번에 결제 신청</DialogTitle>
            <DialogDescription className="text-[13px] text-slate-500 break-keep">11개월 값으로 1년(12개월)을 이용해요. 신청하시면 스테이온이 입금 안내를 드려요.</DialogDescription>
          </DialogHeader>

          <div className="mt-3 flex flex-col gap-2">
            {list.map((p) => {
              const on = p.key === pick;
              return (
                <button key={p.key} type="button" onClick={() => setPick(p.key)}
                  className={`flex items-center gap-3 rounded-xl border-2 px-3.5 py-3 text-left transition-all ${on ? "border-blue-500 bg-blue-50/60" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-bold text-slate-900">{p.label}</span>
                    <span className="mt-0.5 block truncate text-[11.5px] text-slate-500">{p.scope}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[11px] text-slate-400 line-through">{won(p.monthly * 12)}</span>
                    <span className="block whitespace-nowrap text-[15px] font-black text-blue-600">{won(p.monthly * 11)}<span className="ml-0.5 text-[11px] font-semibold text-slate-400">/1년</span></span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-[13px] text-slate-700">
            <div className="flex justify-between"><span>12개월 정가</span><span className="line-through text-slate-400">{won(full)}</span></div>
            <div className="mt-1 flex justify-between font-black text-slate-900"><span>1년 결제 금액 (1개월 무료)</span><span className="text-blue-600">{won(yearly)}</span></div>
            <div className="mt-1 flex justify-between text-[12px] text-slate-500"><span>결제 방법</span><span>계좌이체 (세금계산서 · 현금영수증 가능)</span></div>
          </div>

          {recurringActive && (
            <p className="mt-3 rounded-xl bg-amber-50 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-amber-800 break-keep">
              지금 정기결제를 쓰고 계세요. 1년 결제 입금이 확인되면 <b>정기결제는 스테이온이 해지</b>해 드려요(두 번 결제되지 않아요).
            </p>
          )}

          <div className="mt-3 grid gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="담당자 이름" className="h-11 rounded-xl border border-slate-200 px-3.5 text-[15px] outline-none focus:border-blue-400" />
            <input value={phone} onChange={(e) => setPhone(phoneFmt(e.target.value))} inputMode="tel" placeholder="연락처 (010-0000-0000)" className="h-11 rounded-xl border border-slate-200 px-3.5 text-[15px] outline-none focus:border-blue-400" />
            <textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={2} placeholder="요청 사항 (세금계산서 발행 등, 선택)" className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-[14px] outline-none focus:border-blue-400" />
          </div>

          {/* 환불 규정 — 신중하게 신청하도록 눈에 띄게 + 확인 체크 */}
          <div className="mt-3 rounded-xl border border-red-100 bg-red-50/60 px-4 py-3 text-[12.5px] leading-relaxed text-slate-700 break-keep">
            <p className="font-black text-red-600">1년 결제 환불 규정</p>
            <ul className="mt-1 space-y-0.5">
              <li>· 결제 후 <b>7일 이내</b>: <b>100% 환불</b></li>
              <li>· 결제 후 <b>14일 이내</b>: <b>50% 환불</b></li>
              <li>· 결제 후 <b>15일부터</b>: <b>환불 불가</b></li>
            </ul>
            <p className="mt-1.5 text-[12px] text-red-600/80">한 번에 1년치를 결제하는 상품이라 신중하게 신청해 주세요.</p>
          </div>
          <label className="mt-2.5 flex cursor-pointer items-start gap-2 text-[13px] text-slate-700 break-keep">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 accent-blue-600" />
            환불 규정을 확인했고, 신중하게 신청합니다.
          </label>

          <div className="mt-4 flex gap-2">
            <button type="button" disabled={busy} onClick={() => setOpen(false)} className="h-12 flex-1 rounded-xl bg-slate-100 text-[15px] font-bold text-slate-600 hover:bg-slate-200 disabled:opacity-50">취소</button>
            <button type="button" disabled={busy || !agree} onClick={submit} className="h-12 flex-[2] rounded-xl bg-blue-600 text-[15px] font-bold text-white shadow-[0_6px_16px_rgba(37,99,235,0.3)] hover:bg-blue-700 disabled:opacity-50">
              {busy ? "보내는 중…" : `${won(yearly)} 결제 신청하기`}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
