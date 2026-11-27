/* eslint-disable max-len */
import {onDocumentCreated} from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import {sendAdminEmail} from "./utils/adminNotify";

// 교회 홈페이지 "배포" 알림(2026-11-25).
// 홈페이지 편집 화면(BuilderPage)에서 배포를 누르면 site_deploy_triggers/{자동 id} = {slug, uid} 를 하나 씀 →
// 이 함수가 운영자 메일(GMAIL_USER)로 알림. 지난 배포 때 내용(churchSiteDeploys/{slug}.snapshot)과
// 지금 내용을 비교해 "무엇이 바뀌었는지"를 같이 적고, 지금 내용을 다음 비교용으로 저장.
// (홈페이지 내용은 "저장" 때 바로 바뀌고 "배포"는 공개 표시만 켬 → 배포와 배포 사이에 바뀐 것을 보여 줌)

const OPERATOR_UIDS = ["8PmIDuDQXKfYp2zUj6sLX3uzMVt2"];

// 비교하지 않는 칸: 시스템이 쓰는 값·자동으로 받아 오는 유튜브 목록 등
const IGNORE = new Set([
  "updatedAt", "createdAt", "published", "firstDeployedAt", "accessExpiresAt", "ownerId", "slug",
  "pendingOwner", "editLocked", "createdByOperator", "graceAllowed", "seo",
  "ytVideos", "ytShorts", "ytPlaylist", "id",
]);

const LABELS: Record<string, string> = {
  churchName: "교회 이름", pastor: "담임목사 이름", pastorRole: "담임목사 직분", pastorMessage: "담임목사 인사말",
  pastorTagline: "인사말 제목", pastorPhotoUrl: "담임목사 사진", phone: "전화번호", email: "이메일",
  address: "주소", locationDetail: "오시는 길 안내", shuttleInfo: "차량 운행 안내", naverMapLink: "네이버 지도 링크",
  kakaoMapLink: "카카오맵 링크", worshipTime: "예배 시간", worshipServices: "예배 시간표", worshipGroupPhotos: "예배 사진",
  mainWorshipGroup: "대표 예배", visionItems: "비전 항목", newsItems: "교회 소식", staffMembers: "섬기는 분들(교역자)",
  layLeaders: "섬기는 분들(장로·권사)", eduMenuLabel: "주일학교 메뉴 이름", eduDepartments: "주일학교 부서",
  albums: "앨범", albumEnabled: "앨범 메뉴 켜기", youtubeVideoId: "대표 영상", introVideoEnabled: "소개 영상 켜기",
  sermonDisplayMode: "설교 표시 방식", sermonExcerpt: "설교 요약", latestSermonTitle: "최근 설교 제목",
  latestSermonSpeaker: "최근 설교자", sermons: "설교 영상", onlineWorshipEnabled: "온라인 예배 켜기",
  intro: "교회 소개", mottoText: "표어", mottoReference: "표어 말씀 구절", vision: "비전", mission: "사명",
  logoUrl: "로고", heroImageUrl: "메인 사진", heroImages: "메인 사진", heroTransition: "메인 사진 넘김 방식",
  heroTextColor: "메인 글자 색", homeCards: "메인 바로가기 카드", galleryImages: "메인 사진 띠",
  buildingImageUrl: "교회 소개 사진", buildingImagePos: "교회 소개 사진 위치", primaryColor: "대표 색",
  activeMenus: "메뉴 구성", kakaoLink: "카카오톡 채널", youtubeLink: "유튜브 채널", sermonPlaylistUrl: "설교 재생목록",
  instagramLink: "인스타그램", metaTitle: "검색 제목", metaDesc: "검색 설명", layoutMode: "화면 구성",
  dataSource: "주보 연동 방식", denomination: "교단", denominationWithLogo: "교단 로고 표시",
  denominationFullName: "교단 이름 전체 표시", hideLogo: "로고 숨기기", weeklySermon: "이번 주 설교",
  weeklySermonEnabled: "이번 주 설교 켜기", nextSermon: "다음 주 설교", nextSermonEnabled: "다음 주 설교 켜기",
  historyItems: "교회 연혁", historyEnabled: "교회 연혁 켜기", praiseEnabled: "찬양팀 켜기", praiseIntro: "찬양팀 소개",
  praiseTeams: "찬양팀", scheduleEnabled: "교회 일정 켜기", schedules: "교회 일정", bannerMode: "위쪽 배너 방식",
  bannerColors: "위쪽 배너 색", bannerPhotos: "위쪽 배너 사진", newcomerIntro: "새가족 안내", newcomerSteps: "새가족 등록 순서",
  newcomerContact: "새가족 문의", newcomerEnabled: "새가족 안내 켜기", prayerPosts: "중보기도", juboMenuEnabled: "온라인 주보 메뉴 켜기",
  paperJubo: "종이 주보 만들기", paperBulletins: "교회 주보 파일", staffEnabled: "섬기는 분들 켜기", officersEnabled: "직분자 켜기",
  graceEnabled: "나눔 게시판 켜기", graceLabel: "나눔 게시판 이름", graceDesc: "나눔 게시판 설명",
  naverSiteVerification: "네이버 검색 등록 코드",
};

type Row = { label: string; change: string };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;"}[c] as string));
const cut = (s: string, n = 60) => (s.length > n ? s.slice(0, n) + "…" : s);
const isImageUrl = (v: unknown) => typeof v === "string" && /^https?:\/\//.test(v) && /(firebasestorage|\.(jpe?g|png|webp|gif)(\?|$))/i.test(v);

/**
 * 칸 하나가 어떻게 바뀌었는지 사람이 읽을 한 줄로.
 * @param {unknown} before 지난 배포 때 값
 * @param {unknown} after 지금 값
 * @return {string} 메일에 넣을 HTML 한 줄
 */
function describe(before: unknown, after: unknown): string {
  const empty = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
  if (isImageUrl(before) || isImageUrl(after)) {
    if (empty(before)) return "사진을 새로 넣음";
    if (empty(after)) return "사진을 뺌";
    return "사진을 바꿈";
  }
  if (typeof before === "boolean" || typeof after === "boolean") {
    return `${before ? "켜짐" : "꺼짐"} → <b>${after ? "켜짐" : "꺼짐"}</b>`;
  }
  if (Array.isArray(before) || Array.isArray(after)) {
    const a = Array.isArray(before) ? before.length : 0;
    const b = Array.isArray(after) ? after.length : 0;
    if (a !== b) return `${a}개 → <b>${b}개</b>`;
    return "내용 수정";
  }
  if ((before && typeof before === "object") || (after && typeof after === "object")) {
    return empty(before) ? "새로 넣음" : empty(after) ? "지움" : "내용 수정";
  }
  const sb = String(before ?? "").trim();
  const sa = String(after ?? "").trim();
  if (!sb) return `새로 넣음: “${esc(cut(sa))}”`;
  if (!sa) return `지움 (전: “${esc(cut(sb))}”)`;
  if (sb.length > 60 || sa.length > 60) return `글 수정 (${sb.length}자 → ${sa.length}자)`;
  return `“${esc(sb)}” → <b>“${esc(sa)}”</b>`;
}

/**
 * 지난 배포 내용과 지금 내용을 비교해 바뀐 칸 목록.
 * @param {Record<string, unknown>} prev 지난 배포 때 내용
 * @param {Record<string, unknown>} cur 지금 내용
 * @return {Row[]} 바뀐 칸(이름 · 바뀐 내용)
 */
function diff(prev: Record<string, unknown>, cur: Record<string, unknown>): Row[] {
  const keys = Array.from(new Set([...Object.keys(prev), ...Object.keys(cur)])).filter((k) => !IGNORE.has(k));
  const rows: Row[] = [];
  const seen = new Set<string>();
  for (const k of keys) {
    if (JSON.stringify(prev[k] ?? null) === JSON.stringify(cur[k] ?? null)) continue;
    const label = LABELS[k] || `기타 설정 (${k})`;
    if (seen.has(label)) continue; // heroImageUrl·heroImages처럼 같은 이름은 한 줄만
    seen.add(label);
    rows.push({label, change: describe(prev[k], cur[k])});
  }
  return rows;
}

export const onSiteDeployTrigger = onDocumentCreated(
  {document: "site_deploy_triggers/{docId}"},
  async (event) => {
    const t = event.data?.data();
    const slug = String(t?.slug || "");
    if (!/^[a-z0-9-]{2,40}$/.test(slug)) return;
    const db = admin.firestore();
    try {
      const siteSnap = await db.collection("churchSites").doc(slug).get();
      if (!siteSnap.exists) return;
      const site = siteSnap.data() as Record<string, unknown>;
      const snapRef = db.collection("churchSiteDeploys").doc(slug);
      const prevSnap = await snapRef.get();
      const prev = prevSnap.exists ? (prevSnap.data()?.snapshot as Record<string, unknown> | undefined) : undefined;

      const uid = String(t?.uid || "");
      const byOperator = OPERATOR_UIDS.includes(uid) && uid !== site.ownerId;
      const churchName = String(site.churchName || slug);
      const url = `https://${slug}.stayon-platform.com/`;
      const rows = prev ? diff(prev, site) : [];
      const first = !prev;
      const when = new Date().toLocaleString("ko-KR", {timeZone: "Asia/Seoul"});

      const title = first ?
        `🌐 ${churchName} 홈페이지를 배포했습니다 (첫 알림)` :
        rows.length ? `🌐 ${churchName} 홈페이지를 배포했습니다 · ${rows.length}곳 바뀜` : `🌐 ${churchName} 홈페이지를 다시 배포했습니다 · 바뀐 곳 없음`;

      const info = [
        ["교회명", esc(churchName)],
        ["홈페이지", `<a href="${url}" style="color:#2563EB">${url}</a>`],
        ["배포한 사람", byOperator ? "운영자(스테이온)가 대신 배포" : "교회가 직접 배포"],
        ["배포 시각", when],
      ].map(([k, v]) => `<tr><td style="padding:6px 0;color:#8b95a1;font-size:13px;width:90px;vertical-align:top">${k}</td><td style="padding:6px 0;color:#333d4b;font-size:14px">${v}</td></tr>`).join("");

      const changes = first ?
        "<p style=\"font-size:13px;color:#8b95a1;line-height:1.6\">이번이 첫 알림이라 비교할 이전 내용이 없어요. 다음 배포부터 바뀐 곳이 여기 표시돼요.</p>" :
        rows.length === 0 ?
          "<p style=\"font-size:13px;color:#8b95a1\">지난 배포 이후 바뀐 내용이 없어요.</p>" :
          "<table style=\"width:100%;border-collapse:collapse\">" + rows.slice(0, 40).map((r) =>
            `<tr><td style="padding:9px 8px 9px 0;border-top:1px solid #f2f4f6;font-size:13px;font-weight:700;color:#333d4b;width:130px;vertical-align:top">${esc(r.label)}</td><td style="padding:9px 0;border-top:1px solid #f2f4f6;font-size:13px;color:#4e5968;line-height:1.5;word-break:keep-all">${r.change}</td></tr>`).join("") +
          "</table>" + (rows.length > 40 ? `<p style="font-size:12px;color:#8b95a1">외 ${rows.length - 40}곳</p>` : "");

      const html =
        "<div style=\"background:#f2f4f6;padding:30px 15px;font-family:sans-serif\">" +
        "<div style=\"max-width:520px;margin:0 auto;background:#fff;border-radius:24px;padding:32px\">" +
        "<div style=\"width:40px;height:4px;background:#0F766E;margin-bottom:20px\"></div>" +
        `<h2 style="font-size:20px;margin:0 0 20px;line-height:1.4">${esc(title)}</h2>` +
        `<table style="width:100%;border-collapse:collapse;margin-bottom:22px">${info}</table>` +
        "<p style=\"font-size:15px;font-weight:800;color:#191f28;margin:0 0 8px\">바뀐 곳</p>" + changes +
        `<div style="margin-top:24px;text-align:center"><a href="${url}" style="display:inline-block;background:#0F766E;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:12px">홈페이지 열기</a></div>` +
        "</div></div>";

      await sendAdminEmail(`[STAYON 교회 홈페이지] ${title}`, html);
      await snapRef.set({snapshot: site, deployedAt: admin.firestore.FieldValue.serverTimestamp(), deployedBy: uid});
      console.log(`[배포 알림] ${slug} · 바뀐 곳 ${rows.length}`);
    } catch (e) {
      console.error("[배포 알림 실패]", slug, e);
    }
  }
);
