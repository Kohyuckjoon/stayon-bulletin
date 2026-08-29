import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { db, auth } from "../../firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { ArrowLeft, Lock, Save, CheckCircle2, UserCheck, LogOut, LogIn } from "lucide-react";

// JobWrite.tsx(신규 등록)와 거의 동일한 폼이지만, 기존 공고(jobPosts/{id})를 불러와 채운 뒤
// addDoc 대신 updateDoc으로 저장한다. 교회명/부서는 등록 때와 동일하게 계정 정보 기준으로
// 잠겨 있어 공고별로 따로 수정할 수 없다.
export function JobEdit() {
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();

    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [currentUser, setCurrentUser] = useState<any>(null);

    const [churchName, setChurchName] = useState("");
    const [department, setDepartment] = useState("");

    const [position, setPosition] = useState("전도사");
    const [field, setField] = useState("청년부");
    const [region, setRegion] = useState("");
    const [workType, setWorkType] = useState("파트타임");
    const [qualification, setQualification] = useState("");
    const [salary, setSalary] = useState("");
    const [deadline, setDeadline] = useState("");
    const [contact, setContact] = useState("");
    const [content, setContent] = useState("");

    // 로그인 상태 감지 + 계정 기준 교회명/부서 자동 채움 (JobWrite.tsx와 동일 로직)
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (!user) {
                setCurrentUser(null);
                setChurchName("OO교회 (로그인 필요)");
                setDepartment("OO부서");
                return;
            }
            setCurrentUser(user);
            try {
                const userDocSnap = await getDoc(doc(db, "users", user.uid));
                if (userDocSnap.exists()) {
                    const data = userDocSnap.data();
                    setChurchName(data.churchName || "OO교회");
                    setDepartment(data.department || "OO부서");
                } else {
                    setChurchName("스테이온 교회");
                    setDepartment("관리자 부서");
                }
            } catch (error) {
                console.error("사용자 정보 로딩 에러:", error);
            }
        });
        return () => unsubscribe();
    }, []);

    // 기존 공고 데이터 불러와 폼에 채우기 + 작성자 본인인지 확인
    useEffect(() => {
        if (!id) return;
        getDoc(doc(db, "jobPosts", id))
            .then((snap) => {
                if (!snap.exists()) {
                    setNotFound(true);
                    return;
                }
                const data = snap.data();
                setPosition(data.position || "전도사");
                setField(data.field || "");
                setRegion(data.region || "");
                setWorkType(data.workType || "파트타임");
                setQualification(data.qualification || "");
                setSalary(data.salary || "");
                setDeadline(data.deadline || "");
                setContact(data.contact || "");
                setContent(data.content || "");
            })
            .catch((error) => {
                console.error("공고 불러오기 오류:", error);
                setNotFound(true);
            })
            .finally(() => setFetching(false));
    }, [id]);

    const handleLogout = async () => {
        try {
            await signOut(auth);
            alert("로그아웃 되었습니다.");
            navigate("/login");
        } catch (error) {
            console.error("로그아웃 에러:", error);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!id) return;

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
            await updateDoc(doc(db, "jobPosts", id), {
                position, field, region, workType, qualification, salary, deadline, contact, content,
            });
            alert("공고가 성공적으로 수정되었습니다!");
            navigate(`/jobs/${id}`);
        } catch (error) {
            console.error("공고 수정 에러:", error);
            alert("공고 수정 중 오류가 발생했습니다.");
        } finally {
            setLoading(false);
        }
    };

    if (fetching) {
        return <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center text-gray-400 font-bold">공고를 불러오는 중입니다...</div>;
    }

    if (notFound) {
        return (
            <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center px-4">
                <Card className="text-center py-16 px-8 rounded-[2rem] border-0 shadow-sm bg-white max-w-sm w-full">
                    <p className="text-base font-black text-gray-900 mb-2">공고를 찾을 수 없어요</p>
                    <p className="text-sm font-bold text-gray-400 mb-6">삭제되었거나 잘못된 링크일 수 있어요.</p>
                    <Button onClick={() => navigate("/jobs")} className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold px-6">
                        목록으로 돌아가기
                    </Button>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#F9FAFB] font-sans py-8 px-4">
            <div className="max-w-2xl mx-auto">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <Button
                            variant="ghost"
                            onClick={() => navigate(`/jobs/${id}`)}
                            className="rounded-full p-2 hover:bg-gray-200"
                        >
                            <ArrowLeft className="w-5 h-5 text-gray-700" />
                        </Button>
                        <h1 className="text-2xl font-black text-gray-900 tracking-tight">사역자 구인공고 수정</h1>
                    </div>

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
                        <div className="bg-blue-50/60 border border-blue-100 rounded-2xl p-5 space-y-3">
                            <div className="flex items-center gap-2 text-blue-700 font-black text-xs uppercase tracking-wider">
                                <CheckCircle2 className="w-4 h-4 text-blue-600" /> 인증된 교회 계정 정보 (수정 불가)
                            </div>
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

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <label className="block text-sm font-black text-gray-800">마감일</label>
                                    <button
                                        type="button"
                                        onClick={() => setDeadline("채용시까지")}
                                        className={`text-[11px] font-black px-2.5 py-1 rounded-lg border transition-all ${deadline === "채용시까지"
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

                        <Button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-2xl shadow-lg shadow-blue-100 flex items-center justify-center gap-2 text-base active:scale-95 transition-all"
                        >
                            <Save className="w-5 h-5" /> {loading ? "저장 중..." : "수정 완료"}
                        </Button>
                    </form>
                </Card>
            </div>
        </div>
    );
}
