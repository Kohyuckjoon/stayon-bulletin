import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";

const RESERVED_SLUGS = [
  "bulletin", "place", "www", "api", "admin", "super",
  "login", "signup", "pricing", "success", "jobs", "notify",
  "history", "view", "mail", "app", "assets", "static",
];

const SLUG_PATTERN = /^[a-z0-9-]{3,30}$/;

export function checkSlugFormat(slug: string): { valid: boolean; reason?: string } {
  if (!SLUG_PATTERN.test(slug)) {
    return { valid: false, reason: "영문 소문자, 숫자, 하이픈(-)만 사용해서 3~30자로 입력해주세요." };
  }
  if (RESERVED_SLUGS.includes(slug)) {
    return { valid: false, reason: "사용할 수 없는 주소입니다. 다른 이름을 입력해주세요." };
  }
  // {주소}-jubo.stayon-platform.com은 교회별 주보 전용 주소라 홈페이지 주소로 쓰면 겹친다
  if (slug.endsWith("-jubo")) {
    return { valid: false, reason: "'-jubo'로 끝나는 주소는 사용할 수 없습니다. 다른 이름을 입력해주세요." };
  }
  return { valid: true };
}

// 주소(URL)는 한 번 정하면 바꿀 수 없으므로(검색엔진 등록·인쇄물에 그대로 쓰임) 두 번 확인받는다.
// 둘 다 "확인"을 눌러야 true
export function confirmPermanentAddress(fullAddress: string): boolean {
  if (!window.confirm(
    `홈페이지 주소를 "${fullAddress}"(으)로 정합니다.\n\n` +
    "이 주소는 한 번 정하면 바꿀 수 없습니다. 오타가 없는지, 교회 이름과 잘 맞는지 신중하게 확인해 주세요."
  )) return false;
  return window.confirm(
    `정말 "${fullAddress}"(으)로 진행하시겠어요?\n\n` +
    "확인을 누르면 주소가 확정되고 이후에는 변경할 수 없습니다."
  );
}

export async function isSlugTaken(slug: string): Promise<boolean> {
  const snap = await getDoc(doc(db, "churchSites", slug));
  return snap.exists();
}
