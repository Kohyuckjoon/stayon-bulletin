import { Outlet, useNavigate } from "react-router";
import { Lock } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { useJobBoardEnabled } from "../../hooks/useJobBoardEnabled";

// /jobs 이하 모든 화면(게시판/등록/상세/수정/홍보)의 공통 게이트. /super > 화면 관리에서
// "사역자 청빙"을 끄면 이 아래 어떤 경로로 들어와도 준비중 화면만 보이게 한다.
export function JobsGate() {
    const navigate = useNavigate();
    const { enabled, loading } = useJobBoardEnabled();

    if (loading) {
        return <div className="min-h-screen bg-[#F9FAFB]" />;
    }

    if (!enabled) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center px-4">
                <Card className="max-w-md w-full bg-white/90 border border-gray-100 shadow-2xl rounded-[2.5rem] p-8 text-center space-y-6">
                    <div className="w-16 h-16 bg-gray-100 text-gray-400 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
                        <Lock className="w-8 h-8" />
                    </div>
                    <div className="space-y-2">
                        <span className="inline-block bg-gray-100 text-gray-500 text-xs font-black px-3 py-1 rounded-full uppercase tracking-wider">
                            일시 중단
                        </span>
                        <h2 className="text-xl font-black text-gray-900 tracking-tight">
                            사역자 청빙 서비스 준비 중입니다
                        </h2>
                        <p className="text-sm text-gray-500 font-medium leading-relaxed">
                            현재 잠시 이용이 제한되어 있어요. 곧 다시 만나요!
                        </p>
                    </div>
                    <Button
                        onClick={() => navigate("/")}
                        className="w-full h-12 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black shadow-lg shadow-blue-200 transition-all active:scale-95"
                    >
                        홈으로 돌아가기
                    </Button>
                </Card>
            </div>
        );
    }

    return <Outlet />;
}
