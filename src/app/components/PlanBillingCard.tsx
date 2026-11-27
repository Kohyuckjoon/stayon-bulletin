import { useState } from "react";
import { useNavigate } from "react-router";
import { CreditCard, Calendar, Trash2, ShieldCheck } from "lucide-react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { getPlanTierMeta, getExpiryInfo } from "../../utils/subscriptionTier";
import { useBillingKey } from "../../hooks/useBillingKey";
import { PlanUpgradeList } from "./PlanUpgrade";

// 요금제 · 정기결제 칸(2026-11-25) — 주보 관리자 결제 관리(/admin/billing)와 홈페이지 편집 화면 요금제가 같이 씀.
// 결제 방식(정기결제/1회/무료체험) · 이용 기간 · 지금 사용 중 요금제 + 올리기 · 다음 결제일 · 카드 · 연장/해지.
// readOnly: 운영자가 다른 교회를 대신 보는 중 — 카드 변경·해지·요금제 올리기는 로그인한 계정 기준이라 남의 화면에선 숨김
// (결제 요청·처리 코드는 useBillingKey / 서버 그대로 — 여기선 부르기만 함)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function PlanBillingCard({ userData, onChanged, readOnly = false, homepageOnly = false }: { userData: any; onChanged?: () => void; readOnly?: boolean; homepageOnly?: boolean }) {
  const navigate = useNavigate();
  const { requestIssueBillingKey, cancelSubscription } = useBillingKey();
  const [registering, setRegistering] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const PREVIEW_UNLOCKED = true;

  const planMeta = getPlanTierMeta(userData?.status);
  const expiry = userData ? getExpiryInfo(userData) : null;
  const hasBillingKey = !!userData?.billingKey;
  // 정기결제 중 = 카드 + 요금제·금액이 걸려 있고 해지 안 됨. 카드만 등록한 상태는 결제가 일어나지 않음
  const subscriptionActive = hasBillingKey && userData?.subscriptionActive === true && !!userData?.billingAmount;
  const nextBillingDate: Date | null = userData?.nextBillingDate?.toDate ? userData.nextBillingDate.toDate() : null;

  const handleRegisterCard = async () => {
    setRegistering(true);
    try { await requestIssueBillingKey(); onChanged?.(); } finally { setRegistering(false); }
  };
  const handleCancelSubscription = async () => {
    setCancelling(true);
    try { await cancelSubscription(); onChanged?.(); } finally { setCancelling(false); }
  };

  if (!userData) return null;
  return (
    <>
        {/* 요금제 · 정기결제(2026-11-25 한 칸으로 합침): 지금 요금제(이용 기간) → 정기결제(지금 사용 중 + 올리기) → 다음 결제일 · 카드 → 버튼 */}
        <Card className="relative p-5 sm:p-6 rounded-[1.75rem] border-0 bg-white shadow-sm overflow-hidden">
          <div className={PREVIEW_UNLOCKED ? "" : "opacity-50 grayscale-[0.6] pointer-events-none select-none"}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-[15px] font-black text-slate-900">요금제 · 정기결제</h2>
              {/* 이용 등급: 화려한 뱃지 대신 차분한 글씨(2026-11-25) */}
              <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-slate-500">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />이용 등급 <span className="text-slate-800">{planMeta.label}</span>
              </span>
            </div>
            {/* 결제 방식 한눈에(2026-11-25): 정기결제(매달 자동) / 1회 결제(자동 갱신 없음) / 무료체험 */}
            {(() => {
              const mode = subscriptionActive ? "recurring" : expiry?.isTrial ? "trial" : expiry?.date ? "once" : "none";
              const ui = {
                recurring: { icon: "🔄", title: "정기결제 중", desc: `매달 ${Number(userData?.billingAmount || 0).toLocaleString()}원이 자동으로 결제돼요`, cls: "bg-emerald-50 border-emerald-200 text-emerald-800" },
                once: { icon: "🧾", title: "1회 결제로 이용 중", desc: "자동으로 결제되지 않아요. 이용 기간이 끝나면 다시 결제해 주세요", cls: "bg-amber-50 border-amber-200 text-amber-800" },
                trial: { icon: "🎁", title: "무료체험 중", desc: "아직 결제한 요금제가 없어요", cls: "bg-sky-50 border-sky-200 text-sky-800" },
                none: { icon: "💳", title: "결제한 요금제가 없어요", desc: "요금제를 골라 시작해 주세요", cls: "bg-slate-50 border-slate-200 text-slate-700" },
              }[mode];
              return (
                <div className={`mt-3 flex items-center gap-3 rounded-2xl border px-4 py-3 ${ui.cls}`}>
                  <span className="text-xl leading-none">{ui.icon}</span>
                  <span className="min-w-0">
                    <span className="block text-[14px] font-black">{ui.title}</span>
                    <span className="block text-[12px] font-medium opacity-80 break-keep">{ui.desc}</span>
                  </span>
                </div>
              );
            })()}
            {expiry?.date && (
              <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-slate-500 font-medium">
                <Calendar className="w-4 h-4" />
                {expiry.isTrial ? "무료체험" : "이용 기간"} {expiry.date.toLocaleDateString()}까지
                {typeof expiry.daysLeft === "number" && (
                  <span className={expiry.daysLeft <= 7 ? "text-red-500 font-bold" : "text-slate-400"}>
                    (D{expiry.daysLeft >= 0 ? "-" : "+"}{Math.abs(expiry.daysLeft)})
                  </span>
                )}
              </p>
            )}

            <div className="mt-4 space-y-3">
              {subscriptionActive ? (
                <>
                  {/* 지금 사용 중 요금제 + 더 높은 요금제로 올리기 */}
                  {readOnly ? (
                    <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-blue-500 bg-blue-50/60 px-3.5 py-3">
                      <span className="text-[14px] font-black text-slate-900">{String(userData?.billingPlanName || "정기결제").replace(/ ?정기결제 플랜$/, "")} <span className="ml-1 rounded-full bg-blue-600 px-2 py-0.5 text-[10.5px] font-black text-white align-middle">지금 사용 중</span></span>
                      <span className="shrink-0 whitespace-nowrap text-[15px] font-black text-slate-900">{Number(userData?.billingAmount || 0).toLocaleString()}원<span className="ml-0.5 text-[11.5px] font-semibold text-slate-400">/월</span></span>
                    </div>
                  ) : <PlanUpgradeList currentName={String(userData?.billingPlanName || "")} currentAmount={Number(userData?.billingAmount || 0)}
                    onDone={() => onChanged?.()} homepageOnly={homepageOnly} />}
                </>
              ) : (
                <div className="rounded-2xl bg-blue-50 p-4 text-sm text-blue-900">
                  <p className="font-bold">아직 정기결제를 시작하지 않았어요.</p>
                  <p className="mt-1 text-blue-800/80 text-[13px] break-keep">요금제를 고르면 첫 달이 바로 결제되고, 다음 달부터 매달 자동으로 결제돼요.</p>
                  <Button onClick={() => navigate("/admin/pricing")} className="mt-3 w-full rounded-xl font-bold bg-blue-600 hover:bg-blue-700">요금제 고르고 정기결제 시작</Button>
                </div>
              )}

              {/* 다음 결제일 · 결제 카드 */}
              <div className="rounded-2xl border border-slate-100 divide-y divide-slate-100 text-sm">
                {subscriptionActive && nextBillingDate && (
                  <div className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="text-slate-400 font-medium">다음 결제일</span>
                    <span className="font-bold text-slate-800">{nextBillingDate.toLocaleDateString()} · {Number(userData?.billingAmount || 0).toLocaleString()}원</span>
                  </div>
                )}
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center text-white shrink-0">
                    <CreditCard className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-900 text-[13.5px] truncate">
                      {hasBillingKey ? `${userData?.billingCardName || "등록된 카드"} •••• ${userData?.billingCardLast4 || "••••"}` : "등록된 카드가 없어요"}
                    </p>
                    <p className="text-[11.5px] text-slate-400 font-medium truncate">
                      {!hasBillingKey ? "등록해 두면 결제할 때 카드 번호를 다시 넣지 않아도 돼요" : subscriptionActive ? "이 카드로 매달 자동 결제돼요" : "정기결제에 쓰이고 있지 않은 카드예요"}
                    </p>
                  </div>
                  {!readOnly && <button type="button" onClick={handleRegisterCard} disabled={!PREVIEW_UNLOCKED || registering}
                    className="shrink-0 rounded-lg bg-slate-100 px-3 py-2 text-[12.5px] font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-50">
                    {registering ? "처리 중…" : hasBillingKey ? "카드 변경" : "카드 등록"}
                  </button>}
                </div>
              </div>

              {/* 1회 결제로 연장 · 정기결제 해지(운영자가 다른 교회를 보는 중이면 숨김) */}
              {!readOnly && <div className={`grid gap-2 ${subscriptionActive ? "grid-cols-2" : "grid-cols-1"}`}>
                <Button variant="outline" disabled={!PREVIEW_UNLOCKED} onClick={() => navigate("/admin/pricing")}
                  className="h-11 rounded-xl font-bold text-slate-600 border-slate-200">1회 결제로 연장</Button>
                {subscriptionActive && (
                  <button type="button" onClick={handleCancelSubscription} disabled={!PREVIEW_UNLOCKED || cancelling}
                    className="h-11 rounded-xl bg-red-50 text-red-600 text-sm font-bold flex items-center justify-center gap-1.5 ring-1 ring-red-100 transition-colors hover:bg-red-100 disabled:opacity-50">
                    <Trash2 className="w-4 h-4" /> {cancelling ? "처리 중..." : "정기결제 해지"}
                  </button>
                )}
              </div>}
            </div>

            <p className="text-[11px] text-slate-400 font-medium mt-4 flex items-start gap-1.5 leading-relaxed">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              카드 번호는 저희 서버에 저장되지 않아요. 결제 대행사(포트원)가 안전하게 보관해요.
            </p>
          </div>
        </Card>
    </>
  );
}
