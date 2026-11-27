import { useState, useEffect } from "react";
import { useSmoothNavigate as useNavigate, preloadAdminPages } from "../../utils/smoothNavigate"; // 관리자 화면 사이 부드러운 이동(2026-11-25)
import { auth, db } from "../../firebase"; // Firebase 설정 경로 확인 필요
import { collection, query, where, orderBy, getDocs, deleteDoc, doc, addDoc, serverTimestamp, getDoc} from "firebase/firestore";
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
  useEffect(() => { preloadAdminPages(); }, []);
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

  // 전체 다운로드(CSV)용 - 교회명/부서명은 users/{uid}에서 가져온다.
  const [churchProfile, setChurchProfile] = useState({ churchName: "", department: "" });

  // 1. 사용자 인증 및 데이터 로드
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUserId(user.uid);
        fetchBulletins(user.uid);
        fetchChurchProfile(user.uid);
      } else {
        navigate("/login");
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  const fetchChurchProfile = async (uid: string) => {
    try {
      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) {
        const data = snap.data();
        setChurchProfile({ churchName: data.churchName || "", department: data.department || "" });
      }
    } catch (error) {
      console.error("교회 정보 로드 실패:", error);
    }
  };

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

  // 전체 다운로드(CSV, 데이터 백업용). 엑셀에서 쉼표/따옴표/줄바꿈이 섞인 값이 깨지지
  // 않도록 각 칸을 escapeCsv로 감싸고, UTF-8 BOM을 앞에 붙여야 엑셀이 한글을 깨뜨리지
  // 않고 읽는다(BOM 없으면 "유니코드 깨짐" 문제가 생김).
  const escapeCsvCell = (value: string) => {
    const v = String(value ?? "");
    if (v.includes(",") || v.includes("\"") || v.includes("\n")) {
      return `"${v.replace(/"/g, '""')}"`;
    }
    return v;
  };

  const handleDownloadAll = () => {
    if (bulletins.length === 0) {
      toast.error("다운로드할 주보가 없습니다.");
      return;
    }
    const header = ["No", "교회명", "부서명", "날짜", "말씀 제목(본문)", "본문 구절", "설교자"];
    const rows = bulletins.map((b, i) => [
      String(i + 1),
      churchProfile.churchName,
      churchProfile.department,
      b.date || "",
      b.subtitle || "",
      b.scripture || "",
      b.preacher || "",
    ]);
    const csvContent = [header, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
    const blob = new Blob(["﻿" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `주보히스토리_${churchProfile.churchName || "교회"}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("다운로드가 시작됩니다.");
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

  // published(현재 라이브) / archived(새 발행으로 내려간 지난 주보) / 그 외(draft 등)를 구분
  const getStatusBadge = (status?: string) => {
    if (status === "published" || status === "발행됨") return { label: "게시됨", className: "bg-blue-100 text-blue-700", card: "border-blue-200 bg-blue-50/60" };
    if (status === "archived") return { label: "지난 주보", className: "bg-slate-100 text-slate-500", card: "border-slate-200 bg-white" };
    return { label: "작성중", className: "bg-amber-100 text-amber-700", card: "border-amber-200 bg-white" };
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="container mx-auto px-3 py-2.5 sm:px-4 sm:py-4">
          <div className="flex justify-between items-center gap-2 sm:gap-0">
            <div className="flex items-center gap-1 sm:gap-3 min-w-0">
              <Button
                variant="ghost"
                onClick={() => navigate("/admin")}
                aria-label="대시보드로 돌아가기"
                className="rounded-full shrink-0"
              >
                <ArrowLeft className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">대시보드</span>
              </Button>
              <h1 className="text-base sm:text-xl font-bold truncate">주보 히스토리</h1>
            </div>

            {/* 전체 다운로드: 기존엔 "준비중" 잠금 버튼이었음(아래 주석). CSV 다운로드로 교체. */}
            {/* <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="cursor-not-allowed shrink-0">
                    <Button
                      variant="outline"
                      className="rounded-full bg-gray-50/50 text-gray-400 border-gray-200 pointer-events-none opacity-60 flex items-center gap-2 h-8 px-3 text-xs sm:h-9 sm:text-sm"
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
            </TooltipProvider> */}
            <Button
              variant="outline"
              onClick={handleDownloadAll}
              className="rounded-full bg-emerald-50/70 text-emerald-700 border-emerald-200 hover:bg-emerald-100 flex items-center gap-2 h-8 px-3 text-xs sm:h-9 sm:text-sm shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              전체 다운로드
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-3 py-3 sm:px-4 sm:py-8">
        {/* Stats: 모바일은 2×2 작은 카드, sm 이상은 기존 레이아웃 그대로 */}
        <div className="grid grid-cols-2 gap-2 mb-3 sm:grid-cols-1 sm:gap-4 sm:mb-8 md:grid-cols-4">
          <Card className="p-3 gap-0.5 rounded-xl sm:p-6 sm:gap-6 sm:rounded-2xl border border-slate-200 bg-white shadow-sm">
            <p className="text-gray-600 text-xs sm:text-sm sm:mb-1">총 발행 주보</p>
            <p className="text-xl sm:text-3xl font-bold">{bulletins.length}개</p>
          </Card>
          <Card className="p-3 gap-0.5 rounded-xl sm:p-6 sm:gap-6 sm:rounded-2xl border border-slate-200 bg-white shadow-sm">
            <p className="text-gray-600 text-xs sm:text-sm sm:mb-1">총 조회수</p>
            <p className="text-xl sm:text-3xl font-bold">
              {bulletins.reduce((sum, b) => sum + (b.views || 0), 0)}
            </p>
          </Card>
          <Card className="p-3 gap-0.5 rounded-xl sm:p-6 sm:gap-6 sm:rounded-2xl border border-slate-200 bg-white shadow-sm">
            <p className="text-gray-600 text-xs sm:text-sm sm:mb-1">평균 조회수</p>
            <p className="text-xl sm:text-3xl font-bold">
              {bulletins.length > 0
                ? Math.round(bulletins.reduce((sum, b) => sum + (b.views || 0), 0) / bulletins.length)
                : 0}
            </p>
          </Card>
          <Card className="p-3 gap-0.5 rounded-xl sm:p-6 sm:gap-6 sm:rounded-2xl border border-slate-200 bg-white shadow-sm">
            <p className="text-gray-600 text-xs sm:text-sm sm:mb-1">최근 주보</p>
            <p className="text-xl sm:text-3xl font-bold text-blue-600">
              {bulletins[0]?.date?.split('-')[1] || "0"}월
            </p>
          </Card>
        </div>

        {/* Filters */}
        <Card className="p-3 mb-3 rounded-xl sm:p-6 sm:mb-6 sm:rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex gap-2 sm:gap-4">
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
              <SelectTrigger className="w-28 sm:w-48 rounded-xl">
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

        <div className="space-y-2.5 sm:space-y-4">
          {filteredBulletins.map((bulletin) => {
            const badge = getStatusBadge(bulletin.status);
            return (
            <Card key={bulletin.id} className={`p-4 rounded-2xl sm:p-6 sm:rounded-3xl border shadow-[0_2px_12px_rgba(0,0,0,0.03)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] transition-all group ${badge.card}`}>
              <div className="flex items-start gap-5">
                <div className="hidden sm:flex w-12 h-12 rounded-2xl items-center justify-center text-blue-600 flex-shrink-0 bg-blue-50 font-bold">
                  <FileText className="w-6 h-6" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 sm:gap-4 mb-1 sm:mb-2">
                    <div className="min-w-0">
                      <h3 className="font-bold text-base sm:text-lg text-gray-900 tracking-tight mb-0.5 sm:mb-1 line-clamp-2 sm:line-clamp-none">{bulletin.title || "제목 없음"}</h3>
                      <p className="text-gray-500 text-[13px] sm:text-sm font-medium mb-2 sm:mb-3 line-clamp-1 sm:line-clamp-none">{bulletin.subtitle}</p>
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2.5 text-xs text-gray-400 font-bold">
                        <span className="flex items-center gap-1 bg-slate-100 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg">
                          <Calendar className="w-3.5 h-3.5 text-gray-400" />
                          {bulletin.date}
                        </span>
                        {bulletin.scripture && (
                          <span className="bg-slate-100 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-gray-500">{bulletin.scripture}</span>
                        )}
                        <span className="flex items-center gap-1 bg-slate-100 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg">
                          <Eye className="w-3.5 h-3.5 text-gray-400" />
                          {bulletin.views || 0}회
                        </span>
                      </div>
                    </div>
                    <span className={`shrink-0 whitespace-nowrap px-2.5 sm:px-3 py-1 rounded-full text-[11px] font-bold tracking-tight uppercase ${badge.className}`}>
                      {badge.label}
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-1 pt-2 border-t border-slate-200/70 mt-3 sm:flex sm:gap-2 sm:mt-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => window.open(`/view/${bulletin.id}`, "_blank")}
                      className="rounded-xl font-bold text-xs text-gray-600 hover:bg-gray-100 hover:text-gray-900 border border-slate-200 bg-white px-3.5 py-2 h-9 w-full sm:h-8 sm:w-auto"
                    >
                      <Eye className="w-3.5 h-3.5 mr-1.5" />
                      보기
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`/admin/editor/${bulletin.id}`)}
                      className="rounded-xl font-bold text-xs text-gray-600 hover:bg-gray-100 hover:text-gray-900 border border-slate-200 bg-white px-3.5 py-2 h-9 w-full sm:h-8 sm:w-auto"
                    >
                      <Edit className="w-3.5 h-3.5 mr-1.5" />
                      수정
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopy(bulletin)}
                      className="rounded-xl font-bold text-xs text-blue-600 hover:bg-blue-50 border border-blue-200 bg-white px-3.5 py-2 h-9 w-full sm:h-8 sm:w-auto"
                    >
                      <Copy className="w-3.5 h-3.5 mr-1.5" />
                      복사
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(bulletin)}
                      className="rounded-xl font-bold text-xs text-red-500 hover:bg-red-50 border border-red-200 bg-white px-3.5 py-2 h-9 w-full sm:h-8 sm:w-auto ml-0 sm:ml-auto"
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                      삭제
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
            );
          })}
        </div>

        {filteredBulletins.length === 0 && (
          <Card className="p-8 sm:p-20 rounded-2xl border-2 border-dashed border-slate-300 bg-white/60 text-center">
            <FileText className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 text-gray-200" />
            <p className="text-gray-500 text-base sm:text-lg font-bold mb-1">표시할 주보가 없습니다</p>
            <p className="text-gray-400 text-sm">새로운 주보를 작성하거나 검색 조건을 변경해보세요.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
