import { useState, useEffect } from "react"; 
import { Outlet, Navigate } from "react-router";

export const SuperAuthGuard = () => {
    // 초기값을 localStorage에서 가져와서 새로고침해도 유지되게 함
    const [isAuthenticated, setIsAuthenticated] = useState(() => {
        return localStorage.getItem("isSuperAuthenticated") === "true";
    });
    const [password, setPassword] = useState("");

    useEffect(() => {
        localStorage.setItem("isSuperAuthenticated", isAuthenticated.toString());
    }, [isAuthenticated]);

    // 인증되지 않았을 때 로그인 화면 표시
    if (!isAuthenticated) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-50">
                <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 w-full max-w-sm">
                    <h2 className="text-xl font-bold mb-4">운영자 인증</h2>
                    <input
                        type="password"
                        className="w-full p-3 border rounded-lg mb-4"
                        placeholder="비밀번호 입력"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                        onClick={() => {
                            // 실제 비밀번호 로직 (서버 사이드 검증 권장)
                            if (password === "1090") {
                                setIsAuthenticated(true);
                            } else {
                                alert("비밀번호가 틀렸습니다.");
                            }
                        }}
                        className="w-full bg-blue-600 text-white p-3 rounded-lg font-bold"
                    >
                        확인
                    </button>
                    {/* 로그아웃 버튼이나 기타 안전장치 고려 가능 */}
                </div>
            </div>
        );
    }

    return <Outlet />; 
};
