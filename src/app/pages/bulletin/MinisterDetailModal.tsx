import { X, Phone, MessageSquare } from "lucide-react";
import { maskPhoneNumber } from "../../../utils/maskPhone";

// 섬기는 분 한 명을 눌렀을 때 뜨는 상세 팝업. (원래 BulletinView 안에 있던 것을 분리)
export function MinisterDetailModal({ minister, onClose, accent = "#2563eb" }: { minister: any; onClose: () => void; accent?: string }) {
  if (!minister) return null;
  const photo = minister?.photoUrl || minister?.photoURL || minister?.photoUrL;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="relative w-full max-w-sm bg-white rounded-[2.5rem] overflow-hidden shadow-2xl border border-slate-100 flex flex-col">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-slate-100/80 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="w-full h-80 bg-slate-100 relative">
          {photo ? (
            <img src={photo} alt={minister?.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-tr from-slate-200 to-slate-300 text-slate-600 font-black text-4xl flex items-center justify-center">
              {minister?.name ? minister.name.slice(0, 1) : "섬"}
            </div>
          )}
        </div>

        <div className="p-6 text-center bg-white flex flex-col items-center">
          {minister?.role && (
            <span className="text-xs font-bold tracking-wide mb-1" style={{ color: accent }}>{minister.role}</span>
          )}
          <h3 className="text-xl font-extrabold text-slate-900 tracking-tight mb-4">
            {minister?.name || "이름 없음"}
          </h3>

          {minister?.description && (
            <p className="text-slate-500 text-sm leading-relaxed whitespace-pre-line break-keep mb-4">
              {minister.description}
            </p>
          )}

          {minister?.phone && (
            <a
              href={`tel:${minister.phone}`}
              className="w-full py-3 px-4 bg-slate-50 hover:bg-slate-100 rounded-2xl border border-slate-200/60 text-slate-700 font-semibold text-sm flex items-center justify-center gap-2 mb-4 transition-colors"
            >
              <Phone className="w-4 h-4 text-slate-500" />
              {maskPhoneNumber(minister.phone)}
            </a>
          )}

          {minister?.phone && (
            <div className="grid grid-cols-2 gap-3 w-full">
              <a
                href={`tel:${minister.phone}`}
                className="py-3 px-4 bg-[#8C7A6B] hover:bg-[#786759] text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-colors shadow-sm"
              >
                <Phone className="w-4 h-4" />
                전화하기
              </a>
              <a
                href={`sms:${minister.phone}`}
                className="py-3 px-4 bg-[#4A3B32] hover:bg-[#3B2F27] text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-colors shadow-sm"
              >
                <MessageSquare className="w-4 h-4" />
                문자하기
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
