import { useCallback } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { extendChurchSiteAccess } from "../utils/churchSite";
import { toast } from "sonner";

declare global {
  interface Window {
    PortOne: any;
  }
}

// 주보 플랫폼의 usePayment.ts와 PG(포트원) 계정·채널은 동일하게 재사용하지만(같은 업종으로 PG사 승인),
// 결제 성공 후 처리 로직은 완전히 분리되어 있음 — 여기서는 users/{uid}(주보 구독 정보)를 절대 건드리지
// 않고, churchSites/{slug}.accessExpiresAt만 연장한다. usePayment.ts는 이 파일에서 참조하지 않음
export const useWebsitePayment = () => {
  const requestWebsitePayment = useCallback(async (data: {
    planName: string;
    amount: number;
    months: 1 | 3;
    slug: string;
    buyerEmail?: string;
    buyerName?: string;
  }) => {
    const { PortOne } = window;

    if (typeof PortOne === "undefined") {
      toast.error("결제 모듈이 로드되지 않았습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    try {
      const payment = await PortOne.requestPayment({
        storeId: "store-cee37831-993c-4f67-a317-143a42ebd82b",
        channelKey: "channel-key-42cccb26-f8fd-4067-94ba-b13945900f21",
        paymentId: `stayon_web_${new Date().getTime()}`,
        orderName: data.planName,
        totalAmount: data.amount,
        currency: "CURRENCY_KRW",
        payMethod: "CARD",
        customer: {
          fullName: data.buyerName || "교회담당자",
          email: data.buyerEmail || "",
        },
        windowType: {
          pc: "IFRAME",
          mobile: "REDIRECTION",
        },
        redirectUrl: `${window.location.origin}/website-builder`,
      });

      if (!payment.code) {
        try {
          const newExpiry = await extendChurchSiteAccess(data.slug, data.months);

          await addDoc(collection(db, "payment_mail_triggers"), {
            buyerName: data.buyerName || "교회담당자",
            buyerEmail: data.buyerEmail || "",
            planName: data.planName,
            amount: data.amount.toLocaleString(),
            date: new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
            createdAt: serverTimestamp(),
          }).catch((err) => console.error("결제 메일 트리거 생성 실패:", err));

          toast.success(`${data.planName} 결제가 완료되었습니다! 이용 만료일: ${newExpiry.toLocaleDateString("ko-KR")}`);
          setTimeout(() => {
            window.location.assign("/website-builder");
          }, 1500);
        } catch (error) {
          console.error("홈페이지 이용 기간 연장 실패:", error);
          toast.error("결제는 완료됐지만 이용 기간 반영에 실패했습니다. 고객센터로 문의해주세요.");
        }
      } else {
        if (payment.code === "FAILURE_TYPE_CANCEL") return;
        toast.error(`결제 실패: ${payment.message}`);
      }
    } catch (error) {
      console.error("결제 오류:", error);
      toast.error("결제 요청 중 오류가 발생했습니다.");
    }
  }, []);

  return { requestWebsitePayment };
};
