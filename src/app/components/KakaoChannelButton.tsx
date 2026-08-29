import { MessageCircle } from "lucide-react";

export const KAKAO_CHANNEL_URL = "http://pf.kakao.com/_xexmExnX/chat";

export function KakaoChannelButton() {

  return (
    <aside aria-label="고객 지원" className="fixed bottom-6 right-6 z-50">
      <button
        onClick={() => window.open(KAKAO_CHANNEL_URL, "_blank")}
        className="flex items-center gap-2 bg-[#FEE500] hover:bg-[#fdd835] text-[#3c1e1e] font-black px-5 py-3.5 rounded-full shadow-2xl transition-all hover:scale-105 active:scale-95 cursor-pointer border-0"
        aria-label="카카오 1:1 문의하기"
      >
        <MessageCircle className="w-5 h-5 fill-[#3c1e1e] text-[#3c1e1e]" />
        <span className="text-xs sm:text-sm tracking-tight">1:1 문의하기</span>
      </button>
    </aside>
  );
}
