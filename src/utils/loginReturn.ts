// 로그인 화면 진입 전 어느 결제/안내 화면(주보 /pricing, 교회 홈페이지 제작 /website · /website-offer)에서
// 왔는지를 기억해, 로그인 완료 후 그 화면으로 되돌려 보내기 위한 저장소.
// sessionStorage를 쓰기 때문에 새로고침에도 유지되고, 탭을 닫으면 자동으로 사라짐.
const KEY = "stayon_login_return_to";

export type LoginReturnTarget = "/pricing" | "/website-offer" | "/website" | "/jobs/boost" | "/website-builder" | "/website-create";

// /website-builder · /website-create: 교회 홈페이지 제작 화면에서 로그아웃 상태로 "무료로 시작하기"·"만들기"를 눌렀을 때 → 로그인 후 그 화면으로
const VALID_TARGETS: LoginReturnTarget[] = ["/pricing", "/website-offer", "/website", "/jobs/boost", "/website-builder", "/website-create"];

export const setLoginReturnTo = (target: LoginReturnTarget) => {
  try {
    sessionStorage.setItem(KEY, target);
  } catch {
    // 시크릿 모드 등 sessionStorage 접근이 막힌 경우, 기존과 동일하게 기본 리다이렉트로 동작
  }
};

export const clearLoginReturnTo = () => {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // no-op
  }
};

export const consumeLoginReturnTo = (): LoginReturnTarget | null => {
  try {
    const value = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return VALID_TARGETS.includes(value as LoginReturnTarget) ? (value as LoginReturnTarget) : null;
  } catch {
    return null;
  }
};
