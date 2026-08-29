import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface NoticeImageCarouselProps {
    images: string[];
}

// 공지사항에 첨부된 여러 장의 이미지를 화살표/점 인디케이터로 한 장씩 넘겨보는 캐러셀
// 이미지의 원본 비율 그대로 폭에 맞춰 표시(w-full h-auto)해서 잘리는 부분 없이 전체가 보이도록 함
export function NoticeImageCarousel({ images }: NoticeImageCarouselProps) {
    const [index, setIndex] = useState(0);

    if (images.length === 0) return null;

    const goPrev = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIndex(prev => (prev - 1 + images.length) % images.length);
    };
    const goNext = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIndex(prev => (prev + 1) % images.length);
    };

    return (
        <div className="relative" onClick={(e) => e.stopPropagation()}>
            <div className="w-full overflow-hidden rounded-xl border border-gray-100 bg-gray-50">
                <img
                    src={images[index]}
                    alt={`공지사항 첨부 이미지 ${index + 1}`}
                    className="w-full h-auto block"
                />
            </div>

            {images.length > 1 && (
                <>
                    <button
                        type="button"
                        onClick={goPrev}
                        className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 bg-black/40 text-white rounded-full hover:bg-black/60 transition-colors cursor-pointer"
                        aria-label="이전 이미지"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                        type="button"
                        onClick={goNext}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-black/40 text-white rounded-full hover:bg-black/60 transition-colors cursor-pointer"
                        aria-label="다음 이미지"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>

                    <div className="absolute top-2 right-2 px-2 py-0.5 bg-black/40 text-white text-[10px] font-bold rounded-full">
                        {index + 1} / {images.length}
                    </div>

                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2 py-1 bg-black/40 rounded-full">
                        {images.map((_, i) => (
                            <button
                                key={i}
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setIndex(i); }}
                                className={`h-1.5 rounded-full transition-all cursor-pointer ${i === index ? "bg-white w-4" : "bg-white/50 w-1.5"}`}
                                aria-label={`${i + 1}번째 이미지로 이동`}
                            />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
