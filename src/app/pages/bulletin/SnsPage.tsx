import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router";
import { ArrowLeft, BookOpen, Instagram, AtSign, Youtube, ChevronRight, Share2 } from "lucide-react";
import { fetchPublishedBulletin } from "../../../utils/fetchPublishedBulletin";
import { BulletinMenu } from "./BulletinMenu";

// 메뉴 > 교회 SNS · 유튜브. LocationPage.tsx와 동일한 패턴(독립 라우트, 자체 데이터
// 로딩, 템플릿별 테마)으로 만들었다. 각 SNS 링크는 비워두면 그 항목만 안 보이고,
// 전부 비어있으면 안내 문구만 보여준다.

type Theme = { pageBg: string; headerBg: string; line: string; ink: string; muted: string; accent: string; label: string; cardBg: string; flat: boolean };

const THEMES: Record<string, Theme> = {
  default: { pageBg: "#f1f5f9", headerBg: "rgba(241,245,249,0.92)", line: "#e2e8f0", ink: "#0f172a", muted: "#64748b", accent: "#2563eb", label: "#3b82f6", cardBg: "#ffffff", flat: false },
  "warm-ivory": { pageBg: "#FDFAF5", headerBg: "rgba(253,250,245,0.92)", line: "#EEE6D4", ink: "#1F241F", muted: "#8a8272", accent: "#2F5C52", label: "#B5924A", cardBg: "#ffffff", flat: true },
  "warm-ivory-open": { pageBg: "#FDFAF5", headerBg: "rgba(253,250,245,0.92)", line: "#EEE6D4", ink: "#1F241F", muted: "#8a8272", accent: "#2F5C52", label: "#B5924A", cardBg: "#ffffff", flat: true },
};

function normalizeLink(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
}

export function SnsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [bulletin, setBulletin] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = id ? await fetchPublishedBulletin(id) : null;
      if (!cancelled) {
        setBulletin(data);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const t = THEMES[bulletin?.bulletinTemplate as string] || THEMES.default;

  const show = bulletin?.snsEnabled !== false;
  const links = [
    { key: "naverBlog", label: "네이버 블로그", url: normalizeLink(bulletin?.snsNaverBlog || ""), icon: BookOpen, color: "#03C75A" },
    { key: "instagram", label: "인스타그램", url: normalizeLink(bulletin?.snsInstagram || ""), icon: Instagram, color: "#E1306C" },
    { key: "threads", label: "쓰레드", url: normalizeLink(bulletin?.snsThreads || ""), icon: AtSign, color: "#111111" },
  ].filter((l) => l.url);
  const youtubeUrl = normalizeLink(bulletin?.youtubeChannelUrl || "");
  const hasAny = links.length > 0 || !!youtubeUrl;

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
            <h1 className="font-extrabold text-[15px] flex-1 truncate" style={{ color: t.ink }}>교회 SNS · 유튜브</h1>
          </div>
        </div>

        {id && <BulletinMenu bulletinId={id} churchLogo={bulletin?.churchLogo} variant="solid" accent={t.accent} pastoralColumnsEnabled={bulletin?.pastoralColumnsEnabled === true} officersEnabled={bulletin?.officersEnabled !== false} snsEnabled={bulletin?.snsEnabled !== false} />}

        {loading ? (
          <div className="p-12 text-center font-bold text-sm" style={{ color: t.muted }}>불러오는 중…</div>
        ) : !bulletin ? (
          <div className="p-12 text-center font-bold text-sm" style={{ color: t.muted }}>주보를 찾을 수 없습니다.</div>
        ) : !show || !hasAny ? (
          <div className="p-12 text-center font-bold text-sm" style={{ color: t.muted }}>
            <Share2 className="w-8 h-8 mx-auto mb-3 opacity-40" />
            등록된 SNS·유튜브 채널이 없습니다.
          </div>
        ) : (
          <div className={`animate-in fade-in duration-500 ${t.flat ? "px-6 py-7" : "p-4"}`}>
            <div className="mb-3 px-1">
              <p className="text-[10px] font-black tracking-[0.22em] uppercase" style={{ color: t.label }}>Channels</p>
              <h2 className="text-lg font-black mt-0.5" style={{ color: t.ink }}>교회 SNS · 유튜브</h2>
            </div>

            <div className="space-y-2.5">
              {youtubeUrl && (
                <a
                  href={youtubeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 rounded-2xl border active:scale-[0.98] transition-all"
                  style={{ backgroundColor: t.cardBg, borderColor: t.line }}
                >
                  {bulletin.youtubeChannelThumbnail ? (
                    <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 bg-slate-100">
                      <img src={bulletin.youtubeChannelThumbnail} alt="유튜브 채널 썸네일" className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-red-50">
                      <Youtube className="w-6 h-6 text-red-500" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: "#EF4444" }}>YouTube</p>
                    <p className="text-sm font-bold truncate" style={{ color: t.ink }}>
                      {bulletin.youtubeChannelName || "유튜브 채널"}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 shrink-0" style={{ color: t.muted }} />
                </a>
              )}

              {links.map((link) => {
                const Icon = link.icon;
                return (
                  <a
                    key={link.key}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 rounded-2xl border active:scale-[0.98] transition-all"
                    style={{ backgroundColor: t.cardBg, borderColor: t.line }}
                  >
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${link.color}1A` }}>
                      <Icon className="w-5 h-5" style={{ color: link.color }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold truncate" style={{ color: t.ink }}>{link.label}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 shrink-0" style={{ color: t.muted }} />
                  </a>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
