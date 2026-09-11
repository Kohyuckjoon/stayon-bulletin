import { useEffect } from "react";
import { useNavigate } from "react-router";
import { auth, db } from "../../firebase";
import { doc, getDoc, updateDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { toast } from "sonner";

export function SuccessPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleSuccess = async () => {
      // 1. 유저 인증 대기 (Firebase Auth 특성상 즉시 안 잡힐 수 있음)
      const user = auth.currentUser;
      if (!user) {
        // 비로그인 상태면 로그인으로
        navigate("/login");
        return;
      }

      try {
        const userRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userRef);
        
        if (userDoc.exists()) {
          const currentData = userDoc.data();
          
          // 이미 프리미엄 처리가 되었는지 확인 (중복 처리 방지)
          if (currentData.updatedAt && (new Date().getTime() - currentData.updatedAt.toDate().getTime() < 10000)) {
            setTimeout(() => navigate("/admin"), 1500);
            return;
          }

          const now = new Date();
          let newStartDate = now;

          if (currentData.lastPaymentDate) {
            const prevEndDate = currentData.lastPaymentDate instanceof Timestamp 
              ? currentData.lastPaymentDate.toDate() 
              : new Date(currentData.lastPaymentDate);
            
            const expirationDate = new Date(prevEndDate);
            expirationDate.setDate(expirationDate.getDate() + 30);
            newStartDate = expirationDate > now ? expirationDate : now;
          }

          await updateDoc(userRef, {
            status: "allinone",
            isPaidUser: true,
            isTrialUsed: true,
            lastPaymentDate: Timestamp.fromDate(newStartDate),
            updatedAt: serverTimestamp()
          });

          toast.success("결제가 성공적으로 반영되었습니다.");
          setTimeout(() => navigate("/admin"), 2000);
        }
      } catch (err) {
        toast.error("업데이트 중 오류가 발생했습니다.");
      }
    };

    handleSuccess();
  }, [navigate]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-4">
      <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-6 animate-bounce">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">결제가 완료되었습니다</h1>
      <p className="text-gray-500 text-center">
        성공적으로 프리미엄 플랜이 적용되었습니다.<br />
        잠시 후 관리자 화면으로 이동합니다.
      </p>
    </div>
  );
}