// 모금 프로젝트(러브링 등) 합계 계산 — 결제·정기결제·주보 함수와 완전히 별개.
// 성도가 "보냈어요"(donations 추가)하거나 담당자가 확인·반려·수정·삭제하면
// 다시 계산해서
//   fundraisers/{pid}.totals  { reported, confirmed, count, shown, random }
//   fundraisers/{pid}/wishes/{wid}.raised
//   fundraisers/{pid}.recent  { wishName, at }
//     (새 입금 알림일 때만 — 9:16 화면 "방금 ○○에 사랑이…")
// 를 씀. 이 칸들은 firestore.rules 에서 화면이 못 고치게 막혀 있어 서버(관리자 권한)만 씀.
// 게이지 기준(displayMode): instant = 대기+확인 모두 반영 / confirmed = 확인된 것만 반영
import * as admin from "firebase-admin";
import {
  onDocumentWritten,
  onDocumentUpdated,
} from "firebase-functions/v2/firestore";

const REGION = "asia-northeast3";

/**
 * 한 프로젝트의 합계·소원별 모인 금액을 다시 계산해서 저장.
 * @param {string} pid 프로젝트 id
 * @param {string | null} recentWishId 새로 들어온 입금 알림의 소원(최근 소식용)
 */
async function recompute(pid: string, recentWishId: string | null) {
  const db = admin.firestore();
  const pRef = db.doc(`fundraisers/${pid}`);
  const [pSnap, dSnap, wSnap] = await Promise.all([
    pRef.get(),
    pRef.collection("donations").get(),
    pRef.collection("wishes").get(),
  ]);
  if (!pSnap.exists) return;
  const mode = pSnap.get("displayMode") === "confirmed" ?
    "confirmed" : "instant";
  let reported = 0;
  let confirmed = 0;
  let count = 0;
  const raised: Record<string, number> = {};
  dSnap.forEach((d) => {
    const x = d.data();
    if (x.status === "rejected") return;
    const amt = Number(x.amount) || 0;
    reported += amt;
    count += 1;
    if (x.status === "confirmed") confirmed += amt;
    const counts = mode === "confirmed" ? x.status === "confirmed" : true;
    if (counts) {
      const wid = String(x.wishId || "");
      raised[wid] = (raised[wid] || 0) + amt;
    }
  });
  const shown = Object.values(raised).reduce((a, b) => a + b, 0);

  const batch = db.batch();
  wSnap.forEach((w) => {
    const next = raised[w.id] || 0;
    if (Number(w.get("raised") || 0) !== next) {
      batch.update(w.ref, {raised: next});
    }
  });
  const patch: Record<string, unknown> = {
    totals: {reported, confirmed, count, shown, random: raised.random || 0},
  };
  if (recentWishId) {
    const wishName = recentWishId === "random" ?
      (pSnap.get("randomGift.label") || "랜덤 선물") :
      (wSnap.docs.find((w) => w.id === recentWishId)?.get("name") || "");
    if (wishName) {
      patch.recent = {
        wishName,
        at: admin.firestore.FieldValue.serverTimestamp(),
      };
    }
  }
  batch.update(pRef, patch);
  await batch.commit();
}

// 입금 알림이 추가·수정·삭제될 때
export const fundraiserTotals = onDocumentWritten(
  {document: "fundraisers/{pid}/donations/{did}", region: REGION},
  async (event) => {
    const before = event.data?.before;
    const after = event.data?.after;
    const isNew = !before?.exists && !!after?.exists;
    const wishId = isNew ? String(after?.get("wishId") || "") : null;
    await recompute(event.params.pid, wishId || null);
  }
);

// 담당자가 게이지 기준(즉시/확인 후)을 바꿨을 때 — 그 칸이 바뀐 경우에만(자기 자신이 쓴 totals 변경엔 반응 안 함)
export const fundraiserModeChange = onDocumentUpdated(
  {document: "fundraisers/{pid}", region: REGION},
  async (event) => {
    const b = event.data?.before.get("displayMode");
    const a = event.data?.after.get("displayMode");
    if (b === a) return;
    await recompute(event.params.pid, null);
  }
);
