import { useCallback } from "react";
import { db, auth } from "../firebase";
import { doc, getDoc, updateDoc, serverTimestamp, Timestamp, collection, addDoc } from "firebase/firestore";
import { toast } from "sonner";

declare global {
  interface Window {
    PortOne: any;
  }
}

export const usePayment = () => {
  const requestPayment = useCallback(async (data: {
    planName: string;
    amount: number;
    buyerEmail?: string;
    buyerName?: string;
  }) => {
    const { PortOne } = window;
    const user = auth.currentUser;

    if (!user) {
      toast.error("로그인이 필요한 서비스입니다.");
      return;
    }

    if (typeof PortOne === "undefined") {
      toast.error("결제 모듈이 로드되지 않았습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    try {
      // 포트원 V2 결제 요청 실행
      const payment = await PortOne.requestPayment({
        // 제공해주신 상점 ID 및 채널 키 적용
        storeId: "store-cee37831-993c-4f67-a317-143a42ebd82b", 
        channelKey: "channel-key-42cccb26-f8fd-4067-94ba-b13945900f21", 
        paymentId: `stayon_${new Date().getTime()}`,
        orderName: data.planName,
        totalAmount: data.amount,
        currency: "CURRENCY_KRW",
        payMethod: "CARD",
        customer: {
          fullName: data.buyerName || user.displayName || "고혁준",
          email: data.buyerEmail || user.email || "",
        },
        windowType: {
          pc: "IFRAME",
          mobile: "REDIRECTION",
        },
        redirectUrl: `${window.location.origin}/admin`,
      });

      // 결제 성공 시 (V2는 결과에 code가 없으면 성공)
      if (!payment.code) {
        try {
          const userDocRef = doc(db, "users", user.uid);
          const userDoc = await getDoc(userDocRef);
          
          if (userDoc.exists()) {
            const currentData = userDoc.data();
            const now = new Date();
            let baseDate = now;

            // 플랜에 따른 기간 산정 (3개월 vs 1개월)
            const isThreeMonths = data.planName.includes("3개월") || data.planName.includes("90일");
            const extendDays = isThreeMonths ? 90 : 30;

            // 기존 구독 기간이 남은 경우 연장 처리
            if (currentData.lastPaymentDate instanceof Timestamp) {
              const prevEndDate = currentData.lastPaymentDate.toDate();
              if (prevEndDate > now) baseDate = prevEndDate;
            }

            const newExpirationDate = new Date(baseDate);
            newExpirationDate.setDate(newExpirationDate.getDate() + extendDays);

            // Firestore 사용자 정보 업데이트
            await updateDoc(userDocRef, {
              status: "premium", 
              isPaidUser: true,
              isTrialUsed: true,
              lastPaymentDate: Timestamp.fromDate(newExpirationDate),
              currentPlan: data.planName,
              updatedAt: serverTimestamp(),
              paymentId: payment.paymentId, 
            });

            try {
              await addDoc(collection(db, "payment_mail_triggers"), {
                buyerName: data.buyerName || currentData.churchName || "교회담당자",
                buyerEmail: data.buyerEmail || user.email || "",
                planName: data.planName,
                amount: data.amount.toLocaleString(), // 천단위 콤마 포맷
                date: new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
                createdAt: serverTimestamp(),
              });
              console.log("✅ 결제 관리자 알림 메일 트리거 생성 완료");
            } catch (mailErr) {
              console.error("❌ 결제 메일 트리거 생성 실패:", mailErr);
            }

            toast.success(`${data.planName} 결제가 완료되었습니다!`);
            
            // 관리자 페이지로 리다이렉트
            setTimeout(() => {
              window.location.assign("/admin");
            }, 1500);
          }
        } catch (error) {
          console.error("DB 업데이트 실패:", error);
          toast.error("데이터 반영에 실패했습니다.");
        }
      } else {
        // 사용자 취소가 아닌 경우에만 에러 메시지 출력
        if (payment.code === "FAILURE_TYPE_CANCEL") return;
        toast.error(`결제 실패: ${payment.message}`);
      }
    } catch (error: any) {
      console.error("결제 오류:", error);
      toast.error(`결제 요청 중 오류가 발생했습니다.`);
    }
  }, []);

  return { requestPayment };
};
