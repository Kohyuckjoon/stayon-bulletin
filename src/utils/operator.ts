// 스테이온 운영자 계정. /super 화면들(AdminChurchSites 등)의 ADMIN_EMAILS와 같은 목록.
// 운영자는 홈페이지 빌더에서 다른 교회 사이트도 열어 편집할 수 있다(/website-builder?site=주소).
export const OPERATOR_EMAILS = ["akhj123akhjk@gmail.com", "stayon.platform@gmail.com"];

export function isOperatorEmail(email: string | null | undefined): boolean {
  return !!email && OPERATOR_EMAILS.includes(email);
}
