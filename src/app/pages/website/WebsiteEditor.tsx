// import { useEffect, useState } from "react";
// import { useParams } from "react-router";
// import { getChurchSite, updateChurchSite, publishChurchSite, extractYoutubeId, ChurchSite } from "../../../utils/churchSite";
// import { WebsiteRenderer } from "./WebsiteRenderer";

// export function WebsiteEditor() {
//     const { slug } = useParams<{ slug: string }>();
//     const [draft, setDraft] = useState<ChurchSite | null>(null);
//     const [saving, setSaving] = useState(false);

//     useEffect(() => {
//         if (slug) getChurchSite(slug).then(setDraft);
//     }, [slug]);

//     const updateSection = (section: string, field: string, value: string) => {
//         setDraft((prev) => prev && {
//             ...prev,
//             sections: {
//                 ...prev.sections,
//                 [section]: { ...(prev.sections as any)[section], [field]: value },
//             },
//         });
//     };

//     const handleSave = async () => {
//         if (!draft) return;
//         setSaving(true);
//         await updateChurchSite(draft.slug, { sections: draft.sections });
//         setSaving(false);
//     };

//     if (!draft) return <div className="p-16 text-center text-gray-400">불러오는 중...</div>;
//     const hero = (draft.sections as any).hero ?? {};

//     const about = (draft.sections as any).about ?? { visionItems: [], pastorMessage: { name: "", role: "", message: "" } };

//     const updateAbout = (patch: Record<string, unknown>) => {
//         setDraft((prev) => prev && {
//             ...prev,
//             sections: { ...prev.sections, about: { ...(prev.sections as any).about, ...patch } },
//         });
//     };

//     const updatePastor = (field: string, value: string) =>
//         updateAbout({ pastorMessage: { ...about.pastorMessage, [field]: value } });

//     const updateVisionItem = (index: number, field: string, value: string) => {
//         const items = [...(about.visionItems ?? [])];
//         items[index] = { ...items[index], [field]: value };
//         updateAbout({ visionItems: items });
//     };

//     const addVisionItem = () =>
//         updateAbout({ visionItems: [...(about.visionItems ?? []), { title: "", desc: "" }] });

//     const removeVisionItem = (i: number) =>
//         updateAbout({ visionItems: (about.visionItems ?? []).filter((_: any, idx: number) => idx !== i) });


//     // ── worship ──
//     const worship = (draft.sections as any).worship ?? { services: [] };
//     const updateWorship = (patch: Record<string, unknown>) =>
//         setDraft((prev) => prev && {
//             ...prev,
//             sections: { ...prev.sections, worship: { ...(prev.sections as any).worship, ...patch } },
//         });
//     const updateWorshipService = (i: number, field: string, value: string) => {
//         const items = [...(worship.services ?? [])];
//         items[i] = { ...items[i], [field]: value };
//         updateWorship({ services: items });
//     };
//     const addWorshipService = () =>
//         updateWorship({ services: [...(worship.services ?? []), { title: "", time: "", note: "" }] });
//     const removeWorshipService = (i: number) =>
//         updateWorship({ services: (worship.services ?? []).filter((_: any, idx: number) => idx !== i) });

//     // ── sermon / blog (단순 필드라 updateSection 재사용) ──
//     const sermon = (draft.sections as any).sermon ?? { youtubeVideoId: "", latestSermonTitle: "" };
//     const blog = (draft.sections as any).blog ?? { naverBlogUrl: "" };

//     // ── news ──
//     const news = (draft.sections as any).news ?? { items: [] };
//     const updateNews = (patch: Record<string, unknown>) =>
//         setDraft((prev) => prev && {
//             ...prev,
//             sections: { ...prev.sections, news: { ...(prev.sections as any).news, ...patch } },
//         });
//     const updateNewsItem = (i: number, field: string, value: string) => {
//         const items = [...(news.items ?? [])];
//         items[i] = { ...items[i], [field]: value };
//         updateNews({ items });
//     };
//     const addNewsItem = () =>
//         updateNews({ items: [...(news.items ?? []), { title: "", date: "", content: "" }] });
//     const removeNewsItem = (i: number) =>
//         updateNews({ items: (news.items ?? []).filter((_: any, idx: number) => idx !== i) });

//     return (
//         <div className="grid grid-cols-2 h-screen">
//             {/* 왼쪽: 입력 폼 */}
//             <div className="overflow-y-auto p-8 border-r border-gray-100">
//                 <h2 className="text-lg font-medium mb-6">메인 화면</h2>
//                 <label className="block text-sm text-gray-600 mb-1">성경구절</label>
//                 <input className="w-full border border-gray-200 rounded-lg px-3 py-2 mb-4"
//                     value={hero.verseQuote ?? ""}
//                     onChange={(e) => updateSection("hero", "verseQuote", e.target.value)} />

//                 <label className="block text-sm text-gray-600 mb-1">한 줄 소개</label>
//                 <input className="w-full border border-gray-200 rounded-lg px-3 py-2 mb-8"
//                     value={hero.tagline ?? ""}
//                     onChange={(e) => updateSection("hero", "tagline", e.target.value)} />

//                 <h2 className="text-lg font-medium mt-10 mb-6">교회 소개</h2>

//                 <label className="block text-sm text-gray-600 mb-1">목사님 성함</label>
//                 <input className="w-full border border-gray-200 rounded-lg px-3 py-2 mb-3"
//                     value={about.pastorMessage?.name ?? ""}
//                     onChange={(e) => updatePastor("name", e.target.value)} />

//                 <label className="block text-sm text-gray-600 mb-1">직분</label>
//                 <input className="w-full border border-gray-200 rounded-lg px-3 py-2 mb-3"
//                     placeholder="담임목사"
//                     value={about.pastorMessage?.role ?? ""}
//                     onChange={(e) => updatePastor("role", e.target.value)} />

//                 <label className="block text-sm text-gray-600 mb-1">인사말</label>
//                 <textarea className="w-full border border-gray-200 rounded-lg px-3 py-2 mb-6" rows={3}
//                     value={about.pastorMessage?.message ?? ""}
//                     onChange={(e) => updatePastor("message", e.target.value)} />

//                 <label className="block text-sm text-gray-600 mb-2">비전 · 소개 항목</label>
//                 {(about.visionItems ?? []).map((item: any, i: number) => (
//                     <div key={i} className="border border-gray-200 rounded-lg p-3 mb-2">
//                         <label className="block text-xs text-gray-400 mb-1">제목</label>
//                         <input className="w-full text-sm font-medium mb-3 outline-none border-b border-gray-100 pb-1"
//                             value={item.title} onChange={(e) => updateVisionItem(i, "title", e.target.value)} />

//                         <label className="block text-xs text-gray-400 mb-1">설명</label>
//                         <input className="w-full text-sm text-gray-500 outline-none"
//                             value={item.desc} onChange={(e) => updateVisionItem(i, "desc", e.target.value)} />

//                         <button onClick={() => removeVisionItem(i)} className="text-xs text-red-500 mt-2">삭제</button>
//                     </div>
//                 ))}
//                 <button onClick={addVisionItem} className="text-sm text-blue-600 mb-8">+ 항목 추가</button>

//                 {/* 예배 안내 */}
//                 <h2 className="text-lg font-medium mt-10 mb-6">예배 안내</h2>
//                 {(worship.services ?? []).map((s: any, i: number) => (
//                     <div key={i} className="border border-gray-200 rounded-lg p-3 mb-2">
//                         <label className="block text-xs text-gray-400 mb-1">예배명</label>
//                         <input className="w-full text-sm font-medium mb-3 outline-none border-b border-gray-100 pb-1"
//                             placeholder="주일 대예배"
//                             value={s.title} onChange={(e) => updateWorshipService(i, "title", e.target.value)} />

//                         <label className="block text-xs text-gray-400 mb-1">시간</label>
//                         <input className="w-full text-sm text-gray-600 mb-3 outline-none border-b border-gray-100 pb-1"
//                             placeholder="오전 11:00"
//                             value={s.time} onChange={(e) => updateWorshipService(i, "time", e.target.value)} />

//                         <label className="block text-xs text-gray-400 mb-1">비고 (선택)</label>
//                         <input className="w-full text-sm text-gray-400 outline-none"
//                             value={s.note ?? ""} onChange={(e) => updateWorshipService(i, "note", e.target.value)} />

//                         <button onClick={() => removeWorshipService(i)} className="text-xs text-red-500 mt-2">삭제</button>
//                     </div>
//                 ))}
//                 <button onClick={addWorshipService} className="text-sm text-blue-600 mb-8">+ 예배 추가</button>

//                 {/* 설교 · 미디어 */}
//                 <h2 className="text-lg font-medium mb-6">설교 · 미디어</h2>
//                 <label className="block text-sm text-gray-600 mb-1">유튜브 영상 ID</label>
//                 <input className="w-full border border-gray-200 rounded-lg px-3 py-2 mb-1" placeholder="dQw4w9WgXcQ"
//                     value={sermon.youtubeVideoId ?? ""}
//                     onChange={(e) => updateSection("sermon", "youtubeVideoId", extractYoutubeId(e.target.value))} />
//                 <p className="text-xs text-gray-400 mb-3">유튜브 링크의 watch?v= 뒤에 오는 11자리 문자열</p>

//                 <label className="block text-sm text-gray-600 mb-1">최근 설교 제목</label>
//                 <input className="w-full border border-gray-200 rounded-lg px-3 py-2 mb-8"
//                     value={sermon.latestSermonTitle ?? ""}
//                     onChange={(e) => updateSection("sermon", "latestSermonTitle", e.target.value)} />

//                 {/* 블로그 */}
//                 <h2 className="text-lg font-medium mb-6">블로그</h2>
//                 <label className="block text-sm text-gray-600 mb-1">네이버 블로그 주소</label>
//                 <input className="w-full border border-gray-200 rounded-lg px-3 py-2 mb-8" placeholder="https://blog.naver.com/..."
//                     value={blog.naverBlogUrl ?? ""}
//                     onChange={(e) => updateSection("blog", "naverBlogUrl", e.target.value)} />

//                 {/* 소식 */}
//                 <h2 className="text-lg font-medium mb-6">소식</h2>
//                 {(news.items ?? []).map((n: any, i: number) => (
//                     <div key={i} className="border border-gray-200 rounded-lg p-3 mb-2">
//                         <label className="block text-xs text-gray-400 mb-1">제목</label>
//                         <input className="w-full text-sm font-medium mb-3 outline-none border-b border-gray-100 pb-1"
//                             value={n.title} onChange={(e) => updateNewsItem(i, "title", e.target.value)} />

//                         <label className="block text-xs text-gray-400 mb-1">날짜</label>
//                         <input className="w-full text-sm text-gray-500 mb-3 outline-none border-b border-gray-100 pb-1" placeholder="2026.08.02"
//                             value={n.date} onChange={(e) => updateNewsItem(i, "date", e.target.value)} />

//                         <label className="block text-xs text-gray-400 mb-1">내용</label>
//                         <textarea className="w-full text-sm text-gray-500 outline-none" rows={2}
//                             value={n.content} onChange={(e) => updateNewsItem(i, "content", e.target.value)} />

//                         <button onClick={() => removeNewsItem(i)} className="text-xs text-red-500 mt-2">삭제</button>
//                     </div>
//                 ))}
//                 <button onClick={addNewsItem} className="text-sm text-blue-600 mb-8">+ 소식 추가</button>

//                 <button onClick={handleSave} disabled={saving}
//                     className="w-full bg-gray-900 text-white rounded-full py-3 mb-2 disabled:opacity-50">
//                     {saving ? "저장 중..." : "저장"}
//                 </button>
//                 <button onClick={() => publishChurchSite(draft.slug)}
//                     className="w-full border border-gray-900 text-gray-900 rounded-full py-3">
//                     배포하기
//                 </button>
//             </div>

//             {/* 오른쪽: 라이브 미리보기 — draft가 바뀌는 즉시 리렌더링됨 */}
//             <div className="overflow-y-auto bg-gray-50">
//                 <WebsiteRenderer site={draft} />
//             </div>
//         </div>
//     );
// }
