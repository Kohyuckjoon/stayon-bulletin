import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useSmoothNavigate as useNavigate, preloadAdminPages } from "../../utils/smoothNavigate"; // 관리자 화면 사이 부드러운 이동(2026-11-25)
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { ArrowLeft, FileText, LayoutGrid, List, Search } from "lucide-react";
import { auth, db } from "../../firebase";
import { isOperatorEmail } from "../../utils/operator";
import { PaperUpload, formatBytes, formatPaperDate, isPdf, listPaperUploads } from "../../utils/paperUploads";

// 올린 종이 주보 전체 보기(2026-11-25) — /admin/paper-files.
// 홈페이지 편집 "교회 주보"의 "전체 보기", 주보 편집 "종이 주보"의 "올린 주보 전체 보기"에서 새 창으로 열림.
// 카드 보기 / 표 보기. 자기 계정 것만 보임(운영자만 ?uid=로 다른 교회)
type View = "card" | "table";
const VIEW_KEY = "paperFilesView";

export function PaperFilesPage() {
  const navigate = useNavigate();
  useEffect(() => { preloadAdminPages(); }, []);
  const [params] = useSearchParams();
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [churchName, setChurchName] = useState("");
  const [rows, setRows] = useState<PaperUpload[] | null>(null);
  const [q, setQ] = useState("");
  const [view, setView] = useState<View>(() => {
    try { return localStorage.getItem(VIEW_KEY) === "table" ? "table" : "card"; } catch { return "card"; }
  });
  const changeView = (v: View) => { setView(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* 기억 못 해도 됨 */ } };

  useEffect(() => onAuthStateChanged(auth, async (u) => {
    if (!u) { navigate("/login"); return; }
    const want = params.get("uid");
    const target = want && isOperatorEmail(u.email) ? want : u.uid;
    setOwnerId(target);
    try { const s = await getDoc(doc(db, "users", target)); setChurchName((s.data()?.churchName as string) || ""); } catch { /* 이름 없이 */ }
    listPaperUploads(target).then(setRows).catch(() => setRows([]));
  }), [navigate, params]);

  useEffect(() => { document.title = `${churchName ? churchName + " " : ""}종이 주보 | 스테이온`; }, [churchName]);

  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (!k) return rows || [];
    return (rows || []).filter((p) => `${p.title} ${p.fileName} ${p.date} ${formatPaperDate(p.date)}`.toLowerCase().includes(k));
  }, [rows, q]);

  const back = () => { if (window.opener) window.close(); else navigate("/admin"); };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-40 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto grid max-w-[1100px] grid-cols-[auto_1fr_auto] items-center gap-2 px-3 py-3 sm:px-6">
          <button type="button" onClick={back} className="rounded-full p-2 hover:bg-slate-100" title="닫기"><ArrowLeft className="h-4 w-4" /></button>
          <h1 className="truncate text-center text-base font-bold tracking-tight sm:text-lg">{churchName ? `${churchName} · ` : ""}올린 종이 주보</h1>
          <span className="w-8" />
        </div>
      </div>

      <div className="mx-auto max-w-[1100px] px-3 py-4 sm:px-6 sm:py-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="날짜나 파일 이름으로 찾기"
              className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-[16px] outline-none focus:border-blue-400 sm:text-sm" />
          </div>
          <div className="flex shrink-0 rounded-xl bg-slate-200/70 p-1">
            {([["card", "카드", LayoutGrid], ["table", "표", List]] as const).map(([v, l, Icon]) => (
              <button key={v} type="button" onClick={() => changeView(v)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-bold transition-colors ${view === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                <Icon className="h-4 w-4" /> {l}
              </button>
            ))}
          </div>
        </div>

        {rows && <p className="mb-3 text-[13px] text-slate-500">모두 {rows.length}개{q.trim() ? ` · 찾은 것 ${shown.length}개` : ""}</p>}

        {rows === null ? (
          <p className="py-20 text-center text-sm text-slate-400">불러오는 중이에요…</p>
        ) : shown.length === 0 ? (
          <div className="rounded-2xl bg-white py-16 text-center">
            <p className="text-[15px] font-bold text-slate-600">{rows.length ? "찾는 주보가 없어요" : "아직 올린 종이 주보가 없어요"}</p>
            {!rows.length && <p className="mt-1 text-sm text-slate-400 break-keep">주보 편집 → 주보 내용 → ‘종이 주보’에서 PDF나 사진으로 올려 주세요.</p>}
          </div>
        ) : view === "card" ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
            {shown.map((p) => (
              <a key={p.id} href={p.fileUrl} target="_blank" rel="noopener noreferrer"
                className="group overflow-hidden rounded-2xl border border-slate-200 bg-white transition-shadow hover:shadow-lg">
                <div className="relative aspect-[3/4] bg-slate-100">
                  {isPdf(p) ? (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-b from-red-50 to-white text-red-500">
                      <FileText className="h-10 w-10" />
                      <span className="text-xs font-extrabold tracking-wider">PDF</span>
                    </div>
                  ) : (
                    <img src={p.fileUrl} alt="" loading="lazy" className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.03]" />
                  )}
                </div>
                <div className="p-3">
                  <p className="text-[14px] font-bold text-slate-900">{formatPaperDate(p.date)}</p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">{p.fileName}</p>
                </div>
              </a>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-[13px] text-slate-500">
                <tr>
                  <th className="w-14 px-4 py-3 font-bold">번호</th>
                  <th className="px-4 py-3 font-bold">주보 날짜</th>
                  <th className="px-4 py-3 font-bold">파일 이름</th>
                  <th className="w-20 px-4 py-3 font-bold">종류</th>
                  <th className="w-20 px-4 py-3 font-bold">크기</th>
                  <th className="w-20 px-4 py-3 text-center font-bold">보기</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((p, i) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-400">{shown.length - i}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-bold text-slate-800">{formatPaperDate(p.date)}</td>
                    <td className="max-w-[320px] truncate px-4 py-3 text-slate-600">{p.fileName}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${isPdf(p) ? "bg-red-50 text-red-600" : "bg-sky-50 text-sky-700"}`}>{isPdf(p) ? "PDF" : "사진"}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">{formatBytes(p.size)}</td>
                    <td className="px-4 py-3 text-center">
                      <a href={p.fileUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-blue-600 hover:underline">열기</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
