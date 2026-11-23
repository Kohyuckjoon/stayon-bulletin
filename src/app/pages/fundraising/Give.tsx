import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router";
import { addDoc, collection, doc, onSnapshot, orderBy, query, serverTimestamp } from "firebase/firestore";
import { QRCodeSVG } from "qrcode.react";
import {
  Backpack, Footprints, Shirt, Gift, Heart, Check, ChevronLeft, ChevronRight, Smartphone, BookOpen, Laptop, Bike, Baby, Sparkles,
} from "lucide-react";
import { db } from "../../../firebase";

// 모금 프로젝트(러브링 등) 성도 화면 — /give/:projectId (시안 01~05) · /give/:projectId/display (시안 06, 9:16 화면)
// QR이 이 주소로 연결됨. 로그인 없이 누구나 봄.
// fundraisers/{pid}(공개)와 wishes(공개)만 읽고, "보냈어요"를 누르면 donations 에 한 줄만 추가(firestore.rules 가 칸·범위 검사).
// 합계(totals)·소원별 모인 금액(raised)·최근 소식(recent)은 서버 함수(fundraiserTotals)가 씀 — 화면에서 고칠 수 없음.
// 주보·결제·정기결제·성도 주보 화면 코드는 쓰지도 고치지도 않음.

interface Bank { name: string; account: string; holder: string; memoGuide: string }
interface RandomGift { enabled: boolean; label: string; desc: string; goal: number | null }
interface Fund {
  churchName: string; title: string; headline: string; notice: string; startDate: string; endDate: string;
  status: "draft" | "open" | "closed"; bank: Bank; displayMode: "instant" | "confirmed"; randomGift: RandomGift; displayShowQr: boolean;
  totals: { reported: number; confirmed: number; count: number; shown: number; random: number };
  recent: { wishName: string; at?: { toMillis?: () => number } } | null;
}
interface Wish { id: string; name: string; desc: string; imageUrl: string; goal: number; raised: number }

const G = { green: "#1E6B63", greenDark: "#164F49", greenBg: "#E6F2EF", ink: "#191F28", sub: "#4E5968", muted: "#8B95A1", line: "#E5E8EB", bg: "#F5F6F6", red: "#D9665B", redBg: "#FDEDEB", gold: "#E3B055", goldBg: "#FFF8EC", goldInk: "#8A5A00" };
const won = (n: number) => `${Math.round(n || 0).toLocaleString("ko-KR")}원`;
const pct = (a: number, b: number) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0);
const toNum = (v: string) => Number(v.replace(/[^\d]/g, "")) || 0;
const dday = (end: string) => {
  if (!end) return "";
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const n = Math.round((new Date(`${end}T00:00:00`).getTime() - t.getTime()) / 86400000);
  return n > 0 ? `D-${n}` : n === 0 ? "D-DAY" : "종료";
};
const mdKo = (s: string) => (s ? `${Number(s.slice(5, 7))}월 ${Number(s.slice(8, 10))}일` : "");
const yearOf = (f: Fund) => (f.startDate || f.endDate || String(new Date().getFullYear())).slice(0, 4);

// 소원 이름으로 고르는 기본 그림(사진이 없을 때)
function WishIcon({ name, className }: { name: string; className?: string }) {
  const n = name.replace(/\s/g, "");
  const I = /가방|백팩/.test(n) ? Backpack : /운동화|신발|구두/.test(n) ? Footprints : /정장|셔츠|외투|코트|패딩|옷|점퍼/.test(n) ? Shirt
    : /책|도서|문제집/.test(n) ? BookOpen : /노트북|컴퓨터|태블릿/.test(n) ? Laptop : /자전거/.test(n) ? Bike : /기저귀|분유|아기/.test(n) ? Baby : Gift;
  return <I className={className} strokeWidth={1.8} />;
}

// 공개 데이터 실시간 구독
function useFund(pid: string) {
  const [fund, setFund] = useState<Fund | null>(null);
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    const u1 = onSnapshot(doc(db, "fundraisers", pid), (s) => {
      if (!s.exists()) { setMissing(true); return; }
      const d = s.data() as Record<string, any>;
      const t = d.totals || {};
      setFund({
        churchName: d.churchName || "", title: d.title || "", headline: d.headline || "", notice: d.notice || "",
        startDate: d.startDate || "", endDate: d.endDate || "", status: d.status || "draft",
        bank: { name: "", account: "", holder: "", memoGuide: "", ...(d.bank || {}) },
        displayMode: d.displayMode === "confirmed" ? "confirmed" : "instant",
        randomGift: { enabled: false, label: "", desc: "", goal: null, ...(d.randomGift || {}) },
        displayShowQr: d.displayShowQr !== false,
        totals: { reported: Number(t.reported) || 0, confirmed: Number(t.confirmed) || 0, count: Number(t.count) || 0, shown: Number(t.shown) || 0, random: Number(t.random) || 0 },
        recent: d.recent || null,
      });
    }, () => setMissing(true));
    const u2 = onSnapshot(query(collection(db, "fundraisers", pid, "wishes"), orderBy("order")), (s) => {
      setWishes(s.docs.filter((x) => x.data().visible !== false).map((x) => {
        const d = x.data();
        return { id: x.id, name: d.name || "", desc: d.desc || "", imageUrl: d.imageUrl || "", goal: Number(d.goal) || 0, raised: Number(d.raised) || 0 };
      }));
    });
    return () => { u1(); u2(); };
  }, [pid]);
  return { fund, wishes, missing };
}

const Loading = ({ text = "불러오는 중…" }: { text?: string }) => (
  <div className="flex min-h-[100dvh] items-center justify-center text-sm" style={{ background: G.bg, color: G.muted }}>{text}</div>
);
const GBar = ({ value, color = G.green, track = "#E3E7E8", h = "h-2.5" }: { value: number; color?: string; track?: string; h?: string }) => (
  <div className={`${h} w-full overflow-hidden rounded-full`} style={{ background: track }}>
    <div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${value}%`, background: color }} />
  </div>
);
const PrimaryBtn = ({ children, onClick, disabled, light }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; light?: boolean }) => (
  <button type="button" onClick={onClick} disabled={disabled}
    className="h-14 w-full rounded-2xl text-[17px] font-bold transition-transform active:scale-[0.98] disabled:opacity-40"
    style={light ? { background: "white", color: G.green } : { background: G.green, color: "white" }}>{children}</button>
);

// 은행 버튼: 누르면 계좌번호 복사 + (알려진 경우) 은행 앱 열기. 은행마다 앱을 여는 방식이 달라 실기기 확인 필요
const BANK_APPS: { name: string; scheme?: string }[] = [
  { name: "토스", scheme: "supertoss://" },
  { name: "카카오뱅크", scheme: "kakaobank://" },
  { name: "KB국민", scheme: "kbbank://" },
  { name: "신한" }, { name: "우리" }, { name: "하나" },
  { name: "NH농협" }, { name: "BNK부산" }, { name: "IBK기업" },
  { name: "새마을금고" }, { name: "우체국" }, { name: "그 외 은행" },
];

// 화면 공통 틀(바깥에 둬야 입력 중에 칸이 다시 만들어지지 않음)
const StepHeader = ({ n, back }: { n: number; back: () => void }) => (
  <div className="sticky top-0 z-10 bg-white/95 px-5 pt-4 backdrop-blur">
    <div className="flex items-center justify-between">
      <button type="button" aria-label="뒤로" onClick={back} className="-ml-2 flex h-10 w-10 items-center justify-center"><ChevronLeft className="h-7 w-7" style={{ color: G.ink }} /></button>
      <span className="text-[15px] font-bold" style={{ color: G.sub }}>{n} / 3</span>
    </div>
    <div className="mt-3 h-1.5 w-full rounded-full" style={{ background: G.line }}>
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(n / 3) * 100}%`, background: G.green }} />
    </div>
  </div>
);
const Shell = ({ children, white, footer, toast }: { children: React.ReactNode; white?: boolean; footer?: React.ReactNode; toast: string }) => (
  <div className="min-h-[100dvh]" style={{ background: white ? "white" : G.bg }}>
    <div className="mx-auto max-w-[480px] pb-32">{children}</div>
    {footer && <div className="fixed inset-x-0 bottom-0 z-20" style={{ background: white ? "linear-gradient(transparent, white 30%)" : `linear-gradient(transparent, ${G.bg} 30%)` }}><div className="mx-auto max-w-[480px] px-5 pb-6 pt-6">{footer}</div></div>}
    {toast && (
      <div className="fixed inset-x-0 bottom-28 z-30 flex justify-center px-5">
        <div className="flex w-full max-w-[440px] items-center gap-3 rounded-2xl px-5 py-4 text-[15px] font-semibold text-white shadow-xl animate-in slide-in-from-bottom-2 duration-200" style={{ background: G.ink }}>
          <Check className="h-5 w-5 shrink-0" style={{ color: "#6FD3B8" }} /> {toast}
        </div>
      </div>
    )}
  </div>
);

type Step = "main" | "bank" | "guide" | "amount" | "thanks" | "done";

// ── 성도 화면 ─────────────────────────────
export function GivePage() {
  const { projectId = "" } = useParams();
  const { fund, wishes, missing } = useFund(projectId);
  const [step, setStep] = useState<Step>("main");
  const [target, setTarget] = useState<string>(""); // 소원 id 또는 "random"
  const [bankApp, setBankApp] = useState("");
  const [toast, setToast] = useState("");
  const [amount, setAmount] = useState(0);
  const [name, setName] = useState("");
  const [anon, setAnon] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ before: number; after: number; goal: number; amount: number; totalAfter: number } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => { window.scrollTo({ top: 0 }); }, [step]);
  useEffect(() => { if (fund) document.title = `${fund.title} | ${fund.churchName}`; }, [fund]);

  const goalTotal = useMemo(() => wishes.reduce((a, w) => a + w.goal, 0), [wishes]);
  if (missing) return <Loading text="모금 페이지를 찾을 수 없어요." />;
  if (!fund) return <Loading />;

  const isRandom = target === "random";
  const wish = wishes.find((w) => w.id === target);
  const targetName = isRandom ? (fund.randomGift.label || "랜덤 선물") : wish?.name || "";
  const memo = fund.bank.memoGuide || `${fund.title} + 이름`;
  const accountText = `${fund.bank.name} ${fund.bank.account}`.trim();
  const open = fund.status === "open";
  const shown = fund.totals.shown || fund.totals.reported;

  const flash = (t: string) => {
    setToast(t);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2600);
  };
  const choose = (id: string) => {
    if (!open) { flash(fund.status === "draft" ? "아직 모금이 시작되지 않았어요." : "모금이 마감되었어요."); return; }
    setTarget(id);
    setAmount(0);
    setStep("bank");
  };
  const anyWish = () => {
    if (fund.randomGift.enabled) return choose("random");
    const next = wishes.find((w) => w.goal === 0 || w.raised < w.goal) || wishes[0];
    if (next) choose(next.id);
  };
  const copyAccount = async () => {
    try { await navigator.clipboard.writeText(accountText); return true; } catch { return false; }
  };
  const pickBank = async (b: { name: string; scheme?: string }) => {
    setBankApp(b.name);
    const ok = await copyAccount();
    flash(ok ? (b.scheme ? `계좌번호를 복사했어요. ${b.name}${b.name === "토스" ? "를" : "을"} 여는 중…` : "계좌번호를 복사했어요. 은행 앱을 열어 주세요") : "복사가 안 됐어요. 계좌번호를 길게 눌러 복사해 주세요");
    if (b.scheme) {
      // 앱이 열리면 이 화면은 뒤로 감. 돌아왔을 때 안내 화면이 보이도록 먼저 바꿔 둠
      window.setTimeout(() => setStep("guide"), 400);
      window.location.href = b.scheme;
    } else {
      window.setTimeout(() => setStep("guide"), 900);
    }
  };
  const submit = async () => {
    if (amount < 1000) { flash("보낸 금액을 1,000원 이상으로 적어 주세요."); return; }
    if (amount > 10000000) { flash("한 번에 1,000만 원까지 알려 주실 수 있어요."); return; }
    setSending(true);
    try {
      const data: Record<string, unknown> = { wishId: target, amount: Math.round(amount), anonymous: anon || !name.trim(), status: "pending", createdAt: serverTimestamp() };
      if (name.trim()) data.name = name.trim().slice(0, 20);
      await addDoc(collection(db, "fundraisers", projectId, "donations"), data);
      // 게이지는 서버가 곧 반영. 감사 화면은 바로 보여 주려고 화면에서 미리 계산(즉시 반영 모드일 때만 더함)
      const counts = fund.displayMode === "instant";
      const before = isRandom ? fund.totals.random : wish?.raised || 0;
      const goal = isRandom ? (fund.randomGift.goal || 0) : wish?.goal || 0;
      const after = before + (counts ? amount : 0);
      setSent({ before, after, goal, amount, totalAfter: shown + (counts ? amount : 0) });
      setStep(goal > 0 && after >= goal && before < goal ? "done" : "thanks");
    } catch (e) {
      console.error(e);
      flash(open ? "알림을 보내지 못했어요. 잠시 후 다시 눌러 주세요." : "모금이 열려 있지 않아요.");
    } finally {
      setSending(false);
    }
  };

  // 01 메인
  if (step === "main") {
    const p = pct(shown, goalTotal);
    return (
      <Shell toast={toast} footer={open && (wishes.length > 0 || fund.randomGift.enabled) ? <PrimaryBtn onClick={anyWish}>아무 소원이나 함께하기</PrimaryBtn> : undefined}>
        <div className="px-5 pt-6">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-[17px] font-black" style={{ color: G.green }}>{fund.churchName}</p>
            {fund.endDate && <span className="shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-bold" style={{ background: G.greenBg, color: G.green }}>{dday(fund.endDate)} · {mdKo(fund.endDate)}까지</span>}
          </div>
          <p className="mt-7 text-[15px] font-bold" style={{ color: G.red }}>{fund.title} 프로젝트 {yearOf(fund)}</p>
          <h1 className="mt-2 whitespace-pre-line break-keep text-[26px] font-black leading-[1.35] tracking-[-0.01em]" style={{ color: G.ink, wordBreak: "keep-all" }}>{fund.headline || `${fund.title}에\n함께해 주세요`}</h1>
          {!open && <p className="mt-4 rounded-2xl px-4 py-3 text-sm font-semibold" style={{ background: G.goldBg, color: G.goldInk }}>{fund.status === "draft" ? "모금 준비 중이에요. 곧 시작돼요." : "모금이 마감되었어요. 함께해 주셔서 감사합니다."}</p>}
          <div className="mt-6 rounded-[24px] bg-white p-6">
            <p className="text-[15px]" style={{ color: G.sub }}>지금까지 함께 모은 사랑</p>
            <p className="mt-3"><span className="text-[34px] font-black tabular-nums" style={{ color: G.ink }}>{won(shown)}</span>{goalTotal > 0 && <span className="ml-2 text-[15px]" style={{ color: G.muted }}>/ {won(goalTotal)}</span>}</p>
            {goalTotal > 0 && <div className="mt-4"><GBar value={p} h="h-3" /></div>}
            <div className="mt-3 flex justify-between text-[14px]">
              <span style={{ color: G.sub }}>{goalTotal > 0 && <><b style={{ color: G.green }}>{p}%</b> 채워졌어요</>}</span>
              <span style={{ color: G.sub }}>함께한 성도 {fund.totals.count}명</span>
            </div>
          </div>

          <h2 className="mt-9 text-[21px] font-black" style={{ color: G.ink }}>어떤 선물을 보낼까요?</h2>
          <p className="mt-1 text-[15px]" style={{ color: G.sub }}>하나를 누르면 바로 보낼 수 있어요</p>
          <div className="mt-4 space-y-3">
            {wishes.map((w) => {
              const wp = pct(w.raised, w.goal); const full = w.goal > 0 && w.raised >= w.goal;
              return (
                <button key={w.id} type="button" onClick={() => choose(w.id)} className="flex w-full items-center gap-4 rounded-[22px] bg-white p-4 text-left transition-transform active:scale-[0.99]">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl" style={{ background: full ? G.redBg : G.greenBg, color: full ? G.red : G.green }}>
                    {w.imageUrl ? <img src={w.imageUrl} alt="" className="h-full w-full object-cover" /> : <WishIcon name={w.name} className="h-7 w-7" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-[16px] font-black" style={{ color: G.ink }}>{w.name}</span>
                      {full ? <span className="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold text-white" style={{ background: G.red }}>모금 완료</span>
                        : w.goal > 0 && <span className="shrink-0 text-[15px] font-black" style={{ color: G.green }}>{wp}%</span>}
                    </span>
                    {w.goal > 0 && <span className="mt-2 block"><GBar value={wp} color={full ? G.red : G.green} /></span>}
                    <span className="mt-2 block text-[13px] tabular-nums" style={{ color: G.sub }}>{won(w.raised)}{w.goal > 0 && ` / ${won(w.goal)}`}</span>
                  </span>
                </button>
              );
            })}
            {fund.randomGift.enabled && (
              <button type="button" onClick={() => choose("random")} className="flex w-full items-center gap-4 rounded-[22px] border-2 border-dashed p-4 text-left transition-transform active:scale-[0.99]" style={{ borderColor: G.gold, background: G.goldBg }}>
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl" style={{ background: "#FCE6BD", color: G.goldInk }}><Gift className="h-7 w-7" strokeWidth={1.8} /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2"><span className="text-[16px] font-black" style={{ color: G.ink }}>{fund.randomGift.label || "랜덤 선물"}</span><span className="rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: "#FCE6BD", color: G.goldInk }}>어디든 OK</span></span>
                  {fund.randomGift.desc && <span className="mt-1 block text-[14px]" style={{ color: G.sub }}>{fund.randomGift.desc}</span>}
                  <span className="mt-1 block text-[13px]" style={{ color: G.sub }}>지금까지 {won(fund.totals.random)} 모였어요</span>
                </span>
                <ChevronRight className="h-6 w-6 shrink-0" style={{ color: G.goldInk }} />
              </button>
            )}
          </div>
          {fund.notice && <p className="mt-6 whitespace-pre-line text-[14px] leading-relaxed" style={{ color: G.muted }}>{fund.notice}</p>}
        </div>
      </Shell>
    );
  }

  // 02 은행 고르기
  if (step === "bank") {
    return (
      <Shell toast={toast} white footer={<PrimaryBtn onClick={() => setStep("amount")}>다 보냈어요</PrimaryBtn>}>
        <StepHeader n={2} back={() => setStep("main")} />
        <div className="px-5 pt-6">
          <p className="text-[15px] font-bold" style={{ color: G.green }}>{targetName}</p>
          <h1 className="mt-2 text-[26px] font-black" style={{ color: G.ink }}>쓰는 은행을 눌러주세요</h1>
          <p className="mt-2 text-[15px] leading-relaxed" style={{ color: G.sub }}>계좌번호가 자동으로 복사되고 은행 앱이 열려요.<br />앱에서 <b style={{ color: G.ink }}>붙여넣기</b>만 하면 돼요.</p>
          <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl px-5 py-4" style={{ background: "#F2F5F4" }}>
            <div className="min-w-0">
              <p className="text-[13px]" style={{ color: G.sub }}>보낼 곳 · 예금주 {fund.bank.holder || fund.churchName}</p>
              <p className="mt-1 break-all text-[18px] font-black" style={{ color: G.ink }}>{accountText || "계좌 준비 중"}</p>
            </div>
            <button type="button" onClick={async () => flash((await copyAccount()) ? "계좌번호를 복사했어요" : "복사가 안 됐어요")} className="shrink-0 rounded-xl px-4 py-2.5 text-[15px] font-bold" style={{ background: G.greenBg, color: G.green }}>복사</button>
          </div>
          <p className="mt-3 text-[14px]" style={{ color: G.sub }}>받는 분 통장 표시는 <b style={{ color: G.red }}>{memo.replace("이름", "내 이름")}</b>으로 적어주세요</p>
          <div className="mt-5 grid grid-cols-3 gap-2.5">
            {BANK_APPS.map((b) => (
              <button key={b.name} type="button" onClick={() => pickBank(b)} className="h-[72px] rounded-2xl border-2 text-[15px] font-bold transition-colors active:scale-[0.98]"
                style={bankApp === b.name ? { borderColor: G.green, background: G.greenBg, color: G.ink } : { borderColor: G.line, background: "white", color: b.name === "그 외 은행" ? G.sub : G.ink }}>
                {b.name}
              </button>
            ))}
          </div>
        </div>
      </Shell>
    );
  }

  // 02-1 은행 앱 안내
  if (step === "guide") {
    const app = BANK_APPS.find((b) => b.name === bankApp);
    const appName = bankApp && bankApp !== "그 외 은행" ? bankApp : "은행";
    return (
      <Shell toast={toast} white footer={<div className="space-y-2.5">
        {app?.scheme && <button type="button" onClick={() => pickBank(app)} className="h-14 w-full rounded-2xl text-[17px] font-bold" style={{ background: "#F2F4F6", color: G.ink }}>{appName} 다시 열기</button>}
        <PrimaryBtn onClick={() => setStep("amount")}>다 보냈어요</PrimaryBtn>
      </div>}>
        <StepHeader n={2} back={() => setStep("bank")} />
        <div className="px-5 pt-8">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: G.greenBg, color: G.green }}><Smartphone className="h-8 w-8" strokeWidth={1.8} /></span>
          <h1 className="mt-6 text-[26px] font-black leading-snug" style={{ color: G.ink }}>{appName} 앱에서<br />계좌이체를 진행해주세요</h1>
          <p className="mt-3 text-[15px]" style={{ color: G.sub }}>다 보내고 이 화면으로 돌아오면 돼요</p>
          <div className="mt-6 rounded-[20px] border-2 p-5" style={{ borderColor: G.green, background: "#F4FAF8" }}>
            <p className="flex items-center gap-2 text-[15px] font-bold" style={{ color: G.green }}><Check className="h-5 w-5" /> 계좌번호가 복사됐어요</p>
            <p className="mt-2 break-all text-[19px] font-black" style={{ color: G.ink }}>{accountText}</p>
            <p className="mt-1 text-[14px]" style={{ color: G.sub }}>받는 분 {fund.bank.holder || fund.churchName}</p>
          </div>
          <ol className="mt-7 space-y-5">
            {[<>{appName}에서 <b>보내기</b>를 눌러요</>, <>계좌번호 칸을 꾹 눌러 <b>붙여넣기</b></>, <>금액 입력 후 받는 분 통장 표시에<br /><b style={{ color: G.red }}>{memo.replace("이름", "내 이름")}</b></>].map((t, i) => (
              <li key={i} className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-black text-white" style={{ background: G.green }}>{i + 1}</span>
                <span className="pt-1 text-[16px] leading-relaxed" style={{ color: G.ink }}>{t}</span>
              </li>
            ))}
          </ol>
        </div>
      </Shell>
    );
  }

  // 03 알려주기 · 입금 확인
  if (step === "amount") {
    return (
      <Shell toast={toast} white footer={<PrimaryBtn onClick={submit} disabled={sending || amount < 1000}>{sending ? "보내는 중…" : amount >= 1000 ? `${won(amount)} 보냈어요` : "보낸 금액을 적어 주세요"}</PrimaryBtn>}>
        <StepHeader n={3} back={() => setStep("guide")} />
        <div className="px-5 pt-6">
          <p className="text-[15px] font-bold" style={{ color: G.green }}>{targetName}</p>
          <h1 className="mt-2 text-[26px] font-black leading-snug" style={{ color: G.ink }}>얼마를 보냈는지<br />알려주세요</h1>
          <p className="mt-7 text-[14px]" style={{ color: G.sub }}>보낸 금액</p>
          <div className="mt-1 flex items-end border-b-2 pb-2" style={{ borderColor: G.green }}>
            <input value={amount ? amount.toLocaleString("ko-KR") : ""} onChange={(e) => setAmount(Math.min(10000000, toNum(e.target.value)))} inputMode="numeric" placeholder="0" autoFocus
              className="min-w-0 flex-1 bg-transparent text-[36px] font-black tabular-nums outline-none" style={{ color: G.ink }} />
            <span className="pb-1.5 text-[22px] font-black" style={{ color: G.ink }}>원</span>
          </div>
          <div className="mt-4 grid grid-cols-4 gap-2">
            {[10000, 30000, 50000, 100000].map((v) => (
              <button key={v} type="button" onClick={() => setAmount((a) => Math.min(10000000, a + v))} className="h-12 rounded-xl text-[15px] font-bold active:scale-[0.97]" style={{ background: "#F2F4F6", color: G.ink }}>+{v / 10000}만</button>
            ))}
          </div>
          <p className="mt-7 text-[14px]" style={{ color: G.sub }}>이름 (통장에 적은 이름)</p>
          <input value={name} onChange={(e) => setName(e.target.value.slice(0, 20))} placeholder="ex. 김은혜" className="mt-2 w-full rounded-2xl border px-4 py-4 text-[16px] outline-none focus:border-[#1E6B63]" style={{ borderColor: G.line }} />
          <label className="mt-4 flex cursor-pointer items-center gap-3 text-[15px]" style={{ color: G.ink }}>
            <input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} className="h-5 w-5 accent-[#1E6B63]" />
            화면에는 이름 없이 보여주세요
          </label>
          <p className="mt-6 rounded-2xl p-4 text-[14px] leading-relaxed" style={{ background: "#F4F6F6", color: G.sub }}>
            {fund.displayMode === "instant" ? "알려주시면 모금 화면에 바로 반영돼요." : "알려주시면 재정부 확인 후 모금 화면에 반영돼요."}<br />실제 입금은 재정부에서 한 번 더 확인해요.
          </p>
        </div>
      </Shell>
    );
  }

  // 04 감사 · 게이지 상승
  if (step === "thanks" && sent) {
    const bp = pct(sent.before, sent.goal); const ap = pct(sent.after, sent.goal); const remain = Math.max(0, sent.goal - sent.after);
    return (
      <Shell toast={toast} white footer={<PrimaryBtn onClick={() => { setStep("main"); setSent(null); }}>다른 소원도 보기</PrimaryBtn>}>
        <div className="flex flex-col items-center px-5 pt-16 text-center">
          <span className="flex h-24 w-24 items-center justify-center rounded-full animate-in zoom-in-50 duration-500" style={{ background: G.redBg }}><Heart className="h-11 w-11" fill={G.red} stroke={G.red} /></span>
          <h1 className="mt-6 text-[26px] font-black" style={{ color: G.ink }}>고마워요{name.trim() && !anon ? `, ${name.trim()} 성도님` : ""}!</h1>
          <p className="mt-2 text-[15px]" style={{ color: G.sub }}>{won(sent.amount)}의 사랑이 더해졌어요</p>
        </div>
        <div className="mt-8 px-5">
          <div className="rounded-[22px] p-5" style={{ background: "#F4F6F6" }}>
            <div className="flex items-center justify-between"><p className="text-[16px] font-black" style={{ color: G.ink }}>{targetName}</p>{sent.goal > 0 && <p className="text-[22px] font-black" style={{ color: G.green }}>{ap}%</p>}</div>
            {sent.goal > 0 ? (
              <>
                <div className="relative mt-3 h-3 w-full overflow-hidden rounded-full" style={{ background: "#E3E7E8" }}>
                  <div className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-1000 ease-out" style={{ width: `${ap}%`, background: "#8FC7BB" }} />
                  <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${bp}%`, background: G.green }} />
                </div>
                <div className="mt-2 flex justify-between text-[13px]"><span style={{ color: G.sub }}>{bp}% → <b style={{ color: G.green }}>{ap}%</b></span><span className="tabular-nums" style={{ color: G.sub }}>{won(sent.after)} / {won(sent.goal)}</span></div>
                {remain > 0 && <p className="mt-3 text-[15px] font-bold" style={{ color: G.red }}>{won(remain)}만 더 모이면 완성돼요!</p>}
              </>
            ) : <p className="mt-2 text-[14px] tabular-nums" style={{ color: G.sub }}>지금까지 {won(sent.after)} 모였어요</p>}
            {fund.displayMode === "confirmed" && <p className="mt-2 text-[13px]" style={{ color: G.muted }}>재정부 확인 후 게이지에 반영돼요</p>}
          </div>
          <div className="mt-3 flex items-center justify-between rounded-[18px] border px-5 py-4" style={{ borderColor: G.line }}>
            <span className="text-[15px]" style={{ color: G.sub }}>전체 모금</span>
            <span className="text-[15px] tabular-nums"><b style={{ color: G.ink }}>{won(sent.totalAfter)}</b>{goalTotal > 0 && <span style={{ color: G.sub }}> · {pct(sent.totalAfter, goalTotal)}%</span>}</span>
          </div>
        </div>
      </Shell>
    );
  }

  // 05 모금 완료
  if (step === "done" && sent) return <DoneScreen fund={fund} name={targetName} goal={sent.goal} onNext={() => { setStep("main"); setSent(null); }} />;
  return <Loading />;
}

function DoneScreen({ fund, name, goal, onNext }: { fund: Fund; name: string; goal: number; onNext: () => void }) {
  useEffect(() => {
    let stop = false;
    import("canvas-confetti").then(({ default: confetti }) => {
      if (stop) return;
      confetti({ particleCount: 120, spread: 80, origin: { y: 0.35 }, colors: ["#F2C36B", "#F4A39A", "#FFFFFF", "#8FC7BB"] });
      window.setTimeout(() => !stop && confetti({ particleCount: 80, spread: 110, origin: { y: 0.3 } }), 600);
    }).catch(() => {});
    return () => { stop = true; };
  }, []);
  return (
    <div className="min-h-[100dvh]" style={{ background: G.green }}>
      <div className="mx-auto flex min-h-[100dvh] max-w-[480px] flex-col items-center px-6 pb-8 pt-20 text-center text-white">
        <span className="flex h-28 w-28 items-center justify-center rounded-full bg-white animate-in zoom-in-50 duration-500"><Check className="h-14 w-14" style={{ color: G.green }} strokeWidth={2.6} /></span>
        <p className="mt-8 text-[16px] font-bold text-white/85">{name}</p>
        <h1 className="mt-2 text-[30px] font-black">모금이 완료되었어요!</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-white/85">성도님들의 사랑이 모여<br />한 아이의 겨울이 따뜻해져요</p>
        <div className="mt-8 w-full rounded-[22px] p-5" style={{ background: "rgba(255,255,255,0.14)" }}>
          <GBar value={100} color="white" track="rgba(255,255,255,0.25)" h="h-3" />
          <div className="mt-3 flex justify-between text-[15px] font-bold"><span>100%</span><span className="tabular-nums">{won(goal)} / {won(goal)}</span></div>
        </div>
        {fund.endDate && <p className="mt-6 text-[15px] text-white/85">선물은 {mdKo(fund.endDate)}에 전해져요</p>}
        <div className="mt-auto w-full pt-10"><PrimaryBtn light onClick={onNext}>아직 남은 소원 보기</PrimaryBtn></div>
      </div>
    </div>
  );
}

// ── 06 교회 입구 9:16 화면 ─────────────────────────────
// 화면(모니터) 크기에 맞춰 9:16 판을 꽉 차게 그리고, 글자 크기는 판 너비 기준(cqw)이라 어떤 모니터에서도 같은 비율.
// 새로고침 없이 실시간으로 게이지·최근 소식이 바뀜
export function GiveDisplay() {
  const { projectId = "" } = useParams();
  const { fund, wishes, missing } = useFund(projectId);
  const [pulse, setPulse] = useState(0);
  const lastRecent = useRef<number>(0);
  useEffect(() => {
    const t = fund?.recent?.at?.toMillis?.() || 0;
    if (t && lastRecent.current && t !== lastRecent.current) setPulse((p) => p + 1);
    lastRecent.current = t;
  }, [fund?.recent]);
  useEffect(() => { if (fund) document.title = `${fund.title} · ${fund.churchName}`; }, [fund]);
  if (missing) return <Loading text="모금 페이지를 찾을 수 없어요." />;
  if (!fund) return <Loading />;
  const goal = wishes.reduce((a, w) => a + w.goal, 0);
  const shown = fund.totals.shown || fund.totals.reported;
  const p = pct(shown, goal);
  const url = `${window.location.origin}/give/${projectId}`;
  return (
    <div className="flex h-[100dvh] w-full items-center justify-center overflow-hidden" style={{ background: "#E7EBEC" }}>
      <div className="relative overflow-hidden" style={{ width: "min(100vw, calc(100dvh * 9 / 16))", aspectRatio: "9 / 16", background: "linear-gradient(180deg, #F7F9F9 0%, #EBF0EF 100%)", containerType: "inline-size" }}>
        <style>{`
          @keyframes lrBreath { 0%,100%{transform:scale(1)} 50%{transform:scale(1.035)} }
          @keyframes lrGlow { 0%,100%{opacity:.35} 50%{opacity:.9} }
          @keyframes lrShine { 0%{transform:translateX(-140%) skewX(-18deg)} 55%,100%{transform:translateX(260%) skewX(-18deg)} }
          @keyframes lrFloat { 0%{transform:translateY(4cqw) scale(.7);opacity:0} 12%{opacity:.5} 80%{opacity:.35} 100%{transform:translateY(-120cqw) scale(1.15);opacity:0} }
          @keyframes lrNudge { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-1.1cqw)} }
        `}</style>
        {/* 배경에서 천천히 떠오르는 하트들(은은하게 반복) */}
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
          {[{l:"12cqw",d:"0s",dur:"9s",sz:"5cqw",c:"rgba(216,102,91,0.16)"},{l:"44cqw",d:"3.2s",dur:"11s",sz:"3.6cqw",c:"rgba(30,107,99,0.14)"},{l:"72cqw",d:"1.6s",dur:"10s",sz:"4.6cqw",c:"rgba(227,176,85,0.18)"},{l:"86cqw",d:"5s",dur:"12s",sz:"3cqw",c:"rgba(216,102,91,0.12)"}].map((h,i)=>(
            <Heart key={i} className="absolute bottom-0" style={{ left:h.l, width:h.sz, height:h.sz, color:h.c, fill:h.c, animation:`lrFloat ${h.dur} ease-in ${h.d} infinite` }} />
          ))}
        </div>
        <div className="relative z-10 flex h-full flex-col" style={{ padding: "4.8cqw 6cqw 4.5cqw" }}>
          <p className="font-black tracking-[0.14em]" style={{ color: G.green, fontSize: "3cqw" }}>{fund.title.toUpperCase()} {yearOf(fund)}</p>
          <h1 className="mt-[1cqw] whitespace-pre-line break-keep font-black leading-[1.16]" style={{ color: G.ink, fontSize: "6.9cqw", wordBreak: "keep-all" }}>{fund.headline || `${fund.title}에\n함께해 주세요`}</h1>
          <div className="relative mt-[2.4cqw] flex items-center overflow-hidden rounded-[5cqw] text-white" style={{ background: "linear-gradient(145deg, #1C5C55 0%, #123F3A 100%)", padding: "4.2cqw 5cqw", gap: "4.8cqw", boxShadow: "0 1.4cqw 3.6cqw rgba(18,63,58,0.3)" }}>
            <span className="pointer-events-none absolute inset-y-0 w-[40%]" style={{ left: 0, background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.14), transparent)", animation: "lrShine 7s ease-in-out infinite" }} aria-hidden />
            <div className="relative shrink-0" style={{ width: "27cqw", height: "27cqw", animation: "lrBreath 4.5s ease-in-out infinite" }}>
              <svg viewBox="0 0 100 100" className="h-full w-full" style={{ transform: "rotate(-90deg)" }}>
                <circle cx="50" cy="50" r="43" fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="8.5" />
                <circle cx="50" cy="50" r="43" fill="none" stroke="#FFFFFF" strokeWidth="8.5" strokeLinecap="round" strokeDasharray={2 * Math.PI * 43} strokeDashoffset={2 * Math.PI * 43 * (1 - Math.min(p, 100) / 100)} style={{ transition: "stroke-dashoffset 1.1s ease-out", filter: "drop-shadow(0 0 1.2cqw rgba(255,255,255,0.65))", animation: "lrGlow 3s ease-in-out infinite" }} />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="font-black leading-none tabular-nums" style={{ fontSize: "8.4cqw" }}>{p}<span style={{ fontSize: "4.4cqw" }}>%</span></span>
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold" style={{ fontSize: "3.6cqw", color: "#BFE3DA" }}>함께 모은 사랑</p>
              <p className="mt-[0.8cqw] font-black tabular-nums leading-none" style={{ fontSize: "6.6cqw" }}>{won(shown)}</p>
              <p className="mt-[1cqw] font-bold tabular-nums" style={{ fontSize: "3.2cqw", color: "rgba(255,255,255,0.72)" }}>목표 {won(goal)}</p>
              <span className="mt-[2cqw] inline-flex items-center rounded-full font-bold" style={{ background: "rgba(255,255,255,0.14)", fontSize: "3cqw", padding: "1.1cqw 2.8cqw", gap: "1.4cqw" }}>
                <Heart style={{ width: "3.2cqw", height: "3.2cqw" }} fill="#FFB4A8" color="#FFB4A8" />{fund.totals.count}명이 함께했어요
              </span>
            </div>
          </div>
          <div className="mt-[1.8cqw] grid grid-cols-2" style={{ gap: "1.8cqw" }}>
            {wishes.slice(0, 6).map((w) => {
              const wp = pct(w.raised, w.goal); const full = w.goal > 0 && w.raised >= w.goal;
              return (
                <div key={w.id} className="relative rounded-[4cqw]" style={{ padding: "2.6cqw", background: full ? "#FFF5F3" : "white", boxShadow: full ? "0 0.8cqw 2.4cqw rgba(200,75,66,0.16)" : "0 0.8cqw 2.4cqw rgba(16,24,32,0.07)" }}>
                  <div className="flex items-start justify-between">
                    <span className="flex items-center justify-center overflow-hidden rounded-[2.2cqw]" style={{ width: "6cqw", height: "6cqw", background: full ? G.redBg : G.greenBg, color: full ? "#C84B42" : G.green }}>
                      {w.imageUrl ? <img src={w.imageUrl} alt="" className="h-full w-full object-cover" /> : <WishIcon name={w.name} className="h-[62%] w-[62%]" />}
                    </span>
                    {full && <span className="rounded-full font-black text-white" style={{ background: "#C84B42", fontSize: "2.3cqw", padding: "0.8cqw 2.2cqw" }}>모금 완료</span>}
                  </div>
                  <p className="mt-[1.5cqw] truncate font-black" style={{ color: G.ink, fontSize: "4.2cqw" }}>{w.name}</p>
                  <div className="mt-[1.4cqw] overflow-hidden rounded-full" style={{ height: "2.4cqw", background: "#EBEEEE" }}>
                    <div className="h-full rounded-full transition-[width] duration-1000" style={{ width: `${wp}%`, background: full ? "#C84B42" : G.greenDark }} />
                  </div>
                  <div className="mt-[1.4cqw] flex items-end justify-between">
                    <span className="font-bold tabular-nums" style={{ color: G.sub, fontSize: "2.9cqw" }}>{(w.raised).toLocaleString("ko-KR")} / {w.goal.toLocaleString("ko-KR")}원</span>
                    <span className="font-black tabular-nums" style={{ color: full ? "#C84B42" : G.greenDark, fontSize: "4.2cqw" }}>{wp}%</span>
                  </div>
                </div>
              );
            })}
          </div>
          {fund.randomGift.enabled && (
            <div className="mt-[1.8cqw] flex items-center rounded-[4cqw]" style={{ background: "#FFF8EA", padding: "2.5cqw 3.2cqw", gap: "3cqw", boxShadow: "0 0.8cqw 2.4cqw rgba(227,176,85,0.18)" }}>
              <span className="flex shrink-0 items-center justify-center rounded-[2.4cqw]" style={{ width: "7.4cqw", height: "7.4cqw", background: "#F7E3B4", color: G.goldInk }}><Gift className="h-[60%] w-[60%]" strokeWidth={1.8} /></span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-[1.5cqw]"><span className="font-black" style={{ color: G.ink, fontSize: "4.1cqw" }}>{fund.randomGift.label || "랜덤 선물"}</span><span className="rounded-full font-bold" style={{ background: "#FCE6BD", color: G.goldInk, fontSize: "2.2cqw", padding: "0.6cqw 1.8cqw" }}>어디든 OK</span></p>
                {fund.randomGift.desc && <p className="mt-[0.8cqw] truncate font-medium" style={{ color: G.sub, fontSize: "2.9cqw" }}>{fund.randomGift.desc}</p>}
              </div>
              <div className="text-right"><p className="font-black tabular-nums" style={{ color: G.goldInk, fontSize: "4.8cqw" }}>{won(fund.totals.random)}</p><p className="font-medium" style={{ color: G.sub, fontSize: "2.8cqw" }}>모였어요</p></div>
            </div>
          )}
          {fund.recent?.wishName && (
            <div key={pulse} className="mt-[1.8cqw] flex items-center rounded-[4cqw] bg-white animate-in slide-in-from-bottom-2 duration-500" style={{ padding: "2.5cqw 3.5cqw", gap: "2.5cqw", boxShadow: "0 0.8cqw 2.4cqw rgba(16,24,32,0.07)" }}>
              <Heart className={pulse ? "animate-pulse" : ""} style={{ width: "4cqw", height: "4cqw", color: "#C84B42" }} fill="#C84B42" />
              <p className="font-bold" style={{ color: G.ink, fontSize: "3.8cqw" }}>방금 <span style={{ color: G.green }}>{fund.recent.wishName}</span>에 사랑이 더해졌어요</p>
            </div>
          )}
          {fund.displayShowQr && (<>
            <div className="flex-1" style={{ minHeight: "3.5cqw" }} />
            <div className="flex items-center rounded-[4.5cqw] bg-white" style={{ padding: "3cqw", gap: "4cqw", boxShadow: "0 1cqw 3cqw rgba(16,24,32,0.1)", animation: "lrNudge 3.2s ease-in-out infinite" }}>
              <div className="shrink-0 rounded-[1.5cqw] bg-white" style={{ width: "18cqw", height: "18cqw" }}>
                <QRCodeSVG value={url} style={{ width: "100%", height: "100%" }} marginSize={0} level="M" />
              </div>
              <div>
                <p className="font-black leading-tight" style={{ color: G.ink, fontSize: "5.6cqw" }}>휴대폰 카메라로<br />찍어보세요</p>
                <p className="mt-[1.5cqw] font-bold" style={{ color: G.sub, fontSize: "3.2cqw" }}>앱 설치 없이 바로 함께할 수 있어요</p>
              </div>
            </div></>
          )}
        </div>
        {!fund.displayShowQr && <Sparkles className="absolute bottom-[4cqw] right-[4cqw] text-[#C9D6D3]" style={{ width: "6cqw", height: "6cqw" }} />}
      </div>
    </div>
  );
}

export default GivePage;
