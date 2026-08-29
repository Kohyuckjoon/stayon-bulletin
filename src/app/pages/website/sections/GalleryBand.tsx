import { useEffect, useState } from "react";

// 홈 화면 상단에 화면 전체 폭으로 표시되는 사진 밴드.
// 사진이 2장 이상이면 4초마다 자동으로 넘어가고, 하단 점을 눌러서 직접 넘길 수도 있음
export function GalleryBand({ images }: { images: string[] }) {
    const [index, setIndex] = useState(0);

    useEffect(() => {
        if (images.length <= 1) return;
        const timer = setInterval(() => setIndex((i) => (i + 1) % images.length), 4000);
        return () => clearInterval(timer);
    }, [images.length]);

    return (
        <div className="relative w-full aspect-[4/3] sm:aspect-[16/9] overflow-hidden bg-gray-900">
            {images.map((url, i) => (
                <img
                    key={url + i}
                    src={url}
                    alt=""
                    className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${i === index ? "opacity-100" : "opacity-0"}`}
                />
            ))}
            {images.length > 1 && (
                <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-1.5">
                    {images.map((_, i) => (
                        <button
                            key={i}
                            onClick={() => setIndex(i)}
                            aria-label={`${i + 1}번째 사진 보기`}
                            className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-white" : "w-1.5 bg-white/50"}`}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
