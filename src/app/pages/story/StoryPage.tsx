import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "../../../firebase";
import { Smartphone } from "lucide-react";
import {
  DEFAULT_STORY_CATEGORIES, sortStories, storyDate, storyHref, storyImage, toStory, type Story,
} from "../../../utils/stories";

// "함께한 이야기" 공개 페이지 — /story (메인 화면 상단 버튼에서 들어옴)
// 원티드 채용 목록처럼 사진 카드 4열, 위쪽 분류 버튼으로 거르기.
// stories / storyMeta 컬렉션만 읽음. 주보·결제·성도 화면과 무관.

const C = { ink: "#191F28", sub: "#4E5968", muted: "#8B95A1", line: "#E5E8EB", blue: "#3182F6", green: "#00A661" };

export const StoryPage = () => {
  const navigate = useNavigate();
  const [stories, setStories] = useState<Story[] | null>(null);
  const [categories, setCategories] = useState<string[]>(DEFAULT_STORY_CATEGORIES);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set()); // 지금 진행 중인 모금 프로젝트
  const [active, setActive] = useState("전체");
  const [shown, setShown] = useState(false);

  useEffect(() => {
    document.title = "STAYON과 함께한 이야기 | 스테이온";
    const t = setTimeout(() => setShown(true), 30); // 메인에서 서서히 사라진 뒤 넘어오므로 여기선 서서히 나타남
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [snap, meta] = await Promise.all([
          getDocs(query(collection(db, "stories"), where("visible", "==", true))),
          getDoc(doc(db, "storyMeta", "categories")).catch(() => null),
        ]);
        const list = sortStories(snap.docs.map((d) => toStory(d.id, d.data())));
        setStories(list);
        const cats = meta?.data()?.list;
        if (Array.isArray(cats) && cats.length) setCategories(cats.map(String));
        // 모금 카드는 진행 중이면 "진행 중" 배지
        const fids = [...new Set(list.filter((s) => s.linkType === "give" && s.fundraiserId).map((s) => s.fundraiserId))];
        const open = new Set<string>();
        await Promise.all(fids.map(async (id) => {
          try {
            const f = await getDoc(doc(db, "fundraisers", id));
            if (f.get("status") === "open") open.add(id);
          } catch { /* 무시 */ }
        }));
        setOpenIds(open);
      } catch (e) {
        console.error("함께한 이야기 불러오기 오류:", e);
        setStories([]);
      }
    })();
  }, []);

  // 실제 카드가 있는 분류만 버튼으로 보여 줌
  const chips = useMemo(() => {
    const used = new Set((stories || []).map((s) => s.category));
    return ["전체", ...categories.filter((c) => used.has(c)), ...[...used].filter((c) => c && !categories.includes(c))];
  }, [stories, categories]);
  const list = (stories || []).filter((s) => active === "전체" || s.category === active);

  const open = (s: Story) => {
    const href = storyHref(s);
    if (!href) return;
    if (href.startsWith("/")) navigate(href);
    else window.open(href, "_blank", "noopener");
  };

  return (
    <div className={`min-h-screen bg-white font-sans transition-opacity duration-700 ${shown ? "opacity-100" : "opacity-0"}`}>
      <header className="w-full bg-white/95 backdrop-blur-md sticky top-0 z-50 border-b border-slate-100">
        <nav className="max-w-7xl mx-auto flex items-center py-4 sm:py-5 px-4 sm:px-6">
          <button type="button" className="flex items-center gap-2.5" onClick={() => navigate("/")}>
            <span className="w-10 h-10 bg-slate-900 rounded-lg flex items-center justify-center">
              <Smartphone className="w-5 h-5 text-white" />
            </span>
            <span className="flex flex-col items-start">
              <span className="text-base sm:text-lg font-black text-slate-900 tracking-tight leading-[1.1]">STAYON</span>
              <span className="text-[10px] font-bold text-blue-500 tracking-widest uppercase -mt-0.5">JUBO</span>
            </span>
          </button>
        </nav>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-10 sm:pt-14 pb-24">
        <h1 className="text-[26px] sm:text-[32px] font-bold tracking-tight" style={{ color: C.ink }}>STAYON과 함께한 이야기</h1>
        <p className="mt-2 text-[15px] sm:text-base" style={{ color: C.sub }}>교회들과 함께 만들어 온 나눔, 영상, 홈페이지 이야기를 모았어요.</p>

        {chips.length > 1 && (
          <div className="mt-8 flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
            {chips.map((c) => {
              const on = c === active;
              return (
                <button key={c} type="button" onClick={() => setActive(c)}
                  className="shrink-0 rounded-lg border px-3.5 py-2 text-sm font-semibold transition-colors"
                  style={on ? { background: C.ink, borderColor: C.ink, color: "#fff" } : { background: "#fff", borderColor: C.line, color: C.sub }}>
                  {c}
                </button>
              );
            })}
          </div>
        )}
        <div className="mt-6 border-t" style={{ borderColor: C.line }} />

        {stories === null ? (
          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-10">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i}>
                <div className="aspect-[3/2] rounded-xl bg-slate-100 animate-pulse" />
                <div className="mt-4 h-5 w-3/4 rounded bg-slate-100 animate-pulse" />
                <div className="mt-2 h-4 w-1/2 rounded bg-slate-100 animate-pulse" />
              </div>
            ))}
          </div>
        ) : list.length === 0 ? (
          <p className="mt-16 text-center text-[15px]" style={{ color: C.muted }}>곧 함께한 이야기가 올라올 거예요.</p>
        ) : (
          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-10">
            {list.map((s) => {
              const img = storyImage(s);
              const href = storyHref(s);
              const live = s.linkType === "give" && openIds.has(s.fundraiserId);
              return (
                <article key={s.id} onClick={() => open(s)} className={`group ${href ? "cursor-pointer" : ""}`}>
                  <div className="relative aspect-[3/2] overflow-hidden rounded-xl bg-slate-100">
                    {img && (
                      <img src={img} alt={s.title} loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
                    )}
                    <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/45 to-transparent" />
                    <span className="absolute left-3.5 top-3 flex items-center gap-1.5 text-[13px] font-bold text-white">
                      {live && <span className="rounded px-1.5 py-0.5 text-[11px]" style={{ background: C.green }}>진행 중</span>}
                      {s.category}
                    </span>
                  </div>
                  <h2 className="mt-3.5 text-[17px] font-bold leading-snug line-clamp-2" style={{ color: C.ink }}>{s.title}</h2>
                  {s.churchName && <p className="mt-1.5 text-sm" style={{ color: C.sub }}>{s.churchName}</p>}
                  {s.date && <p className="mt-0.5 text-sm" style={{ color: C.muted }}>{storyDate(s.date)}</p>}
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default StoryPage;
