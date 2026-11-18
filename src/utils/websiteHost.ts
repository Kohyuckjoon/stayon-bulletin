// "교회 홈페이지 제작" 소개 페이지 전용 주소 — website.stayon-platform.com (2026-11-12)
// website 주소에선 첫 화면(/, 소개 페이지)과 로그인·회원가입만 보여 주고,
// 그 밖의 주소(빌더·주보 관리자 등)는 bulletin 주소로 넘김(로그인은 양쪽으로 이어 줌)
import { getFunctions, httpsCallable } from "firebase/functions";
import { browserSessionPersistence, setPersistence, signInWithCustomToken } from "firebase/auth";
import { auth } from "../firebase";

export const WEBSITE_HOST = "website.stayon-platform.com";
export const BULLETIN_ORIGIN = "https://bulletin.stayon-platform.com";
export const WEBSITE_ORIGIN = `https://${WEBSITE_HOST}`;
// website 주소에서 그대로 보여 주는 화면
export const WEBSITE_PATHS = ["/", "/login", "/signup"];

export const isWebsiteHost = () =>
  typeof window !== "undefined" && window.location.hostname === WEBSITE_HOST;

// ── 로그인 이어 주기(양쪽 방향) ───────────────────────────────────
// 브라우저는 로그인 정보를 주소마다 따로 저장해서 bulletin 로그인이 website 주소에선(반대도) 안 보임.
// 로그인한 채 다른 쪽 주소로 넘어갈 때 서버(websiteLoginHandoff)에서 본인 계정용 일회용 로그인 열쇠
// (1시간 유효)를 받아 주소 # 뒤에 실어 보내고, 넘어간 쪽에서 그 열쇠로 같은 계정에 로그인함.
// 열쇠는 주소창에서 바로 지움. 결제·주보 로그인 방식은 그대로

// 열쇠 미리 받아 두기 — 로그인 확인되면 미리 요청해 두고, 넘어갈 땐 받아 둔 걸 바로 씀
// (서버 함수가 잠들어 있으면 깨어나는 데 몇 초 걸려서, 누른 뒤에 요청하면 넘어가는 텀이 길어짐)
// 열쇠는 1시간 유효 → 50분 지나면 새로 받음. 한 번 쓰면 버림
let cached: { uid: string; at: number; token: Promise<string | null> } | null = null;

async function fetchToken(): Promise<string | null> {
  try {
    const call = httpsCallable<unknown, { token: string }>(getFunctions(auth.app, "asia-northeast3"), "websiteLoginHandoff");
    const { data } = await call();
    return data?.token || null;
  } catch (e) {
    console.error("로그인 이어 주기 실패(화면은 그대로 열림):", e);
    return null;
  }
}

export function prefetchLoginToken() {
  const u = auth.currentUser;
  if (!u) return;
  if (cached && cached.uid === u.uid && Date.now() - cached.at < 50 * 60 * 1000) return;
  cached = { uid: u.uid, at: Date.now(), token: fetchToken() };
}
// 예전 이름(메인 화면에서 사용)
export const prefetchWebsiteUrl = prefetchLoginToken;

async function takeToken(): Promise<string | null> {
  if (!auth.currentUser) return null;
  prefetchLoginToken();
  const t = await cached!.token;
  cached = null;
  return t;
}

const withHandoff = (url: string, token: string | null, churchName?: string | null) =>
  token ? `${url}#t=${encodeURIComponent(token)}${churchName ? `&n=${encodeURIComponent(churchName)}` : ""}` : url;

// bulletin → website: 로그인했으면 열쇠(+ 교회 이름)를 붙인 website 주소, 로그아웃이면 #out(website 쪽도 정리)
// 교회 이름을 같이 보내면 website 쪽 헤더가 처음부터 "○○교회 / 바로 가기"로 그려짐(깜빡임 없음)
export async function websiteUrlWithLogin(churchName?: string | null): Promise<string> {
  if (!auth.currentUser) return `https://${WEBSITE_HOST}/#out`;
  return withHandoff(`https://${WEBSITE_HOST}/`, await takeToken(), churchName);
}

// website → bulletin: 그 화면 주소에 (로그인했으면) 열쇠를 붙여 줌.
// 빌더로 갈 땐 ?from=website 표시 → 빌더 "← 뒤로"가 website로 돌아옴(routes.tsx BuilderPageRoute)
export async function bulletinUrlWithLogin(path: string): Promise<string> {
  await done; // website에 막 넘어와 열쇠로 로그인하는 중이면 끝날 때까지 기다림
  const u = new URL(path, BULLETIN_ORIGIN);
  if (u.pathname === "/website-builder" && !u.searchParams.has("from")) u.searchParams.set("from", "website");
  return withHandoff(`${BULLETIN_ORIGIN}${u.pathname}${u.search}`, await takeToken());
}

// ── 넘어온 쪽: 받은 열쇠·교회 이름 처리 ──────────────────────────
const NAME_KEY = "stayon:websiteHostName"; // 헤더에 바로 그릴 교회 이름(이 탭에서만, 탭 닫으면 사라짐 — 로그인 유지 기간과 같음)
let pendingToken: string | null = null; // 아직 로그인에 쓰지 않은 열쇠(로그인 중엔 "로그인" 버튼을 그리지 않게)
let done: Promise<void> = Promise.resolve();
let resolveDone: () => void = () => {};

export function readWebsiteHostName(): string | null {
  try { return sessionStorage.getItem(NAME_KEY); } catch { return null; }
}
export function saveWebsiteHostName(name: string | null) {
  try { if (name) sessionStorage.setItem(NAME_KEY, name); else sessionStorage.removeItem(NAME_KEY); } catch { /* 무시 */ }
}
// 열쇠로 로그인하는 중인지(이때 잠깐 "로그인 안 됨"으로 알려 와도 무시해야 함)
export const isHandoffPending = () => pendingToken !== null;
// 열쇠 로그인이 끝나면(성공·실패 모두) 풀림
export const whenHandoffDone = () => done;

// 다른 쪽 주소에서 넘어왔을 때(src/main.tsx, 화면 그리기 전): 열쇠·교회 이름을 받아 두고 주소창에선 지움.
// #out 이면(bulletin에서 로그아웃 상태로 넘어옴) website 쪽 로그인·교회 이름도 정리
export function captureWebsiteHandoff() {
  const hash = window.location.hash;
  if (hash === "#out") {
    pendingToken = "out";
    saveWebsiteHostName(null);
  } else {
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const t = params.get("t");
    if (!t) return;
    pendingToken = t;
    saveWebsiteHostName(params.get("n"));
  }
  done = new Promise<void>((r) => { resolveDone = r; }); // 열쇠 로그인이 끝나면 풀림(applyWebsiteHandoff)
  history.replaceState(null, "", window.location.pathname + window.location.search);
}

// 앱 시작 직후 한 번(src/main.tsx): 받아 둔 열쇠로 로그인(또는 로그아웃)
export function applyWebsiteHandoff(): Promise<void> {
  const token = pendingToken;
  if (!token) return done;
  void (async () => {
    try {
      if (token === "out") { await auth.signOut(); return; }
      // bulletin 메인과 같게: 탭을 닫으면 로그아웃
      await setPersistence(auth, browserSessionPersistence);
      await signInWithCustomToken(auth, token);
    } catch (e) {
      console.error("로그인 이어받기 실패:", e);
      saveWebsiteHostName(null);
    } finally {
      pendingToken = null;
      resolveDone();
    }
  })();
  return done;
}
