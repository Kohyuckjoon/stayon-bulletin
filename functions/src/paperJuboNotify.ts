/* eslint-disable max-len */
import {onDocumentCreated} from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import {sendAdminEmail} from "./utils/adminNotify";

// 종이 주보 올림 알림(2026-11-25).
// 주보 편집 화면 "종이 주보"(src/app/components/PaperUploadCard)에서 PDF·사진을 올리면 paperJuboFiles/{id} 가 생김 →
// 운영자 메일. 여러 장을 한 번에 올려도 메일 한 통: 첫 파일이 들어오고 40초 기다린 뒤,
// 같은 교회·같은 주보 날짜로 아직 알리지 않은 파일을 모아 한 번에 보냄(잠금 문서 paperJuboNotify/{교회}_{날짜}로 중복 방지).
// (홈페이지 편집 화면 "올린 종이 주보"는 같은 저장소를 보여 주기만 해서 여기 한 곳에서만 알림)

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;"}[c] as string));
const size = (n: number) => (!n ? "-" : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))}KB` : `${(n / 1024 / 1024).toFixed(1)}MB`);
const isPdf = (f: Record<string, unknown>) => String(f.fileType || "") === "application/pdf" || /\.pdf$/i.test(String(f.fileName || ""));
const dateLabel = (d: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${Number(m[2])}월 ${Number(m[3])}일` : d || "날짜 없음";
};

export const onPaperJuboUpload = onDocumentCreated(
  {document: "paperJuboFiles/{fileId}", timeoutSeconds: 120},
  async (event) => {
    const f = event.data?.data();
    if (!f) return;
    const ownerId = String(f.ownerId || "");
    const date = String(f.date || "");
    if (!ownerId) return;
    const db = admin.firestore();
    // 한 번에 여러 장 올리는 동안 기다렸다가 묶어서 보냄
    await new Promise((r) => setTimeout(r, 40000));
    const lockRef = db.collection("paperJuboNotify").doc(`${ownerId}_${date || "nodate"}`);
    const mine = await db.runTransaction(async (tx) => {
      const lock = (await tx.get(lockRef)).data();
      const at = lock?.at as admin.firestore.Timestamp | undefined;
      if (at && Date.now() - at.toMillis() < 3 * 60 * 1000) return false; // 방금 다른 파일이 이미 묶어 보냄
      tx.set(lockRef, {at: admin.firestore.Timestamp.now()});
      return true;
    });
    if (!mine) return;
    try {
      const snap = await db.collection("paperJuboFiles").where("ownerId", "==", ownerId).where("date", "==", date).get();
      const files = snap.docs.filter((d) => !d.data().notifiedAt);
      if (!files.length) return;
      const user = (await db.collection("users").doc(ownerId).get()).data() || {};
      const church = String(user.churchName || "이름 미등록 교회");
      const items = files.map((d) => d.data()).sort((a, b) => Number(a.createdAtMs || 0) - Number(b.createdAtMs || 0));
      const list = items.map((x) => {
        const url = String(x.fileUrl || "");
        const thumb = !isPdf(x) && url ? `<img src="${url}" alt="" style="width:56px;height:56px;object-fit:cover;border-radius:8px;border:1px solid #eee">` :
          "<div style=\"width:56px;height:56px;border-radius:8px;background:#FEF2F2;color:#DC2626;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;line-height:56px;text-align:center\">PDF</div>";
        return `<tr><td style="padding:10px 10px 10px 0;border-top:1px solid #f2f4f6;width:56px">${thumb}</td>` +
          `<td style="padding:10px 0;border-top:1px solid #f2f4f6;font-size:13.5px;color:#333d4b">${esc(String(x.fileName || "파일"))}<br><span style="color:#8b95a1;font-size:12px">${isPdf(x) ? "PDF" : "사진"} · ${size(Number(x.size || 0))}</span></td>` +
          `<td style="padding:10px 0;border-top:1px solid #f2f4f6;text-align:right;white-space:nowrap">${url ? `<a href="${url}" style="font-size:13px;font-weight:700;color:#2563EB;text-decoration:none">열기 →</a>` : ""}</td></tr>`;
      }).join("");
      const title = `📄 ${church}가 ${dateLabel(date)} 종이 주보를 올렸습니다${items.length > 1 ? ` (${items.length}개)` : ""}`;
      const html =
        "<div style=\"background:#f2f4f6;padding:30px 15px;font-family:sans-serif\">" +
        "<div style=\"max-width:520px;margin:0 auto;background:#fff;border-radius:24px;padding:32px\">" +
        "<div style=\"width:40px;height:4px;background:#0EA5E9;margin-bottom:20px\"></div>" +
        `<h2 style="font-size:20px;margin:0 0 6px;line-height:1.4">${esc(title)}</h2>` +
        `<p style="margin:0 0 18px;font-size:13px;color:#8b95a1">${new Date().toLocaleString("ko-KR", {timeZone: "Asia/Seoul"})}</p>` +
        `<table style="width:100%;border-collapse:collapse">${list}</table>` +
        "</div></div>";
      await sendAdminEmail(`[STAYON 종이 주보] ${title}`, html);
      const batch = db.batch();
      files.forEach((d) => batch.update(d.ref, {notifiedAt: admin.firestore.FieldValue.serverTimestamp()}));
      await batch.commit();
      console.log(`[종이 주보 알림] ${ownerId} ${date} · ${items.length}개`);
    } catch (e) {
      console.error("[종이 주보 알림 실패]", ownerId, date, e);
    }
  }
);
