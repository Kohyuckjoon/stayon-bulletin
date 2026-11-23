import { useEffect, useState } from "react";
import { collection, getDocs, deleteDoc, doc } from "firebase/firestore";
import { auth, db } from "../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { ExternalLink, Calendar, Trash2, ChevronDown, Church, Copy, Check } from "lucide-react";

export const AdminBulletinList = () => {
  const [bulletins, setBulletins] = useState<any[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null); // 방금 복사한 아이디(잠깐 "복사됨" 표시)
  const copyId = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // 클립보드 권한이 막힌 브라우저: 예전 방식으로 복사
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); ta.remove();
    }
    setCopiedId(text);
    setTimeout(() => setCopiedId((c) => (c === text ? null : c)), 1500);
  };
  const [isLoading, setIsLoading] = useState(true);
  const [expandedChurches, setExpandedChurches] = useState<Set<string>>(new Set());
  const ADMIN_EMAILS = ["akhj123akhjk@gmail.com", "stayon.platform@gmail.com"];

  const toggleChurch = (authorId: string) => {
    setExpandedChurches((prev) => {
      const next = new Set(prev);
      if (next.has(authorId)) next.delete(authorId);
      else next.add(authorId);
      return next;
    });
  };

  // 낱개 주보 목록(bulletins)을 교회(authorId) 단위로 묶어서, 교회당 한 줄로
  // 요약해서 보여주기 위한 그룹핑. 각 그룹은 최근 발행일 기준 내림차순 정렬됨
  const churchGroups = Object.values(
    bulletins.reduce((acc: any, b: any) => {
      const key = b.authorId || "unknown";
      if (!acc[key]) {
        acc[key] = { authorId: key, churchName: b.churchName, items: [] as any[] };
      }
      acc[key].items.push(b);
      return acc;
    }, {} as Record<string, { authorId: string; churchName: string; items: any[] }>)
  ).sort((a: any, b: any) => {
    const dateA = a.items[0]?.date || "";
    const dateB = b.items[0]?.date || "";
    return dateB.localeCompare(dateA);
  }) as { authorId: string; churchName: string; items: any[] }[];

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user || !ADMIN_EMAILS.includes(user.email || "")) {
        alert("접근 권한이 없습니다.");
        window.location.href = "/login";
        return;
      }

      try {
        setIsLoading(true);
        // 1. 사용자 정보(교회명 매칭용) 가져오기
        const usersSnapshot = await getDocs(collection(db, "users"));
        const userMap: { [key: string]: string } = {};
        const emailMap: { [key: string]: string } = {}; // 주보를 발행한 계정 아이디(가입 이메일, 2026-11-19)
        usersSnapshot.docs.forEach((doc) => {
          userMap[doc.id] = doc.data().churchName || "등록교회";
          emailMap[doc.id] = doc.data().email || "";
        });

        // 2. 전체 주보 발행 내역 가져오기
        const bulletinsSnapshot = await getDocs(collection(db, "bulletins"));
        const bulletinData = bulletinsSnapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            churchName: userMap[data.authorId] || "미확인 교회",
            authorEmail: emailMap[data.authorId] || "",
          };
        });

        // 최신 날짜순 정렬
        bulletinData.sort((a: any, b: any) => {
          const dateA = a.date || "";
          const dateB = b.date || "";
          return dateB.localeCompare(dateA);
        });

        setBulletins(bulletinData);
      } catch (error) {
        console.error("주보 데이터를 불러오는 중 오류 발생:", error);
      } finally {
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // 주보 삭제 핸들러 함수 추가
  const handleDeleteBulletin = async (bulletinId: string, churchName: string) => {
    if (!window.confirm(`[${churchName}]의 해당 주보 데이터를 영구적으로 삭제하시겠습니까?`)) {
      return;
    }

    try {
      // Firestore 'bulletins' 컬렉션에서 해당 문서 삭제
      await deleteDoc(doc(db, "bulletins", bulletinId));
      
      // 화면 상태(state)에서도 즉시 필터링하여 반영
      setBulletins((prev) => prev.filter((item) => item.id !== bulletinId));
      alert("주보가 성공적으로 삭제되었습니다.");
    } catch (error) {
      console.error("주보 삭제 중 오류 발생:", error);
      alert("주보 삭제에 실패했습니다. 다시 시도해 주세요.");
    }
  };

  return (
    <div className="p-4 sm:p-8 md:p-12">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 md:mb-10">
          <h1 className="text-xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">교회별 주보 발행 관리</h1>
          <p className="text-gray-500 mt-1.5 md:mt-2 text-xs sm:text-base font-medium">
            전체 교회에서 등록 및 발행한 주보 목록입니다. (총 {bulletins.length}건)
          </p>
        </div>

        <div className="bg-white rounded-2xl md:rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 overflow-hidden">
          {isLoading ? (
            <div className="p-10 md:p-16 text-center text-gray-400 font-medium text-sm">데이터를 불러오는 중입니다...</div>
          ) : bulletins.length === 0 ? (
            <div className="p-10 md:p-16 text-center text-gray-400 font-medium text-sm">발행된 주보 데이터가 없습니다.</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {churchGroups.map((group) => {
                const isOpen = expandedChurches.has(group.authorId);
                const latest = group.items[0];
                return (
                  <div key={group.authorId}>
                    {/* 교회 요약 줄 — 클릭하면 그 교회의 전체 발행 이력이 펼쳐짐 */}
                    <button
                      onClick={() => toggleChurch(group.authorId)}
                      className="w-full flex items-center gap-3 sm:gap-4 p-4 sm:p-6 hover:bg-blue-50/30 transition-colors text-left cursor-pointer"
                    >
                      <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                        <Church className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-900 text-sm sm:text-base truncate">{group.churchName}</p>
                        {/* 발행한 계정 아이디(이메일) — 이메일이 없는 예전 계정은 계정 번호(uid) */}
                        <p className="flex items-center gap-1.5 min-w-0 text-[11px] sm:text-xs text-blue-600/80 font-medium">
                          <span className="truncate">{latest?.authorEmail || `계정 ${group.authorId}`}</span>
                          {/* 아이디 복사(2026-11-19) — 줄 전체가 펼치기 버튼이라 안쪽은 span으로, 누를 때 펼쳐지지 않게 막음 */}
                          {(() => {
                            const idText = latest?.authorEmail || group.authorId;
                            const copied = copiedId === idText;
                            return (
                              <span role="button" tabIndex={0} title="아이디 복사"
                                onClick={(e) => { e.stopPropagation(); void copyId(idText); }}
                                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); void copyId(idText); } }}
                                className={`shrink-0 inline-flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-[10px] font-bold transition-colors ${copied ? "border-emerald-200 bg-emerald-50 text-emerald-600" : "border-blue-100 bg-white text-blue-600 hover:bg-blue-50"}`}>
                                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}{copied ? "복사됨" : "복사"}
                              </span>
                            );
                          })()}
                        </p>
                        <p className="text-[11px] sm:text-xs text-gray-400 mt-0.5">
                          총 {group.items.length}건 · 최근 {latest?.date || "날짜 미지정"}
                        </p>
                      </div>
                      <span
                        className={`px-2 sm:px-3 py-1 rounded-full text-[10px] sm:text-[11px] font-bold tracking-wide uppercase shrink-0 ${
                          latest?.status === "published"
                            ? "bg-emerald-50 text-emerald-600 border border-emerald-100"
                            : "bg-amber-50 text-amber-600 border border-amber-100"
                        }`}
                      >
                        {latest?.status === "published" ? "발행 완료" : latest?.status || "작성중"}
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                      />
                    </button>

                    {/* 펼쳐진 상태: 이 교회가 발행한 낱개 주보 이력 */}
                    {isOpen && (
                      <div className="bg-gray-50/50 border-t border-gray-100 divide-y divide-gray-100">
                        {group.items.map((bulletin: any) => (
                          <div
                            key={bulletin.id}
                            className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3 pl-6 sm:pl-20 pr-4 sm:pr-6 py-3.5 sm:py-4 hover:bg-white transition-colors"
                          >
                            <div className="flex items-center justify-between gap-2 sm:flex-1 sm:justify-start">
                              <span className="text-gray-600 font-mono text-xs sm:text-sm flex items-center gap-1.5">
                                <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                {bulletin.date || "날짜 미지정"}
                              </span>
                              <span
                                className={`sm:ml-3 px-2.5 py-1 rounded-full text-[10px] sm:text-[11px] font-bold tracking-wide uppercase shrink-0 ${
                                  bulletin.status === "published"
                                    ? "bg-emerald-50 text-emerald-600 border border-emerald-100"
                                    : "bg-amber-50 text-amber-600 border border-amber-100"
                                }`}
                              >
                                {bulletin.status === "published" ? "발행 완료" : bulletin.status || "작성중"}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 sm:ml-auto">
                              <button
                                onClick={() => window.open(`/view/${bulletin.authorId}`, "_blank")}
                                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-blue-600 hover:text-white text-gray-700 text-xs font-bold transition-all border border-gray-200/60 shadow-xs cursor-pointer"
                              >
                                주보 보기 <ExternalLink className="w-3.5 h-3.5 opacity-70" />
                              </button>
                              <button
                                onClick={() => handleDeleteBulletin(bulletin.id, bulletin.churchName)}
                                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-red-50 hover:bg-red-600 hover:text-white text-red-600 text-xs font-bold transition-all border border-red-100 shadow-xs cursor-pointer"
                                title="주보 데이터 삭제"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                삭제
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
