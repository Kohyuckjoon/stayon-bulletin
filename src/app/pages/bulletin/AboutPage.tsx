import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router";
import { ArrowLeft, Church } from "lucide-react";
import { fetchPublishedBulletin } from "../../../utils/fetchPublishedBulletin";
import { BulletinMenu } from "./BulletinMenu";

// 메뉴 > 소개. 관리자가 "교회 소개" 탭에서 쓴 교회 소개 글을 보여준다.
type Theme = { pageBg: string; headerBg: string; line: string; ink: string; muted: string; accent: string; label: string; flat: boolean };
const THEMES: Record<string, Theme> = {
  default: { pageBg: "#f1f5f9", headerBg: "rgba(241,245,249,0.92)", line: "#e2e8f0", ink: "#0f172a", muted: "#64748b", accent: "#2563eb", label: "#3b82f6", flat: false },
  // "모던 & 미니멀 디자인" 계열(커버형/오픈형) 둘 다 이 화면에서는 같은 아이보리 톤을 쓴다.
  "warm-ivory": { pageBg: "#FDFAF5", headerBg: "rgba(253,250,245,0.92)", line: "#EEE6D4", ink: "#1F241F", muted: "#8a8272", accent: "#2F5C52", label: "#B5924A", flat: true },
  "warm-ivory-open": { pageBg: "#FDFAF5", headerBg: "rgba(253,250,245,0.92)", line: "#EEE6D4", ink: "#1F241F", muted: "#8a8272", accent: "#2F5C52", label: "#B5924A", flat: true },
};

export function AboutPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [bulletin, setBulletin] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = id ? await fetchPublishedBulletin(id) : null;
      if (!cancelled) { setBulletin(data); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const t = THEMES[bulletin?.bulletinTemplate as string] || THEMES.default;
  const intro: string = bulletin?.churchIntroEnabled !== false ? (bulletin?.churchIntro || "") : "";
  const churchImage: string = bulletin?.churchImage || "";
  const vision: string = bulletin?.churchVisionEnabled !== false ? (bulletin?.churchVision || "") : "";
  const mission: string = bulletin?.churchMissionEnabled !== false ? (bulletin?.churchMission || "") : "";
  const show = intro.trim() !== "" || churchImage !== "" || vision.trim() !== "" || mission.trim() !== "";

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
            <h1 className="font-extrabold text-[15px] flex-1 truncate" style={{ color: t.ink }}>교회 소개</h1>
          </div>
        </div>

        {id && <BulletinMenu bulletinId={id} churchLogo={bulletin?.churchLogo} variant="solid" accent={t.accent} pastoralColumnsEnabled={bulletin?.pastoralColumnsEnabled !== false} />}

        {loading ? (
          <div className="p-12 text-center font-bold text-sm" style={{ color: t.muted }}>불러오는 중…</div>
        ) : !bulletin ? (
          <div className="p-12 text-center font-bold text-sm" style={{ color: t.muted }}>주보를 찾을 수 없습니다.</div>
        ) : !show ? (
          <div className="p-12 text-center font-bold text-sm" style={{ color: t.muted }}>
            <Church className="w-8 h-8 mx-auto mb-3 opacity-40" />
            아직 등록된 교회 소개가 없습니다.
          </div>
        ) : (
          <div className={`animate-in fade-in duration-500 ${t.flat ? "px-6 py-8" : "p-4"}`}>
            {/* 1. 로고 */}
            {bulletin.churchLogoEnabled !== false && bulletin.churchLogo && (
              <div className="flex justify-center pb-5 mb-5 border-b" style={{ borderColor: t.line }}>
                <img src={bulletin.churchLogo} alt="교회 로고" className="max-h-16 w-auto max-w-[220px] object-contain" />
              </div>
            )}
            {/* 2. 교회 사진 (세로형) */}
            {churchImage && (
              <div className="w-full rounded-2xl overflow-hidden border mb-6" style={{ borderColor: t.line }}>
                <img src={churchImage} alt="교회 이미지" className="w-full h-auto object-cover" />
              </div>
            )}
            {/* 3. ABOUT 소개글 */}
            {intro.trim() !== "" && (
              <>
                <p className="text-[10px] font-black tracking-[0.22em] uppercase mb-2" style={{ color: t.label }}>About</p>
                <p className="text-[15px] sm:text-base leading-[1.9] whitespace-pre-line break-keep" style={{ color: t.ink }}>
                  {intro}
                </p>
              </>
            )}
            {/* 4. 교회 비전 */}
            {vision.trim() !== "" && (
              <div className={intro.trim() !== "" ? "mt-8 pt-6 border-t" : ""} style={{ borderColor: t.line }}>
                <p className="text-[10px] font-black tracking-[0.22em] uppercase mb-2" style={{ color: t.label }}>Vision</p>
                <p className="text-[15px] sm:text-base leading-[1.9] whitespace-pre-line break-keep" style={{ color: t.ink }}>
                  {vision}
                </p>
              </div>
            )}
            {/* 5. 교회 사명 */}
            {mission.trim() !== "" && (
              <div className={intro.trim() !== "" || vision.trim() !== "" ? "mt-8 pt-6 border-t" : ""} style={{ borderColor: t.line }}>
                <p className="text-[10px] font-black tracking-[0.22em] uppercase mb-2" style={{ color: t.label }}>Mission</p>
                <p className="text-[15px] sm:text-base leading-[1.9] whitespace-pre-line break-keep" style={{ color: t.ink }}>
                  {mission}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
