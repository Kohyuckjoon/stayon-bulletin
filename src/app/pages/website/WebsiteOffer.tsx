import { useEffect } from 'react';
import { useNavigate } from 'react-router';

// 이 라우트로 이미 뿌려진 링크(카카오 공유, 명함 등)가 계속 살아있도록 URL만 유지하고,
// 실제 요금/결제 화면은 /pricing(홈페이지 제작 탭)으로 단일화함
export function WebsiteOffer() {
    const navigate = useNavigate();

    useEffect(() => {
        navigate('/pricing?tab=website', { replace: true });
    }, [navigate]);

    return null;
}
