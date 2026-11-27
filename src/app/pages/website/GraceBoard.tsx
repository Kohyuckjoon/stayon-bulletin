import { useEffect, useState, type ReactNode } from "react";
import { getGracePost, graceCall, listGracePosts, uploadGraceImages, type GracePost } from "../../../utils/grace";

// 교회 홈페이지 "은혜나눔" 게시판(2026-11-24) — /grace(목록) · /grace/{id}(글).
// 성도가 이름 + 비밀번호(숫자 4자리)로 바로 글을 씀(관리자 확인 없음). 이 교회(slug) 글만 보임.
// 쓰기·고치기·지우기·신고는 서버 함수가 검사(링크 · 욕설 · 너무 자주 쓰기). 신고 3번이면 자동 숨김.
// 모양은 교회 소식 목록·상세(같은 표 · 같은 버튼)와 맞춤

type LinkComp = (p: { to: string; className?: string; style?: React.CSSProperties; children: ReactNode }) => JSX.Element;
const fmt = (p: GracePost) => { const d = p.createdAt?.toDate?.(); return d ? `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}` : ""; };
const PAGE = 15;
const btn = "inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-bold transition active:scale-[0.97]";

export function GraceBoard({ slug, id, label, desc, color, A }: { slug: string; id: string; label: string; desc?: string; color: string; A: LinkComp }) {
  if (id) return <GraceDetail slug={slug} id={id} label={label} color={color} A={A} />;
  return <GraceList slug={slug} label={label} desc={desc} color={color} A={A} />;
}

function GraceList({ slug, label, desc, color, A }: { slug: string; label: string; desc?: string; color: string; A: LinkComp }) {
  const [list, setList] = useState<GracePost[] | null>(null);
  const [writing, setWriting] = useState(false);
  const [page, setPage] = useState(1);
  const [msg, setMsg] = useState("");
  const load = () => listGracePosts(slug).then(setList).catch(() => setList([]));
  useEffect(() => { load(); }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  if (writing) return <GraceForm slug={slug} label={label} color={color} onCancel={() => setWriting(false)} onDone={() => { setWriting(false); setMsg("글을 올렸어요. 함께 나눠 주셔서 감사해요."); load(); setTimeout(() => setMsg(""), 4000); }} />;

  const pages = Math.max(1, Math.ceil((list?.length || 0) / PAGE));
  const cur = Math.min(page, pages);
  const shown = (list || []).slice((cur - 1) * PAGE, cur * PAGE);
  return (
    <div>
      {/* 모바일: 설명(옅은 상자) → 글쓰기(폭 꽉) 위아래 / PC: 한 줄 */}
      <div className="mb-5 flex flex-col gap-3 sm:mb-4 sm:flex-row sm:items-center sm:justify-between">
        {/* 게시판 설명: 교회가 편집 화면 > 게시판에서 적은 문구(비우면 기본 문구) */}
        <p className="min-w-0 flex-1 whitespace-pre-line break-keep rounded-xl bg-gray-50 px-4 py-3 text-[15px] leading-relaxed text-gray-700 sm:rounded-none sm:bg-transparent sm:p-0 sm:text-sm sm:text-gray-600">{desc?.trim() || "받은 은혜를 성도들과 함께 나눠 주세요."}</p>
        <button type="button" onClick={() => setWriting(true)} className={`${btn} h-12 w-full text-[15px] text-white sm:h-auto sm:w-auto sm:text-sm`} style={{ background: color }}>✏️ 글쓰기</button>
      </div>
      {msg && <p className="mb-4 rounded-xl bg-green-50 px-4 py-3 text-sm font-bold text-green-700">{msg}</p>}
      {/* 모바일: 표 대신 카드 목록 — 제목 크게(2줄까지), 내용 미리보기 1줄, 글쓴이 · 날짜 */}
      <div className="sm:hidden border-t-2 border-gray-800">
        {list === null && <p className="py-14 text-center text-[15px] text-gray-400">불러오는 중이에요…</p>}
        {list && shown.length === 0 && <p className="py-14 text-center text-[15px] text-gray-400 break-keep">아직 올라온 글이 없어요.<br />첫 은혜를 나눠 주세요!</p>}
        {shown.map((p) => (
          <A key={p.id} to={`/grace/${p.id}`} className="flex items-center gap-3 border-b border-gray-200 py-4 active:bg-gray-50">
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 break-keep text-[16px] font-bold leading-snug text-gray-900">{p.title}</p>
              <p className="mt-1 line-clamp-1 text-[14px] text-gray-500">{p.content.replace(/\s+/g, " ")}</p>
              <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-gray-400">
                <span className="font-semibold text-gray-600">{p.name}</span><span>·</span><span className="tabular-nums">{fmt(p)}</span>
                {p.images.length > 0 && <span className="ml-0.5">📷 {p.images.length}</span>}
              </p>
            </div>
            {p.images[0] && <img src={p.images[0]} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />}
          </A>
        ))}
      </div>
      <div className="hidden sm:block overflow-x-auto border-y border-gray-300 bg-white">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-gray-100 border-b border-gray-300 text-gray-700">
            <tr>
              <th className="hidden sm:table-cell w-16 border-r border-gray-300 px-4 py-3 text-center font-bold">번호</th>
              <th className="border-r border-gray-300 px-4 py-3 font-bold">제목</th>
              <th className="hidden sm:table-cell w-28 border-r border-gray-300 px-4 py-3 text-center font-bold">글쓴이</th>
              <th className="hidden sm:table-cell w-32 px-4 py-3 text-center font-bold">작성일</th>
            </tr>
          </thead>
          <tbody>
            {list === null && <tr><td colSpan={4} className="px-4 py-14 text-center text-gray-400">불러오는 중이에요…</td></tr>}
            {list && shown.length === 0 && <tr><td colSpan={4} className="px-4 py-14 text-center text-gray-400">아직 올라온 글이 없어요. 첫 은혜를 나눠 주세요!</td></tr>}
            {shown.map((p, i) => (
              <tr key={p.id} className="border-b border-gray-200 hover:bg-gray-50">
                <td className="hidden sm:table-cell border-r border-gray-200 px-4 py-3.5 text-center tabular-nums text-gray-500">{(list?.length || 0) - ((cur - 1) * PAGE + i)}</td>
                <td className="border-r border-gray-200 px-4 py-3.5">
                  <A to={`/grace/${p.id}`} className="block text-gray-900 hover:underline break-keep">{p.title}{p.images.length > 0 && <span className="ml-1.5 text-xs text-gray-400">📷</span>}</A>
                  <span className="sm:hidden mt-0.5 block text-xs text-gray-400">{p.name} · <span className="tabular-nums">{fmt(p)}</span></span>
                </td>
                <td className="hidden sm:table-cell border-r border-gray-200 px-4 py-3.5 text-center text-gray-600">{p.name}</td>
                <td className="hidden sm:table-cell px-4 py-3.5 text-center tabular-nums text-gray-600">{fmt(p)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="mt-6 flex justify-center gap-1">
          {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
            <button key={n} onClick={() => setPage(n)} className={`h-9 min-w-9 border px-3 text-sm font-bold ${n === cur ? "border-gray-700 bg-gray-700 text-white" : "border-gray-300 text-gray-600 hover:bg-gray-100"}`}>{n}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function GraceDetail({ slug, id, label, color, A }: { slug: string; id: string; label: string; color: string; A: LinkComp }) {
  const [p, setP] = useState<GracePost | null | "none">(null);
  const [mode, setMode] = useState<"" | "edit" | "delete">("");
  const [pw, setPw] = useState("");
  const [editPw, setEditPw] = useState(""); // 고치기: "확인"을 누른 비밀번호(맞는지는 저장할 때 서버가 확인)
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [gone, setGone] = useState(false);
  const [reportMsg, setReportMsg] = useState("");
  const load = () => getGracePost(slug, id).then((x) => setP(x && !x.hidden ? x : "none")).catch(() => setP("none"));
  useEffect(() => { load(); }, [slug, id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (gone) return <div className="py-16 text-center"><p className="text-gray-600">글을 지웠어요.</p><A to="/grace" className={`${btn} mt-5 text-white`} style={{ background: color }}>목록으로</A></div>;
  if (p === null) return <p className="py-16 text-center text-gray-400">불러오는 중이에요…</p>;
  if (p === "none") return <div className="py-16 text-center"><p className="text-gray-400">글을 찾을 수 없어요.</p><A to="/grace" className={`${btn} mt-5 border border-gray-300 text-gray-700`}>목록으로</A></div>;
  if (mode === "edit" && editPw) return <GraceForm slug={slug} label={label} color={color} edit={{ post: p, password: editPw }} onCancel={() => { setMode(""); setPw(""); setEditPw(""); }} onDone={() => { setMode(""); setPw(""); setEditPw(""); load(); }} />;

  const confirmPw = async () => {
    setErr("");
    if (!/^\d{4}$/.test(pw)) return setErr("비밀번호 숫자 4자리를 적어 주세요.");
    if (mode === "delete") {
      if (!confirm("이 글을 지울까요? 지우면 되돌릴 수 없어요.")) return;
      setBusy(true);
      try { await graceCall({ action: "delete", slug, id, password: pw }); setGone(true); }
      catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
    }
  };
  const report = async () => {
    if (!confirm("이 글을 신고할까요? 신고가 여러 번 쌓이면 자동으로 숨겨져요.")) return;
    try { const r = await graceCall({ action: "report", slug, id }); setReportMsg(r.already ? "이미 신고하셨어요." : r.hidden ? "신고가 쌓여 글이 숨겨졌어요." : "신고했어요. 감사합니다."); if (r.hidden) setGone(true); }
    catch (e) { setReportMsg((e as Error).message); }
  };

  return (
    <div>
      <div className="border-t-2 border-gray-700">
        <p className="border-b border-gray-300 bg-gray-50 px-4 py-4 text-[19px] sm:text-lg font-bold leading-snug text-gray-900 break-keep">{p.title}</p>
        <p className="border-b border-gray-200 px-4 py-3 text-[14px] sm:text-sm text-gray-500"><span className="font-semibold text-gray-700">{p.name}</span> · <span className="tabular-nums">{fmt(p)}</span></p>
        <div className="px-4 py-6 sm:py-7">
          <p className="whitespace-pre-wrap break-keep text-[16px] sm:text-[15px] leading-[1.9] text-gray-800">{p.content}</p>
          {p.images.length > 0 && <div className="mt-6 flex flex-col gap-3">{p.images.map((u) => <img key={u} src={u} alt="" className="w-full max-w-2xl rounded-lg border border-gray-100" />)}</div>}
        </div>
      </div>
      <div className="border-t border-gray-300 pt-5">
        {mode ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-gray-50 px-4 py-3">
            <span className="text-sm font-bold text-gray-700">{mode === "edit" ? "고치려면" : "지우려면"} 글 쓸 때 정한 비밀번호</span>
            <input value={pw} onChange={(e) => setPw(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" type="password" placeholder="숫자 4자리" className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm tracking-widest outline-none focus:border-gray-500" />
            {mode === "edit"
              ? <button type="button" disabled={pw.length !== 4} onClick={() => setEditPw(pw)} className={`${btn} py-2 text-white disabled:opacity-40`} style={{ background: color }}>확인</button>
              : <button type="button" disabled={busy} onClick={confirmPw} className={`${btn} py-2 bg-red-500 text-white disabled:opacity-40`}>지우기</button>}
            <button type="button" onClick={() => { setMode(""); setPw(""); setErr(""); }} className="text-sm font-bold text-gray-400">취소</button>
            {err && <span className="w-full text-sm font-bold text-red-500">{err}</span>}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <A to="/grace" className={`${btn} border border-gray-300 text-gray-700`}>목록</A>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setMode("edit")} className="text-sm font-bold text-gray-500 hover:text-gray-800">고치기</button>
              <span className="text-gray-300">|</span>
              <button type="button" onClick={() => setMode("delete")} className="text-sm font-bold text-gray-500 hover:text-gray-800">지우기</button>
              <span className="text-gray-300">|</span>
              <button type="button" onClick={report} className="text-sm font-bold text-gray-400 hover:text-red-500">신고</button>
            </div>
          </div>
        )}
        {reportMsg && <p className="mt-3 text-sm font-semibold text-gray-500">{reportMsg}</p>}
      </div>
    </div>
  );
}

// 글쓰기 · 고치기. edit 이 있으면 고치기(비밀번호는 이미 받음 — 틀리면 서버가 거절)
function GraceForm({ slug, label, color, edit, onCancel, onDone }: {
  slug: string; label: string; color: string; edit?: { post: GracePost; password: string };
  onCancel: () => void; onDone: () => void;
}) {
  const [name, setName] = useState(edit?.post.name || "");
  const [title, setTitle] = useState(edit?.post.title || "");
  const [content, setContent] = useState(edit?.post.content || "");
  const [images, setImages] = useState<string[]>(edit?.post.images || []);
  const [password, setPassword] = useState("");
  const [trap, setTrap] = useState(""); // 자동 프로그램 함정 칸(사람에겐 안 보임)
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  // 16px: 휴대폰(아이폰)에서 칸을 누를 때 화면이 확대되지 않게
  const input = "w-full rounded-xl border border-gray-300 bg-white px-4 py-3.5 text-[16px] outline-none focus:border-gray-500";

  const pick = async (fs: FileList | null) => {
    if (!fs?.length) return;
    setUploading(true); setErr("");
    try { const urls = await uploadGraceImages(slug, Array.from(fs).slice(0, 3 - images.length)); setImages((p) => [...p, ...urls].slice(0, 3)); }
    catch (e) { setErr((e as Error).message); } finally { setUploading(false); }
  };
  const submit = async () => {
    setErr("");
    if (!name.trim()) return setErr("이름을 적어 주세요.");
    if (!title.trim()) return setErr("제목을 적어 주세요.");
    if (content.trim().length < 5) return setErr("내용을 조금 더 적어 주세요.");
    if (!edit && !/^\d{4}$/.test(password)) return setErr("비밀번호를 숫자 4자리로 정해 주세요. (나중에 고치거나 지울 때 써요)");
    setBusy(true);
    try {
      if (edit) await graceCall({ action: "update", slug, id: edit.post.id, password: edit.password, name, title, content, images });
      else await graceCall({ action: "create", slug, name, title, content, images, password, website: trap });
      onDone();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="border-t-2 border-gray-700 pt-6">
      <p className="mb-5 text-lg font-bold text-gray-900">{label} {edit ? "글 고치기" : "글쓰기"}</p>
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="mb-1.5 block text-sm font-bold text-gray-700">이름</label><input className={input} value={name} onChange={(e) => setName(e.target.value.slice(0, 20))} placeholder="홍길동" /></div>
          {!edit && <div><label className="mb-1.5 block text-sm font-bold text-gray-700">비밀번호 (숫자 4자리)</label><input className={`${input} tracking-widest`} type="password" inputMode="numeric" value={password} onChange={(e) => setPassword(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="고치거나 지울 때 써요" /></div>}
        </div>
        <div><label className="mb-1.5 block text-sm font-bold text-gray-700">제목</label><input className={input} value={title} onChange={(e) => setTitle(e.target.value.slice(0, 80))} placeholder="예: 수요예배에서 받은 은혜" /></div>
        <div><label className="mb-1.5 block text-sm font-bold text-gray-700">내용</label><textarea className={`${input} min-h-[200px] resize-y leading-relaxed`} value={content} onChange={(e) => setContent(e.target.value.slice(0, 4000))} placeholder="받은 은혜를 자유롭게 나눠 주세요." /></div>
        {/* 자동 프로그램 함정: 화면 밖에 숨긴 칸(사람은 못 보고, 프로그램만 채움) */}
        <input tabIndex={-1} autoComplete="off" aria-hidden value={trap} onChange={(e) => setTrap(e.target.value)} style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }} />
        <div>
          <label className="mb-1.5 block text-sm font-bold text-gray-700">사진 (선택 · 3장까지)</label>
          <div className="flex flex-wrap gap-2">
            {images.map((u) => (
              <div key={u} className="relative h-20 w-20 overflow-hidden rounded-lg border border-gray-200">
                <img src={u} alt="" className="h-full w-full object-cover" />
                <button type="button" onClick={() => setImages((p) => p.filter((x) => x !== u))} className="absolute right-1 top-1 h-6 w-6 rounded-full bg-black/60 text-xs text-white" aria-label="사진 빼기">✕</button>
              </div>
            ))}
            {images.length < 3 && (
              <label className="grid h-20 w-20 cursor-pointer place-items-center rounded-lg border border-dashed border-gray-300 text-xs font-bold text-gray-400 hover:bg-gray-50">
                {uploading ? "올리는 중" : "＋ 사진"}
                <input type="file" accept="image/*" multiple className="hidden" disabled={uploading} onChange={(e) => pick(e.target.files)} />
              </label>
            )}
          </div>
        </div>
        <p className="text-xs text-gray-400 break-keep">인터넷 주소(링크)와 바르지 않은 말은 올릴 수 없어요. 신고가 쌓인 글은 자동으로 숨겨져요.</p>
        {err && <p className="text-sm font-bold text-red-500">{err}</p>}
        <div className="grid grid-cols-[1fr_2fr] gap-2 sm:flex sm:justify-end">
          <button type="button" onClick={onCancel} className={`${btn} h-12 border border-gray-300 text-gray-700 sm:h-auto`}>취소</button>
          <button type="button" disabled={busy || uploading} onClick={submit} className={`${btn} h-12 text-[15px] text-white disabled:opacity-50 sm:h-auto sm:text-sm`} style={{ background: color }}>{busy ? "올리는 중…" : edit ? "고치기" : "올리기"}</button>
        </div>
      </div>
    </div>
  );
}
