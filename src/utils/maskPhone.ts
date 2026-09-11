// 섬기는 분 상세에 "화면에 보여줄" 번호를 만들 때만 쓴다. 실제 전화/문자 연결(tel:/sms:)은
// 항상 원본 번호를 그대로 쓰고, 이 함수는 오직 눈에 보이는 텍스트만 가운데 자리를 가려서
// 개인정보 노출·스팸/보이스피싱 악용 위험을 줄인다.
export function maskPhoneNumber(phone: string): string {
  if (!phone) return phone;
  const trimmed = phone.trim();
  const parts = trimmed.split("-");
  if (parts.length === 3) {
    return `${parts[0]}-${"*".repeat(parts[1].length)}-${parts[2]}`;
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length <= 7) return trimmed;
  let digitIndex = 0;
  return trimmed.replace(/\d/g, (d) => {
    digitIndex += 1;
    if (digitIndex <= 3 || digitIndex > digits.length - 4) return d;
    return "*";
  });
}
