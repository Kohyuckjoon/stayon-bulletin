import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router";
import { db, auth } from "../../firebase";
import {
    collection, query, where, onSnapshot, doc, getDoc, addDoc, serverTimestamp,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { ArrowLeft, Megaphone, TrendingUp, Check, LogIn } from "lucide-react";
import { setLoginReturnTo } from "../../utils/loginReturn";
import { isJobBoosted, JOB_TOP_BOOST_MAX_SLOTS, JOB_TICKER_MAX_SLOTS } from "../../utils/jobBoostDisplay";

// /jobs 게시판 전용 "공고 홍보하기" 셀프서비스 신청 페이지. place.stayon-platform.com의
// TeamBoost.tsx(섭외율 높이기)와 동일한 흐름을 사역자 청빙판에 맞게 이식했다.
// 결제는 이 화면에서 자동으로 되지 않고, 신청만 접수되어 /super 광고 설정 > 신청 현황 탭에서
// 관리자가 결제 확인 후 승인하면 기존 끌어올리기/티커 기능이 그대로 적용된다.

type PlanId = "top" | "ticker";

const PLANS: {
    id: PlanId;
    icon: typeof TrendingUp;
    title: string;
    bullets: string[];
    badge: string;
    accent: string;
    buttonLabel: string;
}[] = [
    {
        id: "top",
        icon: TrendingUp,
        title: "상단 노출",
        bullets: ["공고 목록 맨 위쪽에 고정돼요", "목록 훑어볼 때 가장 먼저 보여요", "\"광고\" 배지가 함께 붙어요"],
        badge: "🔥 추천",
        accent: "blue",
        buttonLabel: "상단 노출 신청",
    },
    {
        id: "ticker",
        icon: Megaphone,
        title: "티커 노출",
        bullets: ["게시판 상단 가로 배너에 계속 흘러 나와요", "접속하자마자 바로 눈에 띄어요", "여러 공고와 함께 순환 노출돼요"],
        badge: "가장 눈에 띔",
        accent: "amber",
        buttonLabel: "티커 노출 신청",
    },
];

export function JobBoost() {
    const navigate = useNavigate();
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [authLoading, setAuthLoading] = useState(true);

    const [step, setStep] = useState<"plans" | "apply" | "done">("plans");
    const [selectedPlanId, setSelectedPlanId] = useState<PlanId | null>(null);

    // 슬롯 현황 안내용
    const [allPosts, setAllPosts] = useState<any[]>([]);
    const [tickerIds, setTickerIds] = useState<string[]>([]);

    // 로그인한 사용자가 본인 계정(authorUid)으로 등록한 공고 목록
    const [myPosts, setMyPosts] = useState<any[]>([]);
    const [myPostsLoading, setMyPostsLoading] = useState(false);
    const [selectedPost, setSelectedPost] = useState<any | null>(null);
    const [postPendingRequests, setPostPendingRequests] = useState<any[]>([]);

    const [applicantName, setApplicantName] = useState("");
    const [applicantContact, setApplicantContact] = useState("");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setCurrentUser(user);
            setAuthLoading(false);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        const unsubPosts = onSnapshot(collection(db, "jobPosts"), (snap) => {
            setAllPosts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        });
        const unsubTicker = onSnapshot(doc(db, "settings", "jobTicker"), (snap) => {
            setTickerIds(snap.exists() ? (snap.data().jobPostIds || []) : []);
        });
        return () => { unsubPosts(); unsubTicker(); };
    }, []);

    useEffect(() => {
        if (step !== "apply" || !currentUser) return;
        setMyPostsLoading(true);
        const unsubMyPosts = onSnapshot(
            query(collection(db, "jobPosts"), where("authorUid", "==", currentUser.uid)),
            (snap) => {
                setMyPosts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
                setMyPostsLoading(false);
            },
            () => setMyPostsLoading(false)
        );
        return () => unsubMyPosts();
    }, [step, currentUser]);

    // 신청서 이름/연락처 자동 채움 (users/{uid} 문서 기준)
    useEffect(() => {
        if (!currentUser) return;
        getDoc(doc(db, "users", currentUser.uid)).then((snap) => {
            if (snap.exists()) {
                const data = snap.data();
                if (data.churchName) setApplicantName((prev) => prev || data.churchName);
                if (data.phone) setApplicantContact((prev) => prev || data.phone);
            }
        }).catch(() => { /* 자동 채움 실패는 무시하고 직접 입력하게 둠 */ });
    }, [currentUser]);

    useEffect(() => {
        if (!selectedPost) {
            setPostPendingRequests([]);
            return;
        }
        const unsub = onSnapshot(
            query(collection(db, "jobBoostRequests"), where("jobPostId", "==", selectedPost.id), where("status", "==", "pending")),
            (snap) => setPostPendingRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        );
        return () => unsub();
    }, [selectedPost?.id]);

    const topBoostedCount = allPosts.filter(isJobBoosted).length;
    const tickerCount = tickerIds.length;

    const openApply = (planId: PlanId) => {
        setSelectedPlanId(planId);
        setStep("apply");
    };

    const plan = useMemo(() => PLANS.find((p) => p.id === selectedPlanId) || null, [selectedPlanId]);

    const alreadyActive = plan?.id === "top"
        ? isJobBoosted(selectedPost)
        : plan?.id === "ticker" && !!selectedPost && tickerIds.includes(selectedPost.id);
    const alreadyPending = postPendingRequests.some((r) => r.plan === plan?.id);

    const canSubmit = !!plan && !!selectedPost && applicantName.trim() && applicantContact.trim() && !alreadyActive && !alreadyPending;

    const handleSubmit = async () => {
        if (!canSubmit || !plan || !selectedPost || !currentUser) return;
        setSubmitting(true);
        try {
            await addDoc(collection(db, "jobBoostRequests"), {
                jobPostId: selectedPost.id,
                jobPostChurchName: selectedPost.churchName || "",
                jobPostPosition: selectedPost.position || "",
                plan: plan.id,
                applicantUid: currentUser.uid,
                applicantName: applicantName.trim(),
                applicantContact: applicantContact.trim(),
                applicantEmail: currentUser.email || "",
                status: "pending",
                createdAt: serverTimestamp(),
            });
            setStep("done");
        } catch (error) {
            console.error("공고 홍보 신청 실패:", error);
            alert("신청 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#F9FAFB] font-sans">
            <div className="max-w-2xl mx-auto px-5 pt-8 pb-24">
                <button
                    onClick={() => (step === "plans" ? navigate("/jobs") : setStep("plans"))}
                    className="flex items-center gap-1 text-gray-400 hover:text-gray-900 transition-all font-bold text-sm mb-5"
                >
                    <ArrowLeft className="w-4 h-4" /> {step === "plans" ? "게시판으로" : "플랜 다시 고르기"}
                </button>

                {step === "plans" && (
                    <div>
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-4 text-sm font-black bg-amber-50 text-amber-600">
                            <Megaphone className="w-4 h-4" /> 공고 홍보하기
                        </div>
                        <h1 className="text-2xl md:text-3xl font-black tracking-tight mb-2 text-gray-900 break-keep">
                            우리 교회 공고를 더 많은 사역자에게 보여주세요
                        </h1>
                        <p className="text-sm text-gray-400 font-bold mb-8 break-keep">
                            목록에서 눈에 띄는 위치를 신청하면, 지원 문의가 더 빨리 들어와요.
                        </p>

                        <div className="grid sm:grid-cols-2 gap-4 mb-6">
                            {PLANS.map((p) => {
                                const Icon = p.icon;
                                return (
                                    <Card key={p.id} className="rounded-[2rem] border-0 shadow-sm p-6 flex flex-col bg-white">
                                        <div className="flex items-center justify-between mb-4">
                                            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${p.accent === "blue" ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-600"}`}>
                                                <Icon className="w-5 h-5" />
                                            </div>
                                            <span className={`px-2.5 py-1 rounded-full text-[11px] font-black ${p.accent === "blue" ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-600"}`}>
                                                {p.badge}
                                            </span>
                                        </div>
                                        <h3 className="text-lg font-black mb-3 text-gray-900">{p.title}</h3>
                                        <ul className="flex flex-col gap-2 mb-6 flex-1">
                                            {p.bullets.map((b) => (
                                                <li key={b} className="flex items-start gap-2 text-[13px] font-bold text-gray-500">
                                                    <Check className={`w-4 h-4 shrink-0 mt-0.5 ${p.accent === "blue" ? "text-blue-600" : "text-amber-600"}`} />
                                                    <span className="break-keep">{b}</span>
                                                </li>
                                            ))}
                                        </ul>
                                        <Button
                                            onClick={() => openApply(p.id)}
                                            className={`w-full rounded-2xl py-6 font-black text-white border-none ${p.accent === "blue" ? "bg-blue-600 hover:bg-blue-700" : "bg-amber-500 hover:bg-amber-600"}`}
                                        >
                                            {p.buttonLabel}
                                        </Button>
                                    </Card>
                                );
                            })}
                        </div>

                        <div className="flex items-start gap-2.5 p-4 bg-white rounded-2xl border border-gray-100">
                            <Megaphone className="w-4 h-4 text-gray-300 shrink-0 mt-0.5" />
                            <p className="text-[13px] text-gray-400 font-bold leading-relaxed break-keep">
                                슬롯이 한정돼 있어서 신청 순서대로 채워져요
                                (현재 상단 노출 {topBoostedCount}/{JOB_TOP_BOOST_MAX_SLOTS}, 티커 노출 {tickerCount}/{JOB_TICKER_MAX_SLOTS})
                            </p>
                        </div>
                    </div>
                )}

                {step === "apply" && plan && (
                    <div>
                        <div className="flex items-center gap-3 mb-6 p-4 bg-white rounded-2xl border border-gray-100">
                            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${plan.accent === "blue" ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-600"}`}>
                                <plan.icon className="w-5 h-5" />
                            </div>
                            <p className="text-[15px] font-black text-gray-900">{plan.title}</p>
                        </div>

                        {authLoading ? (
                            <div className="py-20 flex items-center justify-center">
                                <div className="w-8 h-8 border-[3px] border-gray-100 border-t-blue-600 rounded-full animate-spin" />
                            </div>
                        ) : !currentUser ? (
                            <Card className="text-center py-16 rounded-[2rem] border-0 shadow-sm bg-white">
                                <p className="text-base font-black mb-2 text-gray-900">로그인이 필요해요</p>
                                <p className="text-[13px] font-bold text-gray-400 mb-6 break-keep">신청서를 작성하려면 먼저 로그인해주세요.</p>
                                <Button
                                    onClick={() => { setLoginReturnTo("/jobs/boost"); navigate("/login"); }}
                                    className="rounded-xl bg-gray-900 hover:bg-black text-white font-bold px-6 inline-flex items-center gap-2"
                                >
                                    <LogIn className="w-4 h-4" /> 로그인하고 계속하기
                                </Button>
                            </Card>
                        ) : !selectedPost ? (
                            <Card className="rounded-[2rem] border-0 shadow-sm p-6 bg-white">
                                {myPostsLoading ? (
                                    <div className="py-8 flex items-center justify-center">
                                        <div className="w-6 h-6 border-[3px] border-gray-100 border-t-blue-600 rounded-full animate-spin" />
                                    </div>
                                ) : myPosts.length > 0 ? (
                                    <>
                                        <label className="block text-[13px] font-bold text-gray-500 mb-2 ml-1">내 계정으로 등록한 공고</label>
                                        <div className="flex flex-col gap-2">
                                            {myPosts.map((post) => (
                                                <button
                                                    key={post.id}
                                                    onClick={() => setSelectedPost(post)}
                                                    className="text-left px-4 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold hover:border-blue-500 transition-all"
                                                >
                                                    {post.churchName} <span className="text-gray-400 text-[13px]">({post.position})</span>
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                ) : (
                                    <div className="text-center py-8">
                                        <p className="text-sm font-bold text-gray-400 mb-4 break-keep">아직 등록한 공고가 없어요. 먼저 공고를 등록해주세요.</p>
                                        <Button onClick={() => navigate("/jobs/write")} className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold px-6">
                                            공고 등록하러 가기
                                        </Button>
                                    </div>
                                )}
                            </Card>
                        ) : (
                            <Card className="rounded-[2rem] border-0 shadow-sm p-6 bg-white">
                                <div className="flex items-center justify-between mb-6">
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold text-gray-400 mb-1">신청할 공고</p>
                                        <p className="text-base font-black truncate text-gray-900">
                                            {selectedPost.churchName} <span className="text-gray-400 text-[13px] font-bold">({selectedPost.position})</span>
                                        </p>
                                    </div>
                                    <button onClick={() => setSelectedPost(null)} className="shrink-0 text-xs font-bold text-gray-400 hover:text-gray-900">
                                        변경
                                    </button>
                                </div>

                                {alreadyActive && (
                                    <div className="flex items-center gap-2 p-3.5 bg-emerald-50 rounded-xl mb-6 text-[13px] font-bold text-emerald-700">
                                        <Check className="w-4 h-4 shrink-0" /> 이미 이 플랜을 이용 중이에요.
                                    </div>
                                )}
                                {!alreadyActive && alreadyPending && (
                                    <div className="flex items-center gap-2 p-3.5 bg-amber-50 rounded-xl mb-6 text-[13px] font-bold text-amber-700">
                                        <Megaphone className="w-4 h-4 shrink-0" /> 이미 신청이 접수돼서 확인 중이에요.
                                    </div>
                                )}

                                <label className="block text-[13px] font-bold text-gray-500 mb-1.5 ml-1">신청자(교회) 이름</label>
                                <Input value={applicantName} onChange={(e) => setApplicantName(e.target.value)} placeholder="이름" className="mb-4 h-11 rounded-xl" />
                                <label className="block text-[13px] font-bold text-gray-500 mb-1.5 ml-1">연락처</label>
                                <Input value={applicantContact} onChange={(e) => setApplicantContact(e.target.value)} placeholder="010-0000-0000" className="mb-6 h-11 rounded-xl" />

                                <Button
                                    disabled={!canSubmit || submitting}
                                    onClick={handleSubmit}
                                    className={`w-full rounded-2xl py-6 font-black text-white border-none disabled:opacity-40 ${plan.accent === "blue" ? "bg-blue-600 hover:bg-blue-700" : "bg-amber-500 hover:bg-amber-600"}`}
                                >
                                    {submitting ? "신청 접수 중..." : "신청 접수하기"}
                                </Button>
                                <p className="text-xs font-bold text-gray-300 text-center mt-3 break-keep">
                                    신청 후 담당자가 결제 방법을 안내해드려요. 슬롯 상황에 따라 대기가 있을 수 있어요.
                                </p>
                            </Card>
                        )}
                    </div>
                )}

                {step === "done" && (
                    <Card className="text-center py-20 rounded-[2rem] border-0 shadow-sm bg-white">
                        <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center mx-auto mb-4">
                            <Megaphone className="w-6 h-6" />
                        </div>
                        <p className="text-lg font-black mb-2 text-gray-900">신청이 접수됐어요</p>
                        <p className="text-[13px] font-bold text-gray-400 mb-8 break-keep">확인 후 안내드릴게요. 조금만 기다려주세요.</p>
                        <Button onClick={() => navigate("/jobs")} className="rounded-xl bg-gray-900 hover:bg-black text-white font-bold px-6">
                            게시판으로 돌아가기
                        </Button>
                    </Card>
                )}
            </div>
        </div>
    );
}
