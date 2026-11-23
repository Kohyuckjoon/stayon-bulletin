// 교회 홈페이지 상단 로고 자리에 쓰는 교단 마크.
// 마크 이미지 원본은 public/ 바로 아래 교단 CI 파일(01_구세군대한본영.png …), 실제로 쓰는 건
// 그 영문 이름 복사본 public/denomination-logos/{id}.png.
// 파일을 못 불러오면 화면에서 마크만 숨기고 이름은 그대로 보임.
export interface Denomination {
  id: string;
  name: string; // 정식 명칭(선택 목록용). 화면 상단에는 괄호 앞부분만 표시
  logo: string; // public 폴더의 교단 마크 파일
}

// public/ 에 넣어 둔 교단 마크(투명 배경 PNG) 14종과 1:1로 맞춤
export const DENOMINATIONS: Denomination[] = [
  { id: "pck-hapdong", name: "대한예수교장로회(합동)", logo: "10_대한예수교장로회합동.png" },
  { id: "pck-tonghap", name: "대한예수교장로회(통합)", logo: "09_대한예수교장로회통합.png" },
  { id: "pck-kosin", name: "대한예수교장로회(고신)", logo: "07_대한예수교장로회고신.png" },
  { id: "pck-baekseok", name: "대한예수교장로회(백석)", logo: "08_대한예수교장로회백석.png" },
  { id: "pck-hapshin", name: "대한예수교장로회(합신)", logo: "11_대한예수교장로회합신.png" },
  { id: "prok", name: "한국기독교장로회", logo: "13_한국기독교장로회.png" },
  { id: "kmc", name: "기독교대한감리회", logo: "02_기독교대한감리회.png" },
  { id: "kehc", name: "기독교대한성결교회", logo: "03_기독교대한성결교회.png" },
  { id: "jehc", name: "예수교대한성결교회", logo: "12_예수교대한성결교회.png" },
  { id: "nazarene", name: "대한기독교나사렛성결회", logo: "06_대한기독교나사렛성결회.png" },
  { id: "kbc", name: "기독교한국침례회", logo: "05_기독교한국침례회.png" },
  { id: "agk", name: "기독교대한하나님의성회", logo: "04_기독교대한하나님의성회.png" },
  { id: "salvation-army", name: "구세군대한본영", logo: "01_구세군대한본영.png" },
  { id: "kaicam", name: "독립교단(KAICAM)", logo: "14_독립교단_KAICAM.png" },
];

// 아무것도 고르지 않은(예전) 사이트의 기본값 — 예장 합동
export const DEFAULT_DENOMINATION = "pck-hapdong";
export const NO_DENOMINATION = "none";

// 맥에서 만든 한글 파일명(NFD)은 브라우저 주소(NFC)와 달라 서버가 못 찾으므로, 영문 이름 복사본
// (public/denomination-logos/{id}.png)을 쓴다. logo 값은 원본 파일이 무엇인지 기록용
export const denominationLogoSrc = (id: string) => `/denomination-logos/${id}.png`;

// 화면에 보일 교단 이름(2026-11-21): 기본은 괄호 앞부분만("대한예수교장로회"),
// "교단 이름까지 표시"를 켜면 괄호까지("대한예수교장로회(합신)")
export const denominationDisplayName = (d: Denomination, full: boolean) =>
  full ? d.name : d.name.replace(/\s*\(.*\)$/, "");
export const hasDenominationBranch = (d: Denomination | null | undefined) => !!d && /\(.*\)$/.test(d.name);

// 저장값 → 실제로 쓸 교단(사용 안 함이면 null)
export function resolveDenomination(v: unknown): Denomination | null {
  const id = typeof v === "string" && v ? v : DEFAULT_DENOMINATION;
  if (id === NO_DENOMINATION) return null;
  return DENOMINATIONS.find((d) => d.id === id) || DENOMINATIONS[0];
}
