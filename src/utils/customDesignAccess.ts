// 커스텀 디자인(주보 템플릿) 사용 권한 판정.
//
// 정책:
//  - 2027-01-01(유료화 시작일) 전까지는 요금제와 무관하게 모두 무료로 사용.
//  - 그 이후에는 "프로 이상(프로/올인원)" 요금제만 커스텀 디자인 사용 가능.
//  - /super 에서 특정 교회에 수동으로 열어준 템플릿(users/{uid}.allowedTemplates)은
//    유료화 이후에도 요금제와 무관하게 항상 사용 가능(교회에서 받은 디자인 제공 등).
//  - 유료화 이후 프로가 아니게 되면, 이미 커스텀 템플릿으로 발행한 주보도 성도 화면에서
//    자동으로 "기본" 디자인으로 표시된다(데이터는 그대로 → 다시 프로면 복구).
//
// 유료화 시작일은 /super > 커스텀 디자인 관리에서 수정할 수 있고 settings/customDesign 에 저장된다.

import { DEFAULT_BULLETIN_TEMPLATE_ID, isCustomBulletinTemplate, isComingSoonBulletinTemplate } from "./bulletinTemplates";

export const CUSTOM_DESIGN_SETTINGS_PATH = { collection: "settings", doc: "customDesign" } as const;

// settings/customDesign 문서가 없을 때 쓰는 기본 유료화 시작일(KST 자정 기준).
export const DEFAULT_CUSTOM_DESIGN_PAYWALL_START = "2027-01-01";

export interface CustomDesignConfig {
  paywallStartDate?: string; // "YYYY-MM-DD" (KST). 이 날 00:00(KST)부터 요금제 잠금 시작.
}

// 아직 무료 개방 기간인지(요금제 잠금 전).
export function isCustomDesignFreePeriod(
  config: CustomDesignConfig | null | undefined,
  now: Date = new Date()
): boolean {
  const dateStr = (config?.paywallStartDate || DEFAULT_CUSTOM_DESIGN_PAYWALL_START).trim();
  const paywallStart = new Date(`${dateStr}T00:00:00+09:00`);
  if (isNaN(paywallStart.getTime())) return true; // 값이 깨졌으면 안전하게 무료로 취급
  return now.getTime() < paywallStart.getTime();
}

// 이 교회 계정이 프로 이상(프로/올인원) 요금제인지.
// TODO(2027 요금제): 진짜 4단계 요금제 결제가 붙으면 users/{uid}.planTier 등 정식 필드로 교체.
// 지금은 유료화 전이라 실제로는 호출돼도 결과가 쓰이지 않는다(무료 기간이 우선).
export function isProPlanOrAbove(userData: any): boolean {
  if (!userData) return false;
  const raw = String(userData.planTier ?? userData.currentPlan ?? "").toLowerCase();
  if (["pro", "allinone", "all-in-one", "all_in_one"].includes(raw)) return true;
  return raw.includes("프로") || raw.includes("올인원") || raw.includes("all-in-one");
}

interface AccessParams {
  templateId: string | undefined | null;
  config: CustomDesignConfig | null | undefined;
  userData: any; // users/{uid} 문서 데이터 (allowedTemplates, currentPlan 등)
  now?: Date;
}

// 이 템플릿을 실제로 적용해도 되는지.
export function canApplyCustomTemplate({ templateId, config, userData, now }: AccessParams): boolean {
  if (!isCustomBulletinTemplate(templateId)) return true; // "기본"은 항상 허용
  if (isComingSoonBulletinTemplate(templateId)) return false; // 준비 중 디자인은 적용 불가
  if (isCustomDesignFreePeriod(config, now)) return true; // 무료 개방 기간
  const allowed: string[] = Array.isArray(userData?.allowedTemplates)
    ? userData.allowedTemplates.map(String)
    : [];
  if (templateId && allowed.includes(templateId)) return true; // /super 수동 개방 (항상 우선)
  if (isProPlanOrAbove(userData)) return true; // 프로/올인원 요금제
  return false;
}

// 실제로 적용할 최종 템플릿 ID. 권한이 없으면 "기본"으로 폴백.
export function resolveEffectiveTemplateId(params: AccessParams): string {
  return canApplyCustomTemplate(params)
    ? params.templateId || DEFAULT_BULLETIN_TEMPLATE_ID
    : DEFAULT_BULLETIN_TEMPLATE_ID;
}
