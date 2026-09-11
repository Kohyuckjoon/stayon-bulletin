import { Circle, Zap, Star, Crown, type LucideIcon } from "lucide-react";

// 교회 계정의 "플랜 티어"와 "이용 만료일" 관련 공용 로직.
// AdminDashboard(성도용 관리자 홈)와 /super/jubo-management(운영자 회원 관리)가
// 서로 다른 만료일 계산식을 쓰면 두 화면이 다른 날짜를 보여주는 문제가 생기므로,
// 반드시 이 파일의 함수를 통해서만 계산한다.

// "active"는 결제 이력이 없는 기본값(가입 직후 상태 = 무료 체험 중)을 의미.
// 나머지 4개는 운영자가 /super에서 직접 부여하거나, 결제 완료 시 자동으로 부여되는 유료 플랜 등급.
export type PlanTier = "active" | "basic" | "standard" | "pro" | "allinone";

export type PlanTierMeta = {
  value: PlanTier;
  label: string;
  icon: LucideIcon | null; // null이면 아이콘 없이 아웃라인만 (무료체험 — 의도적으로 가장 낮은 강도)
  // 배지(칩) 스타일: 등급이 올라갈수록 그라데이션 색이 진해지고 그림자가 강해져서
  // "시각적으로도 더 높은 등급"처럼 보이도록 단계적으로 설계했다. 셀렉트/뱃지 어디서든
  // 이 세 클래스를 그대로 조합해서 쓰면 된다.
  chipClass: string; // 배경(그라데이션 또는 아웃라인) + 그림자
  textClass: string; // 칩 위에 올라가는 글자/아이콘 색
};

export const PLAN_TIERS: PlanTierMeta[] = [
  {
    value: "active", label: "무료체험", icon: null,
    chipClass: "bg-white border-2 border-dashed border-gray-300",
    textClass: "text-gray-500",
  },
  {
    value: "basic", label: "베이직", icon: Circle,
    chipClass: "bg-gradient-to-r from-sky-400 to-sky-500 shadow-sm shadow-sky-200",
    textClass: "text-white",
  },
  {
    value: "standard", label: "스탠다드", icon: Zap,
    chipClass: "bg-gradient-to-r from-emerald-400 to-teal-500 shadow-sm shadow-emerald-200",
    textClass: "text-white",
  },
  {
    value: "pro", label: "프로", icon: Star,
    chipClass: "bg-gradient-to-r from-indigo-500 to-violet-600 shadow-md shadow-indigo-300/60",
    textClass: "text-white",
  },
  {
    value: "allinone", label: "올인원", icon: Crown,
    chipClass: "bg-gradient-to-r from-fuchsia-500 via-purple-600 to-indigo-600 shadow-lg shadow-purple-400/50",
    textClass: "text-white",
  },
];

export const getPlanTierMeta = (status?: string | null): PlanTierMeta =>
  PLAN_TIERS.find((t) => t.value === status) || PLAN_TIERS[0];

// "active"(1개월 무료체험)와 "allinone"(결제)은 표시상으로는 항상 구분해서 보여주지만,
// 실제 이용 가능한 기능 등급 기준으로는 동일하게 취급한다 — 체험 기간에는 모든 기능을
// 다 써볼 수 있어야 하고, 그 이후엔 올인원 결제로만 같은 수준을 유지할 수 있어야 하기 때문.
// (베이직/스탠다드/프로는 나중에 기능별 제한이 들어갈 예정 — Pricing.tsx의
// UPCOMING_FEATURE_TIERS 참고. 지금은 티어별 기능 제한 자체가 아직 구현 전이라
// 이 값이 실제로 분기하는 곳은 없지만, 나중에 티어별 기능 게이팅을 붙일 때는
// 반드시 이 헬퍼를 기준으로 판단할 것 — status === "allinone" 단독으로 체크하면
// 체험 중인 회원이 부당하게 제한된다.)
export const hasFullAccess = (status?: string | null): boolean =>
  status === "active" || status === "allinone" || !status;

// Firestore Timestamp | ISO 문자열 | Date 아무거나 받아서 Date로 안전하게 변환. 실패하면 null.
export const toDateSafe = (value: unknown): Date | null => {
  if (!value) return null;
  if (typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate();
  }
  const d = new Date(value as string | number | Date);
  return isNaN(d.getTime()) ? null : d;
};

// 남은 일수 계산. durationMonths가 0보다 크면 startDate에 개월 수를 더해 만료일로 쓰고,
// 0이면 startDate 자체를 만료일로 취급한다(이미 미래 날짜가 저장돼 있는 결제 만료일 케이스).
// AdminDashboard.tsx의 기존 calculateDaysLeft와 동일한 계산식 — 절대 따로 변형하지 말 것.
export const calculateDaysLeft = (startDateInput: unknown, durationMonths = 0): number => {
  const startDate = toDateSafe(startDateInput);
  if (!startDate) return 0;

  const endDate = new Date(startDate);
  if (durationMonths > 0) endDate.setMonth(startDate.getMonth() + durationMonths);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const targetDate = new Date(endDate);
  targetDate.setHours(0, 0, 0, 0);

  return Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
};

export type ExpiryInfo = {
  date: Date | null;
  // true면 결제 이력이 없어 "가입일 + 1개월"로 추정한 무료 체험 만료일 (실제 저장된 값이 아님)
  isTrial: boolean;
  daysLeft: number;
};

// 화면에 보여줄 만료일: 결제 이력(lastPaymentDate)이 있으면 그 날짜를 그대로,
// 없으면 가입일(createdAt) + 1개월을 "무료 체험 만료일"로 추정해서 보여준다.
// 가입 시점엔 lastPaymentDate가 아예 저장되지 않기 때문에(트라이얼은 계산으로만 존재),
// 이 함수 없이 lastPaymentDate만 읽으면 트라이얼 회원은 전부 "미설정"으로 보이게 된다.
export const getExpiryInfo = (user: { lastPaymentDate?: unknown; createdAt?: unknown }): ExpiryInfo => {
  if (user.lastPaymentDate) {
    return {
      date: toDateSafe(user.lastPaymentDate),
      isTrial: false,
      daysLeft: calculateDaysLeft(user.lastPaymentDate, 0),
    };
  }
  if (user.createdAt) {
    const base = toDateSafe(user.createdAt);
    const estimated = base ? new Date(base) : null;
    if (estimated) estimated.setMonth(estimated.getMonth() + 1);
    return { date: estimated, isTrial: true, daysLeft: calculateDaysLeft(user.createdAt, 1) };
  }
  return { date: null, isTrial: true, daysLeft: 0 };
};
