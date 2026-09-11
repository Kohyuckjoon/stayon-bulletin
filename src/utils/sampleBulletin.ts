// "커스텀 디자인" 탭의 아이폰 미리보기에 넣는 고정 예시(데모) 주보 데이터.
// 실제 교회 데이터가 아니라 항상 똑같은 샘플이며, 템플릿의 시각 스타일이 잘 드러나도록
// 딱 필요한 섹션만 채운다: 교회 로고 · 예배 순서 · 교회 소식 · 예배 시간 안내 ·
// 온라인 헌금 안내 · 주제 성구 · 섬기는 사람들 · 오시는 길.
// 사진/지도 등도 실제 주보와 비슷한 밀도로 보이도록 SVG data URI로 채워 넣는다.

const svgUri = (svg: string) => `data:image/svg+xml,${encodeURIComponent(svg.replace(/\s+/g, " ").trim())}`;

// 교회 로고 (십자가 + "은혜교회" 워드마크)
const SAMPLE_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="88" viewBox="0 0 360 88">
  <g fill="#2F5C52">
    <rect x="38" y="14" width="11" height="60" rx="2"/>
    <rect x="22" y="32" width="43" height="11" rx="2"/>
  </g>
  <text x="86" y="55" font-family="'Apple SD Gothic Neo','Malgun Gothic',sans-serif" font-size="36" font-weight="800" fill="#1F241F">은혜교회</text>
</svg>`;
export const SAMPLE_CHURCH_LOGO = svgUri(SAMPLE_LOGO_SVG);

// 섬기는 사람들 프로필 (모노그램 아바타)
const avatar = (initial: string, from: string, to: string) =>
  svgUri(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="240" viewBox="0 0 200 240">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>
    </linearGradient></defs>
    <rect width="200" height="240" fill="url(#g)"/>
    <text x="100" y="140" text-anchor="middle" font-family="'Apple SD Gothic Neo','Malgun Gothic',sans-serif" font-size="96" font-weight="800" fill="#ffffff" fill-opacity="0.92">${initial}</text>
  </svg>`);

// 오시는 길 약도 이미지 (간단한 지도 느낌)
const SAMPLE_MAP = svgUri(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">
  <rect width="640" height="480" fill="#EEF1F0"/>
  <g stroke="#DDE3E2" stroke-width="14" fill="none">
    <path d="M-20 150 H660"/><path d="M-20 340 H660"/>
    <path d="M180 -20 V500"/><path d="M440 -20 V500"/>
  </g>
  <g stroke="#E9DFC9" stroke-width="26" fill="none"><path d="M-20 250 L680 210"/></g>
  <circle cx="320" cy="235" r="34" fill="#2F5C52"/>
  <circle cx="320" cy="235" r="13" fill="#ffffff"/>
  <path d="M320 300 l-20 -34 h40 z" fill="#2F5C52"/>
</svg>`);

export const SAMPLE_BULLETIN: Record<string, any> = {
  // 히어로 헤더
  title: "우리를 부르시는 은혜",
  subtitle: "주일 낮 예배",
  date: "2026년 3월 8일 주일",
  scripture: "에베소서 2:8-10",
  preacher: "김성실 목사",
  backgroundImage: "/background_image_3.png",

  // 교회 로고
  churchLogo: SAMPLE_CHURCH_LOGO,
  churchLogoEnabled: true,

  // 예배 시간 안내
  sundayServices: [
    { name: "주일 1부 예배", time: "오전 9:00", location: "본당" },
    { name: "주일 2부 예배", time: "오전 11:00", location: "본당" },
    { name: "주일 오후 예배", time: "오후 2:00", location: "교육관 3층" },
  ],

  // 예배 순서
  sections: [
    { id: "s1", label: "예배로의 부름", value: "인도자", preview: "시편 100:1-2" },
    {
      id: "s2",
      label: "찬송",
      value: "다 함께",
      preview: "찬송가 383장\n〈눈을 들어 하늘 보라〉",
    },
    {
      id: "s3",
      label: "신앙고백",
      value: "다 함께",
      preview: "사도신경",
      content:
        "전능하사 천지를 만드신 하나님 아버지를 내가 믿사오며,\n그 외아들 우리 주 예수 그리스도를 믿사오니\n이는 성령으로 잉태하사 동정녀 마리아에게 나시고...\n\n(사도신경 전문)",
    },
    { id: "s4", label: "찬양", value: "시온 찬양대", preview: "〈주 은혜임을〉" },
    {
      id: "s5",
      label: "말씀 선포",
      value: "김성실 목사",
      preview: "에베소서 2:8-10\n〈오직 은혜로〉",
      content:
        "8 너희는 그 은혜에 의하여 믿음으로 말미암아 구원을 받았으니 이것은 너희에게서 난 것이 아니요 하나님의 선물이라\n9 행위에서 난 것이 아니니 이는 누구든지 자랑하지 못하게 함이라\n10 우리는 그가 만드신 바라...",
    },
    { id: "s6", label: "봉헌 / 광고", value: "다 함께" },
    { id: "s7", label: "축도", value: "김성실 목사" },
  ],

  // 교회 소식
  announcements: [
    {
      id: "a1",
      title: "새가족을 환영합니다",
      content:
        "이번 주 처음 오신 분들을 진심으로 환영합니다. 예배 후 1층 새가족실에서 담당 교역자와 짧은 만남의 시간을 가져요. 등록카드는 안내석에 준비되어 있습니다.",
    },
    {
      id: "a2",
      title: "봄 성경학교 (3/22)",
      content:
        "3월 22일 주일 오후 2시부터 전 교인 대상 봄 성경학교가 열립니다. 주제는 ‘은혜로 사는 삶’입니다. 점심 식사 후 본당에서 모입니다.",
    },
    {
      id: "a3",
      title: "수요 기도회 안내",
      content: "매주 수요일 저녁 7시 30분, 본당에서 함께 기도합니다. 자녀들을 위한 어린이 기도방도 운영합니다.",
    },
    {
      id: "a4",
      title: "구역 예배 재편성",
      content: "새 학기를 맞아 구역이 새롭게 편성되었습니다. 소속 구역은 주보 뒷면 또는 홈페이지에서 확인하실 수 있습니다.",
    },
  ],

  // 온라인 헌금 안내
  bankName: "국민은행",
  accountNumber: "123456-04-567890",
  accountHolder: "은혜교회",

  // 주제 성구
  mottoEnabled: true,
  mottoLabelType: "verse",
  mottoText: "너희는 그 은혜에 의하여 믿음으로 말미암아 구원을 받았으니 이것은 너희에게서 난 것이 아니요 하나님의 선물이라",
  mottoReference: "에베소서 2:8",

  // 섬기는 사람들
  ministersEnabled: true,
  ministers: [
    {
      id: "m1",
      name: "김성실",
      role: "담임목사",
      photoUrl: avatar("김", "#3E6B60", "#274E45"),
      description:
        "말씀과 기도로 성도들을 섬기며, 다음 세대를 세우는 일에 마음을 쏟고 있습니다. 매주 수요일 오후 심방을 나갑니다.",
    },
    {
      id: "m2",
      name: "이소망",
      role: "찬양 인도",
      photoUrl: avatar("이", "#4C6A8A", "#324B66"),
      description: "매 주일 예배 찬양을 준비하고, 청년부 찬양팀을 함께 훈련합니다.",
    },
    {
      id: "m3",
      name: "박믿음",
      role: "교육부 전도사",
      photoUrl: avatar("박", "#8A6A4C", "#5E4632"),
      description: "유년부와 중고등부 아이들의 신앙 교육을 담당하고 있습니다.",
    },
  ],

  // 오시는 길
  addressEnabled: true,
  churchAddress: "서울특별시 종로구 새문안로 12",
  churchAddressDetail: "은혜빌딩 2층 (지하철 5호선 서대문역 4번 출구 도보 5분)",
  locationImage: SAMPLE_MAP,
  locationImageRatio: "4:3",

  // 커스텀 디자인 미리보기 전용 표시 (BulletinView 가 샘플 모드임을 알 수 있게)
  isSample: true,
};
