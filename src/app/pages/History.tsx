import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { auth, db } from "../../firebase"; // Firebase 설정 경로 확인 필요
import { collection, query, where, orderBy, getDocs, deleteDoc, doc, addDoc, serverTimestamp} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import {
  ArrowLeft,
  Search,
  FileText,
  Eye,
  Edit,
  Copy,
  Trash2,
  Calendar,
  Download,
  Loader2,
  Lock
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../components/ui/tooltip";
import { toast } from "sonner";

export function History() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMonth, setFilterMonth] = useState("all");

  const months = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    return month < 10 ? `0${month}` : `${month}`;
  }).reverse(); // 최신 달이 위로 오게 역순 정렬
  
  // 상태 관리 추가
  const [bulletins, setBulletins] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // 1. 사용자 인증 및 데이터 로드
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUserId(user.uid);
        fetchBulletins(user.uid);
      } else {
        navigate("/login");
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  // 2. Firestore 데이터 가져오기
  const fetchBulletins = async (uid: string) => {
    try {
      setIsLoading(true);
      const bulletinsRef = collection(db, "bulletins");
      // 현재 유저의 주보만 날짜 역순으로 가져옴
      const q = query(
        bulletinsRef, 
        where("authorId", "==", uid),
        orderBy("date", "desc")
      );
      
      const querySnapshot = await getDocs(q);
      const fetchedData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      setBulletins(fetchedData);
    } catch (error: any) {
      console.error("데이터 로드 실패:", error);
      toast.error("주보 목록을 불러오지 못했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  // const handleCopy = (bulletin: any) => {
  //   // 복사 로직 (필요 시 Firestore에 새 문서 생성 로직 추가 가능)
  //   toast.success(`"${bulletin.title}" 주보를 복사했습니다`);
  //   navigate("/admin/editor");
  // };

  const handleCopy = async (bulletin: any) => {
    if (!currentUserId) return;

    try {
      const { id, createdAt, views, publishedAt, ...copiedData } = bulletin;
      
      const newBulletin = {
        ...copiedData,
        title: `${copiedData.title || "주보"} (복사본)`,
        status: "draft",
        views: 0,
        createdAt: serverTimestamp(),
        authorId: currentUserId
      };

      const docRef = await addDoc(collection(db, "bulletins"), newBulletin);
      toast.success(`"${bulletin.title}" 주보가 복사되었습니다.`);
      
      // 복사 완료 후 생성된 주보 수정 화면으로 이동
      navigate(`/admin/editor/${docRef.id}`);
    } catch (error) {
      console.error("복사 오류:", error);
      toast.error("주보 복사 중 오류가 발생했습니다.");
    }
  };

  const handleDelete = async (bulletin: any) => {
    if (!window.confirm(`"${bulletin.title}" 주보를 정말 삭제하시겠습니까?`)) return;

    try {
      await deleteDoc(doc(db, "bulletins", bulletin.id));
      setBulletins(prev => prev.filter(b => b.id !== bulletin.id));
      toast.success("주보가 삭제되었습니다.");
    } catch (error) {
      toast.error("삭제 중 오류가 발생했습니다.");
    }
  };

  // 3. 필터링 로직 (불러온 데이터 기준)
  const filteredBulletins = bulletins.filter(bulletin => {
    const title = bulletin.title || "";
    const scripture = bulletin.scripture || "";
    const date = bulletin.date || "";

    const matchesSearch = title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         scripture.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesMonth = filterMonth === "all" || date.includes(`.${filterMonth}.`);
    
    return matchesSearch && matchesMonth;
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
      {/* Header */}
      <div className="bg-white border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                onClick={() => navigate("/admin")}
                className="rounded-full"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                대시보드
              </Button>
              <h1 className="text-xl font-bold">주보 히스토리</h1>
            </div>
            
            {/* 전체 다운로드 버튼: 서비스 준비중 UI 적용 */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="cursor-not-allowed">
                    <Button
                      variant="outline"
                      className="rounded-full bg-gray-50/50 text-gray-400 border-gray-200 pointer-events-none opacity-60 flex items-center gap-2"
                      disabled
                    >
                      <Lock className="w-3.5 h-3.5" />
                      전체 다운로드 (준비중)
                    </Button>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="rounded-xl bg-gray-900 text-white border-0 py-2 px-3 shadow-xl">
                  <p className="text-[11px] font-bold">더 나은 기능을 위해 준비 중입니다!</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* Stats */}
        <div className="grid md:grid-cols-4 gap-4 mb-8">
          <Card className="p-6 rounded-2xl border-0 bg-white shadow-sm">
            <p className="text-gray-600 text-sm mb-1">총 발행 주보</p>
            <p className="text-3xl font-bold">{bulletins.length}개</p>
          </Card>
          <Card className="p-6 rounded-2xl border-0 bg-white shadow-sm">
            <p className="text-gray-600 text-sm mb-1">총 조회수</p>
            <p className="text-3xl font-bold">
              {bulletins.reduce((sum, b) => sum + (b.views || 0), 0)}
            </p>
          </Card>
          <Card className="p-6 rounded-2xl border-0 bg-white shadow-sm">
            <p className="text-gray-600 text-sm mb-1">평균 조회수</p>
            <p className="text-3xl font-bold">
              {bulletins.length > 0 
                ? Math.round(bulletins.reduce((sum, b) => sum + (b.views || 0), 0) / bulletins.length) 
                : 0}
            </p>
          </Card>
          <Card className="p-6 rounded-2xl border-0 bg-white shadow-sm">
            <p className="text-gray-600 text-sm mb-1">최근 주보</p>
            <p className="text-3xl font-bold text-blue-600">
              {bulletins[0]?.date?.split('-')[1] || "0"}월
            </p>
          </Card>
        </div>

        {/* Filters */}
        <Card className="p-6 mb-6 rounded-2xl border-0 bg-white shadow-sm">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                placeholder="제목 또는 본문으로 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 rounded-xl"
              />
            </div>
            <Select value={filterMonth} onValueChange={setFilterMonth}>
              <SelectTrigger className="w-48 rounded-xl">
                <SelectValue placeholder="기간 선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 기간</SelectItem>
                {months.map((m) => (
                  <SelectItem key={m} value={m}>{parseInt(m)}월</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Card>

        {/* Bulletin List */}
        {/* <div className="space-y-4">
          {filteredBulletins.map((bulletin) => (
            <Card key={bulletin.id} className="p-6 rounded-2xl border-0 bg-white hover:shadow-lg transition-all border border-transparent hover:border-blue-100">
              <div className="flex items-start gap-4">
                <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-white flex-shrink-0 bg-gradient-to-br from-blue-500 to-indigo-600`}>
                  <FileText className="w-7 h-7" />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <h3 className="font-bold text-lg mb-1">{bulletin.title || "제목 없음"}</h3>
                      <p className="text-gray-600 text-sm mb-2">{bulletin.subtitle}</p>
                      <div className="flex items-center gap-3 text-sm text-gray-500 font-medium">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {bulletin.date}
                        </span>
                        <span>•</span>
                        <span>{bulletin.scripture}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Eye className="w-4 h-4" />
                          {bulletin.views || 0}
                        </span>
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                      bulletin.status === 'published' || bulletin.status === '발행됨'
                      ? "bg-green-50 text-green-600 border border-green-100" 
                      : "bg-amber-50 text-amber-600 border border-amber-100"
                    }`}>
                      {bulletin.status || "작성중"}
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(`/view/${bulletin.id}`, "_blank")}
                      className="rounded-full font-bold"
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      보기
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/admin/editor/${bulletin.id}`)}
                      className="rounded-full font-bold"
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      수정
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopy(bulletin)}
                      className="rounded-full font-bold"
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      복사
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(bulletin)}
                      className="rounded-full font-bold text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      삭제
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div> */}

        <div className="space-y-4">
          {filteredBulletins.map((bulletin) => (
            <Card key={bulletin.id} className="p-6 rounded-3xl border-0 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.03)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] transition-all group">
              <div className="flex items-start gap-5">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-blue-600 flex-shrink-0 bg-blue-50 font-bold">
                  <FileText className="w-6 h-6" />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div>
                      <h3 className="font-bold text-lg text-gray-900 tracking-tight mb-1">{bulletin.title || "제목 없음"}</h3>
                      <p className="text-gray-500 text-sm font-medium mb-3">{bulletin.subtitle}</p>
                      <div className="flex flex-wrap items-center gap-2.5 text-xs text-gray-400 font-bold">
                        <span className="flex items-center gap-1 bg-gray-50 px-2.5 py-1 rounded-lg">
                          <Calendar className="w-3.5 h-3.5 text-gray-400" />
                          {bulletin.date}
                        </span>
                        {bulletin.scripture && (
                          <span className="bg-gray-50 px-2.5 py-1 rounded-lg text-gray-500">{bulletin.scripture}</span>
                        )}
                        <span className="flex items-center gap-1 bg-gray-50 px-2.5 py-1 rounded-lg">
                          <Eye className="w-3.5 h-3.5 text-gray-400" />
                          {bulletin.views || 0}회
                        </span>
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-[11px] font-bold tracking-tight uppercase ${
                      bulletin.status === 'published' || bulletin.status === '발행됨'
                      ? "bg-blue-50 text-blue-600" 
                      : "bg-gray-100 text-gray-500"
                    }`}>
                      {bulletin.status === 'published' || bulletin.status === '발행됨' ? "게시됨" : "작성중"}
                    </span>
                  </div>

                  <div className="flex gap-2 pt-2 border-t border-gray-50 mt-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => window.open(`/view/${bulletin.id}`, "_blank")}
                      className="rounded-xl font-bold text-xs text-gray-600 hover:bg-gray-100 hover:text-gray-900 px-3.5 py-2"
                    >
                      <Eye className="w-3.5 h-3.5 mr-1.5" />
                      보기
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`/admin/editor/${bulletin.id}`)}
                      className="rounded-xl font-bold text-xs text-gray-600 hover:bg-gray-100 hover:text-gray-900 px-3.5 py-2"
                    >
                      <Edit className="w-3.5 h-3.5 mr-1.5" />
                      수정
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopy(bulletin)}
                      className="rounded-xl font-bold text-xs text-blue-600 hover:bg-blue-50 px-3.5 py-2"
                    >
                      <Copy className="w-3.5 h-3.5 mr-1.5" />
                      복사
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(bulletin)}
                      className="rounded-xl font-bold text-xs text-red-500 hover:bg-red-50 px-3.5 py-2 ml-auto"
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                      삭제
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {filteredBulletins.length === 0 && (
          <Card className="p-20 rounded-2xl border-2 border-dashed border-gray-100 bg-white/50 text-center">
            <FileText className="w-16 h-16 mx-auto mb-4 text-gray-200" />
            <p className="text-gray-500 text-lg font-bold mb-1">표시할 주보가 없습니다</p>
            <p className="text-gray-400 text-sm">새로운 주보를 작성하거나 검색 조건을 변경해보세요.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
