import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router";
import { ArrowLeft, Landmark } from "lucide-react";
import { fetchPublishedBulletin } from "../../../utils/fetchPublishedBulletin";
import { BulletinMenu } from "./BulletinMenu";

// 메뉴 > 섬기시는 분 > 중직자. 장로/권사/안수집사 등을 담당 업무와 함께 리스트로 보여준다.
// TeamPage.tsx의 "섬기는 사람들"(부교역자) 리스트와 생김새는 동일하게 가져오되, "자세히보기"
// 링크 대신 담당 업무 텍스트를 바로 보여준다 — 별도 상세 팝업은 없다.
// 적용된 커스텀 디자인 템플릿에 맞춰 색/레이아웃을 바꾼다(현재: 기본 / 아이보리 커버형·오픈형).

type OfficersTheme = {
  pageBg: string;
  headerBg: string;
  line: string;
  ink: string;
  muted: string;
  accent: string;
  label: string;
  flat: boolean;
};

const THEMES: Record<string, OfficersTheme> = {
  default: {
    pageBg: "#f1f5f9",
    headerBg: "rgba(241,245,249,0.92)",
    line: "#e2e8f0",
    ink: "#0f172a",
    muted: "#64748b",
    accent: "#2563eb",
    label: "#3b82f6",
    flat: false,
  },
  "warm-ivory": {
    pageBg: "#FDFAF5",
    headerBg: "rgba(253,250,245,0.92)",
    line: "#EEE6D4",
    ink: "#1F241F",
    muted: "#8a8272",
    accent: "#2F5C52",
    label: "#B5924A",
    flat: true,
  },
  // "모던 & 미니멀 디자인" 계열(커버형/오픈형) 둘 다 이 화면에서는 같은 아이보리 톤을 쓴다.
  "warm-ivory-open": {
    pageBg: "#FDFAF5",
    headerBg: "rgba(253,250,245,0.92)",
    line: "#EEE6D4",
    ink: "#1F241F",
    muted: "#8a8272",
    accent: "#2F5C52",
    label: "#B5924A",
    flat: true,
  },
};

export function OfficersPage() {
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

  const officerPhoto = (o: any) =>
    typeof o?.photoUrl === "string" && o.photoUrl.trim() !== "" ? o.photoUrl : null;

  // 이름 없는 빈 행(입력 안 한 기본 행 등)은 표시하지 않는다 - 화면 단에서도 한 번 더 필터링.
  const officers: any[] =
    bulletin?.officersEnabled !== false && Array.isArray(bulletin?.officers)
      ? bulletin.officers.filter((o: any) => o?.name && String(o.name).trim() !== "")
      : [];

  const SectionLabel = () => (
    <div className="mb-8 px-1">
      <p className="text-[10px] font-black tracking-[0.22em] uppercase" style={{ color: t.label }}>CHURCH OFFICERS</p>
      <h2 className="text-lg font-black mt-0.5" style={{ color: t.ink }}>중직자</h2>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col items-center font-sans animate-in fade-in duration-700" style={{ backgroundColor: t.pageBg }}>
      <div className="w-full max-w-md min-h-screen pb-16" style={{ backgroundColor: t.pageBg }}>
        {/* 헤더 */}
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
            <h1 className="font-extrabold text-[15px] flex-1 truncate" style={{ color: t.ink }}>중직자</h1>
          </div>
        </div>

        {id && <BulletinMenu bulletinId={id} churchLogo={bulletin?.churchLogo} variant="solid" accent={t.accent} pastoralColumnsEnabled={bulletin?.pastoralColumnsEnabled === true} officersEnabled={bulletin?.officersEnabled !== false} />}

        {loading ? (
          <div className="p-12 text-center font-bold text-sm" style={{ color: t.muted }}>불러오는 중…</div>
        ) : !bulletin ? (
          <div className="p-12 text-center font-bold text-sm" style={{ color: t.muted }}>주보를 찾을 수 없습니다.</div>
        ) : officers.length === 0 ? (
          <div className="p-12 text-center font-bold text-sm" style={{ color: t.muted }}>
            <Landmark className="w-8 h-8 mx-auto mb-3 opacity-40" />
            아직 등록된 중직자가 없습니다.
          </div>
        ) : t.flat ? (
          /* ── 아이보리(평평) 레이아웃 ── */
          <div className="px-6 py-7 animate-in fade-in duration-500">
            <SectionLabel />
            <div className="divide-y" style={{ borderColor: t.line }}>
              {officers.map((o: any, i: number) => (
                <div
                  key={o?.id || i}
                  className="w-full text-left px-1 py-4 first:pt-0 last:pb-0 flex items-center justify-between gap-4"
                  style={{ borderColor: t.line }}
                >
                  <div className="min-w-0 flex-1">
                    <h4 className="font-black text-[15px] break-keep" style={{ color: t.ink }}>
                      {o?.name || "이름 없음"}
                      {o?.position && <span className="font-bold" style={{ color: t.muted }}> {o.position}</span>}
                    </h4>
                    {o?.duty && String(o.duty).trim() !== "" && (
                      <p className="text-xs mt-1.5 font-bold" style={{ color: t.accent }}>{o.duty}</p>
                    )}
                  </div>
                  {officerPhoto(o) && (
                    <img src={officerPhoto(o)!} alt={o?.name || "중직자"} className="w-20 h-24 rounded-xl object-cover shrink-0 border" style={{ borderColor: t.line }} />
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* ── 기본(카드) 레이아웃 ── */
          <div className="p-4 animate-in fade-in duration-500">
            <section>
              <SectionLabel />
              <div className="bg-white rounded-[1.5rem] p-4 border border-slate-100 shadow-sm divide-y divide-slate-100">
                {officers.map((o: any, i: number) => (
                  <div
                    key={o?.id || i}
                    className="w-full text-left py-4 first:pt-0 last:pb-0 flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0 flex-1">
                      <h4 className="font-extrabold text-slate-900 text-[15px] leading-snug break-keep">
                        {o?.name || "이름 없음"}
                        {o?.position && <span className="text-slate-400"> {o.position}</span>}
                      </h4>
                      {o?.duty && String(o.duty).trim() !== "" && (
                        <p className="text-blue-600 text-xs mt-1.5 font-bold">{o.duty}</p>
                      )}
                    </div>
                    {officerPhoto(o) && (
                      <img
                        src={officerPhoto(o)!}
                        alt={o?.name || "중직자"}
                        className="w-20 h-24 rounded-xl object-cover shrink-0 border border-slate-100 shadow-sm"
                      />
                    )}
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
