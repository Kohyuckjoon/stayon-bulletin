import { useState, useEffect } from "react";
import { useSmoothNavigate as useNavigate, preloadAdminPages } from "../../utils/smoothNavigate"; // 관리자 화면 사이 부드러운 이동(2026-11-25)
import { auth, db } from "../../firebase";
import { collection, query, where, orderBy, getDocs } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { ArrowLeft, Search, Megaphone, Calendar, Loader2, ChevronRight } from "lucide-react";

interface Announcement {
  id: string;
  title: string;
  content: string;
}

interface ChurchNewsGroup {
  bulletinId: string;
  date: string;
  bulletinTitle: string;
  announcements: Announcement[];
}

// /admin의 각 주보(bulletins/{id}) 문서에 종속된 announcements(교회 소식) 배열을
// 모든 주보에 걸쳐 한 번에 모아 "주보(=날짜) 단위 게시글"로 묶어 보여주는 페이지.
// 같은 주보에 속한 교회 소식 여러 건은 한 카드 안에 소제목 목록으로 표시하고,
// 카드를 클릭하면 그 주보의 교회 소식만 전문 텍스트로 보는 상세 화면(/admin/church-news/:id)으로 이동.
export function ChurchNewsHistory() {
  const navigate = useNavigate();
  useEffect(() => { preloadAdminPages(); }, []);
  const [groups, setGroups] = useState<ChurchNewsGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        fetchChurchNews(user.uid);
      } else {
        navigate("/login");
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  const fetchChurchNews = async (uid: string) => {
    try {
      setIsLoading(true);
      const bulletinsRef = collection(db, "bulletins");
      const q = query(
        bulletinsRef,
        where("authorId", "==", uid),
        orderBy("date", "desc")
      );
      const querySnapshot = await getDocs(q);

      const grouped: ChurchNewsGroup[] = [];
      querySnapshot.docs.forEach((doc) => {
        const data = doc.data();
        const announcements: Announcement[] = data.announcements || [];
        if (announcements.length === 0) return;
        grouped.push({
          bulletinId: doc.id,
          date: data.date || "",
          bulletinTitle: data.title || "",
          announcements,
        });
      });

      setGroups(grouped);
    } catch (error) {
      console.error("교회 소식 로드 실패:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredGroups = groups.filter((group) => {
    const q = searchQuery.toLowerCase();
    if (!q) return true;
    return (
      group.date.toLowerCase().includes(q) ||
      group.announcements.some(
        (a) => a.title.toLowerCase().includes(q) || a.content.toLowerCase().includes(q)
      )
    );
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="bg-white border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => navigate("/admin")} className="rounded-full">
              <ArrowLeft className="w-4 h-4 mr-2" />
              대시보드
            </Button>
            <h1 className="text-xl font-bold">교회 소식 모아보기</h1>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <Card className="p-6 mb-6 rounded-2xl border-0 bg-white shadow-sm">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <Input
              placeholder="날짜, 제목 또는 내용으로 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 rounded-xl"
            />
          </div>
        </Card>

        <div className="space-y-3">
          {filteredGroups.map((group) => {
            const previewText = group.announcements
              .slice(0, 3)
              .map((a) => a.title || "제목 없음")
              .join("    ") + (group.announcements.length > 3 ? "    ..." : "");
            const isLatest = group.bulletinId === groups[0]?.bulletinId;
            return (
              <Card
                key={group.bulletinId}
                onClick={() => navigate(`/admin/church-news/${group.bulletinId}`)}
                className={`p-4 sm:p-5 rounded-3xl bg-white transition-all cursor-pointer group min-h-[104px] sm:min-h-[112px] flex items-center ${isLatest
                  ? "border border-blue-200 shadow-[0_2px_16px_rgba(37,99,235,0.08)] hover:shadow-[0_8px_24px_rgba(37,99,235,0.14)]"
                  : "border border-gray-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] hover:border-gray-200"
                  }`}
              >
                <div className="flex items-center gap-3 sm:gap-4 w-full">
                  <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center flex-shrink-0 p-2 ${isLatest ? "bg-blue-50" : "bg-gray-100"}`}>
                    <img src="/advertisement.png" alt="" className={`w-full h-full object-contain ${isLatest ? "" : "grayscale opacity-60"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg ${isLatest ? "text-blue-700 bg-blue-50" : "text-gray-500 bg-gray-100"}`}>
                        <Calendar className={`w-3.5 h-3.5 ${isLatest ? "text-blue-500" : "text-gray-400"}`} />
                        {group.date}
                      </span>
                      {isLatest && (
                        <span className="text-[10px] font-black text-white bg-blue-600 px-2 py-0.5 rounded-full uppercase tracking-wider">최신</span>
                      )}
                      <h3 className={`font-black text-sm sm:text-base tracking-tight ${isLatest ? "text-gray-900" : "text-gray-500"}`}>교회 소식</h3>
                    </div>
                    <p className={`text-xs sm:text-sm break-keep truncate ${isLatest ? "text-gray-600" : "text-gray-400"}`}>
                      {previewText}
                    </p>
                  </div>
                  <ChevronRight className={`w-4 h-4 shrink-0 transition-all group-hover:translate-x-0.5 ${isLatest ? "text-blue-300 group-hover:text-blue-500" : "text-gray-300 group-hover:text-gray-400"}`} />
                </div>
              </Card>
            );
          })}
        </div>

        {filteredGroups.length === 0 && (
          <Card className="p-20 rounded-2xl border-2 border-dashed border-gray-100 bg-white/50 text-center">
            <Megaphone className="w-16 h-16 mx-auto mb-4 text-gray-200" />
            <p className="text-gray-500 text-lg font-bold mb-1">표시할 교회 소식이 없습니다</p>
            <p className="text-gray-400 text-sm">주보에 교회 소식을 추가하면 여기 모여서 보입니다.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
