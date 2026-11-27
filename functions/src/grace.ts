/* eslint-disable max-len */
// 교회 홈페이지 "은혜나눔" 게시판(2026-11-24) — 성도가 이름 + 비밀번호(숫자 4자리)로 바로 글을 씀(관리자 확인 없음).
// 교회별로 나눠 저장: gracePosts/{id}.slug = 교회 사이트 주소. 각 홈페이지는 자기 slug 글만 보여 줌.
// 글쓰기·고치기·지우기·신고·관리는 모두 이 함수를 거침(비밀번호 확인 · 스팸 · 욕설 검사를 서버에서).
//  - gracePosts/{id}     : 공개 글(누구나 읽기) — 비밀번호 정보 없음
//  - graceSecrets/{id}   : 비밀번호(소금 + scrypt 해시) — 서버만
//  - graceRate/{기기키}  : 같은 접속에서 너무 자주 쓰는 것 막기 — 서버만
// 신고 3번이면 자동 숨김. 숨기기·다시 보이기·삭제(관리)는 그 교회 사이트 주인 계정 또는 운영자만.
// 결제·정기결제·주보 함수와 완전히 별개.
import * as admin from "firebase-admin";
import * as crypto from "crypto";
import {onCall, HttpsError} from "firebase-functions/v2/https";

const OPERATOR_EMAILS = ["stayon.platform@gmail.com"];
const OPERATOR_UIDS = ["8PmIDuDQXKfYp2zUj6sLX3uzMVt2"];
const REPORT_HIDE = 3;
const BAD_WORDS = [
  "시발", "씨발", "씨빨", "시빨", "ㅅㅂ", "ㅆㅂ", "병신", "븅신", "ㅂㅅ", "개새끼", "개새기", "새끼", "좆", "존나", "졸라",
  "미친놈", "미친년", "지랄", "ㅈㄹ", "닥쳐", "꺼져", "엿먹", "fuck", "shit",
];

type Img = string;
const db = () => admin.firestore();
const clean = (v: unknown, max: number) => String(v ?? "").replace(/\s+$/g, "").slice(0, max);
const hasLink = (t: string) => /(https?:\/\/|www\.|[a-z0-9-]+\.(com|net|kr|co|org|io|me|ly|xyz|shop)\b)/i.test(t);
const hasBad = (t: string) => {
  const s = t.replace(/[\s.,·*_-]/g, "").toLowerCase();
  return BAD_WORDS.some((w) => s.includes(w));
};
const hashPw = (pw: string, salt: string) => crypto.scryptSync(pw, salt, 32).toString("hex");

/**
 * 접속(IP) 기준 익명 키(해시) — 너무 자주 쓰기 · 중복 신고 막기용
 * @param {object} req 호출 요청
 * @return {string} 32자 해시
 */
function clientKey(req: {rawRequest?: {ip?: string; headers?: Record<string, unknown>}}): string {
  const fwd = String(req.rawRequest?.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  const ip = fwd || req.rawRequest?.ip || "unknown";
  return crypto.createHash("sha256").update(`grace:${ip}`).digest("hex").slice(0, 32);
}

/**
 * 교회 사이트 문서(없으면 오류)
 * @param {string} slug 교회 사이트 주소
 * @return {Promise<object>} churchSites 문서 데이터
 */
async function getSite(slug: string) {
  if (!/^[a-z0-9-]{2,40}$/.test(slug)) throw new HttpsError("invalid-argument", "교회 주소가 올바르지 않아요.");
  const snap = await db().collection("churchSites").doc(slug).get();
  if (!snap.exists) throw new HttpsError("not-found", "교회 홈페이지를 찾을 수 없어요.");
  return snap.data() || {};
}

/**
 * 이름 · 제목 · 내용 검사(빈 칸 · 링크 · 욕설)
 * @param {string} title 제목
 * @param {string} content 내용
 * @param {string} name 이름
 */
function checkContent(title: string, content: string, name: string) {
  if (!name.trim()) throw new HttpsError("invalid-argument", "이름을 적어 주세요.");
  if (!title.trim()) throw new HttpsError("invalid-argument", "제목을 적어 주세요.");
  if (content.trim().length < 5) throw new HttpsError("invalid-argument", "내용을 조금 더 적어 주세요.");
  const all = `${name} ${title} ${content}`;
  if (hasLink(all)) throw new HttpsError("invalid-argument", "인터넷 주소(링크)는 올릴 수 없어요.");
  if (hasBad(all)) throw new HttpsError("invalid-argument", "바르지 않은 말이 들어 있어서 올릴 수 없어요.");
}

const okImages = (v: unknown): Img[] =>
  (Array.isArray(v) ? v : []).map(String)
    .filter((u) => u.startsWith("https://firebasestorage.googleapis.com/"))
    .slice(0, 3);

export const gracePosts = onCall({region: "asia-northeast3"}, async (request) => {
  const d = (request.data || {}) as Record<string, unknown>;
  const action = String(d.action || "");
  const slug = String(d.slug || "");

  // ── 글쓰기 ──
  if (action === "create") {
    if (String(d.website || "")) throw new HttpsError("invalid-argument", "올리지 못했어요."); // 자동 프로그램 함정 칸
    const site = await getSite(slug);
    if (site.graceEnabled !== true) throw new HttpsError("failed-precondition", "이 교회는 나눔 게시판을 쓰지 않아요.");
    // 운영자가 허용한 교회만(graceApprovals/{주소}.allowed) — 교회가 화면에서 임의로 켜도 여기서 막힘
    const approval = await db().collection("graceApprovals").doc(slug).get();
    if (approval.data()?.allowed !== true) throw new HttpsError("failed-precondition", "이 교회는 아직 게시판 사용 승인 전이에요.");
    const name = clean(d.name, 20);
    const title = clean(d.title, 80);
    const content = clean(d.content, 4000);
    const password = String(d.password || "");
    if (!/^\d{4}$/.test(password)) throw new HttpsError("invalid-argument", "비밀번호는 숫자 4자리로 적어 주세요.");
    checkContent(title, content, name);

    // 너무 자주 쓰기 막기: 같은 접속에서 1분에 1번, 1시간에 5번까지
    const key = clientKey(request);
    const rateRef = db().collection("graceRate").doc(key);
    const now = Date.now();
    await db().runTransaction(async (tx) => {
      const r = await tx.get(rateRef);
      const times = ((r.data()?.times as number[]) || []).filter((t) => now - t < 3600000);
      if (times.length && now - times[times.length - 1] < 60000) throw new HttpsError("resource-exhausted", "잠시 후에 다시 올려 주세요.");
      if (times.length >= 5) throw new HttpsError("resource-exhausted", "한 시간에 다섯 번까지 올릴 수 있어요.");
      tx.set(rateRef, {times: [...times, now]});
    });

    const ref = db().collection("gracePosts").doc();
    const salt = crypto.randomBytes(16).toString("hex");
    const batch = db().batch();
    batch.set(ref, {
      slug, name, title, content, images: okImages(d.images),
      hidden: false, reports: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    batch.set(db().collection("graceSecrets").doc(ref.id), {slug, salt, hash: hashPw(password, salt), clientKey: key, reporters: []});
    await batch.commit();
    return {id: ref.id};
  }

  const id = String(d.id || "");
  if (!/^[A-Za-z0-9]{10,40}$/.test(id)) throw new HttpsError("invalid-argument", "글을 찾을 수 없어요.");
  const postRef = db().collection("gracePosts").doc(id);
  const secretRef = db().collection("graceSecrets").doc(id);
  const post = await postRef.get();
  if (!post.exists || post.data()?.slug !== slug) throw new HttpsError("not-found", "글을 찾을 수 없어요.");

  // ── 고치기 · 지우기(쓴 사람: 비밀번호) ──
  if (action === "update" || action === "delete") {
    const sec = (await secretRef.get()).data();
    const password = String(d.password || "");
    if (!sec || !/^\d{4}$/.test(password) || hashPw(password, sec.salt) !== sec.hash) {
      throw new HttpsError("permission-denied", "비밀번호가 맞지 않아요.");
    }
    if (action === "delete") {
      await db().batch().delete(postRef).delete(secretRef).commit();
      return {ok: true};
    }
    const name = clean(d.name, 20);
    const title = clean(d.title, 80);
    const content = clean(d.content, 4000);
    checkContent(title, content, name);
    await postRef.update({name, title, content, images: okImages(d.images), updatedAt: admin.firestore.FieldValue.serverTimestamp()});
    return {ok: true};
  }

  // ── 신고(같은 접속은 한 번만, 3번이면 자동 숨김) ──
  if (action === "report") {
    const key = clientKey(request);
    const res = await db().runTransaction(async (tx) => {
      const sec = await tx.get(secretRef);
      const reporters = (sec.data()?.reporters as string[]) || [];
      if (reporters.includes(key)) return {already: true};
      const n = ((post.data()?.reports as number) || 0) + 1;
      tx.update(secretRef, {reporters: [...reporters, key]});
      tx.update(postRef, {reports: n, ...(n >= REPORT_HIDE ? {hidden: true} : {})});
      return {already: false, hidden: n >= REPORT_HIDE};
    });
    return res;
  }

  // ── 관리(그 교회 사이트 주인 계정 · 운영자): 숨기기 / 다시 보이기 / 삭제 ──
  if (action === "adminHide" || action === "adminShow" || action === "adminDelete") {
    const uid = request.auth?.uid;
    const email = request.auth?.token?.email || "";
    if (!uid) throw new HttpsError("unauthenticated", "로그인이 필요해요.");
    const site = await getSite(slug);
    const isOp = OPERATOR_UIDS.includes(uid) || OPERATOR_EMAILS.includes(email);
    if (!isOp && site.ownerId !== uid) throw new HttpsError("permission-denied", "이 교회 관리자만 할 수 있어요.");
    if (action === "adminDelete") await db().batch().delete(postRef).delete(secretRef).commit();
    else await postRef.update({hidden: action === "adminHide", ...(action === "adminShow" ? {reports: 0} : {})});
    if (action === "adminShow") await secretRef.set({reporters: []}, {merge: true});
    return {ok: true};
  }

  throw new HttpsError("invalid-argument", "알 수 없는 요청이에요.");
});
