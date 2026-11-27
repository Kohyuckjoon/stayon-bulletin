import { useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";

// 확인 창(2026-11-25) — 브라우저 기본 confirm 대신 화면 가운데 머티리얼 느낌 팝업.
// 내용(rows: 이름 → 값 표), 선택 체크(예: 정기결제도 해지), 위험한 동작은 빨간 버튼(danger)
export type ConfirmOptions = {
  title: string;
  desc?: ReactNode;
  rows?: { label: string; value: ReactNode }[];
  check?: { label: ReactNode; defaultChecked?: boolean };
  note?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: (checked: boolean) => void | Promise<void>;
};

export function useConfirm() {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const ask = (o: ConfirmOptions) => { setChecked(!!o.check?.defaultChecked); setOpts(o); };
  const close = () => { if (!busy) setOpts(null); };
  const node = (
    <Dialog open={!!opts} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-[1.75rem] border-0 bg-white p-6 sm:p-7">
        {opts && (
          <>
            <DialogTitle className="text-[19px] font-black text-slate-900 break-keep">{opts.title}</DialogTitle>
            {opts.desc ? <DialogDescription className="mt-1 text-[13.5px] leading-relaxed text-slate-500 break-keep">{opts.desc}</DialogDescription> : <DialogDescription className="sr-only">{opts.title}</DialogDescription>}
            {opts.rows && opts.rows.length > 0 && (
              <div className="mt-4 divide-y divide-slate-100 rounded-2xl bg-slate-50 px-4">
                {opts.rows.map((r, i) => (
                  <div key={i} className="flex items-start justify-between gap-4 py-2.5 text-[13.5px]">
                    <span className="shrink-0 text-slate-400">{r.label}</span>
                    <span className="text-right font-bold text-slate-800 break-keep">{r.value}</span>
                  </div>
                ))}
              </div>
            )}
            {opts.check && (
              <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-[13px] text-amber-900 break-keep">
                <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5 h-4 w-4 accent-amber-600" />
                <span>{opts.check.label}</span>
              </label>
            )}
            {opts.note && <p className="mt-3 text-[12.5px] leading-relaxed text-slate-500 break-keep">{opts.note}</p>}
            <div className="mt-5 flex gap-2">
              <button type="button" disabled={busy} onClick={close} className="h-12 flex-1 rounded-xl bg-slate-100 text-[15px] font-bold text-slate-600 hover:bg-slate-200 disabled:opacity-50">취소</button>
              <button type="button" disabled={busy}
                onClick={async () => { setBusy(true); try { await opts.onConfirm(checked); setOpts(null); } finally { setBusy(false); } }}
                className={`h-12 flex-[2] rounded-xl text-[15px] font-bold text-white disabled:opacity-60 ${opts.danger ? "bg-red-600 hover:bg-red-700 shadow-[0_6px_16px_rgba(220,38,38,0.25)]" : "bg-blue-600 hover:bg-blue-700 shadow-[0_6px_16px_rgba(37,99,235,0.3)]"}`}>
                {busy ? "처리 중…" : opts.confirmLabel || "확인"}
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
  return { ask, node };
}
