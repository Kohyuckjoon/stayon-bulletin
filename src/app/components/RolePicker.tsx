import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

// 중직자 직분 기본 목록(주보 편집 화면·홈페이지 편집 화면 공통)
export const LAY_LEADER_ROLE_OPTIONS = ["시무장로", "원로장로", "은퇴장로", "권사"];

// 직분 선택(토스·머티리얼 스타일 목록) + "기타(직접 입력)". 목록에 없는 값이면 직접 입력 상태로 보임
export function RolePicker({ label, options, value, onChange }: { label?: string; options: string[]; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const isCustomValue = !!value && !options.includes(value)
  const [customMode, setCustomMode] = useState(isCustomValue)
  const custom = customMode || isCustomValue

  const pick = (opt: string | null) => {
    setOpen(false)
    if (opt === null) { // 기타(직접 입력)
      setCustomMode(true)
      if (options.includes(value)) onChange('')
    } else {
      setCustomMode(false)
      onChange(opt)
    }
  }

  return (
    <div>
      {label && <span className="block text-[13px] font-bold text-slate-600 mb-1.5">{label}</span>}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex w-full h-12 items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 text-left text-[15px] font-semibold text-slate-800 shadow-sm transition-all hover:border-slate-300 data-[state=open]:border-blue-500 data-[state=open]:ring-4 data-[state=open]:ring-blue-500/10"
          >
            <span className={custom && !value ? 'text-slate-400' : ''}>{custom ? '기타 (직접 입력)' : (value || '선택해 주세요')}</span>
            <span className={`text-slate-400 text-xs transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={6} className="w-[var(--radix-popover-trigger-width)] rounded-2xl border-0 bg-white p-1.5 shadow-[0_12px_40px_rgba(15,23,42,0.16)]">
          {[...options.map(o => ({ key: o, text: o, val: o as string | null })), { key: '__custom', text: '기타 (직접 입력)', val: null as string | null }].map(o => {
            const active = o.val === null ? custom : (!custom && value === o.val)
            return (
              <button
                key={o.key}
                type="button"
                onClick={() => pick(o.val)}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-[15px] transition-colors ${active ? 'bg-blue-50 font-bold text-blue-600' : 'font-semibold text-slate-700 hover:bg-slate-50'}`}
              >
                {o.text}
                {active && <span className="text-blue-600">✓</span>}
              </button>
            )
          })}
        </PopoverContent>
      </Popover>
      {custom && (
        <input
          autoFocus={!value}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="직분을 직접 입력해 주세요 (예: 안수집사)"
          className="mt-2 w-full h-12 rounded-xl border border-blue-300 bg-white px-3 text-[15px] font-semibold text-slate-800 outline-none placeholder:text-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
        />
      )}
    </div>
  )
}

