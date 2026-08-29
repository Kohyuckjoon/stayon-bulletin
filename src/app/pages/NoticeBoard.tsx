import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { auth, db, storage } from "../../firebase"; // 이미지 업로드를 위해 storage 임포트 경로 포함 ( 기존 auth, db 유지 )
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, orderBy } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage"; // 파이어베이스 스토리지 함수 임포트
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Megaphone, ArrowLeft, Plus, Edit2, Trash2, Sparkles, Search, ChevronDown, ChevronUp, Image as ImageIcon, X } from "lucide-react"; // 이미지 아이콘 및 X 아이콘 임포트
import { toast } from "sonner";
import { KakaoChannelButton } from "../components/KakaoChannelButton";
import { NoticeImageCarousel } from "../components/NoticeImageCarousel";

export function NoticeBoard() {
    const navigate = useNavigate();
    const [notices, setNotices] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSuperUser, setIsSuperUser] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [currentId, setCurrentId] = useState("");
    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [searchTerm, setSearchTerm] = useState(""); 
    const [expandedIds, setExpandedIds] = useState<string[]>([]); 
    const [imageFiles, setImageFiles] = useState<File[]>([]); // 업로드할 이미지 파일 목록 (다중)
    const [imageUrls, setImageUrls] = useState<string[]>([]); // 기존 또는 업로드된 이미지 URL 목록 (다중)
    const [uploading, setUploading] = useState(false); // 이미지 업로드 중 로딩 상태 관리
    const MAX_IMAGES = 5; // 공지사항당 최대 첨부 가능 이미지 수

    const fetchNotices = async () => {
        try {
            setLoading(true);
            const q = query(collection(db, "notices"), orderBy("createdAt", "desc"));
            const querySnapshot = await getDocs(q);
            const list = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setNotices(list);
        } catch (error) {
            console.error("공지사항 로드 실패:", error);
            setNotices([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchNotices();
        if (auth.currentUser?.email?.includes("super") || window.location.pathname.includes("/super")) {
            setIsSuperUser(true);
        }
    }, []);

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? []);
        e.target.value = ""; // 같은 파일을 다시 선택해도 onChange가 동작하도록 초기화

        if (files.length === 0) return;

        const validFiles = files.filter(f => f.type.startsWith("image/"));
        if (validFiles.length !== files.length) {
            toast.error("이미지 파일(png, jpeg 등)만 업로드 가능합니다.");
        }
        if (validFiles.length === 0) return;

        // 이미 선택된 개수를 포함해 최대 MAX_IMAGES장까지만 허용
        const remainingSlots = MAX_IMAGES - imageFiles.length;
        if (remainingSlots <= 0) {
            toast.error(`이미지는 최대 ${MAX_IMAGES}장까지 첨부할 수 있습니다.`);
            return;
        }
        const acceptedFiles = validFiles.slice(0, remainingSlots);
        if (validFiles.length > acceptedFiles.length) {
            toast.error(`이미지는 최대 ${MAX_IMAGES}장까지 첨부할 수 있습니다.`);
        }

        setImageFiles(prev => [...prev, ...acceptedFiles]);

        // 선택된 각 파일을 병렬로 리사이즈/압축하여 imageUrls 배열에 순서대로 추가
        acceptedFiles.forEach(file => {
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target?.result as string;
                img.onload = () => {
                    const canvas = document.createElement("canvas");
                    const MAX_WIDTH = 800; // 공지사항 이미지 크기에 맞춰 적절히 조절
                    const MAX_HEIGHT = 800;
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > MAX_WIDTH) {
                            height *= MAX_WIDTH / width;
                            width = MAX_WIDTH;
                        }
                    } else {
                        if (height > MAX_HEIGHT) {
                            width *= MAX_HEIGHT / height;
                            height = MAX_HEIGHT;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext("2d");
                    ctx?.drawImage(img, 0, 0, width, height);

                    const compressedBase64 = canvas.toDataURL("image/jpeg", 0.7);
                    setImageUrls(prev => [...prev, compressedBase64]); // 압축된 Base64를 목록에 추가
                };
            };
            reader.onerror = () => {
                toast.error("이미지를 읽는 중 오류가 발생했습니다.");
            };
            reader.readAsDataURL(file);
        });
    };

    // 미리보기에서 특정 인덱스의 이미지를 개별 삭제
    const handleRemoveImage = (index: number) => {
        setImageFiles(prev => prev.filter((_, i) => i !== index));
        setImageUrls(prev => prev.filter((_, i) => i !== index));
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim() || !content.trim()) {
            toast.error("제목과 내용을 모두 입력해주세요.");
            return;
        }

        try {
            setUploading(true);

            // 스토리지 업로드 로직을 제거하고, 이미 처리된 imageUrls(Base64 배열)를 그대로 Firestore에 저장
            if (isEditing) {
                await updateDoc(doc(db, "notices", currentId), {
                    title,
                    content,
                    imageUrls,
                    updatedAt: serverTimestamp(),
                });
                toast.success("공지사항이 수정되었습니다.");
            } else {
                await addDoc(collection(db, "notices"), {
                    title,
                    content,
                    imageUrls,
                    createdAt: serverTimestamp(),
                });
                toast.success("새로운 공지사항이 등록되었습니다.");
            }
            setShowModal(false);
            setTitle("");
            setContent("");
            setImageFiles([]);
            setImageUrls([]);
            setIsEditing(false);
            fetchNotices();
        } catch (error) {
            console.error("저장 실패:", error);
            toast.error("작업 중 오류가 발생했습니다.");
        } finally {
            setUploading(false); 
        }
    };

    const handleDelete = async (id: string) => {
        if (window.confirm("정말 이 공지사항을 삭제하시겠습니까?")) {
            try {
                await deleteDoc(doc(db, "notices", id));
                toast.success("공지사항이 삭제되었습니다.");
                fetchNotices();
            } catch (error) {
                console.error("삭제 실패:", error);
                toast.error("삭제 실패");
            }
        }
    };

    const filteredNotices = notices.filter(notice => 
        notice.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        notice.content.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const toggleExpand = (id: string) => {
        setExpandedIds(prev => 
            prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
        );
    };

    return (
        <div className="container mx-auto px-4 py-10 max-w-4xl font-sans">
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <Button
                        variant="ghost"
                        onClick={() => navigate(-1)}
                        className="rounded-full w-10 h-10 p-0 flex items-center justify-center bg-gray-100 hover:bg-gray-200 cursor-pointer"
                    >
                        <ArrowLeft className="w-5 h-5 text-gray-700" />
                    </Button>
                    <div>
                        <div className="flex items-center gap-1.5 text-blue-600 mb-0.5">
                            {/* <Sparkles className="w-4 h-4" /> */}
                            <span className="text-[11px] font-black tracking-wider uppercase">STAYON NOTICE</span>
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">공지사항</h1>
                    </div>
                </div>

                {isSuperUser && (
                    <Button
                        onClick={() => { setIsEditing(false); setTitle(""); setContent(""); setImageFiles([]); setImageUrls([]); setShowModal(true); }}
                        className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold px-5 py-3 shadow-sm cursor-pointer flex items-center gap-2"
                    >
                        <Plus className="w-5 h-5" /> 공지 만들기
                    </Button>
                )}
            </div>

            <div className="mb-6 relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400">
                    <Search className="w-5 h-5" />
                </div>
                <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="공지사항 제목 또는 내용을 검색하세요"
                    className="w-full pl-11 pr-4 py-3.5 bg-white border border-gray-200 rounded-2xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                />
            </div>

            {loading ? (
                <div className="text-center py-20 text-gray-400 font-medium">공지사항을 불러오는 중입니다...</div>
            ) : filteredNotices.length === 0 ? (
                <Card className="p-16 text-center rounded-2xl border border-gray-100 bg-white shadow-sm">
                    <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <Megaphone className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mb-1">등록된 공지가 없어요!</h3>
                    <p className="text-sm text-gray-500 font-medium">새로운 소식과 업데이트가 이곳에 등록됩니다.</p>
                </Card>
            ) : (
                <div className="space-y-3">
                    {filteredNotices.map((notice) => {
                        const isExpanded = expandedIds.includes(notice.id); 
                        return (
                            <Card 
                                key={notice.id} 
                                onClick={() => toggleExpand(notice.id)} 
                                className="p-5 rounded-2xl border border-gray-100 bg-white shadow-sm hover:border-blue-200 transition-all cursor-pointer"
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div className="space-y-1.5 flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="bg-blue-50 text-blue-600 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">공지</span>
                                            {/* 이미지가 포함된 공지일 경우 직관적인 아이콘 뱃지 표시 (구 데이터의 imageUrl 단일 필드도 호환) */}
                                            {(notice.imageUrls?.length > 0 || notice.imageUrl) && (
                                                <span className="bg-purple-50 text-purple-600 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                                                    <ImageIcon className="w-3 h-3" /> 이미지 {notice.imageUrls?.length || 1}장
                                                </span>
                                            )}
                                            <span className="text-xs text-gray-400 font-medium">
                                                {notice.createdAt?.toDate ? notice.createdAt.toDate().toLocaleDateString() : "최근"}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <h2 className="text-base font-bold text-gray-900 tracking-tight">{notice.title}</h2>
                                            <div className="text-gray-400">
                                                {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                                            </div>
                                        </div>

                                        {isExpanded && (
                                            <div className="pt-3 border-t border-gray-100 mt-3 space-y-4">
                                                <p className="text-sm text-gray-600 font-medium whitespace-pre-wrap leading-relaxed">{notice.content}</p>
                                                
                                                {/* 공지사항 내 첨부된 이미지 렌더링 영역: 여러 장을 캐러셀로 한 장씩 넘겨보기 (구 데이터 호환) */}
                                                {(notice.imageUrls?.length > 0 || notice.imageUrl) && (
                                                    <div className="mt-3">
                                                        <NoticeImageCarousel images={notice.imageUrls ?? [notice.imageUrl]} />
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {isSuperUser && (
                                        <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                                            <button
                                                onClick={() => { setIsEditing(true); setCurrentId(notice.id); setTitle(notice.title); setContent(notice.content); setImageUrls(notice.imageUrls ?? (notice.imageUrl ? [notice.imageUrl] : [])); setImageFiles([]); setShowModal(true); }}
                                                className="p-2 rounded-xl text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(notice.id)}
                                                className="p-2 rounded-xl text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}

            {showModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
                    <Card className="w-full max-w-lg p-6 rounded-3xl bg-white shadow-2xl border-0 space-y-6 my-8">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xl font-black text-gray-900">{isEditing ? "공지사항 수정" : "새 공지사항 작성"}</h3>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 font-bold text-sm cursor-pointer">닫기</button>
                        </div>
                        <form onSubmit={handleSave} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">제목</label>
                                <input
                                    type="text"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    placeholder="공지 제목을 입력하세요"
                                    className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">내용</label>
                                <textarea
                                    rows={5}
                                    value={content}
                                    onChange={(e) => setContent(e.target.value)}
                                    placeholder="공지 내용을 입력하세요"
                                    className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium resize-none"
                                />
                            </div>

                            {/* 이미지 첨부 파일 입력 및 미리보기 UI 영역 (최대 MAX_IMAGES장 다중 첨부) */}
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">이미지 첨부 (선택, 최대 {MAX_IMAGES}장)</label>
                                <div className="flex items-center gap-3">
                                    <label className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gray-50 border border-dashed border-gray-300 text-sm text-gray-600 transition-colors font-medium ${imageUrls.length >= MAX_IMAGES ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-100 cursor-pointer"}`}>
                                        <ImageIcon className="w-4 h-4 text-gray-400" />
                                        <span>{imageUrls.length > 0 ? `${imageUrls.length}장 선택됨 (추가 선택 가능)` : "이미지 파일 선택하기"}</span>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            multiple
                                            disabled={imageUrls.length >= MAX_IMAGES}
                                            onChange={handleImageChange}
                                            className="hidden"
                                        />
                                        </label>
                                    {imageUrls.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => { setImageFiles([]); setImageUrls([]); }}
                                            className="p-3 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-colors cursor-pointer"
                                            title="이미지 전체 제거"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                                {/* 기존에 등록되었거나 새로 선택한 이미지들의 썸네일 그리드, 각각 개별 삭제 가능 */}
                                {imageUrls.length > 0 && (
                                    <div className="mt-2 grid grid-cols-3 gap-2">
                                        {imageUrls.map((url, idx) => (
                                            <div key={idx} className="relative w-full h-24 bg-gray-100 rounded-xl overflow-hidden border border-gray-200">
                                                <img
                                                    src={url}
                                                    alt={`미리보기 ${idx + 1}`}
                                                    className="w-full h-full object-cover"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveImage(idx)}
                                                    className="absolute top-1 right-1 p-1 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors cursor-pointer"
                                                    title="이미지 제거"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-end gap-2 pt-2">
                                <Button type="button" variant="ghost" onClick={() => setShowModal(false)} className="rounded-xl font-bold text-xs px-5 py-3 cursor-pointer">취소</Button>
                                <Button type="submit" disabled={uploading} className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs px-6 py-3 shadow-sm cursor-pointer">
                                    {uploading ? "업로드 중..." : "완료하기"}
                                </Button>
                            </div>
                        </form>
                    </Card>
                </div>
            )}
            <KakaoChannelButton />
        </div>
    );
}
