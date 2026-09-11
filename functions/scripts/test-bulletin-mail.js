/* eslint-disable */
// 로컬에서 "주보 발행 알림" 이메일이 실제로 어떻게 오는지 눈으로 확인하는 스크립트.
// Firestore 트리거를 거치지 않고 sendMailNotification()을 직접 호출한다.
// akhj123akhjk@gmail.com 으로 샘플 메일 2통(발행 / 업데이트)이 실제로 발송됨.
//
// 실행:  node functions/scripts/test-bulletin-mail.js
// (functions 폴더에서 `npm run build` 를 한 번 돌려 lib/ 가 있어야 함)

const fs = require("fs");
const path = require("path");

// functions/.env 를 직접 읽어서 GMAIL_USER / GMAIL_PASS 주입
const envPath = path.join(__dirname, "..", ".env");
fs.readFileSync(envPath, "utf8").split("\n").forEach((line) => {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] = m[2];
});

const { sendMailNotification } = require("../lib/utils/adminNotify");

const sample = {
  churchName: "테스트교회",
  pastorName: "홍길동 목사",
  date: "2026-09-13", // 일요일
  bulletinId: "TEST_bulletin_id_1234",
};

(async () => {
  console.log("1) 신규 발행 메일 발송…");
  await sendMailNotification("BULLETIN_PUBLISH", sample);
  console.log("2) 업데이트 메일 발송…");
  await sendMailNotification("BULLETIN_UPDATE", sample);
  console.log("완료 — akhj123akhjk@gmail.com 받은편지함 확인");
})();
