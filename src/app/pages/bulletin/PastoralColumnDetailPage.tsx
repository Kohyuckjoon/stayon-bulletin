import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router";
import { ArrowLeft, Newspaper } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../../firebase";
import { fetchPublishedBulletin } from "../../../utils/fetchPublishedBulletin";
import { getPastoralColumn, type PastoralColumn } from "../../../utils/pastoralColumns";
import { hasTierOrAbove } from "../../../utils/subscriptionTier";
import { BulletinMenu } from "./BulletinMenu";

// 목회 칼럼 목록/하단 미리보기에서 항목을 눌렀을 때 넘어오는 상세 화면 - 내용이 길어도
// 잘리지 않고 전문이 다 보인다. 목록(PastoralColumnListPage)/하단 섹션은 미리보기만 짧게 보여주고
// 실제 전문은 여기서만 보여주는 구조.
type Theme = { pageBg: string; headerBg: string; line: string; ink: string; muted: string; accent: string; label: string; flat: boolean };
const THEMES: Record<string, Theme> = {
  default: { pageBg: "#f1f5f9", headerBg: "rgba(241,245,249,0.92)", line: "#e2e8f0", ink: "#0f172a", muted: "#64748b", accent: "#2563eb", label: "#3b82f6", flat: false },
  "warm-ivory": { pageBg: "#FDFAF5", headerBg: "rgba(253,250,245,0.92)", line: "#EEE6D4", ink: "#1F241F", muted: "#8a8272", accent: "#2F5C52", label: "#B5924A", flat: true },
  "warm-ivory-open": { pageBg: "#FDFAF5", headerBg: "rgba(253,250,245,0.92)", line: "#EEE6D4", ink: "#1F241F", muted: "#8a8272", accent: "#2F5C52", label: "#B5924A", flat: true },
};

export function PastoralColumnDetailPage() {
  const { id, columnId } = useParams();
  const navigate = useNavigate();
  const [bulletin, setBulletin] = useState<any>(null);
  const [column, setColumn] = useState<PastoralColumn | null>(null);
  const [entitled, setEntitled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [data, col] = await Promise.all([
        id ? fetchPublishedBulletin(id) : Promise.resolve(null),
        columnId ? getPastoralColumn(columnId) : Promise.resolve(null),
      ]);
      if (cancelled) return;
      setBulletin(data);
      setColumn(col);
      if (col?.authorId) {
        try {
          const uSnap = await getDoc(doc(db, "users", col.authorId));
          const status = uSnap.exists() ? (uSnap.data() as { status?: string })?.status : undefined;
          if (!cancelled) setEntitled(hasTierOrAbove(status, "pro"));
        } catch {
          if (!cancelled) setEntitled(false);
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id, columnId]);

  const t = THEMES[bulletin?.bulletinTemplate as string] || THEMES.default;
  const show = entitled && !!column;

  return (
    <div className="min-h-screen flex flex-col items-center font-sans animate-in fade-in duration-700" style={{ backgroundColor: t.pageBg }}>
      <div className="w-full max-w-md min-h-screen pb-16" style={{ backgroundColor: t.pageBg }}>
        <div className="sticky top-0 z-40 backdrop-blur-md border-b" style={{ backgroundColor: t.headerBg, borderColor: t.line }}>
          <div className="flex items-center gap-2 px-3 h-14" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
            <button
              type="button"
              onClick={() => navigate(id ? `/view/${id}/column` : "/")}
              aria-label="목록으로"
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
        ) : !show ? (
          <div className="p-12 text-center font-bold text-sm" style={{ color: t.muted }}>
            <Newspaper className="w-8 h-8 mx-auto mb-3 opacity-40" />
            글을 찾을 수 없습니다.
          </div>
        ) : (
          <div className={`animate-in fade-in duration-500 ${t.flat ? "px-6 py-8" : "p-4"}`}>
            <p className="text-[11px] font-bold mb-2" style={{ color: t.muted }}>
              {column!.date}{column!.author ? ` · ${column!.author}` : ""}
            </p>
            <h2 className="text-xl font-black leading-snug break-keep mb-5" style={{ color: t.ink }}>
              {column!.title}
            </h2>
            {column!.imageUrl && (
              <div className="w-full rounded-2xl overflow-hidden border mb-5" style={{ borderColor: t.line }}>
                <img src={column!.imageUrl} alt={column!.title} className="w-full h-auto object-cover" />
              </div>
            )}
            <p className="text-[15px] leading-[1.9] whitespace-pre-line break-keep" style={{ color: t.ink }}>
              {column!.content}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
