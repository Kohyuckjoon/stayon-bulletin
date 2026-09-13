import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { ChevronRight, Plus } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../../firebase";
import { fetchPastoralColumns, type PastoralColumn } from "../../../utils/pastoralColumns";
import { hasTierOrAbove } from "../../../utils/subscriptionTier";

// 주보 화면(BulletinView 및 두 아이보리 템플릿) 가장 하단에 공통으로 붙는 "목회 칼럼" 섹션.
// - 프로 요금제 미만이면 통째로 안 보임(entitled === false) - 데이터는 그대로 유지, 등급
//   복구되면 다시 보인다(커스텀 디자인과 동일한 원칙).
// - "모던 & 미니멀 디자인" 계열(templateId가 warm-ivory 계열)은 리스트형(최대 3개 + 더보기),
//   그 외 기본 디자인은 가로 스크롤 카드형(이미지 있으면 이미지, 없으면 텍스트만 + 트레일링
//   "+" 카드)으로 그린다. 3개 초과일 때만 "더보기"가 뜬다.
type Theme = { pageBg: string; headerBg: string; line: string; ink: string; muted: string; accent: string; label: string; flat: boolean };
const THEMES: Record<string, Theme> = {
  default: { pageBg: "#f1f5f9", headerBg: "rgba(241,245,249,0.92)", line: "#e2e8f0", ink: "#0f172a", muted: "#64748b", accent: "#2563eb", label: "#3b82f6", flat: false },
  "warm-ivory": { pageBg: "#FDFAF5", headerBg: "rgba(253,250,245,0.92)", line: "#EEE6D4", ink: "#1F241F", muted: "#8a8272", accent: "#2F5C52", label: "#B5924A", flat: true },
  "warm-ivory-open": { pageBg: "#FDFAF5", headerBg: "rgba(253,250,245,0.92)", line: "#EEE6D4", ink: "#1F241F", muted: "#8a8272", accent: "#2F5C52", label: "#B5924A", flat: true },
};

export function PastoralColumnSection({
  bulletinId,
  authorId,
  templateId,
  enabled = true,
}: {
  bulletinId: string;
  authorId?: string;
  templateId?: string;
  enabled?: boolean; // 이번 주보에서만 숨기는 토글(bulletins/{id}.pastoralColumnsEnabled)
}) {
  const navigate = useNavigate();
  const [columns, setColumns] = useState<PastoralColumn[]>([]);
  const [entitled, setEntitled] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!authorId || !enabled) { setLoaded(true); return; }
    (async () => {
      try {
        const [list, uSnap] = await Promise.all([
          fetchPastoralColumns(authorId, 4),
          getDoc(doc(db, "users", authorId)),
        ]);
        if (cancelled) return;
        setColumns(list);
        const status = uSnap.exists() ? (uSnap.data() as { status?: string })?.status : undefined;
        setEntitled(hasTierOrAbove(status, "pro"));
      } catch (e) {
        console.error("목회 칼럼 조회 실패:", e);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [authorId, enabled]);

  if (!enabled || !loaded || !entitled || columns.length === 0) return null;

  const t = THEMES[templateId as string] || THEMES.default;
  const visible = columns.slice(0, 3);
  const hasMore = columns.length > 3;
  const goMore = () => navigate(`/view/${bulletinId}/column`);
  const goDetail = (columnId: string) => navigate(`/view/${bulletinId}/column/${columnId}`);

  if (t.flat) {
    return (
      <div className="px-6 py-7 border-t-2" style={{ borderColor: t.line }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[10px] font-black tracking-[0.22em] uppercase" style={{ color: t.label }}>PASTORAL COLUMN</p>
            <h2 className="text-lg font-black mt-0.5" style={{ color: t.ink }}>목회 칼럼</h2>
          </div>
          {hasMore && (
            <button type="button" onClick={goMore} className="flex items-center gap-0.5 text-xs font-bold shrink-0" style={{ color: t.accent }}>
              더보기 <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="divide-y" style={{ borderColor: t.line }}>
          {visible.map((col) => (
            <button key={col.id} type="button" onClick={() => goDetail(col.id)} className="w-full text-left py-4 first:pt-0 last:pb-0">
              <p className="text-[11px] font-bold mb-1" style={{ color: t.muted }}>{col.date}{col.author ? ` · ${col.author}` : ""}</p>
              <p className="font-black text-[15px] mb-1 break-keep" style={{ color: t.ink }}>{col.title}</p>
              <p className="text-xs leading-relaxed line-clamp-2 whitespace-pre-line break-keep" style={{ color: t.muted }}>{col.content}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // 기본(카드) 레이아웃: 모바일 가로 스크롤 카드 2개 풀노출 + 3번째 살짝 peek, 맨 끝에 "+" 카드
  return (
    <section className="px-4 pt-2 pb-6">
      <div className="flex items-center justify-between mb-3 px-1">
        <h2 className="text-base font-extrabold text-slate-900">목회 칼럼</h2>
        <button type="button" onClick={goMore} className="flex items-center gap-0.5 text-xs font-bold text-blue-600 shrink-0">
          더보기 <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {visible.map((col) => (
          <button
            key={col.id}
            type="button"
            onClick={() => goDetail(col.id)}
            className="shrink-0 snap-start w-[150px] rounded-2xl bg-white border border-slate-100 shadow-sm overflow-hidden text-left flex flex-col"
          >
            {col.imageUrl && (
              <div className="w-full h-20 bg-slate-100 shrink-0">
                <img src={col.imageUrl} alt={col.title} className="w-full h-full object-cover" />
              </div>
            )}
            <div className="p-3 flex-1 flex flex-col min-h-[92px]">
              <p className="text-[10px] text-slate-400 font-bold mb-1">{col.date}</p>
              <p className="text-[13px] font-extrabold text-slate-900 leading-snug line-clamp-2 break-keep">{col.title}</p>
              {!col.imageUrl && (
                <p className="text-[11px] text-slate-500 mt-1 line-clamp-3 leading-relaxed break-keep">{col.content}</p>
              )}
            </div>
          </button>
        ))}
        {hasMore && (
          <button
            type="button"
            onClick={goMore}
            className="shrink-0 snap-start w-[150px] rounded-2xl bg-slate-50 border border-dashed border-slate-200 flex flex-col items-center justify-center gap-1.5 text-slate-400 hover:bg-slate-100 transition-colors"
          >
            <span className="w-9 h-9 rounded-full bg-white border border-slate-200 flex items-center justify-center">
              <Plus className="w-4 h-4" />
            </span>
            <span className="text-[11px] font-bold">더보기</span>
          </button>
        )}
      </div>
    </section>
  );
}
