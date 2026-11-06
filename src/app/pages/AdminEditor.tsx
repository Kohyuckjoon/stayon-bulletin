import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router";
import { auth, db, storage } from "../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  doc, getDoc, setDoc, serverTimestamp, collection, addDoc,
  query, where, orderBy, limit, getDocs, writeBatch
} from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card } from "../components/ui/card";
import { Textarea } from "../components/ui/textarea";
import { Switch } from "../components/ui/switch";
import { Checkbox } from "../components/ui/checkbox";
import {
  ArrowLeft, Eye, Plus, Trash2, Send, Music, UserCheck, Wallet, ChevronUp,
  ChevronDown, Youtube, Check, Copy, CalendarIcon, Clock, BookOpen, Sparkles, Upload,
  MapPin, Info, ImageIcon, X, Megaphone, Share2, FileText, Move, Users,
  Pencil, GripVertical, Quote, MessagesSquare, Lock, Tent, Palette, ExternalLink, Search,
  Instagram, AtSign, Loader2
} from "lucide-react";
import { toast } from "sonner";
import { useFeatureUpdateNotice } from "../../hooks/useFeatureUpdateNotice";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "../components/ui/dialog";

import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { Calendar } from "../components/ui/calendar";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { PAGE_BG_THEMES, DEFAULT_PAGE_BG_THEME_ID } from "../../utils/pageBgThemes";
import { DenominationPicker } from "../components/DenominationPicker";
import { BULLETIN_TEMPLATES, DEFAULT_BULLETIN_TEMPLATE_ID, isCustomBulletinTemplate } from "../../utils/bulletinTemplates";
import { canApplyCustomTemplate, isCustomDesignFreePeriod, type CustomDesignConfig } from "../../utils/customDesignAccess";
import { CHURCH_LOGO_SIZE_OPTIONS, DEFAULT_CHURCH_LOGO_SIZE, normalizeChurchLogoSize, churchLogoHeightClass, type ChurchLogoSize } from "../../utils/churchLogo";
import { hasTierOrAbove, getPlanTierMeta } from "../../utils/subscriptionTier";
import { fetchPastoralColumns, addPastoralColumn, updatePastoralColumn, deletePastoralColumn, type PastoralColumn } from "../../utils/pastoralColumns";

const BANK_LIST = [
  "NH농협", "KB국민", "신한", "우리", "하나", "IBK기업", "카카오뱅크",
  "토스뱅크", "케이뱅크", "SC제일", "한국씨티", "우체국", "새마을금고",
  "신협", "수협", "광주은행", "전북은행", "경남은행", "부산은행",
  "대구은행", "제주은행", "산림조합", "저축은행",
  "custom" // 기타(직접 입력)
];

const BACKGROUND_TEMPLATES = [
  { id: "stayon_logo", url: "/stayon_image.png", label: "스테이온 로고" },
  { id: "backgroundImage_01", url: "/background_image_1.png", label: "배경 이미지 01" },
  { id: "backgroundImage_02", url: "/background_image_2.png", label: "배경 이미지 02" },
  { id: "backgroundImage_03", url: "/background_image_3.png", label: "배경 이미지 03" },
  { id: "backgroundImage_04", url: "/background_image_4.png", label: "배경 이미지 04" },
  { id: "backgroundImage_05", url: "/background_image_5.png", label: "배경 이미지 05" }
];

interface BulletinSection {
  id: string;
  label: string;
  value: string;
  content?: string; // 클릭 시 팝업으로 보여주는 상세 전문(사도신경/주기도문 등)
  preview?: string; // 항목 바로 아래 인라인으로 짧게 보여주는 문구(찬송가 가사 등) - 성도 화면에서 최대 3줄
  hidden?: boolean; // 체크하면 내용은 그대로 둔 채 성도 화면에서만 숨김 - 특송처럼 매주는
  // 안 쓰는 순서를 지웠다 다시 쓸 때 내용을 또 입력 안 해도 되게 하기 위함
}

interface Announcement {
  id: string;
  title: string;
  content: string;
}

// 브라우저 기본 <input type="date"> 캘린더는 OS마다 모양이 제각각이고 스타일을 줄 수 없어서,
// Popover + react-day-picker 조합으로 메테리얼/토스 톤에 맞춘 커스텀 캘린더로 대체한다.
// 저장 형식은 기존과 동일하게 "YYYY-MM-DD" 문자열을 그대로 유지(다른 화면과의 호환을 위해).
function DatePickerField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const selectedDate = value ? new Date(`${value}T00:00:00`) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-full h-12 rounded-2xl border border-gray-200 bg-white px-4 flex items-center justify-between text-sm font-semibold text-gray-800 hover:border-blue-300 transition-colors"
        >
          <span className={selectedDate ? "" : "text-gray-400 font-medium"}>
            {selectedDate ? format(selectedDate, "yyyy년 M월 d일 (EEE)", { locale: ko }) : "날짜를 선택하세요"}
          </span>
          <CalendarIcon className="w-4 h-4 text-blue-500 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0 rounded-[1.75rem] border-0 shadow-xl overflow-hidden">
        <Calendar
          mode="single"
          selected={selectedDate}
          defaultMonth={selectedDate}
          onSelect={(date) => {
            if (!date) return;
            onChange(format(date, "yyyy-MM-dd"));
            setOpen(false);
          }}
          locale={ko}
          modifiers={{
            sunday: (date) => date.getDay() === 0,
            saturday: (date) => date.getDay() === 6,
          }}
          modifiersClassNames={{
            sunday: "text-red-500",
            saturday: "text-blue-500",
          }}
          classNames={{
            months: "p-4",
            month: "space-y-4",
            caption: "flex justify-center pt-1 relative items-center",
            caption_label: "text-sm font-bold text-gray-800",
            nav: "flex items-center gap-1",
            nav_button: "size-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors",
            nav_button_previous: "absolute left-0",
            nav_button_next: "absolute right-0",
            table: "w-full border-collapse mt-3",
            head_row: "flex",
            head_cell: "text-gray-400 w-9 font-bold text-[11px]",
            row: "flex w-full mt-1",
            cell: "size-9 text-center text-sm p-0 relative",
            day: "size-9 rounded-full font-semibold text-gray-700 hover:bg-blue-50 transition-colors flex items-center justify-center",
            day_selected: "!bg-blue-600 !text-white shadow-md shadow-blue-200 hover:!bg-blue-600",
            day_today: "bg-blue-50 text-blue-600 font-black",
            day_outside: "text-gray-300",
            day_disabled: "text-gray-200",
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

// 교회 소개 화면(ABOUT/VISION/MISSION) 제목 선택 — "표어 / 주제 성구"의 제목 버튼과 같은 모양.
// 기본값 버튼이거나 직접 입력을 비워두면 성도 화면엔 기본 제목(defaultLabel)이 그대로 나온다.
function CustomLabelField({ id, defaultLabel, enabled, onEnabledChange, value, onValueChange }: {
  id: string;
  defaultLabel: string;
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  value: string;
  onValueChange: (v: string) => void;
}) {
  return (
    <div className="mb-3" id={id}>
      <label className="block text-xs font-bold text-slate-500 mb-1.5">화면에 표시할 제목</label>
      <div className="flex gap-2">
        {[
          { custom: false, label: defaultLabel },
          { custom: true, label: "직접 입력" },
        ].map((opt) => (
          <button
            key={opt.label}
            type="button"
            onClick={() => onEnabledChange(opt.custom)}
            className={`flex-1 h-10 rounded-xl text-xs font-bold border transition-all ${enabled === opt.custom
              ? "bg-blue-600 border-blue-600 text-white"
              : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-white"
              }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {enabled && (
        <Input
          value={value}
          onChange={(e) => onValueChange(e.target.value.slice(0, 20))}
          placeholder="예: 우리 교회는, 함께 꿈꾸는 것"
          className="rounded-xl h-11 border-slate-200 bg-white text-sm font-bold mt-2"
        />
      )}
    </div>
  );
}

// 목회 칼럼(프로 이상)/담임목사 인사말(스탠다드 이상)처럼 등급이 안 되는 경우 보여주는 안내 문구.
// 커스텀 디자인의 "지금 고른 디자인은 프로 요금제 전용이에요" 문구와 톤을 맞췄다 - 입력 자체는
// 막지 않고(데이터는 저장됨), 등급이 안 되면 성도 화면에만 안 보이게 한다는 걸 알려준다.
function TierLockBanner({ tierLabel }: { tierLabel: string }) {
  return (
    <p className="text-[11px] text-amber-600 font-semibold mt-3 leading-relaxed flex items-start gap-1.5">
      <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
      이 기능은 {tierLabel} 요금제부터 성도 화면에 표시돼요. 지금 입력해두면 요금제를 올렸을 때 바로 보여드릴게요.
    </p>
  );
}

export function AdminEditor() {
  const navigate = useNavigate();
  const { message: featureUpdateMessage, show: showFeatureUpdate } = useFeatureUpdateNotice();
  const { id } = useParams();
  const isEditing = !!id;

  // 목록 화면 등에서 스크롤이 내려가 있던 상태로 넘어와도, 이 화면은 항상 맨 위부터 보이도록 한다.
  // (React Router는 SPA 전환 시 스크롤 위치를 자동으로 초기화하지 않는다)
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"content" | "cover" | "church" | "sharing" | "design">("content");
  // "커스텀 디자인" 템플릿 - 표어와 같은 이유(보통 오래 유지)로 새 주보 작성 시 최근 값을 이어받는다.
  const [bulletinTemplate, setBulletinTemplate] = useState(DEFAULT_BULLETIN_TEMPLATE_ID);
  // 이 교회 계정(users/{uid}) 데이터 - 커스텀 디자인 사용 권한(allowedTemplates, 요금제) 판정에 쓴다.
  const [accountData, setAccountData] = useState<any>(null);
  // 커스텀 디자인 유료화 설정(settings/customDesign). 유료화 시작일 등.
  const [customDesignConfig, setCustomDesignConfig] = useState<CustomDesignConfig | null>(null);
  const customDesignFreePeriod = isCustomDesignFreePeriod(customDesignConfig);
  const isTemplateUnlocked = (templateId: string) =>
    canApplyCustomTemplate({ templateId, config: customDesignConfig, userData: accountData });
  // 목회 칼럼(프로 이상) / 담임목사 인사말(스탠다드 이상) 게이팅. 무료 개방 기간 정책과 무관하게
  // 바로 적용된다(커스텀 디자인과는 별개 정책) - users/{uid}.status 기준으로 판정.
  const hasStandardOrAbove = hasTierOrAbove(accountData?.status, "standard");
  const hasProOrAbove = hasTierOrAbove(accountData?.status, "pro");
  const hasAllInOne = hasTierOrAbove(accountData?.status, "allinone");
  // 아이폰 미리보기에서 "지금 보고 있는" 디자인. 잠긴 디자인도 맛보기로 눌러볼 수 있어서
  // 실제 적용값(bulletinTemplate)과 분리한다. 적용 가능한 디자인을 고르면 둘이 같이 움직인다.
  const [previewTemplateId, setPreviewTemplateId] = useState(bulletinTemplate);
  useEffect(() => { setPreviewTemplateId(bulletinTemplate); }, [bulletinTemplate]);

  // 카카오톡 등 링크 공유 시 표시할 대표 이미지. 주보 한 건이 아니라 계정(교회) 전체에
  // 적용되는 값(users/{uid}.coverImage)이라 발행 흐름과 별개로 업로드 즉시 저장한다.
  const [coverImage, setCoverImage] = useState("");
  const [coverImageLoading, setCoverImageLoading] = useState(true);
  const [coverImageUploading, setCoverImageUploading] = useState(false);
  const coverImageInputRef = useRef<HTMLInputElement | null>(null);

  // 카카오톡 미리보기에서 실제로 보일 부분을 관리자가 직접 조절할 수 있게 하는 편집 모드.
  // 자동으로 가운데만 잘라주면 원하는 부분(얼굴, 글씨 등)이 잘려나갈 수 있어서,
  // 잘리지 않은 원본을 따로 보관해두고 더블클릭하면 위치를 다시 조절할 수 있게 한다.
  const [coverEditorOpen, setCoverEditorOpen] = useState(false);
  const [coverOriginal, setCoverOriginal] = useState(""); // 편집용 원본(리사이즈만 하고 자르지 않음)
  const [coverOffsetX, setCoverOffsetX] = useState(50); // 0~100, CSS object-position과 동일한 의미
  const [coverOffsetY, setCoverOffsetY] = useState(50);
  const [coverSavedOffsetX, setCoverSavedOffsetX] = useState(50); // 취소 시 되돌아갈 마지막 저장값
  const [coverSavedOffsetY, setCoverSavedOffsetY] = useState(50);
  const coverFrameRef = useRef<HTMLDivElement | null>(null);
  const coverImgNaturalRef = useRef<{ w: number; h: number } | null>(null);
  const coverDragRef = useRef<{ startX: number; startY: number; startOffsetX: number; startOffsetY: number } | null>(null);

  // 카카오톡 미리보기 카드 모형에 쓸 교회 정보. bulletinOG 클라우드 함수가 실제로 만드는
  // og:title/og:description 문구와 동일한 규칙(functions/src/index.ts)을 그대로 따라 표시한다.
  const [previewChurchName, setPreviewChurchName] = useState("");
  const [previewDescription, setPreviewDescription] = useState("");

  // 우리 교회 주보(/view/{uid})를 구글 등 검색엔진에 노출할지 여부. 주보엔 심방 명단,
  // 애경사, 새신자 이름 같은 정보가 들어갈 수 있어 기본값은 꺼짐(opt-in)이며,
  // 교회가 직접 켜야만 사이트맵에 포함되어 검색에 노출된다(functions/src/index.ts 연동).
  const [bulletinSearchable, setBulletinSearchable] = useState(false);
  const [bulletinSearchableSaving, setBulletinSearchableSaving] = useState(false);
  // 교단(users.denomination) — 검색 결과 파비콘용. 주보마다가 아니라 교회 계정에 한 번 저장
  const [churchDenomination, setChurchDenomination] = useState("");
  const [churchDenominationSaving, setChurchDenominationSaving] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) {
          const data = snap.data();
          if (typeof data.coverImage === "string") setCoverImage(data.coverImage);
          if (typeof data.coverImageOriginal === "string") setCoverOriginal(data.coverImageOriginal);
          if (typeof data.coverImageOffsetX === "number") {
            setCoverOffsetX(data.coverImageOffsetX);
            setCoverSavedOffsetX(data.coverImageOffsetX);
          }
          if (typeof data.coverImageOffsetY === "number") {
            setCoverOffsetY(data.coverImageOffsetY);
            setCoverSavedOffsetY(data.coverImageOffsetY);
          }
          if (typeof data.churchName === "string") setPreviewChurchName(data.churchName);
          if (typeof data.description === "string") setPreviewDescription(data.description);
          if (typeof data.bulletinSearchable === "boolean") setBulletinSearchable(data.bulletinSearchable);
          if (typeof data.denomination === "string") setChurchDenomination(data.denomination);
          // 커스텀 디자인 사용 권한 판정용 계정 데이터(allowedTemplates, 요금제 등).
          setAccountData(data);
        }
      } catch (error) {
        console.error("공유 이미지 불러오기 실패:", error);
      } finally {
        setCoverImageLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // 커스텀 디자인 유료화 설정(settings/customDesign). 유료화 시작일 전이면 요금제와 무관하게 사용 가능.
  useEffect(() => {
    getDoc(doc(db, "settings", "customDesign"))
      .then((snap) => setCustomDesignConfig(snap.exists() ? (snap.data() as CustomDesignConfig) : {}))
      .catch(() => setCustomDesignConfig({}));
  }, []);

  // 800x400(2:1) 프레임 기준으로, 주어진 원본 크기와 위치값(offset)에서 실제로 잘라낼
  // 소스 영역(sx, sy, sWidth, sHeight)을 계산한다. CSS object-fit:cover + object-position의
  // 동작을 그대로 캔버스 크롭 좌표로 옮긴 것이라, 편집 화면에서 눈으로 본 것과 결과물이 일치한다.
  const computeCoverCrop = (naturalW: number, naturalH: number, offsetX: number, offsetY: number) => {
    const TARGET_WIDTH = 800;
    const TARGET_HEIGHT = 400;
    const scale = Math.max(TARGET_WIDTH / naturalW, TARGET_HEIGHT / naturalH);
    const sWidth = TARGET_WIDTH / scale;
    const sHeight = TARGET_HEIGHT / scale;
    const sx = (naturalW - sWidth) * (offsetX / 100);
    const sy = (naturalH - sHeight) * (offsetY / 100);
    return { sx, sy, sWidth, sHeight };
  };

  const handleCoverImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("이미지 파일(png, jpeg 등)만 업로드 가능합니다.");
      return;
    }
    if (!auth.currentUser) {
      toast.error("로그인이 필요합니다");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        // 자르지 않은 원본을 편집 가능한 크기로만 축소해서 보관해둔다(잘라내는 건 저장 시점에 한다).
        const MAX_DIMENSION = 1200;
        let { width, height } = img;
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          const scale = MAX_DIMENSION / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, width, height);

        setCoverOriginal(canvas.toDataURL("image/jpeg", 0.85));
        setCoverOffsetX(50);
        setCoverOffsetY(50);
        setCoverEditorOpen(true);
      };
    };
    reader.onerror = () => {
      toast.error("이미지를 읽는 중 오류가 발생했습니다.");
    };
    reader.readAsDataURL(file);
    e.target.value = ""; // 같은 파일을 다시 선택해도 onChange가 동작하도록 초기화
  };

  // 편집 화면(더블클릭 진입 포함)에서 드래그로 위치를 옮기는 핸들러들.
  // 마우스/터치 모두 Pointer Events 하나로 처리한다.
  const handleCoverPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    coverDragRef.current = { startX: e.clientX, startY: e.clientY, startOffsetX: coverOffsetX, startOffsetY: coverOffsetY };
  };

  const handleCoverPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = coverDragRef.current;
    const frame = coverFrameRef.current;
    const natural = coverImgNaturalRef.current;
    if (!drag || !frame || !natural) return;
    const rect = frame.getBoundingClientRect();
    const scale = Math.max(rect.width / natural.w, rect.height / natural.h);
    const overflowX = natural.w * scale - rect.width;
    const overflowY = natural.h * scale - rect.height;
    const deltaX = e.clientX - drag.startX;
    const deltaY = e.clientY - drag.startY;
    // 사진을 직접 드래그하는 느낌을 주기 위해, 드래그 방향과 반대로 노출 위치(offset)를 옮긴다.
    const newOffsetX = overflowX > 0 ? Math.min(100, Math.max(0, drag.startOffsetX - (deltaX / overflowX) * 100)) : 50;
    const newOffsetY = overflowY > 0 ? Math.min(100, Math.max(0, drag.startOffsetY - (deltaY / overflowY) * 100)) : 50;
    setCoverOffsetX(newOffsetX);
    setCoverOffsetY(newOffsetY);
  };

  const handleCoverPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    coverDragRef.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };

  const handleSaveCoverEditor = () => {
    if (!coverOriginal || !auth.currentUser) return;
    const uid = auth.currentUser.uid;
    const img = new Image();
    img.onload = () => {
      const { sx, sy, sWidth, sHeight } = computeCoverCrop(img.width, img.height, coverOffsetX, coverOffsetY);
      const canvas = document.createElement("canvas");
      canvas.width = 800;
      canvas.height = 400;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, 800, 400);

      canvas.toBlob(async (blob) => {
        if (!blob) {
          toast.error("이미지 처리에 실패했습니다.");
          return;
        }
        setCoverImageUploading(true);
        try {
          const fileRef = storageRef(storage, `churchCovers/${uid}.jpg`);
          await uploadBytes(fileRef, blob, { contentType: "image/jpeg" });
          const url = await getDownloadURL(fileRef);
          await setDoc(doc(db, "users", uid), {
            coverImage: url,
            coverImageOriginal: coverOriginal,
            coverImageOffsetX: coverOffsetX,
            coverImageOffsetY: coverOffsetY,
          }, { merge: true });
          setCoverImage(url);
          setCoverSavedOffsetX(coverOffsetX);
          setCoverSavedOffsetY(coverOffsetY);
          setCoverEditorOpen(false);
          toast.success("공유 이미지가 저장되었습니다.");
        } catch (error) {
          console.error("공유 이미지 업로드 실패:", error);
          toast.error("업로드 중 오류가 발생했습니다.");
        } finally {
          setCoverImageUploading(false);
        }
      }, "image/jpeg", 0.85);
    };
    img.src = coverOriginal;
  };

  const handleToggleBulletinSearchable = async (checked: boolean) => {
    if (!auth.currentUser) {
      toast.error("로그인이 필요합니다");
      return;
    }
    const uid = auth.currentUser.uid;
    setBulletinSearchable(checked); // 낙관적 업데이트
    setBulletinSearchableSaving(true);
    try {
      await setDoc(doc(db, "users", uid), { bulletinSearchable: checked }, { merge: true });
      toast.success(checked ? "이제 우리 교회 주보가 검색엔진에 노출돼요." : "검색엔진 노출을 껐어요.");
    } catch (error) {
      console.error("검색엔진 노출 설정 저장 실패:", error);
      setBulletinSearchable(!checked); // 실패 시 되돌리기
      toast.error("설정 저장 중 오류가 발생했습니다.");
    } finally {
      setBulletinSearchableSaving(false);
    }
  };

  // 교단 선택 — 고르는 즉시 교회 계정에 저장(검색엔진 노출 토글과 같은 방식)
  const handleChangeDenomination = async (value: string) => {
    if (!auth.currentUser) {
      toast.error("로그인이 필요합니다");
      return;
    }
    const prev = churchDenomination;
    setChurchDenomination(value);
    setChurchDenominationSaving(true);
    try {
      await setDoc(doc(db, "users", auth.currentUser.uid), { denomination: value }, { merge: true });
      toast.success("교단을 저장했어요.");
    } catch (error) {
      console.error("교단 저장 실패:", error);
      setChurchDenomination(prev);
      toast.error("저장 중 오류가 발생했습니다.");
    } finally {
      setChurchDenominationSaving(false);
    }
  };

  const handleCancelCoverEditor = () => {
    if (coverImage) {
      // 이미 저장된 이미지가 있었다면, 편집 중 옮긴 위치를 마지막 저장값으로 되돌린다.
      setCoverOffsetX(coverSavedOffsetX);
      setCoverOffsetY(coverSavedOffsetY);
    } else {
      // 처음 업로드하고 저장 전에 취소한 경우엔 원본도 함께 버려 빈 업로드 화면으로 되돌린다.
      setCoverOriginal("");
    }
    setCoverEditorOpen(false);
  };

  const [isCustomBank, setIsCustomBank] = useState(false); // 은행명 직접 입력 모드를

  // const [bulletinData, setBulletinData] = useState({
  //   date: new Date().toISOString().split('T')[0],
  //   title: "",
  //   subtitle: "",
  //   scripture: "",
  //   preacher: "",
  //   prayer: "",
  //   nextPrayer: "",
  //   offeringAccount: "",
  //   youtubeId: "",
  //   backgroundImage: "/stayon_image.png", 
  // });

  const [bulletinData, setBulletinData] = useState({
    date: new Date().toISOString().split('T')[0],
    // "어린이 주일", "어버이 주일", "맥추감사주일" 등 이번 주에만 해당하는 특별 주일 표기.
    // 선택 입력, 비워두면 화면에 아예 안 뜸(다른 주보로 이어지지 않고 매번 새로 입력).
    specialSunday: "",
    title: "",
    subtitle: "",
    scripture: "",
    preacher: "",
    prayer: "",
    nextPrayer: "",
    offeringAccount: "",
    bankName: "",
    accountNumber: "",
    accountHolder: "",
    youtubeId: "",
    backgroundImage: "/stayon_image.png",
    pageBgTheme: DEFAULT_PAGE_BG_THEME_ID,
    // 설교 제목(히어로) 글자 크기(px). titleFontSizeEnabled가 꺼져 있으면 저장 시 null로
    // 나가서 각 디자인의 원래 기본 크기(코드에 정해진 값)를 그대로 쓴다. 켜야만 이 값이
    // 실제로 적용된다. 슬라이더 자체의 시작 위치는 24(권장).
    titleFontSize: 24,
  });
  // 설교 제목 글자 크기를 직접 조절할지 여부. 기본값 false 유지 — 체크 안 하면 지금까지처럼
  // 코드가 정한 기본 크기(모바일 26px 등)가 그대로 나간다.
  const [titleFontSizeEnabled, setTitleFontSizeEnabled] = useState(false);

  // 주일 오전 예배
  const [sections, setSections] = useState<BulletinSection[]>([
    { id: "1", label: "입례송", value: "다같이" },
    { id: "2", label: "신앙고백", value: "사도신경" },
    { id: "3", label: "예배자의 고백", value: "다같이" },
    { id: "4", label: "찬양", value: "" },
    { id: "5", label: "말씀 선포", value: "" },
    { id: "6", label: "봉헌", value: "" },
    { id: "7", label: "교회 소식", value: "광고 및 환영" },
    { id: "8", label: "축도", value: "" }
  ]);

  // 주일 오후/저녁 예배 전용 State
  // const [sundayEveningService, setSundayEveningService] = useState({
  //   enabled: true,         // 섹션 사용 여부 (토글)
  //   isCanceled: false,     // 이번 주 휴무 여부 (체크박스)
  //   name: "주일 오후 예배", // 관리자가 직접 입력 가능한 예배명
  //   time: "오후 02:00",
  //   location: "본당",
  //   title: "",
  //   scripture: "",
  //   preacher: "",
  // });

  const [sundayEveningService, setSundayEveningService] = useState({
    enabled: true,
    isCanceled: false,
    name: "주일 오후 예배",
    time: "오후 02:00",
    location: "본당",
    title: "",
    scripture: "",
    preacher: "",
    // 👇 주일 오후/저녁 예배 전용 순서 항목 추가!
    sections: [
      { id: "e1", label: "찬양", value: "다같이" },
      { id: "e2", label: "기도", value: "" },
      { id: "e3", label: "말씀 선포", value: "" },
      { id: "e4", label: "축도/주기도문", value: "" }
    ]
  });

  // 주일 오후/저녁 예배 순서 조작 핸들러
  const addEveningSection = () => {
    setSundayEveningService({
      ...sundayEveningService,
      sections: [...sundayEveningService.sections, { id: Date.now().toString(), label: "", value: "" }]
    });
  };

  const removeEveningSection = (secId: string) => {
    setSundayEveningService({
      ...sundayEveningService,
      sections: sundayEveningService.sections.filter((s) => s.id !== secId)
    });
  };

  const updateEveningSection = (secId: string, field: 'label' | 'value' | 'content', val: string) => {
    setSundayEveningService({
      ...sundayEveningService,
      sections: sundayEveningService.sections.map((s) => (s.id === secId ? { ...s, [field]: val } : s))
    });
  };

  const moveEveningSection = (index: number, direction: 'up' | 'down') => {
    const newSections = [...sundayEveningService.sections];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newSections.length) return;
    [newSections[index], newSections[targetIndex]] = [newSections[targetIndex], newSections[index]];
    setSundayEveningService({
      ...sundayEveningService,
      sections: newSections
    });
  };

  // 주중예배 (수요예배, 금요철야) 데이터 상태
  const [midweekServices, setMidweekServices] = useState({
    enabled: true,
    wednesday: {
      name: "수요예배",
      title: "",
      scripture: "",
      preacher: "",
      dateTime: "",
    },
    friday: {
      name: "금요철야예배",
      title: "",
      scripture: "",
      preacher: "",
      dateTime: "",
    },
    dawn: {
      name: "새벽기도회",
      title: "",
      scripture: "",
      preacher: "",
      dateTime: "",
    }
  });

  // "나눔 설정" (셀모임/구역모임/소그룹 등에서 쓰는 말씀 적용 질문). 매주 말씀이 바뀌므로
  // 오시는 길/교회소개와 달리 이전 주보에서 carry-forward하지 않고 새 주보마다 새로 입력한다.
  // 성도 화면에서는 "섬기는 사람들" 바로 위에 표시된다.
  interface SharingQuestion { id: string; title: string; quote: string; content: string; }
  const [sharingQuestions, setSharingQuestions] = useState<SharingQuestion[]>([]);
  const [sharingEnabled, setSharingEnabled] = useState(true);
  const [newQuestionTitle, setNewQuestionTitle] = useState("");
  const [newQuestionQuote, setNewQuestionQuote] = useState("");
  const [newQuestionContent, setNewQuestionContent] = useState("");
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const dragQuestionIndexRef = useRef<number | null>(null);

  const addSharingQuestion = () => {
    if (!newQuestionTitle.trim()) {
      toast.error("질문 제목을 입력해주세요.");
      return;
    }
    setSharingQuestions([
      ...sharingQuestions,
      {
        id: Date.now().toString(),
        title: newQuestionTitle.trim(),
        quote: newQuestionQuote.trim(),
        content: newQuestionContent.trim(),
      },
    ]);
    setNewQuestionTitle("");
    setNewQuestionQuote("");
    setNewQuestionContent("");
  };

  const removeSharingQuestion = (questionId: string) => {
    setSharingQuestions(sharingQuestions.filter((q) => q.id !== questionId));
    if (editingQuestionId === questionId) setEditingQuestionId(null);
  };

  const updateSharingQuestion = (questionId: string, field: 'title' | 'quote' | 'content', val: string) => {
    setSharingQuestions(sharingQuestions.map((q) => (q.id === questionId ? { ...q, [field]: val } : q)));
  };

  const moveSharingQuestion = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sharingQuestions.length) return;
    const next = [...sharingQuestions];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    setSharingQuestions(next);
  };

  // PC 전용 드래그 재정렬. 별도 라이브러리 없이 네이티브 드래그 이벤트만 사용하고,
  // 모바일(터치)에서는 자연스럽게 동작하지 않아 버튼(위/아래)이 대신 그 역할을 한다.
  const handleQuestionDragStart = (index: number) => {
    dragQuestionIndexRef.current = index;
  };

  const handleQuestionDragOver = (index: number, e: React.DragEvent) => {
    e.preventDefault();
    const from = dragQuestionIndexRef.current;
    if (from === null || from === index) return;
    setSharingQuestions((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(index, 0, moved);
      return next;
    });
    dragQuestionIndexRef.current = index;
  };

  const handleQuestionDragEnd = () => {
    dragQuestionIndexRef.current = null;
  };

  // 담임 목사 - 부교역자(ministers) 리스트와 분리된 별도 자리. 토글로 표시 여부만 관리한다.
  const [seniorPastorEnabled, setSeniorPastorEnabled] = useState(true);
  const [seniorPastor, setSeniorPastor] = useState<{ role: string; name: string; phone: string; photoUrl: string; phoneFreeFormat: boolean; description: string }>(
    { role: "담임 목사", name: "", phone: "", photoUrl: "", phoneFreeFormat: false, description: "" }
  );
  const seniorPastorInputRef = useRef<HTMLInputElement | null>(null);
  const updateSeniorPastor = (field: string, val: any) => setSeniorPastor((p) => ({ ...p, [field]: val }));

  const [ministers, setMinisters] = useState([
    { id: "m1", role: "부목사", name: "", phone: "", photoUrl: "", phoneFreeFormat: false, description: "" }
  ]);
  // "섬기시는분" 섹션 전체를 주보에 표시할지 여부. 기존에 저장된 주보엔 이 필드가 없으므로
  // 불러올 때 값이 없으면(undefined) true로 취급해 기존 화면과 동일하게 보이도록 한다.
  const [ministersEnabled, setMinistersEnabled] = useState(true);

  // 중직자(장로/권사/안수집사 등) 소개. ministers(부교역자)와 별개 리스트 — 연락처 없이
  // 사진/직위/이름/담당 업무만 관리한다. 메뉴 > 섬기시는 분 > 중직자 화면에 표시된다.
  const [officers, setOfficers] = useState([
    { id: "o1", position: "", name: "", photoUrl: "", duty: "" }
  ]);
  const [officersEnabled, setOfficersEnabled] = useState(true);

  // 금주의 찬양 "더보기" - 기존 단일 youtubeId 카드와 별개로, 최대 8개까지 추가 영상을
  // 카드뷰로 보여주는 신규 기능. 토글로 켜고 끌 수 있으며 기본값은 꺼짐.
  const [extraHymns, setExtraHymns] = useState<{ id: string; youtubeId: string; title: string }[]>([]);
  const [extraHymnsEnabled, setExtraHymnsEnabled] = useState(false);
  const [fetchingHymnId, setFetchingHymnId] = useState<string | null>(null);

  // 담임목사 인사말(스탠다드 요금제 이상). 이름/사진은 위 "섬기시는분 안내 설정 > 담임 목사"의
  // seniorPastor.name/photoUrl을 그대로 재사용하고(중복 입력 방지), 여기서는 인사말 고유
  // 정보만 별도로 관리한다. phoneSectionEnabled는 연락처 블록 전체의 노출 on/off,
  // personalPhoneHidden은 그 안에서 개인 연락처만 선택적으로 숨기는 체크박스.
  const [pastorGreetingEnabled, setPastorGreetingEnabled] = useState(true);
  const [pastorGreeting, setPastorGreeting] = useState({
    greetingText: "",
    content: "",
    churchPhone: "",
    personalPhone: "",
    personalPhoneHidden: false,
    phoneSectionEnabled: true,
    email: "",
  });
  const updatePastorGreeting = (field: string, val: any) => setPastorGreeting((p) => ({ ...p, [field]: val }));

  // "오시는 길" (교회 주소) 상태. 주소는 다음(Daum) 우편번호 찾기로 검색해서 채우고,
  // 상세 주소(동/호수 등)는 직접 입력한다. addressEnabled는 ministersEnabled와 동일한 패턴.
  const [churchAddress, setChurchAddress] = useState("");
  const [churchAddressDetail, setChurchAddressDetail] = useState("");
  const [addressEnabled, setAddressEnabled] = useState(true);
  // 지도 API 키 없이도 실제 지도 느낌을 낼 수 있도록, 교회가 이미 갖고 있는 위치 안내 이미지
  // (또는 네이버 지도 등에서 직접 캡처한 이미지)를 업로드해서 보여주는 방식.
  const [locationImage, setLocationImage] = useState("");
  const [locationImageRatio, setLocationImageRatio] = useState<"4:3" | "1:1">("4:3");
  const locationImageInputRef = useRef<HTMLInputElement | null>(null);

  // 메뉴 > "교회 SNS · 유튜브" 화면용. 네이버 블로그/인스타그램/쓰레드는 링크만 있으면
  // 되고(비워두면 그 항목만 안 보임), 유튜브는 채널 링크 + (자동으로 가져온) 채널명 +
  // 관리자가 직접 올리는 썸네일 이미지로 구성한다 - 채널 URL은 oEmbed로 썸네일을
  // 못 가져오기 때문(영상 링크만 지원됨).
  const [snsEnabled, setSnsEnabled] = useState(true);
  const [snsNaverBlog, setSnsNaverBlog] = useState("");
  const [snsInstagram, setSnsInstagram] = useState("");
  const [snsThreads, setSnsThreads] = useState("");
  const [youtubeChannelUrl, setYoutubeChannelUrl] = useState("");
  const [youtubeChannelName, setYoutubeChannelName] = useState("");
  const [youtubeChannelThumbnail, setYoutubeChannelThumbnail] = useState("");
  const [fetchingChannelName, setFetchingChannelName] = useState(false);
  const youtubeThumbnailInputRef = useRef<HTMLInputElement | null>(null);

  // "교회 로고" - 교회 주소·표어처럼 거의 안 바뀌는 값이라 새 주보 작성 시 최근 값을 이어받는다.
  // 성도 화면 맨 위(히어로 사진 바로 아래)에 흰색 띠로 표시된다.
  const [churchLogo, setChurchLogo] = useState("");
  const [churchLogoEnabled, setChurchLogoEnabled] = useState(true);
  const [churchLogoSize, setChurchLogoSize] = useState<ChurchLogoSize>(DEFAULT_CHURCH_LOGO_SIZE);
  const churchLogoInputRef = useRef<HTMLInputElement | null>(null);

  // "교회 소개" - 로고·표어처럼 거의 안 바뀌므로 새 주보 작성 시 최근 값을 이어받는다.
  // 성도 화면 우측 상단 메뉴 > 소개(/view/:id/about)에 표시된다.
  const [churchIntro, setChurchIntro] = useState("");
  const [churchIntroEnabled, setChurchIntroEnabled] = useState(true);
  // 소개 화면에서 로고 아래 크게 보여줄 교회 사진 (모바일 세로형 권장).
  const [churchImage, setChurchImage] = useState("");
  const churchImageInputRef = useRef<HTMLInputElement | null>(null);

  // "표어 / 주제 성구" - 교회 주소와 마찬가지로 보통 한 번 정하면 오래(보통 1년) 유지되는
  // 내용이라, 새 주보 작성 시 최근 값을 자동으로 이어서 채워준다(carry-forward). 다만
  // 값 자체는 주보마다 개별 저장되어 그때그때 수정 가능하고, 주보 복사 시에도 함께 복사된다.
  // 성도 화면에서는 "섬기는 사람들" 바로 위에 표시되고, labelType이 그대로 화면 제목이 된다.
  const [mottoEnabled, setMottoEnabled] = useState(true);
  const [mottoLabelType, setMottoLabelType] = useState<"verse" | "motto" | "custom">("verse");
  const [mottoCustomLabel, setMottoCustomLabel] = useState("");
  const [mottoText, setMottoText] = useState("");
  const [mottoReference, setMottoReference] = useState("");

  // "교회 비전 / 교회 사명" - 표어와 마찬가지로 거의 안 바뀌는 내용이라 carry-forward 대상.
  // 둘 다 필수 입력이 아닌 선택 입력. 사명은 성도 화면(교회 소개 메뉴)에 텍스트로 노출된다.
  const [churchVisionEnabled, setChurchVisionEnabled] = useState(true);
  const [churchVision, setChurchVision] = useState("");
  const [churchMissionEnabled, setChurchMissionEnabled] = useState(true);
  const [churchMission, setChurchMission] = useState("");
  // 교회 소개 화면 제목(ABOUT/VISION/MISSION)을 다른 이름으로 표시 — 체크 + 입력값이 있을 때만 바뀜
  const [churchIntroLabelEnabled, setChurchIntroLabelEnabled] = useState(false);
  const [churchIntroLabel, setChurchIntroLabel] = useState("");
  const [churchVisionLabelEnabled, setChurchVisionLabelEnabled] = useState(false);
  const [churchVisionLabel, setChurchVisionLabel] = useState("");
  const [churchMissionLabelEnabled, setChurchMissionLabelEnabled] = useState(false);
  const [churchMissionLabel, setChurchMissionLabel] = useState("");

  // 다음 우편번호 찾기 스크립트 로드 (place.stayon-platform.com/register와 동일한 방식)
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
    script.async = true;
    document.head.appendChild(script);
  }, []);

  const handleAddressSearch = () => {
    if (!(window as any).daum?.Postcode) {
      toast.error("주소 검색 기능을 불러오는 중입니다. 잠시 후 다시 시도해주세요.");
      return;
    }
    new (window as any).daum.Postcode({
      oncomplete: (data: any) => {
        setChurchAddress(data.address);
      },
    }).open();
  };

  // 주보 배경 "직접 업로드" - 미리 만들어둔 BACKGROUND_TEMPLATES 외에, 관리자가
  // 원하는 사진을 올려서 그대로 배경으로 쓸 수 있게 한다. 배경은 화면 전체를
  // 덮는 히어로 이미지라 썸네일보다 큰 해상도(최대 1080px)로 저장한다.
  // customBgUrl은 "지금 선택된 배경"(bulletinData.backgroundImage)과 별개로,
  // "이 교회가 한 번이라도 올린 적 있는 커스텀 배경"을 기억해둔다 - 프리셋으로
  // 바꿨다가 다시 업로드한 사진으로 돌아가고 싶을 때 재업로드 안 해도 되게 하기 위함.
  // 실제 파일은 uid당 하나(bulletinBackgrounds/{uid}.jpg, 새로 올리면 덮어씀)라
  // 편집 화면 진입 시 그 경로로 다운로드 URL을 미리 한 번 조회해서 기억해둔다.
  const customBgInputRef = useRef<HTMLInputElement | null>(null);
  const [customBgUrl, setCustomBgUrl] = useState("");
  const [uploadingCustomBg, setUploadingCustomBg] = useState(false);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    getDownloadURL(storageRef(storage, `bulletinBackgrounds/${uid}.jpg`))
      .then((url) => setCustomBgUrl(url))
      .catch(() => {
        // 한 번도 안 올렸으면 파일이 없어서 에러 나는 게 정상 - 조용히 무시
      });
  }, []);

  const handleCustomBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("이미지 파일(png, jpeg 등)만 업로드 가능합니다.");
      return;
    }
    if (!auth.currentUser) {
      toast.error("로그인이 필요합니다");
      return;
    }
    const uid = auth.currentUser.uid;
    setUploadingCustomBg(true);

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_SIZE = 1080;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);

        canvas.toBlob(async (blob) => {
          if (!blob) {
            toast.error("이미지 처리에 실패했습니다.");
            setUploadingCustomBg(false);
            return;
          }
          try {
            const fileRef = storageRef(storage, `bulletinBackgrounds/${uid}.jpg`);
            await uploadBytes(fileRef, blob, { contentType: "image/jpeg" });
            const url = await getDownloadURL(fileRef);
            setBulletinData({ ...bulletinData, backgroundImage: url });
            setCustomBgUrl(url);
            toast.success("배경 이미지가 등록되었습니다.");
          } catch (error) {
            console.error("배경 이미지 업로드 실패:", error);
            toast.error("업로드 중 오류가 발생했습니다.");
          } finally {
            setUploadingCustomBg(false);
          }
        }, "image/jpeg", 0.85);
      };
    };
    reader.onerror = () => {
      toast.error("이미지를 읽는 중 오류가 발생했습니다.");
      setUploadingCustomBg(false);
    };
    reader.readAsDataURL(file);
  };

  // 위치 안내 이미지 업로드 핸들러. base64로 문서에 직접 저장하던 방식은 Firestore 문서
  // 용량 제한(1MB)을 넘길 수 있어(교회 로고/이미지와 동일한 사고 유형), Storage 업로드로 변경.
  const handleLocationImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("이미지 파일(png, jpeg 등)만 업로드 가능합니다.");
      return;
    }
    if (!auth.currentUser) {
      toast.error("로그인이 필요합니다");
      return;
    }
    const uid = auth.currentUser.uid;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_SIZE = 720;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);

        canvas.toBlob(async (blob) => {
          if (!blob) {
            toast.error("이미지 처리에 실패했습니다.");
            return;
          }
          try {
            const fileRef = storageRef(storage, `locationImages/${uid}.jpg`);
            await uploadBytes(fileRef, blob, { contentType: "image/jpeg" });
            const url = await getDownloadURL(fileRef);
            setLocationImage(url);
            toast.success("위치 안내 이미지가 등록되었습니다.");
          } catch (error) {
            console.error("위치 안내 이미지 업로드 실패:", error);
            toast.error("업로드 중 오류가 발생했습니다.");
          }
        }, "image/jpeg", 0.75);
      };
    };
    reader.onerror = () => {
      toast.error("이미지를 읽는 중 오류가 발생했습니다.");
    };
    reader.readAsDataURL(file);
  };

  const handleYoutubeThumbnailUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("이미지 파일(png, jpeg 등)만 업로드 가능합니다.");
      return;
    }
    if (!auth.currentUser) {
      toast.error("로그인이 필요합니다");
      return;
    }
    const uid = auth.currentUser.uid;

    const reader2 = new FileReader();
    reader2.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_SIZE = 480;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);

        canvas.toBlob(async (blob) => {
          if (!blob) {
            toast.error("이미지 처리에 실패했습니다.");
            return;
          }
          try {
            const fileRef = storageRef(storage, `youtubeThumbnails/${uid}.jpg`);
            await uploadBytes(fileRef, blob, { contentType: "image/jpeg" });
            const url = await getDownloadURL(fileRef);
            setYoutubeChannelThumbnail(url);
            toast.success("썸네일 이미지가 등록되었습니다.");
          } catch (error) {
            console.error("유튜브 채널 썸네일 업로드 실패:", error);
            toast.error("업로드 중 오류가 발생했습니다.");
          }
        }, "image/jpeg", 0.8);
      };
    };
    reader2.onerror = () => {
      toast.error("이미지를 읽는 중 오류가 발생했습니다.");
    };
    reader2.readAsDataURL(file);
  };

  // 유튜브 채널 URL은 oEmbed가 지원되지 않아(영상 링크만 지원), 서버 함수가 채널
  // 페이지의 og:title을 대신 읽어서 채널명을 돌려준다. 실패해도(함수 미배포, 네트워크
  // 오류 등) 채널명 입력창은 그대로 수동 입력 가능한 상태로 남는다.
  const handleYoutubeChannelUrlBlur = async (rawUrl: string) => {
    const url = rawUrl.trim();
    if (!url) return;
    setFetchingChannelName(true);
    try {
      const res = await fetch(
        `https://asia-northeast3-stayonsbplatform.cloudfunctions.net/fetchYoutubeChannelName?url=${encodeURIComponent(url)}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.name) setYoutubeChannelName(data.name);
      }
    } catch {
      // 서버 함수가 아직 배포되지 않았거나 네트워크 오류 - 채널명은 직접 입력하면 된다.
    }
    setFetchingChannelName(false);
  };

  // 교회 로고 업로드. 로고는 투명 배경 PNG가 많으므로 JPEG로 바꾸지 않고 PNG로 유지한다.
  // base64로 만들어 주보 문서 안에 직접 저장했었는데, 사진처럼 복잡한 이미지를 PNG로
  // 올리면 Firestore 문서 용량 제한(1MB)을 넘겨 발행 자체가 실패하는 사고가 있었음
  // (베다니교회 사례) — Storage에 파일로 올리고 문서엔 짧은 URL만 저장하도록 변경.
  const handleChurchLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("이미지 파일(png, jpeg 등)만 업로드 가능합니다.");
      return;
    }
    if (!auth.currentUser) {
      toast.error("로그인이 필요합니다");
      return;
    }
    const uid = auth.currentUser.uid;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_SIZE = 1000;
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
        } else {
          if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
        }
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d")?.drawImage(img, 0, 0, width, height);
        canvas.toBlob(async (blob) => {
          if (!blob) {
            toast.error("이미지 처리에 실패했습니다.");
            return;
          }
          try {
            const fileRef = storageRef(storage, `churchLogos/${uid}.png`);
            await uploadBytes(fileRef, blob, { contentType: "image/png" });
            const url = await getDownloadURL(fileRef);
            setChurchLogo(url);
            toast.success("교회 로고가 등록되었습니다.");
          } catch (error) {
            console.error("교회 로고 업로드 실패:", error);
            toast.error("업로드 중 오류가 발생했습니다.");
          }
        }, "image/png");
      };
    };
    reader.onerror = () => toast.error("이미지를 읽는 중 오류가 발생했습니다.");
    reader.readAsDataURL(file);
  };

  // 교회 이미지(소개 화면용). 모바일 세로 화면에서 크게 보이므로 해상도를 넉넉히(1400px) 유지.
  // 로고와 동일한 이유로 base64 직접 저장 대신 Storage 업로드 + URL 저장 방식으로 변경.
  const handleChurchImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) {
      if (file) toast.error("이미지 파일(png, jpeg 등)만 업로드 가능합니다.");
      return;
    }
    if (!auth.currentUser) {
      toast.error("로그인이 필요합니다");
      return;
    }
    const uid = auth.currentUser.uid;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX = 1400;
        let w = img.width, h = img.height;
        if (w > h) { if (w > MAX) { h *= MAX / w; w = MAX; } }
        else { if (h > MAX) { w *= MAX / h; h = MAX; } }
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d")?.drawImage(img, 0, 0, w, h);
        canvas.toBlob(async (blob) => {
          if (!blob) {
            toast.error("이미지 처리에 실패했습니다.");
            return;
          }
          try {
            const fileRef = storageRef(storage, `churchImages/${uid}.jpg`);
            await uploadBytes(fileRef, blob, { contentType: "image/jpeg" });
            const url = await getDownloadURL(fileRef);
            setChurchImage(url);
            toast.success("교회 이미지가 등록되었습니다.");
          } catch (error) {
            console.error("교회 이미지 업로드 실패:", error);
            toast.error("업로드 중 오류가 발생했습니다.");
          }
        }, "image/jpeg", 0.8);
      };
    };
    reader.onerror = () => toast.error("이미지를 읽는 중 오류가 발생했습니다.");
    reader.readAsDataURL(file);
  };

  // 새 주보 작성 시(수정 화면 아님) 가장 최근에 발행/저장했던 주소를 자동으로 불러와 채워둔다.
  // 교회 주소는 매주 바뀌는 정보가 아니므로, 매번 재입력하지 않아도 되도록 하기 위함.
  // 표어/주제 성구도 같은 이유(보통 1년 정도 유지)로 같이 이어서 채워준다.
  useEffect(() => {
    if (isEditing) return;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      try {
        const bulletinsRef = collection(db, "bulletins");
        const q = query(bulletinsRef, where("authorId", "==", user.uid), orderBy("createdAt", "desc"), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const data = snap.docs[0].data();
          if (data.churchAddress) {
            setChurchAddress(data.churchAddress);
            setChurchAddressDetail(data.churchAddressDetail || "");
            setAddressEnabled(data.addressEnabled !== false);
            if (data.locationImage) {
              setLocationImage(data.locationImage);
              setLocationImageRatio(data.locationImageRatio === "1:1" ? "1:1" : "4:3");
            }
          }
          if (data.mottoText) {
            setMottoEnabled(data.mottoEnabled !== false);
            setMottoLabelType(data.mottoLabelType === "motto" || data.mottoLabelType === "custom" ? data.mottoLabelType : "verse");
            setMottoCustomLabel(data.mottoCustomLabel || "");
            setMottoText(data.mottoText || "");
            setMottoReference(data.mottoReference || "");
          }
          if (data.churchVision) {
            setChurchVisionEnabled(data.churchVisionEnabled !== false);
            setChurchVision(data.churchVision);
            setChurchVisionLabelEnabled(data.churchVisionLabelEnabled === true);
            setChurchVisionLabel(data.churchVisionLabel || "");
          }
          if (data.churchMission) {
            setChurchMissionEnabled(data.churchMissionEnabled !== false);
            setChurchMission(data.churchMission);
            setChurchMissionLabelEnabled(data.churchMissionLabelEnabled === true);
            setChurchMissionLabel(data.churchMissionLabel || "");
          }
          setPastoralColumnsEnabled(data.pastoralColumnsEnabled === true);
          if (data.bulletinTemplate) {
            setBulletinTemplate(data.bulletinTemplate);
          }
          if (data.churchLogo) {
            setChurchLogo(data.churchLogo);
            setChurchLogoEnabled(data.churchLogoEnabled !== false);
            setChurchLogoSize(normalizeChurchLogoSize(data.churchLogoSize));
          }
          if (data.churchIntro) {
            setChurchIntro(data.churchIntro);
            setChurchIntroEnabled(data.churchIntroEnabled !== false);
            setChurchIntroLabelEnabled(data.churchIntroLabelEnabled === true);
            setChurchIntroLabel(data.churchIntroLabel || "");
          }
          if (data.churchImage) setChurchImage(data.churchImage);
          // SNS·유튜브 채널도 표어·로고처럼 거의 안 바뀌므로 최근 값을 이어받는다.
          if (data.snsNaverBlog || data.snsInstagram || data.snsThreads || data.youtubeChannelUrl) {
            setSnsEnabled(data.snsEnabled !== false);
            setSnsNaverBlog(data.snsNaverBlog || "");
            setSnsInstagram(data.snsInstagram || "");
            setSnsThreads(data.snsThreads || "");
            setYoutubeChannelUrl(data.youtubeChannelUrl || "");
            setYoutubeChannelName(data.youtubeChannelName || "");
            setYoutubeChannelThumbnail(data.youtubeChannelThumbnail || "");
          }
          // 담임 목사는 표어·로고처럼 거의 안 바뀌므로 최근 값을 이어받는다.
          if (data.seniorPastor && data.seniorPastor.name) {
            setSeniorPastor({
              role: data.seniorPastor.role || "담임 목사",
              name: data.seniorPastor.name || "",
              phone: data.seniorPastor.phone || "",
              photoUrl: data.seniorPastor.photoUrl || "",
              phoneFreeFormat: !!data.seniorPastor.phoneFreeFormat,
              description: data.seniorPastor.description || "",
            });
            setSeniorPastorEnabled(data.seniorPastorEnabled !== false);
          }
          if (data.pastorGreeting && typeof data.pastorGreeting === "object") {
            setPastorGreeting({
              greetingText: data.pastorGreeting.greetingText || "",
              content: data.pastorGreeting.content || "",
              churchPhone: data.pastorGreeting.churchPhone || "",
              personalPhone: data.pastorGreeting.personalPhone || "",
              personalPhoneHidden: !!data.pastorGreeting.personalPhoneHidden,
              phoneSectionEnabled: data.pastorGreeting.phoneSectionEnabled !== false,
              email: data.pastorGreeting.email || "",
            });
            setPastorGreetingEnabled(data.pastorGreetingEnabled !== false);
          }
        }
      } catch (error) {
        console.error("최근 주소 불러오기 실패:", error);
      }
    });
    return () => unsubscribe();
  }, [isEditing]);

  // 파일 업로드 참조 추가: 각 사역자별 숨겨진 파일 Input에 접근하기 위한 ref 맵 또는 핸들러
  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  const addMinister = () => {
    setMinisters([...ministers, { id: Date.now().toString(), role: "", name: "", phone: "", photoUrl: "", phoneFreeFormat: false, description: "" }]);
  };

  const removeMinister = (ministerId: string) => {
    setMinisters(ministers.filter((m) => m.id !== ministerId));
  };

  // updateMinister 함수 타입에 'phone', 'description' 추가
  const updateMinister = (ministerId: string, field: 'role' | 'name' | 'phone' | 'photoUrl' | 'description', val: string) => {
    setMinisters(ministers.map((m) => (m.id === ministerId ? { ...m, [field]: val } : m)));
  };

  // 연락처 형식 자유 입력 체크박스 토글. 켜면 자동 하이픈 포맷을 끄고 숫자/하이픈을 자유롭게 직접 입력할 수 있다.
  // (0507 안심번호, 043-123-1234 같은 지역번호 등 010-XXXX-XXXX 규격이 아닌 번호를 위함)
  const toggleMinisterPhoneFreeFormat = (ministerId: string) => {
    setMinisters(ministers.map((m: any) => (m.id === ministerId ? { ...m, phoneFreeFormat: !m.phoneFreeFormat } : m)));
  };

  // 이미지 파일 선택 시 압축 후 Storage에 업로드하고, 문서엔 URL만 저장하는 핸들러.
  // base64로 문서에 직접 저장하면 사역자가 여러 명일 때 Firestore 문서 용량 제한(1MB)을
  // 넘기기 쉬워(교회 로고/이미지와 동일한 사고 유형), Storage 업로드로 변경.
  const handleImageUpload = (ministerId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("이미지 파일(png, jpeg 등)만 업로드 가능합니다.");
      return;
    }
    if (!auth.currentUser) {
      toast.error("로그인이 필요합니다");
      return;
    }
    const uid = auth.currentUser.uid;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        // 주보 공개 화면의 사역자 상세 팝업이 이 사진을 꽤 크게(가로 폭 꽉 채워) 보여주기 때문에,
        // 예전 300px 기준은 확대되면서 뿌옇게 깨져 보였다. 600px로 올려서 선명도를 확보한다.
        const MAX_WIDTH = 600;
        const MAX_HEIGHT = 600;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);

        canvas.toBlob(async (blob) => {
          if (!blob) {
            toast.error("이미지 처리에 실패했습니다.");
            return;
          }
          try {
            const fileRef = storageRef(storage, `ministerPhotos/${uid}/${ministerId}.jpg`);
            await uploadBytes(fileRef, blob, { contentType: "image/jpeg" });
            const url = await getDownloadURL(fileRef);
            updateMinister(ministerId, 'photoUrl', url);
            toast.success("사역자 사진이 압축되어 성공적으로 등록되었습니다.");
          } catch (error) {
            console.error("사역자 사진 업로드 실패:", error);
            toast.error("업로드 중 오류가 발생했습니다.");
          }
        }, "image/jpeg", 0.75);
      };
    };
    reader.onerror = () => {
      toast.error("이미지를 읽는 중 오류가 발생했습니다.");
    };
    reader.readAsDataURL(file);
  };

  // 중직자 사진 파일 입력 참조 + 목록 조작 핸들러. ministers 쪽과 완전히 동일한 패턴.
  const officerFileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  const addOfficer = () => {
    setOfficers([...officers, { id: Date.now().toString(), position: "", name: "", photoUrl: "", duty: "" }]);
  };

  const removeOfficer = (officerId: string) => {
    setOfficers(officers.filter((o) => o.id !== officerId));
  };

  const updateOfficer = (officerId: string, field: 'position' | 'name' | 'photoUrl' | 'duty', val: string) => {
    setOfficers(officers.map((o) => (o.id === officerId ? { ...o, [field]: val } : o)));
  };

  // 찬양 "더보기" 영상 목록 조작. 링크를 입력하고 포커스를 벗어나면(onBlur) ID를 추출해
  // 유튜브 oEmbed로 제목을 자동으로 가져와 저장한다(매번 성도 화면에서 다시 불러오지 않도록).
  const addExtraHymn = () => {
    if (extraHymns.length >= 8) {
      toast("최대 8개까지 추가할 수 있어요.");
      return;
    }
    setExtraHymns([...extraHymns, { id: Date.now().toString(), youtubeId: "", title: "" }]);
  };

  const removeExtraHymn = (hymnId: string) => {
    setExtraHymns(extraHymns.filter((h) => h.id !== hymnId));
  };

  const updateExtraHymnRaw = (hymnId: string, rawInput: string) => {
    setExtraHymns(extraHymns.map((h) => (h.id === hymnId ? { ...h, youtubeId: rawInput } : h)));
  };

  const extractYoutubeVideoId = (input: string): string | null => {
    const trimmed = input.trim();
    if (!trimmed) return null;
    const match = trimmed.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
    if (match) return match[1];
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
    return null;
  };

  const handleExtraHymnBlur = async (hymnId: string, rawInput: string) => {
    const videoId = extractYoutubeVideoId(rawInput);
    if (!videoId) {
      if (rawInput.trim() !== "") toast("유튜브 링크를 확인해주세요.");
      return;
    }
    setFetchingHymnId(hymnId);
    let title = "제목 없음";
    try {
      const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`);
      if (res.ok) {
        const data = await res.json();
        title = data.title || "제목 없음";
      }
    } catch {
      // 네트워크 오류 - "제목 없음"으로 저장해두고, 링크를 다시 입력하면 재시도된다.
    }
    setExtraHymns((prev) => prev.map((h) => (h.id === hymnId ? { ...h, youtubeId: videoId, title } : h)));
    setFetchingHymnId(null);
  };

  // 중직자 사진 업로드 - handleImageUpload와 동일한 압축 규칙(600px, JPEG 0.75) +
  // 동일한 이유로 base64 직접 저장 대신 Storage 업로드로 변경, 저장 위치만 officers로.
  const handleOfficerImageUpload = (officerId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("이미지 파일(png, jpeg 등)만 업로드 가능합니다.");
      return;
    }
    if (!auth.currentUser) {
      toast.error("로그인이 필요합니다");
      return;
    }
    const uid = auth.currentUser.uid;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX = 600;
        let w = img.width, h = img.height;
        if (w > h) { if (w > MAX) { h *= MAX / w; w = MAX; } }
        else { if (h > MAX) { w *= MAX / h; h = MAX; } }
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d")?.drawImage(img, 0, 0, w, h);
        canvas.toBlob(async (blob) => {
          if (!blob) {
            toast.error("이미지 처리에 실패했습니다.");
            return;
          }
          try {
            const fileRef = storageRef(storage, `officerPhotos/${uid}/${officerId}.jpg`);
            await uploadBytes(fileRef, blob, { contentType: "image/jpeg" });
            const url = await getDownloadURL(fileRef);
            updateOfficer(officerId, 'photoUrl', url);
            toast.success("중직자 사진이 압축되어 성공적으로 등록되었습니다.");
          } catch (error) {
            console.error("중직자 사진 업로드 실패:", error);
            toast.error("업로드 중 오류가 발생했습니다.");
          }
        }, "image/jpeg", 0.75);
      };
    };
    reader.onerror = () => toast.error("이미지를 읽는 중 오류가 발생했습니다.");
    reader.readAsDataURL(file);
  };

  // 목회 칼럼 섹션을 이번 주보 성도 화면에 표시할지 여부. 칼럼 목록 자체(columns)는 계정
  // 단위로 누적되는 별도 컬렉션이라 여기서 안 지워지지만, 다른 섹션들(ministersEnabled 등)과
  // 동일하게 "이번 주보에서만 숨기기"가 가능해야 해서 bulletins 문서에 함께 저장한다.
  const [pastoralColumnsEnabled, setPastoralColumnsEnabled] = useState(false);

  // 목회 칼럼(프로 요금제 이상) - 주보와 무관하게 계정(authorId)별로 누적되는 별도 컬렉션.
  // 주보 저장(saveToFirestore)과 완전히 분리되어, 추가/수정/삭제가 즉시 Firestore에 반영된다.
  const [columns, setColumns] = useState<PastoralColumn[]>([]);
  const [columnsLoading, setColumnsLoading] = useState(true);
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [columnDraft, setColumnDraft] = useState({ date: "", title: "", content: "", author: "", imageUrl: "" });
  const [savingColumn, setSavingColumn] = useState(false);
  const columnImageInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) { setColumnsLoading(false); return; }
      try {
        const list = await fetchPastoralColumns(user.uid);
        setColumns(list);
      } catch (error) {
        console.error("목회 칼럼 목록 조회 실패:", error);
      } finally {
        setColumnsLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const resetColumnDraft = () => {
    setEditingColumnId(null);
    setColumnDraft({ date: "", title: "", content: "", author: "", imageUrl: "" });
  };

  const startEditColumn = (col: PastoralColumn) => {
    setEditingColumnId(col.id);
    setColumnDraft({ date: col.date || "", title: col.title || "", content: col.content || "", author: col.author || "", imageUrl: col.imageUrl || "" });
  };

  // 목회 칼럼 이미지는 올인원 요금제 전용. 압축 규칙은 다른 이미지 업로드와 동일하되,
  // base64 직접 저장 대신 Storage 업로드로 변경(다른 사진 필드들과 동일한 이유).
  const handleColumnImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) {
      if (file) toast.error("이미지 파일(png, jpeg 등)만 업로드 가능합니다.");
      return;
    }
    if (!auth.currentUser) {
      toast.error("로그인이 필요합니다");
      return;
    }
    const uid = auth.currentUser.uid;
    const colId = editingColumnId || `new-${Date.now()}`;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX = 1000;
        let w = img.width, h = img.height;
        if (w > h) { if (w > MAX) { h *= MAX / w; w = MAX; } }
        else { if (h > MAX) { w *= MAX / h; h = MAX; } }
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d")?.drawImage(img, 0, 0, w, h);
        canvas.toBlob(async (blob) => {
          if (!blob) {
            toast.error("이미지 처리에 실패했습니다.");
            return;
          }
          try {
            const fileRef = storageRef(storage, `columnImages/${uid}/${colId}.jpg`);
            await uploadBytes(fileRef, blob, { contentType: "image/jpeg" });
            const url = await getDownloadURL(fileRef);
            setColumnDraft((d) => ({ ...d, imageUrl: url }));
            toast.success("이미지가 등록되었습니다.");
          } catch (error) {
            console.error("목회 칼럼 이미지 업로드 실패:", error);
            toast.error("업로드 중 오류가 발생했습니다.");
          }
        }, "image/jpeg", 0.8);
      };
    };
    reader.onerror = () => toast.error("이미지를 읽는 중 오류가 발생했습니다.");
    reader.readAsDataURL(file);
  };

  const handleSaveColumn = async () => {
    if (!auth.currentUser) return toast.error("로그인이 필요합니다");
    if (!columnDraft.date) return toast.error("날짜를 선택해주세요.");
    if (!columnDraft.title.trim()) return toast.error("제목을 입력해주세요.");
    if (!columnDraft.content.trim()) return toast.error("내용을 입력해주세요.");
    setSavingColumn(true);
    try {
      const payload = {
        authorId: auth.currentUser.uid,
        date: columnDraft.date,
        title: columnDraft.title.trim(),
        content: columnDraft.content.trim(),
        author: columnDraft.author.trim(),
        imageUrl: hasAllInOne ? columnDraft.imageUrl : "", // 올인원 미만이면 이미지는 저장하지 않음
      };
      if (editingColumnId) {
        await updatePastoralColumn(editingColumnId, payload);
        setColumns((prev) => prev.map((c) => (c.id === editingColumnId ? { ...c, ...payload } : c)));
        toast.success("목회 칼럼이 수정되었습니다.");
      } else {
        const ref = await addPastoralColumn(payload);
        setColumns((prev) => [{ id: ref.id, ...payload }, ...prev].sort((a, b) => (a.date < b.date ? 1 : -1)));
        toast.success("목회 칼럼이 등록되었습니다.");
      }
      resetColumnDraft();
    } catch (error) {
      console.error("목회 칼럼 저장 실패:", error);
      toast.error("저장 중 오류가 발생했습니다.");
    } finally {
      setSavingColumn(false);
    }
  };

  const handleDeleteColumn = async (columnId: string) => {
    if (!window.confirm("이 목회 칼럼을 삭제하시겠습니까? 되돌릴 수 없습니다.")) return;
    try {
      await deletePastoralColumn(columnId);
      setColumns((prev) => prev.filter((c) => c.id !== columnId));
      if (editingColumnId === columnId) resetColumnDraft();
      toast.success("삭제되었습니다.");
    } catch (error) {
      console.error("목회 칼럼 삭제 실패:", error);
      toast.error("삭제 중 오류가 발생했습니다.");
    }
  };

  // 담임 목사 사진 - handleImageUpload와 같은 리사이즈 규칙 + 동일한 이유로 base64 직접 저장
  // 대신 Storage 업로드로 변경, 저장 위치만 seniorPastor 로.
  const handleSeniorPastorImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) {
      if (file) toast.error("이미지 파일(png, jpeg 등)만 업로드 가능합니다.");
      return;
    }
    if (!auth.currentUser) {
      toast.error("로그인이 필요합니다");
      return;
    }
    const uid = auth.currentUser.uid;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX = 600;
        let w = img.width, h = img.height;
        if (w > h) { if (w > MAX) { h *= MAX / w; w = MAX; } }
        else { if (h > MAX) { w *= MAX / h; h = MAX; } }
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d")?.drawImage(img, 0, 0, w, h);
        canvas.toBlob(async (blob) => {
          if (!blob) {
            toast.error("이미지 처리에 실패했습니다.");
            return;
          }
          try {
            const fileRef = storageRef(storage, `seniorPastorPhotos/${uid}.jpg`);
            await uploadBytes(fileRef, blob, { contentType: "image/jpeg" });
            const url = await getDownloadURL(fileRef);
            updateSeniorPastor("photoUrl", url);
            toast.success("담임 목사 사진이 등록되었습니다.");
          } catch (error) {
            console.error("담임 목사 사진 업로드 실패:", error);
            toast.error("업로드 중 오류가 발생했습니다.");
          }
        }, "image/jpeg", 0.75);
      };
    };
    reader.readAsDataURL(file);
  };

  const [sundayServices, setSundayServices] = useState([
    { name: "1부 예배", time: "오전 09:00", location: "대예배실" },
    { name: "2부 예배", time: "오전 11:00", location: "대예배실" }
  ]);

  const [announcements, setAnnouncements] = useState<Announcement[]>([
    { id: "a1", title: "새가족 환영", content: "우리 교회에 처음 오신 분들을 진심으로 환영합니다." }
  ]);

  // 실시간 임시 저장 로직 (미리보기용)
  useEffect(() => {
    const tempData = {
      ...bulletinData,
      // 체크박스 꺼져 있으면 미리보기에서도 슬라이더 값 대신 각 디자인 기본 크기가 나가야 하므로
      // bulletinData 스프레드의 titleFontSize를 여기서 다시 덮어쓴다.
      titleFontSize: titleFontSizeEnabled ? bulletinData.titleFontSize : null,
      sections,
      announcements,
      midweekServices,
      sundayServices,
      ministers,
      ministersEnabled,
      officers,
      officersEnabled,
      extraHymns,
      extraHymnsEnabled,
      seniorPastor,
      seniorPastorEnabled,
      sharingQuestions,
      sharingEnabled,
      churchAddress,
      churchAddressDetail,
      addressEnabled,
      locationImage,
      locationImageRatio,
      snsEnabled,
      snsNaverBlog,
      snsInstagram,
      snsThreads,
      youtubeChannelUrl,
      youtubeChannelName,
      youtubeChannelThumbnail,
      mottoEnabled,
      mottoLabelType,
      mottoCustomLabel,
      mottoText,
      mottoReference,
      churchVisionEnabled,
      churchVision,
      churchMissionEnabled,
      churchMission,
      churchIntroLabelEnabled,
      churchIntroLabel,
      churchVisionLabelEnabled,
      churchVisionLabel,
      churchMissionLabelEnabled,
      churchMissionLabel,
      pastorGreetingEnabled,
      pastorGreeting,
      pastoralColumnsEnabled,
      bulletinTemplate: isTemplateUnlocked(bulletinTemplate) ? bulletinTemplate : DEFAULT_BULLETIN_TEMPLATE_ID,
      churchLogo,
      churchLogoEnabled,
      churchLogoSize,
      churchIntro,
      churchIntroEnabled,
      churchImage,
      isPreview: true // 미리보기 모드임을 알림
    };
    localStorage.setItem("temp_bulletin", JSON.stringify(tempData));
  }, [bulletinData, titleFontSizeEnabled, sections, announcements, midweekServices, sundayServices, ministers, ministersEnabled, officers, officersEnabled, extraHymns, extraHymnsEnabled, seniorPastor, seniorPastorEnabled, sharingQuestions, sharingEnabled, churchAddress, churchAddressDetail, addressEnabled, locationImage, locationImageRatio, snsEnabled, snsNaverBlog, snsInstagram, snsThreads, youtubeChannelUrl, youtubeChannelName, youtubeChannelThumbnail, mottoEnabled, mottoLabelType, mottoCustomLabel, mottoText, mottoReference, churchVisionEnabled, churchVision, churchMissionEnabled, churchMission, churchIntroLabelEnabled, churchIntroLabel, churchVisionLabelEnabled, churchVisionLabel, churchMissionLabelEnabled, churchMissionLabel, pastorGreetingEnabled, pastorGreeting, pastoralColumnsEnabled, bulletinTemplate, accountData, customDesignConfig, churchLogo, churchLogoEnabled, churchLogoSize, churchIntro, churchIntroEnabled, churchImage]);

  useEffect(() => {
    if (isEditing && id) {
      const loadData = async () => {
        try {
          const docRef = doc(db, "bulletins", id);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            const loadedBank = data.bankName || "";
            if (loadedBank && !BANK_LIST.includes(loadedBank)) {
              setIsCustomBank(true);
            }

            setBulletinData({
              date: data.date || "",
              specialSunday: data.specialSunday || "",
              title: data.title || "",
              subtitle: data.subtitle || "",
              scripture: data.scripture || "",
              preacher: data.preacher || "",
              prayer: data.prayer || "",
              nextPrayer: data.nextPrayer || "",
              offeringAccount: data.offeringAccount || "",
              bankName: data.bankName || "",
              accountNumber: data.accountNumber || "",
              accountHolder: data.accountHolder || "",
              youtubeId: data.youtubeId || "",
              backgroundImage: data.backgroundImage || "/stayon_image.png",
              pageBgTheme: data.pageBgTheme || DEFAULT_PAGE_BG_THEME_ID,
              titleFontSize: Number(data.titleFontSize) || 24,
            });
            setTitleFontSizeEnabled(!!data.titleFontSize);
            setSections(data.sections || []);
            setAnnouncements(data.announcements || []);

            if (data.sharingQuestions && Array.isArray(data.sharingQuestions)) {
              setSharingQuestions(data.sharingQuestions);
            }
            setSharingEnabled(data.sharingEnabled !== false);

            if (data.ministers && Array.isArray(data.ministers)) {
              setMinisters(data.ministers);
            }
            setMinistersEnabled(data.ministersEnabled !== false);
            if (data.officers && Array.isArray(data.officers)) {
              setOfficers(data.officers);
            }
            setOfficersEnabled(data.officersEnabled !== false);
            if (data.extraHymns && Array.isArray(data.extraHymns)) {
              setExtraHymns(data.extraHymns);
            }
            setExtraHymnsEnabled(data.extraHymnsEnabled === true);
            if (data.seniorPastor && typeof data.seniorPastor === "object") {
              setSeniorPastor({
                role: data.seniorPastor.role || "담임 목사",
                name: data.seniorPastor.name || "",
                phone: data.seniorPastor.phone || "",
                photoUrl: data.seniorPastor.photoUrl || "",
                phoneFreeFormat: !!data.seniorPastor.phoneFreeFormat,
                description: data.seniorPastor.description || "",
              });
            }
            setSeniorPastorEnabled(data.seniorPastorEnabled !== false);
            if (data.pastorGreeting && typeof data.pastorGreeting === "object") {
              setPastorGreeting({
                greetingText: data.pastorGreeting.greetingText || "",
                content: data.pastorGreeting.content || "",
                churchPhone: data.pastorGreeting.churchPhone || "",
                personalPhone: data.pastorGreeting.personalPhone || "",
                personalPhoneHidden: !!data.pastorGreeting.personalPhoneHidden,
                phoneSectionEnabled: data.pastorGreeting.phoneSectionEnabled !== false,
                email: data.pastorGreeting.email || "",
              });
            }
            setPastorGreetingEnabled(data.pastorGreetingEnabled !== false);

            setChurchAddress(data.churchAddress || "");
            setChurchAddressDetail(data.churchAddressDetail || "");
            setAddressEnabled(data.addressEnabled !== false);
            setLocationImage(data.locationImage || "");
            setLocationImageRatio(data.locationImageRatio === "1:1" ? "1:1" : "4:3");
            setSnsEnabled(data.snsEnabled !== false);
            setSnsNaverBlog(data.snsNaverBlog || "");
            setSnsInstagram(data.snsInstagram || "");
            setSnsThreads(data.snsThreads || "");
            setYoutubeChannelUrl(data.youtubeChannelUrl || "");
            setYoutubeChannelName(data.youtubeChannelName || "");
            setYoutubeChannelThumbnail(data.youtubeChannelThumbnail || "");
            setChurchLogo(data.churchLogo || "");
            setChurchLogoEnabled(data.churchLogoEnabled !== false);
            setChurchLogoSize(normalizeChurchLogoSize(data.churchLogoSize));
            setChurchIntro(data.churchIntro || "");
            setChurchIntroEnabled(data.churchIntroEnabled !== false);
            setChurchImage(data.churchImage || "");

            setMottoEnabled(data.mottoEnabled !== false);
            setMottoLabelType(data.mottoLabelType === "motto" || data.mottoLabelType === "custom" ? data.mottoLabelType : "verse");
            setMottoCustomLabel(data.mottoCustomLabel || "");
            setMottoText(data.mottoText || "");
            setMottoReference(data.mottoReference || "");
            setChurchVisionEnabled(data.churchVisionEnabled !== false);
            setChurchVision(data.churchVision || "");
            setChurchMissionEnabled(data.churchMissionEnabled !== false);
            setChurchMission(data.churchMission || "");
            setChurchIntroLabelEnabled(data.churchIntroLabelEnabled === true);
            setChurchIntroLabel(data.churchIntroLabel || "");
            setChurchVisionLabelEnabled(data.churchVisionLabelEnabled === true);
            setChurchVisionLabel(data.churchVisionLabel || "");
            setChurchMissionLabelEnabled(data.churchMissionLabelEnabled === true);
            setChurchMissionLabel(data.churchMissionLabel || "");
            setPastoralColumnsEnabled(data.pastoralColumnsEnabled === true);
            setBulletinTemplate(data.bulletinTemplate || DEFAULT_BULLETIN_TEMPLATE_ID);

            if (data.sundayServices && Array.isArray(data.sundayServices)) {
              const parsedServices = data.sundayServices.map((service: any) => {
                // 만약 DB에 저장된 데이터가 문자열 형태("1부 예배, 오전 09:00, 대예배실")라면 객체로 파싱
                if (typeof service === "string") {
                  const parts = service.split(",").map((s) => s.trim());
                  return {
                    name: parts[0] || "",
                    time: parts[1] || "",
                    location: parts[2] || "",
                  };
                }
                // 이미 객체 형태라면 그대로 반환
                return service;
              });
              setSundayServices(parsedServices);
            }

            if (data.midweekServices) {
              setMidweekServices({
                enabled: data.midweekServices.enabled ?? true,
                wednesday: data.midweekServices.wednesday || midweekServices.wednesday,
                friday: data.midweekServices.friday || midweekServices.friday,
                dawn: data.midweekServices.dawn || midweekServices.dawn,
              });
            }

            // 주일 오후/저녁 예배 데이터 로드
            if (data.sundayEveningService) {
              setSundayEveningService({
                enabled: data.sundayEveningService.enabled ?? true,
                isCanceled: data.sundayEveningService.isCanceled ?? false,
                name: data.sundayEveningService.name || "주일 오후 예배",
                time: data.sundayEveningService.time || "오후 02:00",
                location: data.sundayEveningService.location || "본당",
                title: data.sundayEveningService.title || "",
                scripture: data.sundayEveningService.scripture || "",
                preacher: data.sundayEveningService.preacher || "",
                // 저장되어 있던 sections 배열을 불러오고, 없으면 기본 배열 유지
                sections: data.sundayEveningService.sections || [
                  { id: "e1", label: "찬양", value: "다같이" },
                  { id: "e2", label: "기도", value: "" },
                  { id: "e3", label: "말씀 선포", value: "" },
                  { id: "e4", label: "축도/주기도문", value: "" }
                ],
              });
            }
            // 데이터로드 시 주중 예배 복원. dawn(새벽기도)은 이 기능 추가 이전에 저장된
            // 기존 주보엔 없을 수 있으므로, 없으면 기본값으로 채워 넣어 화면이 깨지지 않게 한다.
            if (data.midweekServices) {
              setMidweekServices({
                enabled: data.midweekServices.enabled ?? true,
                wednesday: data.midweekServices.wednesday || midweekServices.wednesday,
                friday: data.midweekServices.friday || midweekServices.friday,
                dawn: data.midweekServices.dawn || midweekServices.dawn,
              });
            }
          }
        } catch (error) {
          console.error("로드 에러:", error);
          toast.error("데이터를 불러오는데 실패했습니다.");
        }
      };
      loadData();
    }
  }, [id, isEditing]);

  const moveSection = (index: number, direction: 'up' | 'down') => {
    const newSections = [...sections];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newSections.length) return;
    [newSections[index], newSections[targetIndex]] = [newSections[targetIndex], newSections[index]];
    setSections(newSections);
  };

  const moveAnnouncement = (index: number, direction: 'up' | 'down') => {
    const newAnnouncements = [...announcements];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newAnnouncements.length) return;
    [newAnnouncements[index], newAnnouncements[targetIndex]] = [newAnnouncements[targetIndex], newAnnouncements[index]];
    setAnnouncements(newAnnouncements);
  };

  const addSection = () => setSections([...sections, { id: Date.now().toString(), label: "", value: "" }]);
  const removeSection = (sectionId: string) => setSections(sections.filter(s => s.id !== sectionId));
  // const updateSection = (sectionId: string, field: 'label' | 'value', val: string) => 
  //   setSections(sections.map(s => s.id === sectionId ? { ...s, [field]: val } : s));

  const updateSection = (sectionId: string, field: 'label' | 'value' | 'content' | 'preview', val: string) =>
    setSections(sections.map(s => s.id === sectionId ? { ...s, [field]: val } : s));

  // "순서 숨기기" - 내용은 그대로 두고 성도 화면 노출만 끈다. 특송처럼 매주 쓰지
  // 않는 순서를 지웠다 다시 쓸 때마다 내용을 재입력하지 않아도 되게 하기 위함.
  const toggleSectionHidden = (sectionId: string) =>
    setSections(sections.map(s => s.id === sectionId ? { ...s, hidden: !s.hidden } : s));

  const addAnnouncement = () => setAnnouncements([...announcements, { id: Date.now().toString(), title: "", content: "" }]);
  const removeAnnouncement = (annId: string) => setAnnouncements(announcements.filter(a => a.id !== annId));
  const updateAnnouncement = (annId: string, field: 'title' | 'content', val: string) =>
    setAnnouncements(announcements.map(a => a.id === annId ? { ...a, [field]: val } : a));

  const addSundayService = () => {
    setSundayServices([...sundayServices, { name: "주일예배", time: "오전 00:00", location: "본당" }]);
  };

  const removeSundayService = (index: number) => {
    setSundayServices(sundayServices.filter((_, i) => i !== index));
  };

  const updateSundayService = (index: number, field: 'name' | 'time' | 'location', val: string) => {
    const updated = [...sundayServices];
    updated[index][field] = val;
    setSundayServices(updated);
  };

  const handleCopyAccount = () => {
    const accountInfo = `${bulletinData.bankName} ${bulletinData.accountNumber} ${bulletinData.accountHolder}`.trim();
    if (!accountInfo) {
      toast.error("복사할 계좌 정보가 없습니다.");
      return;
    }
    navigator.clipboard.writeText(accountInfo);
    toast.success("계좌 정보가 클립보드에 복사되었습니다.");
  };

  const handleBankSelect = (value: string) => {
    if (value === "custom") {
      setIsCustomBank(true);
      setBulletinData({ ...bulletinData, bankName: "" });
    } else {
      setIsCustomBank(false);
      setBulletinData({ ...bulletinData, bankName: value });
    }
  };

  const saveToFirestore = async () => {
    if (!auth.currentUser) return toast.error("로그인이 필요합니다");
    if (!bulletinData.title || !bulletinData.date) return toast.error("날짜와 제목은 필수입니다");

    setLoading(true);
    try {
      const uid = auth.currentUser.uid;
      const batch = writeBatch(db);
      const bulletinsRef = collection(db, "bulletins");
      const q = query(bulletinsRef, where("authorId", "==", uid), where("status", "==", "published"));
      const querySnapshot = await getDocs(q);
      querySnapshot.forEach((document) => {
        batch.update(doc(db, "bulletins", document.id), { status: "archived" });
      });

      const bulletinId = id || doc(collection(db, "bulletins")).id;

      // 이 교회가 같은 날짜(date)로 이미 발행한 적이 있으면 "업데이트", 처음이면 "신규 발행".
      // (같은 주보를 수정해서 재발행하는 경우도 업데이트로 본다)
      let isPublishUpdate = false;
      try {
        const sameDateSnap = await getDocs(
          query(bulletinsRef, where("authorId", "==", uid), where("date", "==", String(bulletinData.date || "")))
        );
        isPublishUpdate = sameDateSnap.docs.some((d) => {
          const st = d.data().status;
          if (d.id === bulletinId) return isEditing && st !== "draft"; // 이 주보를 전에 이미 발행했었나
          return st === "published" || st === "archived"; // 같은 날짜로 다른 주보를 이미 발행했었나
        });
      } catch (e) {
        console.error("발행 이력 조회 실패:", e);
      }

      const formattedOfferingAccount = `${bulletinData.bankName} ${bulletinData.accountNumber} ${bulletinData.accountHolder}`.trim();

      const formattedSundayServices = sundayServices.map(
        (s) => `${s.name}, ${s.time}, ${s.location}`
      );

      // 이름을 안 채운 빈 행(기본으로 깔려 있는 입력용 빈 줄 포함)은 저장하지 않는다.
      // 안 그러면 "섬기시는분 안내 설정"을 아예 건드리지 않은 교회도 성도 화면에
      // "이름 없음 부목사" 같은 빈 항목이 그대로 발행/노출된다.
      const sanitizedMinisters = ministers
        .filter((m: any) => String(m.name || "").trim() !== "")
        .map((m: any) => ({
          id: String(m.id || Date.now()),
          role: String(m.role || ""),
          name: String(m.name || ""),
          phone: String(m.phone || ""),
          photoUrl: String(m.photoUrl || ""),
          phoneFreeFormat: Boolean(m.phoneFreeFormat),
          description: String(m.description || ""),
        }));

      // 중직자도 부교역자와 동일하게, 이름을 안 채운 빈 행은 저장하지 않는다.
      const sanitizedOfficers = officers
        .filter((o: any) => String(o.name || "").trim() !== "")
        .map((o: any) => ({
          id: String(o.id || Date.now()),
          position: String(o.position || ""),
          name: String(o.name || ""),
          photoUrl: String(o.photoUrl || ""),
          duty: String(o.duty || ""),
        }));

      // 찬양 더보기도 링크를 안 채운 빈 행은 저장하지 않고, 최대 8개까지만 저장한다.
      const sanitizedExtraHymns = extraHymns
        .filter((h: any) => String(h.youtubeId || "").trim() !== "")
        .slice(0, 8)
        .map((h: any) => ({
          id: String(h.id || Date.now()),
          youtubeId: String(h.youtubeId || ""),
          title: String(h.title || ""),
        }));

      const sanitizedSeniorPastor = {
        role: String(seniorPastor.role || "담임 목사"),
        name: String(seniorPastor.name || ""),
        phone: String(seniorPastor.phone || ""),
        photoUrl: String(seniorPastor.photoUrl || ""),
        phoneFreeFormat: Boolean(seniorPastor.phoneFreeFormat),
        description: String(seniorPastor.description || ""),
      };

      const sanitizedSharingQuestions = sharingQuestions.map((q) => ({
        id: String(q.id || Date.now()),
        title: String(q.title || ""),
        quote: String(q.quote || ""),
        content: String(q.content || ""),
      }));

      const sanitizedSections = sections.map((s) => ({
        id: String(s.id || Date.now()),
        label: String(s.label || ""),
        value: String(s.value || ""),
        content: String(s.content || ""),
        preview: String(s.preview || ""),
        hidden: Boolean(s.hidden),
      }));

      const sanitizedAnnouncements = announcements.map((a) => ({
        id: String(a.id || Date.now()),
        title: String(a.title || ""),
        content: String(a.content || ""),
      }));

      const sanitizedEveningSections = (sundayEveningService.sections || []).map((es) => ({
        id: String(es.id || Date.now()),
        label: String(es.label || ""),
        value: String(es.value || ""),
      }));

      const sanitizedEveningService = {
        enabled: Boolean(sundayEveningService.enabled),
        isCanceled: Boolean(sundayEveningService.isCanceled),
        name: String(sundayEveningService.name || ""),
        time: String(sundayEveningService.time || ""),
        location: String(sundayEveningService.location || ""),
        title: String(sundayEveningService.title || ""),
        scripture: String(sundayEveningService.scripture || ""),
        preacher: String(sundayEveningService.preacher || ""),
        sections: sanitizedEveningSections,
      };

      const sanitizedMidweekServices = {
        enabled: Boolean(midweekServices.enabled),
        wednesday: {
          name: String(midweekServices.wednesday?.name || ""),
          title: String(midweekServices.wednesday?.title || ""),
          scripture: String(midweekServices.wednesday?.scripture || ""),
          preacher: String(midweekServices.wednesday?.preacher || ""),
          dateTime: String(midweekServices.wednesday?.dateTime || ""),
        },
        friday: {
          name: String(midweekServices.friday?.name || ""),
          title: String(midweekServices.friday?.title || ""),
          scripture: String(midweekServices.friday?.scripture || ""),
          preacher: String(midweekServices.friday?.preacher || ""),
          dateTime: String(midweekServices.friday?.dateTime || ""),
        },
        dawn: {
          name: String(midweekServices.dawn?.name || ""),
          title: String(midweekServices.dawn?.title || ""),
          scripture: String(midweekServices.dawn?.scripture || ""),
          preacher: String(midweekServices.dawn?.preacher || ""),
          dateTime: String(midweekServices.dawn?.dateTime || ""),
        },
      };

      const payload: any = {
        date: String(bulletinData.date || ""),
        specialSunday: String(bulletinData.specialSunday || ""),
        title: String(bulletinData.title || ""),
        subtitle: String(bulletinData.subtitle || ""),
        scripture: String(bulletinData.scripture || ""),
        preacher: String(bulletinData.preacher || ""),
        prayer: String(bulletinData.prayer || ""),
        nextPrayer: String(bulletinData.nextPrayer || ""),
        offeringAccount: formattedOfferingAccount,
        bankName: String(bulletinData.bankName || ""),
        accountNumber: String(bulletinData.accountNumber || ""),
        accountHolder: String(bulletinData.accountHolder || ""),
        youtubeId: String(bulletinData.youtubeId || ""),
        extraHymns: sanitizedExtraHymns,
        extraHymnsEnabled,
        backgroundImage: String(bulletinData.backgroundImage || "/stayon_image.png"),
        pageBgTheme: String(bulletinData.pageBgTheme || DEFAULT_PAGE_BG_THEME_ID),
        titleFontSize: titleFontSizeEnabled ? Math.min(32, Math.max(18, Number(bulletinData.titleFontSize) || 24)) : null,
        sections: sanitizedSections,
        announcements: sanitizedAnnouncements,
        midweekServices: sanitizedMidweekServices,
        sundayEveningService: sanitizedEveningService,
        sundayServices: formattedSundayServices,
        ministers: sanitizedMinisters,
        ministersEnabled,
        officers: sanitizedOfficers,
        officersEnabled,
        seniorPastor: sanitizedSeniorPastor,
        seniorPastorEnabled,
        sharingQuestions: sanitizedSharingQuestions,
        sharingEnabled,
        churchAddress: String(churchAddress || ""),
        churchAddressDetail: String(churchAddressDetail || ""),
        addressEnabled,
        locationImage: String(locationImage || ""),
        locationImageRatio,
        snsEnabled,
        snsNaverBlog: String(snsNaverBlog || ""),
        snsInstagram: String(snsInstagram || ""),
        snsThreads: String(snsThreads || ""),
        youtubeChannelUrl: String(youtubeChannelUrl || ""),
        youtubeChannelName: String(youtubeChannelName || ""),
        youtubeChannelThumbnail: String(youtubeChannelThumbnail || ""),
        churchLogo: String(churchLogo || ""),
        churchLogoEnabled,
        churchLogoSize: normalizeChurchLogoSize(churchLogoSize),
        churchIntro: String(churchIntro || ""),
        churchIntroEnabled,
        churchImage: String(churchImage || ""),
        mottoEnabled,
        mottoLabelType,
        mottoCustomLabel: String(mottoCustomLabel || ""),
        mottoText: String(mottoText || ""),
        mottoReference: String(mottoReference || ""),
        churchVisionEnabled,
        churchVision: String(churchVision || ""),
        churchMissionEnabled,
        churchMission: String(churchMission || ""),
        churchIntroLabelEnabled,
        churchIntroLabel: String(churchIntroLabel || ""),
        churchVisionLabelEnabled,
        churchVisionLabel: String(churchVisionLabel || ""),
        churchMissionLabelEnabled,
        churchMissionLabel: String(churchMissionLabel || ""),
        pastorGreetingEnabled,
        pastorGreeting: {
          greetingText: String(pastorGreeting.greetingText || ""),
          content: String(pastorGreeting.content || ""),
          churchPhone: String(pastorGreeting.churchPhone || ""),
          personalPhone: String(pastorGreeting.personalPhone || ""),
          personalPhoneHidden: Boolean(pastorGreeting.personalPhoneHidden),
          phoneSectionEnabled: Boolean(pastorGreeting.phoneSectionEnabled),
          email: String(pastorGreeting.email || ""),
        },
        pastoralColumnsEnabled,
        // 권한이 없는 템플릿이 선택된 채로 발행되면 성도 화면이 깨질 수 있어, 저장 시점에
        // 사용 가능한 값으로 정규화한다(권한 없으면 기본). BulletinView는 저장된 값을 그대로 신뢰.
        bulletinTemplate: isTemplateUnlocked(bulletinTemplate) ? String(bulletinTemplate) : DEFAULT_BULLETIN_TEMPLATE_ID,
        status: "published",
        authorId: uid,
        updatedAt: serverTimestamp(),
        publishedAt: serverTimestamp(),
      };
      if (!isEditing) payload.createdAt = serverTimestamp();

      batch.set(doc(db, "bulletins", bulletinId), payload, { merge: true });
      await batch.commit();

      // 운영자 이메일 알림 트리거 (발행/업데이트). 실패해도 발행 자체엔 영향 없음.
      addDoc(collection(db, "bulletin_mail_triggers"), {
        authorId: uid,
        bulletinId,
        date: String(bulletinData.date || ""),
        isUpdate: isPublishUpdate,
        createdAt: serverTimestamp(),
      }).catch((err: unknown) => console.error("주보 알림 트리거 생성 실패:", err));

      localStorage.removeItem("temp_bulletin");

      toast.success("주보가 성공적으로 발행되었습니다!");
      setTimeout(() => navigate("/admin"), 1500);
    } catch (error) {
      console.error("발행 에러:", error);
      toast.error("처리 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = () => {
    // 미리보기 페이지로 이동 (ID가 없으면 'preview'라는 키워드 전달)
    const previewUrl = isEditing ? `/view/${id}?mode=preview` : `/view/new?mode=preview`;
    window.open(previewUrl, "_blank");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 font-sans pb-20">
      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
      <div className="bg-white/80 backdrop-blur-md border-b sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-3 sm:px-4 py-3 grid grid-cols-[auto_1fr_auto] items-center gap-2">
          <div className="justify-self-start">
            <Button variant="ghost" size="icon" onClick={() => navigate("/admin")} className="rounded-full shrink-0" title="대시보드로">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </div>

          <h1 className="min-w-0 text-base sm:text-xl font-bold tracking-tight truncate text-center">{isEditing ? "주보 수정" : "새 주보 만들기"}</h1>

          <div className="justify-self-end flex items-center gap-1.5 sm:gap-2">
            <Button variant="outline" onClick={handlePreview} className="rounded-full border-blue-200 text-blue-700 shrink-0 h-9 w-9 sm:w-auto px-0 sm:px-4" title="미리보기">
              <Eye className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">미리보기</span>
            </Button>
            <Button disabled={loading} onClick={() => setShowPublishDialog(true)} className="rounded-full bg-gradient-to-r from-blue-600 to-indigo-700 text-white font-bold text-sm transition-all active:scale-95 shadow-md px-4 shrink-0">
              <Send className="w-4 h-4 mr-1.5 sm:mr-2" /> 발행하기
            </Button>
          </div>
        </div>

        {/* 상단 탭: 이 주보 자체의 내용 vs 계정(교회) 전체에 적용되는 공유 이미지 설정/교회 소개 정보 */}
        <div className="container mx-auto px-4 max-w-4xl flex gap-1 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab("content")}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-bold border-b-2 transition-colors shrink-0 whitespace-nowrap ${activeTab === "content" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400 hover:text-slate-600"}`}
          >
            <FileText className="w-4 h-4" /> 주보 내용
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("cover")}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-bold border-b-2 transition-colors shrink-0 whitespace-nowrap ${activeTab === "cover" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400 hover:text-slate-600"}`}
          >
            <Share2 className="w-4 h-4" /> 공유 이미지 설정
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("church")}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-bold border-b-2 transition-colors shrink-0 whitespace-nowrap ${activeTab === "church" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400 hover:text-slate-600"}`}
          >
            <Users className="w-4 h-4" /> 교회 소개
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("sharing")}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-bold border-b-2 transition-colors shrink-0 whitespace-nowrap ${activeTab === "sharing" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400 hover:text-slate-600"}`}
          >
            <MessagesSquare className="w-4 h-4" /> 나눔 설정
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("design")}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-bold border-b-2 transition-colors shrink-0 whitespace-nowrap ${activeTab === "design" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400 hover:text-slate-600"}`}
          >
            <Palette className="w-4 h-4" /> 커스텀 디자인
          </button>
          <button
            type="button"
            disabled
            title="준비 중인 기능이에요"
            className="flex items-center gap-1.5 px-4 py-3 text-sm font-bold border-b-2 border-transparent text-slate-300 shrink-0 whitespace-nowrap cursor-not-allowed"
          >
            <Tent className="w-4 h-4" /> 수련회 설정
            <span className="flex items-center gap-0.5 text-[9px] font-black tracking-wider text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">
              <Lock className="w-2.5 h-2.5" /> COMING SOON
            </span>
          </button>
        </div>
      </div>

      {activeTab === "content" && (
      <div className="container mx-auto px-4 py-6 max-w-4xl space-y-5">
        {/* /super > 기능 업데이트 알림. 운영자가 새 기능 소식을 등록하면 여기에 표시된다. */}
        {showFeatureUpdate && (
          <div className="p-4 rounded-[1.75rem] bg-gradient-to-r from-blue-600 to-indigo-700 text-white shadow-lg flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <Megaphone className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black tracking-widest uppercase text-blue-100 mb-1">새 기능이 생겼어요!</p>
              <p className="text-sm font-bold leading-relaxed whitespace-pre-line break-words">{featureUpdateMessage}</p>
            </div>
          </div>
        )}

        {/* 기존 카드 디자인 코드 동일... (생략하지 않고 유지) */}
        <Card className="p-5 rounded-[1.75rem] border-0 bg-white shadow-xl shadow-blue-500/5">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-3 text-gray-800">
            <div className="w-2.5 h-8 bg-indigo-500 rounded-full"></div> 주보 배경 선택
          </h2>
          <div className="flex gap-4 overflow-x-auto pb-6 pt-4 scrollbar-hide px-4">
            {/* 직접 업로드 - 미리 만들어둔 템플릿 외에 원하는 사진을 배경으로 쓸 수 있게 한다.
                맨 앞에 둬서 관리자가 놓치지 않게 한다. 한 번 올린 사진(customBgUrl)은 프리셋으로
                바꿔도 계속 기억해뒀다가, 다시 누르면 재업로드 없이 바로 그 사진으로 돌아간다 -
                변경(재업로드)은 우측 하단 연필 아이콘으로만 따로 트리거한다. */}
            {(() => {
              const isSelected = !!customBgUrl && bulletinData.backgroundImage === customBgUrl;
              return (
                <>
                  <input
                    type="file"
                    accept="image/png, image/jpeg, image/jpg, image/webp"
                    ref={customBgInputRef}
                    onChange={handleCustomBgUpload}
                    className="hidden"
                  />
                  <button
                    disabled={uploadingCustomBg}
                    onClick={() => {
                      if (uploadingCustomBg) return;
                      if (customBgUrl) {
                        setBulletinData({ ...bulletinData, backgroundImage: customBgUrl });
                      } else {
                        customBgInputRef.current?.click();
                      }
                    }}
                    className={`relative group shrink-0 transition-all p-1.5 ${isSelected
                      ? 'ring-4 ring-blue-500 scale-105 shadow-lg z-10'
                      : 'hover:scale-105'
                      } rounded-[1.8rem] bg-slate-50 w-32 h-48 overflow-visible ${uploadingCustomBg ? 'cursor-wait' : ''}`}
                  >
                    <div className="w-full h-full rounded-[1.4rem] overflow-hidden relative bg-white border-2 border-dashed border-indigo-200">
                      {customBgUrl ? (
                        <>
                          <img src={customBgUrl} alt="직접 업로드" className="w-full h-full object-cover object-top" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent flex items-end justify-center p-3">
                            <span className="text-white text-[10px] font-bold">직접 업로드</span>
                          </div>
                        </>
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 text-indigo-400">
                          <ImageIcon className="w-7 h-7" />
                          <span className="text-[10px] font-bold">직접 업로드</span>
                        </div>
                      )}
                      {uploadingCustomBg && (
                        <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2">
                          <Loader2 className="w-6 h-6 text-white animate-spin" />
                          <span className="text-white text-[10px] font-bold">업로드 중...</span>
                        </div>
                      )}
                    </div>
                    {isSelected && !uploadingCustomBg && (
                      <div className="absolute top-3 right-3 bg-blue-500 rounded-full p-1 shadow-md z-10">
                        <Check className="w-3.5 h-3.5 text-white stroke-[3px]" />
                      </div>
                    )}
                    {customBgUrl && !uploadingCustomBg && (
                      <div
                        role="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          customBgInputRef.current?.click();
                        }}
                        title="다른 사진으로 교체"
                        className="absolute bottom-3 right-3 w-7 h-7 rounded-full bg-white shadow-md border border-slate-200 flex items-center justify-center text-slate-500 hover:text-blue-600 hover:border-blue-300"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </div>
                    )}
                  </button>
                </>
              );
            })()}

            {BACKGROUND_TEMPLATES.map((tmpl) => (
              <button
                key={tmpl.id}
                onClick={() => setBulletinData({ ...bulletinData, backgroundImage: tmpl.url })}
                className={`relative group shrink-0 transition-all p-1.5 ${bulletinData.backgroundImage === tmpl.url
                  ? 'ring-4 ring-blue-500 scale-105 shadow-lg z-10'
                  : 'hover:scale-105 grayscale-[40%] hover:grayscale-0'
                  } rounded-[1.8rem] bg-slate-50 w-32 h-48 overflow-visible`}
              >
                <div className="w-full h-full rounded-[1.4rem] overflow-hidden relative bg-white">
                  <img src={tmpl.url} alt={tmpl.label} className="w-full h-full object-cover object-top" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent flex items-end justify-center p-3">
                    <span className="text-white text-[10px] font-bold">{tmpl.label}</span>
                  </div>
                </div>
                {bulletinData.backgroundImage === tmpl.url && (
                  <div className="absolute top-3 right-3 bg-blue-500 rounded-full p-1 shadow-md z-10">
                    <Check className="w-3.5 h-3.5 text-white stroke-[3px]" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </Card>

        <Card className="p-5 rounded-[1.75rem] border-0 bg-white shadow-xl shadow-blue-500/5">
          <h2 className="text-xl font-bold mb-1.5 flex items-center gap-3 text-gray-800">
            <div className="w-2.5 h-8 bg-indigo-500 rounded-full"></div> 주보 화면 배경색
          </h2>
          <p className="text-xs text-slate-400 mb-4 font-medium leading-relaxed">
            "섬기는 사람들", "오시는 길" 등 흰 카드 바깥쪽 배경 색이에요. 밝은 색을 고르면 그 바깥 글씨 색이 자동으로 어둡게 바뀌어서 대비는 항상 유지돼요.
          </p>
          {isCustomBulletinTemplate(bulletinTemplate) && (
            <p className="text-[11px] text-purple-600 bg-purple-50 border border-purple-100 rounded-xl px-3 py-2 mb-4 font-bold leading-relaxed flex items-start gap-1.5">
              <Palette className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              커스텀 디자인 템플릿을 사용 중이라 배경색은 템플릿 고유 색상으로 표시돼요. 배경색을 직접 고르려면 "커스텀 디자인" 탭에서 "기본"을 선택하세요.
            </p>
          )}
          <div className={`flex flex-wrap gap-3 ${isCustomBulletinTemplate(bulletinTemplate) ? "opacity-40 pointer-events-none" : ""}`}>
            {PAGE_BG_THEMES.map((theme) => {
              const isSelected = (bulletinData.pageBgTheme || DEFAULT_PAGE_BG_THEME_ID) === theme.id;
              return (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => setBulletinData({ ...bulletinData, pageBgTheme: theme.id })}
                  className={`flex flex-col items-center gap-1.5 shrink-0 transition-all ${isSelected ? 'scale-105' : 'opacity-70 hover:opacity-100'}`}
                >
                  <div
                    className={`w-12 h-12 rounded-2xl border-2 flex items-center justify-center transition-all ${isSelected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-slate-200'}`}
                    style={{ backgroundColor: theme.swatch }}
                  >
                    {isSelected && <Check className={`w-4 h-4 stroke-[3px] ${theme.isLight ? 'text-slate-700' : 'text-white'}`} />}
                  </div>
                  <span className={`text-[11px] font-bold ${isSelected ? 'text-blue-600' : 'text-slate-400'}`}>{theme.label}</span>
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="p-5 rounded-[1.75rem] border-0 bg-white shadow-xl shadow-blue-500/5">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-3 text-gray-800">
            <div className="w-2.5 h-8 bg-blue-500 rounded-full"></div> 예배 및 봉사 정보
          </h2>
          {/* 2x2: (예배 날짜 | 본문 말씀) / (설교 제목 | 설교자) */}
          <div className="grid md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <Label className="font-semibold">예배 날짜</Label>
              <span className="text-[11px] font-medium text-gray-400 block">예배 날짜를 선택해주세요</span>
              <DatePickerField value={bulletinData.date} onChange={(date) => setBulletinData({ ...bulletinData, date })} />
            </div>
            <div className="space-y-2">
              <Label className="font-semibold">본문 말씀</Label>
              <span className="text-[11px] font-medium text-gray-400 block">본문 말씀을 입력해주세요</span>
              {/* 2줄짜리 입력창. 엔터로 줄바꿈을 넣으면 성도 화면에도 그 줄바꿈이 그대로 반영된다
                  (표시하는 쪽에 whitespace-pre-line 처리해둠). */}
              <Textarea
                placeholder="예: 마태복음 5:13-16 (엔터로 줄바꿈 가능)"
                value={bulletinData.scripture}
                onChange={(e) => setBulletinData({ ...bulletinData, scripture: e.target.value })}
                rows={2}
                className="rounded-2xl border-gray-200 bg-white text-sm resize-none"
              />
            </div>
            <div className="space-y-2">
              <Label className="font-semibold">설교 제목</Label>
              <span className="text-[11px] font-medium text-gray-400 block">설교 제목을 입력해주세요</span>
              {/* 2줄짜리 입력창. 엔터로 줄바꿈을 넣으면 성도 화면에도 그 줄바꿈이 그대로 반영된다
                  (히어로 제목 쪽에 whitespace-pre-line 처리해둠). */}
              <Textarea
                placeholder="제목을 입력하세요 (엔터로 줄바꿈 가능)"
                value={bulletinData.title}
                onChange={(e) => setBulletinData({ ...bulletinData, title: e.target.value })}
                rows={2}
                className="rounded-2xl border-gray-200 bg-white text-sm resize-none"
              />
              {/* 설교 제목(히어로) 글자 크기. 체크 안 하면 기존처럼 코드가 정한 기본 크기(모바일 26px 등)
                  그대로 나가고, 체크해야만 슬라이더(18~32px)가 활성화돼서 직접 조절할 수 있다. */}
              <div className="flex items-center justify-between gap-2 pt-1">
                <label htmlFor="title-fontsize-toggle" className="flex items-center gap-2 cursor-pointer select-none">
                  <Checkbox
                    id="title-fontsize-toggle"
                    checked={titleFontSizeEnabled}
                    onCheckedChange={(v) => setTitleFontSizeEnabled(!!v)}
                  />
                  <span className="text-[11px] font-bold text-gray-500">설교 제목 글자 크기를 직접 조절하고 싶어요</span>
                </label>
                <button
                  type="button"
                  disabled={!titleFontSizeEnabled}
                  onClick={() => setBulletinData({ ...bulletinData, titleFontSize: 24 })}
                  className="shrink-0 text-[11px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed rounded-full px-3 py-1 transition-colors"
                >
                  기본값 복원
                </button>
              </div>
              <div className={`transition-opacity ${titleFontSizeEnabled ? "" : "opacity-40"}`}>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-gray-400">설교 제목 글자 크기 <span className="text-gray-300 font-medium">(권장 24px)</span></span>
                  <span className="text-[11px] font-bold text-blue-600">{bulletinData.titleFontSize}px</span>
                </div>
                <input
                  type="range"
                  min={18}
                  max={32}
                  step={1}
                  value={bulletinData.titleFontSize}
                  disabled={!titleFontSizeEnabled}
                  onChange={(e) => setBulletinData({ ...bulletinData, titleFontSize: Number(e.target.value) })}
                  className="w-full accent-blue-600 cursor-pointer disabled:cursor-not-allowed"
                />
                <div className="flex items-center justify-between text-[10px] text-gray-300 font-medium">
                  <span>18px</span>
                  <span>권장 24px</span>
                  <span>32px</span>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="font-semibold">설교자</Label>
              <span className="text-[11px] font-medium text-gray-400 block">설교자를 적어주세요</span>
              <Input placeholder="예: 홍길동 목사" value={bulletinData.subtitle} onChange={(e) => setBulletinData({ ...bulletinData, subtitle: e.target.value })} className="rounded-2xl h-12 border-gray-200 bg-white text-sm" />
            </div>
          </div>
          <div className="mt-5 pt-5 border-t border-gray-100 grid md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <Label className="font-semibold flex items-center gap-2"><UserCheck className="w-4 h-4 text-blue-500" /> 금주 기도자</Label>
              <span className="text-[11px] font-medium text-gray-400">비워두면 주보에 표시되지 않습니다</span>
              <Input placeholder="예: 김철수 장로" value={bulletinData.prayer} onChange={(e) => setBulletinData({ ...bulletinData, prayer: e.target.value })} className="rounded-2xl h-12 border-gray-200 bg-white text-sm" />
            </div>
            <div className="space-y-2">
              <Label className="font-semibold flex items-center gap-2">다음 주 기도자</Label>
              <span className="text-[11px] font-medium text-gray-400">비워두면 주보에 표시되지 않습니다</span>
              <Input placeholder="예: 이영희 권사" value={bulletinData.nextPrayer} onChange={(e) => setBulletinData({ ...bulletinData, nextPrayer: e.target.value })} className="rounded-2xl h-12 border-gray-200 bg-white text-sm" />
            </div>
          </div>
        </Card>

        <Card className="p-5 rounded-[1.75rem] border-0 bg-white shadow-xl shadow-blue-500/5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="min-w-0">
              <h2 className="text-xl font-bold flex items-center gap-3 text-gray-800">
                <div className="w-2.5 h-8 bg-blue-500 rounded-full shrink-0"></div> 주일 예배 시간 안내 설정
              </h2>
              <p className="text-xs text-gray-500 mt-1.5 pl-0 sm:pl-5 font-medium leading-relaxed">성도들이 첫 화면에서 볼 수 있는 주일 예배 시간과 장소를 직접 입력하세요.</p>
            </div>
            <Button onClick={addSundayService} variant="outline" className="rounded-full border-dashed border-2 px-6 border-blue-200 text-blue-600 hover:bg-blue-50 shrink-0 self-start sm:self-auto">
              <Plus className="w-4 h-4 mr-2" /> 예배 시간 추가
            </Button>
          </div>

          <div className="space-y-3">
            {sundayServices.map((service, index) => (
              <div key={index} className="p-4 bg-gray-50/80 rounded-[1.5rem] border border-gray-100 group hover:bg-white hover:shadow-md transition-all">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
                      <Clock className="w-4 h-4 text-blue-600" />
                    </div>
                    <span className="font-extrabold text-gray-700 text-xs">예배 #{index + 1}</span>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeSundayService(index)} className="text-gray-300 hover:text-red-500 rounded-full h-8 w-8 shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                  <Input
                    value={service.name}
                    onChange={(e) => updateSundayService(index, 'name', e.target.value)}
                    className="rounded-xl h-11 border-gray-200 bg-white text-sm font-bold"
                    placeholder="예배명 (예: 1부 예배)"
                  />
                  <Input
                    value={service.time}
                    onChange={(e) => updateSundayService(index, 'time', e.target.value)}
                    className="rounded-xl h-11 border-gray-200 bg-white text-sm font-bold text-blue-600"
                    placeholder="시간 (예: 오전 09:00)"
                  />
                  <Input
                    value={service.location}
                    onChange={(e) => updateSundayService(index, 'location', e.target.value)}
                    className="rounded-xl h-11 border-gray-200 bg-white text-sm text-gray-500"
                    placeholder="장소 (예: 본당)"
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* 🟢 [수정 후 코드] 주일 오후 / 저녁 예배 설정 카드 */}
        <Card className="p-5 rounded-[1.75rem] border-0 bg-white shadow-xl shadow-indigo-500/5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
            <div className="min-w-0">
              <h2 className="text-xl font-bold flex items-center gap-3 text-gray-900 tracking-tight">
                <div className="w-2.5 h-8 bg-indigo-600 rounded-full shrink-0"></div> 주일 오후 / 저녁 예배 설정
              </h2>
              <p className="text-xs text-gray-500 mt-1.5 pl-0 sm:pl-5 font-medium leading-relaxed">
                주일 오후/저녁 예배 정보 및 순서를 오전 예배와 동일하게 설정합니다.
              </p>
            </div>

            <label
              htmlFor="sunday-evening-toggle"
              className={`flex items-center gap-3 py-2 px-4 rounded-full transition-all duration-300 cursor-pointer select-none shrink-0 self-start ${sundayEveningService.enabled
                ? "bg-indigo-50/80 shadow-sm border border-indigo-100"
                : "bg-gray-100/70 border border-transparent"
                }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full transition-colors shrink-0 ${sundayEveningService.enabled ? "bg-indigo-600 animate-pulse" : "bg-gray-400"
                    }`}
                />
                <span
                  className={`text-xs font-bold transition-colors whitespace-nowrap ${sundayEveningService.enabled ? "text-indigo-700" : "text-gray-500"
                    }`}
                >
                  {sundayEveningService.enabled ? "사용 중" : "비활성화"}
                </span>
              </div>

              <Switch
                id="sunday-evening-toggle"
                checked={sundayEveningService.enabled}
                onCheckedChange={(checked) => setSundayEveningService({ ...sundayEveningService, enabled: checked })}
                className="data-[state=checked]:bg-indigo-600 data-[state=unchecked]:bg-gray-300 transition-colors duration-200"
              />
            </label>
          </div>

          {sundayEveningService.enabled && (
            <div className="space-y-6 animate-in fade-in duration-300">
              {/* 이번 주 예배 휴무 체크 */}
              <div
                onClick={() => setSundayEveningService({ ...sundayEveningService, isCanceled: !sundayEveningService.isCanceled })}
                className={`p-4 rounded-2xl cursor-pointer border transition-all flex items-center justify-between ${sundayEveningService.isCanceled
                  ? "bg-amber-50/80 border-amber-200 text-amber-900 shadow-sm"
                  : "bg-slate-50/60 border-slate-100 text-slate-600 hover:bg-slate-100/70"
                  }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all ${sundayEveningService.isCanceled ? "bg-amber-500 border-amber-500 text-white" : "border-slate-300 bg-white"
                      }`}
                  >
                    {sundayEveningService.isCanceled && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </div>
                  <span className="text-sm font-bold tracking-tight">이번 주는 주일 오후(저녁) 예배가 없습니다.</span>
                </div>
                {sundayEveningService.isCanceled && (
                  <span className="text-xs font-extrabold bg-amber-200/60 text-amber-800 px-2.5 py-1 rounded-full">
                    화면에 휴무 안내 표시됨
                  </span>
                )}
              </div>

              {/* 기본 예배 정보 입력 (명칭, 시간, 장소, 설교자, 본문) */}
              <div
                className={`p-6 bg-slate-50/80 rounded-[2rem] border border-slate-200/60 transition-all space-y-4 ${sundayEveningService.isCanceled ? "opacity-40 pointer-events-none grayscale" : ""
                  }`}
              >
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-gray-600">예배 명칭</Label>
                    <Input
                      placeholder="예: 주일 오후 찬양예배"
                      value={sundayEveningService.name}
                      onChange={(e) => setSundayEveningService({ ...sundayEveningService, name: e.target.value })}
                      className="rounded-xl border-slate-200 bg-white h-11 text-sm font-bold"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-gray-600">시간</Label>
                    <Input
                      placeholder="예: 오후 02:00"
                      value={sundayEveningService.time}
                      onChange={(e) => setSundayEveningService({ ...sundayEveningService, time: e.target.value })}
                      className="rounded-xl border-slate-200 bg-white h-11 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-gray-600">장소</Label>
                    <Input
                      placeholder="예: 본당"
                      value={sundayEveningService.location}
                      onChange={(e) => setSundayEveningService({ ...sundayEveningService, location: e.target.value })}
                      className="rounded-xl border-slate-200 bg-white h-11 text-sm"
                    />
                  </div>
                </div>

                <div className="grid md:grid-cols-3 gap-4 pt-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-gray-600">말씀 제목</Label>
                    <Input
                      placeholder="말씀 제목"
                      value={sundayEveningService.title}
                      onChange={(e) => setSundayEveningService({ ...sundayEveningService, title: e.target.value })}
                      className="rounded-xl border-slate-200 bg-white h-11 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-gray-600">본문 말씀</Label>
                    <Input
                      placeholder="예: 시편 23:1-6"
                      value={sundayEveningService.scripture}
                      onChange={(e) => setSundayEveningService({ ...sundayEveningService, scripture: e.target.value })}
                      className="rounded-xl border-slate-200 bg-white h-11 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-gray-600">설교자</Label>
                    <Input
                      placeholder="예: 이성경 목사"
                      value={sundayEveningService.preacher}
                      onChange={(e) => setSundayEveningService({ ...sundayEveningService, preacher: e.target.value })}
                      className="rounded-xl border-slate-200 bg-white h-11 text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* 주일 오전 예배와 동일한 '예배 순서' 설정 영역 */}
              <div className={`space-y-4 ${sundayEveningService.isCanceled ? "opacity-40 pointer-events-none grayscale" : ""}`}>
                <div className="flex justify-between items-center pt-2">
                  <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                    <div className="w-2 h-2 bg-indigo-500 rounded-full" /> 예배 순서 설정
                  </h3>
                  <Button
                    onClick={addEveningSection}
                    variant="outline"
                    size="sm"
                    className="rounded-full border-dashed border-2 px-4 border-indigo-200 text-indigo-600 hover:bg-indigo-50"
                  >
                    <Plus className="w-4 h-4 mr-1" /> 순서 추가
                  </Button>
                </div>

                <div className="space-y-3">
                  {sundayEveningService.sections.map((section, index) => (
                    <div
                      key={section.id}
                      className="p-3.5 bg-gray-50/70 rounded-[1.25rem] border border-gray-100 group hover:bg-white hover:shadow-md transition-all"
                    >
                      <div className="flex items-center justify-between mb-2.5">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={index === 0}
                            onClick={() => moveEveningSection(index, "up")}
                            className="h-7 w-7 rounded-md bg-white border border-gray-200 shadow-sm"
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={index === sundayEveningService.sections.length - 1}
                            onClick={() => moveEveningSection(index, "down")}
                            className="h-7 w-7 rounded-md bg-white border border-gray-200 shadow-sm"
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </Button>
                        </div>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeEveningSection(section.id)}
                          className="text-gray-300 hover:text-red-500 rounded-full h-7 w-7 shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                        <Input
                          placeholder="순서명 (예: 찬양, 기도)"
                          value={section.label}
                          onChange={(e) => updateEveningSection(section.id, "label", e.target.value)}
                          className="rounded-xl h-10 border-gray-200 bg-white font-semibold text-sm"
                        />
                        <Input
                          placeholder="담당자/내용 (예: 인도자, 다같이)"
                          value={section.value}
                          onChange={(e) => updateEveningSection(section.id, "value", e.target.value)}
                          className="rounded-xl h-10 border-gray-200 bg-white text-sm"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </Card>

        <Card className="p-5 rounded-[1.75rem] border-0 bg-white shadow-xl shadow-red-500/5 overflow-hidden relative">
          <div className="absolute top-0 right-0 p-6 opacity-5">
            <Youtube className="w-32 h-32 text-red-600" />
          </div>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-3 text-gray-800">
            <div className="w-2.5 h-8 bg-red-500 rounded-full"></div> 금주의 찬양
          </h2>
          <div className="space-y-4">
            <Label className="font-semibold text-gray-600">유튜브 링크나 ID를 넣어주세요. (비워두면 주보에 표시되지 않습니다)</Label>
            <span className="text-[11px] font-medium text-gray-400"></span>
            <div className="flex gap-3 relative z-10">
              <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center shrink-0">
                <Music className="w-6 h-6 text-red-500" />
              </div>
              <Input
                placeholder="유튜브 URL 주소를 입력하세요"
                value={bulletinData.youtubeId}
                onChange={(e) => setBulletinData({ ...bulletinData, youtubeId: e.target.value })}
                className="rounded-2xl h-12 border-red-100 focus-visible:ring-red-200 text-sm"
              />
            </div>
          </div>
        </Card>

        {/* 찬양 "더보기" - 위 금주의 찬양(youtubeId)과 별개로, 최대 8개까지 추가 영상을
            카드뷰로 보여주는 신규 기능. 켜고 끌 수 있는 토글. */}
        <Card className="p-5 rounded-[1.75rem] border-0 bg-white shadow-xl shadow-red-500/5 relative overflow-hidden">
          <div className="flex flex-col gap-3 mb-4">
            <div className="min-w-0">
              <h2 className="text-xl font-bold flex items-center gap-3 text-gray-800">
                <div className="w-2.5 h-8 bg-red-500 rounded-full shrink-0" /> 찬양 더보기
              </h2>
              <p className="text-xs text-gray-400 mt-1.5 font-medium leading-relaxed">
                성도 화면 "찬양 영상 미리보기" 카드 아래에 더보기를 추가해서, 최대 8개의 영상을 카드뷰로 더 보여줄 수 있어요.
              </p>
              <p className="text-[11px] text-red-400 mt-1 font-bold leading-relaxed">
                링크를 넣고 다른 곳을 누르면 유튜브 제목을 자동으로 가져와요.
              </p>
            </div>

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <label
                htmlFor="extra-hymns-toggle"
                className={`flex items-center gap-3 py-2 px-4 rounded-full transition-all duration-300 cursor-pointer select-none shrink-0 ${extraHymnsEnabled
                  ? "bg-red-50/80 shadow-sm border border-red-100"
                  : "bg-gray-100/70 border border-transparent"
                  }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full transition-colors shrink-0 ${extraHymnsEnabled ? "bg-red-500 animate-pulse" : "bg-gray-400"
                      }`}
                  />
                  <span
                    className={`text-xs font-bold transition-colors whitespace-nowrap ${extraHymnsEnabled ? "text-red-600" : "text-gray-500"
                      }`}
                  >
                    {extraHymnsEnabled ? "주보에 표시 중" : "주보에서 숨김"}
                  </span>
                </div>
                <Switch
                  id="extra-hymns-toggle"
                  checked={extraHymnsEnabled}
                  onCheckedChange={setExtraHymnsEnabled}
                  className="data-[state=checked]:bg-red-500 data-[state=unchecked]:bg-gray-300 transition-colors duration-200"
                />
              </label>

              {extraHymnsEnabled && (
                <Button
                  onClick={addExtraHymn}
                  variant="outline"
                  disabled={extraHymns.length >= 8}
                  className="rounded-full border-dashed border-2 px-6 border-red-200 text-red-500 hover:bg-red-50 font-bold text-xs h-10 shrink-0 disabled:opacity-40"
                >
                  <Plus className="w-4 h-4 mr-1.5" /> 영상 추가 ({extraHymns.length}/8)
                </Button>
              )}
            </div>
          </div>

          {extraHymnsEnabled && (
            <div className="space-y-3">
              {extraHymns.length === 0 && (
                <p className="text-xs text-gray-400 font-medium py-6 text-center">
                  아직 추가된 영상이 없어요. "영상 추가"를 눌러 유튜브 링크를 넣어보세요.
                </p>
              )}
              {extraHymns.map((hymn) => (
                <div key={hymn.id} className="p-4 bg-slate-50/80 rounded-[1.5rem] border border-slate-100 hover:bg-white hover:shadow-md transition-all">
                  <div className="flex gap-3 items-start">
                    <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center shrink-0">
                      <Youtube className="w-6 h-6 text-red-500" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <Input
                        placeholder="유튜브 URL 주소를 입력하세요"
                        value={hymn.youtubeId}
                        onChange={(e) => updateExtraHymnRaw(hymn.id, e.target.value)}
                        onBlur={(e) => handleExtraHymnBlur(hymn.id, e.target.value)}
                        className="rounded-2xl h-11 border-red-100 focus-visible:ring-red-200 text-sm"
                      />
                      <p className="text-[11px] text-gray-400 font-medium truncate pl-1">
                        {fetchingHymnId === hymn.id
                          ? "제목 불러오는 중..."
                          : hymn.title
                            ? `제목: ${hymn.title}`
                            : "링크를 입력하면 제목을 자동으로 가져와요"}
                      </p>
                    </div>
                    <Button
                      onClick={() => removeExtraHymn(hymn.id)}
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5 rounded-[1.75rem] border-0 bg-white shadow-xl shadow-purple-500/5">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold flex items-center gap-3">
              <div className="w-2.5 h-8 bg-purple-500 rounded-full"></div> 예배 순서
            </h2>
            <Button onClick={addSection} variant="outline" className="rounded-full border-dashed border-2 px-6 border-purple-100 text-purple-600 hover:bg-purple-50">
              <Plus className="w-4 h-4 mr-2" /> 순서 추가
            </Button>
          </div>

          {/* 특별 주일 - 예배 순서 목록의 다른 항목들(입례송, 신앙고백 등)과는 다르게, 예배 순서
              맨 위에 배너처럼 따로 표시되는 값이라 일부러 색을 다르게(호박색) 줘서 구분했다.
              성도 화면에서는 "예배 순서" 헤더 줄 우측에 나온다. 비워두면 표시 안 됨. */}
          <div className="mb-4 p-4 rounded-[1.5rem] border-2 border-amber-100 bg-amber-50/40">
            <Label className="font-semibold text-amber-800">특별 주일</Label>
            <span className="text-[11px] font-medium text-amber-600/70 block mb-2">비워두면 주보에 표시되지 않습니다. 예배 순서 맨 위에 강조되어 나와요.</span>
            <Input
              placeholder="예: 어린이 주일, 어버이 주일, 맥추감사주일"
              value={bulletinData.specialSunday}
              onChange={(e) => setBulletinData({ ...bulletinData, specialSunday: e.target.value })}
              className="rounded-2xl h-12 border-amber-200 bg-white text-sm"
            />
          </div>

          <div className="space-y-4">
            {/* {sections.map((section, index) => (
              <div key={section.id} className="flex items-center gap-4 p-5 bg-gray-50/50 rounded-3xl border border-gray-100 group hover:bg-white hover:shadow-lg transition-all">
                <div className="flex flex-col gap-1">
                  <Button variant="ghost" size="icon" disabled={index === 0} onClick={() => moveSection(index, 'up')} className="h-7 w-7 rounded-lg bg-white border border-gray-100 shadow-sm"><ChevronUp className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="icon" disabled={index === sections.length - 1} onClick={() => moveSection(index, 'down')} className="h-7 w-7 rounded-lg bg-white border border-gray-100 shadow-sm"><ChevronDown className="w-4 h-4" /></Button>
                </div>
                <div className="flex-1 grid md:grid-cols-2 gap-4">
                  <Input value={section.label} onChange={(e) => updateSection(section.id, 'label', e.target.value)} className="rounded-xl h-11 border-gray-200 focus:bg-white text-sm" placeholder="항목 (예: 찬양)" />
                  <Input value={section.value} onChange={(e) => updateSection(section.id, 'value', e.target.value)} className="rounded-xl h-11 border-gray-200 focus:bg-white text-sm" placeholder="내용 (예: 다같이)" />
                </div>
                <Button variant="ghost" size="icon" onClick={() => removeSection(section.id)} className="text-gray-300 hover:text-red-500 rounded-full"><Trash2 className="w-5 h-5" /></Button>
              </div>
            ))} */}

            {sections.map((section, index) => (
              <div key={section.id} className={`p-4 rounded-[1.5rem] border group hover:shadow-lg transition-all ${section.hidden ? 'bg-gray-100/70 border-gray-200 opacity-60' : 'bg-gray-50/50 border-gray-100 hover:bg-white'}`}>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" disabled={index === 0} onClick={() => moveSection(index, 'up')} className="h-7 w-7 rounded-lg bg-white border border-gray-100 shadow-sm"><ChevronUp className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" disabled={index === sections.length - 1} onClick={() => moveSection(index, 'down')} className="h-7 w-7 rounded-lg bg-white border border-gray-100 shadow-sm"><ChevronDown className="w-4 h-4" /></Button>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 cursor-pointer select-none px-2.5 py-1 rounded-full bg-white border border-gray-100 shadow-sm whitespace-nowrap">
                      <Checkbox checked={!!section.hidden} onCheckedChange={() => toggleSectionHidden(section.id)} className="h-3.5 w-3.5 shrink-0" />
                      이번 주 숨기기
                    </label>
                    <Button variant="ghost" size="icon" onClick={() => removeSection(section.id)} className="text-gray-300 hover:text-red-500 rounded-full h-8 w-8 shrink-0"><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </div>

                <div className="space-y-2.5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    <Input
                      value={section.label}
                      onChange={(e) => updateSection(section.id, 'label', e.target.value)}
                      className="rounded-xl h-11 border-gray-200 focus:bg-white text-sm"
                      placeholder="항목 (예: 신앙고백)"
                    />
                    <Input
                      value={section.value}
                      onChange={(e) => updateSection(section.id, 'value', e.target.value)}
                      className="rounded-xl h-11 border-gray-200 focus:bg-white text-sm"
                      placeholder="내용 (예: 사도신경)"
                    />
                  </div>
                  <Textarea
                    value={section.preview || ""}
                    onChange={(e) => updateSection(section.id, 'preview', e.target.value)}
                    placeholder="[선택] 항목 바로 아래에 짧게 표시할 문구 (예: 찬송가 가사) · 성도 화면에서 최대 3줄까지만 보이고 넘치면 …"
                    className="rounded-xl text-xs bg-white border-gray-200"
                    rows={2}
                  />
                  <Textarea
                    value={section.content || ""}
                    onChange={(e) => updateSection(section.id, 'content', e.target.value)}
                    placeholder="[선택] 성도가 클릭했을 때 팝업으로 보여줄 상세 전문(사도신경, 주기도문 등)을 입력하세요."
                    className="rounded-xl text-xs bg-white border-gray-200"
                    rows={2}
                  />
                </div>
              </div>
            ))}

          </div>
        </Card>

        <Card className="p-5 rounded-[1.75rem] border-0 bg-white shadow-xl shadow-slate-500/5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
            <div className="min-w-0">
              <h2 className="text-xl font-bold flex items-center gap-3 text-gray-900 tracking-tight">
                <div className="w-2.5 h-8 bg-blue-600 rounded-full shrink-0"></div> 주중예배 안내
              </h2>
              <p className="text-xs text-gray-500 mt-1.5 pl-0 sm:pl-5 font-medium leading-relaxed">수요예배, 금요철야, 새벽기도 등 주중 모임 정보를 직관적으로 관리하세요.</p>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    title="도움말"
                    className="w-6 h-6 rounded-full border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-300 flex items-center justify-center shrink-0 transition-colors"
                  >
                    <Info className="w-3.5 h-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-72 rounded-2xl border-0 shadow-xl p-4">
                  <p className="font-bold text-slate-800 text-sm mb-2">이렇게 사용하세요</p>
                  <ul className="space-y-2 text-xs text-slate-500 leading-relaxed">
                    <li>· 없는 모임은 그냥 비워두세요. 일시/시간, 말씀 제목이 둘 다 비어있으면 그 카드는 성도 화면에 자동으로 안 보여요.</li>
                    <li>· 새벽기도처럼 매일이 아니라 특정 요일에만 있다면, "일시/시간" 칸에 "매주 화·목 새벽 5시"처럼 직접 적어주세요.</li>
                    <li>· 말씀 제목·본문·설교자는 모임 하나당 1개씩만 들어가요. 요일마다 내용이 다르면 이 칸 하나에 함께 적어주세요.</li>
                  </ul>
                </PopoverContent>
              </Popover>

              {/* 머티리얼 스타일 커스텀 토글 영역 */}
              <label
                htmlFor="midweek-toggle"
                className={`flex items-center gap-3 py-2 px-4 rounded-full transition-all duration-300 cursor-pointer select-none shrink-0 ${midweekServices.enabled
                  ? "bg-blue-50/80 shadow-sm border border-blue-100"
                  : "bg-gray-100/70 border border-transparent"
                  }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full transition-colors shrink-0 ${midweekServices.enabled ? "bg-blue-600 animate-pulse" : "bg-gray-400"
                    }`} />
                  <span className={`text-xs font-bold transition-colors whitespace-nowrap ${midweekServices.enabled ? "text-blue-700" : "text-gray-500"
                    }`}>
                    {midweekServices.enabled ? "사용 중" : "비활성화"}
                  </span>
                </div>

                <Switch
                  id="midweek-toggle"
                  checked={midweekServices.enabled}
                  onCheckedChange={(checked) => setMidweekServices({ ...midweekServices, enabled: checked })}
                  className="data-[state=checked]:bg-blue-600 data-[state=unchecked]:bg-gray-300 transition-colors duration-200"
                />
              </label>
            </div>
          </div>

          {midweekServices.enabled ? (
            <div className="space-y-6 animate-in fade-in duration-300">
              {/* 1. 수요예배 영역 */}
              <div className="p-4 bg-slate-50/80 rounded-[1.5rem] border border-slate-200/60 transition-all hover:bg-slate-50">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 pb-3 border-b border-slate-200/50 mb-4">
                  <div className="flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-lg bg-blue-600 text-white font-black text-xs flex items-center justify-center shadow-sm shrink-0">수</span>
                    <span className="font-bold text-gray-800 text-base">수요 모임</span>
                  </div>
                  <Input
                    placeholder="예배명 (예: 수요예배)"
                    value={midweekServices.wednesday.name}
                    onChange={(e) => setMidweekServices({
                      ...midweekServices,
                      wednesday: { ...midweekServices.wednesday, name: e.target.value }
                    })}
                    className="w-full sm:w-48 rounded-xl border-slate-200 bg-white h-9 text-xs font-bold text-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-blue-500" /> 일시 / 시간
                    </Label>
                    <Input
                      placeholder="예: 매주 수요일 저녁 7:30"
                      value={midweekServices.wednesday.dateTime}
                      onChange={(e) => setMidweekServices({
                        ...midweekServices,
                        wednesday: { ...midweekServices.wednesday, dateTime: e.target.value }
                      })}
                      className="rounded-2xl border-slate-200 bg-white h-11 text-sm shadow-sm focus:border-blue-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5 text-blue-500" /> 설교자
                    </Label>
                    <Input
                      placeholder="예: 김성경 목사"
                      value={midweekServices.wednesday.preacher}
                      onChange={(e) => setMidweekServices({
                        ...midweekServices,
                        wednesday: { ...midweekServices.wednesday, preacher: e.target.value }
                      })}
                      className="rounded-2xl border-slate-200 bg-white h-11 text-sm shadow-sm focus:border-blue-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-blue-500" /> 말씀 제목
                    </Label>
                    <Input
                      placeholder="말씀 제목을 입력하세요"
                      value={midweekServices.wednesday.title}
                      onChange={(e) => setMidweekServices({
                        ...midweekServices,
                        wednesday: { ...midweekServices.wednesday, title: e.target.value }
                      })}
                      className="rounded-2xl border-slate-200 bg-white h-11 text-sm shadow-sm focus:border-blue-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-blue-500" /> 본문 구절
                    </Label>
                    <Input
                      placeholder="예: 시편 23:1-6"
                      value={midweekServices.wednesday.scripture}
                      onChange={(e) => setMidweekServices({
                        ...midweekServices,
                        wednesday: { ...midweekServices.wednesday, scripture: e.target.value }
                      })}
                      className="rounded-2xl border-slate-200 bg-white h-11 text-sm shadow-sm focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* 2. 금요철야 영역 */}
              <div className="p-4 bg-slate-50/80 rounded-[1.5rem] border border-slate-200/60 transition-all hover:bg-slate-50">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 pb-3 border-b border-slate-200/50 mb-4">
                  <div className="flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-lg bg-indigo-600 text-white font-black text-xs flex items-center justify-center shadow-sm shrink-0">금</span>
                    <span className="font-bold text-gray-800 text-base">금요 모임</span>
                  </div>
                  <Input
                    placeholder="예배명 (예: 금요철야)"
                    value={midweekServices.friday.name}
                    onChange={(e) => setMidweekServices({
                      ...midweekServices,
                      friday: { ...midweekServices.friday, name: e.target.value }
                    })}
                    className="w-full sm:w-48 rounded-xl border-slate-200 bg-white h-9 text-xs font-bold text-gray-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-indigo-500" /> 일시 / 시간
                    </Label>
                    <Input
                      placeholder="예: 매주 금요일 밤 9:00"
                      value={midweekServices.friday.dateTime}
                      onChange={(e) => setMidweekServices({
                        ...midweekServices,
                        friday: { ...midweekServices.friday, dateTime: e.target.value }
                      })}
                      className="rounded-2xl border-slate-200 bg-white h-11 text-sm shadow-sm focus:border-indigo-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5 text-indigo-500" /> 설교자
                    </Label>
                    <Input
                      placeholder="예: 홍길동 목사"
                      value={midweekServices.friday.preacher}
                      onChange={(e) => setMidweekServices({
                        ...midweekServices,
                        friday: { ...midweekServices.friday, preacher: e.target.value }
                      })}
                      className="rounded-2xl border-slate-200 bg-white h-11 text-sm shadow-sm focus:border-indigo-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-indigo-500" /> 말씀 제목
                    </Label>
                    <Input
                      placeholder="말씀 제목을 입력하세요"
                      value={midweekServices.friday.title}
                      onChange={(e) => setMidweekServices({
                        ...midweekServices,
                        friday: { ...midweekServices.friday, title: e.target.value }
                      })}
                      className="rounded-2xl border-slate-200 bg-white h-11 text-sm shadow-sm focus:border-indigo-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-indigo-500" /> 본문 구절
                    </Label>
                    <Input
                      placeholder="예: 이사야 40:28-31"
                      value={midweekServices.friday.scripture}
                      onChange={(e) => setMidweekServices({
                        ...midweekServices,
                        friday: { ...midweekServices.friday, scripture: e.target.value }
                      })}
                      className="rounded-2xl border-slate-200 bg-white h-11 text-sm shadow-sm focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* 3. 새벽기도 영역 */}
              <div className="p-4 bg-slate-50/80 rounded-[1.5rem] border border-slate-200/60 transition-all hover:bg-slate-50">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 pb-3 border-b border-slate-200/50 mb-4">
                  <div className="flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-lg bg-amber-500 text-white font-black text-xs flex items-center justify-center shadow-sm shrink-0">새</span>
                    <span className="font-bold text-gray-800 text-base">새벽 모임</span>
                  </div>
                  <Input
                    placeholder="예배명 (예: 새벽기도회)"
                    value={midweekServices.dawn.name}
                    onChange={(e) => setMidweekServices({
                      ...midweekServices,
                      dawn: { ...midweekServices.dawn, name: e.target.value }
                    })}
                    className="w-full sm:w-48 rounded-xl border-slate-200 bg-white h-9 text-xs font-bold text-gray-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-amber-500" /> 일시 / 시간
                    </Label>
                    <Input
                      placeholder="예: 매일 새벽 5:30 (월~토)"
                      value={midweekServices.dawn.dateTime}
                      onChange={(e) => setMidweekServices({
                        ...midweekServices,
                        dawn: { ...midweekServices.dawn, dateTime: e.target.value }
                      })}
                      className="rounded-2xl border-slate-200 bg-white h-11 text-sm shadow-sm focus:border-amber-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5 text-amber-500" /> 설교자
                    </Label>
                    <Input
                      placeholder="예: 김성경 목사"
                      value={midweekServices.dawn.preacher}
                      onChange={(e) => setMidweekServices({
                        ...midweekServices,
                        dawn: { ...midweekServices.dawn, preacher: e.target.value }
                      })}
                      className="rounded-2xl border-slate-200 bg-white h-11 text-sm shadow-sm focus:border-amber-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-amber-500" /> 말씀 제목
                    </Label>
                    <Input
                      placeholder="말씀 제목을 입력하세요"
                      value={midweekServices.dawn.title}
                      onChange={(e) => setMidweekServices({
                        ...midweekServices,
                        dawn: { ...midweekServices.dawn, title: e.target.value }
                      })}
                      className="rounded-2xl border-slate-200 bg-white h-11 text-sm shadow-sm focus:border-amber-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-amber-500" /> 본문 구절
                    </Label>
                    <Input
                      placeholder="예: 시편 5:3"
                      value={midweekServices.dawn.scripture}
                      onChange={(e) => setMidweekServices({
                        ...midweekServices,
                        dawn: { ...midweekServices.dawn, scripture: e.target.value }
                      })}
                      className="rounded-2xl border-slate-200 bg-white h-11 text-sm shadow-sm focus:border-amber-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-50/50 rounded-[2rem] p-6 border border-dashed border-slate-200 text-center text-gray-400 text-xs font-medium">
              주중예배 안내 기능이 비활성화되었습니다. 성도 주보 화면에도 표시되지 않습니다.
            </div>
          )}
        </Card>

        <Card className="p-5 rounded-[1.75rem] border-0 bg-white shadow-xl shadow-orange-500/5">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold flex items-center gap-3">
              <div className="w-2.5 h-8 bg-orange-500 rounded-full"></div> 교회 소식
            </h2>
            <Button onClick={addAnnouncement} variant="outline" className="rounded-full border-dashed border-2 px-6 border-orange-100 text-orange-600 hover:bg-orange-50">
              <Plus className="w-4 h-4 mr-2" /> 소식 추가
            </Button>
          </div>
          <div className="space-y-3">
            {announcements.map((ann, index) => (
              <div key={ann.id} className="p-4 bg-gray-50/50 rounded-[1.5rem] border border-gray-100 group hover:bg-white hover:shadow-lg transition-all">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" disabled={index === 0} onClick={() => moveAnnouncement(index, 'up')} className="h-7 w-7 rounded-lg bg-white border shadow-sm"><ChevronUp className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" disabled={index === announcements.length - 1} onClick={() => moveAnnouncement(index, 'down')} className="h-7 w-7 rounded-lg bg-white border shadow-sm"><ChevronDown className="w-4 h-4" /></Button>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeAnnouncement(ann.id)} className="text-gray-300 hover:text-red-500 rounded-full h-8 w-8"><Trash2 className="w-4 h-4" /></Button>
                </div>

                <div className="space-y-2.5">
                  <div>
                    <Label className="text-xs font-semibold text-gray-600 mb-1.5 block">제목</Label>
                    <Input value={ann.title} onChange={(e) => updateAnnouncement(ann.id, 'title', e.target.value)} className="rounded-xl border-gray-200 bg-white font-bold h-11 text-sm" placeholder="제목" />
                  </div>
                  <Textarea value={ann.content} onChange={(e) => updateAnnouncement(ann.id, 'content', e.target.value)} className="rounded-xl border-gray-200 bg-white min-h-[100px] resize-none shadow-sm focus:border-orange-200 text-sm" placeholder="상세 내용을 입력하세요..." />
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* <Card className="p-5 rounded-[1.75rem] border-0 bg-white shadow-xl shadow-green-500/5">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-3 text-gray-800">
            <div className="w-2.5 h-8 bg-green-500 rounded-full"></div> 헌금 및 후원 안내
          </h2>
          <div className="flex items-center gap-4 bg-green-50/50 p-6 rounded-[2rem] border border-green-100">
            <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm shrink-0">
              <Wallet className="w-6 h-6 text-green-600" />
            </div>
            <div className="flex-1">
              <Label className="font-bold text-green-800 mb-1 block">온라인 헌금 계좌</Label>
              <Input
                placeholder="은행 및 계좌번호 입력"
                value={bulletinData.offeringAccount}
                onChange={(e) => setBulletinData({ ...bulletinData, offeringAccount: e.target.value })}
                className="rounded-xl border-green-200 bg-white h-11 font-medium"
              />
            </div>
          </div>
        </Card> */}

        <Card className="p-5 rounded-[1.75rem] border-0 bg-white shadow-xl shadow-green-500/5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold flex items-center gap-3 text-gray-800">
              <div className="w-2.5 h-8 bg-green-500 rounded-full"></div> 헌금 및 후원 안내
            </h2>
            <Button
              variant="outline"
              onClick={handleCopyAccount}
              className="rounded-full border-green-200 text-green-700 hover:bg-green-50 font-bold text-xs h-9 px-4"
            >
              <Copy className="w-3.5 h-3.5 mr-1.5" />
              계좌 정보 복사
            </Button>
          </div>

          <div className="p-6 bg-emerald-50/40 rounded-[2rem] border border-emerald-100/80 space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-emerald-500 text-white rounded-xl flex items-center justify-center shadow-md shrink-0">
                <Wallet className="w-5 h-5" />
              </div>
              <div>
                <p className="font-bold text-gray-900 text-base">온라인 헌금 계좌 설정</p>
                <p className="text-xs text-gray-500 font-medium">교인들이 쉽게 헌금할 수 있도록 계좌 정보를 선택/입력해주세요.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* 은행 선택 드롭다운 및 기타 직접 입력 필드 */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-emerald-800">은행명</Label>
                <Select
                  value={isCustomBank ? "custom" : bulletinData.bankName}
                  onValueChange={handleBankSelect}
                >
                  <SelectTrigger className="rounded-2xl border-emerald-200/60 bg-white !h-12 px-4 !py-0 font-medium focus:ring-emerald-500 text-sm w-full flex items-center justify-between">
                    <SelectValue placeholder="은행 선택" />
                  </SelectTrigger>
                  
                  <SelectContent className="rounded-2xl max-h-60 border-emerald-100 shadow-xl">
                    {BANK_LIST.map((bank) => (
                      <SelectItem key={bank} value={bank} className="rounded-xl font-medium">
                        {bank === "custom" ? "기타 (직접 입력)" : bank}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* 기타(직접 입력) 선택 시 나타나는 Input */}
                {isCustomBank && (
                  <Input
                    placeholder="은행 이름 입력"
                    value={bulletinData.bankName}
                    onChange={(e) => setBulletinData({ ...bulletinData, bankName: e.target.value })}
                    className="rounded-2xl border-emerald-200/60 bg-white h-12 font-medium focus-visible:ring-emerald-500 mt-2 text-sm px-3"
                  />
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-emerald-800">계좌번호</Label>
                <Input
                  placeholder="예: 351-0000-0000-00"
                  value={bulletinData.accountNumber}
                  onChange={(e) => setBulletinData({ ...bulletinData, accountNumber: e.target.value })}
                  className="rounded-2xl border-emerald-200/60 bg-white h-12 font-medium focus-visible:ring-emerald-500 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-emerald-800">예금주</Label>
                <Input
                  placeholder="예: 스테이온교회"
                  value={bulletinData.accountHolder}
                  onChange={(e) => setBulletinData({ ...bulletinData, accountHolder: e.target.value })}
                  className="rounded-2xl border-emerald-200/60 bg-white h-12 font-medium focus-visible:ring-emerald-500 text-sm"
                />
              </div>
            </div>
          </div>
        </Card>
      </div>
      )}

      {activeTab === "church" && (
      <div className="container mx-auto px-4 py-6 max-w-4xl space-y-5">
        <Card className="p-5 rounded-[1.75rem] border-0 bg-white shadow-xl shadow-blue-500/5">
          <div className="flex items-center justify-between gap-3 mb-1.5 flex-wrap">
            <h2 className="text-xl font-bold flex items-center gap-3 text-slate-800">
              <div className="w-2.5 h-8 bg-teal-500 rounded-full shrink-0" /> 교회 로고
            </h2>
            <label
              htmlFor="churchlogo-toggle"
              className={`flex items-center gap-3 py-2 px-4 rounded-full transition-all duration-300 cursor-pointer select-none shrink-0 ${churchLogoEnabled ? "bg-blue-50/80 shadow-sm border border-blue-100" : "bg-gray-100/70 border border-transparent"}`}
            >
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full transition-colors shrink-0 ${churchLogoEnabled ? "bg-blue-600 animate-pulse" : "bg-gray-400"}`} />
                <span className={`text-xs font-bold transition-colors whitespace-nowrap ${churchLogoEnabled ? "text-blue-700" : "text-gray-500"}`}>
                  {churchLogoEnabled ? "노출 중" : "노출 안 함"}
                </span>
              </div>
              <Switch
                id="churchlogo-toggle"
                checked={churchLogoEnabled}
                onCheckedChange={setChurchLogoEnabled}
                className="data-[state=checked]:bg-blue-600 data-[state=unchecked]:bg-gray-300 transition-colors duration-200"
              />
            </label>
          </div>
          <p className="text-xs text-slate-400 font-medium leading-relaxed">
            성도 화면 맨 위(대표 사진 바로 아래)에 흰색 띠로 표시되는 교회 로고예요.
          </p>
          <p className="text-[11px] text-teal-600 font-bold leading-relaxed flex items-start gap-1">
            <ImageIcon className="w-3 h-3 shrink-0 mt-0.5" /> 가로형 권장 · 가로 1000px 이상 · 배경 투명 PNG면 가장 깔끔해요. 성도 화면에서는 아래에서 고른 크기로 표시됩니다.
          </p>
          <p className="text-[11px] text-purple-600/90 font-medium mt-3 leading-relaxed flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            지금은 베타 기간이라 무료로 제공돼요. 정식 버전이 출시되면 요금제에 따라 유료로 바뀔 수 있어요.
          </p>

          <input
            type="file"
            accept="image/png, image/jpeg, image/jpg, image/webp"
            ref={churchLogoInputRef}
            onChange={handleChurchLogoUpload}
            className="hidden"
          />

          {churchLogo ? (
            <div className="space-y-3">
              {/* 미리보기: 성도 화면 로고 띠와 같은 흰 배경 + 고른 크기 그대로 */}
              <div className="w-full rounded-xl border border-slate-200 bg-white flex items-center justify-center px-4 py-6">
                <img src={churchLogo} alt="교회 로고" className={`${churchLogoHeightClass(churchLogoSize)} w-auto max-w-full object-contain`} />
              </div>

              {/* 표시 크기 선택 */}
              <div>
                <p className="text-xs font-bold text-slate-500 mb-2">성도 화면 표시 크기</p>
                <div className="grid grid-cols-3 gap-2">
                  {CHURCH_LOGO_SIZE_OPTIONS.map((opt) => {
                    const active = normalizeChurchLogoSize(churchLogoSize) === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setChurchLogoSize(opt.id)}
                        className={`rounded-xl border-2 px-2 py-2.5 text-center transition-all ${active ? "border-teal-500 bg-teal-50/60" : "border-slate-200 bg-white hover:border-slate-300"}`}
                      >
                        <span className={`block text-sm font-bold ${active ? "text-teal-700" : "text-slate-600"}`}>{opt.label}</span>
                        <span className="block text-[10px] text-slate-400 font-medium mt-0.5 leading-tight">{opt.hint}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-2">
                <button type="button" onClick={() => churchLogoInputRef.current?.click()} className="flex-1 h-11 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white text-sm font-bold text-slate-600 transition-all">
                  다른 이미지로 교체
                </button>
                <button type="button" onClick={() => { setChurchLogo(""); setChurchLogoSize(DEFAULT_CHURCH_LOGO_SIZE); }} className="h-11 px-4 rounded-xl border border-red-100 bg-red-50 hover:bg-red-100 text-sm font-bold text-red-500 transition-all">
                  삭제
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => churchLogoInputRef.current?.click()}
              className="w-full h-24 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/40 hover:bg-slate-50 hover:border-slate-300 transition-all flex flex-col items-center justify-center gap-2 text-slate-400"
            >
              <ImageIcon className="w-6 h-6" />
              <span className="text-sm font-bold">교회 로고 이미지 업로드</span>
            </button>
          )}
        </Card>

        {/* 교회 소개 */}
        <Card className="p-5 rounded-[1.75rem] border-0 bg-white shadow-xl shadow-blue-500/5">
          <div className="flex items-center justify-between gap-3 mb-1.5 flex-wrap">
            <h2 className="text-xl font-bold flex items-center gap-3 text-slate-800">
              <div className="w-2.5 h-8 bg-sky-500 rounded-full shrink-0" /> 교회 소개
            </h2>
            <label
              htmlFor="church-intro-toggle"
              className={`flex items-center gap-3 py-2 px-4 rounded-full transition-all duration-300 cursor-pointer select-none shrink-0 ${churchIntroEnabled ? "bg-blue-50/80 shadow-sm border border-blue-100" : "bg-gray-100/70 border border-transparent"}`}
            >
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full transition-colors shrink-0 ${churchIntroEnabled ? "bg-blue-600 animate-pulse" : "bg-gray-400"}`} />
                <span className={`text-xs font-bold transition-colors whitespace-nowrap ${churchIntroEnabled ? "text-blue-700" : "text-gray-500"}`}>
                  {churchIntroEnabled ? "노출 중" : "노출 안 함"}
                </span>
              </div>
              <Switch
                id="church-intro-toggle"
                checked={churchIntroEnabled}
                onCheckedChange={setChurchIntroEnabled}
                className="data-[state=checked]:bg-blue-600 data-[state=unchecked]:bg-gray-300 transition-colors duration-200"
              />
            </label>
          </div>
          <p className="text-xs text-slate-400 font-medium leading-relaxed">
            성도 화면 우측 상단 <b>메뉴 &gt; 소개</b>에 표시돼요. 한 번 써두면 다음 주보에도 자동으로 이어집니다.
          </p>
          <p className="text-[11px] text-sky-600 font-bold leading-relaxed flex items-start gap-1 mt-1">
            <Info className="w-3 h-3 shrink-0 mt-0.5" />
            모바일에서 읽기 좋게 <b>4~5줄 안</b>으로 간단·명료하게. 우리 교회가 지향하는 예배·훈련·섬김의 모습을 한 문단으로.
          </p>

          {/* 교회 이미지 - 소개 화면에서 로고 아래에 크게 표시 */}
          <div className="mt-4">
            <p className="text-xs font-bold text-slate-500 mb-1">교회 이미지 <span className="text-slate-400 font-medium">(선택)</span></p>
            <p className="text-[11px] text-sky-600 font-bold mb-2">📱 모바일 세로 화면에 크게 보여서 <b>세로형 이미지</b>가 잘 어울려요 (예: 3:4, 예배당·성도들 사진)</p>
            <input
              type="file"
              accept="image/png, image/jpeg, image/jpg, image/webp"
              ref={churchImageInputRef}
              onChange={handleChurchImageUpload}
              className="hidden"
            />
            {churchImage ? (
              <div className="space-y-2">
                <div className="w-full rounded-xl overflow-hidden border border-slate-200 bg-slate-50 max-h-64 flex items-center justify-center">
                  <img src={churchImage} alt="교회 이미지" className="w-full max-h-64 object-contain" />
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => churchImageInputRef.current?.click()} className="flex-1 h-10 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white text-sm font-bold text-slate-600 transition-all">
                    다른 이미지로 교체
                  </button>
                  <button type="button" onClick={() => setChurchImage("")} className="h-10 px-4 rounded-xl border border-red-100 bg-red-50 hover:bg-red-100 text-sm font-bold text-red-500 transition-all">
                    삭제
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => churchImageInputRef.current?.click()}
                className="w-full h-20 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/40 hover:bg-slate-50 hover:border-slate-300 transition-all flex flex-col items-center justify-center gap-1.5 text-slate-400"
              >
                <ImageIcon className="w-5 h-5" />
                <span className="text-sm font-bold">교회 이미지 업로드</span>
              </button>
            )}
          </div>

          <div className="mt-4">
            <CustomLabelField
              id="intro-label-toggle"
              defaultLabel="ABOUT"
              enabled={churchIntroLabelEnabled}
              onEnabledChange={setChurchIntroLabelEnabled}
              value={churchIntroLabel}
              onValueChange={setChurchIntroLabel}
            />
          </div>
          <Textarea
            value={churchIntro}
            onChange={(e) => setChurchIntro(e.target.value)}
            placeholder={"OOO교회에 오신 것을 환영합니다.\n하나님의 임재를 경험한 예배자들이\n예수님의 말씀으로 훈련된 제자가 되어\n성령님의 능력으로 지역과 세상을 섬기는 교회입니다."}
            rows={5}
            maxLength={300}
            className="rounded-xl border-slate-200 bg-white text-sm font-medium resize-none mt-3 leading-relaxed"
          />
          <p className="text-[11px] text-slate-400 font-medium text-right mt-1">{churchIntro.length} / 300자</p>
        </Card>

        <Card className="p-5 rounded-[1.75rem] border-0 bg-white shadow-xl shadow-blue-500/5">
          <div className="flex items-center justify-between gap-3 mb-1.5 flex-wrap">
            <h2 className="text-xl font-bold flex items-center gap-3 text-slate-800">
              <div className="w-2.5 h-8 bg-indigo-500 rounded-full shrink-0" /> 표어 / 주제 성구
            </h2>
            <label
              htmlFor="motto-toggle"
              className={`flex items-center gap-3 py-2 px-4 rounded-full transition-all duration-300 cursor-pointer select-none shrink-0 ${mottoEnabled
                ? "bg-blue-50/80 shadow-sm border border-blue-100"
                : "bg-gray-100/70 border border-transparent"
                }`}
            >
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full transition-colors shrink-0 ${mottoEnabled ? "bg-blue-600 animate-pulse" : "bg-gray-400"}`} />
                <span className={`text-xs font-bold transition-colors whitespace-nowrap ${mottoEnabled ? "text-blue-700" : "text-gray-500"}`}>
                  {mottoEnabled ? "노출 중" : "노출 안 함"}
                </span>
              </div>
              <Switch
                id="motto-toggle"
                checked={mottoEnabled}
                onCheckedChange={setMottoEnabled}
                className="data-[state=checked]:bg-blue-600 data-[state=unchecked]:bg-gray-300 transition-colors duration-200"
              />
            </label>
          </div>
          <p className="text-xs text-slate-400 mb-4 font-medium leading-relaxed">
            교회 표어나 이번 주 주제 성구를 입력하면 성도 화면 "섬기는 사람들" 바로 위에 표시돼요. 한 번 입력해두면 다음 주보를 새로 만들 때도 자동으로 이어져요.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">화면에 표시할 제목</label>
              <div className="flex gap-2">
                {([
                  { value: "verse", label: "주제 성구" },
                  { value: "motto", label: "표어" },
                  { value: "custom", label: "직접 입력" },
                ] as const).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setMottoLabelType(opt.value)}
                    className={`flex-1 h-10 rounded-xl text-xs font-bold border transition-all ${mottoLabelType === opt.value
                      ? "bg-blue-600 border-blue-600 text-white"
                      : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-white"
                      }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {mottoLabelType === "custom" && (
                <Input
                  value={mottoCustomLabel}
                  onChange={(e) => setMottoCustomLabel(e.target.value)}
                  placeholder="예: 이달의 말씀, 우리 교회 슬로건"
                  className="rounded-xl h-11 border-slate-200 bg-white text-sm font-bold mt-2"
                />
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">말씀 / 표어 내용</label>
              <Textarea
                value={mottoText}
                onChange={(e) => setMottoText(e.target.value)}
                placeholder="예: 내가 곧 길이요 진리요 생명이니 나로 말미암지 않고는 아버지께로 올 자가 없느니라"
                className="rounded-xl border-slate-200 bg-white text-sm min-h-[80px]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">출처 (성경 구절 등, 선택사항)</label>
              <Input
                value={mottoReference}
                onChange={(e) => setMottoReference(e.target.value)}
                placeholder="예: 요한복음 14:6"
                className="rounded-xl h-11 border-slate-200 bg-white text-sm font-bold"
              />
            </div>
          </div>
        </Card>

        {/* 교회 비전 - 선택 입력, 표어와 같은 톤으로 노출 토글 포함 */}
        <Card className="p-5 rounded-[1.75rem] border-0 bg-white shadow-xl shadow-blue-500/5">
          <div className="flex items-center justify-between gap-3 mb-1.5 flex-wrap">
            <h2 className="text-xl font-bold flex items-center gap-3 text-slate-800">
              <div className="w-2.5 h-8 bg-indigo-500 rounded-full shrink-0" /> 교회 비전
            </h2>
            <label
              htmlFor="vision-toggle"
              className={`flex items-center gap-3 py-2 px-4 rounded-full transition-all duration-300 cursor-pointer select-none shrink-0 ${churchVisionEnabled
                ? "bg-blue-50/80 shadow-sm border border-blue-100"
                : "bg-gray-100/70 border border-transparent"
                }`}
            >
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full transition-colors shrink-0 ${churchVisionEnabled ? "bg-blue-600 animate-pulse" : "bg-gray-400"}`} />
                <span className={`text-xs font-bold transition-colors whitespace-nowrap ${churchVisionEnabled ? "text-blue-700" : "text-gray-500"}`}>
                  {churchVisionEnabled ? "노출 중" : "노출 안 함"}
                </span>
              </div>
              <Switch
                id="vision-toggle"
                checked={churchVisionEnabled}
                onCheckedChange={setChurchVisionEnabled}
                className="data-[state=checked]:bg-blue-600 data-[state=unchecked]:bg-gray-300 transition-colors duration-200"
              />
            </label>
          </div>
          <p className="text-xs text-slate-400 mb-4 font-medium leading-relaxed">
            선택 입력이에요. 성도 화면 <b>메뉴 &gt; 교회 소개</b>에 표시돼요.
          </p>
          <CustomLabelField
            id="vision-label-toggle"
            defaultLabel="VISION"
            enabled={churchVisionLabelEnabled}
            onEnabledChange={setChurchVisionLabelEnabled}
            value={churchVisionLabel}
            onValueChange={setChurchVisionLabel}
          />
          <Textarea
            value={churchVision}
            onChange={(e) => setChurchVision(e.target.value.slice(0, 300))}
            placeholder="예: 열방을 품는 교회, 다음세대를 세우는 교회"
            className="rounded-xl border-slate-200 bg-white text-sm min-h-[80px] resize-none"
          />
          <p className="text-[11px] text-slate-400 font-medium text-right mt-1">{churchVision.length} / 300자</p>
        </Card>

        {/* 교회 사명 - 선택 입력. 비전 바로 다음, 섬기시는분 안내 설정 바로 전 */}
        <Card className="p-5 rounded-[1.75rem] border-0 bg-white shadow-xl shadow-blue-500/5">
          <div className="flex items-center justify-between gap-3 mb-1.5 flex-wrap">
            <h2 className="text-xl font-bold flex items-center gap-3 text-slate-800">
              <div className="w-2.5 h-8 bg-indigo-500 rounded-full shrink-0" /> 교회 사명
            </h2>
            <label
              htmlFor="mission-toggle"
              className={`flex items-center gap-3 py-2 px-4 rounded-full transition-all duration-300 cursor-pointer select-none shrink-0 ${churchMissionEnabled
                ? "bg-blue-50/80 shadow-sm border border-blue-100"
                : "bg-gray-100/70 border border-transparent"
                }`}
            >
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full transition-colors shrink-0 ${churchMissionEnabled ? "bg-blue-600 animate-pulse" : "bg-gray-400"}`} />
                <span className={`text-xs font-bold transition-colors whitespace-nowrap ${churchMissionEnabled ? "text-blue-700" : "text-gray-500"}`}>
                  {churchMissionEnabled ? "노출 중" : "노출 안 함"}
                </span>
              </div>
              <Switch
                id="mission-toggle"
                checked={churchMissionEnabled}
                onCheckedChange={setChurchMissionEnabled}
                className="data-[state=checked]:bg-blue-600 data-[state=unchecked]:bg-gray-300 transition-colors duration-200"
              />
            </label>
          </div>
          <p className="text-xs text-slate-400 mb-4 font-medium leading-relaxed">
            선택 입력이에요. 성도 화면 <b>메뉴 &gt; 교회 소개</b>에 표시돼요.
          </p>
          <CustomLabelField
            id="mission-label-toggle"
            defaultLabel="MISSION"
            enabled={churchMissionLabelEnabled}
            onEnabledChange={setChurchMissionLabelEnabled}
            value={churchMissionLabel}
            onValueChange={setChurchMissionLabel}
          />
          <Textarea
            value={churchMission}
            onChange={(e) => setChurchMission(e.target.value.slice(0, 300))}
            placeholder="예: 예배와 말씀으로 세워진 성도들이 세상을 섬기게 한다"
            className="rounded-xl border-slate-200 bg-white text-sm min-h-[80px] resize-none"
          />
          <p className="text-[11px] text-slate-400 font-medium text-right mt-1">{churchMission.length} / 300자</p>
        </Card>

        <Card className="p-5 rounded-[1.75rem] border-0 bg-white shadow-xl shadow-blue-500/5 relative overflow-hidden">
          <div className="flex flex-col gap-3 mb-4">
            <div className="min-w-0">
              <h2 className="text-xl font-bold flex items-center gap-3 text-slate-800">
                <div className="w-2.5 h-8 bg-blue-600 rounded-full shrink-0" /> 섬기시는분 안내 설정
              </h2>
              <p className="text-xs text-slate-400 mt-1.5 font-medium leading-relaxed">
                성도 화면 우측 상단 <b>메뉴 &gt; 섬기시는 분</b> 화면에 표시돼요. 담임 목사는 맨 위에 크게, 부교역자는 그 아래 리스트로 나옵니다.
              </p>
              <p className="text-[11px] text-blue-500 mt-1 font-bold leading-relaxed flex items-center gap-1">
                <ImageIcon className="w-3 h-3 shrink-0" /> 사진은 정사각형(1:1)에 가까울수록 예쁘게 나와요 · 최소 600×600px 권장
              </p>
            </div>

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <label
                htmlFor="ministers-toggle"
                className={`flex items-center gap-3 py-2 px-4 rounded-full transition-all duration-300 cursor-pointer select-none shrink-0 ${ministersEnabled
                  ? "bg-blue-50/80 shadow-sm border border-blue-100"
                  : "bg-gray-100/70 border border-transparent"
                  }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full transition-colors shrink-0 ${ministersEnabled ? "bg-blue-600 animate-pulse" : "bg-gray-400"
                      }`}
                  />
                  <span
                    className={`text-xs font-bold transition-colors whitespace-nowrap ${ministersEnabled ? "text-blue-700" : "text-gray-500"
                      }`}
                  >
                    {ministersEnabled ? "주보에 표시 중" : "주보에서 숨김"}
                  </span>
                </div>
                <Switch
                  id="ministers-toggle"
                  checked={ministersEnabled}
                  onCheckedChange={setMinistersEnabled}
                  className="data-[state=checked]:bg-blue-600 data-[state=unchecked]:bg-gray-300 transition-colors duration-200"
                />
              </label>

              <Button onClick={addMinister} variant="outline" className="rounded-full border-dashed border-2 px-6 border-blue-200 text-blue-600 hover:bg-blue-50 font-bold text-xs h-10 shrink-0">
                <Plus className="w-4 h-4 mr-1.5" /> 부교역자 추가
              </Button>
            </div>
          </div>

          {/* ── 담임 목사 (별도 자리) ── */}
          <div className="mb-5 p-4 rounded-[1.5rem] border-2 border-blue-100 bg-blue-50/40">
            <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
              <span className="text-sm font-extrabold text-blue-800 flex items-center gap-1.5">
                <UserCheck className="w-4 h-4" /> 담임 목사
              </span>
              <label htmlFor="senior-pastor-toggle" className="flex items-center gap-2 cursor-pointer select-none">
                <span className={`text-[11px] font-bold whitespace-nowrap ${seniorPastorEnabled ? "text-blue-700" : "text-gray-400"}`}>
                  {seniorPastorEnabled ? "표시" : "숨김"}
                </span>
                <Switch
                  id="senior-pastor-toggle"
                  checked={seniorPastorEnabled}
                  onCheckedChange={setSeniorPastorEnabled}
                  className="data-[state=checked]:bg-blue-600 data-[state=unchecked]:bg-gray-300"
                />
              </label>
            </div>

            {seniorPastorEnabled && (
              <div className="space-y-2.5">
                <div className="flex items-start gap-3">
                  <input
                    type="file"
                    accept="image/png, image/jpeg, image/jpg, image/webp"
                    ref={seniorPastorInputRef}
                    onChange={handleSeniorPastorImageUpload}
                    className="hidden"
                  />
                  <div
                    onClick={() => seniorPastorInputRef.current?.click()}
                    className="w-16 h-16 rounded-xl bg-white border-2 border-dashed border-blue-300 flex items-center justify-center text-blue-500 overflow-hidden shrink-0 cursor-pointer hover:border-blue-500 transition-colors"
                    title="클릭하여 사진 선택"
                  >
                    {seniorPastor.photoUrl ? (
                      <img src={seniorPastor.photoUrl} alt="담임 목사" className="w-full h-full object-cover" />
                    ) : (
                      <Upload className="w-5 h-5" />
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 flex-1 min-w-0">
                    <Input
                      value={seniorPastor.role}
                      onChange={(e) => updateSeniorPastor("role", e.target.value)}
                      placeholder="직분 (예: 담임 목사)"
                      className="rounded-xl h-10 border-slate-200 bg-white text-sm font-bold"
                    />
                    <Input
                      value={seniorPastor.name}
                      onChange={(e) => updateSeniorPastor("name", e.target.value)}
                      placeholder="이름"
                      className="rounded-xl h-10 border-slate-200 bg-white text-sm font-bold text-blue-600"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    value={seniorPastor.phone}
                    onChange={(e) => {
                      if (seniorPastor.phoneFreeFormat) { updateSeniorPastor("phone", e.target.value); return; }
                      const raw = e.target.value.replace(/[^0-9]/g, "");
                      let f = raw;
                      if (raw.length > 3 && raw.length <= 7) f = `${raw.slice(0, 3)}-${raw.slice(3)}`;
                      else if (raw.length > 7) f = `${raw.slice(0, 3)}-${raw.slice(3, 7)}-${raw.slice(7, 11)}`;
                      updateSeniorPastor("phone", f);
                    }}
                    maxLength={seniorPastor.phoneFreeFormat ? 20 : 13}
                    placeholder={seniorPastor.phoneFreeFormat ? "연락처 (자유 입력)" : "연락처 (선택)"}
                    className="rounded-xl h-10 border-slate-200 bg-white text-sm font-bold flex-1"
                  />
                  <label htmlFor="senior-phone-free" className="flex items-center gap-1.5 cursor-pointer select-none shrink-0">
                    <Checkbox
                      id="senior-phone-free"
                      checked={seniorPastor.phoneFreeFormat}
                      onCheckedChange={() => updateSeniorPastor("phoneFreeFormat", !seniorPastor.phoneFreeFormat)}
                    />
                    <span className="text-[11px] font-bold text-slate-400 whitespace-nowrap">형식 자유</span>
                  </label>
                </div>
                <Textarea
                  value={seniorPastor.description}
                  onChange={(e) => updateSeniorPastor("description", e.target.value)}
                  placeholder="소개 문구 (선택)"
                  rows={2}
                  maxLength={120}
                  className="rounded-xl border-slate-200 bg-white text-sm font-medium resize-none"
                />
              </div>
            )}
          </div>

          {/* ── 부교역자 · 섬기는 분 리스트 ── */}
          <p className="text-xs font-extrabold text-slate-500 mb-2">부교역자 · 섬기는 분</p>
          {ministersEnabled && (
          <div className="space-y-3">
            {ministers.map((minister, index) => (
              <div key={minister.id} className="p-4 bg-slate-50/80 rounded-[1.5rem] border border-slate-100 hover:bg-white hover:shadow-md transition-all">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-y-2">
                  <div className="flex items-center gap-3 min-w-0 shrink-0">
                    {/* ref 콜백 함수가 불안정한 값을 반환하지 않고 명시적으로 처리되도록 수정 */}
                    <div className="relative group shrink-0">
                      <input
                        type="file"
                        accept="image/png, image/jpeg, image/jpg, image/webp"
                        ref={(el) => {
                          fileInputRefs.current[minister.id] = el;
                        }}
                        onChange={(e) => handleImageUpload(minister.id, e)}
                        className="hidden"
                      />
                      <div
                        onClick={() => fileInputRefs.current[minister.id]?.click()}
                        className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 overflow-hidden border-2 border-dashed border-blue-300 shadow-inner cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-all relative"
                        title="클릭하여 이미지 파일(png, jpeg 등) 선택"
                      >
                        {minister.photoUrl ? (
                          <img src={minister.photoUrl} alt="사역자 사진" className="w-full h-full object-cover" />
                        ) : (
                          <UserCheck className="w-5 h-5" />
                        )}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                          <Upload className="w-4 h-4" />
                        </div>
                      </div>
                      <span className="absolute -bottom-1 -right-1 bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full shadow pointer-events-none">사진</span>
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-extrabold text-slate-800 text-sm">사역자 #{index + 1}</h4>
                      <p className="text-xs text-slate-400 font-medium truncate">사진 클릭 시 파일 선택</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <label
                      htmlFor={`phone-free-${minister.id}`}
                      title="체크하면 010-0000-0000 형식 대신 숫자/하이픈을 자유롭게 직접 입력할 수 있어요 (0507 안심번호, 지역번호 등)"
                      className="flex items-center gap-1.5 cursor-pointer select-none"
                    >
                      <Checkbox
                        id={`phone-free-${minister.id}`}
                        checked={!!(minister as any).phoneFreeFormat}
                        onCheckedChange={() => toggleMinisterPhoneFreeFormat(minister.id)}
                      />
                      <span className="text-[11px] font-bold text-slate-400 whitespace-nowrap">번호 형식 자유</span>
                    </label>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeMinister(minister.id)}
                      className="text-slate-300 hover:text-red-500 rounded-full h-8 w-8 shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <Input
                    value={minister.role || ""}
                    onChange={(e) => updateMinister(minister.id, 'role', e.target.value)}
                    placeholder="직분 (예: 담임목사)"
                    className="rounded-xl h-11 border-slate-200 bg-white text-sm font-bold"
                  />
                  <Input
                    value={minister.name || ""}
                    onChange={(e) => updateMinister(minister.id, 'name', e.target.value)}
                    placeholder="이름 (예: 홍길동)"
                    className="rounded-xl h-11 border-slate-200 bg-white text-sm font-bold text-blue-600"
                  />
                  <div className="relative">
                    <Input
                      value={minister.phone || ""}
                      onChange={(e) => {
                        // 번호 형식 자유 체크 시: 자동 하이픈 포맷 없이 입력한 그대로 저장 (안심번호, 지역번호 등 대응)
                        if ((minister as any).phoneFreeFormat) {
                          updateMinister(minister.id, 'phone', e.target.value);
                          return;
                        }

                        const rawText = e.target.value.replace(/[^0-9]/g, "");
                        let formattedPhone = rawText;

                        if (rawText.length > 3 && rawText.length <= 7) {
                          formattedPhone = `${rawText.slice(0, 3)}-${rawText.slice(3)}`;
                        } else if (rawText.length > 7) {
                          formattedPhone = `${rawText.slice(0, 3)}-${rawText.slice(3, 7)}-${rawText.slice(7, 11)}`;
                        }

                        updateMinister(minister.id, 'phone', formattedPhone);
                      }}
                      maxLength={(minister as any).phoneFreeFormat ? 20 : 13}
                      placeholder={(minister as any).phoneFreeFormat ? "연락처 (자유 입력)" : "연락처 (숫자만 입력)"}
                      className="rounded-xl h-11 border-slate-200 bg-white text-sm font-bold"
                    />
                    <span className="absolute -top-2 right-3 bg-red-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full shadow-sm">연락처</span>
                    {(minister as any).phoneFreeFormat && (
                      <p className="text-[10px] text-slate-400 font-medium mt-1 px-0.5">가독성을 위해 하이픈도 같이 입력해보세요</p>
                    )}
                  </div>
                </div>

                <Textarea
                  value={(minister as any).description || ""}
                  onChange={(e) => updateMinister(minister.id, 'description', e.target.value)}
                  placeholder="소개 문구 (선택, 예: 성도들을 섬기는 마음으로 매일을 살아갑니다)"
                  rows={2}
                  maxLength={80}
                  className="rounded-xl border-slate-200 bg-white text-sm font-medium resize-none mt-2.5"
                />
              </div>
            ))}
          </div>
          )}
        </Card>

        {/* 담임목사 인사말(스탠다드 요금제 이상). 이름/사진은 위 "담임 목사" 자리를 그대로
            재사용한다 - 여기서는 인사말 문구/내용/연락처/이메일만 별도로 관리. */}
        <Card className="p-5 rounded-[1.75rem] border-0 bg-white shadow-xl shadow-blue-500/5 relative overflow-hidden">
          <div className="flex flex-col gap-3 mb-4">
            <div className="min-w-0">
              <h2 className="text-xl font-bold flex items-center gap-3 text-slate-800">
                <div className="w-2.5 h-8 bg-blue-600 rounded-full shrink-0" /> 담임목사 인사말
              </h2>
              <p className="text-xs text-slate-400 mt-1.5 font-medium leading-relaxed">
                성도 화면 <b>메뉴 &gt; 담임목사 인사말</b>에 표시돼요. 사진·이름은 위 "담임 목사" 정보를 그대로 가져다 써요.
              </p>
              {!hasStandardOrAbove && <TierLockBanner tierLabel={getPlanTierMeta("standard").label} />}
            </div>

            <label
              htmlFor="pastor-greeting-toggle"
              className={`flex items-center gap-3 py-2 px-4 rounded-full transition-all duration-300 cursor-pointer select-none self-start ${pastorGreetingEnabled
                ? "bg-blue-50/80 shadow-sm border border-blue-100"
                : "bg-gray-100/70 border border-transparent"
                }`}
            >
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full transition-colors shrink-0 ${pastorGreetingEnabled ? "bg-blue-600 animate-pulse" : "bg-gray-400"}`} />
                <span className={`text-xs font-bold transition-colors whitespace-nowrap ${pastorGreetingEnabled ? "text-blue-700" : "text-gray-500"}`}>
                  {pastorGreetingEnabled ? "주보에 표시 중" : "주보에서 숨김"}
                </span>
              </div>
              <Switch
                id="pastor-greeting-toggle"
                checked={pastorGreetingEnabled}
                onCheckedChange={setPastorGreetingEnabled}
                className="data-[state=checked]:bg-blue-600 data-[state=unchecked]:bg-gray-300 transition-colors duration-200"
              />
            </label>
          </div>

          {pastorGreetingEnabled && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">인사말 문구 (볼드체로 표시돼요)</label>
              <Input
                value={pastorGreeting.greetingText}
                onChange={(e) => updatePastorGreeting("greetingText", e.target.value)}
                placeholder="예: 사랑하는 성도 여러분, 환영합니다"
                className="rounded-xl h-11 border-slate-200 bg-white text-sm font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">간단한 내용</label>
              <Textarea
                value={pastorGreeting.content}
                onChange={(e) => updatePastorGreeting("content", e.target.value.slice(0, 500))}
                placeholder="성도들에게 전하고 싶은 짧은 인사말을 적어주세요."
                className="rounded-xl border-slate-200 bg-white text-sm min-h-[100px] resize-none"
              />
              <p className="text-[11px] text-slate-400 font-medium text-right mt-1">{pastorGreeting.content.length} / 500자</p>
            </div>

            <div className="p-4 rounded-[1.5rem] border border-slate-100 bg-slate-50/80 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <span className="text-xs font-extrabold text-slate-600">연락처 표시</span>
                <label htmlFor="pastor-phone-toggle" className="flex items-center gap-2 cursor-pointer select-none">
                  <span className={`text-[11px] font-bold whitespace-nowrap ${pastorGreeting.phoneSectionEnabled ? "text-blue-700" : "text-gray-400"}`}>
                    {pastorGreeting.phoneSectionEnabled ? "사용" : "사용 안 함"}
                  </span>
                  <Switch
                    id="pastor-phone-toggle"
                    checked={pastorGreeting.phoneSectionEnabled}
                    onCheckedChange={(v) => updatePastorGreeting("phoneSectionEnabled", v)}
                    className="data-[state=checked]:bg-blue-600 data-[state=unchecked]:bg-gray-300"
                  />
                </label>
              </div>

              {pastorGreeting.phoneSectionEnabled && (
                <div className="space-y-2.5">
                  <div className="relative">
                    <Input
                      value={pastorGreeting.churchPhone}
                      onChange={(e) => updatePastorGreeting("churchPhone", e.target.value)}
                      placeholder="교회 연락처 (선택, 입력을 권장해요)"
                      className="rounded-xl h-11 border-slate-200 bg-white text-sm font-bold"
                    />
                    <span className="absolute -top-2 right-3 bg-blue-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full shadow-sm">입력 권장</span>
                  </div>
                  <div>
                    <Input
                      value={pastorGreeting.personalPhone}
                      onChange={(e) => updatePastorGreeting("personalPhone", e.target.value)}
                      placeholder="개인 연락처 (선택)"
                      className="rounded-xl h-11 border-slate-200 bg-white text-sm font-bold"
                    />
                    <label htmlFor="personal-phone-hidden" className="flex items-center gap-1.5 cursor-pointer select-none mt-1.5 px-0.5">
                      <Checkbox
                        id="personal-phone-hidden"
                        checked={pastorGreeting.personalPhoneHidden}
                        onCheckedChange={(v) => updatePastorGreeting("personalPhoneHidden", !!v)}
                      />
                      <span className="text-[11px] font-bold text-slate-400">개인 전화번호 미표시하기 (체크하면 성도 화면에 숨겨져요)</span>
                    </label>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">이메일</label>
              <Input
                type="email"
                value={pastorGreeting.email}
                onChange={(e) => updatePastorGreeting("email", e.target.value)}
                placeholder="pastor@church.com"
                className="rounded-xl h-11 border-slate-200 bg-white text-sm font-bold"
              />
            </div>
          </div>
          )}
        </Card>

        {/* 중직자(장로/권사/안수집사 등) 소개 - 부교역자와 별개 리스트. 연락처/소개글 없이
            사진·직위·이름·담당만 관리한다. 메뉴 > 섬기시는 분 > 중직자 화면에 표시. */}
        <Card className="p-5 rounded-[1.75rem] border-0 bg-white shadow-xl shadow-blue-500/5 relative overflow-hidden">
          <div className="flex flex-col gap-3 mb-4">
            <div className="min-w-0">
              <h2 className="text-xl font-bold flex items-center gap-3 text-slate-800">
                <div className="w-2.5 h-8 bg-blue-600 rounded-full shrink-0" /> 중직자 소개
              </h2>
              <p className="text-xs text-slate-400 mt-1.5 font-medium leading-relaxed">
                성도 화면 우측 상단 <b>메뉴 &gt; 섬기시는 분 &gt; 중직자</b> 화면에 표시돼요. 시무 장로·권사·안수집사 등을 소개할 때 써보세요.
              </p>
              <p className="text-[11px] text-blue-500 mt-1 font-bold leading-relaxed flex items-center gap-1">
                <ImageIcon className="w-3 h-3 shrink-0" /> 사진은 정사각형(1:1)에 가까울수록 예쁘게 나와요 · 최소 600×600px 권장
              </p>
            </div>

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <label
                htmlFor="officers-toggle"
                className={`flex items-center gap-3 py-2 px-4 rounded-full transition-all duration-300 cursor-pointer select-none shrink-0 ${officersEnabled
                  ? "bg-blue-50/80 shadow-sm border border-blue-100"
                  : "bg-gray-100/70 border border-transparent"
                  }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full transition-colors shrink-0 ${officersEnabled ? "bg-blue-600 animate-pulse" : "bg-gray-400"
                      }`}
                  />
                  <span
                    className={`text-xs font-bold transition-colors whitespace-nowrap ${officersEnabled ? "text-blue-700" : "text-gray-500"
                      }`}
                  >
                    {officersEnabled ? "주보에 표시 중" : "주보에서 숨김"}
                  </span>
                </div>
                <Switch
                  id="officers-toggle"
                  checked={officersEnabled}
                  onCheckedChange={setOfficersEnabled}
                  className="data-[state=checked]:bg-blue-600 data-[state=unchecked]:bg-gray-300 transition-colors duration-200"
                />
              </label>

              <Button onClick={addOfficer} variant="outline" className="rounded-full border-dashed border-2 px-6 border-blue-200 text-blue-600 hover:bg-blue-50 font-bold text-xs h-10 shrink-0">
                <Plus className="w-4 h-4 mr-1.5" /> 중직자 추가
              </Button>
            </div>
          </div>

          {officersEnabled && (
          <div className="space-y-3">
            {officers.map((officer, index) => (
              <div key={officer.id} className="p-4 bg-slate-50/80 rounded-[1.5rem] border border-slate-100 hover:bg-white hover:shadow-md transition-all">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-y-2">
                  <div className="flex items-center gap-3 min-w-0 shrink-0">
                    <div className="relative group shrink-0">
                      <input
                        type="file"
                        accept="image/png, image/jpeg, image/jpg, image/webp"
                        ref={(el) => {
                          officerFileInputRefs.current[officer.id] = el;
                        }}
                        onChange={(e) => handleOfficerImageUpload(officer.id, e)}
                        className="hidden"
                      />
                      <div
                        onClick={() => officerFileInputRefs.current[officer.id]?.click()}
                        className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 overflow-hidden border-2 border-dashed border-blue-300 shadow-inner cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-all relative"
                        title="클릭하여 이미지 파일(png, jpeg 등) 선택"
                      >
                        {officer.photoUrl ? (
                          <img src={officer.photoUrl} alt="중직자 사진" className="w-full h-full object-cover" />
                        ) : (
                          <UserCheck className="w-5 h-5" />
                        )}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                          <Upload className="w-4 h-4" />
                        </div>
                      </div>
                      <span className="absolute -bottom-1 -right-1 bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full shadow pointer-events-none">사진</span>
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-extrabold text-slate-800 text-sm">중직자 #{index + 1}</h4>
                      <p className="text-xs text-slate-400 font-medium truncate">사진 클릭 시 파일 선택</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeOfficer(officer.id)}
                    className="text-slate-300 hover:text-red-500 rounded-full h-8 w-8 shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <Input
                    value={officer.position || ""}
                    onChange={(e) => updateOfficer(officer.id, 'position', e.target.value)}
                    placeholder="직위 (예: 시무 장로)"
                    className="rounded-xl h-11 border-slate-200 bg-white text-sm font-bold"
                  />
                  <Input
                    value={officer.name || ""}
                    onChange={(e) => updateOfficer(officer.id, 'name', e.target.value)}
                    placeholder="이름 (예: 홍길동)"
                    className="rounded-xl h-11 border-slate-200 bg-white text-sm font-bold text-blue-600"
                  />
                  <Input
                    value={officer.duty || ""}
                    onChange={(e) => updateOfficer(officer.id, 'duty', e.target.value)}
                    placeholder="담당 (예: 교육위원회)"
                    className="rounded-xl h-11 border-slate-200 bg-white text-sm font-bold"
                  />
                </div>
              </div>
            ))}
          </div>
          )}
        </Card>

        <Card className="p-5 rounded-[1.75rem] border-0 bg-white shadow-xl shadow-blue-500/5 relative overflow-hidden">
          <div className="flex flex-col gap-3 mb-4">
            <div className="min-w-0 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-xl font-bold flex items-center gap-3 text-slate-800">
                  <div className="w-2.5 h-8 bg-blue-600 rounded-full shrink-0" /> 오시는 길
                </h2>
                <p className="text-xs text-slate-400 mt-1.5 font-medium leading-relaxed">위치 안내 이미지를 올리면 주보에 그대로 표시돼요.</p>
                <p className="text-[11px] text-blue-500 mt-1 font-bold leading-relaxed flex items-center gap-1">
                  <ImageIcon className="w-3 h-3 shrink-0" /> 권장 크기: 가로·세로 중 긴 쪽 기준 최소 720px 이상
                </p>
              </div>

              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    title="도움말"
                    className="w-6 h-6 rounded-full border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-300 flex items-center justify-center shrink-0 transition-colors"
                  >
                    <Info className="w-3.5 h-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-64 rounded-2xl border-0 shadow-xl p-4">
                  <p className="font-bold text-slate-800 text-sm mb-1">가지고 있는 이미지가 없다면?</p>
                  <p className="text-xs text-slate-500 leading-relaxed">네이버 지도 등에서 우리 교회 위치를 검색한 화면을 캡처해서 올려도 좋아요. 그대로 위치 안내 이미지로 쓸 수 있어요.</p>
                </PopoverContent>
              </Popover>
            </div>

            <label
              htmlFor="address-toggle"
              className={`flex items-center gap-3 py-2 px-4 rounded-full transition-all duration-300 cursor-pointer select-none self-start ${addressEnabled
                ? "bg-blue-50/80 shadow-sm border border-blue-100"
                : "bg-gray-100/70 border border-transparent"
                }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full transition-colors shrink-0 ${addressEnabled ? "bg-blue-600 animate-pulse" : "bg-gray-400"
                    }`}
                />
                <span
                  className={`text-xs font-bold transition-colors whitespace-nowrap ${addressEnabled ? "text-blue-700" : "text-gray-500"
                    }`}
                >
                  {addressEnabled ? "주보에 표시 중" : "주보에서 숨김"}
                </span>
              </div>
              <Switch
                id="address-toggle"
                checked={addressEnabled}
                onCheckedChange={setAddressEnabled}
                className="data-[state=checked]:bg-blue-600 data-[state=unchecked]:bg-gray-300 transition-colors duration-200"
              />
            </label>
          </div>

          {addressEnabled && (
            <div className="flex flex-col md:flex-row md:items-start gap-3 md:gap-4">
              {/* 이미지 업로드/미리보기 - 모바일은 하단(기존과 동일), PC는 좌측 4:3 고정폭 */}
              <div className="order-2 md:order-1 md:w-52 shrink-0 space-y-2">
                <input
                  type="file"
                  accept="image/png, image/jpeg, image/jpg, image/webp"
                  ref={locationImageInputRef}
                  onChange={handleLocationImageUpload}
                  className="hidden"
                />

                {locationImage ? (
                  <>
                    <div className="relative">
                      <div className={`w-full rounded-xl overflow-hidden border border-slate-200 bg-slate-50 ${locationImageRatio === "1:1" ? "aspect-square" : "aspect-[4/3]"}`}>
                        <img src={locationImage} alt="위치 안내 이미지" className="w-full h-full object-cover" />
                      </div>
                      <button
                        type="button"
                        onClick={() => setLocationImage("")}
                        className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center transition-colors"
                        title="이미지 삭제"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setLocationImageRatio("4:3")}
                          className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 ${locationImageRatio === "4:3" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
                        >
                          가로형 4:3
                        </button>
                        <button
                          type="button"
                          onClick={() => setLocationImageRatio("1:1")}
                          className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 ${locationImageRatio === "1:1" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
                        >
                          정사각형 1:1
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => locationImageInputRef.current?.click()}
                        className="text-xs font-bold text-blue-600 hover:text-blue-700 shrink-0"
                      >
                        교체
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => locationImageInputRef.current?.click()}
                    className="w-full aspect-[4/3] md:aspect-auto md:h-32 rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/40 hover:bg-blue-50 hover:border-blue-300 transition-all flex flex-col items-center justify-center gap-1.5 text-blue-500"
                  >
                    <ImageIcon className="w-6 h-6" />
                    <span className="text-xs font-bold">위치 안내 이미지 업로드</span>
                    <span className="text-[10px] text-blue-400 text-center px-2">네이버 지도 캡처, 오시는 길 안내도 등 · 최소 720px 권장</span>
                  </button>
                )}
              </div>

              {/* 주소 입력 - 모바일은 상단(기존과 동일), PC는 이미지 우측 */}
              <div className="order-1 md:order-2 flex-1 min-w-0 space-y-2.5">
                <span className="hidden md:block text-[11px] font-black text-blue-600 uppercase tracking-wider">주소</span>
                <button
                  type="button"
                  onClick={handleAddressSearch}
                  className="w-full flex items-center gap-2.5 px-4 h-12 rounded-xl border border-slate-200 bg-slate-50/80 hover:bg-white hover:border-blue-300 transition-all text-left"
                >
                  <MapPin className="w-4 h-4 text-blue-600 shrink-0" />
                  <span className={`text-sm font-bold truncate ${churchAddress ? "text-slate-800" : "text-slate-400"}`}>
                    {churchAddress || "주소 검색하기"}
                  </span>
                </button>
                <Input
                  value={churchAddressDetail}
                  onChange={(e) => setChurchAddressDetail(e.target.value)}
                  placeholder="상세 주소나 교회 이름 (예: 2층 예배실)"
                  className="rounded-xl h-11 border-slate-200 bg-white text-sm font-bold"
                />
              </div>
            </div>
          )}
        </Card>

        {/* 교회 SNS · 유튜브 - 메뉴 > 교회 SNS·유튜브 화면에 쓰인다. 각 링크는 비워두면
            그 항목만 안 보이고, 유튜브는 oEmbed로 채널 썸네일을 못 가져오기 때문에
            썸네일만 관리자가 직접 올리고 채널명은 서버에서 자동으로 가져온다. */}
        <Card className="p-5 rounded-[1.75rem] border-0 bg-white shadow-xl shadow-blue-500/5 relative overflow-hidden">
          <div className="flex flex-col gap-3 mb-4">
            <div className="min-w-0">
              <h2 className="text-xl font-bold flex items-center gap-3 text-slate-800">
                <div className="w-2.5 h-8 bg-blue-600 rounded-full shrink-0" /> 교회 SNS · 유튜브
              </h2>
              <p className="text-xs text-slate-400 mt-1.5 font-medium leading-relaxed">
                성도 화면 우측 상단 <b>메뉴 &gt; 교회 SNS·유튜브</b> 화면에 표시돼요. 비워두면 그 항목만 안 보여요.
              </p>
            </div>

            <label
              htmlFor="sns-toggle"
              className={`flex items-center gap-3 py-2 px-4 rounded-full transition-all duration-300 cursor-pointer select-none self-start ${snsEnabled
                ? "bg-blue-50/80 shadow-sm border border-blue-100"
                : "bg-gray-100/70 border border-transparent"
                }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full transition-colors shrink-0 ${snsEnabled ? "bg-blue-600 animate-pulse" : "bg-gray-400"
                    }`}
                />
                <span
                  className={`text-xs font-bold transition-colors whitespace-nowrap ${snsEnabled ? "text-blue-700" : "text-gray-500"
                    }`}
                >
                  {snsEnabled ? "주보에 표시 중" : "주보에서 숨김"}
                </span>
              </div>
              <Switch
                id="sns-toggle"
                checked={snsEnabled}
                onCheckedChange={setSnsEnabled}
                className="data-[state=checked]:bg-blue-600 data-[state=unchecked]:bg-gray-300 transition-colors duration-200"
              />
            </label>
          </div>

          {snsEnabled && (
            <div className="space-y-5">
              <div className="space-y-2.5">
                <span className="text-[11px] font-black text-blue-600 uppercase tracking-wider">SNS 링크</span>

                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-[#03C75A]/10">
                    <BookOpen className="w-5 h-5 text-[#03C75A]" />
                  </div>
                  <Input
                    value={snsNaverBlog}
                    onChange={(e) => setSnsNaverBlog(e.target.value)}
                    placeholder="네이버 블로그 주소 (예: https://blog.naver.com/...)"
                    className="rounded-xl h-11 border-slate-200 bg-white text-sm font-bold"
                  />
                </div>

                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-pink-50">
                    <Instagram className="w-5 h-5 text-pink-500" />
                  </div>
                  <Input
                    value={snsInstagram}
                    onChange={(e) => setSnsInstagram(e.target.value)}
                    placeholder="인스타그램 주소 (예: https://instagram.com/...)"
                    className="rounded-xl h-11 border-slate-200 bg-white text-sm font-bold"
                  />
                </div>

                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-slate-900/5">
                    <AtSign className="w-5 h-5 text-slate-800" />
                  </div>
                  <Input
                    value={snsThreads}
                    onChange={(e) => setSnsThreads(e.target.value)}
                    placeholder="쓰레드 주소 (예: https://threads.net/...)"
                    className="rounded-xl h-11 border-slate-200 bg-white text-sm font-bold"
                  />
                </div>
              </div>

              <div className="h-px bg-slate-100" />

              <div className="space-y-2.5">
                <span className="text-[11px] font-black text-red-500 uppercase tracking-wider">유튜브 채널</span>

                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center shrink-0">
                    <Youtube className="w-5 h-5 text-red-500" />
                  </div>
                  <Input
                    value={youtubeChannelUrl}
                    onChange={(e) => setYoutubeChannelUrl(e.target.value)}
                    onBlur={(e) => handleYoutubeChannelUrlBlur(e.target.value)}
                    placeholder="유튜브 채널 주소 (예: https://youtube.com/@교회이름)"
                    className="rounded-xl h-11 border-slate-200 bg-white text-sm font-bold"
                  />
                </div>

                {youtubeChannelUrl.trim() && (
                  <div className="flex gap-3 items-start pl-[50px]">
                    <div className="shrink-0">
                      <input
                        type="file"
                        accept="image/png, image/jpeg, image/jpg, image/webp"
                        ref={youtubeThumbnailInputRef}
                        onChange={handleYoutubeThumbnailUpload}
                        className="hidden"
                      />
                      {youtubeChannelThumbnail ? (
                        <div className="relative w-16 h-16">
                          <div className="w-16 h-16 rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                            <img src={youtubeChannelThumbnail} alt="채널 썸네일" className="w-full h-full object-cover" />
                          </div>
                          <button
                            type="button"
                            onClick={() => setYoutubeChannelThumbnail("")}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center"
                            title="썸네일 삭제"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => youtubeThumbnailInputRef.current?.click()}
                          className="w-16 h-16 rounded-xl border-2 border-dashed border-red-200 bg-red-50/40 hover:bg-red-50 hover:border-red-300 transition-all flex items-center justify-center text-red-400"
                          title="썸네일 업로드"
                        >
                          <ImageIcon className="w-5 h-5" />
                        </button>
                      )}
                    </div>

                    <div className="flex-1 min-w-0 space-y-1.5">
                      <Input
                        value={youtubeChannelName}
                        onChange={(e) => setYoutubeChannelName(e.target.value)}
                        placeholder="채널명"
                        className="rounded-xl h-10 border-slate-200 bg-white text-sm font-bold"
                      />
                      <p className="text-[11px] font-medium text-slate-400 leading-relaxed pl-1">
                        {fetchingChannelName
                          ? "채널명 불러오는 중..."
                          : "링크 입력 후 다른 곳을 누르면 채널명을 자동으로 가져와요. 썸네일은 직접 올려주세요."}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>
      )}

      {activeTab === "sharing" && (
      <div className="container mx-auto px-4 py-6 max-w-4xl space-y-5">
        <Card className="p-5 rounded-[1.75rem] border-0 bg-white shadow-xl shadow-blue-500/5">
          <div className="flex items-center justify-between gap-3 mb-1.5 flex-wrap">
            <h2 className="text-xl font-bold flex items-center gap-3 text-slate-800">
              <div className="w-2.5 h-8 bg-blue-600 rounded-full shrink-0" /> 말씀 적용 질문
            </h2>
            <label
              htmlFor="sharing-toggle"
              className={`flex items-center gap-3 py-2 px-4 rounded-full transition-all duration-300 cursor-pointer select-none shrink-0 ${sharingEnabled
                ? "bg-blue-50/80 shadow-sm border border-blue-100"
                : "bg-gray-100/70 border border-transparent"
                }`}
            >
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full transition-colors shrink-0 ${sharingEnabled ? "bg-blue-600 animate-pulse" : "bg-gray-400"}`} />
                <span className={`text-xs font-bold transition-colors whitespace-nowrap ${sharingEnabled ? "text-blue-700" : "text-gray-500"}`}>
                  {sharingEnabled ? "노출 중" : "노출 안 함"}
                </span>
              </div>
              <Switch
                id="sharing-toggle"
                checked={sharingEnabled}
                onCheckedChange={setSharingEnabled}
                className="data-[state=checked]:bg-blue-600 data-[state=unchecked]:bg-gray-300 transition-colors duration-200"
              />
            </label>
          </div>
          <p className="text-xs text-slate-400 mb-4 font-medium leading-relaxed">
            셀모임·구역모임·소그룹 등 나눔 시간에 쓸 말씀 적용 질문이에요. 성도 화면의 "섬기는 사람들" 바로 위에 표시됩니다.
          </p>

          {/* 새 질문 추가 폼 */}
          <div className="space-y-3 p-4 bg-slate-50/70 rounded-2xl border border-slate-100">
            <div>
              <Label className="text-xs font-bold text-slate-600 mb-1.5 block">질문 제목</Label>
              <Input
                value={newQuestionTitle}
                onChange={(e) => setNewQuestionTitle(e.target.value)}
                placeholder="예: 1. 믿음과 삶에 대하여"
                className="rounded-xl h-11 border-slate-200 bg-white text-sm font-bold"
              />
            </div>
            <div>
              <Label className="text-xs font-bold text-slate-600 mb-1.5 block">핵심 인용구 (선택사항)</Label>
              <div className="relative">
                <Quote className="w-4 h-4 text-slate-300 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <Input
                  value={newQuestionQuote}
                  onChange={(e) => setNewQuestionQuote(e.target.value)}
                  placeholder="질문의 중심이 되는 말씀을 적어주세요"
                  className="rounded-xl h-11 border-slate-200 bg-white text-sm pl-10"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs font-bold text-slate-600 mb-1.5 block">상세 질문 내용</Label>
              <Textarea
                value={newQuestionContent}
                onChange={(e) => setNewQuestionContent(e.target.value)}
                placeholder="성도들이 깊이 묵상할 수 있는 질문을 입력하세요"
                rows={3}
                className="rounded-xl border-slate-200 bg-white text-sm resize-none"
              />
            </div>
            <Button onClick={addSharingQuestion} className="w-full rounded-xl h-12 bg-blue-600 hover:bg-blue-700 text-white font-bold">
              <Plus className="w-4 h-4 mr-1.5" /> 질문 리스트 추가
            </Button>
          </div>

          {/* 질문 리스트: PC는 드래그(그립 아이콘) + 버튼, 모바일은 버튼만으로 순서 변경 */}
          {sharingQuestions.length > 0 && (
            <div className="space-y-3 mt-5">
              {sharingQuestions.map((q, index) => (
                <div
                  key={q.id}
                  draggable={editingQuestionId !== q.id}
                  onDragStart={() => handleQuestionDragStart(index)}
                  onDragOver={(e) => handleQuestionDragOver(index, e)}
                  onDragEnd={handleQuestionDragEnd}
                  className="p-4 bg-slate-50/70 rounded-2xl border border-slate-100 hover:bg-white hover:shadow-md transition-all"
                >
                  <div className="flex items-center justify-between mb-2.5 gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <GripVertical className="w-4 h-4 text-slate-300 shrink-0 hidden md:block cursor-grab" />
                      <span className="text-[11px] font-black text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full shrink-0">
                        Question {index + 1}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={index === 0}
                        onClick={() => moveSharingQuestion(index, 'up')}
                        className="h-7 w-7 rounded-md bg-white border border-gray-200 shadow-sm"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={index === sharingQuestions.length - 1}
                        onClick={() => moveSharingQuestion(index, 'down')}
                        className="h-7 w-7 rounded-md bg-white border border-gray-200 shadow-sm"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditingQuestionId(editingQuestionId === q.id ? null : q.id)}
                        className={`h-7 w-7 rounded-md border shadow-sm ${editingQuestionId === q.id ? 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700' : 'bg-white border-gray-200 text-slate-500'}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeSharingQuestion(q.id)}
                        className="text-gray-300 hover:text-red-500 rounded-full h-7 w-7"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {editingQuestionId === q.id ? (
                    <div className="space-y-2.5">
                      <Input
                        value={q.title}
                        onChange={(e) => updateSharingQuestion(q.id, 'title', e.target.value)}
                        placeholder="질문 제목"
                        className="rounded-xl h-10 border-slate-200 bg-white text-sm font-bold"
                      />
                      <div className="relative">
                        <Quote className="w-4 h-4 text-slate-300 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <Input
                          value={q.quote}
                          onChange={(e) => updateSharingQuestion(q.id, 'quote', e.target.value)}
                          placeholder="핵심 인용구 (선택사항)"
                          className="rounded-xl h-10 border-slate-200 bg-white text-sm pl-10"
                        />
                      </div>
                      <Textarea
                        value={q.content}
                        onChange={(e) => updateSharingQuestion(q.id, 'content', e.target.value)}
                        placeholder="상세 질문 내용"
                        rows={3}
                        className="rounded-xl border-slate-200 bg-white text-sm resize-none"
                      />
                      <Button onClick={() => setEditingQuestionId(null)} size="sm" className="w-full rounded-xl h-10 bg-slate-800 hover:bg-slate-900 text-white font-bold text-sm">
                        완료
                      </Button>
                    </div>
                  ) : (
                    <div>
                      <h4 className="font-extrabold text-slate-800 text-sm mb-1 break-keep">{q.title || "제목 없음"}</h4>
                      {q.quote && (
                        <p className="text-xs text-blue-600 font-semibold mb-1 flex items-start gap-1 break-keep">
                          <Quote className="w-3 h-3 shrink-0 mt-0.5" /> {q.quote}
                        </p>
                      )}
                      {q.content && (
                        <p className="text-xs text-slate-500 leading-relaxed whitespace-pre-line break-keep">{q.content}</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* 목회 칼럼(프로 요금제 이상, 이미지는 올인원 이상) - 주보와 무관하게 authorId별로
            누적되는 별도 컬렉션(pastoralColumns). 여기서 추가/수정/삭제는 "저장하기"/"발행하기"
            버튼과 무관하게 즉시 Firestore에 반영된다. */}
        <Card className="p-5 rounded-[1.75rem] border-0 bg-white shadow-xl shadow-blue-500/5">
          <div className="flex items-center justify-between gap-3 mb-1.5 flex-wrap">
            <h2 className="text-xl font-bold flex items-center gap-3 text-slate-800">
              <div className="w-2.5 h-8 bg-emerald-500 rounded-full shrink-0" /> 목회 칼럼
            </h2>
            <label
              htmlFor="pastoral-columns-toggle"
              className={`flex items-center gap-3 py-2 px-4 rounded-full transition-all duration-300 cursor-pointer select-none shrink-0 ${pastoralColumnsEnabled
                ? "bg-blue-50/80 shadow-sm border border-blue-100"
                : "bg-gray-100/70 border border-transparent"
                }`}
            >
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full transition-colors shrink-0 ${pastoralColumnsEnabled ? "bg-blue-600 animate-pulse" : "bg-gray-400"}`} />
                <span className={`text-xs font-bold transition-colors whitespace-nowrap ${pastoralColumnsEnabled ? "text-blue-700" : "text-gray-500"}`}>
                  {pastoralColumnsEnabled ? "주보에 표시 중" : "주보에서 숨김"}
                </span>
              </div>
              <Switch
                id="pastoral-columns-toggle"
                checked={pastoralColumnsEnabled}
                onCheckedChange={setPastoralColumnsEnabled}
                className="data-[state=checked]:bg-blue-600 data-[state=unchecked]:bg-gray-300 transition-colors duration-200"
              />
            </label>
          </div>
          <p className="text-xs text-slate-400 mb-1 font-medium leading-relaxed">
            성도 화면 하단과 <b>메뉴 &gt; 목회 칼럼</b>에 표시돼요. 이번 주보 발행과 무관하게, 등록하는 즉시 저장돼요.
          </p>
          {!hasProOrAbove && <TierLockBanner tierLabel={getPlanTierMeta("pro").label} />}
          {hasProOrAbove && !hasAllInOne && (
            <p className="text-[11px] text-indigo-500 font-semibold mt-2 leading-relaxed flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              이미지 첨부는 {getPlanTierMeta("allinone").label} 요금제부터 가능해요. 지금은 텍스트만 표시돼요.
            </p>
          )}

          {/* 작성/수정 폼 */}
          <div className="mt-4 p-4 rounded-[1.5rem] border border-slate-100 bg-slate-50/80 space-y-3">
            <p className="text-xs font-extrabold text-slate-600">{editingColumnId ? "칼럼 수정" : "새 칼럼 작성"}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <DatePickerField
                value={columnDraft.date}
                onChange={(v) => setColumnDraft((d) => ({ ...d, date: v }))}
              />
              <Input
                value={columnDraft.author}
                onChange={(e) => setColumnDraft((d) => ({ ...d, author: e.target.value }))}
                placeholder="작성자 (예: 김OO 목사)"
                className="rounded-xl h-12 border-slate-200 bg-white text-sm font-bold"
              />
            </div>
            <Input
              value={columnDraft.title}
              onChange={(e) => setColumnDraft((d) => ({ ...d, title: e.target.value }))}
              placeholder="제목"
              className="rounded-xl h-11 border-slate-200 bg-white text-sm font-bold"
            />
            <Textarea
              value={columnDraft.content}
              onChange={(e) => setColumnDraft((d) => ({ ...d, content: e.target.value }))}
              placeholder="내용을 입력하세요."
              rows={5}
              className="rounded-xl border-slate-200 bg-white text-sm resize-none"
            />
            {hasAllInOne && (
              <div>
                <input
                  type="file"
                  accept="image/png, image/jpeg, image/jpg, image/webp"
                  ref={columnImageInputRef}
                  onChange={handleColumnImageUpload}
                  className="hidden"
                />
                {columnDraft.imageUrl ? (
                  <div className="relative w-full rounded-xl overflow-hidden border border-slate-200">
                    <img src={columnDraft.imageUrl} alt="목회 칼럼 이미지" className="w-full h-40 object-cover" />
                    <button
                      type="button"
                      onClick={() => setColumnDraft((d) => ({ ...d, imageUrl: "" }))}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => columnImageInputRef.current?.click()}
                    className="w-full h-16 rounded-xl border-2 border-dashed border-slate-300 text-slate-400 hover:border-blue-400 hover:text-blue-500 flex items-center justify-center gap-2 text-xs font-bold transition-colors"
                  >
                    <Upload className="w-4 h-4" /> 이미지 추가 (선택)
                  </button>
                )}
              </div>
            )}
            <div className="flex items-center gap-2">
              <Button
                onClick={handleSaveColumn}
                disabled={savingColumn}
                className="flex-1 rounded-xl h-11 font-bold bg-blue-600 hover:bg-blue-700 text-white"
              >
                {savingColumn ? "저장 중..." : editingColumnId ? "수정 저장" : "칼럼 등록"}
              </Button>
              {editingColumnId && (
                <Button variant="outline" onClick={resetColumnDraft} className="rounded-xl h-11 font-bold">
                  취소
                </Button>
              )}
            </div>
          </div>

          {/* 지난 목록 */}
          <div className="mt-5 space-y-2.5">
            <p className="text-xs font-extrabold text-slate-500">지난 목회 칼럼 ({columns.length})</p>
            {columnsLoading ? (
              <p className="text-center text-slate-400 text-xs font-medium py-6">불러오는 중...</p>
            ) : columns.length === 0 ? (
              <p className="text-center text-slate-400 text-xs font-medium py-6">아직 등록된 목회 칼럼이 없어요.</p>
            ) : (
              columns.map((col) => (
                <div key={col.id} className="p-4 bg-white rounded-2xl border border-slate-100 flex items-start justify-between gap-3 hover:shadow-md transition-all">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-slate-400 font-bold">{col.date} · {col.author || "작성자 미입력"}</p>
                    <p className="font-extrabold text-slate-800 text-sm mt-0.5 truncate">{col.title}</p>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2 whitespace-pre-line break-keep">{col.content}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" onClick={() => startEditColumn(col)} className="h-8 w-8 rounded-full text-slate-400 hover:text-blue-600">
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDeleteColumn(col.id)} className="h-8 w-8 rounded-full text-slate-300 hover:text-red-500">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
      )}

      {activeTab === "design" && (
      <div className="container mx-auto px-4 py-6 max-w-5xl">
        <div className="flex flex-col lg:flex-row gap-5 lg:items-start">
          {/* 왼쪽: 템플릿 선택 */}
          <Card className="flex-1 min-w-0 p-5 rounded-[1.75rem] border-0 bg-white shadow-xl shadow-blue-500/5">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <h2 className="text-xl font-bold flex items-center gap-3 text-slate-800">
                <div className="w-2.5 h-8 bg-purple-500 rounded-full shrink-0" /> 커스텀 디자인
              </h2>
              <a
                href="https://bulletin.stayon-platform.com/pricing"
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-bold px-3.5 py-2 transition-colors"
              >
                요금제 보기 <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
            <p className="text-xs text-slate-400 mt-1.5 mb-4 font-medium leading-relaxed">
              디자인을 고르면 성도들이 보는 주보 화면 전체 모습이 바뀌어요. 오른쪽 휴대폰 화면에서 예시 주보로 미리 볼 수 있어요.
              (입력해두신 내용은 그대로, 겉모습만 바뀝니다.)
            </p>

            <p className="text-[11px] text-purple-600/90 font-medium mt-3 mb-3 leading-relaxed flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {customDesignFreePeriod
                ? '커스텀 디자인은 원래 프로 요금제 전용이지만, 지금은 오픈 기간이라 모든 디자인을 무료로 쓸 수 있어요. 유료화 이후 프로 요금제가 아니면 성도 화면은 자동으로 "기본" 디자인으로 표시돼요.'
                : '"기본"은 언제나 무료예요. 그 외 디자인은 프로 요금제 전용이며, 프로 요금제 사용 시 적용할 수 있어요.'}
            </p>

            <div className="space-y-3">
              {BULLETIN_TEMPLATES.map((tpl, i) => {
                const isApplied = (bulletinTemplate || DEFAULT_BULLETIN_TEMPLATE_ID) === tpl.id;
                const isPreviewing = (previewTemplateId || DEFAULT_BULLETIN_TEMPLATE_ID) === tpl.id;
                const comingSoon = !!tpl.comingSoon;
                const unlocked = !comingSoon && isTemplateUnlocked(tpl.id);
                const showComingSoonHeader = comingSoon && !BULLETIN_TEMPLATES[i - 1]?.comingSoon;
                return (
                  <div key={tpl.id}>
                    {showComingSoonHeader && (
                      <div className="flex items-center gap-2 pt-3 pb-1">
                        <span className="text-[11px] font-black tracking-wider text-slate-400 uppercase">Coming Soon</span>
                        <span className="h-px flex-1 bg-slate-100" />
                        <span className="text-[10px] font-bold text-slate-400">준비 중인 디자인</span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewTemplateId(tpl.id); // 잠겨 있어도/준비 중이어도 오른쪽 미리보기 영역은 전환
                        if (unlocked) setBulletinTemplate(tpl.id);
                      }}
                      className={`relative w-full text-left rounded-2xl border-2 p-4 transition-all cursor-pointer ${
                        isApplied ? "border-blue-500 ring-2 ring-blue-200 bg-blue-50/40"
                          : isPreviewing ? "border-purple-300 bg-purple-50/40"
                          : comingSoon ? "border-slate-200 bg-slate-50/60 hover:border-slate-300"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <div className={`flex items-center gap-3 mb-2 ${comingSoon ? "opacity-70" : ""}`}>
                        <div className="w-10 h-10 rounded-xl border border-slate-200 shrink-0 flex items-center justify-center" style={{ backgroundColor: tpl.swatch }}>
                          {isApplied
                            ? <Check className="w-4 h-4 stroke-[3px]" style={{ color: tpl.id === "default" ? "#fff" : tpl.accent }} />
                            : comingSoon
                            ? <Lock className="w-3.5 h-3.5" style={{ color: tpl.accent }} />
                            : <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: tpl.accent }} />}
                        </div>
                        <span className={`font-bold text-sm ${isApplied ? "text-blue-700" : "text-slate-700"}`}>{tpl.label}</span>
                        {isApplied
                          ? <span className="ml-auto shrink-0 whitespace-nowrap text-[10px] font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">적용됨</span>
                          : comingSoon
                          ? <span className="ml-auto shrink-0 inline-flex items-center gap-1 whitespace-nowrap text-[10px] font-bold text-slate-500 bg-slate-200/80 px-2 py-0.5 rounded-full"><Lock className="w-2.5 h-2.5" /> 준비중</span>
                          : isPreviewing && <span className="ml-auto shrink-0 whitespace-nowrap text-[10px] font-bold text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full">미리보는 중</span>}
                      </div>
                      <p className={`text-xs text-slate-400 font-medium leading-relaxed ${comingSoon ? "opacity-70" : ""}`}>{tpl.description}</p>
                      {!unlocked && !comingSoon && (
                        <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold px-2 py-1">
                          <Lock className="w-3 h-3" /> 프로 요금제 전용 · 미리보기만 가능
                        </span>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            {!isTemplateUnlocked(bulletinTemplate) && (
              <p className="text-[11px] text-amber-600 font-semibold mt-3 leading-relaxed flex items-start gap-1.5">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                지금 고른 디자인은 프로 요금제 전용이에요. 이대로 두면 성도 화면은 "기본" 디자인으로 표시됩니다.
              </p>
            )}
          </Card>

          {/* 오른쪽: 아이폰 미리보기 (데스크톱은 스크롤 따라오는 sticky, 모바일은 아래에 표시) */}
          {(() => {
            const previewTpl = BULLETIN_TEMPLATES.find((t) => t.id === previewTemplateId);
            const previewUnlocked = isTemplateUnlocked(previewTemplateId);
            const previewComingSoon = !!previewTpl?.comingSoon;
            return (
          <div className="w-full lg:w-[380px] shrink-0 lg:sticky lg:top-6">
            <div className="rounded-[2rem] bg-gradient-to-b from-purple-50 to-white border border-purple-100 p-3 sm:p-5 overflow-hidden">
              <p className="text-sm font-bold text-slate-800 text-center">
                {(previewTpl?.label) || "기본"} 미리보기
              </p>
              <p className="text-[11px] text-slate-400 text-center mt-1 mb-3 font-medium leading-relaxed">
                {previewComingSoon
                  ? <>아직 준비 중인 디자인이에요.<br />버튼만 먼저 열어뒀어요.</>
                  : <>실제 성도들이 보는 화면과 똑같은 예시 주보예요.<br />화면을 위아래로 넘겨서 구경해보세요.</>}
              </p>
              {/* 실제 휴대폰(390px 폭) 그대로 렌더한 뒤 zoom으로 축소 → 글자·간격 비율이 실제와 동일 */}
              <div className="flex justify-center">
                <div className="rounded-[2.25rem] bg-slate-900 p-2 shadow-2xl shrink-0">
                  <div className="relative rounded-[1.9rem] overflow-hidden bg-white" style={{ width: 312, height: 620 }}>
                    {/* 이 미리보기는 실제 성도 화면을 그대로 iframe으로 띄운 거라 휠/스와이프가 이미
                        다 되는데, "작은 목업 사진"처럼 보여서 스크롤 가능한 줄 모르는 경우가 많다.
                        그래서 스크롤 가능하다는 걸 알려주는 힌트만 얹는다(pointer-events-none이라
                        실제 휠/터치 조작은 그대로 iframe으로 전달됨) — 준비중 화면일 땐 스크롤할
                        내용이 없으니 표시하지 않는다. */}
                    {!previewComingSoon && (
                      <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 z-10 pointer-events-none flex items-center gap-1 px-3 py-1.5 rounded-full bg-black/55 backdrop-blur-sm text-white text-[10px] font-bold whitespace-nowrap animate-bounce">
                        <ChevronDown className="w-3 h-3 shrink-0" />
                        <span className="hidden sm:inline">마우스 휠로 스크롤하면 더 볼 수 있어요</span>
                        <span className="sm:hidden">화면을 스크롤해서 더 볼 수 있어요</span>
                      </div>
                    )}
                    {previewComingSoon ? (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-4 px-6 text-center" style={{ background: `linear-gradient(160deg, ${previewTpl?.swatch || "#1f2937"} 0%, #0f172a 100%)` }}>
                        <div className="w-16 h-16 rounded-full bg-white/10 border border-white/15 flex items-center justify-center">
                          <Lock className="w-7 h-7 text-white/80" />
                        </div>
                        <div>
                          <p className="text-white font-black text-base">준비중인 디자인입니다</p>
                          <p className="text-white/55 text-xs font-medium mt-1.5 leading-relaxed">
                            {previewTpl?.label}{previewTpl?.description ? ` · ${previewTpl.description}` : ""}<br />곧 만나보실 수 있어요
                          </p>
                        </div>
                        <span className="text-[10px] font-black tracking-widest text-white/40 uppercase">Coming Soon</span>
                      </div>
                    ) : (
                      <iframe
                        key={previewTemplateId}
                        src={`/view/new?mode=sample&template=${encodeURIComponent(previewTemplateId || "default")}`}
                        title="디자인 미리보기"
                        className="block border-0 bg-white"
                        style={{ width: 390, height: 775, zoom: 0.8 }}
                      />
                    )}
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-center mt-3 font-bold text-purple-500">
                {previewComingSoon
                  ? "준비되면 바로 쓸 수 있게 알려드릴게요"
                  : previewUnlocked
                  ? "이 디자인으로 주보를 만들 수 있어요 / (예시)"
                  : "프로 요금제를 쓰면 이런 디자인의 주보를 쓸 수 있어요"}
              </p>
            </div>
          </div>
            );
          })()}
        </div>
      </div>
      )}

      {activeTab === "cover" && (
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <Card className="p-5 rounded-[1.75rem] border-0 bg-white shadow-xl shadow-blue-500/5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-xl font-bold flex items-center gap-3 text-gray-800">
                <div className="w-2.5 h-8 bg-emerald-500 rounded-full shrink-0" /> 검색엔진 노출
              </h2>
              <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                켜면 우리 교회 주보 링크가 구글, 네이버 검색결과에 나올 수 있어요. 기본값은 꺼짐이고,
                꺼져 있으면 링크를 아는 사람만 볼 수 있어요. 주보에 외부 공개를 원치 않는 내용이 들어갈 수 있으니, 신중하게 켜주세요.
              </p>
            </div>
            <Switch
              checked={bulletinSearchable}
              onCheckedChange={handleToggleBulletinSearchable}
              disabled={bulletinSearchableSaving}
              className="shrink-0 mt-1"
            />
          </div>
          {bulletinSearchable && (
            <p className="text-[11px] text-emerald-600/90 font-medium mt-3 leading-relaxed flex items-start gap-1.5">
              <Search className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              검색엔진에 실제로 반영되기까지는 며칠에서 몇 주가 걸릴 수 있어요.
            </p>
          )}
          {/* 교단 — 검색 결과에서 교회 이름 옆에 나오는 아이콘(파비콘). 운영자 /super에서 정하는 값과 같은 칸 */}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <label className="block text-xs font-bold text-slate-500 mb-1.5">우리 교회 교단</label>
            <DenominationPicker
              value={churchDenomination}
              onChange={handleChangeDenomination}
              disabled={churchDenominationSaving}
            />
            <p className="text-[11px] text-slate-400 font-medium mt-1.5 leading-relaxed">
              검색 결과에서 교회 이름 옆에 교단 마크가 아이콘으로 나와요. 선택하지 않으면 스테이온 기본 아이콘이 나와요.
            </p>
          </div>
        </Card>

        <Card className="p-5 rounded-[1.75rem] border-0 bg-white shadow-xl shadow-blue-500/5 mt-4">
          <div className="mb-4">
            <h2 className="text-xl font-bold flex items-center gap-3 text-gray-800">
              <div className="w-2.5 h-8 bg-blue-600 rounded-full shrink-0" /> 카카오톡 공유 이미지
              <span className="text-[10px] font-black tracking-widest uppercase text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full">BETA</span>
            </h2>
            <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
              우리 교회 주보 링크를 카카오톡 등으로 공유했을 때 보이는 대표 이미지예요. 가로형 800×400px 비율로 저장되고,
              어느 부분을 보여줄지는 이미지를 더블클릭해서 직접 조절할 수 있어요. 특정 주보가 아니라 우리 교회 링크 전체에 적용됩니다.
            </p>
          </div>

          <input
            type="file"
            accept="image/png, image/jpeg, image/jpg, image/webp"
            ref={coverImageInputRef}
            onChange={handleCoverImageUpload}
            className="hidden"
          />

          {coverImageLoading ? (
            <div className="w-full aspect-[2/1] rounded-2xl bg-gray-100 animate-pulse" />
          ) : coverEditorOpen && coverOriginal ? (
            <div className="space-y-4">
              <p className="text-xs font-bold text-blue-600 flex items-center gap-1.5">
                <Move className="w-3.5 h-3.5" /> 이미지를 드래그해서 보여줄 부분을 조절하세요
              </p>
              <div
                ref={coverFrameRef}
                onPointerDown={handleCoverPointerDown}
                onPointerMove={handleCoverPointerMove}
                onPointerUp={handleCoverPointerUp}
                onPointerCancel={handleCoverPointerUp}
                className="relative w-full aspect-[2/1] rounded-2xl overflow-hidden border border-gray-200 bg-gray-100 cursor-grab active:cursor-grabbing touch-none"
              >
                <img
                  src={coverOriginal}
                  alt="원본 이미지"
                  draggable={false}
                  onLoad={(e) => {
                    const t = e.currentTarget;
                    coverImgNaturalRef.current = { w: t.naturalWidth, h: t.naturalHeight };
                  }}
                  style={{ objectFit: "cover", objectPosition: `${coverOffsetX}% ${coverOffsetY}%` }}
                  className="w-full h-full select-none pointer-events-none"
                />
              </div>

              {/* 실제 카카오톡 채팅창에 뜨는 링크 미리보기 카드를 흉내낸 모형 */}
              <div>
                <p className="text-xs font-bold text-gray-400 mb-2">카카오톡 미리보기 예시</p>
                <div className="max-w-[280px] rounded-2xl overflow-hidden border border-gray-200 shadow-sm bg-white">
                  <div className="w-full aspect-[2/1] bg-gray-100">
                    <img
                      src={coverOriginal}
                      alt="미리보기"
                      style={{ objectFit: "cover", objectPosition: `${coverOffsetX}% ${coverOffsetY}%` }}
                      className="w-full h-full"
                    />
                  </div>
                  <div className="p-3 space-y-0.5">
                    <p className="text-[13px] font-bold text-gray-900 truncate">
                      {(previewChurchName || "우리 교회")} 온라인주보 | STAYON_온라인 주보
                    </p>
                    <p className="text-[11px] text-gray-500 line-clamp-2 leading-snug">
                      {previewDescription || "스마트 모바일 주보를 확인해보세요."}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCancelCoverEditor}
                  disabled={coverImageUploading}
                  className="flex-1 h-11 rounded-xl border border-gray-200 bg-gray-50 hover:bg-white text-sm font-bold text-gray-600 transition-all disabled:opacity-50"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleSaveCoverEditor}
                  disabled={coverImageUploading}
                  className="flex-1 h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition-all disabled:opacity-50"
                >
                  {coverImageUploading ? "저장 중..." : "이 위치로 저장"}
                </button>
              </div>
            </div>
          ) : coverImage ? (
            <div className="space-y-3">
              <div
                onDoubleClick={() => {
                  if (!coverOriginal) {
                    toast.error("이전에 저장된 원본이 없어 위치 조절이 어려워요. 다른 이미지로 다시 업로드해주세요.");
                    return;
                  }
                  setCoverEditorOpen(true);
                }}
                className="relative w-full aspect-[2/1] rounded-2xl overflow-hidden border border-gray-200 bg-gray-50 cursor-pointer group"
                title="더블클릭하면 위치를 조절할 수 있어요"
              >
                <img src={coverImage} alt="카카오톡 공유 이미지" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-bold bg-black/50 px-3 py-1.5 rounded-full flex items-center gap-1.5">
                    <Move className="w-3.5 h-3.5" /> 더블클릭해서 위치 조절
                  </span>
                </div>
                {coverImageUploading && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-sm font-bold">업로드 중...</div>
                )}
              </div>
              <button
                type="button"
                onClick={() => coverImageInputRef.current?.click()}
                disabled={coverImageUploading}
                className="w-full h-11 rounded-xl border border-gray-200 bg-gray-50 hover:bg-white text-sm font-bold text-gray-600 transition-all disabled:opacity-50"
              >
                다른 이미지로 교체
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => coverImageInputRef.current?.click()}
              disabled={coverImageUploading}
              className="w-full aspect-[2/1] rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50/40 hover:bg-blue-50 hover:border-blue-300 transition-all flex flex-col items-center justify-center gap-2 text-blue-500 disabled:opacity-50"
            >
              <ImageIcon className="w-7 h-7" />
              <span className="text-sm font-bold">{coverImageUploading ? "업로드 중..." : "가로형 이미지 업로드 (800 x 400)"}</span>
            </button>
          )}

          <p className="text-[11px] text-purple-600/90 font-medium mt-3 leading-relaxed flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            지금은 베타 기간이라 무료로 제공돼요. 정식 버전이 출시되면 요금제에 따라 유료로 바뀔 수 있어요.
          </p>
          <p className="text-[11px] text-amber-600/90 font-medium mt-2 leading-relaxed flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            카카오톡은 이미 공유된 적 있는 링크의 미리보기 이미지를 한동안 캐싱해요. 이미지를 바꿔도 예전에 보내둔 링크는 한동안 이전 모습으로 보일 수 있어요.
          </p>
        </Card>
      </div>
      )}

      <Dialog open={showPublishDialog} onOpenChange={setShowPublishDialog}>
        <DialogContent className="rounded-[1.75rem] max-w-[calc(100%-4rem)] border-0 p-5 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-center pt-2">주보를 발행하시겠습니까?</DialogTitle>
          </DialogHeader>
          <div className="flex gap-3 mt-5">
            <Button variant="ghost" onClick={() => setShowPublishDialog(false)} className="flex-1 rounded-2xl py-4 font-bold text-gray-400 hover:bg-gray-100">취소</Button>
            <Button disabled={loading} onClick={() => { setShowPublishDialog(false); saveToFirestore(); }} className="flex-[2] rounded-2xl py-4 font-black bg-gradient-to-r from-blue-600 to-indigo-700 text-white shadow-xl shadow-blue-200 transition-all active:scale-95">
              {loading ? "처리 중..." : "지금 발행하기"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
