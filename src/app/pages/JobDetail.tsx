import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { db, auth } from "../../firebase";
import { doc, getDoc, deleteDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import {
    ArrowLeft, Briefcase, MapPin, Calendar, Phone, Building2, Sparkles,
    Pencil, Trash2, Megaphone, ClipboardList, Wallet,
} from "lucide-react";
import { isJobBoosted } from "../../utils/jobBoostDisplay";

interface JobPostDetail {
    id: string;
    churchName: string;
    department: string;
    position: string;
    field: string;
    region: string;
    workType: string;
    qualification?: string;
    salary?: string;
    deadline: string;
    contact: string;
    content: string;
    createdAt: any;
    authorUid?: string;
    boostedUntil?: any;
}

// /jobs 카드·리스트·티커에서 "상세보기"를 누르면 alert 팝업 대신 이 화면으로 이동한다.
export function JobDetail() {
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();

    const [post, setPost] = useState<JobPostDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [currentUser, setCurrentUser] = useState<any>(null);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => setCurrentUser(user));
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (!id) return;
        setLoading(true);
        getDoc(doc(db, "jobPosts", id))
            .then((snap) => {
                if (snap.exists()) {
                    setPost({ id: snap.id, ...snap.data() } as JobPostDetail);
                } else {
                    setNotFound(true);
                }
            })
            .catch((error) => {
                console.error("공고 상세 조회 오류:", error);
                setNotFound(true);
            })
            .finally(() => setLoading(false));
    }, [id]);

    const handleDelete = async () => {
        if (!post) return;
        if (!window.confirm("정말 이 청빙 공고를 삭제하시겠습니까?")) return;
        try {
            await deleteDoc(doc(db, "jobPosts", post.id));
            alert("공고가 성공적으로 삭제되었습니다.");
            navigate("/jobs");
        } catch (error) {
            console.error("공고 삭제 중 오류 발생:", error);
            alert("공고 삭제에 실패했습니다.");
        }
    };

    const isOwner = !!currentUser && !!post?.authorUid && currentUser.uid === post.authorUid;
    const boosted = post ? isJobBoosted(post) : false;

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 font-sans">
            <nav className="bg-white/80 backdrop-blur-md sticky top-0 z-50 border-b border-gray-100 px-4 py-3.5">
                <div className="max-w-3xl mx-auto flex items-center gap-3">
                    <Button
                        variant="ghost"
                        onClick={() => navigate("/jobs")}
                        className="rounded-full p-2 hover:bg-gray-100 transition-transform active:scale-95"
                        title="목록으로 돌아가기"
                    >
                        <ArrowLeft className="w-5 h-5 text-gray-700" />
                    </Button>
                    <div className="flex items-center gap-2">
                        <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shadow-md shadow-blue-200">
                            <Briefcase className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-lg font-black text-gray-900 tracking-tight">공고 상세보기</span>
                    </div>
                </div>
            </nav>

            <div className="max-w-3xl mx-auto px-4 py-8">
                {loading ? (
                    <div className="text-center py-24 text-gray-400 font-bold">공고를 불러오는 중입니다...</div>
                ) : notFound || !post ? (
                    <Card className="text-center py-20 rounded-[2rem] border-0 shadow-sm bg-white">
                        <p className="text-base font-black text-gray-900 mb-2">공고를 찾을 수 없어요</p>
                        <p className="text-sm font-bold text-gray-400 mb-6">삭제되었거나 잘못된 링크일 수 있어요.</p>
                        <Button onClick={() => navigate("/jobs")} className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold px-6">
                            목록으로 돌아가기
                        </Button>
                    </Card>
                ) : (
                    <>
                        <Card className="rounded-[2rem] border-0 shadow-sm bg-white p-6 sm:p-8 mb-5">
                            <div className="flex items-center gap-1.5 flex-wrap mb-4">
                                {boosted && (
                                    <span className="bg-amber-500 text-white font-black text-[11px] px-2.5 py-0.5 rounded-md flex items-center gap-1">
                                        <Sparkles className="w-3 h-3" /> 광고
                                    </span>
                                )}
                                <span className="bg-blue-50 text-blue-600 font-black text-[11px] px-2.5 py-0.5 rounded-md">{post.position}</span>
                                <span className="bg-gray-100 text-gray-600 font-bold text-[11px] px-2.5 py-0.5 rounded-md">{post.workType}</span>
                            </div>

                            <h1 className="text-2xl font-black text-gray-900 mb-1">
                                {post.churchName} <span className="text-base font-bold text-gray-400">({post.department})</span>
                            </h1>

                            <div className="flex items-center gap-2 text-sm font-bold text-gray-500 mt-3">
                                <MapPin className="w-4 h-4 text-gray-400 shrink-0" /> {post.region}
                                <span className="text-gray-300">•</span>
                                <Building2 className="w-4 h-4 text-gray-400 shrink-0" /> 분야: {post.field}
                            </div>

                            <div className="mt-3 inline-flex items-center gap-1 text-[12px] font-bold text-red-500 bg-red-50/80 px-2.5 py-1 rounded-md">
                                <Calendar className="w-3.5 h-3.5" /> 마감: {post.deadline}
                            </div>
                        </Card>

                        <Card className="rounded-[2rem] border-0 shadow-sm bg-white p-6 sm:p-8 mb-5 space-y-5">
                            {post.qualification && (
                                <div>
                                    <p className="flex items-center gap-1.5 text-xs font-black text-gray-400 mb-1.5">
                                        <ClipboardList className="w-3.5 h-3.5" /> 자격 요건
                                    </p>
                                    <p className="text-sm font-medium text-gray-700 whitespace-pre-wrap break-keep">{post.qualification}</p>
                                </div>
                            )}
                            {post.salary && (
                                <div>
                                    <p className="flex items-center gap-1.5 text-xs font-black text-gray-400 mb-1.5">
                                        <Wallet className="w-3.5 h-3.5" /> 사례비 조건
                                    </p>
                                    <p className="text-sm font-medium text-gray-700 whitespace-pre-wrap break-keep">{post.salary}</p>
                                </div>
                            )}
                            <div>
                                <p className="text-xs font-black text-gray-400 mb-1.5">상세 내용</p>
                                <p className="text-sm font-medium text-gray-700 whitespace-pre-wrap break-keep leading-relaxed">{post.content}</p>
                            </div>
                        </Card>

                        <Card className="rounded-[2rem] border-0 shadow-sm bg-white p-6 sm:p-8 mb-5">
                            <p className="flex items-center gap-1.5 text-xs font-black text-gray-400 mb-1.5">
                                <Phone className="w-3.5 h-3.5" /> 문의 연락처
                            </p>
                            <p className="text-lg font-black text-gray-900">{post.contact}</p>
                        </Card>

                        {isOwner && (
                            <Card className="rounded-[2rem] border-0 shadow-sm bg-white p-5 flex flex-col sm:flex-row gap-2.5">
                                <Button
                                    variant="outline"
                                    onClick={() => navigate(`/jobs/edit/${post.id}`)}
                                    className="flex-1 rounded-xl border-gray-200 font-black text-blue-600 hover:bg-blue-50"
                                >
                                    <Pencil className="w-4 h-4 mr-1.5" /> 공고 수정
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={handleDelete}
                                    className="flex-1 rounded-xl border-red-100 font-black text-red-500 hover:bg-red-50"
                                >
                                    <Trash2 className="w-4 h-4 mr-1.5" /> 공고 삭제
                                </Button>
                                <Button
                                    onClick={() => navigate("/jobs/boost")}
                                    className="flex-1 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-black border-none"
                                >
                                    <Megaphone className="w-4 h-4 mr-1.5" /> 공고 홍보하기
                                </Button>
                            </Card>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
