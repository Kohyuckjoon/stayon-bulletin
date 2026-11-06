import { collection, doc, getDoc, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { DENOMINATIONS, denominationLogoSrc } from "./denominations";

// 브라우저 탭 아이콘(파비콘)을 교회 교단 마크로 바꾼다.
// 검색봇용 HTML(functions/src/bulletinSeo.ts withFavicon)과 같은 규칙:
//   교회 홈페이지 → 홈페이지에서 고른 교단 → 교회 계정 교단 → 스테이온 기본
//   주보(/view)   → 교회 계정 교단 → 그 교회 홈페이지 교단 → 스테이온 기본

const DEFAULT_FAVICON = "/favicon.png";
const isKnown = (id: unknown): id is string => typeof id === "string" && DENOMINATIONS.some((d) => d.id === id);

// 탭 아이콘은 투명 배경 교단 마크(public/denomination-logos/{id}-Photoroom.png)
const tabIconSrc = (id: string) => denominationLogoSrc(id).replace(/\.png$/, "-Photoroom.png");

export function setFavicon(denominationId: string) {
  const href = denominationId ? tabIconSrc(denominationId) : DEFAULT_FAVICON;
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  if (link.getAttribute("href") !== href) {
    link.type = "image/png";
    link.href = href;
  }
}

// 교회 계정(uid)의 교단 — 같은 교회 화면을 오갈 때 다시 읽지 않도록 저장해 둠
const cache = new Map<string, Promise<string>>();

export function churchDenominationOf(uid: string): Promise<string> {
  let p = cache.get(uid);
  if (!p) {
    p = (async () => {
      try {
        const u = await getDoc(doc(db, "users", uid));
        const own = u.data()?.denomination;
        if (isKnown(own)) return own;
        const s = await getDocs(query(collection(db, "churchSites"), where("ownerId", "==", uid), limit(1)));
        const siteDenom = s.empty ? "" : s.docs[0].data().denomination;
        return isKnown(siteDenom) ? siteDenom : "";
      } catch {
        return "";
      }
    })();
    cache.set(uid, p);
  }
  return p;
}

// 주보 화면(/view/...)용: 주보 작성 교회의 교단으로 탭 아이콘 변경
export function applyChurchFavicon(uid: string | null | undefined) {
  if (!uid) return;
  churchDenominationOf(uid).then(setFavicon);
}

// 교회 홈페이지용: 홈페이지에서 고른 교단이 먼저, 없으면 교회 계정 교단
export function applySiteFavicon(siteDenomination: unknown, ownerId: string | null | undefined) {
  if (isKnown(siteDenomination)) { setFavicon(siteDenomination); return; }
  if (ownerId) churchDenominationOf(ownerId).then(setFavicon);
  else setFavicon("");
}
