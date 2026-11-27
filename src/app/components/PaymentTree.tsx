import { useEffect, useState } from 'react'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../../firebase'
import { isOperatorEmail } from '../../utils/operator'
import { MANAGED_PLANS, PRICING_MATRIX, SELF_PLAN_REFUND } from '../../utils/pricingMatrix'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog'

// 결제된 내역 + 1년 완납 환급(포도)나무 — 홈페이지 편집 화면(BuilderPage > 요금제)과
// 주보 관리자 결제 관리(/admin/billing)가 같이 씀(2026-11-25 BuilderPage에서 옮김)
const THEME = {
  navy: '#1B3A6B',
  sky: '#3182F6',
  text: '#111827',
  muted: '#6B7280',
  border: '#E5E7EB',
}

// ── 요금제 화면: 결제된 내역 + 12칸 환급 나무(2026-11-24) ─────────────────────────────
// 서버 myPayments 응답. 결제 기록은 포트원에만 있어서 서버가 이 교회 것만 골라 줌(읽기 전용)
export interface PayItem { id: string; status: string; orderName: string; paidAt: string; paid: number; cancelled: number; recurring: boolean; receiptUrl: string }
export interface PayInfo { billing: { active: boolean; planName: string; amount: number; refund: number; startedAt: string; nextAt: string }; items: PayItem[] }

// ── 1년 완납 세기(2026-11-25 규칙 확정) ─────────────────────────────────────
// - 정기결제만 셈. 1번 = 1칸, 12칸이면 완납. 1회 결제(1개월·3개월)는 세지 않음
// - 지금 정기결제를 시작한 날(billingStartedAt) 이후 결제만 → 요금제를 올리거나(즉시 새로 시작)
//   해지 후 다른 요금제로 다시 정기결제하면 시작일이 새로 잡혀 항아리·나무가 처음부터 다시 참(초기화)
// - 셀프형·관리형은 항아리(주보 플랫폼)와 나무(홈페이지 플랫폼)가 같은 결제로 똑같이 참. 보상은 1년에 한 번
export function cycleItems(info: PayInfo, plan: RegExp = /(베이직|스탠다드|프로|셀프형|관리형)/): PayItem[] {
  const start = info.billing.startedAt ? new Date(info.billing.startedAt).getTime() - 86400000 : 0
  // 일부 취소(현금 환급을 결제 일부 취소로 드린 경우)는 계속 1칸으로 셈 — 전액 취소된 결제만 빠짐
  return info.items.filter((p) => p.recurring && (p.status === 'PAID' || p.status === 'PARTIAL_CANCELLED') && p.paid > 0 && plan.test(p.orderName) &&
    (!start || new Date(p.paidAt).getTime() >= start))
}
export const cycleCells = (info: PayInfo, plan?: RegExp) => Math.min(12, cycleItems(info, plan).length)
const HOMEPAGE_PLAN = /(프로|셀프형|관리형)/
// 지금 정기결제 요금제가 셀프형·관리형인지(= 현금 환급/1개월+커피 중 고르는 보상)
export const isHomepagePlan = (info: PayInfo) => HOMEPAGE_PLAN.test(info.billing.planName)
function treeItems(info: PayInfo): PayItem[] { return cycleItems(info, HOMEPAGE_PLAN) }
function treeCells(info: PayInfo): number { return Math.min(12, treeItems(info).length) }

// 운영자 테스트(주소 ?refundTest=basic|standard|pro|lite|max, 운영자 계정만): 12번 다 낸 가짜 결제 기록
export type TestPlanKey = 'basic' | 'standard' | 'pro' | 'lite' | 'max'
export function readTestPlan(): TestPlanKey | null {
  if (typeof window === 'undefined' || !isOperatorEmail(auth.currentUser?.email)) return null
  const t = new URLSearchParams(window.location.search).get('refundTest')
  if (t === '1') return 'lite'
  return t === 'basic' || t === 'standard' || t === 'pro' || t === 'lite' || t === 'max' ? t : null
}
export const TEST_PLAN_LABEL: Record<TestPlanKey, string> = { basic: '베이직', standard: '스탠다드', pro: '셀프형', lite: '라이트', max: '맥스' }
export function buildTestPayInfo(k: TestPlanKey): PayInfo {
  const p = k === 'basic' ? { label: '베이직', amount: 990, refund: 0, scope: '주보' }
    : k === 'standard' ? { label: '스탠다드', amount: 2900, refund: 0, scope: '주보' }
    : k === 'pro' ? { label: '프로 · 셀프형', amount: 9900, refund: SELF_PLAN_REFUND.refund, scope: '주보·홈페이지' }
    : { label: MANAGED_PLANS[k].label, amount: MANAGED_PLANS[k].monthly, refund: MANAGED_PLANS[k].refund, scope: '주보·홈페이지' }
  const name = `${p.label} ${p.scope} 정기결제 플랜 (테스트)`
  return {
    billing: { active: true, planName: name, amount: p.amount, refund: p.refund, startedAt: new Date(Date.now() - 365 * 86400000).toISOString(), nextAt: new Date(Date.now() + 20 * 86400000).toISOString() },
    items: Array.from({ length: 12 }, (_, i) => ({ id: `test_${i + 1}`, status: 'PAID', orderName: name, paidAt: new Date(Date.now() - (11 - i) * 30 * 86400000).toISOString(), paid: p.amount, cancelled: 0, recurring: true, receiptUrl: '' })),
  }
}
// 환급 금액: 가입 때 계정에 저장된 금액이 우선(예전 가입 24,000·36,000 약속 유지). 저장값이 없으면 지금 가격표
const SELF_MONTHLY = PRICING_MATRIX[Object.keys(PRICING_MATRIX)[0]]?.pro.monthly ?? 9900
const refundOf = (info: PayInfo) => info.billing.refund || (info.billing.amount === MANAGED_PLANS.lite.monthly ? MANAGED_PLANS.lite.refund : info.billing.amount === MANAGED_PLANS.max.monthly ? MANAGED_PLANS.max.refund : info.billing.amount === SELF_MONTHLY || /프로/.test(info.billing.planName) ? SELF_PLAN_REFUND.refund : 0)
// 1개월 추가 이용을 고르면 함께 드리는 커피 쿠폰: 맥스 10,000원 · 라이트 5,000원
const couponOf = (info: PayInfo) => (info.billing.amount === MANAGED_PLANS.max.monthly || /맥스/.test(info.billing.planName) ? MANAGED_PLANS.max.coupon : /프로/.test(info.billing.planName) ? SELF_PLAN_REFUND.coupon : MANAGED_PLANS.lite.coupon)

// 주보·홈페이지 요금제 결제만(2026-11-25): 같은 포트원 계정을 쓰는 수련회 장소 예약금 등 다른 서비스 결제는 뺌
export const isPlatformPayment = (p: PayItem) =>
  p.recurring || /(플랜|정기결제|관리형|셀프형|프로|베이직|스탠다드|주보|홈페이지)/.test(p.orderName)

export function PaymentHistory({ info }: { info: PayInfo | null | 'error' | 'pending' }) {
  const items = info && info !== 'error' && info !== 'pending' ? info.items.filter(isPlatformPayment).sort((a, b) => b.paidAt.localeCompare(a.paidAt)) : []
  const won = (n: number) => `${n.toLocaleString()}원`
  const day = (s: string) => { const d = new Date(s); return isNaN(d.getTime()) ? '' : `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.` }
  return (
    <div style={{ background: 'white', border: `1px solid ${THEME.border}`, borderRadius: 16, padding: '18px 20px', minWidth: 0 }}>
      <p style={{ fontSize: 14, fontWeight: 800, color: THEME.navy, marginBottom: 10 }}>결제된 내역</p>
      {info === null ? (
        <p style={{ fontSize: 13, color: THEME.muted, padding: '10px 0' }}>불러오는 중이에요…</p>
      ) : info === 'pending' ? (
        <p style={{ fontSize: 13, color: THEME.muted, padding: '10px 0', lineHeight: 1.6 }}>교회 계정이 아직 연결되지 않았어요. 연결하면 그 교회의 결제 내역이 보여요.</p>
      ) : info === 'error' ? (
        <p style={{ fontSize: 13, color: '#DC2626', padding: '10px 0' }}>결제 내역을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.</p>
      ) : items.length === 0 ? (
        <p style={{ fontSize: 13, color: THEME.muted, padding: '10px 0' }}>최근 1년 동안 결제된 내역이 없어요.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {items.map((p, i) => {
            const cancelled = p.status === 'CANCELLED'
            return (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: i ? `1px solid ${THEME.border}` : 'none' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: cancelled ? THEME.muted : THEME.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: cancelled ? 'line-through' : 'none' }}>{p.orderName || '결제'}</p>
                  <p style={{ fontSize: 11.5, color: THEME.muted, marginTop: 2 }}>{day(p.paidAt)}{p.recurring ? ' · 정기결제' : ''}{cancelled ? ' · 취소됨' : p.cancelled > 0 ? ` · ${won(p.cancelled)} 취소` : ''}</p>
                </div>
                <span style={{ fontSize: 13.5, fontWeight: 800, color: cancelled ? THEME.muted : THEME.navy, whiteSpace: 'nowrap' }}>{won(p.paid || 0)}</span>
                {p.receiptUrl && <a href={p.receiptUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11.5, fontWeight: 700, color: THEME.sky, whiteSpace: 'nowrap' }}>영수증</a>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// 12칸 나무: 회색 나무에 결제할 때마다 잎 뭉치가 아래부터 한 칸씩 초록으로(한 칸 = 1/12 ≈ 8.3%).
// 12칸이 다 차면 줄기도 갈색으로, 보라 포도송이가 주렁주렁 열림(= 환급 대상).
// "완성 모습 보기"(2026-11-25): 아직 덜 채운 교회도 다 채웠을 때의 포도나무를 미리 볼 수 있게
const TREE_LEAVES: [number, number][] = [
  [84, 158], [120, 162], [156, 158],               // 1~3 (맨 아래)
  [64, 124], [102, 128], [138, 128], [176, 124],   // 4~7
  [82, 90], [120, 94], [158, 90],                  // 8~10
  [102, 58], [138, 58],                            // 11~12 (꼭대기)
]
const LEAF_GREENS = ['#4ADE80', '#34D399', '#22C55E', '#10B981', '#16A34A', '#059669']
// 포도송이 자리(송이 맨 위 꼭지 기준)
const GRAPE_SPOTS: [number, number][] = [[58, 146], [182, 146], [86, 182], [154, 182], [120, 118], [100, 84], [140, 84]]
// 포도송이 하나: 꼭지 + 작은 잎 + 알 4줄(3·3·2·1) — 알마다 하이라이트로 동글동글하게
function GrapeBunch({ x, y, delay }: { x: number; y: number; delay: number }) {
  const rows = [3, 3, 2, 1]
  const r = 4.6
  return (
    <g className="animate-in zoom-in fade-in duration-500" style={{ animationDelay: `${delay}s`, animationFillMode: 'both', transformOrigin: `${x}px ${y}px`, transformBox: 'view-box' } as React.CSSProperties}>
      <path d={`M${x} ${y - 6} L${x} ${y + 2}`} stroke="#78350F" strokeWidth="2" strokeLinecap="round" />
      <path d={`M${x} ${y - 3} C${x + 4} ${y - 10} ${x + 12} ${y - 9} ${x + 13} ${y - 4} C${x + 8} ${y - 1} ${x + 3} ${y - 1} ${x} ${y - 3} Z`} fill="#22C55E" />
      {rows.map((n, ri) => Array.from({ length: n }).map((_, k) => {
        const cx = x + (k - (n - 1) / 2) * r * 1.9
        const cy = y + 5 + ri * r * 1.7
        return (
          <g key={`${ri}-${k}`}>
            <circle cx={cx} cy={cy} r={r} fill={(ri + k) % 2 ? '#7C3AED' : '#6D28D9'} stroke="#4C1D95" strokeWidth="0.6" />
            <circle cx={cx - 1.4} cy={cy - 1.5} r={1.3} fill="rgba(255,255,255,0.55)" />
          </g>
        )
      }))}
    </g>
  )
}
export function RefundTree({ info: realInfo, ownerId, slug, churchName }: { info: PayInfo | null | 'error' | 'pending'; ownerId: string | null; slug: string; churchName: string }) {
  // 운영자 테스트: ?refundTest=pro|lite|max(나무는 셀프형·관리형만이라 basic·standard는 무시)
  const tp = readTestPlan()
  const testParam = tp === 'pro' || tp === 'lite' || tp === 'max' ? tp : null
  const testMode = !!testParam
  const realReady = !!realInfo && realInfo !== 'error' && realInfo !== 'pending'
  const info: PayInfo | null | 'error' | 'pending' = testParam ? buildTestPayInfo(testParam) : realInfo
  const pi: PayInfo | null = info && info !== 'error' && info !== 'pending' ? info : null
  const ready = testMode || realReady
  const cells = pi ? treeCells(pi) : 0
  const refund = pi ? refundOf(pi) : 0
  const done = cells >= 12
  // 완성 모습 미리보기(실제 칸 수는 그대로, 그림만): 1칸부터 12칸까지 결제 1번씩 천천히 차오른 뒤 포도송이가 열림
  const [preview, setPreview] = useState(false)
  const [replay, setReplay] = useState(0) // "다시 보기" 누를 때마다 처음부터
  const [shown, setShown] = useState(0)
  const previewDone = preview && shown >= 12
  const full = done || previewDone
  useEffect(() => {
    if (!preview) { const t = setTimeout(() => setShown(done ? 12 : cells), 120); return () => clearTimeout(t) }
    // 0칸에서 시작해 0.35초마다 한 칸(= 결제 1번)
    setShown(0)
    let n = 0
    const iv = setInterval(() => { n += 1; setShown(n); if (n >= 12) clearInterval(iv) }, 350)
    return () => clearInterval(iv)
  }, [cells, done, preview, replay])
  const pct = Math.round((cells / 12) * 100)
  const trunk = full ? '#92400E' : shown > 0 ? '#A16207' : '#D1D5DB'
  return (
    <div style={{ background: 'white', border: `1px solid ${THEME.border}`, borderRadius: 16, padding: '18px 20px 20px', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <p style={{ fontSize: 14, fontWeight: 800, color: THEME.navy }}>1년 완납 환급 나무{testParam && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 800, color: '#B45309', background: '#FEF3C7', borderRadius: 999, padding: '2px 8px' }}>테스트 모드 · {TEST_PLAN_LABEL[testParam]}</span>}</p>
        <p style={{ fontSize: 13, fontWeight: 800, color: done ? '#7C3AED' : '#16A34A' }}>{cells} / 12칸 · {pct}%</p>
      </div>
      <div style={{ position: 'relative' }}>
        {preview && !done && (
          <span style={{ position: 'absolute', top: 6, left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap', fontSize: 11.5, fontWeight: 800, borderRadius: 999, padding: '4px 10px',
            color: previewDone ? '#6D28D9' : '#15803D', background: previewDone ? '#F5F3FF' : '#F0FDF4', border: `1px solid ${previewDone ? '#DDD6FE' : '#BBF7D0'}` }}>
            {previewDone ? '🍇 12칸을 다 채우면 이렇게 돼요' : shown === 0 ? '결제할 때마다 한 칸씩 자라요' : `💳 ${shown}번째 결제 → ${shown}칸`}
          </span>
        )}
        <svg viewBox="0 0 240 270" style={{ display: 'block', width: '100%', maxWidth: 320, margin: '6px auto 0' }} role="img" aria-label={full ? '12칸을 다 채운 포도나무' : `12칸 중 ${cells}칸 채워짐`}>
          <ellipse cx="120" cy="252" rx="78" ry="9" fill={full ? '#EDE9FE' : '#EEF2F6'} style={{ transition: 'fill 0.6s' }} />
          {/* 줄기·가지 */}
          <path d="M110 252 C112 220 112 200 108 176 L132 176 C128 200 128 220 130 252 Z" fill={trunk} style={{ transition: 'fill 0.6s' }} />
          <path d="M114 196 C100 186 92 176 86 162 M126 192 C140 182 148 172 154 160" stroke={trunk} strokeWidth="6" strokeLinecap="round" fill="none" style={{ transition: 'stroke 0.6s' }} />
          {/* 잎 뭉치 12칸(완성 그림에선 번호 대신 잎맥 느낌만) */}
          {TREE_LEAVES.map(([x, y], i) => {
            const on = i < shown
            return (
              <g key={i}>
                <circle cx={x} cy={y} r="25" fill={on ? LEAF_GREENS[i % LEAF_GREENS.length] : '#E5E7EB'} stroke="white" strokeWidth="3"
                  style={{ transition: preview ? 'fill 0.3s ease' : `fill 0.5s ease ${on ? i * 0.07 : 0}s` }} />
                {/* 미리보기: 방금 찬 칸이 톡 튀어나오게 */}
                {preview && on && i === shown - 1 && !full && (
                  <circle key={`pop-${replay}-${i}`} cx={x} cy={y} r="25" fill="none" stroke={LEAF_GREENS[i % LEAF_GREENS.length]} strokeWidth="3"
                    className="animate-ping" style={{ transformOrigin: `${x}px ${y}px`, transformBox: 'view-box', animationIterationCount: 1 } as React.CSSProperties} />
                )}
                {!full && <text x={x} y={y + 4} textAnchor="middle" fontSize="11" fontWeight="800" fill={on ? 'rgba(255,255,255,0.9)' : '#9CA3AF'} style={{ transition: 'fill 0.5s' }}>{i + 1}</text>}
              </g>
            )
          })}
          {/* 완성: 포도송이 */}
          {full && GRAPE_SPOTS.map(([x, y], i) => <GrapeBunch key={`${replay}-${i}`} x={x} y={y} delay={(preview ? 0.3 : 0.9) + i * 0.12} />)}
        </svg>
      </div>
      {ready && !done && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 6 }}>
          <button type="button" onClick={() => setPreview(v => !v)}
            style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 800, cursor: 'pointer', borderRadius: 999, padding: '8px 16px',
              border: `1px solid ${preview ? THEME.border : '#DDD6FE'}`, background: preview ? 'white' : '#F5F3FF', color: preview ? THEME.text : '#6D28D9' }}>
            {preview ? '← 지금 우리 나무 보기' : '🍇 완성 모습 보기'}
          </button>
          {previewDone && (
            <button type="button" onClick={() => setReplay(r => r + 1)}
              style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 800, cursor: 'pointer', borderRadius: 999, padding: '8px 14px', marginLeft: 8,
                border: '1px solid #DDD6FE', background: '#F5F3FF', color: '#6D28D9' }}>↻ 다시 보기</button>
          )}
        </div>
      )}
      <div style={{ marginTop: 10, borderRadius: 12, background: done ? '#F5F3FF' : '#F0FDF4', padding: '12px 14px', fontSize: 13, lineHeight: 1.6, color: THEME.text, wordBreak: 'keep-all' }}>
        {!ready ? (info === 'pending' ? '교회 계정이 연결되면 결제할 때마다 나무가 자라요.' : info === 'error' ? '결제 기록을 불러오지 못해 나무를 그릴 수 없어요.' : '결제 기록을 확인하고 있어요…')
          : done ? <><b>🍇 12칸을 다 채워 포도나무가 완성됐어요!</b> {refund ? <>{refund.toLocaleString()}원 환급 대상이에요.</> : ''}</>
          : refund ? <>결제할 때마다 한 칸씩 자라요. <b>{12 - cells}번 더</b> 결제하면 <b style={{ color: '#16A34A' }}>{refund.toLocaleString()}원</b>을 돌려드려요.</>
          : <>이 나무는 <b>프로 · 셀프형, 관리형 정기결제 사용자만</b> 키울 수 있어요. 1년(12칸)을 다 채우면 셀프형 {SELF_PLAN_REFUND.refund.toLocaleString()}원 · 관리형 라이트 {MANAGED_PLANS.lite.refund.toLocaleString()}원 · 맥스 {MANAGED_PLANS.max.refund.toLocaleString()}원을 돌려드려요.</>}
      </div>
      {/* 12칸 완성 → 환급 요청하기(항아리 화면과 같은 요청 하나를 같이 씀) */}
      {/* 정기결제를 해지한 교회는 혜택 없음(2026-11-25) */}
      {done && ready && ownerId && pi && (pi.billing.active
        ? <RefundRequestBox pi={pi} ownerId={ownerId} slug={slug} churchName={churchName} testMode={testMode} />
        : <p style={{ marginTop: 10, borderRadius: 12, background: '#F8FAFC', padding: '12px 14px', fontSize: 13, lineHeight: 1.6, color: THEME.text, wordBreak: 'keep-all' }}>정기결제를 해지해서 이번 1년 완납 혜택은 드리지 않아요. 다시 정기결제를 시작하면 처음부터 채워요.</p>)}
      <p style={{ marginTop: 8, fontSize: 11.5, color: THEME.muted, lineHeight: 1.5, wordBreak: 'keep-all' }}>프로 · 셀프형과 관리형 정기결제 사용자만 키울 수 있는 나무예요(주보 관리자의 항아리와 함께 차요). 정기결제 1번 = 1칸, 1회 결제는 해당되지 않아요. 요금제를 바꾸거나 해지 후 다시 결제하면 처음부터 다시 시작해요. 보상은 1년에 한 번이에요.</p>
    </div>
  )
}

// 1년 완납 보상 요청(셀프형·관리형) — 홈페이지 나무와 주보 항아리가 같이 씀(2026-11-25).
// refundRequests/{계정}_{정기결제 시작일} 한 건을 두 화면이 같이 봄 → 어느 쪽에서 요청해도 1년에 한 번만.
// 고르는 것: 결제 없이 1개월 더 + 커피 쿠폰(셀프형·라이트 5천 · 맥스 1만) / 현금 환급(16,800 · 2만 · 3만)
export function RefundRequestBox({ pi, ownerId, slug, churchName, testMode }: { pi: PayInfo; ownerId: string; slug: string; churchName: string; testMode: boolean }) {
  const refund = refundOf(pi)
  const done = true
  // 환급 요청(2026-11-25): 12칸을 다 채운 교회만. refundRequests/{계정}_{정기결제 시작일} 한 건 — 같은 1년 주기엔 한 번만.
  // 서버 onRefundRequest가 운영자 메일로 알림. 실제 환급(부분 취소·입금)은 운영자가 직접
  const cycle = (pi.billing.startedAt || '').slice(0, 10) || 'cycle'
  const reqId = testMode ? 'test' : ownerId && cycle ? `${ownerId}_${cycle}` : ''
  const [req, setReq] = useState<'loading' | 'none' | 'sending' | { status: string; at: string; choiceLabel?: string; choice?: string; nextText?: string }>('loading')
  useEffect(() => {
    if (!done || !reqId) return
    if (testMode) { setReq('none'); return }
    let alive = true
    getDoc(doc(db, 'refundRequests', reqId))
      .then((d) => { if (!alive) return; const x = d.data(); setReq(x && x.status !== 'canceled' ? { status: String(x.status || 'requested'), at: String(x.requestedAtText || ''), choiceLabel: String(x.choiceLabel || ''), choice: String(x.choice || ''), nextText: String(x.nextBillingText || '') } : 'none') })
      .catch(() => { if (alive) setReq('none') })
    return () => { alive = false }
  }, [done, reqId])
  // 환급 방식 고르기 창(2026-11-25): 화면 가운데 팝업에서 둘 중 하나를 골라 요청
  //  - extend: 결제 없이 1개월 더 이용 + 커피 쿠폰 5천원 / cash: 현금 환급(환급 금액)
  const [askOpen, setAskOpen] = useState(false)
  const [choice, setChoice] = useState<'extend' | 'cash'>('extend')
  const coupon = pi ? couponOf(pi) : MANAGED_PLANS.lite.coupon
  const couponText = `${coupon / 1000}천원`.replace('10천원', '1만원')
  // 정기결제 중이면 1개월 추가를 골라도 다음 결제는 평소대로 나감 → 스테이온이 확인 후 그 달 결제를 취소(환불)
  const nextText = (() => { const d = pi?.billing.nextAt ? new Date(pi.billing.nextAt) : null; return d && !isNaN(d.getTime()) ? `${d.getMonth() + 1}월 ${d.getDate()}일` : '' })()
  const recurringOn = !!pi?.billing.active
  const choiceLabel = (c: 'extend' | 'cash') => c === 'extend' ? `결제 없이 1개월 추가 이용 + 커피 쿠폰 ${couponText}` : `현금으로 ${refund.toLocaleString()}원 환급`
  const askRefund = async () => {
    if (!pi || !reqId || req === 'sending') return
    setAskOpen(false)
    setReq('sending')
    const at = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
    try {
      // 테스트는 누를 때마다 새 문서(서버가 새로 생긴 문서만 메일을 보냄)
      const docId = testMode ? `test_${auth.currentUser?.uid || 'op'}_${Date.now()}` : reqId
      await setDoc(doc(db, 'refundRequests', docId), {
        ...(testMode ? { test: true } : {}),
        ownerId: ownerId || auth.currentUser?.uid || '', slug, churchName, planName: pi.billing.planName, amount: pi.billing.amount, refund,
        cycleStartedAt: pi.billing.startedAt || '', requestedBy: auth.currentUser?.uid || '',
        payments: treeItems(pi).map((p) => ({ id: p.id, orderName: p.orderName, paidAt: p.paidAt, paid: p.paid })),
        choice, choiceLabel: choiceLabel(choice),
        recurringActive: recurringOn, nextBillingAt: pi.billing.nextAt || '', nextBillingText: nextText,
        status: 'requested', requestedAt: serverTimestamp(), requestedAtText: at,
      })
      if (testMode) { setReq('none'); alert(`[테스트] "${choiceLabel(choice)}"(으)로 요청을 보냈어요. 서버 함수가 배포돼 있으면 곧 메일이 와요.`); return }
      setReq({ status: 'requested', at, choiceLabel: choiceLabel(choice), choice, nextText })
    } catch {
      setReq('none')
      alert('환급 요청을 보내지 못했어요. 잠시 후 다시 시도해 주세요.')
    }
  }
  return (
    <>
      {/* 12칸 완성 → 환급 요청하기 / 요청한 뒤엔 접수 표시 */}
      {(
        typeof req === 'object' ? (
          <div style={{ marginTop: 10, borderRadius: 12, border: '1px solid #DDD6FE', background: 'white', padding: '12px 14px', fontSize: 13, lineHeight: 1.6, color: THEME.text, wordBreak: 'keep-all' }}>
            {req.status === 'done'
              ? <><b style={{ color: '#7C3AED' }}>✅ 환급을 마쳤어요.</b> 함께해 주셔서 감사합니다.</>
              : <><b style={{ color: '#7C3AED' }}>환급 요청 완료</b> · 스테이온이 확인한 뒤 처리해 드려요.{req.choiceLabel && <span style={{ display: 'block', fontSize: 12.5, marginTop: 2 }}>고른 방식: <b>{req.choiceLabel}</b></span>}{req.choice === 'extend' && <span style={{ display: 'block', fontSize: 12, marginTop: 2, color: '#6D28D9' }}>{req.nextText ? `${req.nextText} 결제는` : '다음 달 결제는'} 평소처럼 나가고, 스테이온이 확인한 뒤 취소해 드려요.</span>}{req.at && <span style={{ display: 'block', fontSize: 11.5, color: THEME.muted }}>요청한 날: {req.at}</span>}</>}
          </div>
        ) : (
          <button type="button" onClick={() => { setChoice('extend'); setAskOpen(true) }} disabled={req !== 'none'}
            style={{ marginTop: 10, width: '100%', border: 'none', borderRadius: 12, padding: '14px 16px', fontFamily: 'inherit', fontSize: 15, fontWeight: 800, color: 'white',
              background: 'linear-gradient(135deg, #7C3AED, #6D28D9)', boxShadow: '0 6px 16px rgba(124,58,237,0.25)', cursor: req === 'none' ? 'pointer' : 'default', opacity: req === 'none' ? 1 : 0.6 }}>
            {req === 'sending' ? '요청 보내는 중…' : req === 'loading' ? '확인 중…' : `🍇 ${refund ? refund.toLocaleString() + '원 ' : ''}환급 요청하기`}
          </button>
        )
      )}
      {/* 환급 방식 고르기 — 화면 가운데 팝업 */}
      <Dialog open={askOpen} onOpenChange={setAskOpen}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-[1.75rem] border-0 p-6 sm:p-7">
          <div className="flex flex-col items-center text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-3xl">🍇</span>
            <DialogTitle className="mt-3 text-[20px] font-black text-slate-900">환급을 요청할까요?</DialogTitle>
            <DialogDescription className="mt-1 text-[13.5px] text-slate-500 break-keep">1년 동안 함께해 주셔서 감사해요. 원하시는 방식을 골라 주세요.</DialogDescription>
          </div>
          <div role="radiogroup" className="mt-5 flex flex-col gap-2.5">
            {([
              ['extend', '☕', '결제 없이 1개월 더 이용', `+ 커피 쿠폰 ${couponText}도 함께 드려요`],
              ['cash', '💵', `현금으로 ${refund.toLocaleString()}원 환급`, '결제 일부 취소 또는 계좌 입금으로 돌려드려요'],
            ] as const).map(([k, icon, title, desc]) => {
              const on = choice === k
              return (
                <button key={k} type="button" role="radio" aria-checked={on} onClick={() => setChoice(k)}
                  className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-3.5 text-left transition-all ${on ? 'border-violet-500 bg-violet-50/60 shadow-[0_4px_14px_rgba(124,58,237,0.15)]' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-2xl shadow-sm">{icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15.5px] font-bold text-slate-900 break-keep">{title}</span>
                    <span className="mt-0.5 block text-[12.5px] text-slate-500 break-keep">{desc}</span>
                  </span>
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${on ? 'border-violet-600 bg-violet-600' : 'border-slate-300 bg-white'}`}>
                    {on && <span className="h-2 w-2 rounded-full bg-white" />}
                  </span>
                </button>
              )
            })}
          </div>
          {/* 정기결제 중 + 1개월 추가: 다음 결제는 그대로 나가고 확인 후 취소된다는 안내 */}
          {choice === 'extend' && recurringOn && (
            <p className="mt-3 rounded-xl bg-amber-50 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-amber-800 break-keep animate-in fade-in duration-200">
              정기결제 중이라 다음 결제{nextText ? `(${nextText})` : ''}는 평소처럼 진행돼요. 스테이온이 확인한 뒤 <b>그 달 결제를 취소</b>해 드려요. (카드 내역에 결제와 취소가 함께 보일 수 있어요)
            </p>
          )}
          <div className="mt-5 flex gap-2">
            <button type="button" onClick={() => setAskOpen(false)} className="h-12 flex-1 rounded-xl bg-slate-100 text-[15px] font-bold text-slate-600 hover:bg-slate-200">취소</button>
            <button type="button" onClick={askRefund} className="h-12 flex-[2] rounded-xl bg-violet-600 text-[15px] font-bold text-white shadow-[0_6px_16px_rgba(124,58,237,0.3)] hover:bg-violet-700">이걸로 요청하기</button>
          </div>
          <p className="mt-3 text-center text-[11.5px] text-slate-400 break-keep">스테이온이 결제 내역을 확인한 뒤 처리해 드려요.</p>
        </DialogContent>
      </Dialog>
    </>
  )
}
