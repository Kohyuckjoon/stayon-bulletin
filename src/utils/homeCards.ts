// 교회 홈페이지 메인 "바로가기 카드" 4개(처음 오셨나요 · 예배 · 유튜브 · 오시는 길)의 문구.
// 홈페이지 편집 화면 > 홈 화면에서 아래 기본 문구 중 고르거나 직접 입력할 수 있음.
// {교회} 는 화면에서 그 교회 이름으로 바뀜(교회 이름을 바꿔도 문구가 따라감)
export const CHURCH_TOKEN = "{교회}";

// hidden: true면 홈페이지에 그 카드를 아예 안 보여 줌(편집 화면 ON/OFF 토글). 없으면 보임
export interface HomeCardText { title: string; desc: string; hidden?: boolean }

export const HOME_CARD_PRESETS: { key: string; en: string; titles: string[]; descs: string[] }[] = [
  {
    key: "welcome", en: "Welcome !",
    titles: ["처음 오셨나요?", "새가족 안내", "환영합니다"],
    descs: [
      `환영합니다! ${CHURCH_TOKEN} 새가족이 되심을 진심으로 환영합니다.`,
      "처음 오신 분들을 위한 교회 안내입니다.",
      `${CHURCH_TOKEN}는 여러분을 진심으로 환영합니다.`,
    ],
  },
  {
    key: "worship", en: "Worship",
    titles: ["예배 시간 및 장소 안내", "예배 안내", "예배 시간"],
    descs: [
      `${CHURCH_TOKEN}의 예배는 언제나 당신을 기다립니다.`,
      "주일과 주중 예배 시간·장소를 안내합니다.",
    ],
  },
  {
    key: "youtube", en: "Youtube",
    titles: [`${CHURCH_TOKEN} 유튜브 채널`, "온라인 예배", "설교 영상"],
    descs: [
      `멀리서도 가까이 함께하는 ${CHURCH_TOKEN} 예배 유튜브`,
      "언제 어디서나 예배와 설교를 함께할 수 있어요.",
    ],
  },
  {
    key: "location", en: "Location",
    titles: ["찾아오시는 길", "오시는 길", "교회 위치"],
    descs: [
      `${CHURCH_TOKEN} 찾아오시는 길을 안내해 드립니다.`,
      "교회 위치와 주차·차량 운행을 안내합니다.",
    ],
  },
];

// 저장값(없으면 기본 문구) → 화면에 보일 문구({교회} → 교회 이름)
export function homeCardText(saved: unknown, i: number, churchName: string): HomeCardText {
  const preset = HOME_CARD_PRESETS[i];
  const s = (Array.isArray(saved) ? saved[i] : null) as Partial<HomeCardText> | null;
  const title = (typeof s?.title === "string" && s.title.trim()) || preset.titles[0];
  const desc = (typeof s?.desc === "string" && s.desc.trim()) || preset.descs[0];
  const fill = (t: string) => t.split(CHURCH_TOKEN).join(churchName);
  return { title: fill(title), desc: fill(desc) };
}

// 카드를 OFF로 꺼 뒀는지(편집 화면 토글). 저장값이 없으면 켜짐
export function homeCardHidden(saved: unknown, i: number): boolean {
  const s = (Array.isArray(saved) ? saved[i] : null) as Partial<HomeCardText> | null;
  return s?.hidden === true;
}
