import { useState } from "react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Calendar as CalendarIcon, Clock } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Calendar } from "./ui/calendar";

// 날짜 선택(토스·머티리얼 스타일 달력 팝업). 값은 "YYYY-MM-DD" 문자열 그대로 주고받는다.
// 주보 편집 화면(AdminEditor)의 날짜 선택과 같은 모양.
export function DatePickerField({ value, onChange, placeholder = "날짜 선택", compact }: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  compact?: boolean; // 좁은 칸용: "2026. 11. 1. (일)"처럼 짧게 표시
}) {
  const [open, setOpen] = useState(false);
  const selectedDate = value ? new Date(`${value}T00:00:00`) : undefined;
  const label = selectedDate
    ? format(selectedDate, compact ? "yyyy. M. d. (EEE)" : "yyyy년 M월 d일 (EEE)", { locale: ko })
    : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-full h-[42px] rounded-lg border border-gray-300 bg-white px-3 flex items-center justify-between gap-2 text-sm font-semibold text-gray-800 transition-all hover:border-blue-400 data-[state=open]:border-blue-500 data-[state=open]:ring-4 data-[state=open]:ring-blue-500/10"
        >
          <span className={`truncate ${selectedDate ? "" : "text-gray-400 font-medium"}`}>{label}</span>
          <CalendarIcon className="w-4 h-4 text-blue-500 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={8} className="w-auto p-0 rounded-[1.5rem] border-0 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.16)] overflow-hidden">
        <Calendar
          mode="single"
          selected={selectedDate}
          defaultMonth={selectedDate}
          onSelect={(date) => {
            if (!date) return;
            onChange(format(date, "yyyy-MM-dd"));
            setOpen(false);
          }}
          locale={ko}
          modifiers={{
            sunday: (date) => date.getDay() === 0,
            saturday: (date) => date.getDay() === 6,
          }}
          modifiersClassNames={{
            sunday: "text-red-500",
            saturday: "text-blue-500",
          }}
          classNames={{
            months: "p-4",
            month: "space-y-4",
            caption: "flex justify-center pt-1 relative items-center",
            caption_label: "text-sm font-bold text-gray-800",
            nav: "flex items-center gap-1",
            nav_button: "size-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors",
            nav_button_previous: "absolute left-0",
            nav_button_next: "absolute right-0",
            table: "w-full border-collapse mt-3",
            head_row: "flex",
            head_cell: "text-gray-400 w-9 font-bold text-[11px]",
            row: "flex w-full mt-1",
            cell: "size-9 text-center text-sm p-0 relative",
            day: "size-9 rounded-full font-semibold text-gray-700 hover:bg-blue-50 transition-colors flex items-center justify-center",
            day_selected: "!bg-blue-600 !text-white shadow-md shadow-blue-200 hover:!bg-blue-600",
            day_today: "bg-blue-50 text-blue-600 font-black",
            day_outside: "text-gray-300",
            day_disabled: "text-gray-200",
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

// 시간 선택(2026-11-24) — 날짜 달력과 같은 토스·머티리얼 스타일 팝업. 값은 "HH:mm".
// 왼쪽 오전/오후, 가운데 시(1~12), 오른쪽 분(5분 단위). 고른 칸은 파란 알약
export function TimePickerField({ value, onChange, placeholder = "시간 선택" }: {
  value: string; onChange: (value: string) => void; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const m = value.match(/^(\d{1,2}):(\d{2})$/);
  const H = m ? Number(m[1]) : null;
  const M = m ? Number(m[2]) : null;
  const pm = H !== null && H >= 12;
  const h12 = H === null ? null : (H % 12 === 0 ? 12 : H % 12);
  const label = H === null ? placeholder : `${pm ? "오후" : "오전"} ${h12}시${M ? ` ${M}분` : ""}`;
  const set = (nextPm: boolean, nextH12: number, nextM: number) => {
    const h24 = (nextH12 % 12) + (nextPm ? 12 : 0);
    onChange(`${pad2(h24)}:${pad2(nextM)}`);
  };
  const pill = (on: boolean) => `h-9 w-full rounded-full text-sm font-semibold transition-colors ${on ? "bg-blue-600 text-white shadow-md shadow-blue-200" : "text-gray-700 hover:bg-blue-50"}`;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button"
          className="w-full h-[42px] rounded-lg border border-gray-300 bg-white px-3 flex items-center justify-between gap-2 text-sm font-semibold text-gray-800 transition-all hover:border-blue-400 data-[state=open]:border-blue-500 data-[state=open]:ring-4 data-[state=open]:ring-blue-500/10">
          <span className={`truncate ${H === null ? "text-gray-400 font-medium" : ""}`}>{label}</span>
          <Clock className="w-4 h-4 text-blue-500 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={8} className="w-auto p-0 rounded-[1.5rem] border-0 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.16)] overflow-hidden">
        <div className="flex gap-2 p-3">
          <div className="flex w-16 flex-col gap-1">
            {[false, true].map((p) => (
              <button key={String(p)} type="button" className={pill(H !== null && pm === p)} onClick={() => set(p, h12 ?? 12, M ?? 0)}>{p ? "오후" : "오전"}</button>
            ))}
          </div>
          <div className="w-16 max-h-60 overflow-y-auto flex flex-col gap-1 pr-0.5" style={{ scrollbarWidth: "thin" }}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
              <button key={h} type="button" className={pill(h12 === h)} onClick={() => set(H === null ? true : pm, h, M ?? 0)}>{h}시</button>
            ))}
          </div>
          <div className="w-16 max-h-60 overflow-y-auto flex flex-col gap-1 pr-0.5" style={{ scrollbarWidth: "thin" }}>
            {Array.from({ length: 12 }, (_, i) => i * 5).map((mm) => (
              <button key={mm} type="button" className={pill(M === mm)} onClick={() => { set(H === null ? true : pm, h12 ?? 12, mm); setOpen(false); }}>{pad2(mm)}분</button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// "1998. 3. 15" · "1998-03-15" · "1998.03" · "1998" → { y, m?, d? } (못 읽으면 null)
function parseLooseDate(v: string): { y: number; m?: number; d?: number } | null {
  const mt = v.trim().match(/^(\d{4})(?:\s*[.\-/년]\s*(\d{1,2}))?(?:\s*[.\-/월]\s*(\d{1,2}))?/);
  if (!mt) return null;
  const y = Number(mt[1]);
  const m = mt[2] ? Number(mt[2]) : undefined;
  const d = mt[3] ? Number(mt[3]) : undefined;
  if (m !== undefined && (m < 1 || m > 12)) return null;
  if (d !== undefined && (d < 1 || d > 31)) return null;
  return { y, m, d };
}
const pad2 = (n: number) => String(n).padStart(2, "0");

// 직접 입력 + 달력 둘 다 되는 날짜 칸(교회 연혁 등).
//  - 칸에 바로 입력: "1998. 03", "1998. 03. 15", "1998" 처럼 자유롭게(입력한 글자 그대로 저장)
//  - 오른쪽 달력 버튼: 머티리얼 스타일 달력. 맨 위 "날짜 검색"에 1998.3 / 1998.03.15 처럼 치면 그 달로 바로 이동,
//    날짜까지 치고 Enter를 누르면 그 날짜로 선택. 달력에서 날짜를 누르면 "YYYY. MM. DD"로 들어감
export function TypeableDateField({ value, onChange, placeholder = "ex. 1998. 03. 15" }: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const parsed = parseLooseDate(value);
  const selected = parsed?.m && parsed?.d ? new Date(parsed.y, parsed.m - 1, parsed.d) : undefined;
  const [month, setMonth] = useState<Date>(() => (parsed ? new Date(parsed.y, (parsed.m || 1) - 1, 1) : new Date()));
  const [q, setQ] = useState("");
  const [qErr, setQErr] = useState(false);
  const openCal = (o: boolean) => {
    setOpen(o);
    if (o) {
      const p = parseLooseDate(value);
      if (p) setMonth(new Date(p.y, (p.m || 1) - 1, 1));
      setQ("");
      setQErr(false);
    }
  };
  const search = (text: string, commit: boolean) => {
    setQ(text);
    if (!text.trim()) { setQErr(false); return; }
    const p = parseLooseDate(text);
    if (!p || p.y < 1800 || p.y > 2200) { setQErr(true); return; }
    setQErr(false);
    setMonth(new Date(p.y, (p.m || 1) - 1, 1));
    if (commit && p.m && p.d) { onChange(`${p.y}. ${pad2(p.m)}. ${pad2(p.d)}`); setOpen(false); }
  };
  const pick = (date?: Date) => {
    if (!date) return;
    onChange(format(date, "yyyy. MM. dd"));
    setOpen(false);
  };
  const shiftYear = (n: number) => setMonth((d) => new Date(d.getFullYear() + n, d.getMonth(), 1));

  return (
    <div className="flex h-[42px] w-full items-center rounded-lg border border-gray-300 bg-white transition-all focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10">
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm font-semibold text-gray-800 outline-none placeholder:font-medium placeholder:text-gray-400" />
      <Popover open={open} onOpenChange={openCal}>
        <PopoverTrigger asChild>
          <button type="button" aria-label="달력에서 날짜 고르기"
            className="mr-1 flex size-8 shrink-0 items-center justify-center rounded-md text-blue-500 transition-colors hover:bg-blue-50 data-[state=open]:bg-blue-50">
            <CalendarIcon className="w-4 h-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" sideOffset={8} className="w-[300px] p-0 rounded-[1.5rem] border-0 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.16)] overflow-hidden">
          {/* 머티리얼 스타일 머리말: 선택한 날짜 크게 + 날짜 검색 */}
          <div className="bg-blue-600 px-5 pt-4 pb-4 text-white">
            <p className="text-[11px] font-bold tracking-wide text-white/70">날짜 선택</p>
            <p className="mt-1 text-[22px] font-black leading-tight">{selected ? format(selected, "yyyy년 M월 d일 (EEE)", { locale: ko }) : (value.trim() || "날짜를 골라 주세요")}</p>
            <div className={`mt-3 flex items-center rounded-xl bg-white/15 px-3 ring-1 ${qErr ? "ring-red-300" : "ring-white/20"} focus-within:bg-white/25`}>
              <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-white/80" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <input autoFocus value={q} onChange={(e) => search(e.target.value, false)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); search(q, true); } }}
                placeholder="날짜 검색 (ex. 1998.3 / 1998.03.15)"
                className="h-9 min-w-0 flex-1 bg-transparent px-2 text-sm font-semibold text-white outline-none placeholder:text-white/60" />
            </div>
            <p className="mt-1.5 text-[11px] text-white/70">{qErr ? "날짜를 읽지 못했어요. 1998.03.15 처럼 입력해 주세요." : "연·월까지 치면 그 달로 이동, 날짜까지 치고 Enter면 선택돼요."}</p>
          </div>
          {/* 연도 빠르게 넘기기 */}
          <div className="flex items-center justify-between px-4 pt-3">
            <button type="button" onClick={() => shiftYear(-1)} className="rounded-full px-3 py-1 text-xs font-bold text-gray-500 hover:bg-gray-100">« {month.getFullYear() - 1}</button>
            <span className="text-xs font-black text-gray-700">{month.getFullYear()}년</span>
            <button type="button" onClick={() => shiftYear(1)} className="rounded-full px-3 py-1 text-xs font-bold text-gray-500 hover:bg-gray-100">{month.getFullYear() + 1} »</button>
          </div>
          <Calendar
            mode="single"
            selected={selected}
            month={month}
            onMonthChange={setMonth}
            onSelect={pick}
            locale={ko}
            modifiers={{ sunday: (date) => date.getDay() === 0, saturday: (date) => date.getDay() === 6 }}
            modifiersClassNames={{ sunday: "text-red-500", saturday: "text-blue-500" }}
            classNames={{
              months: "px-4 pb-2 pt-1",
              month: "space-y-3",
              caption: "flex justify-center pt-1 relative items-center",
              caption_label: "text-sm font-bold text-gray-800",
              nav: "flex items-center gap-1",
              nav_button: "size-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors",
              nav_button_previous: "absolute left-0",
              nav_button_next: "absolute right-0",
              table: "w-full border-collapse mt-2",
              head_row: "flex",
              head_cell: "text-gray-400 w-9 font-bold text-[11px]",
              row: "flex w-full mt-1",
              cell: "size-9 text-center text-sm p-0 relative",
              day: "size-9 rounded-full font-semibold text-gray-700 hover:bg-blue-50 transition-colors flex items-center justify-center",
              day_selected: "!bg-blue-600 !text-white shadow-md shadow-blue-200 hover:!bg-blue-600",
              day_today: "bg-blue-50 text-blue-600 font-black",
              day_outside: "text-gray-300",
              day_disabled: "text-gray-200",
            }}
          />
          <div className="flex justify-end gap-1 px-4 pb-4">
            <button type="button" onClick={() => pick(new Date())} className="rounded-full px-3 py-1.5 text-xs font-bold text-blue-600 hover:bg-blue-50">오늘</button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-full px-3 py-1.5 text-xs font-bold text-gray-500 hover:bg-gray-100">닫기</button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
