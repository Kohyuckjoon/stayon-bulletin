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
  return { valid: true };
}

export async function isSlugTaken(slug: string): Promise<boolean> {
  const snap = await getDoc(doc(db, "churchSites", slug));
  return snap.exists();
}
