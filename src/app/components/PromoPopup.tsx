import { useEffect, useState } from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../../firebase";
import { Building, Check } from "lucide-react";
import { WEBSITE_HOST, websiteUrlWithLogin } from "../../utils/websiteHost";

// 주보 플랫폼 홍보 팝업(2026-11-20). /super > 홍보 팝업에서 켜고 문구·사진·버튼을 바꿈.
// settings/promoPopup 문서 하나에 저장. 주보 첫 화면(/)과 주보 관리 화면(/admin)에만 띄움(성도 화면·교회 홈페이지에는 안 띄움)
export interface PromoPopupData {
  enabled: boolean;
  title: string;
  message: string;
  imageUrl: string;
  buttonText: string;
  linkUrl: string;
}

export const PROMO_POPUP_DOC = ["settings", "promoPopup"] as const;

export const PROMO_POPUP_DEFAULT: PromoPopupData = {
  enabled: false,
  // 초등학생도 바로 알 수 있게: 무엇을 해 주는지 한 줄 + 줄마다 ✓ 한 가지씩 + 실제 홈페이지 사진
  title: "우리 교회 홈페이지,\n스테이온이 만들어 드려요",
  message: "10분이면 완성돼요\n주보 내용이 홈페이지에 저절로 올라가요\n지금은 오픈 프로모션으로 무료!\n관리형은 스테이온이 직접 만들어 드려요",
  imageUrl: "/homePageSample.jpg",
  buttonText: "홈페이지 구경하러 가기",
  linkUrl: "https://website.stayon-platform.com/",
};

export const readPromoPopup = (d: Record<string, unknown> | undefined): PromoPopupData => {
  const s = (k: keyof PromoPopupData) => (typeof d?.[k] === "string" ? (d[k] as string) : (PROMO_POPUP_DEFAULT[k] as string));
  return {
    enabled: d?.enabled === true,
    title: s("title"),
    message: s("message"),
    imageUrl: s("imageUrl"),
    buttonText: s("buttonText"),
    linkUrl: s("linkUrl"),
  };
};

// "일주일 보지 않기": 이 브라우저에 다시 띄울 시각(지금+7일)을 적어 두고, 그 시각이 지나면 다시 띄움
const HIDE_KEY = "stayon_promo_popup_hide_until";
const HIDE_DAYS = 7;
const today = () => new Date().toLocaleDateString("sv-SE");
const hiddenToday = () => {
  try {
    const until = Number(localStorage.getItem(HIDE_KEY) || 0);
    return Number.isFinite(until) && until > Date.now();
  } catch { return false; }
};

// "오늘 하루 보지 않기"를 누른 기록(2026-11-20) → /super > 홍보 팝업에서 봄.
// promoPopupHides/{누른 사람}_{날짜} 하나씩(같은 날 여러 번 눌러도 한 줄). 로그인한 교회는 교회 이름까지,
// 로그인 안 한 방문자는 이 브라우저용 임의 번호로만 남김. 기록 실패해도 팝업 닫기에는 영향 없음
export const PROMO_HIDES = "promoPopupHides";
const VISITOR_KEY = "stayon_visitor_id";
async function logHideToday() {
  try {
    const user = auth.currentUser;
    let who = user?.uid ?? "";
    if (!who) {
      try {
        who = localStorage.getItem(VISITOR_KEY) || "";
        if (!who) { who = `v_${Math.random().toString(36).slice(2, 12)}`; localStorage.setItem(VISITOR_KEY, who); }
      } catch { who = `v_${Math.random().toString(36).slice(2, 12)}`; }
    }
    let churchName = "";
    if (user) churchName = String((await getDoc(doc(db, "users", user.uid))).data()?.churchName ?? "");
    await setDoc(doc(db, PROMO_HIDES, `${who}_${today()}`), {
      uid: user?.uid ?? null,
      email: user?.email ?? null,
      churchName: churchName || null,
      loggedIn: !!user,
      page: window.location.pathname.startsWith("/admin") ? "/admin" : "/",
      date: today(),
      at: serverTimestamp(),
    });
  } catch { /* 기록만 실패 — 무시 */ }
}

// 팝업 카드 모양(실제 화면과 /super 미리보기가 같이 씀)
export function PromoPopupCard({ data, onGo, onClose, onHideToday }: {
  data: PromoPopupData;
  onGo?: () => void;
  onClose?: () => void;
  onHideToday?: () => void;
}) {
  // 토스 스타일(2026-11-20 개편): 흰 카드 · 큰 굵은 제목 · 회색 설명 · 꽉 찬 파란 버튼 1개 · 아래 회색 글자 버튼 2개.
  // 색 띠·검은 × 버튼·칸 나눔 선 없이 여백으로만 정리. 사진이 없으면 연파랑 둥근 칸에 건물 아이콘
  return (
    <div className="relative w-full bg-white rounded-t-[28px] sm:rounded-[28px] shadow-[0_12px_48px_rgba(0,23,51,0.18)] px-6 pt-3 sm:pt-7 pb-[max(12px,env(safe-area-inset-bottom))] sm:pb-3 sm:px-7">
      {/* 휴대폰: 아래에서 올라오는 시트라는 걸 알 수 있게 손잡이 */}
      <div className="sm:hidden mx-auto mb-5 h-1 w-10 rounded-full bg-[#E5E8EB]" />
      {data.imageUrl
        ? <img src={data.imageUrl} alt="" className="block w-full rounded-2xl border border-[#F2F4F6] aspect-[16/9] object-cover object-top mb-5" />
        : (
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#E8F3FF]">
            <Building className="h-7 w-7 text-[#3182F6]" strokeWidth={2.2} />
          </div>
        )}
      {data.title.trim() && <p className="text-[22px] font-bold leading-[1.4] tracking-[-0.02em] text-[#191F28] whitespace-pre-line break-keep">{data.title}</p>}
      {/* 설명(2026-11-20 가독성 개편): 한 줄마다 연회색 둥근 칸 하나씩 — 굵은 본문 한 줄.
          줄 끝에 (괄호)가 있으면 괄호 안 내용을 아래에 작은 파란 글씨로 따로 보여 줌
          예) "한 달 7,900원부터(현재 오픈 프로모션 무료 사용 가능)" → 본문 "한 달 7,900원부터" + 아래 "현재 오픈 프로모션 무료 사용 가능" */}
      {data.message.trim() && (
        <ul className="mt-5 space-y-2">
          {data.message.split("\n").map((l) => l.trim()).filter(Boolean).map((l, i) => {
            const m = l.match(/^(.+?)\s*[(（]([^()（）]+)[)）]\s*$/);
            const main = m ? m[1] : l;
            const sub = m ? m[2] : "";
            return (
              <li key={i} className="flex items-center gap-3 rounded-2xl bg-[#F9FAFB] px-4 py-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#3182F6]">
                  <Check className="h-3.5 w-3.5 text-white" strokeWidth={3.2} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold leading-[1.4] text-[#191F28] break-keep">{main}</span>
                  {sub && <span className="mt-0.5 block text-[13px] font-semibold leading-[1.4] text-[#3182F6] break-keep">{sub}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {data.buttonText.trim() && data.linkUrl.trim() && (
        <button type="button" onClick={onGo}
          className="mt-6 h-14 w-full rounded-2xl bg-[#3182F6] text-[17px] font-semibold text-white transition-[background-color,transform] duration-150 hover:bg-[#1B64DA] active:scale-[0.98]">
          {data.buttonText}
        </button>
      )}
      <div className="mt-1.5 flex items-center justify-between">
        <button type="button" onClick={onHideToday}
          className="h-11 rounded-xl px-2 text-[14px] font-medium text-[#8B95A1] transition-colors hover:bg-[#F2F4F6] hover:text-[#4E5968]">일주일 보지 않기</button>
        <button type="button" onClick={onClose}
          className="h-11 rounded-xl px-3 text-[14px] font-semibold text-[#4E5968] transition-colors hover:bg-[#F2F4F6]">닫기</button>
      </div>
    </div>
  );
}

// 화면에 붙이는 팝업: 들어오자마자 뜸. PC는 가운데 카드, 휴대폰은 아래에서 올라오는 카드
export function PromoPopup() {
  const [data, setData] = useState<PromoPopupData | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (hiddenToday()) return;
    let alive = true;
    getDoc(doc(db, ...PROMO_POPUP_DOC))
      .then((snap) => {
        const d = readPromoPopup(snap.data());
        if (!alive || !d.enabled || !(d.title.trim() || d.message.trim() || d.imageUrl)) return;
        setData(d);
        setOpen(true); // 들어오자마자 바로 띄움(2026-11-20: 2.5초 기다림 없앰. 설정값을 읽는 아주 짧은 시간만 걸림)
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // 팝업이 떠 있는 동안 뒤 화면이 스크롤되지 않게 잠금(아이폰은 overflow:hidden만으론 안 막혀서 body를 그 자리에 고정)
  useEffect(() => {
    if (!open) return;
    const y = window.scrollY;
    const s = document.body.style;
    const prev = { position: s.position, top: s.top, left: s.left, right: s.right, overflow: s.overflow };
    Object.assign(s, { position: "fixed", top: `-${y}px`, left: "0", right: "0", overflow: "hidden" });
    return () => {
      Object.assign(s, prev);
      window.scrollTo(0, y);
    };
  }, [open]);

  if (!data || !open) return null;

  const close = () => setOpen(false);
  const hideToday = () => {
    try { localStorage.setItem(HIDE_KEY, String(Date.now() + HIDE_DAYS * 24 * 60 * 60 * 1000)); } catch { /* 저장 못 해도 닫기만 */ }
    close();
    void logHideToday();
  };
  const go = async () => {
    const url = data.linkUrl.trim();
    close();
    // website 주소로 가면 로그인을 이어 줌(다시 로그인 안 해도 되게)
    try {
      const u = new URL(url, window.location.origin);
      if (u.host === WEBSITE_HOST) {
        window.location.href = await websiteUrlWithLogin(null, `${u.pathname}${u.search}`);
        return;
      }
      if (u.origin === window.location.origin) { window.location.href = u.href; return; }
    } catch { /* 주소가 이상하면 그대로 */ }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="fixed inset-0 z-[9000] flex items-end sm:items-center justify-center bg-black/45 sm:p-6 overscroll-contain animate-in fade-in duration-300"
      onClick={close} role="dialog" aria-modal="true">
      {/* 화면이 작아 팝업이 넘치면 팝업 안에서만 스크롤 */}
      <div className="w-full sm:max-w-[400px] max-h-[100dvh] sm:max-h-[calc(100dvh-48px)] overflow-y-auto overscroll-contain animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-4 duration-300" onClick={(e) => e.stopPropagation()}>
        <PromoPopupCard data={data} onGo={go} onClose={close} onHideToday={hideToday} />
      </div>
    </div>
  );
}
