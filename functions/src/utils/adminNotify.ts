import * as nodemailer from "nodemailer";

// 정기결제(빌링) 전용 — 교회(성도) 본인에게 직접 보내는 메일. 기존
// sendAdminEmail/sendMailNotification은 전부 "관리자(gmailUser) 자신에게"
// 보내는 알림용이라, 결제 3일 전 안내·실패/해지 안내처럼 고객에게 직접
// 보내야 하는 메일은 이 함수로 완전히 분리한다. 기존 두 함수는 그대로 둠.
export const sendCustomerEmail = async (
  to: string,
  subject: string,
  htmlContent: string
) => {
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_PASS;

  if (!to) {
    console.error("❌ 수신자 이메일이 없어 발송을 건너뜁니다:", subject);
    return;
  }
  if (!gmailUser || !gmailPass) {
    console.error("❌ GMAIL_USER 또는 GMAIL_PASS 환경변수가 설정되지 않았습니다.");
    return;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {user: gmailUser, pass: gmailPass},
  });

  try {
    const info = await transporter.sendMail({
      from: `"STAYON 스테이온" <${gmailUser}>`,
      to,
      subject,
      html: htmlContent,
    });
    console.log(`[고객 이메일 전송 성공] ${subject} → ${to}, 응답: ${info.response}`);
  } catch (err) {
    console.error("❌ 고객 이메일 전송 오류 상세:", err);
  }
};

export const sendAdminEmail = async (
  subject: string,
  htmlContent: string
) => {
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_PASS;

  // 환경변수 누락 시 확실히 에러 로그를 남기도록 수정
  if (!gmailUser || !gmailPass) {
    console.error("❌ GMAIL_USER 또는 GMAIL_PASS 환경변수가 설정되지 않았습니다.");
    return;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: gmailUser,
      pass: gmailPass, // 구글 계정 비밀번호가 아니라 '앱 비밀번호(16자리)'
    },
  });

  const mailOptions = {
    from: `"주보 플랫폼 관리자" <${gmailUser}>`,
    to: gmailUser,
    subject: subject,
    html: htmlContent,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`[이메일 전송 성공] ${subject}, 응답: ${info.response}`);
  } catch (err) {
    console.error("❌ 이메일 전송 오류 상세:", err);
  }
};

// "YYYY-MM-DD" → "토" 같은 한글 요일. 형식이 어긋나면 빈 문자열.
const koreanDayOfWeek = (dateStr: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((dateStr || "").trim());
  if (!m) return "";
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (isNaN(d.getTime())) return "";
  return ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
};

export const sendMailNotification = async (
  type: "JOIN" | "PAYMENT" | "BULLETIN_PUBLISH" | "BULLETIN_UPDATE",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any,
) => {
  let title = "";
  let color = "#3182f6";
  let fields: { title: string; value: string }[] = [];
  let footerLink = "";

  switch (type) {
  case "JOIN":
    title = "🎉 주보 플랫폼에 새로운 교회 가족이 합류했습니다!";
    fields = [
      {title: "교회명", value: data.churchName},
      {title: "부서", value: data.department},
      {title: "성도 수", value: data.congregationSize},
      {title: "담임목사님", value: data.seniorPastorName},
      {title: "가입자 성함", value: data.userName},
      {title: "직분", value: data.userRole},
      {title: "연락처", value: data.phone},
      {title: "이메일", value: data.email},
      {title: "가입 일시", value: data.date},
    ];
    break;

  case "PAYMENT":
    title = "💳 새로운 주보 플랜 결제가 완료되었습니다!";
    color = "#2b8a3e";
    fields = [
      {title: "교회명 / 담당자", value: data.buyerName},
      {title: "이메일", value: data.buyerEmail},
      {title: "선택 플랜", value: data.planName},
      {title: "결제 금액", value: `${data.amount}원`},
      {title: "결제 일시", value: data.date},
    ];
    break;

  case "BULLETIN_PUBLISH":
  case "BULLETIN_UPDATE": {
    const isUpdate = type === "BULLETIN_UPDATE";
    const churchName = String(data.churchName || "이름 미등록 교회");
    const dow = koreanDayOfWeek(String(data.date || ""));
    const dateLabel = dow ?
      `${data.date} (${dow})` :
      String(data.date || "-");

    title = isUpdate ?
      `🔄 ${churchName}가 ${dateLabel} 주보를 업데이트했습니다!` :
      `📢 ${churchName}가 ${dateLabel} 주보를 발행했습니다!`;
    color = isUpdate ? "#e8590c" : "#3182f6";
    fields = [
      {title: "교회명", value: churchName},
      {title: "주보 날짜", value: dateLabel},
      {title: "담임목사", value: String(data.pastorName || "-")},
      {
        title: "구분",
        value: isUpdate ? "재발행(업데이트)" : "신규 발행",
      },
    ];
    if (data.bulletinId) {
      const url =
        "https://bulletin.stayon-platform.com/view/" + data.bulletinId;
      footerLink =
        "<div style=\"margin-top:20px;text-align:center;\">" +
        "<a href=\"" + url + "\" style=\"display:inline-block;" +
        "background:" + color + ";color:#fff;text-decoration:none;" +
        "font-size:14px;font-weight:600;padding:12px 24px;" +
        "border-radius:12px;\">주보 보기</a></div>";
    }
    break;
  }
  }

  let fieldsHtml = "";
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    fieldsHtml +=
      "<div style=\"margin-bottom: 16px; " +
      "padding-bottom: 12px; " +
      "border-bottom: 1px solid #f2f4f6;\">" +
      "<div style=\"font-size: 13px; " +
      "color: #8b95a1; margin-bottom: 4px;\">" +
      f.title + "</div>" +
      "<div style=\"font-size: 16px; " +
      "color: #333d4b; font-weight: 500; " +
      "white-space: pre-wrap;\">" +
      f.value + "</div></div>";
  }

  const timeStr = new Date().toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
  });

  const emailHtml =
    "<div style=\"background-color: #f2f4f6; " +
    "padding: 30px 15px; font-family: sans-serif;\">" +
    "<div style=\"max-width: 500px; margin: 0 auto; " +
    "background: #fff; border-radius: 24px; padding: 32px;\">" +
    "<div style=\"width: 40px; height: 4px; " +
    "background-color: " + color + "; " +
    "margin-bottom: 20px;\"></div>" +
    "<h2 style=\"font-size: 22px; " +
    "margin: 0 0 24px 0;\">" +
    title + "</h2>" +
    "<div style=\"background: #fff;\">" +
    fieldsHtml + "</div>" +
    footerLink +
    "<div style=\"margin-top: 32px; " +
    "font-size: 12px; color: #b0b8c1; " +
    "text-align: center;\">" +
    "주보 플랫폼 관리자 시스템 • " + timeStr +
    "</div></div></div>";

  await sendAdminEmail(`[STAYON 주보플랫폼] ${title}`, emailHtml);
};
