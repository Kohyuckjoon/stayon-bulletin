/* eslint-disable max-len */
import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {sendAdminEmail} from "./utils/adminNotify";

// 관리형 1년 완납 환급 요청 알림(2026-11-25).
// 홈페이지 편집 화면 > 요금제 > 환급 나무에서 12칸을 다 채운 교회가 "환급 요청하기"를 누르면
// refundRequests/{계정}_{정기결제 시작일} 이 생김 → 운영자 메일(GMAIL_USER)로 알림.
// 결제를 취소하거나 돈을 보내지 않음 — 알림만. 실제 환급(포트원 부분 취소·입금)은 운영자가 직접.

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;"}[c] as string));
const won = (n: unknown) => `${Number(n || 0).toLocaleString("ko-KR")}원`;
const day = (s: unknown) => {
  const d = new Date(String(s || ""));
  return isNaN(d.getTime()) ? "-" : d.toLocaleDateString("ko-KR", {timeZone: "Asia/Seoul"});
};

export const onRefundRequest = onDocumentCreated(
  {document: "refundRequests/{reqId}"},
  async (event) => {
    const r = event.data?.data();
    if (!r) return;
    try {
      const church = String(r.churchName || r.slug || "이름 미등록 교회");
      // 1년치 한 번에 결제 신청(AnnualRequest, 계좌이체 · 11개월 값) — 운영자가 입금 안내 → 입금 확인 → 이용 기간 12개월 연장
      if (r.kind === "annualRequest") {
        const rowsA = [
          ["교회명", esc(church)],
          ["요금제", `<b>${esc(String(r.planLabel || "-"))}</b> (월 ${won(r.monthly)})`],
          ["1년 금액", `<b style="color:#2563EB">${won(r.amount)}</b> <span style="color:#8b95a1;text-decoration:line-through">${won(r.fullAmount)}</span> (1개월 무료)`],
          ["결제 방법", esc(String(r.method || "계좌이체"))],
          ["담당자", esc(String(r.contactName || "-"))],
          ["연락처", esc(String(r.contactPhone || "-"))],
          ["요청 사항", esc(String(r.memo || "-"))],
          ["지금 정기결제", r.recurringActive ? "사용 중" : "없음"],
          ["신청 시각", esc(String(r.requestedAtText || ""))],
        ].map(([k, v]) => `<tr><td style="padding:6px 0;color:#8b95a1;font-size:13px;width:100px;vertical-align:top">${k}</td><td style="padding:6px 0;color:#333d4b;font-size:14px">${v}</td></tr>`).join("");
        const todo = "① 담당자에게 입금 계좌와 금액을 안내해 주세요.<br>② 입금을 확인하면 /super › 가입자 현황에서 이 교회 이용 기간을 <b>+12개월</b> 늘려 주세요." +
          (r.recurringActive ? "<br>③ 지금 정기결제를 쓰고 있어요 — <b>정기결제를 해지</b>해 두 번 결제되지 않게 해 주세요." : "") +
          "<br><span style=\"color:#8b95a1\">환불 규정(교회 동의함): 결제 후 7일 이내 100% · 14일 이내 50% · 15일부터 환불 불가</span>";
        const htmlA =
          "<div style=\"background:#f2f4f6;padding:30px 15px;font-family:sans-serif\">" +
          "<div style=\"max-width:520px;margin:0 auto;background:#fff;border-radius:24px;padding:32px\">" +
          "<div style=\"width:40px;height:4px;background:#2563EB;margin-bottom:20px\"></div>" +
          `<h2 style="font-size:20px;margin:0 0 20px;line-height:1.4">${r.test ? "[테스트] " : ""}📅 ${esc(church)}가 1년치 결제를 신청했습니다</h2>` +
          `<table style="width:100%;border-collapse:collapse;margin-bottom:20px">${rowsA}</table>` +
          `<div style="padding:14px 16px;border-radius:14px;background:#EFF6FF;color:#1E3A8A;font-size:13.5px;line-height:1.7"><b>할 일</b><br>${todo}</div>` +
          "</div></div>";
        await sendAdminEmail(`${r.test ? "[테스트] " : ""}[STAYON 1년 결제 신청] ${church} · ${String(r.planLabel || "")} · ${won(r.amount)}`, htmlA);
        console.log("[1년 결제 신청 알림]", event.params.reqId);
        return;
      }
      // 주보 플랫폼 1년 완납 "물이 포도주로" 1개월 무료 쿠폰(WineJars) — 현금 환급 없음, 13번째 달 결제를 환불
      const jar = r.kind === "jarCoupon";
      const payments = Array.isArray(r.payments) ? r.payments as Record<string, unknown>[] : [];
      const total = payments.reduce((sum, p) => sum + Number(p.paid || 0), 0);
      const site = r.slug ? `https://${String(r.slug)}.stayon-platform.com/` : "";
      const info = [
        ["교회명", esc(church)],
        ["요금제", esc(String(r.planName || "-"))],
        ["고른 방식", `<b style="color:#7C3AED">${esc(String(r.choiceLabel || (r.choice === "extend" ? "결제 없이 1개월 추가 이용 + 커피 쿠폰" : `현금으로 ${won(r.refund)} 환급`)))}</b>`],
        ...(jar ? [] : [["환급 금액", won(r.refund)]]),
        ["다음 결제 예정", r.recurringActive ? `${day(r.nextBillingAt)} (정기결제 중)` : "정기결제 없음"],
        ["정기결제 시작", day(r.cycleStartedAt)],
        ["요청 시각", esc(String(r.requestedAtText || ""))],
        ["홈페이지", site ? `<a href="${site}" style="color:#2563EB">${site}</a>` : "-"],
      ].map(([k, v]) => `<tr><td style="padding:6px 0;color:#8b95a1;font-size:13px;width:100px;vertical-align:top">${k}</td><td style="padding:6px 0;color:#333d4b;font-size:14px">${v}</td></tr>`).join("");
      const rows = payments.map((p, i) =>
        `<tr><td style="padding:7px 6px 7px 0;border-top:1px solid #f2f4f6;font-size:12.5px;color:#8b95a1;width:28px">${i + 1}</td>` +
        `<td style="padding:7px 6px;border-top:1px solid #f2f4f6;font-size:12.5px;color:#333d4b">${day(p.paidAt)}<br><span style="color:#8b95a1">${esc(String(p.orderName || ""))}</span></td>` +
        `<td style="padding:7px 0;border-top:1px solid #f2f4f6;font-size:12.5px;color:#333d4b;text-align:right;white-space:nowrap">${won(p.paid)}</td></tr>`).join("");
      const html =
        "<div style=\"background:#f2f4f6;padding:30px 15px;font-family:sans-serif\">" +
        "<div style=\"max-width:520px;margin:0 auto;background:#fff;border-radius:24px;padding:32px\">" +
        "<div style=\"width:40px;height:4px;background:#7C3AED;margin-bottom:20px\"></div>" +
        `<h2 style="font-size:20px;margin:0 0 20px;line-height:1.4">${r.test ? "[테스트] " : ""}${jar ? `🍷 ${esc(church)}가 주보 1년 완납 — 1개월 무료 쿠폰이 지급됐습니다` : `🍇 ${esc(church)}가 1년 완납 환급을 요청했습니다`}</h2>` +
        `<table style="width:100%;border-collapse:collapse;margin-bottom:22px">${info}</table>` +
        (jar ?
          "<div style=\"margin:0 0 20px;padding:14px 16px;border-radius:14px;background:#FFF1F2;color:#9F1239;font-size:13.5px;line-height:1.7\"><b>할 일</b><br>" +
          (r.recurringActive ? `${day(r.nextBillingAt)} 정기결제(${won(r.amount)})가 나가면 포트원에서 <b>그 결제를 환불</b>해 주세요.` : "이용 기간을 1개월 늘려 주세요.") +
          "</div>" :
          r.choice === "extend" ?
            "<div style=\"margin:0 0 20px;padding:14px 16px;border-radius:14px;background:#FFFBEB;color:#92400E;font-size:13.5px;line-height:1.7\"><b>할 일</b><br>" +
          (r.recurringActive ? `① ${day(r.nextBillingAt)} 정기결제가 나가면 포트원에서 <b>그 결제를 취소</b>해 주세요.<br>` : "① 이용 기간을 1개월 늘려 주세요.<br>") +
          (jar ? "" : "② 커피 쿠폰을 보내 주세요.") + "</div>" :
            "<div style=\"margin:0 0 20px;padding:14px 16px;border-radius:14px;background:#F5F3FF;color:#5B21B6;font-size:13.5px;line-height:1.7\"><b>할 일</b><br>결제 내역을 확인한 뒤 포트원 부분 취소 또는 계좌 입금으로 환급해 주세요.</div>") +
        `<p style="font-size:15px;font-weight:800;color:#191f28;margin:0 0 8px">나무에 들어간 결제 ${payments.length}건 · 합계 ${won(total)}</p>` +
        `<table style="width:100%;border-collapse:collapse">${rows}</table>` +
        "<p style=\"margin-top:20px;font-size:12.5px;color:#8b95a1;line-height:1.6\">현금 환급이면 포트원 관리자 화면에서 결제 내역을 확인한 뒤 부분 취소 또는 계좌 입금으로, 1개월 추가 이용이면 이용 기간 연장과 커피 쿠폰 발송으로 처리해 주세요. 처리한 뒤 refundRequests 문서의 status를 \"done\"으로 바꾸면 교회 화면에 \"환급을 마쳤어요\"로 표시돼요.</p>" +
        "</div></div>";
      await sendAdminEmail(`${r.test ? "[테스트] " : ""}${jar ? `[STAYON 1개월 무료 쿠폰] ${church} · 주보 1년 완납` : `[STAYON 환급 요청] ${church} · ${r.choice === "extend" ? "1개월 추가 + 커피 쿠폰" : `현금 ${won(r.refund)}`}`}`, html);
      console.log("[환급 요청 알림]", event.params.reqId);
    } catch (e) {
      console.error("[환급 요청 알림 실패]", event.params.reqId, e);
    }
  }
);
