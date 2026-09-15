import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router";
import { ArrowLeft, ChevronRight, Newspaper } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../../firebase";
import { fetchPublishedBulletin } from "../../../utils/fetchPublishedBulletin";
import { fetchPastoralColumns, type PastoralColumn } from "../../../utils/pastoralColumns";
import { hasTierOrAbove } from "../../../utils/subscriptionTier";
import { BulletinMenu } from "./BulletinMenu";

// 메뉴 > 목회 칼럼 (= 하단 목회 칼럼 섹션의 "더보기" 목적지). 최근 3개만 보여주는
// PastoralColumnSection과 달리 여기서는 전체 지난 내역을 다 보여준다.
type Theme = { pageBg: string; headerBg: string; line: string; ink: string; muted: string; accent: string; label: string; flat: boolean };
const THEMES: Record<string, Theme> = {
  default: { pageBg: "#f1f5f9", headerBg: "rgba(241,245,249,0.92)", line: "#e2e8f0", ink: "#0f172a", muted: "#64748b", accent: "#2563eb", label: "#3b82f6", flat: false },
  "warm-ivory": { pageBg: "#FDFAF5", headerBg: "rgba(253,250,245,0.92)", line: "#EEE6D4", ink: "#1F241F", muted: "#8a8272", accent: "#2F5C52", label: "#B5924A", flat: true },
  "warm-ivory-open": { pageBg: "#FDFAF5", headerBg: "rgba(253,250,245,0.92)", line: "#EEE6D4", ink: "#1F241F", muted: "#8a8272", accent: "#2F5C52", label: "#B5924A", flat: true },
};

export function PastoralColumnListPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [bulletin, setBulletin] = useState<any>(null);
  const [columns, setColumns] = useState<PastoralColumn[]>([]);
  const [entitled, setEntitled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = id ? await fetchPublishedBulletin(id) : null;
      if (cancelled) return;
      setBulletin(data);
      if (data?.authorId) {
        try {
          const [list, uSnap] = await Promise.all([
            fetchPastoralColumns(data.authorId),
            getDoc(doc(db, "users", data.authorId)),
          ]);
          if (cancelled) return;
          setColumns(list);
          const status = uSnap.exists() ? (uSnap.data() as { status?: string })?.status : undefined;
          setEntitled(hasTierOrAbove(status, "pro"));
        } catch (e) {
          console.error("목회 칼럼 목록 조회 실패:", e);
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id]);

  const t = THEMES[bulletin?.bulletinTemplate as string] || THEMES.default;
  const show = bulletin?.pastoralColumnsEnabled === true && entitled && columns.length > 0;

  return (
    <div className="min-h-screen flex flex-col items-center font-sans animate-in fade-in duration-700" style={{ backgroundColor: t.pageBg }}>
      <div className="w-full max-w-md min-h-screen pb-16" style={{ backgroundColor: t.pageBg }}>
        <div className="sticky top-0 z-40 backdrop-blur-md border-b" style={{ backgroundColor: t.headerBg, borderColor: t.line }}>
          <div className="flex items-center gap-2 px-3 h-14" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
            <button
              type="button"
              onClick={() => navigate(id ? `/view/${id}` : "/")}
              aria-label="홈으로"
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-black/5 transition-colors shrink-0"
              style={{ color: t.ink }}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="font-extrabold text-[15px] flex-1 truncate" style={{ color: t.ink }}>목회 칼럼</h1>
          </div>
        </div>

        {id && <BulletinMenu bulletinId={id} churchLogo={bulletin?.churchLogo} variant="solid" accent={t.accent} pastoralColumnsEnabled={bulletin?.pastoralColumnsEnabled === true} officersEnabled={bulletin?.officersEnabled !== false} />}

        {loading ? (
          <div className="p-12 text-center font-bold text-sm" style={{ color: t.muted }}>불러오는 중…</div>
        ) : !bulletin ? (
          <div className="p-12 text-center font-bold text-sm" style={{ color: t.muted }}>주보를 찾을 수 없습니다.</div>
        ) : !show ? (
          <div className="p-12 text-center font-bold text-sm" style={{ color: t.muted }}>
            <Newspaper className="w-8 h-8 mx-auto mb-3 opacity-40" />
            아직 등록된 목회 칼럼이 없습니다.
          </div>
        ) : t.flat ? (
          /* 목록은 미리보기만 짧게 - 클릭하면 상세 화면(/view/:id/column/:columnId)으로 이동해서 전문을 본다 */
          <div className="px-6 py-7 animate-in fade-in duration-500">
            <div className="divide-y" style={{ borderColor: t.line }}>
              {columns.map((col) => (
                <button
                  key={col.id}
                  type="button"
                  onClick={() => navigate(`/view/${id}/column/${col.id}`)}
                  className="w-full text-left py-5 first:pt-0 last:pb-0 flex items-center gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold mb-1" style={{ color: t.muted }}>{col.date}{col.author ? ` · ${col.author}` : ""}</p>
                    <p className="font-black text-base mb-1 break-keep" style={{ color: t.ink }}>{col.title}</p>
                    <p className="text-xs leading-relaxed line-clamp-2 whitespace-pre-line break-keep" style={{ color: t.muted }}>{col.content}</p>
                  </div>
                  {col.imageUrl ? (
                    <img src={col.imageUrl} alt={col.title} className="w-16 h-16 rounded-xl object-cover shrink-0 border" style={{ borderColor: t.line }} />
                  ) : (
                    <ChevronRight className="w-4 h-4 shrink-0" style={{ color: t.muted }} />
                  )}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-3 animate-in fade-in duration-500">
            {columns.map((col) => (
              <button
                key={col.id}
                type="button"
                onClick={() => navigate(`/view/${id}/column/${col.id}`)}
                className="w-full text-left bg-white rounded-[1.5rem] border border-slate-100 shadow-sm overflow-hidden flex items-center gap-3 p-4"
              >
                {col.imageUrl && (
                  <img src={col.imageUrl} alt={col.title} className="w-16 h-16 rounded-xl object-cover shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-slate-400 font-bold mb-1">{col.date}{col.author ? ` · ${col.author}` : ""}</p>
                  <p className="font-extrabold text-slate-900 text-[15px] mb-1 break-keep">{col.title}</p>
                  <p className="text-slate-500 text-xs leading-relaxed line-clamp-2 whitespace-pre-line break-keep">{col.content}</p>
                </div>
                <ChevronRight className="w-4 h-4 shrink-0 text-slate-300" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
