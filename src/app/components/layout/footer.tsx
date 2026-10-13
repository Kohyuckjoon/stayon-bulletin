import { Mail, ExternalLink, HelpCircle, ShieldCheck, FileText, RefreshCcw, X } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";

export function Footer() {
  const navigate = useNavigate();
  const GOOGLE_FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLScE7lXpdZSAO_PMK7XrjMXrFZSYWdss-BpzvMibSJYUDaUR3w/viewform"; // 구글폼 양식
  const KAKAO_CHANNEL_URL = "http://pf.kakao.com/_xexmExnX/chat";

  // 모달 상태 관리. 환불 정책은 더 이상 모달이 아니라 /pricing#refund로
  // 이동시키는 방식으로 바뀌어서 상태 자체가 필요 없어짐(아래에서 제거).
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);
  const [isPrivacyModalOpen, setIsPrivacyModalOpen] = useState(false);

  return (
    <footer className="mt-6 sm:mt-10 bg-white border-t border-gray-100 py-6 sm:py-8">
      <div className="container mx-auto px-4 max-w-5xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-8">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gray-900 flex items-center justify-center text-white font-black italic text-xs">
                S
              </div>
              <span className="font-black text-gray-900 tracking-tighter uppercase">
                STAYON
              </span>
            </div>
            <div className="space-y-1">
              <p className="text-xs sm:text-sm text-gray-500 font-bold">
                상호: 스테이온 (STAYON)
              </p>
              <p className="text-xs sm:text-sm text-gray-500 font-bold">
                대표자: 고혁준 | 사업자등록번호: 861-05-03692
              </p>
              <p className="text-xs sm:text-sm text-gray-500 font-medium leading-relaxed">
                주소: 경기도 용인시 처인구 경안천로 196-1
              </p>
              <p className="text-xs sm:text-sm text-gray-500 font-bold">
                고객센터: 0502-1937-0615 (평일 10:00 - 18:00 | 주말 08:30 - 21:00)
              </p>
              <p className="text-xs sm:text-sm text-gray-500 font-bold">
                통신판매업신고: 제 2026-용인처인-00852 호
              </p>
              <p className="text-xs sm:text-sm text-gray-400 mt-2 tracking-tight">
                © 2026 STAYON. All rights reserved.
              </p>
            </div>
          </div>

          <div className="flex flex-col md:items-end gap-4">
            <div className="flex flex-wrap gap-3 sm:gap-4 justify-start md:justify-end">
              <button
                onClick={() => setIsTermsModalOpen(true)}
                className="flex items-center gap-1 text-gray-500 font-bold text-xs hover:text-blue-600 transition-colors"
              >
                <FileText className="w-3 h-3" /> 이용약관
              </button>
              <button
                onClick={() => setIsPrivacyModalOpen(true)}
                className="flex items-center gap-1 text-gray-500 font-bold text-xs hover:text-blue-600 transition-colors"
              >
                <ShieldCheck className="w-3 h-3" /> 개인정보처리방침
              </button>
              <button
                onClick={() => navigate("/pricing#refund")}
                className="flex items-center gap-1 text-blue-600 font-black text-xs hover:underline transition-colors"
              >
                <RefreshCcw className="w-3 h-3" /> 환불 정책
              </button>
            </div>

            <button
              onClick={() => window.open(KAKAO_CHANNEL_URL, "_blank")}
              className="group relative bg-gradient-to-br from-blue-50 to-indigo-50/50 p-4 rounded-2xl border border-blue-100/50 w-full max-w-xs text-left transition-all hover:shadow-lg hover:shadow-blue-500/10 active:scale-[0.98]"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-white rounded-xl flex items-center justify-center shadow-sm shrink-0 group-hover:bg-blue-500 transition-all duration-300">
                  <HelpCircle className="w-4 h-4 text-blue-500 group-hover:text-white transition-colors" />
                </div>
                <div className="min-w-0">
                  <p className="text-blue-900 font-black text-[13px] leading-tight">
                    도움이 필요하신가요?
                  </p>
                  <p className="text-blue-700/60 text-[11px] font-bold leading-tight mt-0.5">
                    고객지원 센터로 문의해주세요
                  </p>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-blue-200 group-hover:text-blue-400 transition-colors ml-auto shrink-0" />
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* --- 모달 영역 --- */}

      {/* 1. 이용약관 모달 */}
      {isTermsModalOpen && (
        <TermsModal onClose={() => setIsTermsModalOpen(false)} />
      )}

      {/* 2. 개인정보처리방침 모달 */}
      {isPrivacyModalOpen && (
        <PrivacyModal onClose={() => setIsPrivacyModalOpen(false)} />
      )}
    </footer>
  );
}


// 내부 컴포넌트: 이용약관 모달
function TermsModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white rounded-[2rem] overflow-hidden max-w-xl w-full max-h-[82vh] shadow-[0_24px_50px_-12px_rgba(0,0,0,0.17)] animate-in zoom-in-95 duration-200 flex flex-col text-left border border-gray-50">
        {/* 상단 헤더 영역 - 깔끔한 화이트 백그라운드 스티키 헤더 */}
        <div className="p-7 pb-5 flex justify-between items-center border-b border-gray-100 bg-white">
          <h3 className="text-xl font-black text-gray-900 tracking-tight">이용약관</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-50 active:scale-95 rounded-full transition-all">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>
        
        {/* 본문 스크롤 영역 - 카드형 그리드 배치와 토스 특유의 쾌적한 줄간격(leading-relaxed) 및 가독성 좋은 자모 폰트 세팅 */}
        <div className="p-7 overflow-y-auto text-[13px] text-gray-600 leading-relaxed space-y-5 bg-white">
          <section className="bg-gray-50/50 p-4 rounded-2xl border border-gray-100/60">
            <div className="inline-block px-2.5 py-0.5 bg-gray-200/60 text-gray-800 font-bold text-[10px] rounded-md mb-2">제 1 조</div>
            <h4 className="font-bold text-gray-900 text-sm mb-1.5">목적</h4>
            <p className="text-gray-600 font-medium">본 약관은 STAYON(이하 "회사")이 제공하는 스테이온 서비스 및 관련 제반 서비스의 이용과 관련하여 회사와 회원과의 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.</p>
          </section>
          
          <section className="bg-gray-50/50 p-4 rounded-2xl border border-gray-100/60">
            <div className="inline-block px-2.5 py-0.5 bg-gray-200/60 text-gray-800 font-bold text-[10px] rounded-md mb-2">제 2 조</div>
            <h4 className="font-bold text-gray-900 text-sm mb-1.5">서비스의 제공 및 변경</h4>
            <p className="text-gray-600 font-medium">회사는 주보 생성, 관리 및 디지털 콘텐츠 제공 서비스를 운영합니다. 회사는 기술적 사양의 변경 등의 경우에는 장차 체결되는 계약에 의해 제공할 서비스의 내용을 변경할 수 있습니다.</p>
          </section>
          
          <section className="bg-gray-50/50 p-4 rounded-2xl border border-gray-100/60">
            <div className="inline-block px-2.5 py-0.5 bg-gray-200/60 text-gray-800 font-bold text-[10px] rounded-md mb-2">제 3 조</div>
            <h4 className="font-bold text-gray-900 text-sm mb-1.5">이용계약의 체결</h4>
            <p className="text-gray-600 font-medium">이용계약은 회원이 본 약관의 내용에 동의하고 이용신청을 하며, 회사가 이를 승낙함으로써 체결됩니다. 유료 서비스의 경우 결제가 완료된 시점부터 서비스 이용 권한이 부여됩니다.</p>
          </section>
          
          <section className="bg-blue-50/60 p-4 rounded-2xl border border-blue-100/40">
            <div className="inline-block px-2.5 py-0.5 bg-blue-100 text-blue-700 font-bold text-[10px] rounded-md mb-2">제 4 조</div>
            <h4 className="font-bold text-blue-900 text-sm mb-1.5">청약철회 및 환불</h4>
            <p className="text-gray-600 font-medium">회원은 전자상거래법 등 관련 법령에 따라 결제 후 7일 이내에 청약철회를 할 수 있습니다. 단, 디지털 콘텐츠 특성상 서비스를 이용(주보 생성 등)한 경우에는 청약철회가 제한될 수 있으며 자세한 사항은 별도의 '환불 정책'에 따릅니다.</p>
          </section>

          <section className="bg-emerald-50/60 p-4 rounded-2xl border border-emerald-100/40">
            <div className="inline-block px-2.5 py-0.5 bg-emerald-100 text-emerald-700 font-bold text-[10px] rounded-md mb-2">제 5 조</div>
            <h4 className="font-bold text-emerald-900 text-sm mb-1.5">정기결제</h4>
            <p className="text-gray-600 font-medium">회원이 정기결제(월 자동결제) 플랜을 신청한 경우, 최초 결제일을 기준으로 매월 동일한 날짜에 등록된 결제수단으로 자동 결제됩니다. 해당 일자가 없는 달에는 말일에 결제됩니다. 회사는 결제 예정일 3일 전까지 결제 금액과 일자를 회원에게 안내합니다. 회원은 마이페이지에서 언제든지 정기결제를 해지할 수 있으며, 해지 시 다음 결제일부터 청구가 중단되고 이미 결제된 이용 기간은 만료일까지 정상적으로 이용할 수 있습니다. 결제 실패 시 회사는 일정 기간 재결제를 시도하며, 최종적으로 결제에 실패한 경우 서비스 이용이 일시 정지될 수 있습니다. 그 밖의 세부 사항은 별도의 '환불 정책'에 따릅니다.</p>
          </section>
        </div>
        
        {/* 하단 버튼 영역 - 가볍고 세련된 토스 스타일의 밝은 회색 확인 버튼 탑재 */}
        <div className="p-5 bg-white border-t border-gray-100 flex gap-2">
          <button onClick={onClose} className="w-full py-4 bg-blue-600 hover:bg-gray-200 text-white font-bold text-sm rounded-2xl active:scale-[0.99] transition-all">
            확인
          </button>
        </div>
      </div>
    </div>
  );
}

// 내부 컴포넌트: 개인정보처리방침 모달 (전체 UI 디자인 수정 완료)
function PrivacyModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300 text-left">
      <div className="bg-white rounded-[2rem] overflow-hidden max-w-xl w-full max-h-[82vh] shadow-[0_24px_50px_-12px_rgba(0,0,0,0.17)] animate-in zoom-in-95 duration-200 flex flex-col border border-gray-50">
        {/* 상단 헤더 영역 */}
        <div className="p-7 pb-5 flex justify-between items-center border-b border-gray-100 bg-white">
          <h3 className="text-xl font-black text-gray-900 tracking-tight">개인정보처리방침</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-50 active:scale-95 rounded-full transition-all">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>
        
        {/* 본문 스크롤 영역 - 불필요한 밑줄 제거 및 은은한 인덱스 포인터 디자인 구현 */}
        <div className="p-7 overflow-y-auto text-[13px] text-gray-600 leading-relaxed space-y-5 bg-white">
          <section className="bg-gray-50/50 p-4 rounded-2xl border border-gray-100/60">
            <h4 className="font-bold text-gray-900 text-sm mb-2 flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full"></span> 1. 개인정보 수집항목
            </h4>
            <p className="text-gray-600 font-medium pl-3.5">회사는 회원가입 및 서비스 제공을 위해 이메일, 이름, 연락처, 결제정보 등을 수집할 수 있습니다.</p>
          </section>
          
          <section className="bg-gray-50/50 p-4 rounded-2xl border border-gray-100/60">
            <h4 className="font-bold text-gray-900 text-sm mb-2 flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full"></span> 2. 개인정보 수집 목적
            </h4>
            <p className="text-gray-600 font-medium pl-3.5">수집된 정보는 회원 식별, 서비스 제공, 고객 문의 응대, 결제 처리 및 부정 이용 방지를 위해 사용됩니다.</p>
          </section>
          
          <section className="bg-gray-50/50 p-4 rounded-2xl border border-gray-100/60">
            <h4 className="font-bold text-gray-900 text-sm mb-2 flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full"></span> 3. 개인정보의 보유 및 이용기간
            </h4>
            <p className="text-gray-600 font-medium pl-3.5">회사는 원칙적으로 개인정보 수집 및 이용목적이 달성된 후에는 해당 정보를 지체 없이 파기합니다. 단, 관계법령에 의해 보존할 필요가 있는 경우 해당 기간 동안 보관합니다.</p>
          </section>
          
          <section className="bg-gray-50/50 p-4 rounded-2xl border border-gray-100/60">
            <h4 className="font-bold text-blue-600 text-sm mb-2 flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span> 4. 개인정보의 제3자 제공
            </h4>
            <p className="text-gray-600 font-medium pl-3.5">회사는 회원의 동의 없이 개인정보를 외부에 제공하지 않습니다. 단, 결제 처리를 위해 PG사(토스페이먼츠 등)에 필요한 정보를 제공할 수 있습니다.</p>
          </section>
        </div>
        
        {/* 하단 버튼 영역 */}
        <div className="p-5 bg-white border-t border-gray-100 flex gap-2">
          <button onClick={onClose} className="w-full py-4 bg-blue-600 hover:bg-gray-200 text-white font-bold text-sm rounded-2xl active:scale-[0.99] transition-all">
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
