import { useEffect, useState } from "react";
import { FileText, ChevronRight, Upload } from "lucide-react";
import { PaperUpload, formatBytes, formatPaperDate, isPdf, listPaperUploads } from "../../../../utils/paperUploads";

// 홈페이지 편집(/website-builder) > 교회 주보: 주보 편집(/admin/editor)에서 올린 종이 주보 목록(2026-11-25).
// 최근 5개만, 나머지는 "전체 보기"(/admin/paper-files, 새 창 — 카드 / 표 보기)
const SHOW = 5;

export function PaperUploadList({ ownerId, viewerUid }: { ownerId: string | null; viewerUid: string | null }) {
  const [rows, setRows] = useState<PaperUpload[] | null>(null);
  useEffect(() => {
    if (!ownerId) { setRows([]); return; }
    setRows(null);
    listPaperUploads(ownerId).then(setRows).catch(() => setRows([]));
  }, [ownerId]);

  // 운영자가 다른 교회를 대신 편집할 땐 그 교회 계정으로 전체 보기
  const allHref = `/admin/paper-files${ownerId && ownerId !== viewerUid ? `?uid=${encodeURIComponent(ownerId)}` : ""}`;
  const list = (rows || []).slice(0, SHOW);

  return (
    <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[16px] font-extrabold text-slate-900">올린 종이 주보</h3>
          <p className="mt-0.5 text-[12.5px] text-slate-500 break-keep">주보 편집 화면의 ‘종이 주보’에서 올린 파일이에요.</p>
        </div>
        {rows && rows.length > 0 && (
          <a href={allHref} target="_blank" rel="opener"
            className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-slate-100 px-3.5 py-2 text-[13px] font-bold text-slate-700 hover:bg-slate-200">
            전체 보기{rows.length > SHOW ? ` (${rows.length})` : ""} <ChevronRight className="h-4 w-4" />
          </a>
        )}
      </div>

      {rows === null ? (
        <p className="py-6 text-center text-sm text-slate-400">불러오는 중이에요…</p>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 rounded-xl bg-slate-50 py-7 text-center">
          <Upload className="h-5 w-5 text-slate-400" />
          <p className="text-sm font-bold text-slate-600">아직 올린 종이 주보가 없어요</p>
          <p className="text-xs text-slate-400 break-keep">주보 편집 → 주보 내용 → ‘종이 주보’에서 PDF나 사진으로 올려 주세요.</p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-100">
          {list.map((p) => (
            <li key={p.id}>
              <a href={p.fileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50">
                {isPdf(p)
                  ? <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-500"><FileText className="h-5 w-5" /></div>
                  : <img src={p.fileUrl} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded-lg bg-slate-100 object-cover" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-bold text-slate-800">{p.title || p.fileName}</p>
                  <p className="truncate text-xs text-slate-400">{formatPaperDate(p.date)} · {isPdf(p) ? "PDF" : "사진"} · {formatBytes(p.size)}</p>
                </div>
                <span className="shrink-0 text-xs font-bold text-blue-600">열기</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
