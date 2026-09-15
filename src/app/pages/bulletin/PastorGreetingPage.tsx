import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router";
import { ArrowLeft, MessageCircleHeart, Phone, Mail } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../../firebase";
import { fetchPublishedBulletin } from "../../../utils/fetchPublishedBulletin";
import { hasTierOrAbove } from "../../../utils/subscriptionTier";
import { BulletinMenu } from "./BulletinMenu";

// 메뉴 > 담임목사 인사말 (스탠다드 요금제 이상). 사진/이름/직분은 "섬기시는분 안내 설정 >
// 담임 목사"(seniorPastor)를 그대로 재사용하고, 인사말 문구/내용/연락처/이메일만 이 화면 전용.
// 등급 판정을 위해 작성 교회 계정(users/{authorId}.status)을 별도로 조회한다 - 등급이
// 떨어지면 데이터는 그대로 두고 화면에서만 자동으로 숨긴다(커스텀 디자인과 동일한 원칙).

type Theme = { pageBg: string; headerBg: string; line: string; ink: string; muted: string; accent: string; label: string; flat: boolean };
const THEMES: Record<string, Theme> = {
  default: { pageBg: "#f1f5f9", headerBg: "rgba(241,245,249,0.92)", line: "#e2e8f0", ink: "#0f172a", muted: "#64748b", accent: "#2563eb", label: "#3b82f6", flat: false },
  "warm-ivory": { pageBg: "#FDFAF5", headerBg: "rgba(253,250,245,0.92)", line: "#EEE6D4", ink: "#1F241F", muted: "#8a8272", accent: "#2F5C52", label: "#B5924A", flat: true },
  "warm-ivory-open": { pageBg: "#FDFAF5", headerBg: "rgba(253,250,245,0.92)", line: "#EEE6D4", ink: "#1F241F", muted: "#8a8272", accent: "#2F5C52", label: "#B5924A", flat: true },
};

export function PastorGreetingPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [bulletin, setBulletin] = useState<any>(null);
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
          const uSnap = await getDoc(doc(db, "users", data.authorId));
          const status = uSnap.exists() ? (uSnap.data() as any)?.status : undefined;
          if (!cancelled) setEntitled(hasTierOrAbove(status, "standard"));
        } catch {
          if (!cancelled) setEntitled(false);
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id]);

  const t = THEMES[bulletin?.bulletinTemplate as string] || THEMES.default;
  const senior = bulletin?.seniorPastor || {};
  const g = bulletin?.pastorGreeting || {};
  const show =
    entitled &&
    bulletin?.pastorGreetingEnabled !== false &&
    (String(g.greetingText || "").trim() !== "" || String(g.content || "").trim() !== "");

  const showPhones = show && g.phoneSectionEnabled !== false;
  const showChurchPhone = showPhones && String(g.churchPhone || "").trim() !== "";
  const showPersonalPhone = showPhones && !g.personalPhoneHidden && String(g.personalPhone || "").trim() !== "";
  const showEmail = show && String(g.email || "").trim() !== "";

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
            <h1 className="font-extrabold text-[15px] flex-1 truncate" style={{ color: t.ink }}>담임목사 인사말</h1>
          </div>
        </div>

        {id && <BulletinMenu bulletinId={id} churchLogo={bulletin?.churchLogo} variant="solid" accent={t.accent} pastoralColumnsEnabled={bulletin?.pastoralColumnsEnabled === true} officersEnabled={bulletin?.officersEnabled !== false} />}

        {loading ? (
          <div className="p-12 text-center font-bold text-sm" style={{ color: t.muted }}>불러오는 중…</div>
        ) : !bulletin ? (
          <div className="p-12 text-center font-bold text-sm" style={{ color: t.muted }}>주보를 찾을 수 없습니다.</div>
        ) : !show ? (
          <div className="p-12 text-center font-bold text-sm" style={{ color: t.muted }}>
            <MessageCircleHeart className="w-8 h-8 mx-auto mb-3 opacity-40" />
            아직 등록된 인사말이 없습니다.
          </div>
        ) : (
          <div className={`animate-in fade-in duration-500 flex flex-col items-center text-center ${t.flat ? "px-6 py-8" : "p-4"}`}>
            {senior.photoUrl && (
              <div className="w-32 h-32 rounded-full overflow-hidden border-4 mb-4 shrink-0" style={{ borderColor: t.line }}>
                <img src={senior.photoUrl} alt={senior.name || "담임 목사"} className="w-full h-full object-cover" />
              </div>
            )}
            {senior.role && <p className="text-xs font-bold mb-1" style={{ color: t.accent }}>{senior.role}</p>}
            {senior.name && <h2 className="text-lg font-black mb-5" style={{ color: t.ink }}>{senior.name}</h2>}

            {g.greetingText && (
              <p className="text-xl font-black leading-snug break-keep mb-4" style={{ color: t.ink }}>
                {g.greetingText}
              </p>
            )}
            {g.content && (
              <p className="text-sm leading-[1.9] whitespace-pre-line break-keep mb-7" style={{ color: t.muted }}>
                {g.content}
              </p>
            )}

            {(showChurchPhone || showPersonalPhone || showEmail) && (
              <div className="w-full space-y-2.5">
                {showChurchPhone && (
                  <a
                    href={`tel:${g.churchPhone}`}
                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-sm border transition-colors"
                    style={{ borderColor: t.line, color: t.ink }}
                  >
                    <Phone className="w-4 h-4 shrink-0" style={{ color: t.accent }} />
                    교회 연락처 · {g.churchPhone}
                  </a>
                )}
                {showPersonalPhone && (
                  <a
                    href={`tel:${g.personalPhone}`}
                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-sm border transition-colors"
                    style={{ borderColor: t.line, color: t.ink }}
                  >
                    <Phone className="w-4 h-4 shrink-0" style={{ color: t.accent }} />
                    개인 연락처 · {g.personalPhone}
                  </a>
                )}
                {showEmail && (
                  <a
                    href={`mailto:${g.email}`}
                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-sm border transition-colors"
                    style={{ borderColor: t.line, color: t.ink }}
                  >
                    <Mail className="w-4 h-4 shrink-0" style={{ color: t.accent }} />
                    {g.email}
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
