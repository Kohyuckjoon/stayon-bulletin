import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { db, auth } from "../../firebase";
import { doc, getDoc, collection, addDoc, serverTimestamp } from "firebase/firestore";
// 🔴 [수정] onAuthStateChanged와 signOut 임포트 유지
import { onAuthStateChanged, signOut } from "firebase/auth";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { ArrowLeft, Building, Lock, Send, CheckCircle2, UserCheck, LogOut, LogIn } from "lucide-react";

export function JobWrite() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);

    // 현재 로그인한 유저 객체 및 이메일 상태 관리
    const [currentUser, setCurrentUser] = useState<any>(null);

    // 자동 채움 교회 및 부서 정보
    const [churchName, setChurchName] = useState("");
    const [department, setDepartment] = useState("");

    // 입력 폼 상태
    const [position, setPosition] = useState("전도사");
    const [field, setField] = useState("청년부");
    const [region, setRegion] = useState("");
    const [workType, setWorkType] = useState("파트타임");

    // 자격요건 및 사례비 상태 변수 추가
    const [qualification, setQualification] = useState("");
    const [salary, setSalary] = useState("");

    const [deadline, setDeadline] = useState("");
    const [contact, setContact] = useState("");
    const [content, setContent] = useState("");

    // 🔴 [통합 수정] 중복된 useEffect를 하나로 합쳐서 로그인 상태 감지 및 사용자 정보를 안전하게 불러오도록 수정
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (!user) {
                // 비로그인 상태일 때 처리 (여기서 바로 차단하기보다 상태를 비워두어 로그인 버튼을 유도할 수도 있지만,
                // 기존 요구사항에 맞춰 로그인 체크를 수행합니다)
                setCurrentUser(null);
                setChurchName("OO교회 (로그인 필요)");
                setDepartment("OO부서");
                return;
            }

            // 로그인된 유저 정보 저장
            setCurrentUser(user);

            try {
                // Firestore users 문서에서 교회명과 부서 가져오기 (기존 함수명/변수명 유지)
                const userDocRef = doc(db, "users", user.uid);
                const userDocSnap = await getDoc(userDocRef);
                if (userDocSnap.exists()) {
                    const data = userDocSnap.data();
                    setChurchName(data.churchName || "OO교회");
                    setDepartment(data.department || "OO부서");
                    if (data.phone) setContact(data.phone);
                } else {
                    setChurchName("스테이온 교회");
                    setDepartment("관리자 부서");
                }
            } catch (error) {
                console.error("사용자 정보 로딩 에러:", error);
            }
        });

        // 컴포넌트 언마운트 시 리스너 해제
        return () => unsubscribe();
    }, [navigate]);

    // 로그아웃 핸들러 함수
    const handleLogout = async () => {
        try {
            await signOut(auth);
            alert("로그아웃 되었습니다.");
            navigate("/login");
        } catch (error) {
            console.error("로그아웃 에러:", error);
        }
    };

    // 공고 등록 제출 핸들러
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        // 🔴 [추가] 제출 시점에 로그인 상태가 아니라면 로그인 페이지로 유도
        if (!auth.currentUser) {
            alert("로그인이 필요한 서비스입니다.");
            navigate("/login");
            return;
        }

        if (!region || !deadline || !contact || !content) {
            alert("모든 필수 항목을 입력해주세요.");
            return;
        }

        setLoading(true);
        try {
            await addDoc(collection(db, "jobPosts"), {
                churchName,
                department,
                position,
                field,
                region,
                workType,
                qualification,
                salary,
                deadline,
                contact,
                content,
                authorUid: auth.currentUser?.uid,
                createdAt: serverTimestamp(),
            });

            alert("사역자 구인 공고가 성공적으로 등록되었습니다!");
            navigate("/jobs");
        } catch (error) {
            console.error("공고 등록 에러:", error);
            alert("공고 등록 중 오류가 발생했습니다.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#F9FAFB] font-sans py-8 px-4">
            <div className="max-w-2xl mx-auto">
                {/* 상단 네비게이션 */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <Button
                            variant="ghost"
                            onClick={() => navigate("/jobs")}
                            className="rounded-full p-2 hover:bg-gray-200"
                        >
                            <ArrowLeft className="w-5 h-5 text-gray-700" />
                        </Button>
                        <h1 className="text-2xl font-black text-gray-900 tracking-tight">사역자 구인공고 등록</h1>
                    </div>

                    {/* 🔴 [수정] 로그인 상태일 때는 계정 정보 및 로그아웃, 아닐 때는 로그인 버튼 표시 */}
                    {currentUser ? (
                        <div className="relative flex items-center gap-2 bg-white border border-gray-200 px-3 py-1.5 rounded-2xl shadow-2xs">
                            <UserCheck className="w-4 h-4 text-blue-600 shrink-0" />
                            <span className="text-xs font-bold text-gray-700 max-w-[140px] sm:max-w-xs truncate">
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
                            className="rounded-xl text-xs font-black text-blue-600 border-blue-200 hover:bg-blue-50 flex items-center gap-1.5"
                        >
                            <LogIn className="w-3.5 h-3.5" /> 로그인하기
                        </Button>
                    )}
                </div>

                <Card className="bg-white rounded-[2.5rem] p-8 md:p-10 shadow-sm border border-gray-100">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* 교회명 / 부서 (계정 정보에서 자동 채움, 수정 불가) */}
                        <div className="bg-blue-50/60 border border-blue-100 rounded-2xl p-5 space-y-3">
                            <div className="flex items-center gap-2 text-blue-700 font-black text-xs uppercase tracking-wider">
                                <CheckCircle2 className="w-4 h-4 text-blue-600" /> 인증된 교회 계정 정보 (수정 불가)
                            </div>
                            {/* 🔴 [수정] 기존에 있던 오타 문자(s) 제거 완료 */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">교회명</label>
                                    <div className="bg-white border border-blue-200 rounded-xl px-4 py-3 text-sm font-black text-gray-800 flex items-center justify-between">
                                        <span>{churchName}</span>
                                        <Lock className="w-4 h-4 text-blue-400" />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">부서명</label>
                                    <div className="bg-white border border-blue-200 rounded-xl px-4 py-3 text-sm font-black text-gray-800 flex items-center justify-between">
                                        <span>{department}</span>
                                        <Lock className="w-4 h-4 text-blue-400" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 모집 직분 & 사역 분야 */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-black text-gray-800 mb-2">모집 직분</label>
                                <select
                                    value={position}
                                    onChange={(e) => setPosition(e.target.value)}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold text-gray-800 focus:outline-none focus:border-blue-600"
                                >
                                    <option value="전도사">전도사</option>
                                    <option value="부목사">부목사</option>
                                    <option value="강도사">강도사</option>
                                    <option value="간사">간사</option>
                                    <option value="찬양인도자">찬양인도자</option>
                                    <option value="교사">교사</option>
                                    <option value="기타">기타</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-black text-gray-800 mb-2">사역 분야</label>
                                <input
                                    type="text"
                                    placeholder="예: 청년부, 유년부, 찬양팀 등"
                                    value={field}
                                    onChange={(e) => setField(e.target.value)}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold text-gray-800 focus:outline-none focus:border-blue-600"
                                    required
                                />
                            </div>
                        </div>

                        {/* 지역 & 근무 형태 */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-black text-gray-800 mb-2">지역</label>
                                <input
                                    type="text"
                                    placeholder="예: 서울 강남구, 경기 성남시"
                                    value={region}
                                    onChange={(e) => setRegion(e.target.value)}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold text-gray-800 focus:outline-none focus:border-blue-600"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-black text-gray-800 mb-2">근무 형태</label>
                                <select
                                    value={workType}
                                    onChange={(e) => setWorkType(e.target.value)}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold text-gray-800 focus:outline-none focus:border-blue-600"
                                >
                                    <option value="파트타임">파트타임 (파트)</option>
                                    <option value="전임">전임</option>
                                    <option value="협동">협동</option>
                                    <option value="기타">기타 협의</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-black text-gray-800 mb-2">지원 자격</label>
                                <input
                                    type="text"
                                    placeholder="예: 신대원 재학 또는 졸업생 등"
                                    value={qualification}
                                    onChange={(e) => setQualification(e.target.value)}
                                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold text-gray-800 focus:outline-none focus:border-blue-600"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-black text-gray-800 mb-2">사례비 조건</label>
                                <input
                                    type="text"
                                    placeholder="예: 월 120만원 + 장학금 지원"
                                    value={salary}
                                    onChange={(e) => setSalary(e.target.value)}
                                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold text-gray-800 focus:outline-none focus:border-blue-600"
                                />
                            </div>
                        </div>

                        {/* 마감일 & 문의 연락처 */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <label className="block text-sm font-black text-gray-800">마감일</label>
                                    {/* "채용시까지" 원터치 설정 버튼 */}
                                    <button
                                        type="button"
                                        onClick={() => setDeadline("채용시까지")}
                                        className={`text-[11px] font-black px-2.5 py-1 rounded-lg border transition-all ${
                                            deadline === "채용시까지"
                                                ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                                                : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                                        }`}
                                    >
                                        ⚡ 채용시까지
                                    </button>
                                </div>

                                {deadline === "채용시까지" ? (
                                    <div className="w-full bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm font-black text-blue-700 flex items-center justify-between">
                                        <span>채용시까지 (상시 모집)</span>
                                        <button
                                            type="button"
                                            onClick={() => setDeadline("")}
                                            className="text-xs font-bold text-gray-400 hover:text-red-500 underline"
                                        >
                                            날짜 선택으로 변경
                                        </button>
                                    </div>
                                ) : (
                                    <input
                                        type="date"
                                        value={deadline}
                                        onChange={(e) => setDeadline(e.target.value)}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold text-gray-800 focus:outline-none focus:border-blue-600"
                                        required
                                    />
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-black text-gray-800 mb-2">문의 연락처</label>
                                <input
                                    type="text"
                                    placeholder="예: 010-0000-0000 또는 이메일"
                                    value={contact}
                                    onChange={(e) => setContact(e.target.value)}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold text-gray-800 focus:outline-none focus:border-blue-600"
                                    required
                                />
                            </div>
                        </div>

                        {/* 상세 내용 */}
                        <div>
                            <label className="block text-sm font-black text-gray-800 mb-2">상세 내용</label>
                            <textarea
                                rows={6}
                                placeholder="담당 사역 업무, 자격 요건, 제출 서류 및 사례비 조건 등을 상세히 적어주세요."
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-4 text-sm font-bold text-gray-800 focus:outline-none focus:border-blue-600 leading-relaxed"
                                required
                            />
                        </div>

                        {/* 제출 버튼 */}
                        <Button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-2xl shadow-lg shadow-blue-100 flex items-center justify-center gap-2 text-base active:scale-95 transition-all"
                        >
                            <Send className="w-5 h-5" /> {loading ? "등록 중..." : "사역자 공고 등록 완료"}
                        </Button>

                    </form>
                </Card>
            </div>
        </div>
    );
}
