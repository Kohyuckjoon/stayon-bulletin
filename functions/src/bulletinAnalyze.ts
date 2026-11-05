// 종이 주보 자동 분석: 교회가 빌더에서 올린 주보 파일(PDF·사진·한글·워드)을
// Claude로 읽어서 설교·교회 소식·기본 정보를 뽑아 돌려줌.
// 저장은 하지 않음 — 빌더 확인 화면에서 교회가 고른 것만 빌더에 채워지고,
// 교회가 '저장'을 눌러야 홈페이지에 반영됨. 온라인 주보 데이터는 건드리지 않음.
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as zlib from "zlib";
import Anthropic from "@anthropic-ai/sdk";
import JSZip from "jszip";
import * as CFB from "cfb";

const MODEL = "claude-opus-5-5";
const DAILY_LIMIT = 10; // 교회(계정) 하나당 하루 분석 횟수 — API 비용 상한
const MAX_TEXT_CHARS = 200000;
const MAX_FILE_BYTES = 30 * 1024 * 1024;

/** 교회에게 그대로 보여줄 안내 문구가 담긴 오류 */
class UserError extends Error {}

// ── 파일 → 글자 ──────────────────────────────────────────────────

/**
 * 한글(HWP 5.0) 본문 글자.
 * @param {Buffer} buf 파일 내용
 * @return {string} 본문 글자
 */
function hwpText(buf: Buffer): string {
  const cfb = CFB.read(buf, {type: "buffer"});
  const header = CFB.find(cfb, "/FileHeader");
  const flags = header?.content ?
    Buffer.from(header.content as Uint8Array).readUInt32LE(36) : 0;
  const compressed = (flags & 1) !== 0;
  const encrypted = (flags & 2) !== 0;
  const distribution = (flags & 4) !== 0;
  if (encrypted) {
    throw new UserError(
      "암호가 걸린 한글 파일은 읽을 수 없어요. 암호를 풀고 다시 올려주세요.");
  }

  const out: string[] = [];
  if (!distribution) {
    for (let i = 0; ; i++) {
      const sec = CFB.find(cfb, `/BodyText/Section${i}`);
      if (!sec?.content) break;
      let data = Buffer.from(sec.content as Uint8Array);
      if (compressed) data = zlib.inflateRawSync(data);
      out.push(hwpSectionText(data));
    }
  }
  const text = out.join("\n").trim();
  if (text) return text;
  // 배포용 문서 등 본문을 못 읽으면 미리보기 글자(앞부분 일부)라도
  const prv = CFB.find(cfb, "/PrvText");
  return prv?.content ?
    Buffer.from(prv.content as Uint8Array).toString("utf16le").trim() : "";
}

/**
 * HWP 본문 섹션에서 문단 글자 레코드(HWPTAG_PARA_TEXT)만 모음.
 * @param {Buffer} data 압축 푼 섹션
 * @return {string} 섹션 글자
 */
function hwpSectionText(data: Buffer): string {
  const PARA_TEXT = 67;
  const lines: string[] = [];
  let pos = 0;
  while (pos + 4 <= data.length) {
    const h = data.readUInt32LE(pos);
    pos += 4;
    const tag = h & 0x3ff;
    let size = (h >>> 20) & 0xfff;
    if (size === 0xfff) {
      if (pos + 4 > data.length) break;
      size = data.readUInt32LE(pos);
      pos += 4;
    }
    if (tag === PARA_TEXT) {
      lines.push(hwpParaText(data.subarray(pos, pos + size)));
    }
    pos += size;
  }
  return lines.join("\n");
}

const CHAR_CONTROLS = [0, 10, 13, 24, 25, 26, 27, 28, 29, 30, 31];

/**
 * 문단 글자 레코드(UTF-16) → 글자. 제어 문자는 공백·줄바꿈으로.
 * @param {Buffer} rec 레코드 내용
 * @return {string} 문단 글자
 */
function hwpParaText(rec: Buffer): string {
  let s = "";
  for (let i = 0; i + 1 < rec.length;) {
    const c = rec.readUInt16LE(i);
    if (c >= 32) {
      s += String.fromCharCode(c);
      i += 2;
    } else if (CHAR_CONTROLS.includes(c)) {
      // 글자 하나 크기의 제어 문자(줄바꿈·공백류)
      if (c === 10) s += "\n";
      else if (c >= 24) s += " ";
      i += 2;
    } else {
      // 인라인·확장 제어 문자는 8글자(16바이트) 크기. 탭(9)만 살림
      if (c === 9) s += "\t";
      i += 16;
    }
  }
  return s;
}

const xmlDecode = (s: string) => s
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"")
  .replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&amp;/g, "&");

/**
 * 한글(HWPX)·워드(DOCX): 압축 안의 XML에서 문단 글자만.
 * @param {Buffer} buf 파일 내용
 * @param {string} kind hwpx 또는 docx
 * @return {Promise<string>} 본문 글자
 */
async function zipXmlText(buf: Buffer, kind: "hwpx" | "docx") {
  const hwpx = kind === "hwpx";
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files)
    .filter((n) => hwpx ?
      /^Contents\/section\d+\.xml$/i.test(n) : n === "word/document.xml")
    .sort((a, z) => a.localeCompare(z, undefined, {numeric: true}));
  const parts: string[] = [];
  for (const n of names) {
    const xml = await zip.files[n].async("string");
    parts.push(xmlDecode(xml
      .replace(hwpx ? /<hp:tab[^>]*\/>/g : /<w:tab\/>/g, "\t")
      .replace(hwpx ? /<hp:lineBreak[^>]*\/>/g : /<w:br[^>]*\/>/g, "\n")
      .replace(hwpx ? /<\/hp:p>/g : /<\/w:p>/g, "\n")
      .replace(/<[^>]+>/g, "")));
  }
  return parts.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

type Content = Anthropic.Beta.BetaContentBlockParam;

/**
 * 주보 파일 → Claude에 보낼 내용(PDF·사진은 그대로, 한글·워드는 글자로).
 * @param {Buffer} buf 파일 내용
 * @param {string} ext 확장자
 * @return {Promise<Content>} 요청 블록
 */
export async function fileToContent(
  buf: Buffer, ext: string): Promise<Content> {
  const data = buf.toString("base64");
  if (ext === "pdf") {
    return {
      type: "document",
      source: {type: "base64", media_type: "application/pdf", data},
    };
  }
  if (ext === "jpg" || ext === "jpeg" || ext === "png") {
    const mediaType = ext === "png" ? "image/png" : "image/jpeg";
    return {
      type: "image",
      source: {type: "base64", media_type: mediaType, data},
    };
  }
  let text = "";
  if (ext === "hwp") {
    text = hwpText(buf);
  } else if (ext === "hwpx" || ext === "docx") {
    text = await zipXmlText(buf, ext);
  } else if (ext === "doc") {
    throw new UserError(
      "예전 워드 파일(.doc)은 읽을 수 없어요. PDF나 .docx로 저장해서 올려주세요.");
  } else {
    throw new UserError("읽을 수 없는 파일 형식이에요.");
  }
  if (!text.trim()) {
    throw new UserError("파일에서 글자를 찾지 못했어요. PDF로 저장해서 올려주세요.");
  }
  if (text.length > MAX_TEXT_CHARS) {
    throw new UserError("주보 글자가 너무 많아요. 주보 한 주 분량만 올려주세요.");
  }
  return {type: "text", text: `<bulletin_file>\n${text}\n</bulletin_file>`};
}

// ── Claude 요청 ──────────────────────────────────────────────────

const str = {type: "string"} as const;
const obj = (props: Record<string, unknown>) => ({
  type: "object",
  properties: props,
  required: Object.keys(props),
  additionalProperties: false,
});
const list = (props: Record<string, unknown>) =>
  ({type: "array", items: obj(props)});
const SCHEMA = obj({
  sermons: list({service: str, title: str, scripture: str, preacher: str}),
  news: list({title: str, content: str}),
  basic: obj({
    churchName: str, pastorName: str, phone: str, address: str, intro: str,
    worshipServices: list({group: str, title: str, time: str}),
    staff: list({role: str, name: str}),
  }),
});

/* eslint-disable max-len */
const SYSTEM = `당신은 한국 교회의 주보 파일을 읽고 교회 홈페이지에 올릴 내용을 정리하는 도우미입니다.
주보에 실제로 적힌 내용만 옮기고, 없는 내용은 지어내지 말고 빈 문자열이나 빈 배열로 두세요. 글자는 주보 표기 그대로 쓰되 줄바꿈·띄어쓰기만 자연스럽게 정리하세요.

- sermons: 이번 주 설교(말씀). 예배마다 설교가 다르면 각각. service는 "주일 1부 예배"처럼 예배 이름, title은 설교 제목, scripture는 성경 본문(예: "시편 23:1-6"), preacher는 설교자(직분 포함, 예: "박성진 목사").
- news: 교회 소식·광고·행사 안내. 항목마다 title(짧은 제목)과 content(내용). 날짜·장소·대상은 content에 남기세요.
- basic: 교회 기본 정보. churchName(교회 이름), pastorName(담임목사 이름만), phone(교회 대표 전화), address(교회 주소), intro(교회 소개·표어·비전 문구가 있으면 그대로), worshipServices(예배 시간표: group은 "주일예배"·"주중예배"처럼 묶음 이름, title은 예배 이름, time은 시간), staff(교역자·사역자 직분과 이름).

홈페이지는 누구나 보는 공개 페이지라서 다음은 절대 넣지 마세요:
- 개인 휴대전화 번호, 개인 이메일, 계좌번호
- 헌금자 명단, 십일조·감사헌금 등 헌금 내역
- 교인 개인의 병환·입원·장례·결혼·출산 같은 경조사, 개인 기도 제목
- 봉사자·당번·심방 명단 같은 내부 명단`;
/* eslint-enable max-len */

/**
 * Claude로 주보 분석.
 * @param {Content} content 주보 내용 블록
 * @return {Promise<unknown>} 추출 결과(JSON)
 */
async function analyze(content: Content): Promise<unknown> {
  const client = new Anthropic({apiKey: process.env.ANTHROPIC_API_KEY});
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: {
      effort: "medium",
      format: {type: "json_schema", schema: SCHEMA},
    },
    system: SYSTEM,
    messages: [{
      role: "user",
      content: [content, {
        type: "text",
        text: "이 주보에서 홈페이지에 올릴 설교·교회 소식·기본 정보를 정리해 주세요.",
      }],
    }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") {
    throw new UserError("이 주보는 자동으로 읽지 못했어요. 직접 입력해 주세요.");
  }
  if (msg.stop_reason === "max_tokens") {
    throw new UserError("주보 내용이 너무 길어요. 한 주 분량만 올려주세요.");
  }
  const text = msg.content.map((b) => b.type === "text" ? b.text : "").join("");
  return JSON.parse(text);
}

/**
 * 교회 하나당 하루 횟수 제한(한국 날짜 기준). 남았으면 1회 차감.
 * @param {string} uid 교회 계정
 * @return {Promise<boolean>} 분석 가능 여부
 */
async function takeQuota(uid: string): Promise<boolean> {
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  const today = kst.toISOString().slice(0, 10);
  const db = admin.firestore();
  const ref = db.collection("bulletinAnalysisUsage").doc(uid);
  return db.runTransaction(async (tx) => {
    const d = (await tx.get(ref)).data() || {};
    const count = d.date === today ? Number(d.count) || 0 : 0;
    if (count >= DAILY_LIMIT) return false;
    tx.set(ref, {
      date: today,
      count: count + 1,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return true;
  });
}

// POST { path: "churchSiteUploads/{uid}/paper-bulletin-....pdf" }
// 헤더 Authorization: Bearer <Firebase ID 토큰>
export const analyzePaperBulletin = functions.https.onRequest(
  {
    secrets: ["ANTHROPIC_API_KEY"],
    cors: true,
    timeoutSeconds: 300,
    memory: "1GiB",
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({error: "POST만 받아요."});
      return;
    }
    try {
      const auth = String(req.headers.authorization || "");
      const token = auth.replace(/^Bearer\s+/i, "");
      if (!token) {
        res.status(401).json({error: "로그인이 필요합니다."});
        return;
      }
      const {uid} = await admin.auth().verifyIdToken(token);
      const filePath = String(req.body?.path || "");
      // 본인이 올린 주보 파일만 (다른 교회 파일·다른 경로는 거절)
      const prefix = `churchSiteUploads/${uid}/paper-bulletin-`;
      if (!filePath.startsWith(prefix) || filePath.includes("..")) {
        res.status(403).json({error: "본인이 올린 주보 파일만 분석할 수 있어요."});
        return;
      }
      const ext = (filePath.split(".").pop() || "").toLowerCase();
      const file = admin.storage().bucket().file(filePath);
      const [meta] = await file.getMetadata();
      if (Number(meta.size) > MAX_FILE_BYTES) {
        throw new UserError("파일은 30MB까지 분석할 수 있어요.");
      }
      const [buf] = await file.download();
      const content = await fileToContent(buf, ext);
      if (!(await takeQuota(uid))) {
        throw new UserError(
          `주보 자동 분석은 하루 ${DAILY_LIMIT}번까지 할 수 있어요. 내일 다시 해 주세요.`);
      }
      res.json({result: await analyze(content)});
    } catch (e) {
      if (e instanceof UserError) {
        res.status(400).json({error: e.message});
        return;
      }
      functions.logger.error("analyzePaperBulletin failed", e);
      res.status(500).json({error: "주보를 분석하지 못했어요. 잠시 후 다시 해 주세요."});
    }
  },
);
