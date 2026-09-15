import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router";
import { ArrowLeft, MapPin, Navigation, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { fetchPublishedBulletin } from "../../../utils/fetchPublishedBulletin";
import { BulletinMenu } from "./BulletinMenu";

// 메뉴 > 오시는 길. BulletinView 메인에 있던 "오시는 길" 섹션을 별도 화면으로 옮긴 것.
// 적용된 커스텀 디자인 템플릿(현재: 기본 / 아이보리)에 맞춰 색을 바꾼다.

type Theme = { pageBg: string; headerBg: string; line: string; ink: string; muted: string; accent: string; label: string; flat: boolean };

const THEMES: Record<string, Theme> = {
  default: { pageBg: "#f1f5f9", headerBg: "rgba(241,245,249,0.92)", line: "#e2e8f0", ink: "#0f172a", muted: "#64748b", accent: "#2563eb", label: "#3b82f6", flat: false },
  // "모던 & 미니멀 디자인" 계열(커버형/오픈형) 둘 다 이 화면에서는 같은 아이보리 톤을 쓴다.
  "warm-ivory": { pageBg: "#FDFAF5", headerBg: "rgba(253,250,245,0.92)", line: "#EEE6D4", ink: "#1F241F", muted: "#8a8272", accent: "#2F5C52", label: "#B5924A", flat: true },
  "warm-ivory-open": { pageBg: "#FDFAF5", headerBg: "rgba(253,250,245,0.92)", line: "#EEE6D4", ink: "#1F241F", muted: "#8a8272", accent: "#2F5C52", label: "#B5924A", flat: true },
};

export function LocationPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [bulletin, setBulletin] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

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

  const address = bulletin?.churchAddress
    ? `${bulletin.churchAddress}${bulletin.churchAddressDetail ? ` ${bulletin.churchAddressDetail}` : ""}`.trim()
    : "";
  const naverMapUrl = `https://map.naver.com/p/search/${encodeURIComponent(address)}`;
  const show = bulletin?.addressEnabled !== false && !!bulletin?.churchAddress;

  const copyAddress = () => {
    if (!address) return;
    const done = () => { setCopied(true); toast.success("주소가 복사되었습니다."); setTimeout(() => setCopied(false), 1500); };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(address).then(done).catch(() => {});
    } else {
      const ta = document.createElement("textarea");
      ta.value = address; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); done(); } catch {}
      document.body.removeChild(ta);
    }
  };

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
            <h1 className="font-extrabold text-[15px] flex-1 truncate" style={{ color: t.ink }}>오시는 길</h1>
          </div>
        </div>

        {id && <BulletinMenu bulletinId={id} churchLogo={bulletin?.churchLogo} variant="solid" accent={t.accent} pastoralColumnsEnabled={bulletin?.pastoralColumnsEnabled === true} officersEnabled={bulletin?.officersEnabled !== false} />}

        {loading ? (
          <div className="p-12 text-center font-bold text-sm" style={{ color: t.muted }}>불러오는 중…</div>
        ) : !bulletin ? (
          <div className="p-12 text-center font-bold text-sm" style={{ color: t.muted }}>주보를 찾을 수 없습니다.</div>
        ) : !show ? (
          <div className="p-12 text-center font-bold text-sm" style={{ color: t.muted }}>
            <MapPin className="w-8 h-8 mx-auto mb-3 opacity-40" />
            등록된 위치 안내가 없습니다.
          </div>
        ) : (
          <div className={`animate-in fade-in duration-500 ${t.flat ? "px-6 py-7" : "p-4"}`}>
            <div className="mb-3 px-1">
              <p className="text-[10px] font-black tracking-[0.22em] uppercase" style={{ color: t.label }}>Location</p>
              <h2 className="text-lg font-black mt-0.5" style={{ color: t.ink }}>오시는 길</h2>
            </div>

            <div className={t.flat ? "" : "bg-white rounded-[1.5rem] p-4 border border-slate-100 shadow-sm"}>
              {bulletin.locationImage && (
                <a
                  href={naverMapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`block w-full rounded-xl overflow-hidden border mb-3 active:scale-[0.98] transition-transform ${bulletin.locationImageRatio === "1:1" ? "aspect-square" : "aspect-[4/3]"}`}
                  style={{ borderColor: t.line }}
                >
                  <img src={bulletin.locationImage} alt="오시는 길 안내 이미지" className="w-full h-full object-cover" />
                </a>
              )}

              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-bold leading-relaxed break-keep flex-1 min-w-0" style={{ color: t.ink }}>
                  {bulletin.churchAddress}
                  {bulletin.churchAddressDetail && (
                    <span className="font-medium" style={{ color: t.muted }}> {bulletin.churchAddressDetail}</span>
                  )}
                </p>
                <button
                  type="button"
                  onClick={copyAddress}
                  className="shrink-0 flex items-center gap-1 text-[11px] font-bold mt-0.5 transition-colors"
                  style={{ color: copied ? t.accent : t.muted }}
                >
                  {copied ? <Check className="w-3 h-3 stroke-[2.5]" /> : <Copy className="w-3 h-3" />}
                  {copied ? "복사됨" : "주소 복사"}
                </button>
              </div>

              <a
                href={naverMapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 w-full flex items-center justify-center gap-2 h-11 rounded-xl text-white text-sm font-bold active:scale-[0.98] transition-all"
                style={{ backgroundColor: t.accent }}
              >
                <Navigation className="w-4 h-4" />
                길찾기
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
