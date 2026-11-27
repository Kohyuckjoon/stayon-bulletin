import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { FileText, Upload, Trash2, ExternalLink, Loader2, LayoutGrid } from "lucide-react";
import { toast } from "sonner";
import { auth } from "../../firebase";
import {
  PaperUpload, PAPER_UPLOAD_ACCEPT, PAPER_UPLOAD_MAX_MB, checkPaperFile, deletePaperUpload,
  formatBytes, formatPaperDate, isPdf, listPaperUploads, uploadPaperFile,
} from "../../utils/paperUploads";

// 주보 편집(/admin/editor) > 주보 내용 > "종이 주보" 칸(2026-11-25).
// 이 주보 날짜의 종이 주보(PDF·사진)를 올림. 올리는 즉시 저장(저장하기·발행하기와 상관없음).
// 올린 파일은 홈페이지 편집 화면 "교회 주보"와 /admin/paper-files(전체 보기)에서도 보임
export function PaperUploadCard({ id, bulletinId, date }: { id?: string; bulletinId: string | null; date: string }) {
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid || null);
  const [all, setAll] = useState<PaperUpload[] | null>(null);
  const [uploading, setUploading] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => onAuthStateChanged(auth, (u) => setUid(u?.uid || null)), []);
  useEffect(() => {
    if (!uid) return;
    listPaperUploads(uid).then(setAll).catch(() => setAll([]));
  }, [uid]);

  const mine = (all || []).filter((p) => p.date === date);
  const titleFor = (d: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
    return m ? `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일 주보` : "종이 주보";
  };

  const onFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length || !uid) return;
    const bad = files.map(checkPaperFile).filter(Boolean) as string[];
    if (bad.length) { toast.error(bad[0]); return; }
    try {
      for (let i = 0; i < files.length; i++) {
        setUploading(files.length > 1 ? `올리는 중… (${i + 1}/${files.length})` : "올리는 중…");
        const row = await uploadPaperFile(files[i], { ownerId: uid, bulletinId, date, title: titleFor(date) });
        setAll((prev) => [row, ...(prev || [])]);
      }
      toast.success("종이 주보를 올렸어요. 홈페이지 편집 화면에서도 바로 보여요.");
    } catch {
      toast.error("올리지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setUploading("");
    }
  };

  const remove = async (p: PaperUpload) => {
    if (!window.confirm(`"${p.fileName}" 파일을 지울까요? 지우면 되돌릴 수 없어요.`)) return;
    try {
      await deletePaperUpload(p);
      setAll((prev) => (prev || []).filter((x) => x.id !== p.id));
      toast.success("지웠어요.");
    } catch {
      toast.error("지우지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
  };

  return (
    <div id={id} className="scroll-mt-24 p-5 rounded-[1.75rem] bg-white shadow-xl shadow-sky-500/5">
      <div className="flex items-center justify-between gap-3 mb-1.5 flex-wrap">
        <h2 className="text-xl font-bold flex items-center gap-3 text-gray-800">
          <div className="w-2.5 h-8 bg-sky-500 rounded-full" /> 종이 주보
        </h2>
        <a href="/admin/paper-files" target="_blank" rel="opener"
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3.5 h-9 text-xs font-bold text-slate-600 hover:bg-slate-50">
          <LayoutGrid className="w-3.5 h-3.5" /> 올린 주보 전체 보기
        </a>
      </div>
      <p className="text-[13px] text-slate-500 mb-4 leading-relaxed break-keep">
        인쇄하는 종이 주보를 <b className="text-slate-700">PDF나 사진</b>으로 올려 주세요. 올리면 바로 저장되고, 교회 홈페이지 편집 화면의 ‘교회 주보’에서도 볼 수 있어요.
      </p>

      <button type="button" onClick={() => inputRef.current?.click()} disabled={!!uploading || !uid}
        className="w-full rounded-2xl border-2 border-dashed border-sky-200 bg-sky-50/50 hover:bg-sky-50 transition-colors px-4 py-6 flex flex-col items-center gap-1.5 disabled:opacity-60">
        {uploading ? <Loader2 className="w-6 h-6 text-sky-500 animate-spin" /> : <Upload className="w-6 h-6 text-sky-500" />}
        <span className="text-[15px] font-bold text-sky-700">{uploading || `${formatPaperDate(date)} 종이 주보 올리기`}</span>
        <span className="text-xs text-slate-500">PDF · JPG · PNG, 한 파일 {PAPER_UPLOAD_MAX_MB}MB까지 · 여러 장도 한 번에 올릴 수 있어요</span>
      </button>
      <input ref={inputRef} type="file" accept={PAPER_UPLOAD_ACCEPT} multiple onChange={onFiles} className="hidden" />

      {mine.length > 0 && (
        <ul className="mt-4 divide-y divide-slate-100 rounded-2xl border border-slate-100">
          {mine.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-3.5 py-3">
              {isPdf(p)
                ? <div className="w-11 h-11 shrink-0 rounded-lg bg-red-50 text-red-500 flex items-center justify-center"><FileText className="w-5 h-5" /></div>
                : <img src={p.fileUrl} alt="" className="w-11 h-11 shrink-0 rounded-lg object-cover bg-slate-100" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-slate-800">{p.fileName}</p>
                <p className="text-xs text-slate-400">{isPdf(p) ? "PDF" : "사진"} · {formatBytes(p.size)}</p>
              </div>
              <a href={p.fileUrl} target="_blank" rel="noopener noreferrer" title="열어 보기"
                className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100"><ExternalLink className="w-4 h-4" /></a>
              <button type="button" onClick={() => remove(p)} title="지우기"
                className="shrink-0 rounded-lg p-2 text-red-400 hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
