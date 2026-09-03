import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router";
import { auth, db, storage } from "../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  doc, getDoc, setDoc, serverTimestamp, collection,
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
  MapPin, Info, ImageIcon, X, Megaphone, Share2, FileText, Move
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
  content?: string;
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
  const [activeTab, setActiveTab] = useState<"content" | "cover">("content");

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
        }
      } catch (error) {
        console.error("공유 이미지 불러오기 실패:", error);
      } finally {
        setCoverImageLoading(false);
      }
    });
    return () => unsubscribe();
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
  });

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
    }
  });

  const [ministers, setMinisters] = useState([
    { id: "m1", role: "담임목사", name: "홍길동", phone: "", photoUrl: "", phoneFreeFormat: false }
  ]);
  // "섬기시는분" 섹션 전체를 주보에 표시할지 여부. 기존에 저장된 주보엔 이 필드가 없으므로
  // 불러올 때 값이 없으면(undefined) true로 취급해 기존 화면과 동일하게 보이도록 한다.
  const [ministersEnabled, setMinistersEnabled] = useState(true);

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

  // 위치 안내 이미지 업로드 핸들러. 사역자 사진 업로드와 동일한 방식(Base64 압축)으로 처리하되,
  // 대표 이미지 하나이므로 조금 더 큰 해상도(최대 720px)로 저장한다.
  const handleLocationImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("이미지 파일(png, jpeg 등)만 업로드 가능합니다.");
      return;
    }

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

        const compressedBase64 = canvas.toDataURL("image/jpeg", 0.75);
        setLocationImage(compressedBase64);
        toast.success("위치 안내 이미지가 등록되었습니다.");
      };
    };
    reader.onerror = () => {
      toast.error("이미지를 읽는 중 오류가 발생했습니다.");
    };
    reader.readAsDataURL(file);
  };

  // 새 주보 작성 시(수정 화면 아님) 가장 최근에 발행/저장했던 주소를 자동으로 불러와 채워둔다.
  // 교회 주소는 매주 바뀌는 정보가 아니므로, 매번 재입력하지 않아도 되도록 하기 위함.
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
    setMinisters([...ministers, { id: Date.now().toString(), role: "", name: "", phone: "", photoUrl: "", phoneFreeFormat: false }]);
  };

  const removeMinister = (ministerId: string) => {
    setMinisters(ministers.filter((m) => m.id !== ministerId));
  };

  // updateMinister 함수 타입에 'phone' 추가
  const updateMinister = (ministerId: string, field: 'role' | 'name' | 'phone' | 'photoUrl', val: string) => {
    setMinisters(ministers.map((m) => (m.id === ministerId ? { ...m, [field]: val } : m)));
  };

  // 연락처 형식 자유 입력 체크박스 토글. 켜면 자동 하이픈 포맷을 끄고 숫자/하이픈을 자유롭게 직접 입력할 수 있다.
  // (0507 안심번호, 043-123-1234 같은 지역번호 등 010-XXXX-XXXX 규격이 아닌 번호를 위함)
  const toggleMinisterPhoneFreeFormat = (ministerId: string) => {
    setMinisters(ministers.map((m: any) => (m.id === ministerId ? { ...m, phoneFreeFormat: !m.phoneFreeFormat } : m)));
  };

  // 이미지 파일 선택 시 Base64로 변환하여 실시간 미리보기 및 데이터 저장 처리 핸들러
  const handleImageUpload = (ministerId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("이미지 파일(png, jpeg 등)만 업로드 가능합니다.");
      return;
    }

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

        // JPEG 포맷으로 압축 품질을 낮춰서(0.75) Base64 생성
        const compressedBase64 = canvas.toDataURL("image/jpeg", 0.75);

        updateMinister(ministerId, 'photoUrl', compressedBase64);
        toast.success("사역자 사진이 압축되어 성공적으로 등록되었습니다.");
      };
    };
    reader.onerror = () => {
      toast.error("이미지를 읽는 중 오류가 발생했습니다.");
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
      sections,
      announcements,
      midweekServices,
      sundayServices,
      ministers,
      ministersEnabled,
      churchAddress,
      churchAddressDetail,
      addressEnabled,
      locationImage,
      locationImageRatio,
      isPreview: true // 미리보기 모드임을 알림
    };
    localStorage.setItem("temp_bulletin", JSON.stringify(tempData));
  }, [bulletinData, sections, announcements, midweekServices, sundayServices, ministers, ministersEnabled, churchAddress, churchAddressDetail, addressEnabled, locationImage, locationImageRatio]);

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
            });
            setSections(data.sections || []);
            setAnnouncements(data.announcements || []);

            if (data.ministers && Array.isArray(data.ministers)) {
              setMinisters(data.ministers);
            }
            setMinistersEnabled(data.ministersEnabled !== false);

            setChurchAddress(data.churchAddress || "");
            setChurchAddressDetail(data.churchAddressDetail || "");
            setAddressEnabled(data.addressEnabled !== false);
            setLocationImage(data.locationImage || "");
            setLocationImageRatio(data.locationImageRatio === "1:1" ? "1:1" : "4:3");

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
            // 데이터로드 시 주중 예배 복원
            if (data.midweekServices) {
              setMidweekServices(data.midweekServices);
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

  const updateSection = (sectionId: string, field: 'label' | 'value' | 'content', val: string) =>
    setSections(sections.map(s => s.id === sectionId ? { ...s, [field]: val } : s));

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

      const formattedOfferingAccount = `${bulletinData.bankName} ${bulletinData.accountNumber} ${bulletinData.accountHolder}`.trim();

      const formattedSundayServices = sundayServices.map(
        (s) => `${s.name}, ${s.time}, ${s.location}`
      );

      const sanitizedMinisters = ministers.map((m: any) => ({
        id: String(m.id || Date.now()),
        role: String(m.role || ""),
        name: String(m.name || ""),
        phone: String(m.phone || ""),
        photoUrl: String(m.photoUrl || ""),
        phoneFreeFormat: Boolean(m.phoneFreeFormat),
      }));

      const sanitizedSections = sections.map((s) => ({
        id: String(s.id || Date.now()),
        label: String(s.label || ""),
        value: String(s.value || ""),
        content: String(s.content || ""),
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
      };

      const payload: any = {
        date: String(bulletinData.date || ""),
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
        backgroundImage: String(bulletinData.backgroundImage || "/stayon_image.png"),
        sections: sanitizedSections,
        announcements: sanitizedAnnouncements,
        midweekServices: sanitizedMidweekServices,
        sundayEveningService: sanitizedEveningService,
        sundayServices: formattedSundayServices,
        ministers: sanitizedMinisters,
        ministersEnabled,
        churchAddress: String(churchAddress || ""),
        churchAddressDetail: String(churchAddressDetail || ""),
        addressEnabled,
        locationImage: String(locationImage || ""),
        locationImageRatio,
        status: "published",
        authorId: uid,
        updatedAt: serverTimestamp(),
        publishedAt: serverTimestamp(),
      };
      if (!isEditing) payload.createdAt = serverTimestamp();

      batch.set(doc(db, "bulletins", bulletinId), payload, { merge: true });
      await batch.commit();

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

        {/* 상단 탭: 이 주보 자체의 내용 vs 계정(교회) 전체에 적용되는 공유 이미지 설정 */}
        <div className="container mx-auto px-4 max-w-4xl flex gap-1">
          <button
            type="button"
            onClick={() => setActiveTab("content")}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === "content" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400 hover:text-slate-600"}`}
          >
            <FileText className="w-4 h-4" /> 주보 내용
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("cover")}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === "cover" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400 hover:text-slate-600"}`}
          >
            <Share2 className="w-4 h-4" /> 공유 이미지 설정
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
          <h2 className="text-xl font-bold mb-4 flex items-center gap-3 text-gray-800">
            <div className="w-2.5 h-8 bg-blue-500 rounded-full"></div> 예배 및 봉사 정보
          </h2>
          <div className="grid md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <Label className="font-semibold">예배 날짜</Label>
              <DatePickerField value={bulletinData.date} onChange={(date) => setBulletinData({ ...bulletinData, date })} />
            </div>
            <div className="space-y-2">
              <Label className="font-semibold">본문 말씀</Label>
              <Input placeholder="예: 마태복음 5:13-16" value={bulletinData.scripture} onChange={(e) => setBulletinData({ ...bulletinData, scripture: e.target.value })} className="rounded-2xl h-12 border-gray-200 bg-white text-sm" />
            </div>
            <div className="space-y-2">
              <Label className="font-semibold">설교 제목</Label>
              <Input placeholder="제목을 입력하세요" value={bulletinData.title} onChange={(e) => setBulletinData({ ...bulletinData, title: e.target.value })} className="rounded-2xl h-12 border-gray-200 bg-white text-sm" />
            </div>
            <div className="space-y-2">
              <Label className="font-semibold">설교자</Label>
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

        <Card className="p-5 rounded-[1.75rem] border-0 bg-white shadow-xl shadow-purple-500/5">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold flex items-center gap-3">
              <div className="w-2.5 h-8 bg-purple-500 rounded-full"></div> 예배 순서
            </h2>
            <Button onClick={addSection} variant="outline" className="rounded-full border-dashed border-2 px-6 border-purple-100 text-purple-600 hover:bg-purple-50">
              <Plus className="w-4 h-4 mr-2" /> 순서 추가
            </Button>
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
              <div key={section.id} className="p-4 bg-gray-50/50 rounded-[1.5rem] border border-gray-100 group hover:bg-white hover:shadow-lg transition-all">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" disabled={index === 0} onClick={() => moveSection(index, 'up')} className="h-7 w-7 rounded-lg bg-white border border-gray-100 shadow-sm"><ChevronUp className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" disabled={index === sections.length - 1} onClick={() => moveSection(index, 'down')} className="h-7 w-7 rounded-lg bg-white border border-gray-100 shadow-sm"><ChevronDown className="w-4 h-4" /></Button>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeSection(section.id)} className="text-gray-300 hover:text-red-500 rounded-full h-8 w-8"><Trash2 className="w-4 h-4" /></Button>
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
                    value={section.content || ""}
                    onChange={(e) => updateSection(section.id, 'content', e.target.value)}
                    placeholder="[선택] 성도가 클릭했을 때 보여줄 상세 전문(사도신경, 주기도문 등)을 입력하세요."
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
              <p className="text-xs text-gray-500 mt-1.5 pl-0 sm:pl-5 font-medium leading-relaxed">수요예배, 금요철야 등 주중 모임 정보를 직관적으로 관리하세요.</p>
            </div>

            {/* 머티리얼 스타일 커스텀 토글 영역 */}
            <label
              htmlFor="midweek-toggle"
              className={`flex items-center gap-3 py-2 px-4 rounded-full transition-all duration-300 cursor-pointer select-none shrink-0 self-start ${midweekServices.enabled
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

        <Card className="p-5 rounded-[1.75rem] border-0 bg-white shadow-xl shadow-blue-500/5 relative overflow-hidden">
          <div className="flex flex-col gap-3 mb-4">
            <div className="min-w-0">
              <h2 className="text-xl font-bold flex items-center gap-3 text-slate-800">
                <div className="w-2.5 h-8 bg-blue-600 rounded-full shrink-0" /> 섬기시는분 안내 설정
              </h2>
              <p className="text-xs text-slate-400 mt-1.5 font-medium leading-relaxed">교역자, 부서별 담당자, 찬양대 등 사역자의 직분과 이름, 사진을 함께 관리하세요.</p>
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
                <Plus className="w-4 h-4 mr-1.5" /> 섬기는 분 추가
              </Button>
            </div>
          </div>

          {ministersEnabled && (
          <div className="space-y-3">
            {ministers.map((minister, index) => (
              <div key={minister.id} className="p-4 bg-slate-50/80 rounded-[1.5rem] border border-slate-100 hover:bg-white hover:shadow-md transition-all">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3 min-w-0">
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
                    <span className="text-[10px] text-blue-400 text-center px-2">네이버 지도 캡처, 오시는 길 안내도 등</span>
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
      </div>
      )}

      {activeTab === "cover" && (
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <Card className="p-5 rounded-[1.75rem] border-0 bg-white shadow-xl shadow-blue-500/5">
          <div className="mb-4">
            <h2 className="text-xl font-bold flex items-center gap-3 text-gray-800">
              <div className="w-2.5 h-8 bg-blue-600 rounded-full shrink-0" /> 카카오톡 공유 이미지
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

          <p className="text-[11px] text-amber-600/90 font-medium mt-3 leading-relaxed flex items-start gap-1.5">
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
