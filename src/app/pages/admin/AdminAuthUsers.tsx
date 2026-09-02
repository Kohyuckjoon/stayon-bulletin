import { useEffect, useState } from "react";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { auth, db } from "../../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { Mail, Calendar, Shield, UserCheck } from "lucide-react";

export const AdminAuthUsers = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const ADMIN_EMAILS = ["akhj123akhjk@gmail.com", "stayon.platform@gmail.com"];

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user || !ADMIN_EMAILS.includes(user.email || "")) {
        alert("접근 권한이 없습니다.");
        window.location.href = "/login";
        return;
      }

      const fetchAuthUsers = async () => {
        try {
          // Firestore에 저장된 회원 데이터 불러오기 (가입일 기준 최신순 정렬)
          const q = query(collection(db, "users"), orderBy("createdAt", "desc"));
          const querySnapshot = await getDocs(q);
          const userData = querySnapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));
          setUsers(userData);
        } catch (error) {
          console.error("가입자 목록 조회 오류:", error);
        } finally {
          setLoading(false);
        }
      };

      fetchAuthUsers();
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="p-4 sm:p-8 md:p-12">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 md:mb-10 flex justify-between items-end">
          <div>
            <h1 className="text-xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">전체 가입자 현황</h1>
            <p className="text-gray-500 mt-1.5 md:mt-2 text-xs sm:text-base font-medium">
              가입한 전체 사용자 계정 목록입니다. (총 <span className="text-blue-600 font-bold">{users.length}</span>명)
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl md:rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="p-10 md:p-12 text-center text-gray-400 font-bold text-sm">가입자 목록을 불러오는 중입니다...</div>
          ) : users.length === 0 ? (
            <div className="p-10 md:p-12 text-center text-gray-400 font-bold text-sm">등록된 가입자가 없습니다.</div>
          ) : (
            <>
              {/* 모바일: 카드형 목록 */}
              <div className="md:hidden divide-y divide-gray-100">
                {users.map((user) => (
                  <div key={user.id} className="p-4 space-y-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Mail className="w-4 h-4 text-blue-500 shrink-0" />
                      <span className="font-bold text-gray-900 text-sm truncate">{user.email || user.id}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-gray-600 font-medium">{user.churchName || "교회명 미등록"}</span>
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-md text-[10px] font-bold uppercase">
                        {user.provider || "Email / Password"}
                      </span>
                    </div>
                    <div className="text-[11px] text-gray-400 font-mono flex flex-wrap gap-x-3 gap-y-0.5">
                      <span>가입일 {user.createdAt ? new Date(user.createdAt.toDate ? user.createdAt.toDate() : user.createdAt).toLocaleDateString() : "기록 없음"}</span>
                      <span className="truncate">UID {user.uid || user.id}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* 데스크톱: 기존 표 */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-gray-50/50">
                    <tr>
                      <th className="p-6 text-xs font-bold text-gray-400 uppercase tracking-widest">사용자 이메일 (계정 ID)</th>
                      <th className="p-6 text-xs font-bold text-gray-400 uppercase tracking-widest">교회명</th>
                      <th className="p-6 text-xs font-bold text-gray-400 uppercase tracking-widest">제공업체 / 상태</th>
                      <th className="p-6 text-xs font-bold text-gray-400 uppercase tracking-widest">가입일 (생성 날짜)</th>
                      <th className="p-6 text-xs font-bold text-gray-400 uppercase tracking-widest">사용자 UID</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {users.map((user) => (
                      <tr key={user.id} className="hover:bg-blue-50/30 transition-colors">
                        <td className="p-6 font-bold text-gray-900 flex items-center gap-2">
                          <Mail className="w-4 h-4 text-blue-500 shrink-0" />
                          {user.email || user.id}
                        </td>
                        <td className="p-6 text-gray-700 font-medium">
                          {user.churchName || "-"}
                        </td>
                        <td className="p-6">
                          <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs font-bold uppercase">
                            {user.provider || "Email / Password"}
                          </span>
                        </td>
                        <td className="p-6 text-gray-500 font-mono text-sm">
                          {user.createdAt ? new Date(user.createdAt.toDate ? user.createdAt.toDate() : user.createdAt).toLocaleDateString() : "기록 없음"}
                        </td>
                        <td className="p-6 text-gray-400 font-mono text-xs tracking-tight">
                          {user.uid || user.id}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
