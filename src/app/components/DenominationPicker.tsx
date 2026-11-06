import { useState } from "react";
import { Check, ChevronDown, Church } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { DENOMINATIONS, denominationLogoSrc } from "../../utils/denominations";

// 교단 선택(로고 | 교단 이름). 기본 select는 이미지를 못 넣어서 목록을 직접 그림.
// value ""는 "선택 안 함"(스테이온 기본 아이콘).
export function DenominationPicker({ value, onChange, disabled, emptyLabel = "선택 안 함" }: {
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  emptyLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = DENOMINATIONS.find((d) => d.id === value) || null;

  const Logo = ({ id }: { id: string }) => (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-slate-100 overflow-hidden">
      {id ? (
        <img src={denominationLogoSrc(id)} alt="" className="h-6 w-6 object-contain" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
      ) : (
        <Church className="h-4 w-4 text-slate-400" />
      )}
    </span>
  );

  const pick = (id: string) => {
    setOpen(false);
    if (id !== value) onChange(id);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-left shadow-sm transition-all hover:border-slate-300 hover:shadow active:scale-[0.99] disabled:opacity-60 data-[state=open]:border-blue-500 data-[state=open]:ring-4 data-[state=open]:ring-blue-500/10"
        >
          <Logo id={selected?.id || ""} />
          <span className={`flex-1 truncate text-sm font-bold ${selected ? "text-slate-800" : "text-slate-400"}`}>
            {selected ? selected.name : emptyLabel}
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-[var(--radix-popover-trigger-width)] max-h-[360px] overflow-y-auto rounded-2xl border-0 bg-white p-1.5 shadow-[0_12px_40px_rgba(15,23,42,0.16)]"
      >
        {[{ id: "", name: emptyLabel }, ...DENOMINATIONS].map((d) => {
          const active = d.id === value;
          return (
            <button
              key={d.id || "none"}
              type="button"
              onClick={() => pick(d.id)}
              className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors ${active ? "bg-blue-50" : "hover:bg-slate-50 active:bg-slate-100"}`}
            >
              <Logo id={d.id} />
              <span className={`flex-1 truncate text-sm ${active ? "font-bold text-blue-600" : d.id ? "font-semibold text-slate-700" : "font-semibold text-slate-400"}`}>{d.name}</span>
              {active && <Check className="h-4 w-4 shrink-0 text-blue-600" />}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
