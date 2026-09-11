// // 주석: 기존 기능 유지, 데이터 가독성을 위한 표 디자인 및 레이아웃 개선
// import { useEffect, useState } from "react";
// import { collection, getDocs } from "firebase/firestore";
// import { auth, db } from "../../firebase";
// import { AdminSidebar } from "../components/layout/Sidebar";

// import { onAuthStateChanged } from "firebase/auth";

// export const AdminJuboManagement = () => {
//   const [users, setUsers] = useState<any[]>([]);
//   const ADMIN_EMAILS = ["akhj123akhjk@gmail.com", "manager@stayon.com"];

//   useEffect(() => {
//   //   const user = auth.currentUser;
//   //   // 운영자 이메일 목록에 포함되지 않으면 강제 퇴장
//   //   if (!user || !ADMIN_EMAILS.includes(user.email || "")) {
//   //     alert("접근 권한이 없습니다.");
//   //     window.location.href = "/login";
//   //   }
//   //   const fetchUsers = async () => {
//   //     const querySnapshot = await getDocs(collection(db, "users"));
//   //     const userData = querySnapshot.docs.map((doc) => ({
//   //       id: doc.id,
//   //       ...doc.data(),
//   //     }));
//   //     setUsers(userData);
//   //   };
//   //   fetchUsers();
//   // }, []);
//     const unsubscribe = onAuthStateChanged(auth, (user) => {
//       // 운영자 이메일 목록에 포함되지 않으면 강제 퇴장
//       if (!user || !ADMIN_EMAILS.includes(user.email || "")) {
//         alert("접근 권한이 없습니다.");
//         window.location.href = "/login";
//         return;
//       }

//       // 권한 확인 성공 시 데이터 불러오기
//       const fetchUsers = async () => {
//         const querySnapshot = await getDocs(collection(db, "users"));
//         const userData = querySnapshot.docs.map((doc) => ({
//           id: doc.id,
//           ...doc.data(),
//         }));
//         setUsers(userData);
//       };
//       fetchUsers();
//     });

//     return () => unsubscribe();
//   }, []);

//   return (
//     <div className="flex min-h-screen bg-[#F9FAFB]">
//       <AdminSidebar />
//       <main className="flex-1 p-12">
//         <div className="max-w-6xl mx-auto">
//           {/* 헤더 섹션 여백 조정 및 타이포그래피 강화 */}
//           <div className="mb-10">
//             <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">운영자 통합 관리</h1>
//             <p className="text-gray-500 mt-2 font-medium">총 {users.length}개의 교회가 스테이온 서비스를 이용 중입니다.</p>
//           </div>

//           {/* 카드 컨테이너 수정 - 경계선 및 그림자 최적화 */}
//           <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 overflow-hidden">
//             <div className="overflow-x-auto">
//               <table className="w-full text-left border-collapse">
//                 <thead className="bg-gray-50/50">
//                   <tr>
//                     <th className="p-6 text-xs font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">교회명</th>
//                     <th className="p-6 text-xs font-bold text-gray-400 uppercase tracking-widest">담당자</th>
//                     <th className="p-6 text-xs font-bold text-gray-400 uppercase tracking-widest">연락처</th>
//                     <th className="p-6 text-xs font-bold text-gray-400 uppercase tracking-widest">상태</th>
//                     <th className="p-6 text-xs font-bold text-gray-400 uppercase tracking-widest">만료일</th>
//                   </tr>
//                 </thead>
//                 <tbody className="divide-y divide-gray-100">
//                   {users.map((user) => (
//                     // 호버시 부드러운 배경색 변화 및 시각적 간격 조정
//                     <tr key={user.id} className="hover:bg-blue-50/30 transition-colors cursor-pointer group">
//                       <td className="p-6 font-bold text-gray-900">{user.churchName}</td>
//                       <td className="p-6 text-gray-600">{user.seniorPastorName || '-'}</td>
//                       <td className="p-6 text-gray-600 font-mono text-sm tracking-tight">{user.phone}</td>
//                       <td className="p-6">
//                         {/* 상태 뱃지 스타일을 보다 직관적이고 세련된 톤으로 변경 */}
//                         <span className={`px-4 py-1.5 rounded-full text-[11px] font-bold tracking-wide uppercase ${user.status === 'premium' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
//                           }`}>
//                           {user.status || 'ACTIVE'}
//                         </span>
//                       </td>
//                       <td className="p-6 text-gray-500 font-mono text-sm">
//                         {user.lastPaymentDate ? new Date(user.lastPaymentDate.toDate()).toLocaleDateString() : '미설정'}
//                       </td>
//                     </tr>
//                   ))}
//                 </tbody>
//               </table>
//             </div>
//           </div>
//         </div>
//       </main>
//     </div>
//   );
// };


// 주석: 기존 기능 유지, 데이터 가독성을 위한 표 디자인 및 레이아웃 개선
import { useEffect, useState } from "react";
import { collection, getDocs, query, orderBy, Timestamp, doc, deleteDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "../../firebase";
import { CONGREGATION_SIZES } from "../../utils/congregationSizes";
import { PLAN_TIERS, getPlanTierMeta, getExpiryInfo, toDateSafe } from "../../utils/subscriptionTier";
import { ChevronDown } from "lucide-react";

import { onAuthStateChanged } from "firebase/auth";

// 날짜 하나를 "YYYY.MM.DD" 형태로. Timestamp/ISO문자열/Date 아무거나 받는다.
const formatDate = (value: unknown): string => {
  const d = toDateSafe(value);
  if (!d) return "-";
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }).replace(/\. /g, ".").replace(/\.$/, "");
};

export const AdminJuboManagement = () => {
  const [users, setUsers] = useState<any[]>([]);
  const ADMIN_EMAILS = ["akhj123akhjk@gmail.com", "stayon.platform@gmail.com"];
  const [userBulletins, setUserBulletins] = useState<{ [key: string]: any[] }>({});

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      // 운영자 이메일 목록에 포함되지 않으면 강제 퇴장
      if (!user || !ADMIN_EMAILS.includes(user.email || "")) {
        alert("접근 권한이 없습니다.");
        window.location.href = "/login";
        return;
      }

      // 권한 확인 성공 시 데이터 불러오기
      const fetchUsers = async () => {
        const querySnapshot = await getDocs(collection(db, "users"));
        const userData = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setUsers(userData);
      };
      fetchUsers();
    });

    return () => unsubscribe();
  }, []);

  // 회원 탈퇴 처리 핸들러 함수 구현 (Firestore에서 해당 유저 문서 삭제)
  const handleDeleteUser = async (userId: string, churchName: string, e: React.MouseEvent) => {
    e.stopPropagation(); // 행 클릭 이벤트 전파 방지
    
    if (!window.confirm(`정말 [${churchName || "해당 교회"}] 회원을 탈퇴(삭제) 처리하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) {
      return;
    }

    try {
      // Firestore 'users' 컬렉션에서 해당 문서 삭제
      await deleteDoc(doc(db, "users", userId));

      // 화면 상의 유저 목록 상태(state)에서도 즉시 필터링하여 반영
      setUsers((prevUsers) => prevUsers.filter((user) => user.id !== userId));
      
      alert("성공적으로 회원 탈퇴(삭제) 처리되었습니다.");
    } catch (error) {
      console.error("회원 삭제 중 오류 발생:", error);
      alert("회원 탈퇴 처리에 실패했습니다.");
    }
  };

  // 표에서 직접 수정한 필드(신청자, 성도 수 등)를 Firestore users 문서에 즉시 반영하는 공용 핸들러
  const handleUpdateUserField = async (userId: string, field: string, value: string) => {
    try {
      await updateDoc(doc(db, "users", userId), { [field]: value });
      setUsers((prevUsers) =>
        prevUsers.map((user) => (user.id === userId ? { ...user, [field]: value } : user))
      );
    } catch (error) {
      console.error(`${field} 수정 중 오류 발생:`, error);
      alert("수정에 실패했습니다.");
    }
  };

  // 만료일 연장/수정 핸들러 함수 구현 (Firestore lastPaymentDate 업데이트)
  const handleExtendExpiry = async (user: any, e: React.MouseEvent) => {
    e.stopPropagation(); // 행 클릭 이벤트 전파 방지
    const userId = user.id;
    const churchName = user.churchName;

    // 기존 만료일을 YYYY-MM-DD 형식의 문자열로 변환 (기본값 설정용).
    // 결제 이력(lastPaymentDate)이 없는 무료 체험 회원은 "가입일+1개월" 계산값을 기본값으로 넣어준다
    // (버튼을 눌렀을 때 빈 칸이 아니라 실제 체험 만료일이 미리 채워져 있어야 헷갈리지 않는다).
    let defaultDateStr = "";
    const expiryDate = getExpiryInfo(user).date;
    if (expiryDate) {
      try {
        defaultDateStr = expiryDate.toISOString().split("T")[0];
      } catch (err) {
        // 날짜 변환 실패 시 무시
      }
    }

    const inputDate = prompt(
      `[${churchName || "해당 교회"}]의 새로운 이용 만료일(결제일/연장일)을 입력해주세요.\n(형식: YYYY-MM-DD)`,
      defaultDateStr
    );

    if (!inputDate) return; // 취소한 경우

    // 유효한 날짜 형식인지 확인 및 Timestamp 변환
    const newDate = new Date(inputDate);
    if (isNaN(newDate.getTime())) {
      alert("올바른 날짜 형식이 아닙니다. (예: 2026-12-31)");
      return;
    }

    try {
      const userDocRef = doc(db, "users", userId);
      const timestampValue = Timestamp.fromDate(newDate);

      // Firestore 문서 업데이트
      await updateDoc(userDocRef, {
        lastPaymentDate: timestampValue,
      });

      // 화면 상태(state) 즉시 반영
      setUsers((prevUsers) =>
        prevUsers.map((user) =>
          user.id === userId ? { ...user, lastPaymentDate: timestampValue } : user
        )
      );

      alert("만료일이 성공적으로 연장(수정)되었습니다.");
    } catch (error) {
      console.error("만료일 수정 중 오류 발생:", error);
      alert("만료일 수정에 실패했습니다.");
    }
  };

  // 상태(플랜 티어) 선택 칩. 등급이 올라갈수록 그라데이션이 진해지고 그림자가 강해지도록
  // subscriptionTier.ts의 메타 정보를 그대로 입힌다 — 텍스트 색만 바꾸는 게 아니라
  // 아이콘 + 그라데이션 배경으로 "한눈에 등급이 보이게" 만든 것. select 자체는 투명하게 얹어서
  // 클릭하면 그대로 드롭다운으로 변경 가능.
  const StatusSelect = ({ user, size = "md" }: { user: any; size?: "sm" | "md" }) => {
    const meta = getPlanTierMeta(user.status);
    const Icon = meta.icon;
    const isSm = size === "sm";
    const leftPad = Icon ? (isSm ? "pl-7" : "pl-8") : (isSm ? "pl-2.5" : "pl-3");
    const sizeClass = isSm ? "py-1 text-[10px]" : "py-1.5 text-[11px]";
    return (
      <div className={`relative inline-flex items-center rounded-full ${meta.chipClass}`}>
        {Icon && (
          <Icon className={`absolute pointer-events-none ${meta.textClass} ${isSm ? "w-3 h-3 left-2.5" : "w-3.5 h-3.5 left-3"}`} />
        )}
        <select
          value={user.status || "active"}
          onChange={(e) => handleUpdateUserField(user.id, "status", e.target.value)}
          className={`appearance-none bg-transparent border-0 rounded-full font-bold tracking-wide cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-400 ${meta.textClass} ${leftPad} pr-6 ${sizeClass}`}
        >
          {PLAN_TIERS.map((t) => (
            <option key={t.value} value={t.value} className="text-gray-900 bg-white">{t.label}</option>
          ))}
        </select>
        <ChevronDown className={`absolute pointer-events-none opacity-70 ${meta.textClass} ${isSm ? "w-3 h-3 right-1.5" : "w-3.5 h-3.5 right-2"}`} />
      </div>
    );
  };

  // 만료일 + 잔여일 뱃지. 결제 이력이 없으면 가입일+1개월(체험) 기준으로 계산해서 보여준다.
  const ExpiryCell = ({ user }: { user: any }) => {
    const { date, isTrial, daysLeft } = getExpiryInfo(user);
    if (!date) return <span className="text-gray-300 text-sm">-</span>;
    const expired = daysLeft <= 0;
    const soon = !expired && daysLeft <= 7;
    return (
      <div className="flex flex-col gap-0.5">
        <span className="font-mono text-gray-700 text-sm">{formatDate(date)}</span>
        <span className={`text-[10px] font-bold ${expired ? "text-red-500" : soon ? "text-orange-500" : "text-emerald-500"}`}>
          {expired ? "만료됨" : `D-${daysLeft}`}{isTrial ? " · 체험 예상" : ""}
        </span>
      </div>
    );
  };

  return (
    // 사이드바 레이아웃 분리에 따라 메인 패딩 영역만 깔끔하게 유지
    <div className="p-4 sm:p-8 md:p-12">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 md:mb-10">
          <h1 className="text-xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">운영자 통합 관리</h1>
          <p className="text-gray-500 mt-1.5 md:mt-2 text-xs sm:text-base font-medium">총 {users.length}개의 교회가 스테이온 서비스를 이용 중입니다.</p>
        </div>

        <div className="bg-white rounded-2xl md:rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 overflow-hidden">
          {/* 모바일: 카드형 목록 (표의 편집 기능을 그대로 유지) */}
          <div className="md:hidden divide-y divide-gray-100">
            {users.map((user) => (
              <div key={user.id} className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold text-gray-900 text-sm truncate">{user.churchName}</p>
                  <StatusSelect user={user} size="sm" />
                </div>
                <div className="text-xs text-gray-500 font-medium">
                  담임목사 {user.seniorPastorName || '-'} · <span className="font-mono">{user.phone || '연락처 미등록'}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 block mb-0.5">신청자</label>
                    <input
                      type="text"
                      defaultValue={user.userName || ''}
                      placeholder="-"
                      onBlur={(e) => {
                        const newValue = e.target.value.trim();
                        if (newValue !== (user.userName || '')) {
                          handleUpdateUserField(user.id, 'userName', newValue);
                        }
                      }}
                      className="w-full bg-gray-50 text-gray-700 text-xs rounded-lg px-2.5 py-2 border border-gray-100 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 block mb-0.5">성도 수</label>
                    <select
                      value={user.congregationSize || ''}
                      onChange={(e) => handleUpdateUserField(user.id, 'congregationSize', e.target.value)}
                      className="w-full bg-gray-50 text-gray-700 text-xs rounded-lg px-2.5 py-2 border border-gray-100 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 transition-colors"
                    >
                      <option value="">-</option>
                      {CONGREGATION_SIZES.map((size) => (
                        <option key={size.value} value={size.value}>{size.value}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 bg-gray-50 rounded-xl px-2.5 py-2 border border-gray-100">
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 block mb-0.5">가입일</label>
                    <span className="font-mono text-gray-600 text-xs">{formatDate(user.createdAt)}</span>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 block mb-0.5">만료일</label>
                    <ExpiryCell user={user} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => handleExtendExpiry(user, e)}
                    className="flex-1 px-3 py-2 bg-blue-50 text-blue-600 active:bg-blue-600 active:text-white text-xs font-bold rounded-xl transition-all border border-blue-100"
                  >
                    만료일 연장
                  </button>
                  <button
                    onClick={(e) => handleDeleteUser(user.id, user.churchName, e)}
                    className="flex-1 px-3 py-2 bg-red-50 text-red-600 active:bg-red-600 active:text-white text-xs font-bold rounded-xl transition-all border border-red-100"
                  >
                    회원 탈퇴
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* 데스크톱: 기존 표 */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50/80 backdrop-blur sticky top-0 z-10">
                <tr>
                  <th className="p-3.5 text-[11px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">교회명</th>
                  <th className="p-3.5 text-[11px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">담임목사</th>
                  <th className="p-3.5 text-[11px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">신청자</th>
                  <th className="p-3.5 text-[11px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">성도 수</th>
                  <th className="p-3.5 text-[11px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">연락처</th>
                  <th className="p-3.5 text-[11px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">상태</th>
                  <th className="p-3.5 text-[11px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">가입일</th>
                  <th className="p-3.5 text-[11px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">만료일</th>
                  <th className="p-3.5 pr-10 text-[11px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap text-right">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((user) => (
                  // 호버시 부드러운 배경색 변화 및 시각적 간격 조정
                  <tr key={user.id} className="hover:bg-blue-50/30 transition-colors group">
                    <td className="p-3.5 font-bold text-gray-900 whitespace-nowrap text-sm">{user.churchName}</td>
                    <td className="p-3.5 text-gray-600 whitespace-nowrap text-sm">{user.seniorPastorName || '-'}</td>
                    <td className="p-3.5 whitespace-nowrap">
                      <input
                        type="text"
                        defaultValue={user.userName || ''}
                        placeholder="-"
                        onBlur={(e) => {
                          const newValue = e.target.value.trim();
                          if (newValue !== (user.userName || '')) {
                            handleUpdateUserField(user.id, 'userName', newValue);
                          }
                        }}
                        className="w-full min-w-[100px] bg-transparent text-gray-600 text-sm rounded-lg px-2 py-1 -mx-2 hover:bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 transition-colors"
                      />
                    </td>
                    <td className="p-3.5 whitespace-nowrap">
                      <select
                        value={user.congregationSize || ''}
                        onChange={(e) => handleUpdateUserField(user.id, 'congregationSize', e.target.value)}
                        className="min-w-[76px] bg-transparent text-gray-600 text-sm rounded-lg px-2 py-1 -mx-2 hover:bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 transition-colors cursor-pointer"
                      >
                        <option value="">-</option>
                        {CONGREGATION_SIZES.map((size) => (
                          <option key={size.value} value={size.value}>{size.value}</option>
                        ))}
                      </select>
                    </td>
                    <td className="p-3.5 text-gray-600 font-mono text-sm tracking-tight whitespace-nowrap">{user.phone}</td>
                    <td className="p-3.5 whitespace-nowrap">
                      <StatusSelect user={user} />
                    </td>
                    <td className="p-3.5 text-gray-500 font-mono text-sm whitespace-nowrap">{formatDate(user.createdAt)}</td>
                    <td className="p-3.5 whitespace-nowrap"><ExpiryCell user={user} /></td>
                    <td className="p-3.5 pr-10 text-right whitespace-nowrap">
                      {/* 만료일 연장 버튼과 회원 탈퇴 버튼을 함께 배치 */}
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={(e) => handleExtendExpiry(user, e)}
                          className="px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white text-xs font-bold rounded-xl transition-all shadow-2xs border border-blue-100"
                        >
                          만료일 연장
                        </button>
                        <button
                          onClick={(e) => handleDeleteUser(user.id, user.churchName, e)}
                          className="px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white text-xs font-bold rounded-xl transition-all shadow-2xs border border-red-100"
                        >
                          회원 탈퇴
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
