// "아이보리 예배순서" 커스텀 디자인 템플릿. BulletinView.tsx와 똑같은 bulletin 데이터를
// 그대로 받아서 완전히 다른 시각 언어로 그린다. 참고 이미지 스타일 기준:
//  - 떠 있는 둥근 카드 없음. 모든 섹션이 아이보리 배경 위에 그대로 얹혀 구분선으로만 나뉨.
//  - 예배 안내(수요/금요/새벽/오후)는 화면 폭을 꽉 채우는 전체폭 짙은 네이비 섹션.
// 사역자 상세/순서 상세 모달은 BulletinView.tsx가 공통으로 계속 관리한다.
import {
  Clock,
  Megaphone,
  Wallet,
  Copy,
  Check,
  ChevronRight,
  ChevronDown,
  Quote,
  Youtube,
} from "lucide-react";
import { churchLogoHeightClass } from "../../../utils/churchLogo";
import { PastoralColumnSection } from "../bulletin/PastoralColumnSection";

interface WarmIvoryTemplateProps {
  bulletin: any;
  bulletinId?: string;
  expandedQuestionIds: Set<string>;
  toggleQuestion: (id: string) => void;
  setExpandedQuestionIds: (ids: Set<string>) => void;
  setSelectedSection: (section: any) => void;
  copied: boolean;
  handleCopyAccount: (text: string) => void;
}

// 색상값은 참고 이미지에서 직접 측정한 값 기준
const ACCENT = "#2F5C52"; // 짙은 틸(청록) - 라벨/숫자/아이콘 포인트색
const PAGE_BG = "#FDFAF5"; // 기본 섹션 배경 (예배 순서 등) - R253 G250 B245
const NEWS_BG = "#F8F4EE"; // 교회 소식 섹션 배경 - R248 G244 B238
const DIVIDER = "#F0EDE9"; // 리스트 행 사이 얇은 구분선 - R240 G237 B233
const SECTION_LINE = "#EEE6D4"; // 섹션 사이 두꺼운 구분선(2px) - R238 G230 B212
const INK = "#1F241F"; // 본문 진한 글씨
const MUTED = "#8a8272"; // 보조 글씨

// 섹션 헤더 (작은 영문 라벨 + 굵은 한글 제목). right가 있으면 제목 같은 줄 우측에 표시
// (예배 순서 헤더에 "특별 주일" 내용을 얹을 때 씀).
function SectionHead({ label, title, right }: { label: string; title: string; right?: string }) {
  return (
    <>
      <p className="text-[10px] font-black tracking-[0.25em] uppercase mb-1" style={{ color: ACCENT }}>{label}</p>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="text-lg font-black" style={{ color: INK }}>{title}</h3>
        {right && <span className="text-[13px] font-bold shrink-0" style={{ color: ACCENT }}>{right}</span>}
      </div>
    </>
  );
}

export function WarmIvoryTemplate({
  bulletin,
  bulletinId,
  expandedQuestionIds,
  toggleQuestion,
  setExpandedQuestionIds,
  setSelectedSection,
  copied,
  handleCopyAccount,
}: WarmIvoryTemplateProps) {
  const headerBgImage = bulletin.backgroundImage || "/stayon_kakao_pr.png";

  // 전체폭 네이비 섹션 안에 들어가는 개별 예배 안내 블록 (라벨|내용 2열 표 레이아웃)
  const renderNavyService = (opts: {
    key: string;
    label: string;
    name: string;
    time?: string;
    preacher?: string;
    title?: string;
    scripture?: string;
    subtitle?: string;
  }) => {
    if (!opts.title && !opts.time) return null;
    return (
      <div key={opts.key} className="py-7 border-t border-white/10 first:border-t-0 first:pt-0 last:pb-0">
        <p className="text-[10px] font-black tracking-[0.25em] uppercase text-white/45 mb-1.5">{opts.label}</p>
        <h4 className="text-lg font-black text-white tracking-tight mb-5">{opts.name}</h4>

        <div className="space-y-3 text-[13px]">
          {opts.time && (
            <div className="flex gap-4">
              <span className="text-white/45 font-medium w-10 shrink-0">시간</span>
              <span className="text-white font-bold">{opts.time}</span>
            </div>
          )}
          {opts.preacher && (
            <div className="flex gap-4">
              <span className="text-white/45 font-medium w-10 shrink-0">인도</span>
              <span className="text-white font-bold">{opts.preacher}</span>
            </div>
          )}
          {opts.title && (
            <div className="flex gap-4 pt-3 mt-3 border-t border-white/10">
              <span className="text-white/45 font-medium w-10 shrink-0 pt-0.5">본문</span>
              <div className="min-w-0">
                {opts.subtitle && <p className="text-white/40 text-xs font-semibold mb-0.5">{opts.subtitle}</p>}
                <p className="text-white font-bold text-[15px] leading-snug break-keep">{opts.title}</p>
                {opts.scripture && <p className="text-white/45 text-xs font-semibold mt-1">{opts.scripture}</p>}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const navyServices = [
    bulletin.sundayEveningService?.enabled !== false && bulletin.sundayEveningService && !bulletin.sundayEveningService.isCanceled &&
    renderNavyService({
      key: "evening",
      label: "SUNDAY AFTERNOON",
      name: bulletin.sundayEveningService.name || "주일 오후 예배",
      time: bulletin.sundayEveningService.time,
      preacher: bulletin.sundayEveningService.preacher,
      title: bulletin.sundayEveningService.title,
      scripture: bulletin.sundayEveningService.scripture,
    }),
    bulletin.midweekServices?.enabled !== false && bulletin.midweekServices?.wednesday &&
    renderNavyService({
      key: "wednesday",
      label: "WEDNESDAY SERVICE",
      name: bulletin.midweekServices.wednesday.name || "수요 예배 안내",
      time: bulletin.midweekServices.wednesday.dateTime,
      preacher: bulletin.midweekServices.wednesday.preacher,
      title: bulletin.midweekServices.wednesday.title,
      scripture: bulletin.midweekServices.wednesday.scripture,
    }),
    bulletin.midweekServices?.enabled !== false && bulletin.midweekServices?.friday &&
    renderNavyService({
      key: "friday",
      label: "FRIDAY SERVICE",
      name: bulletin.midweekServices.friday.name || "금요 모임 안내",
      time: bulletin.midweekServices.friday.dateTime,
      preacher: bulletin.midweekServices.friday.preacher,
      title: bulletin.midweekServices.friday.title,
      scripture: bulletin.midweekServices.friday.scripture,
    }),
    bulletin.midweekServices?.enabled !== false && bulletin.midweekServices?.dawn &&
    renderNavyService({
      key: "dawn",
      label: "DAWN PRAYER",
      name: bulletin.midweekServices.dawn.name || "새벽기도 안내",
      time: bulletin.midweekServices.dawn.dateTime,
      preacher: bulletin.midweekServices.dawn.preacher,
      title: bulletin.midweekServices.dawn.title,
      scripture: bulletin.midweekServices.dawn.scripture,
    }),
  ].filter(Boolean);

  return (
    <div style={{ backgroundColor: PAGE_BG }}>
      {/* 히어로 헤더: 전체 폭 사진 배경, 좌측 정렬 텍스트 */}
      {/* <div
        className="relative min-h-[320px] bg-cover bg-center flex flex-col justify-end px-6 py-8"
        style={{ backgroundImage: `linear-gradient(rgba(10,12,10,0.15), rgba(10,10,8,0.8)), url(${headerBgImage})` }}
      >
        <p className="text-white/70 text-xs font-bold tracking-wide mb-3">
          {bulletin.date}{bulletin.title ? ` · ${bulletin.title}` : ""}
        </p>
        <div className="w-8 h-[2px] bg-white/40 mb-3" />
        {bulletin.scripture && (
          <p className="text-white/60 text-[11px] font-bold tracking-wide mb-2">{bulletin.scripture}</p>
        )}
        <h1 className="text-white text-[26px] font-black leading-snug break-keep mb-3">
          {bulletin.subtitle || bulletin.title || "주일 예배"}
        </h1>
        {(() => {
          const preacherSection = (bulletin.sections || []).find((s: any) => s.label === "설교");
          return preacherSection?.value ? (
            <p className="text-white/70 text-sm font-bold">{preacherSection.value}</p>
          ) : null;
        })()}
      </div> */}

      {/* 히어로 헤더: QR로 처음 들어왔을 때 보이는 풀스크린 커버.
          - 높이 100svh(그 기기 화면 딱 한 개분) + min-height 하한선 → 해상도 무관하게 첫 화면을 꽉 채움
          - bg-cover/bg-center → 사진 비율 유지한 채 화면을 덮고, 넘치는 가장자리는 가운데 기준으로 크롭
          - 하단 그라데이션 → 어떤 사진이든 흰 글씨 가독성 확보
          - 텍스트는 하단 정렬, 노치/홈바(safe-area)는 피해서 배치 */}
      <style>{`@keyframes wi-scroll-hint{0%,100%{transform:translate(-50%,0);opacity:.55}50%{transform:translate(-50%,5px);opacity:.9}}`}</style>
      <div
        className="relative h-[100svh] min-h-[560px] bg-cover bg-center bg-no-repeat flex flex-col justify-end overflow-hidden"
        style={{
          backgroundImage: `linear-gradient(rgba(10,12,10,0.12) 0%, rgba(10,12,10,0.32) 48%, rgba(10,10,8,0.88) 100%), url(${headerBgImage})`,
        }}
      >
        <div className="px-6 pt-8" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 60px)" }}>
          {/* 1. 날짜 */}
          <p className="text-white/70 text-xs font-medium tracking-wide mb-3">
            {bulletin.date}
          </p>

          {/* 골드 포인트 구분선 */}
          <div className="w-10 h-[2px] mb-4" style={{ backgroundColor: "#D4A359" }} />

          {/* 2. 성구 구절 */}
          {bulletin.scripture && (
            <p className="text-[13px] font-bold tracking-wide mb-2 whitespace-pre-line" style={{ color: "#E0B368" }}>
              {bulletin.scripture}
            </p>
          )}

          {/* 3. 설교 제목 - 관리자가 글자 크기(18~32px)를 직접 조절할 수 있다(/admin/editor
              "설교 제목 글자 크기"). 값이 없는 예전 주보는 기존 고정 크기(26/30px)를 그대로 씀. */}
          <h1
            className="text-white font-black leading-snug break-keep whitespace-pre-line mb-1 text-[26px] sm:text-[30px]"
            style={bulletin.titleFontSize ? { fontSize: `${bulletin.titleFontSize}px` } : undefined}
          >
            {bulletin.title || bulletin.subtitle || "주일 예배"}
          </h1>

          {/* 4. 설교자 */}
          {(() => {
            const preacherSection = (bulletin.sections || []).find((s: any) => s.label === "설교");
            const preacher = preacherSection?.value || bulletin.preacher || (bulletin.title && bulletin.subtitle ? bulletin.subtitle : null);
            return preacher ? (
              <p className="text-white/80 text-sm font-semibold mt-1">{preacher}</p>
            ) : null;
          })()}
        </div>

        {/* 아래로 스크롤 힌트 */}
        <div
          className="absolute left-1/2 flex flex-col items-center gap-1.5 text-white text-[10px] font-medium tracking-[0.15em] pointer-events-none"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)", animation: "wi-scroll-hint 2s ease-in-out infinite" }}
        >
          SCROLL
          <span className="w-px h-5" style={{ background: "linear-gradient(to bottom, rgba(212,163,89,.6), transparent)" }} />
        </div>
      </div>

      {/* 교회 로고: 대표 사진 바로 아래, 모든 내용보다 먼저 흰색 띠로 표시 */}
      {bulletin.churchLogoEnabled !== false && bulletin.churchLogo && (
        <div
          className="py-9 px-6 flex items-center justify-center border-b-2"
          style={{ backgroundColor: PAGE_BG, borderColor: SECTION_LINE }}
        >
          <img src={bulletin.churchLogo} alt="교회 로고" className={`${churchLogoHeightClass(bulletin.churchLogoSize)} w-auto max-w-full object-contain`} />
        </div>
      )}

      {/* <div className="bg-white py-8 px-6 flex items-center justify-center border-b-2" style={{ borderColor: SECTION_LINE }}>
          <img src={bulletin.churchLogo} alt="교회 로고" className="max-h-12 sm:max-h-14 w-auto object-contain" />
        </div>
      )} */}

      <div>
        {/* 금주/다음주 기도 */}
        {(bulletin.prayer || bulletin.nextPrayer) && (
          <div className="flex items-center justify-around px-6 py-7 border-b-2" style={{ borderColor: SECTION_LINE }}>
            {bulletin.prayer && (
              <div className="text-center">
                <p className="text-[10px] font-black tracking-[0.2em] uppercase mb-1" style={{ color: ACCENT }}>금주 기도</p>
                <p className="font-bold text-sm" style={{ color: INK }}>{bulletin.prayer}</p>
              </div>
            )}
            {bulletin.prayer && bulletin.nextPrayer && <div className="h-8 w-[1px]" style={{ backgroundColor: DIVIDER }} />}
            {bulletin.nextPrayer && (
              <div className="text-center">
                <p className="text-[10px] font-black tracking-[0.2em] uppercase mb-1" style={{ color: MUTED }}>다음주 기도</p>
                <p className="font-bold text-sm" style={{ color: INK }}>{bulletin.nextPrayer}</p>
              </div>
            )}
          </div>
        )}

        {/* 찬양 영상 */}
        {bulletin.youtubeId && (
          <a
            href={bulletin.youtubeId.startsWith("http") ? bulletin.youtubeId : `https://www.youtube.com/results?search_query=${bulletin.youtubeId}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between gap-3 px-6 py-7 border-b-2"
            style={{ borderColor: SECTION_LINE }}
          >
            <div className="flex items-center gap-3">
              <Youtube className="w-5 h-5 shrink-0" style={{ color: ACCENT }} />
              <div>
                <p className="font-bold text-sm" style={{ color: INK }}>찬양 영상 미리보기</p>
                <p className="text-[11px] font-medium" style={{ color: MUTED }}>성도들과 함께 찬양을 준비해요</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4" style={{ color: MUTED }} />
          </a>
        )}

        {/* 예배 시간표 */}
        {bulletin.sundayServices && bulletin.sundayServices.length > 0 && (
          <div className="px-6 py-7 border-b-2 last:border-b-0" style={{ borderColor: SECTION_LINE }}>
            <SectionHead label="WORSHIP TIMES" title="예배 시간 안내" />
            <div className="divide-y" style={{ borderColor: DIVIDER }}>
              {bulletin.sundayServices.map((service: any, index: number) => {
                let name = "", time = "", location = "";
                if (typeof service === "string") {
                  const parts = service.split(",").map((s: string) => s.trim());
                  name = parts[0] || "주일 예배"; time = parts[1] || ""; location = parts[2] || "";
                } else if (service) {
                  name = service.name || "주일 예배"; time = service.time || ""; location = service.location || "";
                }
                return (
                  <div key={index} className="flex items-center justify-between py-3" style={{ borderColor: DIVIDER }}>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[15px]" style={{ color: INK }}>{name}</span>
                      {location && <span className="text-xs font-medium" style={{ color: MUTED }}>{location}</span>}
                    </div>
                    {time && (
                      <span className="flex items-center gap-1.5 font-bold text-sm" style={{ color: INK }}>
                        <Clock className="w-3.5 h-3.5" style={{ color: ACCENT }} />
                        {time}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 예배 순서 - 이 템플릿의 시그니처 영역: 번호 매긴 리스트 */}
        {bulletin.sections && bulletin.sections.length > 0 && (
          <div className="px-6 py-7 border-b-2 last:border-b-0" style={{ borderColor: SECTION_LINE }}>
            <SectionHead label="ORDER OF WORSHIP" title="예배 순서" right={bulletin.specialSunday || undefined} />
            <div className="divide-y" style={{ borderColor: DIVIDER }}>
              {bulletin.sections.map((section: any, index: number) => {
                const hasContent = section.content && section.content.trim() !== "";
                return (
                  <button
                    type="button"
                    key={index}
                    onClick={() => hasContent && setSelectedSection(section)}
                    disabled={!hasContent}
                    className="w-full flex items-start gap-3 py-4 text-left"
                    style={{ borderColor: DIVIDER }}
                  >
                    <span className="text-sm font-black tabular-nums w-6 shrink-0 mt-0.5" style={{ color: ACCENT }}>
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-[15px] flex items-center gap-1.5" style={{ color: INK }}>
                        {section.label}
                        {hasContent && <ChevronRight className="w-3.5 h-3.5" style={{ color: MUTED }} />}
                      </p>
                      {section.preview && section.preview.trim() !== "" && (
                        <p className="text-[13px] leading-relaxed whitespace-pre-line line-clamp-3 mt-1" style={{ color: "#5c5748" }}>
                          {section.preview}
                        </p>
                      )}
                    </div>
                    <span className="text-sm font-bold text-right max-w-[120px] shrink-0 mt-0.5" style={{ color: MUTED }}>
                      {section.value || "-"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 교회소식 - 예배 순서 바로 다음, 예배 안내(네이비) 앞에 온다. 배경 톤을 기본보다 살짝 진하게. */}
        {bulletin.announcements && bulletin.announcements.length > 0 && (
          <div className="px-6 py-7 border-b-2 last:border-b-0" style={{ borderColor: SECTION_LINE, backgroundColor: NEWS_BG }}>
            <SectionHead label="CHURCH NEWS" title="교회 소식" />
            <div className="divide-y" style={{ borderColor: DIVIDER }}>
              {bulletin.announcements.map((ann: any, index: number) => (
                <div key={index} className="py-4" style={{ borderColor: DIVIDER }}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <Megaphone className="w-3.5 h-3.5 shrink-0" style={{ color: ACCENT }} />
                    <h4 className="font-black text-sm" style={{ color: INK }}>{ann.title}</h4>
                  </div>
                  {ann.content && (
                    <p className="text-[13px] leading-relaxed whitespace-pre-wrap font-medium pl-[22px]" style={{ color: "#5c5748" }}>{ann.content}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 주일 오후예배 / 수요 / 금요 / 새벽 - 전체폭 짙은 네이비 섹션 (둥근 카드 아님) */}
      {navyServices.length > 0 && (
        <div className="px-6 py-8" style={{ background: "linear-gradient(135deg, #141E33, #0B1220)" }}>
          {navyServices}
        </div>
      )}

      <div>
        {/* 헌금 안내 - 복사 대상인 계좌번호는 살짝 들어간 인셋 박스로 초점을 준다. */}
        {(bulletin.offeringAccount || bulletin.accountNumber || bulletin.bankName) && (
          <div className="px-6 py-7 border-b-2 last:border-b-0" style={{ borderColor: SECTION_LINE }}>
            <SectionHead label="OFFERING" title="온라인 헌금 안내" />
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Wallet className="w-4 h-4 shrink-0" style={{ color: ACCENT }} />
                <span className="text-sm font-black" style={{ color: INK }}>{bulletin.bankName || "헌금 계좌"}</span>
                {bulletin.accountHolder && (
                  <span className="text-xs font-bold" style={{ color: MUTED }}>· 예금주 {bulletin.accountHolder}</span>
                )}
              </div>
              <div className="rounded-xl px-4 py-3.5" style={{ backgroundColor: "#EEE4CE", border: `1px solid ${DIVIDER}` }}>
                <p className="text-lg font-black tracking-tight select-all" style={{ color: INK }}>
                  {bulletin.accountNumber || bulletin.offeringAccount}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleCopyAccount((bulletin.accountNumber || bulletin.offeringAccount || "").trim())}
                className="w-full h-11 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors"
                style={{ backgroundColor: copied ? ACCENT : `${ACCENT}14`, color: copied ? "#fff" : ACCENT }}
              >
                {copied ? <><Check className="w-4 h-4" /> 계좌번호가 복사되었습니다</> : <><Copy className="w-4 h-4" /> 계좌번호 복사하기</>}
              </button>
            </div>
          </div>
        )}

        {/* 말씀 적용 질문 */}
        {bulletin.sharingEnabled !== false && bulletin.sharingQuestions && bulletin.sharingQuestions.length > 0 && (
          <div className="px-6 py-7 border-b-2 last:border-b-0" style={{ borderColor: SECTION_LINE }}>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] font-black tracking-[0.25em] uppercase" style={{ color: ACCENT }}>SHARING</p>
              {(() => {
                const allIds = bulletin.sharingQuestions.map((q: any, i: number) => q?.id || String(i));
                const isAllExpanded = allIds.length > 0 && allIds.every((qid: string) => expandedQuestionIds.has(qid));
                return (
                  <button
                    type="button"
                    onClick={() => setExpandedQuestionIds(isAllExpanded ? new Set() : new Set(allIds))}
                    className="text-[11px] font-bold flex items-center gap-1"
                    style={{ color: ACCENT }}
                  >
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isAllExpanded ? "rotate-180" : ""}`} />
                    {isAllExpanded ? "전부 접기" : "전부 펴기"}
                  </button>
                );
              })()}
            </div>
            <h3 className="text-lg font-black mb-4" style={{ color: INK }}>말씀 적용 질문</h3>
            <div className="divide-y" style={{ borderColor: DIVIDER }}>
              {bulletin.sharingQuestions.map((q: any, index: number) => {
                const qId = q?.id || String(index);
                const isOpen = expandedQuestionIds.has(qId);
                return (
                  <div key={qId} className="py-4" style={{ borderColor: DIVIDER }}>
                    <button type="button" onClick={() => toggleQuestion(qId)} className="w-full flex items-center justify-between gap-3 text-left">
                      <div className="min-w-0">
                        <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: ACCENT }}>{index + 1}번째 질문</span>
                        <p className="font-black text-base mt-1 leading-snug break-keep" style={{ color: INK }}>{q?.title || "제목 없음"}</p>
                      </div>
                      <ChevronDown className={`w-5 h-5 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} style={{ color: MUTED }} />
                    </button>
                    {isOpen && (
                      <div className="pt-3.5 space-y-3.5">
                        {q?.quote && (
                          <div className="flex gap-2.5 p-3.5 rounded-xl border" style={{ backgroundColor: `${ACCENT}0D`, borderColor: `${ACCENT}33` }}>
                            <Quote className="w-4 h-4 shrink-0 mt-0.5" style={{ color: ACCENT }} />
                            <p className="text-[13px] font-semibold leading-relaxed break-keep" style={{ color: ACCENT }}>{q.quote}</p>
                          </div>
                        )}
                        {q?.content && <p className="text-[15px] leading-[1.75] whitespace-pre-line break-keep" style={{ color: "#3a362c" }}>{q.content}</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 표어 / 주제 성구 */}
        {bulletin.mottoEnabled !== false && bulletin.mottoText && (
          <div className="px-6 py-7 border-b-2 last:border-b-0" style={{ borderColor: SECTION_LINE }}>
            <SectionHead
              label={bulletin.mottoLabelType === "motto" ? "CHURCH MOTTO" : bulletin.mottoLabelType === "custom" ? (bulletin.mottoCustomLabel || "MOTTO") : "THEME VERSE"}
              title={bulletin.mottoLabelType === "motto" ? "표어" : bulletin.mottoLabelType === "custom" ? (bulletin.mottoCustomLabel || "표어") : "주제 성구"}
            />
            <div className="pl-4 border-l-2" style={{ borderColor: ACCENT }}>
              <p className="text-[15px] leading-relaxed whitespace-pre-line break-keep" style={{ color: INK }}>{bulletin.mottoText}</p>
              {bulletin.mottoReference && (
                <p className="text-xs font-bold mt-3" style={{ color: ACCENT }}>{bulletin.mottoReference}</p>
              )}
            </div>
          </div>
        )}

        {/* 섬기는 사람들 → 우측 상단 메뉴 > 섬기시는 분(/view/:id/team) 화면으로 이동 */}

        {/* 오시는 길 → 우측 상단 메뉴 > 오시는 길(/view/:id/location) 화면으로 이동 */}
      </div>

      {/* 목회 칼럼: 주보 가장 하단. 프로 요금제 미만이거나 등록된 칼럼이 없으면 자동으로 숨김 */}
      {bulletinId && <PastoralColumnSection bulletinId={bulletinId} authorId={bulletin.authorId} templateId={bulletin.bulletinTemplate} enabled={bulletin.pastoralColumnsEnabled === true} />}
    </div>
  );
}
