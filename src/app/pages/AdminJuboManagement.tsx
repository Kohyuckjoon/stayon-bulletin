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

import { onAuthStateChanged } from "firebase/auth";

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
  const handleExtendExpiry = async (userId: string, churchName: string, currentExpiry: any, e: React.MouseEvent) => {
    e.stopPropagation(); // 행 클릭 이벤트 전파 방지

    // 기존 만료일을 YYYY-MM-DD 형식의 문자열로 변환 (기본값 설정용)
    let defaultDateStr = "";
    if (currentExpiry) {
      try {
        const dateObj = currentExpiry.toDate ? currentExpiry.toDate() : new Date(currentExpiry);
        defaultDateStr = dateObj.toISOString().split("T")[0];
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

  return (
    // 사이드바 레이아웃 분리에 따라 메인 패딩 영역만 깔끔하게 유지
    <div className="p-8 md:p-12">
      <div className="max-w-6xl mx-auto">
        <div className="mb-10">
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">운영자 통합 관리</h1>
          <p className="text-gray-500 mt-2 font-medium">총 {users.length}개의 교회가 스테이온 서비스를 이용 중입니다.</p>
        </div>

        <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50/50">
                <tr>
                  <th className="p-4 text-xs font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">교회명</th>
                  <th className="p-4 text-xs font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">담임목사</th>
                  <th className="p-4 text-xs font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">신청자</th>
                  <th className="p-4 text-xs font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">성도 수</th>
                  <th className="p-4 text-xs font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">연락처</th>
                  <th className="p-4 text-xs font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">상태</th>
                  <th className="p-4 text-xs font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">만료일</th>
                  <th className="p-4 pr-10 text-xs font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((user) => (
                  // 호버시 부드러운 배경색 변화 및 시각적 간격 조정
                  <tr key={user.id} className="hover:bg-blue-50/30 transition-colors cursor-pointer group">
                    <td className="p-4 font-bold text-gray-900 whitespace-nowrap">{user.churchName}</td>
                    <td className="p-4 text-gray-600 whitespace-nowrap">{user.seniorPastorName || '-'}</td>
                    <td className="p-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
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
                        className="w-full min-w-[110px] bg-transparent text-gray-600 text-sm rounded-lg px-2 py-1 -mx-2 hover:bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 transition-colors"
                      />
                    </td>
                    <td className="p-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={user.congregationSize || ''}
                        onChange={(e) => handleUpdateUserField(user.id, 'congregationSize', e.target.value)}
                        className="min-w-[80px] bg-transparent text-gray-600 text-sm rounded-lg px-2 py-1 -mx-2 hover:bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 transition-colors cursor-pointer"
                      >
                        <option value="">-</option>
                        {CONGREGATION_SIZES.map((size) => (
                          <option key={size.value} value={size.value}>{size.value}</option>
                        ))}
                      </select>
                    </td>
                    <td className="p-4 text-gray-600 font-mono text-sm tracking-tight whitespace-nowrap">{user.phone}</td>
                    <td className="p-4 whitespace-nowrap">

                      <span className={`px-4 py-1.5 rounded-full text-[11px] font-bold tracking-wide uppercase ${user.status === 'premium' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                        }`}>
                        {user.status || 'ACTIVE'}
                      </span>
                    </td>
                    <td className="p-4 text-gray-500 font-mono text-sm whitespace-nowrap">
                      {user.lastPaymentDate ? new Date(user.lastPaymentDate.toDate()).toLocaleDateString() : '미설정'}
                    </td>
                    <td className="p-4 pr-10 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      {/* <button
                        onClick={(e) => handleDeleteUser(user.id, user.churchName, e)}
                        className="px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white text-xs font-bold rounded-xl transition-all shadow-2xs border border-red-100"
                      >
                        회원 탈퇴
                      </button> */}

                      {/* 만료일 연장 버튼과 회원 탈퇴 버튼을 함께 배치 */}
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={(e) => handleExtendExpiry(user.id, user.churchName, user.lastPaymentDate, e)}
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
