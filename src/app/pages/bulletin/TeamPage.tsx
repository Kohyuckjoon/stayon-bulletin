import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router";
import { ArrowLeft, ChevronRight, Users } from "lucide-react";
import { fetchPublishedBulletin } from "../../../utils/fetchPublishedBulletin";
import { BulletinMenu } from "./BulletinMenu";
import { MinisterDetailModal } from "./MinisterDetailModal";

// 메뉴 > 섬기시는 분. 담임 목사(토글) + 부교역자 리스트.
// 적용된 커스텀 디자인 템플릿에 맞춰 색/레이아웃을 바꾼다(현재: 기본 / 아이보리).
// TODO(유료화 이후): 저장된 bulletinTemplate 대신 resolveEffectiveTemplateId 값으로 판정.

type TeamTheme = {
  pageBg: string;
  headerBg: string;
  line: string;
  ink: string;
  muted: string;
  accent: string;
  label: string;
  flat: boolean;
};

const THEMES: Record<string, TeamTheme> = {
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

export function TeamPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [bulletin, setBulletin] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);

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

  const ministerPhoto = (m: any) =>
    (typeof m?.photoUrl === "string" && m.photoUrl.trim() !== "" ? m.photoUrl : null) ||
    (typeof m?.photoURL === "string" && m.photoURL.trim() !== "" ? m.photoURL : null) ||
    (typeof m?.photoUrL === "string" && m.photoUrL.trim() !== "" ? m.photoUrL : null);

  const senior =
    bulletin?.seniorPastorEnabled !== false && bulletin?.seniorPastor?.name ? bulletin.seniorPastor : null;
  // 이름 없는 빈 항목(입력 안 한 기본 행 등)은 표시하지 않는다 - 예전에 발행된 주보에
  // 이미 빈 행이 저장돼 있어도 여기서 걸러지도록 화면 단에서도 한 번 더 필터링.
  const associates: any[] =
    bulletin?.ministersEnabled !== false && Array.isArray(bulletin?.ministers)
      ? bulletin.ministers.filter((m: any) => m?.name && String(m.name).trim() !== "")
      : [];

  const SectionLabel = ({ en, ko }: { en: string; ko: string }) => (
    <div className="mb-3 px-1">
      <p className="text-[10px] font-black tracking-[0.22em] uppercase" style={{ color: t.label }}>{en}</p>
      <h2 className="text-lg font-black mt-0.5" style={{ color: t.ink }}>{ko}</h2>
    </div>
  );

  const DetailLink = () => (
    <span className="inline-flex items-center gap-0.5 text-xs font-bold mt-2" style={{ color: t.accent }}>
      자세히보기 <ChevronRight className="w-3 h-3" />
    </span>
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
            <h1 className="font-extrabold text-[15px] flex-1 truncate" style={{ color: t.ink }}>섬기시는 분</h1>
          </div>
        </div>

        {id && <BulletinMenu bulletinId={id} churchLogo={bulletin?.churchLogo} variant="solid" accent={t.accent} pastoralColumnsEnabled={bulletin?.pastoralColumnsEnabled !== false} />}

        {loading ? (
          <div className="p-12 text-center font-bold text-sm" style={{ color: t.muted }}>불러오는 중…</div>
        ) : !bulletin ? (
          <div className="p-12 text-center font-bold text-sm" style={{ color: t.muted }}>주보를 찾을 수 없습니다.</div>
        ) : !senior && associates.length === 0 ? (
          <div className="p-12 text-center font-bold text-sm" style={{ color: t.muted }}>
            <Users className="w-8 h-8 mx-auto mb-3 opacity-40" />
            아직 등록된 섬기는 분이 없습니다.
          </div>
        ) : t.flat ? (
          /* ── 아이보리(평평) 레이아웃 ── */
          <div className="animate-in fade-in duration-500">
            {senior && (
              <div className="px-6 py-7 border-b-2" style={{ borderColor: t.line }}>
                <SectionLabel en="Senior Pastor" ko="담임 목사" />
                <button type="button" onClick={() => setSelected(senior)} className="w-full text-left group">
                  {ministerPhoto(senior) && (
                    <div className="w-full aspect-[4/3] rounded-xl overflow-hidden border mb-3" style={{ borderColor: t.line }}>
                      <img src={ministerPhoto(senior)} alt={senior.name} className="w-full h-full object-cover" />
                    </div>
                  )}
                  {senior.role && <span className="text-xs font-bold" style={{ color: t.muted }}>{senior.role}</span>}
                  <h3 className="text-xl font-black tracking-tight mt-0.5" style={{ color: t.ink }}>{senior.name}</h3>
                  {senior.description && (
                    <p className="text-[13px] mt-2 leading-relaxed whitespace-pre-line break-keep line-clamp-3" style={{ color: t.muted }}>
                      {senior.description}
                    </p>
                  )}
                  <DetailLink />
                </button>
              </div>
            )}

            {associates.length > 0 && (
              <div className="px-6 py-7">
                <SectionLabel en="Our Team" ko="섬기는 사람들" />
                <div className="divide-y" style={{ borderColor: t.line }}>
                  {associates.map((m: any, i: number) => (
                    <button
                      key={m?.id || i}
                      type="button"
                      onClick={() => setSelected(m)}
                      className="w-full text-left py-4 first:pt-0 last:pb-0 flex items-center justify-between gap-4 group"
                      style={{ borderColor: t.line }}
                    >
                      <div className="min-w-0 flex-1">
                        <h4 className="font-black text-[15px] break-keep" style={{ color: t.ink }}>
                          {m?.name || "이름 없음"}
                          {m?.role && <span className="font-bold" style={{ color: t.muted }}> {m.role}</span>}
                        </h4>
                        {m?.description && (
                          <p className="text-xs mt-1.5 leading-relaxed line-clamp-2 whitespace-pre-line break-keep" style={{ color: t.muted }}>
                            {m.description}
                          </p>
                        )}
                        <DetailLink />
                      </div>
                      {ministerPhoto(m) && (
                        <img src={ministerPhoto(m)} alt={m?.name || "섬기는분"} className="w-20 h-24 rounded-xl object-cover shrink-0 border" style={{ borderColor: t.line }} />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ── 기본(카드) 레이아웃 ── */
          <div className="p-4 space-y-8 animate-in fade-in duration-500">
            {senior && (
              <section>
                <SectionLabel en="Senior Pastor" ko="담임 목사" />
                <button
                  type="button"
                  onClick={() => setSelected(senior)}
                  className="w-full text-left bg-white rounded-[1.5rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col group"
                >
                  {ministerPhoto(senior) && (
                    <div className="w-full aspect-[4/3] bg-slate-100">
                      <img src={ministerPhoto(senior)} alt={senior.name} className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="p-5">
                    {senior.role && <span className="text-xs font-bold text-amber-800/70 tracking-wide">{senior.role}</span>}
                    <h3 className="text-xl font-extrabold text-slate-900 tracking-tight mt-0.5">{senior.name}</h3>
                    {senior.description && (
                      <p className="text-slate-500 text-[13px] mt-2 leading-relaxed whitespace-pre-line break-keep line-clamp-3">
                        {senior.description}
                      </p>
                    )}
                    <DetailLink />
                  </div>
                </button>
              </section>
            )}

            {associates.length > 0 && (
              <section>
                <SectionLabel en="Our Team" ko="섬기는 사람들" />
                <div className="bg-white rounded-[1.5rem] p-4 border border-slate-100 shadow-sm divide-y divide-slate-100">
                  {associates.map((m: any, i: number) => (
                    <button
                      key={m?.id || i}
                      type="button"
                      onClick={() => setSelected(m)}
                      className="w-full text-left py-4 first:pt-0 last:pb-0 flex items-center justify-between gap-4 group"
                    >
                      <div className="min-w-0 flex-1">
                        <h4 className="font-extrabold text-slate-900 text-[15px] leading-snug break-keep">
                          {m?.name || "이름 없음"}
                          {m?.role && <span className="text-slate-400"> {m.role}</span>}
                        </h4>
                        {m?.description && (
                          <p className="text-slate-500 text-xs mt-1.5 leading-relaxed line-clamp-2 whitespace-pre-line break-keep">
                            {m.description}
                          </p>
                        )}
                        <DetailLink />
                      </div>
                      {ministerPhoto(m) && (
                        <img
                          src={ministerPhoto(m)}
                          alt={m?.name || "섬기는분"}
                          className="w-20 h-24 rounded-xl object-cover shrink-0 border border-slate-100 shadow-sm"
                        />
                      )}
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {selected && <MinisterDetailModal minister={selected} onClose={() => setSelected(null)} accent={t.accent} />}
    </div>
  );
}
