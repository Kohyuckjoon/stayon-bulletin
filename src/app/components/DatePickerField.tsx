import { useState } from "react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Calendar as CalendarIcon } from "lucide-react";
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
