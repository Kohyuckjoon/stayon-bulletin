import { useEffect, useState } from 'react'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../../firebase'
import { cycleItems, cycleCells, isHomepagePlan, readTestPlan, buildTestPayInfo, TEST_PLAN_LABEL, RefundRequestBox, type PayInfo, type PayItem } from './PaymentTree'

// 주보 플랫폼 1년 완납 "물이 포도주로"(2026-11-25) — 요한복음 2장 가나의 혼인 잔치.
// 돌항아리 6개 × 2칸 = 12칸. 베이직·스탠다드 1개월 결제마다(정기결제·1회 결제 모두) 반 항아리씩 물이 차고,
// 12번째에 6개 항아리가 포도주로 바뀜 → 1개월 무료 쿠폰.
// 결제는 그대로 진행되고, 13번째 달 결제를 스테이온이 확인 후 환불함(정기결제 데이터는 건드리지 않음).
// 12칸이 처음 차면 refundRequests/jar_{계정}_{정기결제 시작일} 을 한 번 만들어 운영자 메일(onRefundRequest)로 알림.
// 테스트: 운영자 계정 + 주소 ?refundTest=basic | standard

const C = { navy: '#1B3A6B', text: '#111827', muted: '#6B7280', border: '#E5E7EB', water: '#3B82F6', waterDeep: '#2563EB', wine: '#9F1239', wineDeep: '#701A35' }

// 칸으로 세는 결제(2026-11-25 규칙 확정): 정기결제만, 지금 정기결제를 시작한 날 이후(요금제를 바꾸면 처음부터).
// 베이직·스탠다드·셀프형·관리형 모두 — 셀프형·관리형은 홈페이지 나무와 똑같이 참(PaymentTree.cycleItems)
export function jarItems(info: PayInfo): PayItem[] { return cycleItems(info) }
// 이 계정의 정기결제가 주보 요금제(베이직·스탠다드)인지
export const isBulletinPlan = (info: PayInfo) => !isHomepagePlan(info)

// ── 그림: 가나의 혼인 잔치 돌항아리(2026-11-25 다시 그림) ─────────────────────────────
// 곡선 실루엣 + 부드러운 빛·그림자(그라데이션). 넓은 입구, 불룩한 배, 허리에 두 줄 홈.
// 뒷줄 상아색 3개 · 앞줄 회청색 3개(= 6항아리 × 2칸 = 12칸). 따뜻한 벽·창으로 드는 빛·흙바닥.
// 돌이라 속이 안 보이니, 찬 만큼 몸통 아래부터 물빛(포도주빛)이 스며 오르고, 가득 차면 입구에 수면이 보임
type Tone = { light: string; mid: string; dark: string; rim: string; rimDark: string; mouth: string }
const STONE: Tone = { light: '#DCE3E8', mid: '#AEBAC2', dark: '#76858F', rim: '#EEF2F4', rimDark: '#93A0A8', mouth: '#36424B' }
const CREAM: Tone = { light: '#FBF5EC', mid: '#E6D7C2', dark: '#BBA486', rim: '#FFFBF5', rimDark: '#CBB79B', mouth: '#5E4C38' }

function Jar({ cx, by, s, tone, level, wine, order, uid }: { cx: number; by: number; s: number; tone: Tone; level: number; wine: boolean; order: number; uid: string }) {
  const t = by - 100 * s
  const X = (dx: number) => (cx + dx * s).toFixed(1)
  const Y = (dy: number) => (t + dy * s).toFixed(1)
  // 몸통: 입구 아래 목 → 둥근 어깨 → 가장 넓은 배 → 둥글게 모이는 바닥
  const body = `M${X(-23)} ${Y(5)} C${X(-23)} ${Y(14)} ${X(-42)} ${Y(22)} ${X(-42)} ${Y(52)} C${X(-42)} ${Y(80)} ${X(-33)} ${Y(97)} ${X(-22)} ${Y(100)} L${X(22)} ${Y(100)} C${X(33)} ${Y(97)} ${X(42)} ${Y(80)} ${X(42)} ${Y(52)} C${X(42)} ${Y(22)} ${X(23)} ${Y(14)} ${X(23)} ${Y(5)} Z`
  const liquidTop = t + (100 - 95 * level) * s
  const g = `jg-${uid}`
  const tintTop = wine ? '#A3133B' : '#7DB8F5'
  const tintBot = wine ? '#5A0E25' : '#2F6FD6'
  const delay = wine ? `${order * 0.16}s` : '0s'
  const full = level >= 1
  return (
    <g>
      <defs>
        <linearGradient id={`${g}-b`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor={tone.light} /><stop offset="0.42" stopColor={tone.mid} /><stop offset="1" stopColor={tone.dark} />
        </linearGradient>
        <radialGradient id={`${g}-h`} cx="0.32" cy="0.38" r="0.45">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${g}-l`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={tintTop} style={{ transition: `stop-color .9s ease ${delay}` }} />
          <stop offset="1" stopColor={tintBot} style={{ transition: `stop-color .9s ease ${delay}` }} />
        </linearGradient>
        <radialGradient id={`${g}-m`} cx="0.5" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#000" stopOpacity="0.75" /><stop offset="1" stopColor={tone.mouth} />
        </radialGradient>
        <clipPath id={`${g}-c`}><path d={body} /></clipPath>
      </defs>
      {/* 바닥 그림자 */}
      <ellipse cx={cx} cy={by + 1.5 * s} rx={40 * s} ry={6 * s} fill="#5B2E1F" opacity="0.22" />
      {/* 몸통 + 빛 */}
      <path d={body} fill={`url(#${g}-b)`} />
      <g clipPath={`url(#${g}-c)`}>
        {/* 물빛 · 포도주빛(아래부터 찬 만큼, 돌 무늬와 섞이게 곱하기) */}
        <rect x={Number(X(-44))} y={liquidTop} width={88 * s} height={by - liquidTop + 2} fill={`url(#${g}-l)`}
          opacity={wine ? 0.9 : 0.62} style={{ mixBlendMode: 'multiply', transition: `y .5s ease, height .5s ease, opacity .9s ease ${delay}` }} />
        {level > 0 && !full && <path d={`M${X(-44)} ${liquidTop} Q${cx} ${liquidTop + 7 * s} ${X(44)} ${liquidTop}`} stroke="#fff" strokeOpacity="0.7" strokeWidth={1.6 * s} fill="none" />}
        <ellipse cx={Number(X(-14))} cy={Number(Y(46))} rx={18 * s} ry={34 * s} fill={`url(#${g}-h)`} />
        {/* 허리 두 줄 홈 */}
        <path d={`M${X(-41)} ${Y(36)} Q${cx} ${Y(45)} ${X(41)} ${Y(36)}`} stroke={tone.dark} strokeOpacity="0.45" strokeWidth={1.4 * s} fill="none" />
        <path d={`M${X(-41)} ${Y(37.6)} Q${cx} ${Y(46.6)} ${X(41)} ${Y(37.6)}`} stroke="#fff" strokeOpacity="0.4" strokeWidth={0.9 * s} fill="none" />
        <path d={`M${X(-42)} ${Y(43)} Q${cx} ${Y(52)} ${X(42)} ${Y(43)}`} stroke={tone.dark} strokeOpacity="0.35" strokeWidth={1.2 * s} fill="none" />
        {/* 오른쪽 가장자리 반사광 */}
        <path d={`M${X(36)} ${Y(30)} C${X(40)} ${Y(50)} ${X(39)} ${Y(72)} ${X(30)} ${Y(92)}`} stroke="#fff" strokeOpacity="0.18" strokeWidth={2 * s} fill="none" />
      </g>
      {/* 입구: 두께 있는 테두리 + 안쪽(가득 차면 수면) */}
      <ellipse cx={cx} cy={Number(Y(7))} rx={27 * s} ry={7.5 * s} fill={tone.rimDark} />
      <ellipse cx={cx} cy={Number(Y(4.5))} rx={27 * s} ry={7.5 * s} fill={tone.rim} />
      <ellipse cx={cx} cy={Number(Y(5))} rx={21.5 * s} ry={5.2 * s} fill={full ? `url(#${g}-l)` : `url(#${g}-m)`} />
      {full && <ellipse cx={Number(X(-6))} cy={Number(Y(4))} rx={9 * s} ry={1.6 * s} fill="#fff" opacity="0.55" />}
    </g>
  )
}

// 반짝임(네 꼭지 별)
const Star = ({ x, y, r, d }: { x: number; y: number; r: number; d: number }) => (
  <path d={`M${x} ${y - r} Q${x} ${y} ${x + r} ${y} Q${x} ${y} ${x} ${y + r} Q${x} ${y} ${x - r} ${y} Q${x} ${y} ${x} ${y - r} Z`} fill="#FFF7D6"
    style={{ animation: `jarSparkle 1.8s ease-in-out ${d}s infinite`, opacity: 0, transformOrigin: `${x}px ${y}px`, transformBox: 'view-box' } as React.CSSProperties} />
)

// 배경 + 항아리 6개. shown = 찬 칸(0~12). 순서: 뒷줄 왼→오, 그다음 앞줄 왼→오(칸 2개씩)
export function JarScene({ shown, wine, replay }: { shown: number; wine: boolean; replay: number }) {
  const lv = (i: number) => Math.max(0, Math.min(2, shown - i * 2)) / 2
  const back = [72, 182, 292], front = [114, 224, 334]
  const k = `s${replay}`
  return (
    // 세로를 넉넉히(2026-11-25): 위쪽 벽을 30 더 보여 줌(viewBox y -30 ~ 210)
    <svg viewBox="0 -30 380 240" style={{ display: 'block', width: '100%', borderRadius: 16 }} role="img"
      aria-label={wine ? '여섯 돌항아리의 물이 포도주로 변함' : `12번 중 ${shown}번 채움`}>
      <defs>
        <linearGradient id={`${k}-wall`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#EFE3D3" /><stop offset="1" stopColor="#DCC9B3" /></linearGradient>
        <linearGradient id={`${k}-floor`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#C99378" /><stop offset="1" stopColor="#A86B55" /></linearGradient>
        <linearGradient id={`${k}-door`} x1="0" x2="1" y1="0" y2="0"><stop offset="0" stopColor="#6E4B37" /><stop offset="1" stopColor="#8E6A52" /></linearGradient>
        <linearGradient id={`${k}-beam`} x1="1" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#FFFBEF" stopOpacity="0.55" /><stop offset="1" stopColor="#FFFBEF" stopOpacity="0" /></linearGradient>
        <radialGradient id={`${k}-vig`} cx="0.5" cy="0.45" r="0.75"><stop offset="0.6" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#3B1F12" stopOpacity="0.22" /></radialGradient>
      </defs>
      {/* 벽 · 아치 문 · 창으로 드는 빛 */}
      <rect y="-30" width="380" height="240" fill={`url(#${k}-wall)`} />
      <path d="M8 152 V58 Q8 22 38 22 Q68 22 68 58 V152 Z" fill={`url(#${k}-door)`} />
      <path d="M8 152 V58 Q8 22 38 22 Q68 22 68 58 V152" fill="none" stroke="#F4E9DA" strokeWidth="4" />
      <rect x="292" y="18" width="46" height="34" rx="17" fill="#FFF8E8" opacity="0.9" />
      <line x1="315" y1="18" x2="315" y2="52" stroke="#DCC9B3" strokeWidth="2" />
      <polygon points="292,40 338,40 300,200 150,200" fill={`url(#${k}-beam)`} />
      {[[110, 30], [205, 20], [250, 62], [160, 74]].map(([x, y], i) => <rect key={i} x={x} y={y} width="24" height="8" rx="2" fill="#D3BEA6" opacity="0.7" />)}
      {/* 흙바닥 */}
      <path d="M0 150 Q95 143 190 148 T380 146 V210 H0 Z" fill={`url(#${k}-floor)`} />
      {back.map((x, i) => <Jar key={`b${i}`} cx={x} by={156} s={0.84} tone={CREAM} level={lv(i)} wine={wine} order={i} uid={`b${i}-${replay}`} />)}
      {front.map((x, i) => <Jar key={`f${i}`} cx={x} by={192} s={1} tone={STONE} level={lv(i + 3)} wine={wine} order={i + 3} uid={`f${i}-${replay}`} />)}
      <rect y="-30" width="380" height="240" fill={`url(#${k}-vig)`} pointerEvents="none" />
      {/* 포도주로 변하면 온 장면이 살짝 붉게 물들고 별이 반짝임 */}
      <rect y="-30" width="380" height="240" fill="#FB7185" opacity={wine ? 0.08 : 0} style={{ transition: 'opacity 1.2s ease 1s' }} pointerEvents="none" />
      {wine && [[96, 40, 6], [180, 52, 4.5], [246, 34, 6], [338, 84, 5], [140, 92, 4], [290, 104, 4.5]].map(([x, y, r], i) => <Star key={`${replay}-${i}`} x={x} y={y} r={r} d={1.1 + i * 0.17} />)}
    </svg>
  )
}

export function WineJars({ info: realInfo, ownerId, churchName }: { info: PayInfo | null | 'error'; ownerId: string | null; churchName: string }) {
  // 운영자 테스트: ?refundTest=basic|standard|pro|lite|max
  const testParam = readTestPlan()
  const testMode = !!testParam
  const testInfo: PayInfo | null = testParam ? buildTestPayInfo(testParam) : null
  const pi: PayInfo | null = testInfo || (realInfo && realInfo !== 'error' ? realInfo : null)
  const cells = pi ? cycleCells(pi) : 0
  // 셀프형·관리형: 보상은 홈페이지 나무와 같은 요청(현금 환급 / 1개월 + 커피 중 하나, 1년에 한 번)
  const homepagePlan = !!pi && isHomepagePlan(pi)
  const done = cells >= 12

  // 완성 모습 보기: 0칸부터 0.35초마다 반 항아리씩 → 12칸에서 포도주로
  const [preview, setPreview] = useState(false)
  const [replay, setReplay] = useState(0)
  const [shown, setShown] = useState(0)
  useEffect(() => {
    if (!preview) { const t = setTimeout(() => setShown(done ? 12 : cells), 120); return () => clearTimeout(t) }
    setShown(0)
    let n = 0
    const iv = setInterval(() => { n += 1; setShown(n); if (n >= 12) clearInterval(iv) }, 350)
    return () => clearInterval(iv)
  }, [cells, done, preview, replay])
  const wine = shown >= 12

  // 다음 결제일(정기결제 중이면 13번째 달 결제가 평소대로 나감 → 스테이온이 환불)
  const nextText = (() => { const d = pi?.billing.nextAt ? new Date(pi.billing.nextAt) : null; return d && !isNaN(d.getTime()) ? `${d.getMonth() + 1}월 ${d.getDate()}일` : '' })()

  // 12칸이 처음 찼을 때 운영자에게 알림(한 주기에 한 번). 테스트는 버튼으로만 보냄
  const cycle = pi ? (pi.billing.startedAt || '').slice(0, 10) || 'cycle' : ''
  const [notified, setNotified] = useState<'idle' | 'sent'>('idle')
  const sendCoupon = async (test: boolean) => {
    if (!pi || !ownerId) return
    const id = test ? `test_jar_${auth.currentUser?.uid || 'op'}_${Date.now()}` : `jar_${ownerId}_${cycle}`
    await setDoc(doc(db, 'refundRequests', id), {
      ...(test ? { test: true } : {}),
      kind: 'jarCoupon', ownerId, churchName, planName: pi.billing.planName, amount: pi.billing.amount, refund: 0,
      choice: 'extend', choiceLabel: '1개월 무료 쿠폰(주보 플랫폼 1년 완납)',
      cycleStartedAt: pi.billing.startedAt || '', requestedBy: auth.currentUser?.uid || '',
      recurringActive: !!pi.billing.active, nextBillingAt: pi.billing.nextAt || '', nextBillingText: nextText,
      payments: jarItems(pi).map((p) => ({ id: p.id, orderName: p.orderName, paidAt: p.paidAt, paid: p.paid })),
      status: 'requested', requestedAt: serverTimestamp(), requestedAtText: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
    })
  }
  useEffect(() => {
    // 1개월 무료 쿠폰 자동 지급은 베이직·스탠다드만(셀프형·관리형은 아래 환급 요청으로)
    // 정기결제를 해지한 교회는 혜택 없음(2026-11-25) — 지금도 정기결제 중일 때만 쿠폰 알림
    if (!done || testMode || !ownerId || !cycle || !pi || homepagePlan || !pi.billing.active) return
    const ref = doc(db, 'refundRequests', `jar_${ownerId}_${cycle}`)
    getDoc(ref).then((d) => { if (!d.exists()) return sendCoupon(false) }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, testMode, ownerId, cycle])

  return (
    <div style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 16, padding: '18px 20px 20px', minWidth: 0 }}>
      <style>{'@keyframes jarWave{from{transform:translateX(0)}to{transform:translateX(32px)}}@keyframes jarSparkle{0%,100%{opacity:0;transform:scale(.6)}50%{opacity:1;transform:scale(1)}}'}</style>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <p style={{ fontSize: 14, fontWeight: 800, color: C.navy }}>
          1년 완납 · 물이 포도주로
          {testMode && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 800, color: '#B45309', background: '#FEF3C7', borderRadius: 999, padding: '2px 8px' }}>테스트 모드 · {TEST_PLAN_LABEL[testParam]}</span>}
        </p>
        <p style={{ fontSize: 13, fontWeight: 800, color: done ? C.wine : C.waterDeep }}>{cells} / 12번</p>
      </div>

      <div style={{ position: 'relative' }}>
        {preview && !done && (
          <span style={{ position: 'absolute', top: 18, zIndex: 1, left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap', fontSize: 11.5, fontWeight: 800, borderRadius: 999, padding: '4px 10px',
            color: wine ? C.wine : '#1D4ED8', background: wine ? '#FFF1F2' : '#EFF6FF', border: `1px solid ${wine ? '#FECDD3' : '#BFDBFE'}` }}>
            {wine ? '🍷 12번을 다 채우면 포도주로 변해요' : shown === 0 ? '결제할 때마다 물이 반 항아리씩 차요' : `💧 ${shown}번째 결제`}
          </span>
        )}
        <div style={{ maxWidth: 520, margin: "10px auto 0" }}><JarScene shown={shown} wine={wine} replay={replay} /></div>
      </div>

      {pi && !done && (
        <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
          <button type="button" onClick={() => setPreview((v) => !v)}
            style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 800, cursor: 'pointer', borderRadius: 999, padding: '8px 16px',
              border: `1px solid ${preview ? C.border : '#FECDD3'}`, background: preview ? 'white' : '#FFF1F2', color: preview ? C.text : C.wine }}>
            {preview ? '← 지금 우리 항아리 보기' : '🍷 완성 모습 보기'}
          </button>
          {preview && wine && (
            <button type="button" onClick={() => setReplay((r) => r + 1)}
              style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 800, cursor: 'pointer', borderRadius: 999, padding: '8px 14px', border: '1px solid #FECDD3', background: '#FFF1F2', color: C.wine }}>↻ 다시 보기</button>
          )}
        </div>
      )}

      {/* 안내 / 완성 메시지 */}
      {done ? (
        <div className="animate-in fade-in zoom-in-95 duration-700" style={{ marginTop: 12, borderRadius: 14, padding: '16px 16px', textAlign: 'center', wordBreak: 'keep-all',
          background: 'linear-gradient(160deg, #FFF1F2, #FCE7F3)', border: '1px solid #FECDD3' }}>
          <p style={{ fontSize: 16, fontWeight: 900, color: C.wineDeep }}>🍷 1년 결제해 주셔서 감사합니다!</p>
          {/* 정기결제를 해지했으면 혜택 없음 — 다시 시작하면 처음부터 */}
          {!pi?.billing.active ? (
            <p style={{ marginTop: 4, fontSize: 13.5, color: C.text, lineHeight: 1.6 }}>
              정기결제를 해지해서 이번 1년 완납 혜택은 드리지 않아요.<br />
              <span style={{ color: C.muted, fontSize: 12.5 }}>다시 정기결제를 시작하면 처음부터 채워요.</span>
            </p>
          ) : homepagePlan ? (
            // 셀프형·관리형: 홈페이지 나무와 같은 보상 요청(어느 화면에서 요청해도 1년에 한 번)
            <div style={{ marginTop: 6, textAlign: 'left' }}>
              <p style={{ fontSize: 13, color: C.text, lineHeight: 1.6, textAlign: 'center' }}>아래에서 받으실 혜택을 골라 요청해 주세요.</p>
              {ownerId && pi && <RefundRequestBox pi={pi} ownerId={ownerId} slug="" churchName={churchName} testMode={testMode} />}
            </div>
          ) : (
          <p style={{ marginTop: 4, fontSize: 13.5, color: C.text, lineHeight: 1.6 }}>
            <b>1개월 무료 쿠폰</b>이 지급되었습니다.<br />
            {nextText ? `${nextText} ` : '다음 달 '}정기결제는 평소처럼 진행되고, 스테이온이 확인한 뒤 그 결제를 <b>환불해 드려요.</b>
          </p>
          )}
          {testMode && !homepagePlan && pi?.billing.active && (
            <button type="button" onClick={async () => { await sendCoupon(true); setNotified('sent') }}
              style={{ marginTop: 10, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', borderRadius: 999, padding: '7px 14px', border: '1px solid #FECDD3', background: 'white', color: C.wine }}>
              {notified === 'sent' ? '✓ [테스트] 알림 메일을 보냈어요 (다시 보내기)' : '[테스트] 운영자 알림 메일 보내 보기'}
            </button>
          )}
        </div>
      ) : (
        <div style={{ marginTop: 10, borderRadius: 12, background: '#EFF6FF', padding: '12px 14px', fontSize: 13, lineHeight: 1.6, color: C.text, wordBreak: 'keep-all' }}>
          {realInfo === null && !testMode ? '결제 기록을 확인하고 있어요…'
            : realInfo === 'error' && !testMode ? '결제 기록을 불러오지 못했어요.'
            : <><b>정기결제 1번</b>마다 물이 반 항아리씩 차요. <b>12번</b>을 채우면 물이 포도주로 변하고 {homepagePlan ? <><b style={{ color: C.wine }}>현금 환급 또는 1개월 무료 + 커피 쿠폰</b> 중 하나를</> : <><b style={{ color: C.wine }}>1개월 무료 쿠폰</b>을</>} 드려요.{cells > 0 && <> 앞으로 <b>{12 - cells}번</b> 남았어요.</>}</>}
        </div>
      )}
      <p style={{ marginTop: 8, fontSize: 11, color: C.muted, lineHeight: 1.5, wordBreak: 'keep-all' }}>정기결제 1번 = 반 항아리(1칸). 1회 결제는 해당되지 않아요. 요금제를 바꾸거나 해지 후 다시 정기결제하면 처음부터 다시 채워요. 셀프형·관리형은 홈페이지 편집 화면의 나무와 함께 차고, 혜택은 1년에 한 번이에요.</p>
    </div>
  )
}
