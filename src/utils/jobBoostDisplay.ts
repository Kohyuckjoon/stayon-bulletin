// 사역자 청빙 게시판(jobPosts)의 "광고 설정" 기능에서 공용으로 쓰는 슬롯 상수 및 헬퍼.
// StayOnRetreatVenue(place.stayon-platform.com)의 AdminTeamAds.tsx / teamDisplay.ts와
// 동일한 개념(끌어올리기·티커 노출)을 사역자 청빙판에 이식한 것.
// 실제 하드 제한은 아니고, 신청 페이지·관리자 페이지에 "현재 몇 자리 찼는지" 안내할 때만 쓴다.

export const JOB_TOP_BOOST_MAX_SLOTS = 4;
export const JOB_TICKER_MAX_SLOTS = 5;

// 끌어올리기(boostedUntil이 아직 안 지난) 상태인지 여부.
export function isJobBoosted(post: { boostedUntil?: { toDate?: () => Date } | null }): boolean {
  const until = post?.boostedUntil?.toDate?.();
  return !!(until && until.getTime() > Date.now());
}
