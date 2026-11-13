// bulletin → website.stayon-platform.com 로그인 이어 주기 (2026-11-12)
// 브라우저는 로그인 정보를 주소(도메인)마다 따로 저장해서, bulletin에서 로그인해도 website 주소에선
// 로그아웃 상태로 보임. bulletin에서 로그인한 사람이 메인 상단 "교회 홈페이지 제작"을 누르면
// 이 함수가 그 사람 계정용 일회용 로그인 열쇠(Firebase 커스텀 토큰, 1시간 유효)를 만들어 주고,
// website 쪽 화면이 그 열쇠로 같은 계정에 로그인함.
// 결제·정기결제·주보 함수와 완전히 별개. 로그인한 본인 계정 열쇠만 만들 수 있음(다른 계정 불가)
import * as admin from "firebase-admin";
import {onCall, HttpsError} from "firebase-functions/v2/https";

export const websiteLoginHandoff = onCall(
  {region: "asia-northeast3"},
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "로그인이 필요해요.");
    const token = await admin.auth().createCustomToken(uid, {via: "website"});
    return {token};
  }
);
