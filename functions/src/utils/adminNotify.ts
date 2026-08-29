import * as nodemailer from "nodemailer";

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

export const sendMailNotification = async (
  type: "JOIN" | "PAYMENT",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any
) => {
  let title = "";
  let color = "#3182f6";
  let fields: { title: string; value: string }[] = [];

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
    "<div style=\"margin-top: 32px; " +
    "font-size: 12px; color: #b0b8c1; " +
    "text-align: center;\">" +
    "주보 플랫폼 관리자 시스템 • " + timeStr +
    "</div></div></div>";

  await sendAdminEmail(`[STAYON 주보플랫폼] ${title}`, emailHtml);
};
