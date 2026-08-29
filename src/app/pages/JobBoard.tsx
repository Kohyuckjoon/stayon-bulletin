import { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router";
import { db, auth } from "../../firebase";
import { collection, getDocs, query, orderBy, Timestamp, doc, deleteDoc, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import {
    Smartphone,
    Briefcase,
    MapPin,
    Calendar,
    Phone,
    Plus,
    ShieldCheck,
    Search,
    Filter,
    ArrowLeft,
    Building2,
    Bookmark,
    BadgeCheck,
    LayoutGrid,
    List,
    UserCheck,
    LogIn,
    LogOut,
    Pencil,
    Trash2,
    Sparkles,
    Flame,
    Megaphone
} from "lucide-react";
import { isJobBoosted } from "../../utils/jobBoostDisplay";

interface JobPost {
    id: string;
    churchName: string;
    department: string;
    position: string; // 모집 직분
    field: string;    // 사역 분야
    region: string;   // 지역
    workType: string; // 근무 형태
    deadline: string; // 마감일
    contact: string;  // 문의 연락처
    content: string;  // 상세 내용
    createdAt: any;
    authorUid?: string; // 작성자 구분을 위한 uid 필드
    boostedUntil?: Timestamp | null; // /super 광고 설정에서 기간제로 끌어올린 경우 만료 시각
}

// boostedUntil이 현재 시각보다 미래인 경우에만 "끌어올림"으로 취급 (기간 만료 시 자동으로 일반 노출로 복귀)
const isBoostActive = isJobBoosted;


export function JobBoard() {
    const navigate = useNavigate();
    const location = useLocation(); // 이전 경로 및 상태 확인용
    const [posts, setPosts] = useState<JobPost[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [selectedPosition, setSelectedPosition] = useState<string>("전체");
    const [searchRegion, setSearchRegion] = useState<string>("");

    // 현재 로그인한 유저 객체 상태 관리
    const [currentUser, setCurrentUser] = useState<any>(null);

    // 페이지 전환 애니메이션 상태
    const [isAnimating, setIsAnimating] = useState(false); 

    // 뷰 모드 상태 관리 ("card" 또는 "list")
    const [viewMode, setViewMode] = useState<"card" | "list">("card");

    // 로컬스토리지 연동 즐겨찾기(북마크) ID 목록 상태 관리
    const [favorites, setFavorites] = useState<string[]>(() => {
        try {
            const saved = localStorage.getItem("stayon_job_favorites");
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            return [];
        }
    });

    // 즐겨찾기 모아보기 필터 상태
    const [showOnlyFavorites, setShowOnlyFavorites] = useState<boolean>(false);

    // /super 광고 설정(티커 노출) 탭에서 고른 공고 id 목록. 비어있으면 끌어올린 공고
    // 우선 + 나머지 무작위로 자동 노출(아래 tickerPosts에서 처리)
    const [tickerIds, setTickerIds] = useState<string[]>([]);

    useEffect(() => {
        const unsubscribe = onSnapshot(doc(db, "settings", "jobTicker"), (snap) => {
            setTickerIds(snap.exists() ? (snap.data().jobPostIds || []) : []);
        });
        return () => unsubscribe();
    }, []);

    // 관리자가 직접 고른 공고가 있으면 그 순서 그대로, 없으면 끌어올린 공고를 우선 채우고
    // 나머지는 무작위로 섞어 최대 8개까지 티커에 노출
    const tickerPosts = useMemo(() => {
        if (tickerIds.length > 0) {
            return tickerIds.map((id) => posts.find((p) => p.id === id)).filter((p): p is JobPost => !!p);
        }
        const boosted = posts.filter(isBoostActive);
        const rest = posts.filter((p) => !isBoostActive(p));
        const shuffledRest = [...rest].sort(() => Math.random() - 0.5);
        return [...boosted, ...shuffledRest].slice(0, 8);
    }, [tickerIds, posts]);

    // 컴포넌트 마운트 시 부드럽게 나타나는 애니메이션 트리거
    useEffect(() => {
        setIsAnimating(true);

        const unsubscribe = auth.onAuthStateChanged((user) => {
            if (user) {
                setCurrentUser(user);
            } else {
                setCurrentUser(null);
            }
        });
        
        return () => unsubscribe();
    }, []);

    // 스마트 뒤로가기 핸들러 (이전 경로 상태나 referrer에 따라 분기, 기본은 메인 또는 관리자)
    const handleSmartBack = () => {
        setIsAnimating(false); // 사라지는 애니메이션 효과 부여
        setTimeout(() => {
        // state로 전달된 값이 있거나 referrer에 dashboard/admin이 포함되어 있으면 관리자로, 아니면 메인으로
        // const fromDashboard = location.state?.from === "dashboard" || document.referrer.includes("dashboard") || document.referrer.includes("admin");
        const fromDashboard = location.state?.from === "admin";
        
        if (fromDashboard) {
                navigate("/admin"); // 관리자에서 왔다면 관리자로 복귀
            } else {
                navigate("/"); // 메인 화면(Landing) 또는 기본값으로 복귀
            }
        }, 300); // 애니메이션 시간과 맞춤
    };

    // 즐겨찾기 변경 시 로컬스토리지 동기화
    useEffect(() => {
        try {
            localStorage.setItem("stayon_job_favorites", JSON.stringify(favorites));
        } catch (e) {
            console.error("즐겨찾기 저장 오류:", e);
        }
    }, [favorites]);

    // 실시간 로그인 상태 감지 (onAuthStateChanged)
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setCurrentUser(user);
        });
        return () => unsubscribe();
    }, []);

    // 로그아웃 핸들러 함수
    const handleLogout = async () => {
        try {
            await signOut(auth);
            alert("로그아웃 되었습니다.");
        } catch (error) {
            console.error("로그아웃 에러:", error);
        }
    };

    const toggleFavorite = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setFavorites((prev) =>
            prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
        );
    };

    // 공고 삭제 핸들러 함수 구현
    const handleDeletePost = async (postId: string, e: React.MouseEvent) => {
        e.stopPropagation(); // 카드 클릭 이벤트 전파 방지
        if (!window.confirm("정말 이 청빙 공고를 삭제하시겠습니까?")) return;

        try {
            await deleteDoc(doc(db, "jobPosts", postId));
            setPosts((prev) => prev.filter((post) => post.id !== postId));
            alert("공고가 성공적으로 삭제되었습니다.");
        } catch (error) {
            console.error("공고 삭제 중 오류 발생:", error);
            alert("공고 삭제에 실패했습니다.");
        }
    };

    // 파이어베이스에서 사역자 공고 데이터 불러오기
    useEffect(() => {
        const fetchJobs = async () => {
            try {
                const q = query(collection(db, "jobPosts"), orderBy("createdAt", "desc"));
                const querySnapshot = await getDocs(q);
                const list: JobPost[] = [];
                querySnapshot.forEach((doc) => {
                    list.push({ id: doc.id, ...doc.data() } as JobPost);
                });
                setPosts(list);
            } catch (error) {
                console.error("공고를 불러오는 중 오류 발생:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchJobs();
    }, []);

    // 필터링 로직 (직분, 지역, 즐겨찾기 여부 반영) + 끌어올림(광고) 공고를 최상단으로 정렬
    // (posts가 이미 createdAt desc로 정렬되어 있어 Array.sort의 안정 정렬 특성상 같은 그룹 내 순서는 유지됨)
    const filteredPosts = posts
        .filter((post) => {
            const matchPosition = selectedPosition === "전체" || post.position === selectedPosition;
            const matchRegion = !searchRegion || post.region.includes(searchRegion) || post.churchName.includes(searchRegion);
            const matchFavorite = !showOnlyFavorites || favorites.includes(post.id);
            return matchPosition && matchRegion && matchFavorite;
        })
        .sort((a, b) => Number(isBoostActive(b)) - Number(isBoostActive(a)));

    const positions = ["전체", "부목사님", "전도사님", "강도사님", "간사님", "찬양인도자", "교사", "기타"];

    return (
        // <div className="min-h-screen bg-[#F9FAFB] font-sans selection:bg-blue-100">
        <div className={`min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 font-sans transition-opacity duration-300 ${isAnimating ? "opacity-100" : "opacity-0"}`}>
            {/* 상단 네비게이션 */}
            <nav className="bg-white/80 backdrop-blur-md sticky top-0 z-50 border-b border-gray-100 px-4 py-3.5">
                <div className="max-w-6xl mx-auto flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        {/* <Button
                            variant="ghost"
                            onClick={() => navigate("/")}
                            className="rounded-full p-2 hover:bg-gray-100"
                        > */}
                        <Button
                            variant="ghost"
                            onClick={handleSmartBack}
                            className="rounded-full p-2 hover:bg-gray-100 transition-transform active:scale-95"
                            title="이전으로 돌아가기"
                        >
                            <ArrowLeft className="w-5 h-5 text-gray-700" />
                        </Button>
                        <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate("/")}>
                            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shadow-md shadow-blue-200">
                                <Briefcase className="w-5 h-5 text-white" />
                            </div>
                            <span className="text-xl font-black text-gray-900 tracking-tight">
                                스테이온 사역자 청빙
                            </span>
                        </div>
                    </div>

                    {/* 공고 등록하기 버튼 바로 왼쪽에 로그인 상태 및 로그인/로그아웃 버튼 배치 */}
                    <div className="flex items-center gap-2 sm:gap-3">
                        {currentUser ? (
                            <div className="relative hidden sm:flex items-center gap-2 bg-white border border-gray-200 px-3 py-1.5 rounded-2xl shadow-2xs">
                                <UserCheck className="w-4 h-4 text-blue-600 shrink-0" />
                                <span className="text-xs font-bold text-gray-700 max-w-[120px] lg:max-w-xs truncate">
                                    {currentUser.email}
                                </span>
                                <button
                                    type="button"
                                    onClick={handleLogout}
                                    className="text-[11px] font-black text-red-500 hover:bg-red-50 px-2 py-1 rounded-lg transition-all flex items-center gap-1 ml-1"
                                    title="로그아웃"
                                >
                                    <LogOut className="w-3 h-3" /> 로그아웃
                                </button>
                            </div>
                        ) : (
                            <Button
                                onClick={() => navigate("/login")}
                                variant="outline"
                                className="rounded-full text-xs font-black text-blue-600 border-blue-200 hover:bg-blue-50 hidden sm:flex items-center gap-1.5 px-4 h-10"
                            >
                                <LogIn className="w-3.5 h-3.5" /> 로그인
                            </Button>
                        )}

                        <Button
                            onClick={() => navigate("/jobs/boost")}
                            variant="outline"
                            className="rounded-full text-xs font-black text-amber-600 border-amber-200 hover:bg-amber-50 hidden sm:flex items-center gap-1.5 px-4 h-10"
                        >
                            <Megaphone className="w-3.5 h-3.5" /> 공고 홍보하기
                        </Button>

                        <Button
                            onClick={() => {
                                const user = auth.currentUser;
                                if (!user) {
                                    alert("공고 등록은 교회 관리자 로그인 후 가능합니다.");
                                    navigate("/login");
                                } else {
                                    navigate("/jobs/write");
                                }
                            }}
                            className="rounded-full bg-blue-600 hover:bg-blue-700 text-white font-black px-5 py-2.5 shadow-md flex items-center gap-1.5 active:scale-95 transition-all"
                        >
                            <Plus className="w-4 h-4" /> 공고 등록하기
                        </Button>
                    </div>
                </div>
            </nav>

            {/* 광고 티커 배너 — /super 광고 설정(티커 노출) 탭에서 고른 공고가 이 순서로 계속 흐르며 노출됨 */}
            {tickerPosts.length > 0 && (
                <div className="bg-blue-600 overflow-hidden">
                    <style>{`
                        @keyframes jobTickerScroll {
                            from { transform: translateX(0); }
                            to { transform: translateX(-50%); }
                        }
                        .job-ticker-track {
                            animation: jobTickerScroll 32s linear infinite;
                        }
                        .job-ticker-track:hover {
                            animation-play-state: paused;
                        }
                    `}</style>
                    <div className="flex w-max job-ticker-track">
                        {[...tickerPosts, ...tickerPosts].map((post, idx) => (
                            <button
                                key={`${post.id}-${idx}`}
                                onClick={() => navigate(`/jobs/${post.id}`)}
                                className="flex items-center gap-2 px-5 py-2.5 shrink-0 border-r border-white/10 hover:bg-white/10 transition-colors"
                            >
                                {isBoostActive(post) && <Flame className="w-3.5 h-3.5 text-amber-300 shrink-0" />}
                                <span className="text-white text-xs font-black whitespace-nowrap">{post.churchName}</span>
                                <span className="text-blue-100 text-xs font-bold whitespace-nowrap">{post.position} · {post.region}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div className="max-w-6xl mx-auto px-4 py-8">
                {currentUser && (
                    <div className="sm:hidden bg-blue-50 border border-blue-100 rounded-2xl px-4 py-2.5 mb-4 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs font-bold text-blue-800 truncate">
                            <UserCheck className="w-4 h-4 text-blue-600 shrink-0" />
                            <span className="truncate">{currentUser.email} 접속 중</span>
                        </div>
                        <button
                            onClick={handleLogout}
                            className="text-[11px] font-black text-red-500 bg-white border border-red-100 px-2.5 py-1 rounded-lg"
                        >
                            로그아웃
                        </button>
                    </div>
                )}

                {/* 신뢰 안내 문구 — 카드가 아닌 슬림한 텍스트 줄로만 두어, 아래 "검색·필터" 카드와
                    시각적으로 경쟁하지 않게 함 */}
                <div className="flex items-center justify-between gap-3 mb-3 px-1">
                    <div className="flex items-center gap-1.5 text-gray-500 text-xs font-bold">
                        <BadgeCheck className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        사역자 청빙 인증제 · 교회 담당자가 직접 작성한 공고만 제공합니다
                    </div>
                    <span className="text-[11px] font-black text-red-400 shrink-0 hidden sm:inline">무단 수집 금지</span>
                </div>

                {/* 검색·필터 컨트롤 패널 — 결과 목록과 구분되는 유일한 "카드" 블록 */}
                <div className="bg-white rounded-[2rem] p-5 sm:p-6 shadow-sm border border-gray-100 mb-5">
                    <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-3">검색 · 필터</p>
                    <div className="flex flex-col sm:flex-row gap-3 items-center">
                        <div className="relative w-full sm:flex-1">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="교회명 또는 지역으로 검색 (예: 서울, 온누리)"
                                value={searchRegion}
                                onChange={(e) => setSearchRegion(e.target.value)}
                                className="w-full bg-gray-50 border border-gray-200 rounded-2xl pl-11 pr-4 py-3 text-sm font-bold text-gray-800 focus:outline-none focus:border-blue-600 transition-all"
                            />
                        </div>
                        <button
                            onClick={() => setShowOnlyFavorites(!showOnlyFavorites)}
                            className={`w-full sm:w-auto shrink-0 px-4 py-3 rounded-2xl text-xs font-black flex items-center justify-center gap-1.5 transition-all border ${showOnlyFavorites
                                ? "bg-amber-500 text-white border-amber-500 shadow-sm"
                                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                                }`}
                        >
                            <Bookmark className={`w-4 h-4 ${showOnlyFavorites ? "fill-white" : "text-amber-500"}`} />
                            즐겨찾는 공고 ({favorites.length})
                        </button>
                    </div>

                    {/* 직분별 칩 필터 */}
                    <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar mt-4 pt-4 border-t border-gray-100">
                        {positions.map((pos) => (
                            <button
                                key={pos}
                                onClick={() => setSelectedPosition(pos)}
                                className={`px-4 py-2 rounded-xl text-xs font-black shrink-0 transition-all ${selectedPosition === pos
                                    ? "bg-blue-600 text-white shadow-md shadow-blue-100"
                                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                    }`}
                            >
                                {pos}
                            </button>
                        ))}
                    </div>
                </div>

                {/* 결과 헤더 — 카드가 아닌 텍스트 줄로 "여기부터 결과"임을 명확히 구분 */}
                <div className="flex items-center justify-between gap-3 mb-4 px-1">
                    <p className="text-sm font-black text-gray-800">
                        공고 <span className="text-blue-600">{filteredPosts.length}</span>건
                    </p>
                    <div className="relative flex items-center bg-white border border-gray-200 p-1 rounded-xl shrink-0 shadow-xs">
                        <button
                            onClick={() => setViewMode("card")}
                            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                                viewMode === "card"
                                    ? "bg-blue-600 text-white shadow-xs"
                                    : "text-gray-500 hover:text-gray-900"
                            }`}
                        >
                            <LayoutGrid className="w-3.5 h-3.5" /> 카드
                        </button>
                        <button
                            onClick={() => setViewMode("list")}
                            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                                viewMode === "list"
                                    ? "bg-blue-600 text-white shadow-xs"
                                    : "text-gray-500 hover:text-gray-900"
                            }`}
                        >
                            <List className="w-3.5 h-3.5" /> 리스트
                        </button>
                    </div>
                </div>

                {/* 공고 리스트 섹션 (뷰 모드에 따라 카드 그리드 혹은 토스 스타일 리스트/테이블로 분기) */}
                {loading ? (
                    <div className="text-center py-20 text-gray-400 font-bold">사역자 공고를 불러오는 중입니다...</div>
                ) : filteredPosts.length === 0 ? (
                    <div className="text-center py-24 bg-white rounded-[2.5rem] border border-gray-100 shadow-sm p-8 space-y-4">
                        <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto">
                            <Briefcase className="w-8 h-8" />
                        </div>
                        <h3 className="text-lg font-black text-gray-800">
                            {showOnlyFavorites ? "즐겨찾기한 공고가 없습니다" : "등록된 사역자 공고가 없습니다"}
                        </h3>
                        <p className="text-sm text-gray-400 font-medium">
                            {showOnlyFavorites ? "마음에 드는 공고의 북마크 아이콘을 눌러보세요!" : "첫 번째 사역자 구인 공고를 등록하여 동역자를 만나보세요!"}
                        </p>
                        {!showOnlyFavorites && (
                            <Button
                                onClick={() => navigate("/jobs/write")}
                                className="bg-blue-600 hover:bg-blue-700 text-white font-black px-6 py-3 rounded-2xl shadow-lg"
                            >
                                공고 등록하러 가기
                            </Button>
                        )}
                    </div>
                ) : viewMode === "card" ? (
                    // 기존 카드 형태 그리드 뷰
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 items-start">
                        {filteredPosts.map((post) => {
                            const isFavorited = favorites.includes(post.id);
                            return (
                                <Card
                                    key={post.id}
                                    onClick={() => navigate(`/jobs/${post.id}`)}
                                    className={`bg-white rounded-2xl p-5 border shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all flex flex-col gap-2.5 group relative cursor-pointer ${isBoostActive(post) ? "border-amber-200 ring-1 ring-amber-100" : "border-gray-100"}`}
                                >
                                    <div>
                                        {/* 상단 뱃지 및 북마크 버튼 */}
                                        <div className="flex justify-between items-start mb-3">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                {isBoostActive(post) && (
                                                    <span className="bg-amber-500 text-white font-black text-[11px] px-2.5 py-0.5 rounded-md flex items-center gap-1">
                                                        <Sparkles className="w-3 h-3" /> 광고
                                                    </span>
                                                )}
                                                <span className="bg-blue-50 text-blue-600 font-black text-[11px] px-2.5 py-0.5 rounded-md">
                                                    {post.position}
                                                </span>
                                                <span className="bg-gray-100 text-gray-600 font-bold text-[11px] px-2.5 py-0.5 rounded-md">
                                                    {post.workType}
                                                </span>
                                            </div>

                                            {/* 즐겨찾기 토글 버튼 */}
                                            <button
                                                onClick={(e) => toggleFavorite(post.id, e)}
                                                className="w-8 h-8 rounded-full bg-gray-50 hover:bg-gray-100 flex items-center justify-center transition-colors text-gray-400 hover:text-amber-500"
                                                title={isFavorited ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                                            >
                                                <Bookmark className={`w-4 h-4 ${isFavorited ? "fill-amber-500 text-amber-500" : ""}`} />
                                            </button>
                                        </div>

                                        {/* 교회명 & 부서 */}
                                        <h3 className="text-lg font-black text-gray-900 group-hover:text-blue-600 transition-colors mb-1 truncate">
                                            {post.churchName} <span className="text-xs font-bold text-gray-500">({post.department})</span>
                                        </h3>

                                        {/* 지역 및 사역 분야 */}
                                        <div className="flex items-center gap-2 text-xs font-bold text-gray-500 mb-3">
                                            <span className="flex items-center gap-1 truncate"><MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" /> {post.region}</span>
                                            <span>•</span>
                                            <span className="truncate">분야: {post.field}</span>
                                        </div>

                                        {/* 마감일 및 요약 내용 */}
                                        <div className="space-y-1.5 mb-3">
                                            <div className="text-[10px] font-bold text-red-500 bg-red-50/80 px-2 py-0.5 rounded-md inline-flex items-center gap-1">
                                                <Calendar className="w-3 h-3" /> 마감: {post.deadline}
                                            </div>

                                            <p
                                                className="text-[11px] text-gray-600 font-medium bg-gray-50/70 p-2.5 rounded-xl leading-snug overflow-hidden"
                                                style={{
                                                    display: "-webkit-box",
                                                    WebkitLineClamp: 2,
                                                    WebkitBoxOrient: "vertical",
                                                    maxHeight: "2.6rem",
                                                }}
                                            >
                                                {post.content}
                                            </p>
                                        </div>
                                    </div>

                                    {/* 하단 관리자 수정/삭제 버튼 및 상세보기 영역 */}
                                    <div className="pt-2.5 border-t border-gray-100 flex items-center justify-between">
                                        {/* 본인이 작성한 공고일 때만 보이는 수정/삭제 버튼 영역 */}
                                        {currentUser?.uid === post.authorUid ? (
                                            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                                <Button
                                                    variant="outline"
                                                    onClick={() => navigate(`/jobs/edit/${post.id}`)}
                                                    className="rounded-lg border-gray-200 text-[10px] font-black h-7 px-2 text-blue-600 hover:bg-blue-50"
                                                    title="공고 수정"
                                                >
                                                    <Pencil className="w-3 h-3 mr-0.5" /> 수정
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    onClick={(e) => handleDeletePost(post.id, e)}
                                                    className="rounded-lg border-red-100 text-[10px] font-black h-7 px-2 text-red-500 hover:bg-red-50"
                                                    title="공고 삭제"
                                                >
                                                    <Trash2 className="w-3 h-3 mr-0.5" /> 삭제
                                                </Button>
                                            </div>
                                        ) : (
                                            <div className="text-[10px] font-bold text-gray-400 truncate max-w-[120px]">
                                                {post.region}
                                            </div>
                                        )}

                                        <Button
                                            variant="outline"
                                            onClick={(e) => { e.stopPropagation(); navigate(`/jobs/${post.id}`); }}
                                            className="rounded-lg border-gray-200 text-[11px] font-black h-7 px-2.5 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200"
                                        >
                                            상세보기
                                        </Button>
                                    </div>
                                </Card>
                            );
                        })}
                    </div>
                ) : (
                    // 토스 스타일의 직관적이고 깔끔한 리스트(테이블) 뷰 모드
                    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-gray-50/80 border-b border-gray-100 text-xs font-black text-gray-500">
                                        <th className="py-4 px-5">북마크</th>
                                        <th className="py-4 px-5">교회 / 부서</th>
                                        <th className="py-4 px-5">모집 직분 / 분야</th>
                                        <th className="py-4 px-5">근무형태 / 지역</th>
                                        <th className="py-4 px-5">마감일</th>
                                        <th className="py-4 px-5 text-right">관리</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 text-xs">
                                    {filteredPosts.map((post) => {
                                        const isFavorited = favorites.includes(post.id);
                                        return (
                                            <tr
                                                key={post.id}
                                                className={`hover:bg-blue-50/40 transition-colors cursor-pointer ${isBoostActive(post) ? "bg-amber-50/40" : ""}`}
                                                onClick={() => navigate(`/jobs/${post.id}`)}
                                            >
                                                <td className="py-4 px-5" onClick={(e) => e.stopPropagation()}>
                                                    <button
                                                        onClick={(e) => toggleFavorite(post.id, e)}
                                                        className="w-7 h-7 rounded-full bg-gray-50 hover:bg-gray-100 flex items-center justify-center transition-colors text-gray-400 hover:text-amber-500"
                                                    >
                                                        <Bookmark className={`w-3.5 h-3.5 ${isFavorited ? "fill-amber-500 text-amber-500" : ""}`} />
                                                    </button>
                                                </td>
                                                <td className="py-4 px-5 font-black text-gray-900">
                                                    <div className="flex items-center gap-1.5">
                                                        {isBoostActive(post) && (
                                                            <span className="bg-amber-500 text-white font-black text-[9px] px-1.5 py-0.5 rounded flex items-center gap-0.5 shrink-0">
                                                                <Sparkles className="w-2.5 h-2.5" /> 광고
                                                            </span>
                                                        )}
                                                        <div className="text-sm">{post.churchName}</div>
                                                    </div>
                                                    <div className="text-[11px] font-bold text-gray-400">{post.department}</div>
                                                </td>
                                                <td className="py-4 px-5">
                                                    <div className="flex items-center gap-1.5 mb-1">
                                                        <span className="bg-blue-50 text-blue-600 font-black text-[10px] px-2 py-0.5 rounded">
                                                            {post.position}
                                                        </span>
                                                    </div>
                                                    <div className="font-bold text-gray-600 text-[11px]">{post.field}</div>
                                                </td>
                                                <td className="py-4 px-5">
                                                    <div className="font-bold text-gray-800 text-[11px]">{post.workType}</div>
                                                    <div className="text-gray-400 font-medium text-[11px] flex items-center gap-1 mt-0.5">
                                                        <MapPin className="w-3 h-3 text-blue-500" /> {post.region}
                                                    </div>
                                                </td>
                                                <td className="py-4 px-5">
                                                    <span className="bg-red-50 text-red-500 font-bold text-[11px] px-2 py-1 rounded-md inline-block">
                                                        {post.deadline}
                                                    </span>
                                                </td>
                                                <td className="py-4 px-5 text-right" onClick={(e) => e.stopPropagation()}>
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        {currentUser?.uid === post.authorUid && (
                                                            <>
                                                                <Button
                                                                    variant="outline"
                                                                    onClick={() => navigate(`/jobs/edit/${post.id}`)}
                                                                    className="rounded-lg border-gray-200 text-[11px] font-black h-7 px-2.5 text-blue-600 hover:bg-blue-50"
                                                                >
                                                                    수정
                                                                </Button>
                                                                <Button
                                                                    variant="outline"
                                                                    onClick={(e) => handleDeletePost(post.id, e)}
                                                                    className="rounded-lg border-red-100 text-[11px] font-black h-7 px-2.5 text-red-500 hover:bg-red-50"
                                                                >
                                                                    삭제
                                                                </Button>
                                                            </>
                                                        )}
                                                        <Button
                                                            variant="outline"
                                                            onClick={() => navigate(`/jobs/${post.id}`)}
                                                            className="rounded-lg border-gray-200 text-[11px] font-black h-7 px-3 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all"
                                                        >
                                                            상세보기
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
