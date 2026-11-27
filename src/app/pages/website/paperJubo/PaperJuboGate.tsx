import { ComingSoonGate } from "../../../components/ComingSoonGate";
import { PaperJuboEditor } from "./PaperJuboEditor";

// 종이 주보 "준비중" 잠금(2026-11-24) — 홈페이지 편집 화면 · 주보 관리자(/admin/paper-jubo)가 같이 씀.
// 잠금 모양은 components/ComingSoonGate. 다시 열 때는 PAPER_JUBO_LOCKED = false
export const PAPER_JUBO_LOCKED = true;

export function PaperJuboGate({ storeKey, ownerId, churchName }: { storeKey: string; ownerId: string | null; churchName: string }) {
  return (
    <ComingSoonGate locked={PAPER_JUBO_LOCKED} desc={<>곧 우리 교회 종이 주보를 여기서 바로 만들고<br />PDF로 내려받을 수 있어요.</>}>
      {/* 잠겨 있을 땐 저장된 게 없어도 예시 주보로 채워서 어떤 기능인지 보이게 */}
      {(previewOnly) => <PaperJuboEditor storeKey={storeKey} ownerId={ownerId} churchName={churchName} sample={previewOnly} />}
    </ComingSoonGate>
  );
}
