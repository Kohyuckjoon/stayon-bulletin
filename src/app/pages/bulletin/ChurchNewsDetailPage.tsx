import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router";
import { ArrowLeft, Megaphone } from "lucide-react";
import { fetchPublishedBulletin } from "../../../utils/fetchPublishedBulletin";
import { BulletinMenu } from "./BulletinMenu";

// 목회 칼럼 목록/상세와 동일한 구조 - 지난 교회 소식 목록(ChurchNewsListPage)에서 한 주보를
// 클릭했을 때, 그 주보의 교회 소식 전문을 번호 매긴 텍스트로 보여주는 상세 화면.
type Theme = { pageBg: string; headerBg: string; line: string; ink: string; muted: string; accent: string; label: string; flat: boolean };
const THEMES: Record<string, Theme> = {
  default: { pageBg: "#f1f5f9", headerBg: "rgba(241,245,249,0.92)", line: "#e2e8f0", ink: "#0f172a", muted: "#64748b", accent: "#2563eb", label: "#3b82f6", flat: false },
  "warm-ivory": { pageBg: "#FDFAF5", headerBg: "rgba(253,250,245,0.92)", line: "#EEE6D4", ink: "#1F241F", muted: "#8a8272", accent: "#2F5C52", label: "#B5924A", flat: true },
  "warm-ivory-open": { pageBg: "#FDFAF5", headerBg: "rgba(253,250,245,0.92)", line: "#EEE6D4", ink: "#1F241F", muted: "#8a8272", accent: "#2F5C52", label: "#B5924A", flat: true },
};

interface Announcement {
  id: string;
  title: string;
  content: string;
}

export function ChurchNewsDetailPage() {
  const { id, newsId } = useParams();
  const navigate = useNavigate();
  const [bulletin, setBulletin] = useState<any>(null);
  const [newsDate, setNewsDate] = useState("");
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [data, newsBulletin] = await Promise.all([
        id ? fetchPublishedBulletin(id) : Promise.resolve(null),
        newsId ? fetchPublishedBulletin(newsId) : Promise.resolve(null),
      ]);
      if (cancelled) return;
      setBulletin(data);
      if (newsBulletin) {
        setNewsDate(newsBulletin.date || "");
        setAnnouncements(newsBulletin.announcements || []);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id, newsId]);

  const t = THEMES[bulletin?.bulletinTemplate as string] || THEMES.default;

  return (
    <div className="min-h-screen flex flex-col items-center font-sans animate-in fade-in duration-700" style={{ backgroundColor: t.pageBg }}>
      <div className="w-full max-w-md min-h-screen pb-16" style={{ backgroundColor: t.pageBg }}>
        <div className="sticky top-0 z-40 backdrop-blur-md border-b" style={{ backgroundColor: t.headerBg, borderColor: t.line }}>
          <div className="flex items-center gap-2 px-3 h-14" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
            <button
              type="button"
              onClick={() => navigate(id ? `/view/${id}/church-news` : "/")}
              aria-label="목록으로"
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-black/5 transition-colors shrink-0"
              style={{ color: t.ink }}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="font-extrabold text-[15px] flex-1 truncate" style={{ color: t.ink }}>교회 소식</h1>
          </div>
        </div>

        {id && <BulletinMenu bulletinId={id} churchLogo={bulletin?.churchLogo} variant="solid" accent={t.accent} pastoralColumnsEnabled={bulletin?.pastoralColumnsEnabled === true} officersEnabled={bulletin?.officersEnabled !== false} />}

        {loading ? (
          <div className="p-12 text-center font-bold text-sm" style={{ color: t.muted }}>불러오는 중…</div>
        ) : announcements.length === 0 ? (
          <div className="p-12 text-center font-bold text-sm" style={{ color: t.muted }}>
            <Megaphone className="w-8 h-8 mx-auto mb-3 opacity-40" />
            교회 소식을 찾을 수 없습니다.
          </div>
        ) : (
          <div className={`animate-in fade-in duration-500 ${t.flat ? "px-6 py-8" : "p-4"}`}>
            <p className="text-[11px] font-bold mb-4" style={{ color: t.muted }}>{newsDate}</p>
            <ol className="space-y-4 list-decimal list-outside pl-5" style={{ color: t.ink }}>
              {announcements.map((a) => (
                <li key={a.id} className="leading-relaxed break-keep">
                  {a.title && <span className="font-bold">{a.title}</span>}
                  {a.title && a.content && " : "}
                  {a.content && <span className="whitespace-pre-line">{a.content}</span>}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
