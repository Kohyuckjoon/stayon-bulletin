import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router";
import { db } from "../../firebase";
import { doc, getDoc, collection, query, where, orderBy, limit, getDocs, updateDoc, increment } from "firebase/firestore";
import { Card } from "../components/ui/card";
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
  Users,
  Phone,
  MessageSquare,
  X,
  ListOrdered
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
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [selectedSection, setSelectedSection] = useState<any>(null);
  const [selectedMinister, setSelectedMinister] = useState<any>(null);

  useEffect(() => {
    const fetchBulletin = async () => {
      // 1. URL 쿼리 파라미터 확인 (미리보기 모드인지)
      const searchParams = new URLSearchParams(location.search);
      const isPreview = searchParams.get("mode") === "preview";

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

  return (

    <div className="min-h-screen bg-gradient-to-br from-[#1f2937] via-[#111827] to-black flex flex-col items-center font-sans pb-20 overflow-x-hidden">
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

        <Card className="overflow-hidden rounded-[2.5rem] border-0 bg-white shadow-2xl mt-3 ml-1.5 mr-1.5">
          <div
            className="relative h-auto min-h-[300px] bg-cover bg-center flex flex-col items-center justify-center text-white px-6 py-6"
            style={{
              backgroundImage: `linear-gradient(rgba(0,0,0,0.3), rgba(0,0,0,0.85)), url(${headerBgImage})`
            }}
          >
            <span className="text-[10px] mb-3 font-black tracking-[0.2em] bg-white/20 px-5 py-2 rounded-full border border-white/30 backdrop-blur-md uppercase">
              {bulletin.date}
            </span>
            <h2 className={`font-black mb-2 text-center leading-tight drop-shadow-lg px-1 ${(bulletin.title || "").length > 15
              ? 'text-2xl'
              : (bulletin.title || "").length > 10
                ? 'text-3xl'
                : 'text-4xl'
              }`}>
              {bulletin.title || "주일 예배"}
            </h2>
            <p className="text-sm font-bold text-blue-300 mb-4 tracking-wide drop-shadow-md flex items-center gap-1">
              <Mic2 className="w-3.5 h-3.5" /> {bulletin.subtitle || "말씀 선포"}
            </p>

            <div className="bg-black/30 px-6 py-3.5 rounded-[1.5rem] border border-white/10 backdrop-blur-sm text-center max-w-[90%]">
              <p className="text-[11px] text-blue-200 font-bold mb-1 tracking-tighter uppercase flex items-center justify-center gap-1">
                <BookOpen className="w-3 h-3" /> Today's Scripture
              </p>
              <p className="text-xs font-medium leading-relaxed">{bulletin.scripture || "본문 준비 중"}</p>
            </div>
          </div>

          <div className="p-4 space-y-9">
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
              <div className="space-y-9">
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
                                  <span className="font-bold text-slate-800 text-[14px] sm:text-[15px] tracking-tight shrink-0">
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
                          className={`flex justify-between items-center py-3.5 border-b border-gray-50 last:border-0 px-2 rounded-2xl transition-colors ${hasContent ? 'cursor-pointer hover:bg-blue-50/60 group' : 'hover:bg-gray-50/50'
                            }`}
                        >
                        <div className="flex flex-col">
                          {/* <span className={`text-gray-800 font-black text-lg flex items-center gap-2 ${hasContent ? 'group-hover:text-blue-600 transition-colors' : ''}`}>
                            {section.label}
                            {hasContent && (
                              <span className="text-[10px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                                <Sparkles className="w-3 h-3" /> 상세보기
                              </span>
                            )}
                          </span> */}

                          <span className={`text-gray-800 font-black text-lg flex items-center gap-2 ${hasContent ? 'group-hover:text-blue-600 transition-colors' : ''}`}>
                            {section.label}
                            {hasContent && (
                              <span className="text-xs font-semibold text-slate-400 flex items-center group-hover:text-blue-500 transition-colors">
                                보기 <ChevronRight className="w-3.5 h-3.5 -ml-0.5" />
                              </span>
                            )}
                          </span>
                        </div>
                        <span className="font-bold text-gray-500 text-sm text-right max-w-[140px]">{section.value || "-"}</span>
                      </div>
                    );
                  })}
                  </div>
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
              (bulletin.midweekServices.wednesday?.title || bulletin.midweekServices.wednesday?.dateTime || bulletin.midweekServices.friday?.title || bulletin.midweekServices.friday?.dateTime) && (
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
                  </div>
                </div>
              )
            )}

            {bulletin.announcements && bulletin.announcements.length > 0 && (
              <div>
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

        {bulletin.ministers && bulletin.ministers.length > 0 && (
          <div className="pt-4">
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-600 inline-block"></span>
                <Users className="w-4 h-4 text-slate-700" />
                <h3 className="font-extrabold text-slate-800 text-base tracking-tight">섬기는 사람들</h3>
              </div>
            </div>

            {/* 불필요한 패딩 및 마진 압축, 모바일 가독성 최적화 */}
            <div className="bg-white rounded-[1.8rem] p-2.5 border border-slate-100 shadow-sm space-y-2">
              {bulletin.ministers.map((minister: any, index: number) => {
                // Firestore 저장 에러 방지 및 undefined 안전 추출
                const ministerPhoto =
                  (typeof minister?.photoUrl === 'string' && minister.photoUrl.trim() !== '' ? minister.photoUrl : null) ||
                  (typeof minister?.photoURL === 'string' && minister.photoURL.trim() !== '' ? minister.photoURL : null) ||
                  (typeof minister?.photoUrL === 'string' && minister.photoUrL.trim() !== '' ? minister.photoUrL : null);

                return (
                  <div
                    key={minister?.id || index}
                    onClick={() => setSelectedMinister(minister)}
                    className="bg-slate-50/70 hover:bg-slate-100/80 rounded-2xl p-3 flex items-center justify-between border border-slate-100 transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* 프로필 사진 및 아바타 */}
                      {ministerPhoto ? (
                        <img
                          src={ministerPhoto}
                          alt={minister?.name || "섬기는분"}
                          className="w-12 h-12 sm:w-13 sm:h-13 rounded-full object-cover border border-slate-200/60 shadow-sm shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 sm:w-13 sm:h-13 rounded-full bg-slate-200 text-slate-600 font-bold text-base flex items-center justify-center shrink-0">
                          {minister?.name ? minister.name.slice(0, 1) : "섬"}
                        </div>
                      )}

                      {/* 직분과 이름 영역 (말줄임 처리로 2줄 방지) */}
                      <div className="flex flex-col min-w-0 pr-2">
                        {minister?.role && (
                          <span className="text-[11px] sm:text-xs font-bold text-slate-500 tracking-wide mb-0.5 truncate">
                            {minister.role}
                          </span>
                        )}
                        <span className="font-extrabold text-slate-900 text-sm sm:text-base tracking-tight truncate">
                          {minister?.name || "이름 없음"}
                        </span>
                      </div>
                    </div>

                    {/* 우측 이동 버튼 */}
                    <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white border border-slate-200/70 flex items-center justify-center text-slate-400 group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600 transition-all shadow-sm shrink-0">
                      <span className="text-sm font-bold">›</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {selectedMinister && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
            <div className="relative w-full max-w-sm bg-white rounded-[2.5rem] overflow-hidden shadow-2xl border border-slate-100 flex flex-col">

              {/* 닫기 버튼 */}
              <button
                onClick={() => setSelectedMinister(null)}
                className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-slate-100/80 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              {/* 상단 프로필 큰 이미지 영역 */}
              <div className="w-full h-80 bg-slate-100 relative">
                {(() => {
                  const photo =
                    selectedMinister?.photoUrl || selectedMinister?.photoURL || selectedMinister?.photoUrL;
                  return photo ? (
                    <img
                      src={photo}
                      alt={selectedMinister?.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-tr from-slate-200 to-slate-300 text-slate-600 font-black text-4xl flex items-center justify-center">
                      {selectedMinister?.name ? selectedMinister.name.slice(0, 1) : "섬"}
                    </div>
                  );
                })()}
              </div>

              {/* 하단 정보 및 연락 버튼 영역 */}
              <div className="p-6 text-center bg-white flex flex-col items-center">
                {selectedMinister?.role && (
                  <span className="text-xs font-bold text-amber-800/70 tracking-wide mb-1">
                    {selectedMinister.role}
                  </span>
                )}
                <h3 className="text-xl font-extrabold text-slate-900 tracking-tight mb-4">
                  {selectedMinister?.name || "이름 없음"}
                </h3>

                {/* 전화번호가 등록되어 있는 경우 표시 */}
                {selectedMinister?.phone && (
                  <a
                    href={`tel:${selectedMinister.phone}`}
                    className="w-full py-3 px-4 bg-slate-50 hover:bg-slate-100 rounded-2xl border border-slate-200/60 text-slate-700 font-semibold text-sm flex items-center justify-center gap-2 mb-4 transition-colors"
                  >
                    <Phone className="w-4 h-4 text-slate-500" />
                    {selectedMinister.phone}
                  </a>
                )}

                {/* 하단 액션 버튼 (전화하기 / 문자하기) */}
                <div className="grid grid-cols-2 gap-3 w-full">
                  <a
                    href={`tel:${selectedMinister?.phone || ''}`}
                    className="py-3 px-4 bg-[#8C7A6B] hover:bg-[#786759] text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-colors shadow-sm"
                  >
                    <Phone className="w-4 h-4" />
                    전화하기
                  </a>
                  <a
                    href={`sms:${selectedMinister?.phone || ''}`}
                    className="py-3 px-4 bg-[#4A3B32] hover:bg-[#3B2F27] text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-colors shadow-sm"
                  >
                    <MessageSquare className="w-4 h-4" />
                    문자하기
                  </a>
                </div>
              </div>

            </div>
          </div>
        )}
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
