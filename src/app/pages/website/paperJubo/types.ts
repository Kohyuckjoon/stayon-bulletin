// 종이 주보 만들기(2026-11-17) — A4 가로 한 장 양면 인쇄 후 반으로 접는 4면 주보.
//  바깥면 = [4면(뒷면) | 1면(표지)], 안쪽면 = [2면 | 3면]. 한 면 크기는 A5(148.5 × 210mm)
// 저장 위치: churchSites/{주소}.paperJubo (홈페이지 편집 화면 > "교회 주보" 탭)

export type PjBlockType = "cover" | "list" | "order" | "kv" | "text";
export type PjMarker = "number" | "bullet" | "none";

export interface PjRow { label: string; value: string }

export interface PjCover {
  founded: string; issue: string; date: string;
  motto: string;      // 표어(교회비전 등) 큰 글씨
  slogan: string;     // 표어 아래 짧은 문구
  verse: string; verseRef: string;
  lines: string[];    // 1. 예배로! 같은 짧은 줄
  denomination: string; churchName: string; englishName: string;
  pastor: string; phone: string; address: string; email: string;
  imageUrl: string;   // 표지 사진(선택)
}

export interface PjBlock {
  id: string;
  type: PjBlockType;
  title: string;
  subtitle?: string;  // 제목 오른쪽 작은 글씨(예배 시간 등)
  note?: string;      // 제목 아래 오른쪽 정렬 한 줄(인도 : ○○○ 목사)
  marker?: PjMarker;  // 목록 앞 표시
  items?: string[];   // 목록 줄
  rows?: PjRow[];     // 순서(점선)·항목(왼쪽:오른쪽)
  text?: string;      // 글
  cover?: PjCover;
  col?: 1 | 2;        // 2단 면에서 왼쪽(1, 기본)/오른쪽(2) 단
}

export interface PjPage { columns: 1 | 2; blocks: PjBlock[] }

// 디자인 테마(themes.ts). "modern"은 예전 저장값 — 화면에선 02 모던 네이비로 보임
export type PjTemplate = "classic" | "modern" | "navy" | "minimal" | "arch" | "charcoal" | "stripe" | "photo";

export interface PaperJubo {
  template: PjTemplate;
  color: string;
  pages: PjPage[]; // 항상 4개: [1면 표지, 2면, 3면, 4면 뒷면]
  updatedAt?: number;
}

export const PAGE_NAMES = ["1면 (표지)", "2면 (안쪽 왼쪽)", "3면 (안쪽 오른쪽)", "4면 (뒷면)"];
export const BLOCK_LABELS: Record<PjBlockType, string> = {
  cover: "표지", list: "목록", order: "예배 순서(점선)", kv: "항목 : 내용", text: "글",
};

let seq = 0;
export const newId = () => `b${Date.now().toString(36)}${(seq++).toString(36)}`;

export function emptyBlock(type: PjBlockType): PjBlock {
  const id = newId();
  switch (type) {
    case "cover": return { id, type, title: "표지", cover: emptyCover() };
    case "list": return { id, type, title: "제목", marker: "number", items: [""] };
    case "order": return { id, type, title: "예배", subtitle: "", note: "", rows: [{ label: "", value: "" }] };
    case "kv": return { id, type, title: "제목", rows: [{ label: "", value: "" }] };
    case "text": return { id, type, title: "제목", text: "" };
  }
}

export function emptyCover(): PjCover {
  return {
    founded: "", issue: "", date: "", motto: "", slogan: "", verse: "", verseRef: "", lines: [],
    denomination: "", churchName: "", englishName: "", pastor: "", phone: "", address: "", email: "", imageUrl: "",
  };
}

export function emptyJubo(churchName = ""): PaperJubo {
  const cover = emptyBlock("cover");
  cover.cover!.churchName = churchName;
  return { template: "classic", color: "#1B3A6B", pages: [
    { columns: 1, blocks: [cover] },
    { columns: 1, blocks: [emptyBlock("order")] },
    { columns: 1, blocks: [emptyBlock("text")] },
    { columns: 1, blocks: [emptyBlock("list")] },
  ] };
}

// 예시 데이터: 스테이온교회 예시 주보(실제 주보 형식을 옮기고 교회 이름·담임목사·비전은 예시로 바꿈)
export function sampleJubo(): PaperJubo {
  const b = (x: Omit<PjBlock, "id">): PjBlock => ({ id: newId(), ...x });
  return {
    template: "classic",
    color: "#1B3A6B",
    pages: [
      // 1면 표지
      { columns: 1, blocks: [b({ type: "cover", title: "표지", cover: {
        founded: "설립 2006. 1. 1.", issue: "제2026-46", date: "2026. 11. 15.",
        motto: "교회비전 : “예배로 하나 되는 교회”", slogan: "“여호와를 기뻐하라!”",
        verse: "또 여호와를 기뻐하라 그가 네 마음의 소원을 이루어 주시리로다", verseRef: "시편37:4",
        lines: ["1. 예배로!", "2. 말씀과 기도로!", "3. 섬김과 헌신으로!", "4. 복음전도로!"],
        denomination: "대한예수교장로회(고신)", churchName: "스테이온교회", englishName: "STAYON CHURCH",
        pastor: "담임목사 : 스테이온 목사", phone: "교회 311-6979  010-5701-0406",
        address: "대구광역시 북구 매전로 73 휴먼시아1단지", email: "cws0406@hanmail.net", imageUrl: "",
      } })] },
      // 2면: 예배 순서
      { columns: 2, blocks: [
        b({ type: "order", title: "주일축제예배", subtitle: "오전 11:00", note: "인도 : 스테이온 목사", rows: [
          { label: "* 입례송", value: "다같이" }, { label: "* 예배로의 부름", value: "다같이" }, { label: "* 기원", value: "인도자" },
          { label: "신앙고백", value: "사도신경" }, { label: "찬송 26장 589장", value: "다같이" }, { label: "기도", value: "최원직 집사" },
          { label: "성경봉독 요3:14-17", value: "인도자" }, { label: "특송", value: "셀" }, { label: "말씀선포 『쳐다보면 살리라!』", value: "스테이온 목사" },
          { label: "찬송 588장", value: "다같이" }, { label: "봉헌", value: "다같이" }, { label: "봉헌 및 목회기도", value: "스테이온 목사" },
          { label: "광고", value: "인도자" }, { label: "* 찬송 635장", value: "다같이" }, { label: "* 축도", value: "스테이온 목사" },
        ] }),
        b({ type: "order", col: 2, title: "주일오후경배와찬양", subtitle: "오후 2:00", note: "인도 : 스테이온 목사", rows: [
          { label: "경배와 찬양", value: "다같이" }, { label: "통성기도", value: "다같이" }, { label: "성경봉독 사46:11", value: "인도자" },
          { label: "말씀선포 『내가 시행하리라!』", value: "최기수 목사" }, { label: "찬송 438장", value: "다같이" }, { label: "축도", value: "스테이온 목사" },
        ] }),
        b({ type: "order", col: 2, title: "수요부흥예배", subtitle: "오후 7:30", note: "인도 : 최유라 전도사", rows: [
          { label: "찬송", value: "179장 365장" }, { label: "성경본문", value: "고후12:7-10" }, { label: "말씀선포", value: "『약할 때 강함 되시는!』" },
        ] }),
        b({ type: "text", col: 2, title: "새벽영성기도회 · 금요기도회", text: "새벽영성기도회 오전 5:30 (인도 : 스테이온 목사)\n금요회복과치유기도회 오후 8:30\n*** 금요기도회 후 토요새벽기도회는 모이지 않습니다!" }),
      ] },
      // 3면: 1분 명상 · 기도제목 · 섬김이
      { columns: 1, blocks: [
        b({ type: "text", title: "1분 명상", subtitle: "“감사…과!”", text: "아침 식탁에서 정말 맛있는 사과를 먹었습니다. “사과가 이렇게 맛있다니” 하다가 옆의 대봉감이 눈에 들어와 나란히 놓고 찰칵 사진을 찍으며 “감사…과” 말했더니 남편이 딱 알아듣고 킥킥 웃었습니다. 듣고 보니 모두 선물로 받은 것입니다. 감사하지 않으면 기쁨이 썩습니다. 이 아삭한 기쁨을 오래 간직하고 싶습니다. (정신실)" }),
        b({ type: "list", title: "교회를 위한 기도제목", marker: "number", items: [
          "담임목사의 영성과 목회를 위하여", "스테이온교회가 전도와 선교의 복음전파와 이웃을 섬기는 사명을 잘 감당하게 하소서!",
          "스테이온교회에 성령의 강력한 기름 부으심의 은혜를 허락하소서!", "문화교실과 전도활동을 통한 전도의 열매가 있게 하소서!",
          "성도들 마다 복음의 능력, 성령의 능력을 체험케 하소서!", "일꾼을 보내어 주소서",
        ] }),
        b({ type: "kv", title: "교회 섬김이", rows: [
          { label: "목사", value: "스테이온 목사 010-5701-0406" }, { label: "반주자", value: "최예은" }, { label: "차량봉사", value: "최예진" },
        ] }),
        b({ type: "kv", title: "성경읽기 · 가정예배", rows: [
          { label: "성경읽기 목표", value: "50독(전교인) / 현재 18독" }, { label: "가정예배 찬송", value: "379장" }, { label: "가정예배 성경", value: "요3:14-17" },
        ] }),
      ] },
      // 4면 뒷면: 교회소식 · 예물 · 이달의 행사 · 프로그램
      { columns: 2, blocks: [
        b({ type: "list", title: "교회소식", marker: "number", items: [
          "스테이온교회를 찾아 주신 모든 분들을 진심으로 환영합니다. 등록하시고 예배 후에 목사님을 꼭 만나고 돌아가시기 바랍니다.",
          "전도 : 목요전도를 하고 있습니다. 각자의 자리에서 전도해 주시고 기도해 주세요.",
          "다니엘기도회 : 1일부터 21일(토)까지 다니엘기도회로 모입니다. (저녁 8:00)",
          "추수감사주일 : 오늘은 추수감사주일과 총동원전도주일입니다.",
          "성찬식 : 다음 주일에는 성찬식이 있습니다. 거룩함과 기도로 준비해 주시기 바랍니다.",
        ] }),
        b({ type: "kv", title: "향기로운 예물", rows: [
          { label: "십일조", value: "스테이온 목사" }, { label: "감사헌금", value: "박미숙 조병곤(최태숙) 조정제 최원직(김관선)" },
          { label: "주일헌금", value: "류로미 박미숙 박혜정 조병곤(최태숙)" }, { label: "선교헌금", value: "스테이온 목사" },
        ] }),
        b({ type: "list", col: 2, title: "이 달의 행사", marker: "none", items: [
          "11월 01일 전도회월례회 다니엘기도회", "11월 15일 추수감사주일 총동원전도주일", "11월 27일 총동원금요기도회",
        ] }),
        b({ type: "list", col: 2, title: "PROGRAM GUIDE", marker: "bullet", items: [
          "양육반 : 열린모임 · 새가족반(4주) · 양육의기쁨", "사역반 : 제자훈련 · 중보기도학교 · 군사훈련 · 재생산훈련", "전도특공대 · 중보기도특공대",
        ] }),
        b({ type: "list", col: 2, title: "함께 기도해요", marker: "bullet", items: [
          "모든민족선교회(조선족선교회)", "김주오 선교사", "김지영 선교사", "부산한샘교회", "천안주안교회", "컴패션(필리핀)",
        ] }),
      ] },
    ],
  };
}
