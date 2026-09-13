import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router";
import { db } from "../../firebase";
import { doc, getDoc, collection, query, where, orderBy, limit, getDocs, updateDoc, increment } from "firebase/firestore";
import { Card } from "../components/ui/card";
import { getPageBgGradientClass, isLightPageBgTheme } from "../../utils/pageBgThemes";
import { isCustomBulletinTemplate, isWarmIvoryFamily } from "../../utils/bulletinTemplates";
import { resolveEffectiveTemplateId, isCustomDesignFreePeriod, type CustomDesignConfig } from "../../utils/customDesignAccess";
import { SAMPLE_BULLETIN } from "../../utils/sampleBulletin";
import { churchLogoHeightClass } from "../../utils/churchLogo";
import { BulletinMenu } from "./bulletin/BulletinMenu";
import { WarmIvoryTemplate } from "./bulletinTemplates/WarmIvoryTemplate";
import { WarmIvoryOpenTemplate } from "./bulletinTemplates/WarmIvoryOpenTemplate";
import { PastoralColumnSection } from "./bulletin/PastoralColumnSection";
import {
  Lock,
  Loader2,
  ChevronLeft,
  Megaphone,
  Music,
  Youtube,
  Wallet,
  Copy,
  Check,
  BookOpen,
  Mic2,
  AlertCircle,
  Calendar,
  Clock,
  Sparkles,
  MapPin,
  Sun,
  ChevronRight,
  MessageSquare,
  ListOrdered,
  ChevronDown,
  Quote,
  Instagram
} from "lucide-react";
import { Button } from "../components/ui/button";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";

const STAYON_DEFAULT_BG = "/stayon_kakao_pr.png";


export function BulletinView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [bulletin, setBulletin] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [shortcutActiveIndex, setShortcutActiveIndex] = useState(0);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  // "커스텀 디자인" 탭의 아이폰 미리보기(iframe)에서만 켜지는 모드. 고정 데모 데이터로
  // 선택한 템플릿을 요금제·권한과 무관하게 그대로 보여준다.
  const [isSampleMode, setIsSampleMode] = useState(false);
  const [selectedSection, setSelectedSection] = useState<any>(null);
  // 커스텀 디자인(주보 템플릿) 사용 권한 판정용. 유료화 설정 + 작성 교회 계정 데이터.
  // 유료화 시작일 전에는 계정 데이터를 읽지 않고(무료 기간) 저장된 템플릿을 그대로 쓴다.
  const [customDesignConfig, setCustomDesignConfig] = useState<CustomDesignConfig | null>(null);
  const [authorAccount, setAuthorAccount] = useState<any>(null);
  // "말씀 적용 질문" 각 항목은 아코디언처럼 접혀있다가, 눌렀을 때 펼쳐진다. 하나를 펼쳐도
  // 다른 항목이 접히지 않도록(동시에 여러 개 펼침 가능) id 목록으로 펼침 상태를 관리한다.
  const [expandedQuestionIds, setExpandedQuestionIds] = useState<Set<string>>(new Set());
  const toggleQuestion = (id: string) => {
    setExpandedQuestionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    const fetchBulletin = async () => {
      // 1. URL 쿼리 파라미터 확인 (미리보기 모드인지)
      const searchParams = new URLSearchParams(location.search);
      const isPreview = searchParams.get("mode") === "preview";

      // 0. 커스텀 디자인 미리보기(고정 데모 데이터). Firestore/조회수 집계 없음.
      if (searchParams.get("mode") === "sample") {
        const tpl = searchParams.get("template") || "default";
        const logoSize = searchParams.get("logosize");
        setBulletin({ ...SAMPLE_BULLETIN, bulletinTemplate: tpl, ...(logoSize ? { churchLogoSize: logoSize } : {}) });
        setIsSampleMode(true);
        setLoading(false);
        return;
      }

      if (isPreview) {
        const savedTemp = localStorage.getItem("temp_bulletin");
        if (savedTemp) {
          setBulletin(JSON.parse(savedTemp));
          setIsPreviewMode(true);
          setLoading(false);
          return;
        }
      }

      // 2. ID가 없는 경우 (새 주보 작성 중 미리보기 대응)
      if (!id || id === "new") {
        const savedTemp = localStorage.getItem("temp_bulletin");
        if (savedTemp) {
          setBulletin(JSON.parse(savedTemp));
          setIsPreviewMode(true);
        }
        setLoading(false);
        return;
      }

      try {
        const docRef = doc(db, "bulletins", id);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          setBulletin(docSnap.data());
          setLoading(false);
          // 실제 열람 시점에 조회수 집계. 실패해도 열람 자체는 막지 않도록 별도 처리
          updateDoc(docRef, { views: increment(1) }).catch((err) => console.error("조회수 반영 실패:", err));
          return;
        }

        const bulletinsRef = collection(db, "bulletins");
        const q = query(
          bulletinsRef,
          where("authorId", "==", id),
          where("status", "==", "published"),
          orderBy("publishedAt", "desc"),
          limit(1)
        );

        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          const latestDoc = querySnapshot.docs[0];
          setBulletin(latestDoc.data());
          updateDoc(latestDoc.ref, { views: increment(1) }).catch((err) => console.error("조회수 반영 실패:", err));
        } else {
          // DB에도 없고 로컬스토리지에도 없으면 빈 상태
          setBulletin(null);
        }

      } catch (error: any) {
        console.error("로딩 에러:", error.message);
      } finally {
        setLoading(false);
      }
    };

    fetchBulletin();
  }, [id, location]);

  // 커스텀 디자인 사용 권한 판정에 필요한 데이터 로드.
  //  - settings/customDesign: 유료화 시작일 등 (항상 읽음, 아주 작은 문서)
  //  - users/{authorId}: 유료화 이후 + 커스텀 템플릿일 때만 읽어서 요금제 확인
  useEffect(() => {
    if (!bulletin || isPreviewMode || isSampleMode) return;
    let cancelled = false;
    (async () => {
      let config: CustomDesignConfig = {};
      try {
        const snap = await getDoc(doc(db, "settings", "customDesign"));
        if (snap.exists()) config = snap.data() as CustomDesignConfig;
      } catch { /* 설정 없으면 기본값(무료 기간)으로 취급 */ }
      if (cancelled) return;
      setCustomDesignConfig(config);

      if (isCustomDesignFreePeriod(config)) return; // 무료 기간엔 요금제 확인 불필요
      if (!isCustomBulletinTemplate(bulletin?.bulletinTemplate)) return;
      if (!bulletin?.authorId) return;
      try {
        const uSnap = await getDoc(doc(db, "users", bulletin.authorId));
        if (!cancelled && uSnap.exists()) setAuthorAccount(uSnap.data());
      } catch { /* 계정 못 읽으면 권한 없음으로 처리 → 기본 디자인 */ }
    })();
    return () => { cancelled = true; };
  }, [bulletin, isPreviewMode, isSampleMode]);

  const handleCopyAccount = (text: string) => {
    if (!text) return;

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text)
        .then(() => {
          setCopied(true);
          toast.success("계좌번호가 복사되었습니다.");
          setTimeout(() => setCopied(false), 2000);
        })
        .catch(() => fallbackCopyTextToClipboard(text));
    } else {
      fallbackCopyTextToClipboard(text);
    }
  };

  const fallbackCopyTextToClipboard = (text: string) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
      document.execCommand('copy');
      setCopied(true);
      toast.success("계좌번호가 복사되었습니다.");
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error("복사에 실패했습니다.");
    }

    document.body.removeChild(textArea);
  };

  // 상단 바로가기 캡슐 버튼 클릭 시 해당 섹션으로 부드럽게 스크롤 이동
  const scrollToSection = (sectionId: string) => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // 상단 바로가기 세그먼트 컨트롤에 표시할 항목 (내용이 있는 섹션만). early return보다 위에서
  // 미리 계산해둬야 아래 스크롤 감지 useEffect에서도, 아래쪽 렌더링에서도 동일하게 재사용할 수 있다.
  const shortcutItems = [
    bulletin?.sections && bulletin.sections.length > 0 && { id: "section-worship", label: "주일 예배" },
    bulletin?.announcements && bulletin.announcements.length > 0 && { id: "section-news", label: "교회 소식" },
  ].filter(Boolean) as { id: string; label: string }[];
  const SEGMENT_WIDTH = 78;

  // 사용자가 버튼을 누르지 않고 직접 스크롤해도, 지금 화면 상단에 걸쳐 있는 섹션에 맞춰
  // 버튼 활성 상태가 자동으로 따라오도록 스크롤 위치를 감지한다.
  // (IntersectionObserver의 rootMargin 방식은 상단 히어로 배너가 커서 페이지 맨 위에서는
  //  어떤 섹션도 감지 영역에 안 걸리는 문제가 있어, 더 단순하고 확실한 스크롤 기준선 방식을 사용)
  useEffect(() => {
    if (shortcutItems.length === 0) return;

    const REFERENCE_Y = 120; // 화면 상단에서 이 지점을 "지금 보고 있는 섹션" 기준선으로 삼는다

    const handleScroll = () => {
      let currentIdx = 0;
      for (let i = 0; i < shortcutItems.length; i++) {
        const el = document.getElementById(shortcutItems[i].id);
        if (!el) continue;
        // 기준선을 이미 지나쳐 올라간(= 화면 위쪽에 위치한) 섹션 중 가장 마지막(가장 아래) 섹션을 선택
        if (el.getBoundingClientRect().top <= REFERENCE_Y) {
          currentIdx = i;
        }
      }
      setShortcutActiveIndex(currentIdx);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [bulletin, shortcutItems.length]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#111827] flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-white animate-spin" />
      </div>
    );
  }

  if (!bulletin) {
    return (
      <div className="min-h-screen bg-[#111827] flex flex-col items-center justify-center text-white p-6 text-center">
        <div className="bg-white/10 p-8 rounded-[2.5rem] backdrop-blur-xl border border-white/10 w-full max-w-sm shadow-2xl">
          <h2 className="text-2xl font-black mb-2">게시된 주보가 없습니다</h2>
          <p className="text-gray-400 mb-8 text-sm">관리자가 주보를 발행할 때까지 기다려주세요.</p>
          <Button onClick={() => navigate("/admin")} className="w-full rounded-2xl bg-blue-600 py-7 font-bold">메인으로 돌아가기</Button>
        </div>
      </div>
    );
  }

  const headerBgImage = bulletin.backgroundImage || STAYON_DEFAULT_BG;
  // 흰 카드 바깥(섹션 제목/아이콘 등)은 기본적으로 흰 글씨인데, 밝은 배경(화이트 등)을
  // 고른 경우에는 어두운 색으로 자동 전환해서 대비를 유지한다.
  const isLightBg = isLightPageBgTheme(bulletin?.pageBgTheme);
  // "기본"이 아닌 커스텀 디자인 템플릿을 고른 경우, 그 템플릿 고유의 배경을 쓰고
  // 주보 화면 배경색(pageBgTheme) 선택은 무시한다.
  // 단, 유료화(2027-01-01~) 이후 작성 교회가 프로 요금제가 아니면 저장된 커스텀 템플릿을
  // 무시하고 "기본"으로 표시한다(미리보기 모드는 관리자 본인 편집이므로 저장값 그대로).
  const effectiveTemplateId = (isPreviewMode || isSampleMode)
    ? (bulletin?.bulletinTemplate || "default")
    : resolveEffectiveTemplateId({
        templateId: bulletin?.bulletinTemplate,
        config: customDesignConfig,
        userData: authorAccount,
      });
  const isCustomTemplate = isCustomBulletinTemplate(effectiveTemplateId);
  const pageBgClass = isCustomTemplate ? "bg-[#FDFAF5]" : getPageBgGradientClass(bulletin?.pageBgTheme);

  return (

    <div className={`min-h-screen ${pageBgClass} flex flex-col items-center font-sans pb-20 overflow-x-hidden animate-in fade-in duration-700`}>
      {/* /admin/editor 커스텀 디자인 탭의 아이폰 미리보기(iframe)에서만: 실제 성도 화면에선
          운영체제/브라우저 기본 스크롤바가 보이든 말든 상관없지만, 작은 목업 안에 들어가면
          그 스크롤바가 눈에 거슬리게 두드러져 보인다(특히 항상 두꺼운 스크롤바를 쓰는
          환경에서). 이 모드에서만 스크롤 자체는 그대로 두고 스크롤바만 숨긴다. */}
      {isSampleMode && (
        <style>{`html, body { scrollbar-width: none; } html::-webkit-scrollbar, body::-webkit-scrollbar { width: 0; height: 0; display: none; }`}</style>
      )}
      {/* 우측 상단 메뉴 (실제 발행 주보에서만) */}
      {id && !isPreviewMode && !isSampleMode && (
        <BulletinMenu
          bulletinId={id}
          churchLogo={bulletin.churchLogo}
          variant="over-hero"
          accent={isWarmIvoryFamily(effectiveTemplateId) ? "#2F5C52" : "#2563eb"}
          pastoralColumnsEnabled={bulletin.pastoralColumnsEnabled !== false}
        />
      )}
      {/* 토스 스타일의 미리보기 알림 바 */}
      {isPreviewMode && (
        <div className="w-full bg-blue-600 text-white py-3 px-4 flex items-center justify-center gap-2 sticky top-0 z-[100] shadow-lg animate-in slide-in-from-top duration-500 font-medium text-sm">
          <AlertCircle className="w-4 h-4" />
          현재는 <b>미리보기 모드</b>입니다. (발행 전 상태)
        </div>
      )}

      {/* <div className="w-full max-w-md p-4"> */}
      <div className="w-full max-w-md p-0 sm:p-2">
        {/* <div className="flex justify-between items-center mb-6 mt-4 px-2 text-white">
          <button onClick={() => window.close()} className="hover:opacity-70 transition-opacity bg-white/10 p-2 rounded-full"><ChevronLeft className="w-5 h-5" /></button>
          <h1 className="text-lg font-bold tracking-tight">온라인 주보</h1>
          <button onClick={() => navigate("/login")} className="p-2 bg-white/10 rounded-full border border-white/10 hover:bg-white/20 transition-all"><Lock className="w-4 h-4" /></button>
        </div> */}

        {isCustomTemplate && effectiveTemplateId === "warm-ivory" ? (
          <WarmIvoryTemplate
            bulletin={bulletin}
            bulletinId={id}
            expandedQuestionIds={expandedQuestionIds}
            toggleQuestion={toggleQuestion}
            setExpandedQuestionIds={setExpandedQuestionIds}
            setSelectedSection={setSelectedSection}
            copied={copied}
            handleCopyAccount={handleCopyAccount}
          />
        ) : isCustomTemplate && effectiveTemplateId === "warm-ivory-open" ? (
          <WarmIvoryOpenTemplate
            bulletin={bulletin}
            bulletinId={id}
            expandedQuestionIds={expandedQuestionIds}
            toggleQuestion={toggleQuestion}
            setExpandedQuestionIds={setExpandedQuestionIds}
            setSelectedSection={setSelectedSection}
            copied={copied}
            handleCopyAccount={handleCopyAccount}
          />
        ) : (
        <>
        <Card className="overflow-hidden rounded-[2.5rem] border-0 bg-white mt-3 ml-1.5 mr-1.5 gap-0">
          <div
            className="relative h-auto min-h-[300px] bg-cover bg-center flex flex-col items-center justify-center text-white px-6 py-6"
            style={{
              backgroundImage: `linear-gradient(rgba(0,0,0,0.3), rgba(0,0,0,0.85)), url(${headerBgImage})`
            }}
          >
            <span className="text-[10px] mb-3 font-black tracking-[0.2em] bg-white/20 px-5 py-2 rounded-full border border-white/30 backdrop-blur-md uppercase">
              {bulletin.date}
            </span>
            {/* 설교 제목 - titleFontSize가 있으면(관리자가 직접 조절, 18~32px) 그 값을 쓰고,
                없는 예전 주보는 기존처럼 글자수에 따라 자동으로 크기를 줄인다. */}
            <h2
              className={`font-black mb-2 text-center leading-tight drop-shadow-lg whitespace-pre-line px-1 ${bulletin.titleFontSize ? '' : (bulletin.title || "").length > 15
                ? 'text-2xl'
                : (bulletin.title || "").length > 10
                  ? 'text-3xl'
                  : 'text-4xl'
                }`}
              style={bulletin.titleFontSize ? { fontSize: `${bulletin.titleFontSize}px` } : undefined}
            >
              {bulletin.title || "주일 예배"}
            </h2>
            <p className="text-sm font-bold text-blue-300 mb-4 tracking-wide drop-shadow-md flex items-center gap-1">
              <Mic2 className="w-3.5 h-3.5" /> {bulletin.subtitle || "말씀 선포"}
            </p>

            <div className="bg-black/30 px-6 py-3.5 rounded-[1.5rem] border border-white/10 backdrop-blur-sm text-center max-w-[90%]">
              <p className="text-[11px] text-blue-200 font-bold mb-1 tracking-tighter uppercase flex items-center justify-center gap-1">
                <BookOpen className="w-3 h-3" /> Today's Scripture
              </p>
              <p className="text-xs font-medium leading-relaxed whitespace-pre-line">{bulletin.scripture || "본문 준비 중"}</p>
            </div>
          </div>

          {/* 교회 로고: 대표 사진 바로 아래, 모든 내용보다 먼저 흰색 띠로 표시 */}
          {bulletin.churchLogoEnabled !== false && bulletin.churchLogo && (
            <div className="bg-white border-b border-slate-100 py-5 px-6 flex items-center justify-center">
              <img src={bulletin.churchLogo} alt="교회 로고" className={`${churchLogoHeightClass(bulletin.churchLogoSize)} w-auto max-w-full object-contain`} />
            </div>
          )}

          {/* 바로가기 세그먼트 컨트롤: 내용이 있는 섹션만 노출, 누르면 선택 배경이 스르륵 이동하며 해당 섹션으로 스크롤.
              Card 자체의 기본 gap(gap-6)을 gap-0으로 없앤 상태라, 위아래 간격은 여기 padding으로만 직접 결정된다. */}
          {shortcutItems.length > 0 && (
            <div className="flex justify-center pt-4">
              <div className="relative inline-flex bg-slate-100 rounded-full p-1">
                <div
                  className="absolute top-1 bottom-1 left-1 rounded-full bg-white shadow-sm transition-transform duration-300 ease-out"
                  style={{ width: SEGMENT_WIDTH, transform: `translateX(${shortcutActiveIndex * SEGMENT_WIDTH}px)` }}
                />
                {shortcutItems.map((item, idx) => (
                  <button
                    key={item.id}
                    type="button"
                    style={{ width: SEGMENT_WIDTH }}
                    onClick={() => {
                      setShortcutActiveIndex(idx);
                      scrollToSection(item.id);
                    }}
                    className={`relative z-10 h-8 rounded-full text-[11px] tracking-tight transition-colors duration-300 ${shortcutActiveIndex === idx ? "text-slate-900 font-extrabold" : "text-slate-400 font-bold"
                      }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className={`p-4 space-y-9 ${shortcutItems.length === 0 ? "pt-10" : ""}`}>
            {(bulletin.prayer || bulletin.nextPrayer) && (
              <div className="bg-gray-50/80 rounded-[1.75rem] p-4 border border-gray-100 flex items-center justify-around">
                {bulletin.prayer && (
                  <div className="text-center">
                    <p className="text-[10px] text-blue-500 font-black mb-1 uppercase tracking-tighter">금주 기도</p>
                    <p className="text-gray-800 font-bold text-[15px]">{bulletin.prayer}</p>
                  </div>
                )}
                {bulletin.prayer && bulletin.nextPrayer && <div className="h-8 w-[1px] bg-gray-200"></div>}
                {bulletin.nextPrayer && (
                  <div className="text-center">
                    <p className="text-[10px] text-gray-400 font-black mb-1 uppercase tracking-tighter">다음주 기도</p>
                    <p className="text-gray-800 font-bold text-[15px]">{bulletin.nextPrayer}</p>
                  </div>
                )}
              </div>
            )}

            {bulletin.youtubeId && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="flex items-center gap-4 mb-4">
                  <div className="h-[1px] flex-1 bg-gray-100"></div>
                  <div className="flex items-center gap-2">
                    <Music className="w-3.5 h-3.5 text-red-500" />
                    <h3 className="font-bold text-gray-400 text-[10px] tracking-[0.2em] uppercase">Weekly Worship</h3>
                  </div>
                  <div className="h-[1px] flex-1 bg-gray-100"></div>
                </div>

                <a
                  href={bulletin.youtubeId.startsWith('http') ? bulletin.youtubeId : `https://www.youtube.com/results?search_query=${bulletin.youtubeId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="group block relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-red-500 to-rose-600 p-[1px] shadow-xl shadow-red-500/10 active:scale-[0.98] transition-all"
                >
                  <div className="bg-white rounded-[1.95rem] p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center shrink-0">
                        <Youtube className="w-6 h-6 text-red-500" />
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-800 text-sm">찬양 영상 미리보기</h4>
                        <p className="text-[11px] text-gray-400">성도들과 함께 찬양을 준비해요</p>
                      </div>
                    </div>
                    <div className="w-10 h-10 bg-gray-50 group-hover:bg-red-50 rounded-full flex items-center justify-center transition-colors">
                      <ChevronLeft className="w-4 h-4 text-gray-300 group-hover:text-red-500 rotate-180" />
                    </div>
                  </div>
                </a>
              </div>
            )}

            {bulletin.sections && bulletin.sections.length > 0 && (
              <div className="space-y-9" id="section-worship">
                {bulletin.sundayServices && bulletin.sundayServices.length > 0 && (
                  <div className="animate-in fade-in duration-500">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="h-[1px] flex-1 bg-gray-100"></div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-blue-600" />
                        <h3 className="font-extrabold text-gray-400 text-[10px] tracking-[0.2em] uppercase">
                          Worship & Times
                        </h3>
                      </div>
                      <div className="h-[1px] flex-1 bg-gray-100"></div>
                    </div>

                    <div className="bg-white rounded-[1.8rem] px-2 py-2 border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
                      <div className="divide-y divide-slate-50">
                        {bulletin.sundayServices.map((service: any, index: number) => {
                          let name = "";
                          let time = "";
                          let location = "";

                          if (typeof service === "string") {
                            const parts = service.split(",").map((s) => s.trim());
                            name = parts[0] || "주일 예배";
                            time = parts[1] || "";
                            location = parts[2] || "";
                          } else if (typeof service === "object" && service !== null) {
                            name = service.name || "주일 예배";
                            time = service.time || "";
                            location = service.location || "";
                          }

                          return (
                            <div
                              key={index}
                              className="py-3 px-2.5 first:pt-2 last:pb-2 flex items-center justify-between gap-2 transition-all"
                            >
                              {/* 좌측: 예배명 & 장소 */}
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />

                                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                  {/* <span className="font-bold text-slate-800 text-[14px] sm:text-[15px] tracking-tight shrink-0"> */}
                                  <span className="font-bold text-[15px] sm:text-[14px]">
                                    {name}
                                  </span>
                                  {location && (
                                    <span className="text-xs font-medium text-slate-400">
                                      {location}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* 우측: 시간 안내 (텍스트 위주로 깔끔하게 정돈) */}
                              {time && (
                                <div className="flex items-center gap-1.5 text-slate-700 font-bold text-xs sm:text-sm tracking-tight bg-slate-50/80 px-2.5 py-1 rounded-xl shrink-0">
                                  <Clock className="w-3.5 h-3.5 text-blue-500/80 shrink-0" />
                                  <span>{time}</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <div className="flex items-center gap-4 mb-3">
                    <div className="h-[1px] flex-1 bg-gray-100"></div>
                    <div className="flex items-center gap-1.5">
                      <ListOrdered className="w-3.5 h-3.5 text-blue-600" />
                      <h3 className="font-extrabold text-gray-400 text-[10px] tracking-[0.2em] uppercase">
                        Sunday Worship Time
                      </h3>
                    </div>
                    <div className="h-[1px] flex-1 bg-gray-100"></div>
                  </div>

                  {/* 특별 주일(선택) - "어린이 주일", "어버이 주일" 등. 비워두면 렌더 안 됨.
                      좌측엔 "예배 순서" 고정 라벨, 우측엔 입력한 특별 주일 내용. */}
                  {bulletin.specialSunday && (
                    <div className="flex items-center justify-between mb-3 px-1">
                      <span className="font-extrabold text-slate-700 text-[16px]">예배 순서</span>
                      <span className="font-bold text-blue-600 text-sm">{bulletin.specialSunday}</span>
                    </div>
                  )}

                  <div className="space-y-0.5">
                    {bulletin.sections.map((section: any, index: number) => {
                      const hasContent = section.content && section.content.trim() !== "";

                      return (
                        <div
                          key={index}
                          onClick={() => {
                            if (hasContent) {
                              setSelectedSection(section); // 내용이 있으면 모달 팝업 띄우기
                            }
                          }}
                          className={`flex justify-between items-start gap-3 py-3.5 border-b border-gray-50 last:border-0 px-2 rounded-2xl transition-colors ${hasContent ? 'cursor-pointer hover:bg-blue-50/60 group' : 'hover:bg-gray-50/50'
                            }`}
                        >
                        <div className="flex flex-col min-w-0">
                          {/* <span className={`text-gray-800 font-black text-lg flex items-center gap-2 ${hasContent ? 'group-hover:text-blue-600 transition-colors' : ''}`}>
                            {section.label}
                            {hasContent && (
                              <span className="text-[10px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                                <Sparkles className="w-3 h-3" /> 상세보기
                              </span>
                            )}
                          </span> */}

                          <span className={`text-gray-800 font-bold text-[16px] sm:text-[15px] flex items-center gap-2 ${hasContent ? 'group-hover:text-blue-600 transition-colors' : ''}`}>
                            {section.label}
                            {hasContent && (
                              <span className="text-xs font-semibold text-slate-400 flex items-center group-hover:text-blue-500 transition-colors">
                                보기 <ChevronRight className="w-3.5 h-3.5 -ml-0.5" />
                              </span>
                            )}
                          </span>
                          {section.preview && section.preview.trim() !== "" && (
                            <p className="text-[13px] text-gray-500 leading-relaxed whitespace-pre-line line-clamp-3 mt-1 pr-2">
                              {section.preview}
                            </p>
                          )}
                        </div>
                        <span className="font-bold text-gray-500 text-sm text-right max-w-[140px] shrink-0">{section.value || "-"}</span>
                      </div>
                    );
                  })}
                  </div>
                </div>
              </div>
            )}

            {bulletin.announcements && bulletin.announcements.length > 0 && (
              <div id="section-news">
                <div className="flex items-center gap-4 mb-4">
                  <div className="h-[1px] flex-1 bg-gray-100"></div>
                  <div className="flex items-center gap-2">
                    <Megaphone className="w-3.5 h-3.5 text-orange-400" />
                    <h3 className="font-bold text-gray-400 text-[10px] tracking-[0.2em] uppercase">Church News</h3>
                  </div>
                  <div className="h-[1px] flex-1 bg-gray-100"></div>
                </div>

                <div className="space-y-2.5">
                  {bulletin.announcements.map((ann: any, index: number) => (
                    <div key={index} className="bg-gray-50/80 rounded-[1.5rem] p-4 border border-white shadow-sm">
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className="w-1.5 h-1.5 bg-orange-400 rounded-full shrink-0"></div>
                        <h4 className="font-black text-gray-900 text-base tracking-tight leading-snug">
                          {ann.title}
                        </h4>
                      </div>

                      {ann.content && (
                        <p className="text-gray-600 text-[13px] leading-relaxed whitespace-pre-wrap font-medium pl-3.5">
                          {ann.content}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {bulletin.sundayEveningService && bulletin.sundayEveningService.enabled !== false && (
              <div className="animate-in fade-in duration-300">
                <div className="flex items-center gap-4 mb-4">
                  <div className="h-[1px] flex-1 bg-slate-200/60"></div>
                  <div className="flex items-center gap-2">
                    <Sun className="w-3.5 h-3.5 text-indigo-600" />
                    <h3 className="font-extrabold text-slate-400 text-[11px] tracking-[0.2em] uppercase">Sunday Evening Service</h3>
                  </div>
                  <div className="h-[1px] flex-1 bg-slate-200/60"></div>
                </div>

                {bulletin.sundayEveningService.isCanceled ? (
                  /* 이번 주 휴무 안내 카드 */
                  <div className="bg-amber-50/80 rounded-[1.8rem] p-4 border border-amber-200/80 text-center">
                    <div className="flex items-center justify-center gap-2 text-amber-800 font-extrabold text-xs mb-1">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>이번 주는 {bulletin.sundayEveningService.name || "주일 오후 예배"}가 없습니다.</span>
                    </div>
                    <p className="text-[11px] font-semibold text-amber-600/80">각 가정에서 은혜로운 시간 보내시기 바랍니다.</p>
                  </div>
                ) : (
                  /* 정상 예배 안내 카드 (토스풍 컴팩트 스타일 & 여백 압축) */
                  <div className="bg-slate-50/90 rounded-[1.8rem] p-4 border border-slate-100/80 shadow-sm">
                    <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-slate-200/40">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-indigo-600 text-white font-black text-[11px] flex items-center justify-center shadow-sm shadow-indigo-500/20">오후</span>
                        <h4 className="font-extrabold text-slate-900 text-sm tracking-tight">
                          {bulletin.sundayEveningService.name || "주일 오후 예배"}
                        </h4>
                      </div>
                      {bulletin.sundayEveningService.preacher && (
                        <span className="text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-100/80">
                          {bulletin.sundayEveningService.preacher}
                        </span>
                      )}
                    </div>

                    <div className="space-y-2">
                      {(bulletin.sundayEveningService.time || bulletin.sundayEveningService.location) && (
                        <div className="flex items-center gap-3 text-[11px] text-slate-500 font-semibold">
                          {bulletin.sundayEveningService.time && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                              {bulletin.sundayEveningService.time}
                            </span>
                          )}
                          {bulletin.sundayEveningService.location && (
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              {bulletin.sundayEveningService.location}
                            </span>
                          )}
                        </div>
                      )}

                      {(bulletin.sundayEveningService.title || bulletin.sundayEveningService.scripture) && (
                        <div className="pt-0.5 space-y-1.5">
                          {bulletin.sundayEveningService.title && (
                            <p className="text-sm font-black text-slate-800 leading-snug tracking-tight">
                              {bulletin.sundayEveningService.title}
                            </p>
                          )}

                          {bulletin.sundayEveningService.scripture && (
                            <div className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 bg-slate-100/80 px-2 py-0.5 rounded-md">
                              <BookOpen className="w-3 h-3 text-slate-400 shrink-0" />
                              <span>{bulletin.sundayEveningService.scripture}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 하단 섹션 리스트 (순서도 컴팩트하게 정리) */}
                    {bulletin.sundayEveningService.sections && bulletin.sundayEveningService.sections.length > 0 && (
                      <div className="mt-3 pt-2.5 border-t border-slate-200/50 space-y-0.5">
                        {bulletin.sundayEveningService.sections.map((sec: any, idx: number) => {
                          const hasContent = sec.content && sec.content.trim() !== "";
                          return (
                            <div
                              key={sec.id || idx}
                              onClick={() => {
                                if (hasContent) setSelectedSection(sec);
                              }}
                              className={`flex justify-between items-center py-2 px-2 rounded-xl text-xs transition-colors ${hasContent ? 'cursor-pointer hover:bg-indigo-50/80 group' : 'hover:bg-slate-100/50'
                                }`}
                            >
                              <span className={`font-bold text-slate-700 flex items-center gap-1.5 ${hasContent ? 'group-hover:text-indigo-600' : ''}`}>
                                {sec.label}
                                {hasContent && (
                                  <span className="text-[9px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-0.5">
                                    <Sparkles className="w-2.5 h-2.5" /> 보기
                                  </span>
                                )}
                              </span>
                              <span className="font-semibold text-slate-500 text-right">{sec.value || "-"}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                  </div>
                )}
              </div>
            )}


            {/* 예배 순서와 교회 소식 사이 - 주중 예배 안내 섹션 */}
            {bulletin.midweekServices && bulletin.midweekServices.enabled !== false && (
              (bulletin.midweekServices.wednesday?.title || bulletin.midweekServices.wednesday?.dateTime || bulletin.midweekServices.friday?.title || bulletin.midweekServices.friday?.dateTime || bulletin.midweekServices.dawn?.title || bulletin.midweekServices.dawn?.dateTime) && (
                <div className="animate-in fade-in duration-300">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="h-[1px] flex-1 bg-slate-200/60"></div>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-blue-600" />
                      <h3 className="font-extrabold text-slate-400 text-[11px] tracking-[0.2em] uppercase">Midweek Services</h3>
                    </div>
                    <div className="h-[1px] flex-1 bg-slate-200/60"></div>
                  </div>

                  <div className="space-y-3">
                    {/* 수요 모임 카드 */}
                    {bulletin.midweekServices.wednesday && (bulletin.midweekServices.wednesday.title || bulletin.midweekServices.wednesday.dateTime) && (
                      <div className="bg-slate-50/90 rounded-[1.8rem] p-4 border border-slate-100/80 shadow-sm">
                        <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-slate-200/40">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-lg bg-blue-600 text-white font-black text-[11px] flex items-center justify-center shadow-sm shadow-blue-500/20">수</span>
                            <h4 className="font-extrabold text-slate-900 text-sm tracking-tight">
                              {bulletin.midweekServices.wednesday.name || "수요예배"}
                            </h4>
                          </div>
                          {bulletin.midweekServices.wednesday.preacher && (
                            <span className="text-[11px] font-bold text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-100/80">
                              {bulletin.midweekServices.wednesday.preacher}
                            </span>
                          )}
                        </div>

                        <div className="space-y-1.5">
                          {bulletin.midweekServices.wednesday.dateTime && (
                            <p className="text-[11px] text-slate-500 flex items-center gap-1.5 font-semibold">
                              <Clock className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                              <span>{bulletin.midweekServices.wednesday.dateTime}</span>
                            </p>
                          )}

                          {bulletin.midweekServices.wednesday.title && (
                            <p className="text-sm font-black text-slate-800 leading-snug tracking-tight">
                              {bulletin.midweekServices.wednesday.title}
                            </p>
                          )}

                          {bulletin.midweekServices.wednesday.scripture && (
                            <div className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 bg-slate-100/80 px-2 py-0.5 rounded-md">
                              <BookOpen className="w-3 h-3 text-slate-400 shrink-0" />
                              <span>{bulletin.midweekServices.wednesday.scripture}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 금요 모임 카드 */}
                    {bulletin.midweekServices.friday && (bulletin.midweekServices.friday.title || bulletin.midweekServices.friday.dateTime) && (
                      <div className="bg-slate-50/90 rounded-[1.8rem] p-4 border border-slate-100/80 shadow-sm">
                        <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-slate-200/40">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-lg bg-indigo-600 text-white font-black text-[11px] flex items-center justify-center shadow-sm shadow-indigo-500/20">금</span>
                            <h4 className="font-extrabold text-slate-900 text-sm tracking-tight">
                              {bulletin.midweekServices.friday.name || "금요철야예배"}
                            </h4>
                          </div>
                          {bulletin.midweekServices.friday.preacher && (
                            <span className="text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-100/80">
                              {bulletin.midweekServices.friday.preacher}
                            </span>
                          )}
                        </div>

                        <div className="space-y-1.5">
                          {bulletin.midweekServices.friday.dateTime && (
                            <p className="text-[11px] text-slate-500 flex items-center gap-1.5 font-semibold">
                              <Clock className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                              <span>{bulletin.midweekServices.friday.dateTime}</span>
                            </p>
                          )}

                          {bulletin.midweekServices.friday.title && (
                            <p className="text-sm font-black text-slate-800 leading-snug tracking-tight">
                              {bulletin.midweekServices.friday.title}
                            </p>
                          )}

                          {bulletin.midweekServices.friday.scripture && (
                            <div className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 bg-slate-100/80 px-2 py-0.5 rounded-md">
                              <BookOpen className="w-3 h-3 text-slate-400 shrink-0" />
                              <span>{bulletin.midweekServices.friday.scripture}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 새벽 모임 카드 */}
                    {bulletin.midweekServices.dawn && (bulletin.midweekServices.dawn.title || bulletin.midweekServices.dawn.dateTime) && (
                      <div className="bg-slate-50/90 rounded-[1.8rem] p-4 border border-slate-100/80 shadow-sm">
                        <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-slate-200/40">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-lg bg-amber-500 text-white font-black text-[11px] flex items-center justify-center shadow-sm shadow-amber-500/20">새</span>
                            <h4 className="font-extrabold text-slate-900 text-sm tracking-tight">
                              {bulletin.midweekServices.dawn.name || "새벽기도회"}
                            </h4>
                          </div>
                          {bulletin.midweekServices.dawn.preacher && (
                            <span className="text-[11px] font-bold text-amber-600 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-100/80">
                              {bulletin.midweekServices.dawn.preacher}
                            </span>
                          )}
                        </div>

                        <div className="space-y-1.5">
                          {bulletin.midweekServices.dawn.dateTime && (
                            <p className="text-[11px] text-slate-500 flex items-center gap-1.5 font-semibold">
                              <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                              <span>{bulletin.midweekServices.dawn.dateTime}</span>
                            </p>
                          )}

                          {bulletin.midweekServices.dawn.title && (
                            <p className="text-sm font-black text-slate-800 leading-snug tracking-tight">
                              {bulletin.midweekServices.dawn.title}
                            </p>
                          )}

                          {bulletin.midweekServices.dawn.scripture && (
                            <div className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 bg-slate-100/80 px-2 py-0.5 rounded-md">
                              <BookOpen className="w-3 h-3 text-slate-400 shrink-0" />
                              <span>{bulletin.midweekServices.dawn.scripture}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            )}

            {(bulletin.offeringAccount || bulletin.accountNumber || bulletin.bankName) && (
              <div>
                <div className="flex items-center gap-4 mb-4">
                  <div className="h-[1px] flex-1 bg-slate-200/60"></div>
                  <div className="flex items-center gap-2">
                    <Wallet className="w-3.5 h-3.5 text-emerald-500" />
                    <h3 className="font-extrabold text-slate-400 text-[10px] tracking-[0.2em] uppercase">Offering</h3>
                  </div>
                  <div className="h-[1px] flex-1 bg-slate-200/60"></div>
                </div>

                <div className="bg-white rounded-[1.8rem] p-4 border border-slate-100 shadow-sm space-y-3">

                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                        <Wallet className="w-4 h-4 text-emerald-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-black text-slate-900 tracking-tight truncate">온라인 헌금 안내</p>
                        <p className="text-[11px] text-slate-400 font-semibold truncate">마음과 정성을 담아 드리는 헌금</p>
                      </div>
                    </div>

                    <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-xl border border-emerald-100/60 shrink-0">
                      {bulletin.bankName || "헌금 계좌"}
                    </span>
                  </div>

                  <div className="bg-slate-50/80 rounded-2xl p-3.5 border border-slate-100/80 flex flex-col gap-1">
                    {bulletin.accountHolder && (
                      <span className="text-xs font-bold text-slate-400 tracking-tight">
                        예금주 : {bulletin.accountHolder}
                      </span>
                    )}
                    <p className="text-lg font-black text-slate-900 tracking-tight select-all">
                      {bulletin.accountNumber || bulletin.offeringAccount}
                    </p>
                  </div>

                  <Button
                    variant="ghost"
                    size="lg"
                    onClick={() => handleCopyAccount(
                      (bulletin.accountNumber || bulletin.offeringAccount || "").trim()
                    )}
                    className={`w-full rounded-xl h-12 font-bold text-sm transition-all duration-300 flex items-center justify-center gap-2 ${copied
                      ? "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm shadow-emerald-600/20"
                      : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100/80 active:scale-[0.98]"
                      }`}
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4 stroke-[2.5]" />
                        계좌번호가 복사되었습니다
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        계좌번호 복사하기
                      </>
                    )}
                  </Button>

                </div>
              </div>
            )}

          </div>
        </Card>

        {bulletin.sharingEnabled !== false && bulletin.sharingQuestions && bulletin.sharingQuestions.length > 0 && (
          <div className="pt-4 mx-1.5">
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-400 inline-block"></span>
                <MessageSquare className={`w-4 h-4 ${isLightBg ? "text-slate-400" : "text-slate-300"}`} />
                <h3 className={`font-extrabold text-base tracking-tight ${isLightBg ? "text-slate-800" : "text-white"}`}>말씀 적용 질문</h3>
              </div>
              {(() => {
                const allIds = bulletin.sharingQuestions.map((q: any, i: number) => q?.id || String(i));
                const isAllExpanded = allIds.length > 0 && allIds.every((id: string) => expandedQuestionIds.has(id));
                return (
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedQuestionIds(isAllExpanded ? new Set() : new Set(allIds))
                    }
                    className={`inline-flex items-center gap-1 pl-2.5 pr-3 py-1.5 rounded-full border active:scale-95 text-[11px] font-bold transition-all shrink-0 ${isLightBg ? "border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-700" : "border-white/15 bg-white/5 hover:bg-white/10 text-white"}`}
                  >
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isAllExpanded ? "rotate-180" : ""}`} />
                    {isAllExpanded ? "전부 접기" : "전부 펴기"}
                  </button>
                );
              })()}
            </div>

            <div className="bg-white rounded-[1.2rem] p-4 border border-slate-100 shadow-sm divide-y divide-slate-100">
              {bulletin.sharingQuestions.map((q: any, index: number) => {
                const qId = q?.id || String(index);
                const isOpen = expandedQuestionIds.has(qId);
                return (
                  <div key={qId} className="py-4 first:pt-0 last:pb-0">
                    <button
                      type="button"
                      onClick={() => toggleQuestion(qId)}
                      className="w-full flex items-center justify-between gap-3 text-left"
                    >
                      <div className="min-w-0">
                        <span className="text-[11px] font-black text-blue-600 uppercase tracking-wider">{index + 1}번째 질문</span>
                        <p className="font-extrabold text-slate-900 text-base mt-1 leading-snug break-keep">{q?.title || "제목 없음"}</p>
                      </div>
                      <ChevronDown className={`w-5 h-5 text-slate-400 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </button>
                    {isOpen && (
                      <div className="pt-3.5 space-y-3.5">
                        {q?.quote && (
                          <div className="flex gap-2.5 p-3.5 bg-blue-50/60 rounded-xl border border-blue-100/70">
                            <Quote className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                            <p className="text-[13px] text-blue-700 font-semibold leading-relaxed break-keep">{q.quote}</p>
                          </div>
                        )}
                        {q?.content && (
                          <p className="text-[15px] text-slate-700 leading-[1.75] whitespace-pre-line break-keep">{q.content}</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {bulletin.mottoEnabled !== false && bulletin.mottoText && (
          <div className="pt-4 mx-1.5">
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-400 inline-block"></span>
                <BookOpen className={`w-4 h-4 ${isLightBg ? "text-slate-400" : "text-slate-300"}`} />
                <h3 className={`font-extrabold text-base tracking-tight ${isLightBg ? "text-slate-800" : "text-white"}`}>
                  {bulletin.mottoLabelType === "motto" ? "표어" : bulletin.mottoLabelType === "custom" ? (bulletin.mottoCustomLabel || "표어") : "주제 성구"}
                </h3>
              </div>
            </div>

            <div className="bg-white rounded-[1.8rem] p-5 border border-slate-100 shadow-sm">
              <p className="text-[15px] sm:text-base font-normal text-slate-800 leading-relaxed whitespace-pre-line break-keep">
                {bulletin.mottoText}
              </p>
              {bulletin.mottoReference && (
                <p className="text-xs font-bold text-blue-600 mt-3 text-right">{bulletin.mottoReference}</p>
              )}
            </div>
          </div>
        )}

        {/* "섬기는 사람들"은 우측 상단 메뉴 > 섬기시는 분(/view/:id/team)으로 이동 */}

        {/* "오시는 길"은 우측 상단 메뉴 > 오시는 길(/view/:id/location)으로 이동 */}

        {/* 목회 칼럼: 주보 가장 하단. 프로 요금제 미만이거나 등록된 칼럼이 없으면 자동으로 숨김 */}
        {id && <PastoralColumnSection bulletinId={id} authorId={bulletin.authorId} templateId={effectiveTemplateId} enabled={bulletin.pastoralColumnsEnabled !== false} />}
        </>
        )}

        {/* 섬기는 분 상세는 /view/:id/team 화면(MinisterDetailModal)으로 이동 */}

        {/* 성도 화면 전용 하단 정보. 공통 Footer(로그인/랜딩 등에서 쓰는 사업자 정보 전체)
            대신, 주보 화면에서는 이 작은 버전만 보여준다 - RootLayout에서 이 라우트일 때
            공통 Footer를 숨기고 있으므로 여기서 필요한 최소 정보를 자체적으로 그린다. */}
        <div className="pt-8 pb-6 px-2 text-center">
          <p className={`text-[11px] font-bold ${isLightBg ? "text-slate-500" : "text-slate-400"}`}>
            상호: 스테이온 (STAYON)
          </p>
          <a
            href="tel:0502-1937-0615"
            className={`inline-block text-[11px] font-bold mt-1 hover:text-blue-500 transition-colors ${isLightBg ? "text-slate-500" : "text-slate-400"}`}
          >
            온라인 주보 도입 문의 0502-1937-0615
          </a>
          <div className="flex items-center justify-center gap-3 mt-3">
            <a
              href="https://www.instagram.com/place.stayon/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="스테이온 인스타그램"
              className={`w-8 h-8 rounded-full border flex items-center justify-center transition-colors ${isLightBg ? "border-slate-200 text-slate-500 hover:text-blue-500 hover:border-blue-300" : "border-white/15 text-slate-400 hover:text-white hover:border-white/40"}`}
            >
              <Instagram className="w-4 h-4" />
            </a>
            <a
              href="https://www.threads.com/@place.stayon"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="스테이온 쓰레드"
              className={`w-8 h-8 rounded-full border flex items-center justify-center transition-colors ${isLightBg ? "border-slate-200 text-slate-500 hover:text-blue-500 hover:border-blue-300" : "border-white/15 text-slate-400 hover:text-white hover:border-white/40"}`}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
                <path d="M18.263 11.097c-.03-3.486-1.92-5.586-5.111-5.586-2.13 0-3.922.963-4.863 2.499l2.062 1.438c.535-.843 1.272-1.543 2.628-1.543 1.528 0 2.318.85 2.544 2.431a15 15 0 0 0-2.236-.173c-4.125 0-6.068 1.867-6.068 4.336s1.943 3.99 4.804 3.99c3.139 0 5.013-2.115 5.781-4.735.798.361 1.348 1.204 1.348 2.47 0 3.387-3.907 5.232-7.22 5.232-4.885 0-8.077-3.207-8.077-8.424 0-6.392 4.223-10.487 9.9-10.487 3.808 0 5.69 1.671 6.97 3.914l2.108-1.475C21.44 2.078 18.331 0 13.663 0 6.227 0 1.168 5.277 1.168 12.934c0 7 4.953 11.066 10.856 11.066 4.878 0 9.809-2.846 9.809-7.716 0-2.545-1.46-4.231-3.569-5.187m-6.33 4.855c-1.077 0-2.026-.512-2.026-1.453 0-1.483 1.822-1.934 3.606-1.934.678 0 1.34.045 1.927.173-.422 1.927-1.671 3.215-3.508 3.214Z" />
              </svg>
            </a>
          </div>
        </div>
      </div>

      {/* 순서 상세 내용(사도신경, 주기도문 등) 모달 팝업 */}
      <Dialog open={!!selectedSection} onOpenChange={() => setSelectedSection(null)}>
        <DialogContent className="rounded-[1.5rem] max-w-[calc(100%-1.5rem)] p-4 gap-2.5 border-0 shadow-2xl bg-white">
          <DialogHeader className="space-y-1.5">
            <DialogTitle className="text-center font-extrabold text-base text-gray-800">
              {selectedSection?.label}
            </DialogTitle>
            {selectedSection?.value && (
              <p className="text-center text-xs font-semibold text-blue-600 bg-blue-50 py-1 px-3 rounded-full w-fit mx-auto">
                {selectedSection?.value}
              </p>
            )}
          </DialogHeader>
          <div className="p-3.5 whitespace-pre-line text-gray-700 text-sm leading-relaxed bg-gray-50/70 rounded-xl max-h-[60vh] overflow-y-auto">
            {selectedSection?.content}
          </div>
          <Button
            onClick={() => setSelectedSection(null)}
            className="w-full rounded-xl h-10 bg-gray-900 text-white font-bold hover:bg-gray-800"
          >
            닫기
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
