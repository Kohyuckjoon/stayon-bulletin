import { useState } from "react";
import { toast } from "sonner";
import { auth } from "../../firebase";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";

// 정기결제 요금제 올리기(2026-11-25) — 한 단계씩: 베이직 990 → 스탠다드 2,900 → 셀프형 9,900 → 라이트 14,900 → 맥스 19,900.
// 바꾸는 즉시 새 금액 전액 결제(차액 계산·환불 없음), 다음 결제일 = 오늘 + 1개월. 실제 결제·변경은 서버 upgradeRecurringPlan.
// 화면 금액은 안내용이고, 실제 결제 금액은 서버 가격표가 정함
export type UpgradeKey = "standard" | "pro" | "lite" | "max";
export const UPGRADE_LADDER: { key: UpgradeKey; label: string; amount: number; scope: string }[] = [
  { key: "standard", label: "스탠다드", amount: 2900, scope: "온라인 주보" },
  { key: "pro", label: "프로 · 셀프형", amount: 9900, scope: "주보 + 교회 홈페이지(직접 관리)" },
  { key: "lite", label: "관리형 라이트", amount: 14900, scope: "주보 + 홈페이지 · 스테이온이 월 2회 업데이트" },
  { key: "max", label: "관리형 맥스", amount: 19900, scope: "주보 + 홈페이지 · 스테이온이 매주 업데이트" },
];

export async function requestUpgrade(key: UpgradeKey): Promise<{ ok: boolean; planName?: string; amount?: number }> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) { toast.error("로그인이 필요합니다."); return { ok: false }; }
  try {
    const r = await fetch("https://asia-northeast3-stayonsbplatform.cloudfunctions.net/upgradeRecurringPlan", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ plan: key }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast.error(j.error || "요금제를 바꾸지 못했어요. 잠시 후 다시 시도해 주세요."); return { ok: false }; }
    toast.success(`${j.planName || "새 요금제"}로 바꿨어요. 지금부터 바로 쓸 수 있어요.`);
    return { ok: true, planName: j.planName, amount: j.amount };
  } catch {
    toast.error("요금제를 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.");
    return { ok: false };
  }
}

// 확인 창: 지금 → 바꿀 요금제, 바로 결제 · 다음 결제일 · 이번 달 금액 환불 없음 안내
export function UpgradeConfirmDialog({ open, onOpenChange, currentName, currentAmount, target, onDone }: {
  open: boolean; onOpenChange: (o: boolean) => void; currentName: string; currentAmount: number;
  target: { key: UpgradeKey; label: string; amount: number } | null; onDone?: (r: { planName?: string; amount?: number }) => void;
}) {
  const [busy, setBusy] = useState(false);
  if (!target) return null;
  const go = async () => {
    setBusy(true);
    const r = await requestUpgrade(target.key);
    setBusy(false);
    if (r.ok) { onOpenChange(false); onDone?.(r); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-[1.75rem] border-0 p-6 sm:p-7">
        <DialogHeader className="text-center sm:text-center">
          <DialogTitle className="text-[20px] font-black text-slate-900">요금제를 바꿀까요?</DialogTitle>
          <DialogDescription className="text-[13.5px] text-slate-500 break-keep">지금 등록된 카드로 바로 결제되고, 바로 쓸 수 있어요.</DialogDescription>
        </DialogHeader>
        <div className="mt-2 flex items-center gap-2 rounded-2xl bg-slate-50 p-4">
          <div className="min-w-0 flex-1 text-center">
            <p className="text-[11.5px] font-bold text-slate-400">지금</p>
            <p className="mt-0.5 truncate text-[13.5px] font-bold text-slate-600">{currentName.replace(/ ?정기결제 플랜$/, "") || "정기결제"}</p>
            <p className="text-[15px] font-black text-slate-500 line-through decoration-slate-300">{currentAmount.toLocaleString()}원</p>
          </div>
          <span className="text-xl text-slate-300">→</span>
          <div className="min-w-0 flex-1 text-center">
            <p className="text-[11.5px] font-bold text-blue-500">바꿀 요금제</p>
            <p className="mt-0.5 truncate text-[13.5px] font-bold text-slate-900">{target.label}</p>
            <p className="text-[17px] font-black text-blue-600">{target.amount.toLocaleString()}원<span className="text-[12px] font-semibold text-slate-400"> / 월</span></p>
          </div>
        </div>
        <ul className="mt-3 space-y-1.5 text-[13px] leading-relaxed text-slate-600 break-keep">
          <li>· 바꾸는 즉시 <b>{target.amount.toLocaleString()}원</b>이 등록된 카드로 결제돼요.</li>
          <li>· 다음 결제일은 <b>오늘부터 한 달 뒤</b>로 바뀌고, 그때부터 매달 {target.amount.toLocaleString()}원이 결제돼요.</li>
          <li>· 이번 달에 이미 결제한 <b>{currentAmount.toLocaleString()}원은 돌려드리지 않아요.</b></li>
          <li>· 지금까지 채운 <b>1년 완납 항아리·나무는 처음부터 다시</b> 시작돼요.</li>
          <li>· 낮은 요금제로 바꾸시려면 정기결제를 해지한 뒤 다시 결제해 주세요.</li>
        </ul>
        <div className="mt-5 flex gap-2">
          <button type="button" disabled={busy} onClick={() => onOpenChange(false)} className="h-12 flex-1 rounded-xl bg-slate-100 text-[15px] font-bold text-slate-600 hover:bg-slate-200 disabled:opacity-50">취소</button>
          <button type="button" disabled={busy} onClick={go} className="h-12 flex-[2] rounded-xl bg-blue-600 text-[15px] font-bold text-white shadow-[0_6px_16px_rgba(37,99,235,0.3)] hover:bg-blue-700 disabled:opacity-60">
            {busy ? "결제하는 중…" : `${target.amount.toLocaleString()}원 결제하고 바꾸기`}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// 결제 관리 화면: 맨 위에 "지금 사용 중" 요금제(파란 테두리 · 꼬리표), 그 아래 더 높은 요금제를 순서대로.
// 하나를 누르면 확인 창
// homepageOnly: 교회 홈페이지 편집 화면 — 베이직·스탠다드(주보만)는 목록에서 뺌(2026-11-25)
export function PlanUpgradeList({ currentName, currentAmount, onDone, homepageOnly = false }: { currentName: string; currentAmount: number; onDone?: (r: { planName?: string; amount?: number }) => void; homepageOnly?: boolean }) {
  const [target, setTarget] = useState<(typeof UPGRADE_LADDER)[number] | null>(null);
  const shown = (k: string) => !homepageOnly || (k !== "basic" && k !== "standard");
  const options = UPGRADE_LADDER.filter((p) => p.amount > currentAmount && shown(p.key));
  // 지금 요금제: 금액이 같은 단계(베이직 포함), 없으면 결제 이름 그대로
  const ladderAll = [{ key: "basic", label: "베이직", amount: 990, scope: "온라인 주보" }, ...UPGRADE_LADDER];
  const cur = ladderAll.find((p) => p.amount === currentAmount)
    || { key: "current", label: currentName.replace(/ ?정기결제 플랜$/, "") || "정기결제", amount: currentAmount, scope: "" };
  // 지금보다 낮은 요금제(흐리게, 비싼 것부터)
  const lower = ladderAll.filter((p) => p.amount < currentAmount && shown(p.key)).sort((x, y) => y.amount - x.amount);
  return (
    // 결제 관리의 "요금제 · 정기결제" 칸 안에 바로 들어가므로 바깥 테두리·제목 없음
    <div>
      {/* 지금 사용 중 */}
      <div className="flex items-center gap-3 rounded-xl border-2 border-blue-500 bg-blue-50/60 px-3.5 py-3">
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="text-[14px] font-black text-slate-900">{cur.label}</span>
            <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10.5px] font-black text-white">지금 사용 중</span>
          </span>
          {cur.scope && <span className="mt-0.5 block truncate text-[12px] text-slate-500">{cur.scope}</span>}
        </span>
        <span className="shrink-0 whitespace-nowrap text-[15px] font-black text-slate-900">{cur.amount.toLocaleString()}원<span className="ml-0.5 text-[11.5px] font-semibold text-slate-400">/월</span></span>
      </div>
      {options.length > 0 ? (
        <>
          <p className="mt-4 text-[12.5px] font-bold text-slate-600">더 높은 요금제로 올리기</p>
          <p className="mt-0.5 text-[12px] text-slate-400 break-keep">고르면 바로 결제되고 바로 바뀌어요. 이번 달에 낸 금액은 돌려드리지 않아요.</p>
        </>
      ) : (
        <p className="mt-3 text-[12px] text-slate-400">가장 높은 요금제를 쓰고 계세요.</p>
      )}
      <div className="mt-2 flex flex-col gap-2">
        {options.map((p) => (
          <button key={p.key} type="button" onClick={() => setTarget(p)}
            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-left transition-all hover:border-blue-300 hover:shadow-sm active:scale-[0.99]">
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-bold text-slate-900">{p.label}</span>
              <span className="mt-0.5 block truncate text-[12px] text-slate-500">{p.scope}</span>
            </span>
            <span className="shrink-0 whitespace-nowrap text-[15px] font-black text-blue-600">{p.amount.toLocaleString()}원<span className="ml-0.5 text-[11.5px] font-semibold text-slate-400">/월</span></span>
          </button>
        ))}
      </div>
      {/* 낮은 요금제(2026-11-25): 흐리게 보여 주고 누를 수 없음 — 해지 후 다시 결제해야 바꿀 수 있다는 안내 */}
      {lower.length > 0 && (
        <>
          <p className="mt-4 text-[12.5px] font-bold text-slate-400">낮은 요금제</p>
          <p className="mt-0.5 text-[12px] text-slate-400 break-keep">낮은 요금제로 바꾸시려면 아래 <b>정기결제 해지</b> 후, 이용 기간이 끝나면 다시 결제해 주세요.</p>
          <div className="mt-2 flex flex-col gap-2">
            {lower.map((p) => (
              <div key={p.key} aria-disabled="true"
                className="flex items-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-3.5 py-3 opacity-60">
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-bold text-slate-500">{p.label}</span>
                  <span className="mt-0.5 block truncate text-[12px] text-slate-400">{p.scope}</span>
                </span>
                <span className="shrink-0 whitespace-nowrap text-[15px] font-black text-slate-400">{p.amount.toLocaleString()}원<span className="ml-0.5 text-[11.5px] font-semibold">/월</span></span>
              </div>
            ))}
          </div>
        </>
      )}
      <UpgradeConfirmDialog open={!!target} onOpenChange={(o) => { if (!o) setTarget(null); }}
        currentName={currentName} currentAmount={currentAmount} target={target} onDone={onDone} />
    </div>
  );
}
