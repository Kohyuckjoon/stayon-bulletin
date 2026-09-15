import { RouterProvider } from "react-router";
import { router } from "./routes";
import { Toaster } from "./components/ui/sonner";
import { useEffect } from "react";

export default function App() {
  useEffect(() => {
    // [SEO] 구글 로봇을 위한 구조화된 데이터(JSON-LD) 자동 삽입
    // 화면 디자인에는 전혀 영향을 주지 않으며 검색 노출 순위만 높여줍니다.
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.innerHTML = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "name": "스테이온(STAYON) 온라인 주보",
      "url": "https://bulletin.stayon-platform.com/",
      "operatingSystem": "Android, iOS, Web",
      "applicationCategory": "BusinessApplication",
      // 실제 리뷰 데이터가 없는 상태에서 aggregateRating(별점)을 넣으면 구글의
      // "가짜 리뷰 마크업" 정책 위반으로 수동 조치(리치 결과 제외) 대상이 될 수 있어
      // 제거함. 실제 리뷰 기능이 생기면 그때 진짜 값으로 다시 추가할 것
      "offers": {
        "@type": "Offer",
        "price": "990",
        "priceCurrency": "KRW",
        "description": "월 990원 최저가 스마트 교회 주보 제작 서비스"
      },
      "description": "대한민국 최저가 990원 온라인·모바일 주보 제작 플랫폼. 종이 없는 교회, 스마트한 예배 안내를 위한 가장 쉬운 온라인 주보 편집기입니다."
    });
    document.head.appendChild(script);

    return () => {
      document.head.removeChild(script);
    };
  }, []);

  return (
    <>
      <RouterProvider router={router} />
      <Toaster />
    </>
  );
}
