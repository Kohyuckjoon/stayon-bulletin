import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { db } from "../../firebase";
import { doc, getDoc } from "firebase/firestore";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { ArrowLeft, Loader2, Megaphone, Edit } from "lucide-react";

interface Announcement {
  id: string;
  title: string;
  content: string;
}

// 교회 소식 모아보기(ChurchNewsHistory) 리스트에서 특정 주보(게시글)를 클릭했을 때,
// 그 주보에 속한 교회 소식 전문만 읽기 전용 텍스트로 보여주는 상세 화면.
export function ChurchNewsDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [date, setDate] = useState("");
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "bulletins", id));
        if (snap.exists()) {
          const data = snap.data();
          setDate(data.date || "");
          setAnnouncements(data.announcements || []);
        }
      } catch (error) {
        console.error("교회 소식 상세 로드 실패:", error);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [id]);

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
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" onClick={() => navigate("/admin/church-news")} className="rounded-full">
                <ArrowLeft className="w-4 h-4 mr-2" />
                목록
              </Button>
              <h1 className="text-xl font-bold">교회 소식</h1>
            </div>
            <Button
              variant="outline"
              onClick={() => navigate(`/admin/editor/${id}`)}
              className="rounded-full font-bold text-sm"
            >
              <Edit className="w-4 h-4 mr-2" />
              주보에서 수정
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-2xl">
        {announcements.length === 0 ? (
          <Card className="p-20 rounded-2xl border-2 border-dashed border-gray-100 bg-white/50 text-center">
            <Megaphone className="w-16 h-16 mx-auto mb-4 text-gray-200" />
            <p className="text-gray-500 text-lg font-bold">교회 소식이 없습니다</p>
          </Card>
        ) : (
          <Card className="p-6 sm:p-8 rounded-3xl border-0 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
            <div className="flex items-center gap-2 mb-6 pb-6 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">교회 소식</h2>
              <span className="text-sm text-gray-400 font-medium">({date})</span>
            </div>
            <ol className="space-y-5 list-decimal list-outside pl-5 marker:font-bold marker:text-gray-900">
              {announcements.map((a) => (
                <li key={a.id} className="text-gray-800 leading-relaxed break-keep">
                  {a.title && <span className="font-bold">{a.title}</span>}
                  {a.title && a.content && " : "}
                  {a.content && (
                    <span className="whitespace-pre-line">{a.content}</span>
                  )}
                </li>
              ))}
            </ol>
          </Card>
        )}
      </div>
    </div>
  );
}
