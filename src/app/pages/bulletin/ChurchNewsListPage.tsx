import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router";
import { ArrowLeft, ChevronRight, Megaphone } from "lucide-react";
import { collection, query, where, orderBy, getDocs } from "firebase/firestore";
import { db } from "../../../firebase";
import { fetchPublishedBulletin } from "../../../utils/fetchPublishedBulletin";
import { BulletinMenu } from "./BulletinMenu";

// 메뉴 > 지난 교회 소식. 관리자 페이지 /admin/church-news와 같은 방식(각 주보 문서에
// 저장된 announcements를 authorId 기준으로 모아 날짜순 묶음)으로, 성도 화면에서도
// 지금 보고 있는 주보와 같은 교회의 지난 교회 소식을 모아 보여준다.
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

interface ChurchNewsGroup {
  bulletinId: string;
  date: string;
  announcements: Announcement[];
}

export function ChurchNewsListPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [bulletin, setBulletin] = useState<any>(null);
  const [groups, setGroups] = useState<ChurchNewsGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = id ? await fetchPublishedBulletin(id) : null;
      if (cancelled) return;
      setBulletin(data);
      if (data?.authorId) {
        try {
          // 새 주보를 발행하면 이전 published 주보는 자동으로 archived로 바뀌는 구조라,
          // "지난" 소식을 다 보여주려면 published(현재 라이브) + archived(과거에 라이브였던 것)를
          // 같이 봐야 한다. draft(발행된 적 없음)만 제외.
          const q = query(
            collection(db, "bulletins"),
            where("authorId", "==", data.authorId),
            where("status", "in", ["published", "archived"]),
            orderBy("date", "desc")
          );
          const qs = await getDocs(q);
          if (cancelled) return;
          const grouped: ChurchNewsGroup[] = [];
          qs.docs.forEach((doc) => {
            const d = doc.data();
            const announcements: Announcement[] = d.announcements || [];
            if (announcements.length === 0) return;
            grouped.push({ bulletinId: doc.id, date: d.date || "", announcements });
          });
          setGroups(grouped);
        } catch (e) {
          console.error("지난 교회 소식 조회 실패:", e);
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id]);

  const t = THEMES[bulletin?.bulletinTemplate as string] || THEMES.default;

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
            <h1 className="font-extrabold text-[15px] flex-1 truncate" style={{ color: t.ink }}>지난 교회 소식</h1>
          </div>
        </div>

        {id && <BulletinMenu bulletinId={id} churchLogo={bulletin?.churchLogo} variant="solid" accent={t.accent} pastoralColumnsEnabled={bulletin?.pastoralColumnsEnabled === true} officersEnabled={bulletin?.officersEnabled !== false} />}

        {loading ? (
          <div className="p-12 text-center font-bold text-sm" style={{ color: t.muted }}>불러오는 중…</div>
        ) : !bulletin ? (
          <div className="p-12 text-center font-bold text-sm" style={{ color: t.muted }}>주보를 찾을 수 없습니다.</div>
        ) : groups.length === 0 ? (
          <div className="p-12 text-center font-bold text-sm" style={{ color: t.muted }}>
            <Megaphone className="w-8 h-8 mx-auto mb-3 opacity-40" />
            아직 등록된 교회 소식이 없습니다.
          </div>
        ) : t.flat ? (
          <div className="px-6 py-7 animate-in fade-in duration-500">
            <div className="divide-y" style={{ borderColor: t.line }}>
              {groups.map((group) => (
                <button
                  key={group.bulletinId}
                  type="button"
                  onClick={() => navigate(`/view/${id}/church-news/${group.bulletinId}`)}
                  className="w-full text-left py-5 first:pt-0 last:pb-0 flex items-center gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold mb-1" style={{ color: t.muted }}>{group.date}</p>
                    <p className="font-black text-base mb-1 break-keep" style={{ color: t.ink }}>교회 소식</p>
                    <p className="text-xs leading-relaxed truncate break-keep" style={{ color: t.muted }}>
                      {group.announcements.map((a) => a.title || "제목 없음").join("  ·  ")}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 shrink-0" style={{ color: t.muted }} />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-3 animate-in fade-in duration-500">
            {groups.map((group) => (
              <button
                key={group.bulletinId}
                type="button"
                onClick={() => navigate(`/view/${id}/church-news/${group.bulletinId}`)}
                className="w-full text-left bg-white rounded-[1.5rem] border border-slate-100 shadow-sm overflow-hidden flex items-center gap-3 p-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-slate-400 font-bold mb-1">{group.date}</p>
                  <p className="font-extrabold text-slate-900 text-[15px] mb-1 break-keep">교회 소식</p>
                  <p className="text-slate-500 text-xs leading-relaxed truncate break-keep">
                    {group.announcements.map((a) => a.title || "제목 없음").join("  ·  ")}
                  </p>
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
