import { doc, setDoc, getDoc, updateDoc, deleteDoc, serverTimestamp, collection, query, where, limit, getDocs, Timestamp } from "firebase/firestore";

import { db } from "../firebase";

export interface ChurchSite {
  slug: string;
  churchName: string;
  ownerId: string;
  published: boolean;
  seo?: { title: string; description: string; ogImage: string };
//   sections?: Record<string, unknown>;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  // BuilderPage.tsx(간편 빌더)에서 쓰는 단순 필드들. WebsiteEditor.tsx의 sections 구조와는 별개.
  pastor?: string;
  pastorRole?: string;
  pastorMessage?: string;
  pastorTagline?: string; // LEAD PASTOR 카드에서 성함 아래 들어가는 짧은 소개 문구(2~3줄)
  pastorPhotoUrl?: string; // 담임 목사 소개 카드에 표시되는 프로필 사진
  phone?: string;
  email?: string;
  address?: string;
  locationDetail?: string; // 상세 위치 안내 (ex. "○○빌딩 3층, 엘리베이터 옆 계단"). 개척교회처럼 상가 건물에 있는 경우를 위한 보충 설명
  shuttleInfo?: string; // 차량 운행 안내(여러 줄). 홈페이지 오시는 길에 "펼쳐 보기"로 표시
  naverMapLink?: string; // 네이버 지도 버튼: 교회가 넣은 공유 링크(http…) 또는 검색어. 없으면 주소로 검색
  kakaoMapLink?: string; // 카카오맵 버튼: 위와 같음

  worshipTime?: string; // 구버전 단일 텍스트 필드 (하위 호환용, worshipServices가 있으면 그쪽을 우선 사용)
  worshipServices?: { title: string; time: string; place?: string; note?: string; group?: string }[]; // group: "주일예배"/"주중예배" 등 같은 이름끼리 카드로 묶어서 표시
  worshipGroupPhotos?: Record<string, string>; // 예배 안내 카드 왼쪽 대표 사진(예배 구분 이름 → 사진 주소)
  mainWorshipGroup?: string; // worshipServices의 group 값 중 "본 예배" 뱃지를 표시할 구분 이름
  visionItems?: { title: string; desc: string }[];
  // 교회 소식(편집 화면 > 매주 업데이트). date = 등록일(YYYY-MM-DD, 자동). id = 상세 주소(/news/id)용
  newsItems?: { id?: string; title: string; date: string; content: string; items?: { title: string; content: string }[]; notice?: string }[]; // notice: 번호 없이 맨 위에 보이는 전체 안내
  staffMembers?: { role: string; name: string; department: string; phone: string; email: string; photoUrl?: string }[]; // 부목사·전도사 등 섬기는 사람들 (숫자 제한 없음)
  layLeaders?: { role: string; name: string; department: string; photoUrl?: string }[]; // 중직자(장로·권사). 표시 시 시무장로 > 원로장로 > 은퇴장로 > 권사 순으로 정렬
  // 주일학교/교육부서 메뉴: 메뉴 이름(주일학교·교육부서·직접 입력)과 부서 목록(유초등부·중고등부·청년부 등)
  eduMenuLabel?: string;
  eduDepartments?: { name: string; target: string; time: string; place: string; leader: string; desc: string; photoUrl?: string }[];
  // 앨범(상단 메뉴 "앨범"): 행사별 제목·날짜·사진 여러 장(Storage 주소)
  albums?: { id: string; title: string; date: string; photos: string[] }[];
  youtubeVideoId?: string;
  // false로 명시하면 youtubeVideoId가 있어도 "교회 소개 영상" 섹션 전체를 숨김. 미설정(기존 사이트)은 true로 취급
  introVideoEnabled?: boolean;
  // "text"면 "교회 소개 영상" 자리에 영상 대신 sermonExcerpt 텍스트를 보여줌. 미설정(기존 사이트)은 "video"로 취급
  sermonDisplayMode?: "video" | "text";
  sermonExcerpt?: string; // sermonDisplayMode가 "text"일 때 보여줄 짧은 설교 요약/발췌문(2~5줄 권장)
  latestSermonTitle?: string;
  latestSermonSpeaker?: string; // "교회 소개 영상" 캡션에 함께 표시되는 설교자 이름
  // 홈 화면 "온라인 예배" 섹션에 카드 목록으로 표시되는 지난 설교들. 비워두면 섹션 자체가 안 보임
  sermons?: { title: string; speaker?: string; scripture?: string; youtubeVideoId?: string; date?: string; comments?: number; views?: string }[];
  // false로 명시하면 설교가 등록돼 있어도 "온라인 예배" 섹션 전체를 숨김. 미설정(기존 사이트)은 true로 취급
  onlineWorshipEnabled?: boolean;
  intro?: string;
  // 표어·비전·사명(편집 화면 > 교회소개). 주보와 연동하지 않는 교회(2·3번)에서 씀
  mottoText?: string;
  mottoReference?: string;
  vision?: string;
  mission?: string;
  logoUrl?: string;
  heroImageUrl?: string; // 메인 화면 상단(히어로) 배경 사진. 없으면 primaryColor 그라데이션으로 대체
  galleryImages?: string[]; // 홈 화면 "이번 주 예배 시간" 바로 위에 화면 꽉 채워 표시되는 사진(최대 10장, 여러 장이면 슬라이드)
  buildingImageUrl?: string; // 교회 전경(건물) 사진. 교회 소개 섹션 상단에 표시

  primaryColor?: string;
  activeMenus?: string[];
  kakaoLink?: string;
  youtubeLink?: string;
  sermonPlaylistUrl?: string; // "지난 설교"에 쓸 유튜브 재생목록 주소(없으면 채널 영상)
  instagramLink?: string;
  metaTitle?: string;
  metaDesc?: string;

  // 결제/이용기간 관련 필드 (교회 사이트 제작 기능 전용, 주보 플랫폼과는 무관)
  // 화면 방식: "multipage"(기본, 메뉴마다 주소가 따로 있는 페이지 전환형) / "onepage"(예전 한 페이지 스크롤형)
  layoutMode?: "multipage" | "onepage";
  // 교회 정보 가져오기: bulletin(주보와 연동, 홈페이지에 주보 내용) / custom(주보는 쓰지만 홈페이지는 따로) /
  // website(홈페이지만). 없으면 예전과 같이 주보가 있으면 주보 내용을 보여 줌
  dataSource?: "bulletin" | "custom" | "website";
  denomination?: string; // 교단 마크 id(utils/denominations.ts). 없으면 예장 합동, "none"이면 사용 안 함
  denominationWithLogo?: boolean; // 로고 이미지가 있어도 교단 마크를 옆에 같이 표시
  denominationFullName?: boolean; // 교단 이름을 괄호까지 표시: 대한예수교장로회(합신). 없으면 괄호 앞부분만
  hideLogo?: boolean; // 홈페이지에서는 로고 이미지를 쓰지 않음(교단 마크 + 교회 이름으로 표시). 주보 로고는 그대로
  heroImages?: string[]; // 첫 화면 배너 사진(최대 10장). 첫 장은 heroImageUrl에도 같이 저장됨
  heroTransition?: "slide" | "fade"; // 2장 이상일 때 넘김 방식: 슬라이드 / 디졸브
  // 메인 바로가기 카드 4개 문구(편집 화면 > 홈 화면). {교회}는 교회 이름으로 바뀜. 비우면 기본 문구
  homeCards?: { title?: string; desc?: string; hidden?: boolean }[];
  heroTextColor?: string; // 메인 사진 위 글자(WELCOME·교회 이름·표어) 색. 비우면 흰색
  // 이번 주 말씀(편집 화면 > 매주 업데이트). 주보 설교가 없거나 주보와 연동하지 않는 교회에서 씀
  weeklySermon?: { title?: string; scripture?: string; preacher?: string; date?: string };
  // 서버(youtubeVideos)가 저장해 둔 유튜브 채널 영상 목록. 홈페이지는 이걸 바로 쓰고 1시간 지났을 때만 새로 받음
  ytVideos?: { url?: string; t?: number; videos?: { id: string; title: string; published: string; short?: boolean }[] };
  ytPlaylist?: { url?: string; t?: number; videos?: { id: string; title: string; published: string; short?: boolean }[] }; // 지난 설교 재생목록 저장본
  ytShorts?: { url?: string; t?: number; videos?: { id: string; title: string; published: string; short?: boolean }[] }; // 채널 쇼츠 저장본(말씀/영상 쇼츠 칸)
  historyItems?: { date: string; content: string }[]; // 교회 연혁
  // 찬양팀(위쪽 메뉴 "찬양팀"): praiseEnabled가 true일 때만 메뉴에 보임
  praiseEnabled?: boolean;
  // 교회 일정(위쪽 메뉴 "교회 일정", 앨범 오른쪽): scheduleEnabled가 true일 때만 메뉴·화면에 보임
  // 홈페이지 편집 화면 > 매주 업데이트 탭에서 일정(날짜·내용)을 추가
  scheduleEnabled?: boolean;
  // 화면 위쪽 배너(페이지 전환형): 사진(기본) / 색상(두 색 그라데이션) / 끄기(옅은 띠) — utils/pageBanners.ts
  bannerMode?: "photo" | "color" | "off";
  bannerColors?: [string, string] | null; // null·없음 = 우리 교회 색으로 자동
  bannerPhotos?: Record<string, string>; // 화면별로 교회가 올린 사진 주소(없으면 기본 사진)
  schedules?: { id: string; date: string; title: string }[];
  praiseIntro?: string;
  praiseTeams?: { name: string; time: string; place: string; leader: string; desc: string; photoUrl?: string }[];
  // 새가족 안내(교회소개 > 새가족 안내): 소개 · 등록 절차(단계) · 문의
  newcomerIntro?: string;
  newcomerSteps?: { title: string; desc: string }[];
  newcomerContact?: string;
  // 설교 화면 카드 표시 여부: 이번 주 말씀(기본 켜짐) · 다음 주 말씀(기본 꺼짐)
  weeklySermonEnabled?: boolean;
  nextSermon?: { title?: string; scripture?: string; preacher?: string; date?: string };
  nextSermonEnabled?: boolean;
  prayerPosts?: { id: string; title: string; date: string; content: string }[]; // 중보기도(외부 공개해도 되는 기도제목)
  // 교회 주보(종이 주보 파일): 교회가 쓰는 한글·워드·PDF·사진 파일을 그대로 올린 목록. 온라인 주보와 별개
  // sermons/news: 교회가 "이 주보로 교회 소식·설교도 채우기"로 자동 분석해서 확인 후 넣은 내용(선택)
  juboMenuEnabled?: boolean;
  paperJubo?: unknown; // 종이 주보 만들기 데이터(paperJubo/types.ts PaperJubo)
  // 교회소개 칸 켜기/끄기(false면 홈페이지에서 숨김)
  staffEnabled?: boolean; officersEnabled?: boolean; historyEnabled?: boolean; newcomerEnabled?: boolean; // 홈페이지 "온라인 주보" 메뉴 보이기(기본 켜짐, false면 숨김)
  pendingOwner?: boolean; // 운영자가 먼저 만들고 아직 교회 계정을 연결하지 않은 사이트
  // 교회 편집 잠금(2026-11-19): true면 교회 관리자는 "내 프로젝트"에 흐리게만 보이고 편집 화면에 못 들어감.
  // /super 교회 사이트 관리의 Open/Close로 바꿈. 운영자는 항상 편집 가능. 값이 없으면 열림(예전 사이트 그대로)
  editLocked?: boolean;
  paperBulletins?: {
    id: string; date: string; title: string; fileUrl: string; fileName: string; fileType: string;
    // fileType "images": 사진 여러 장(순서대로) / "link": 블로그·카페 등 링크(fileUrl이 링크) — 2026-11-17
    images?: string[];
    sermons?: { service: string; title: string; scripture: string; preacher: string }[];
    news?: { title: string; content: string }[];
  }[];

  firstDeployedAt?: Timestamp; // 최초 배포(발행) 시각. 한 번 설정되면 재배포해도 절대 안 바뀜 — 30일 무료체험 기산점
  accessExpiresAt?: Timestamp; // 이 사이트를 이용할 수 있는 만료일(무료체험 또는 결제로 연장된 날짜)
}

// BuilderPage.tsx(빌더 폼)와 WebsiteRenderer.tsx(실제 공개 페이지)가 activeMenus 값을 같은 이름으로 표시하도록 공용으로 관리
export const MENU_ITEMS = [
  { id: "home", label: "홈" },
  { id: "worship", label: "예배 안내" },
  { id: "community", label: "공동체" },
  { id: "news", label: "교회 소식" },
  { id: "online-worship", label: "온라인 예배" },
  { id: "location", label: "오시는 길" },
];

export async function createChurchSite(slug: string, churchName: string, ownerId: string) {
  const ref = doc(db, "churchSites", slug);
  const existing = await getDoc(ref);
  if (existing.exists()) throw new Error("이미 사용 중인 주소입니다.");

  await setDoc(ref, {
    slug,
    churchName,
    ownerId,
    published: false,
    seo: { title: `${churchName} - 우리 교회 홈페이지`, description: "", ogImage: "" },
    // sections: {},
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function getChurchSite(slug: string): Promise<ChurchSite | null> {
  const snap = await getDoc(doc(db, "churchSites", slug));
  return snap.exists() ? (snap.data() as ChurchSite) : null;
}

export async function updateChurchSite(slug: string, data: Partial<ChurchSite>) {
  await updateDoc(doc(db, "churchSites", slug), { ...data, updatedAt: serverTimestamp() });
}

// 운영자 페이지(/super/church-sites)의 "사이트 삭제" 버튼에서 씀. Firestore 문서만
// 삭제함 — 실제 서브도메인 접속 시 siteOG/WebsiteRenderer가 문서 없음을 만나면
// 정상적으로 빈 화면 처리하므로 별도 후처리 불필요
export async function deleteChurchSite(slug: string) {
  await deleteDoc(doc(db, "churchSites", slug));
}

// 날짜에 개월 수를 더함 (년/월 경계 자동 처리)
function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

// 날짜에 일수를 더함 (음수 가능 — 하루 빼기 등)
function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// 배포(발행) 시 호출. 최초 배포인 경우에만 firstDeployedAt/accessExpiresAt(30일 무료체험)를 설정하고,
// 이미 한 번이라도 배포된 사이트를 재배포할 때는 이용 기한을 절대 건드리지 않음
export async function publishChurchSite(slug: string) {
  const existing = await getChurchSite(slug);
  const patch: Partial<ChurchSite> = { published: true };

  if (!existing?.firstDeployedAt) {
    const now = new Date();
    patch.firstDeployedAt = Timestamp.fromDate(now);
    patch.accessExpiresAt = Timestamp.fromDate(addDays(now, 30));
  }

  await updateChurchSite(slug, patch);
}

// 결제 완료 시 이용 만료일을 연장. 아직 이용 가능한 기간(무료체험 포함)이 남아있으면 그 위에
// 이어붙이고, 이미 만료됐으면 결제 시점부터 새로 시작함.
export async function extendChurchSiteAccess(slug: string, months: 1 | 3 | 12): Promise<Date> {
  const existing = await getChurchSite(slug);
  const now = new Date();
  const currentExpiry = existing?.accessExpiresAt?.toDate() ?? null;
  const stillActive = currentExpiry !== null && currentExpiry.getTime() >= now.getTime();
  const base = stillActive ? addDays(currentExpiry as Date, 1) : now;
  const newExpiry = addDays(addMonths(base, months), -1);

  await updateChurchSite(slug, { accessExpiresAt: Timestamp.fromDate(newExpiry) });
  return newExpiry;
}

export async function getChurchSiteByOwner(ownerId: string): Promise<ChurchSite | null> {
  const q = query(collection(db, "churchSites"), where("ownerId", "==", ownerId), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return snap.docs[0].data() as ChurchSite;
}

// 로그인한 회원(ownerId) 소유의 교회 사이트 프로젝트를 전부 불러옴 (빌더 화면의 "내 프로젝트" 목록용)
export async function getChurchSitesByOwner(ownerId: string): Promise<ChurchSite[]> {
  const q = query(collection(db, "churchSites"), where("ownerId", "==", ownerId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as ChurchSite);
}

// 실제 배포(published)된 교회 사이트 목록을 가져옴. /website 마케팅 페이지의
// "스테이온과 함께 하고 있는 교회" 섹션에서 씀 — 새 사이트가 배포될 때마다
// 별도 작업 없이 이 목록에도 자동으로 반영됨
export async function getPublishedChurchSites(max = 8): Promise<ChurchSite[]> {
  const q = query(collection(db, "churchSites"), where("published", "==", true), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as ChurchSite);
}

export function extractYoutubeId(input: string): string {
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed; // 이미 순수 ID면 그대로
  const match = trimmed.match(/(?:v=|\/embed\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : trimmed;
}
