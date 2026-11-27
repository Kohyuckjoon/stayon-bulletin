import { useEffect, useState } from "react";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "../../../firebase";
import { getGraceApproval, graceCall, listGracePosts, setGraceApproval, type GracePost } from "../../../utils/grace";
import { isOperatorEmail } from "../../../utils/operator";

// 홈페이지 편집 > 기본 설정 > "은혜나눔 게시판"(2026-11-24): 켜기·끄기, 메뉴 이름, 올라온 글 관리(숨기기 · 다시 보이기 · 삭제).
// 켜기·이름은 누르는 즉시 그 교회 사이트에 저장(저장 버튼과 별개). 글 관리는 서버 함수가 "이 교회 관리자인지" 확인
const C = { navy: "#1B3A6B", muted: "#6B7280", border: "#E5E7EB", red: "#DC2626" };

// onSaved: 저장한 값을 편집 화면의 사이트 목록에도 반영(탭을 오가도 켜짐 상태 유지 · 미리보기 반영)
export function GraceAdminCard({ slug, enabled: enabled0, label: label0, desc: desc0 = "", onSaved }: { slug: string; enabled: boolean; label: string; desc?: string; onSaved?: (patch: Record<string, unknown>) => void }) {
  const [enabled, setEnabled] = useState(enabled0);
  const [label, setLabel] = useState(label0 || "나눔 게시판");
  const [posts, setPosts] = useState<GracePost[] | null>(null);
  // 게시판 설명(2026-11-25): 게시판 위에 1~2줄로 보이는 "이 게시판은 무엇을 나누는 곳인지"
  const [desc, setDesc] = useState(desc0);
  // 운영자 승인(트래픽 관리): 승인 전에는 교회가 켤 수 없음. 운영자만 이 칸에서 허용/해제
  const [approved, setApproved] = useState<boolean | null>(null);
  const isOp = isOperatorEmail(auth.currentUser?.email);
  const [msg, setMsg] = useState("");
  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(""), 2200); };
  const load = () => listGracePosts(slug, true).then(setPosts).catch(() => setPosts([]));
  useEffect(() => { setEnabled(enabled0); setLabel(label0 || "나눔 게시판"); setDesc(desc0); load(); getGraceApproval(slug).then(setApproved); }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleApproval = async (v: boolean) => {
    if (!confirm(v ? "이 교회의 게시판 사용을 허용할까요?" : "이 교회의 게시판 사용 허용을 해제할까요? 홈페이지 메뉴에서 사라지고 새 글을 쓸 수 없어요.")) return;
    try { await setGraceApproval(slug, v); setApproved(v); onSaved?.({ graceAllowed: v }); flash(v ? "허용했어요" : "해제했어요"); }
    catch { flash("바꾸지 못했어요"); }
  };

  const saveSite = async (patch: Record<string, unknown>) => {
    try { await setDoc(doc(db, "churchSites", slug), patch, { merge: true }); onSaved?.(patch); flash("저장했어요"); }
    catch { flash("저장하지 못했어요"); }
  };
  const act = async (p: GracePost, action: "adminHide" | "adminShow" | "adminDelete") => {
    if (action === "adminDelete" && !confirm(`"${p.title}" 글을 지울까요? 되돌릴 수 없어요.`)) return;
    try { await graceCall({ action, slug, id: p.id }); await load(); }
    catch (e) { flash((e as Error).message); }
  };
  const day = (p: GracePost) => { const d = p.createdAt?.toDate?.(); return d ? `${d.getMonth() + 1}/${d.getDate()}` : ""; };

  // 모바일(2026-11-25): 칸마다 위아래로 쌓고, 글자 16px 입력칸(아이폰 확대 방지) · 큰 버튼, 글 목록은 제목 줄 + 버튼 줄로 나눔
  const field = "w-full rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-[16px] sm:py-2 sm:text-[13px] outline-none focus:border-blue-400";
  const navyBtn = "shrink-0 rounded-xl px-4 py-3 text-[14px] sm:rounded-lg sm:py-2 sm:text-[12.5px] font-bold text-white active:scale-[0.98]";
  return (
    <div style={{ background: "white", borderRadius: 16, border: `1px solid ${C.border}`, padding: "28px" }}>
      {/* 제목 · 켜기 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-[17px] sm:text-base font-bold" style={{ color: C.navy }}>나눔 게시판</h3>
          <p className="mt-1 text-[13.5px] sm:text-[12.5px] leading-relaxed break-keep" style={{ color: C.muted }}>성도가 이름 + 비밀번호로 바로 글을 쓰는 게시판이에요. 링크·욕설은 자동으로 막고, 신고 3번이면 자동으로 숨겨져요.</p>
        </div>
        <label className="flex shrink-0 items-center justify-between gap-3 rounded-xl bg-gray-50 px-4 py-3 sm:bg-transparent sm:p-0 cursor-pointer">
          <span className="text-[14px] sm:text-[13px] font-bold" style={{ color: enabled && approved ? "#2563EB" : C.muted }}>{approved !== true ? "승인 전" : enabled ? "메뉴에 보임" : "꺼짐"}</span>
          <input type="checkbox" checked={enabled && approved === true} disabled={approved !== true} onChange={(e) => { setEnabled(e.target.checked); saveSite({ graceEnabled: e.target.checked }); }} style={{ width: 20, height: 20, accentColor: "#2563EB" }} />
        </label>
      </div>

      {/* 승인 상태 안내 · 운영자 허용 스위치 */}
      {approved === false && (
        <div className="mt-3.5 rounded-xl px-4 py-3 text-[13.5px] sm:text-[12.5px] leading-relaxed break-keep" style={{ background: "#FFF7ED", border: "1px solid #FED7AA", color: "#9A3412" }}>
          게시판은 <b>스테이온 운영자 승인 후</b> 쓸 수 있어요. 필요하시면 스테이온에 문의해 주세요.
        </div>
      )}
      {isOp && approved !== null && (
        <label className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-gray-100 px-4 py-3 cursor-pointer">
          <input type="checkbox" checked={approved} onChange={(e) => toggleApproval(e.target.checked)} style={{ width: 18, height: 18, accentColor: C.navy }} />
          <span className="text-[14px] sm:text-[12.5px] font-bold" style={{ color: C.navy }}>운영자: 이 교회 게시판 사용 허용</span>
          <span className="text-[12px] sm:text-[11.5px]" style={{ color: C.muted }}>(운영자에게만 보여요)</span>
        </label>
      )}

      {/* 게시판 이름 */}
      <div className="mt-5">
        <p className="mb-1.5 text-[14px] sm:text-[13px] font-semibold text-gray-700">게시판 이름 <span className="font-normal" style={{ color: C.muted }}>(12자까지)</span></p>
        <div className="flex gap-2">
          <input value={label} onChange={(e) => setLabel(e.target.value.slice(0, 12))} onKeyDown={(e) => { if (e.key === "Enter") saveSite({ graceLabel: label.trim() || "나눔 게시판" }); }}
            placeholder="나눔 게시판" className={`${field} min-w-0 sm:max-w-[220px]`} />
          <button type="button" onClick={() => { const v = label.trim() || "나눔 게시판"; setLabel(v); saveSite({ graceLabel: v }); }} className={navyBtn} style={{ background: C.navy }}>이름 저장</button>
        </div>
        <p className="mt-1.5 text-[12.5px] sm:text-[12px] break-keep" style={{ color: C.muted }}>홈페이지 위쪽 메뉴와 게시판 제목으로 나와요. 예: 나눔 게시판 · 은혜나눔 · 간증 나눔 · 감사 게시판</p>
      </div>

      {/* 게시판 설명: 홈페이지 게시판 위(글쓰기 버튼 왼쪽)에 그대로 보임. 비우면 기본 문구 */}
      <div className="mt-5">
        <p className="mb-1.5 text-[14px] sm:text-[13px] font-semibold text-gray-700">게시판 설명 <span className="font-normal" style={{ color: C.muted }}>(1~2줄 · 80자까지)</span></p>
        <textarea value={desc} onChange={(e) => setDesc(e.target.value.replace(/\n{2,}/g, "\n").slice(0, 80))} rows={3}
          placeholder="예: 예배와 삶 속에서 받은 은혜를 함께 나누는 곳이에요. 서로 격려하고 기도해 주세요."
          className={`${field} resize-y leading-relaxed`} />
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <button type="button" onClick={() => saveSite({ graceDesc: desc.trim() })} className={`${navyBtn} w-full sm:w-auto`} style={{ background: C.navy }}>설명 저장</button>
          <span className="text-[12.5px] sm:text-[12px] break-keep" style={{ color: C.muted }}>{desc.length}/80 · 비워 두면 "받은 은혜를 성도들과 함께 나눠 주세요."가 나와요</span>
        </div>
        {msg && <p className="mt-2 text-[13.5px] sm:text-[12.5px] font-bold text-blue-600">{msg}</p>}
      </div>

      {/* 올라온 글 */}
      <div className="mt-6 border-t pt-4" style={{ borderColor: C.border }}>
        <div className="mb-1 flex items-center justify-between">
          <p className="text-[15px] sm:text-[13.5px] font-bold text-gray-900">올라온 글 {posts?.length ?? 0}개</p>
          <button type="button" onClick={load} className="rounded-lg px-2 py-1.5 text-[13px] sm:text-[12px] font-bold" style={{ color: C.muted }}>새로고침</button>
        </div>
        {posts === null ? <p className="py-3 text-[14px] sm:text-[13px]" style={{ color: C.muted }}>불러오는 중이에요…</p>
          : posts.length === 0 ? <p className="py-3 text-[14px] sm:text-[13px]" style={{ color: C.muted }}>아직 올라온 글이 없어요.</p>
          : (
            <div className="flex flex-col">
              {posts.map((p, i) => (
                // 모바일: 제목·글쓴이(위) / 버튼 3개(아래, 크게) · PC: 한 줄
                <div key={p.id} className="flex flex-col gap-2.5 py-3.5 sm:flex-row sm:items-center sm:gap-2.5 sm:py-2.5" style={{ borderTop: i ? `1px solid ${C.border}` : "none", opacity: p.hidden ? 0.6 : 1 }}>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 sm:line-clamp-1 break-keep text-[15px] sm:text-[13.5px] font-bold leading-snug text-gray-900">
                      {p.hidden && <span className="mr-1.5 rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-extrabold text-red-600">숨김</span>}{p.title}
                    </p>
                    <p className="mt-1 text-[13px] sm:text-[12px]" style={{ color: C.muted }}>{p.name} · {day(p)}{p.reports > 0 ? <span className="font-bold text-red-500"> · 신고 {p.reports}</span> : ""}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center sm:gap-2">
                    <a href={`https://${slug}.stayon-platform.com/grace/${p.id}`} target="_blank" rel="noopener noreferrer"
                      className="rounded-xl bg-blue-50 py-2.5 text-center text-[13.5px] font-bold text-blue-600 sm:rounded-lg sm:bg-transparent sm:px-1 sm:py-1 sm:text-[12px]">보기</a>
                    <button type="button" onClick={() => act(p, p.hidden ? "adminShow" : "adminHide")}
                      className="rounded-xl bg-gray-100 py-2.5 text-[13.5px] font-bold text-gray-700 sm:rounded-lg sm:px-2.5 sm:py-1.5 sm:text-[12px]">{p.hidden ? "다시 보이기" : "숨기기"}</button>
                    <button type="button" onClick={() => act(p, "adminDelete")}
                      className="rounded-xl bg-red-50 py-2.5 text-[13.5px] font-bold text-red-600 sm:rounded-lg sm:bg-transparent sm:px-1 sm:py-1 sm:text-[12px]">삭제</button>
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}
