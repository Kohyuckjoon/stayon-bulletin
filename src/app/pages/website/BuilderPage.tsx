import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { Timestamp, doc, getDoc } from 'firebase/firestore'
import { useNavigate } from 'react-router'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { auth, storage, db } from '../../../firebase'
import { getExpiryInfo, getPlanTierMeta, type ExpiryInfo } from '../../../utils/subscriptionTier'
import { getChurchSite, getChurchSitesByOwner, createChurchSite, updateChurchSite, publishChurchSite, extendChurchSiteAccess, extractYoutubeId, MENU_ITEMS as menuItems, ChurchSite } from '../../../utils/churchSite'
import { checkSlugFormat, isSlugTaken, confirmPermanentAddress } from '../../../utils/slugValidation'
import { DEFAULT_DENOMINATION, NO_DENOMINATION, resolveDenomination, hasDenominationBranch } from '../../../utils/denominations'
import { fetchOwnerData, builderDefaultsFromBulletin, BuilderDefaults } from '../../../utils/churchSiteContent'
import { isOperatorEmail } from '../../../utils/operator'
import { DenominationPicker } from '../../components/DenominationPicker'
import { DatePickerField, TypeableDateField } from '../../components/DatePickerField'
import { RolePicker } from '../../components/RolePicker'
import { HOME_CARD_PRESETS, CHURCH_TOKEN, HomeCardText } from '../../../utils/homeCards'
import { WebsiteRenderer } from './WebsiteRenderer'
import { PaperJuboEditor } from './paperJubo/PaperJuboEditor'
import type { PaperJubo } from './paperJubo/types'
import { BANNER_PAGES, BANNER_PRESETS, defaultBannerPhoto, resolveBannerColors, bannerTextIsDark, cropToBannerBlob, type BannerMode } from '../../../utils/pageBanners'
import { syncDate, siteNewsLines, cleanSermon, dotDate, findBulletinTargets, applyBulletinTarget, BulletinSyncTarget } from '../../../utils/weeklySync'

// 미리보기 패널 안에서 실제 배포 화면(WebsiteRenderer)을 데스크톱 폭(1280px) 기준으로 그린 뒤
// 사이드바 폭에 맞춰 축소 표시함. 이렇게 해야 두 화면이 항상 100% 동일하게 유지됨(별도로 손으로
// 그린 미리보기 마크업은 WebsiteRenderer 디자인이 바뀔 때마다 매번 따로 고쳐줘야 해서 계속 어긋났었음)
const PREVIEW_WIDTH = 1280

const SITE_DOMAIN_SUFFIX = '.stayon-platform.com'
const GALLERY_MAX_IMAGES = 10
const ALBUM_MAX_PHOTOS = 50
interface AlbumItem { id: string; title: string; date: string; photos: string[] }
type WeeklySermon = { title: string; scripture: string; preacher: string; date: string }
const EMPTY_WEEKLY: WeeklySermon = { title: '', scripture: '', preacher: '', date: '' }
const EMPTY_HOME_CARDS: HomeCardText[] = [0, 1, 2, 3].map(() => ({ title: '', desc: '', hidden: false }))

// "홈 화면" 탭: 메인 바로가기 카드 4개 문구. 기본 문구 중 고르거나 "기타(직접 입력)".
// 목록에는 {교회} 대신 지금 교회 이름을 넣어 보여 주고, 저장은 {교회}로 해서 교회 이름을 바꿔도 따라가게
function HomeCardsEditor({ value, onChange, churchName }: { value: HomeCardText[]; onChange: (v: HomeCardText[]) => void; churchName: string }) {
  const show = (t: string) => t.split(CHURCH_TOKEN).join(churchName)
  const store = (t: string) => (churchName ? t.split(churchName).join(CHURCH_TOKEN) : t)
  const set = (i: number, k: 'title' | 'desc', v: string) => onChange(value.map((c, j) => (j === i ? { ...c, [k]: store(v) } : c)))
  // ON/OFF 토글(2026-11-19): OFF면 홈페이지에 그 카드를 아예 안 보여 줌(예: 유튜브가 없는 교회)
  const toggle = (i: number) => onChange(value.map((c, j) => (j === i ? { ...c, hidden: !c.hidden } : c)))
  return (
    <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${THEME.border}`, padding: '28px' }}>
      <h3 style={{ fontWeight: 700, color: THEME.navy, marginBottom: 6, fontSize: 16 }}>메인 바로가기 카드 문구</h3>
      <p style={{ color: THEME.muted, fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>메인 사진 아래 카드 4개(처음 오셨나요 · 예배 · 유튜브 · 오시는 길)의 제목과 설명이에요. 기본 문구 중에서 고르거나 <b>기타(직접 입력)</b>로 바꿀 수 있어요. <b>OFF</b>로 두면 홈페이지에 그 카드가 보이지 않아요.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {HOME_CARD_PRESETS.map((p, i) => {
          const cur = value[i] || { title: '', desc: '' }
          const on = !cur.hidden
          return (
            <div key={p.key} style={{ border: `1px solid ${THEME.border}`, borderRadius: 12, padding: 16, background: on ? 'white' : '#F9FAFB' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: on ? 10 : 0 }}>
                <p style={{ fontSize: 12, fontWeight: 800, color: THEME.muted }}>{i + 1}. {p.en}{!on && ' · 홈페이지에 안 보임'}</p>
                <button type="button" role="switch" aria-checked={on} aria-label={`${p.en} 카드 ${on ? '끄기' : '켜기'}`} onClick={() => toggle(i)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: on ? THEME.navy : '#9CA3AF', width: 26, textAlign: 'right' }}>{on ? 'ON' : 'OFF'}</span>
                  <span style={{ position: 'relative', width: 44, height: 26, borderRadius: 999, background: on ? THEME.navy : '#D1D5DB', transition: 'background .2s' }}>
                    <span style={{ position: 'absolute', top: 3, left: on ? 21 : 3, width: 20, height: 20, borderRadius: 999, background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,.25)', transition: 'left .2s' }} />
                  </span>
                </button>
              </div>
              {on && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                <RolePicker label="제목" options={p.titles.map(show)} value={show(cur.title || p.titles[0])} onChange={(v) => set(i, 'title', v)} />
                <RolePicker label="설명" options={p.descs.map(show)} value={show(cur.desc || p.descs[0])} onChange={(v) => set(i, 'desc', v)} />
              </div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// 소식 한 건(발행 날짜 하나)에 1번·2번… 여러 소식을 번호로. 예전 데이터(title/content 한 개)도 그대로 읽음
type NewsLine = { title: string; content: string }
const newsLines = (n: NewsItem): NewsLine[] =>
  (Array.isArray(n.items) && n.items.length ? n.items : [{ title: n.title || '', content: n.content || '' }])

// 번호 소식 입력칸(새 소식 쓰기·수정 공통): 1번 소식 / 2번 소식 … + "소식 추가"
// 전체 안내(2026-11-21): 1번·2번 소식 위에 번호 없이 보이는 안내 한 단락(ex. "처음 오신 분들을 환영합니다…").
// 비어 있으면 "+ 전체 안내 추가" 버튼만, 누르면 입력칸이 열림
// 굵게(2026-11-21): 글자를 고르고 [B 굵게]를 누르면 **글자** 로 감싸서 홈페이지에 굵게 보임(한 번 더 누르면 풀림)
function NewsNoticeEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(!!value)
  const ta = useRef<HTMLTextAreaElement>(null)
  const toggleBold = () => {
    const el = ta.current
    if (!el) return
    const a = el.selectionStart, b = el.selectionEnd
    if (a === b) { alert('굵게 할 글자를 먼저 마우스로 골라 주세요.'); el.focus(); return }
    const sel = value.slice(a, b)
    let next: string, na: number, nb: number
    if (value.slice(a - 2, a) === '**' && value.slice(b, b + 2) === '**') { // 이미 굵게 → 풀기
      next = value.slice(0, a - 2) + sel + value.slice(b + 2); na = a - 2; nb = b - 2
    } else if (/^\*\*[\s\S]+\*\*$/.test(sel)) { // **까지 같이 고른 경우 → 풀기
      next = value.slice(0, a) + sel.slice(2, -2) + value.slice(b); na = a; nb = b - 4
    } else {
      next = value.slice(0, a) + '**' + sel + '**' + value.slice(b); na = a + 2; nb = b + 2
    }
    onChange(next)
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(na, nb) })
  }
  useEffect(() => { if (value) setOpen(true) }, [value])
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        style={{ display: 'block', marginBottom: 10, background: 'none', border: '1px dashed #9CA3AF', borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 700, color: '#374151', cursor: 'pointer' }}>
        + 전체 안내 추가 <span style={{ fontWeight: 500, color: THEME.muted }}>(번호 없이 맨 위에 보여요)</span>
      </button>
    )
  }
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'white', border: `1px solid ${THEME.border}`, borderRadius: 12, padding: 12, marginBottom: 10 }}>
      <span style={{ flexShrink: 0, height: 28, padding: '0 10px', borderRadius: 999, background: '#E8F3FF', color: '#3182F6', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', marginTop: 2 }}>전체 안내</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={toggleBold} title="고른 글자 굵게"
            style={{ height: 28, padding: '0 10px', borderRadius: 8, border: `1px solid ${THEME.border}`, background: 'white', fontSize: 13, fontWeight: 900, color: '#111827', cursor: 'pointer' }}>B <span style={{ fontWeight: 600 }}>굵게</span></button>
          <span style={{ fontSize: 12, color: THEME.muted }}>글자를 고르고 B를 누르면 홈페이지에 굵게 보여요 (**글자**)</span>
        </div>
        <textarea ref={ta} value={value} onChange={(e) => onChange(e.target.value)} rows={2} autoFocus={!value}
          placeholder="번호 없이 맨 위에 보이는 안내 (ex. 처음 오신 분들을 진심으로 환영합니다…)"
          style={{ width: '100%', border: '1px solid #D1D5DB', borderRadius: 10, padding: '10px 12px', fontSize: 13.5, fontFamily: 'inherit', outline: 'none', resize: 'vertical' }} />
      </div>
      <button type="button" onClick={() => { onChange(''); setOpen(false) }} aria-label="전체 안내 빼기"
        style={{ flexShrink: 0, width: 26, background: 'none', border: 'none', color: '#9CA3AF', fontSize: 18, cursor: 'pointer', lineHeight: 1, marginTop: 4 }}>×</button>
    </div>
  )
}

// 순서 바꾸기(2026-11-21): 오른쪽 ▲▼로 한 칸씩, 또는 왼쪽 손잡이(⠿)를 마우스로 잡고 끌어서 원하는 자리에 놓기.
// 글 쓰다가 잘못 끌리지 않게 손잡이를 눌렀을 때만 끌 수 있음
function NewsLinesEditor({ lines, onChange }: { lines: NewsLine[]; onChange: (v: NewsLine[]) => void }) {
  const set = (i: number, k: keyof NewsLine, v: string) => onChange(lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)))
  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= lines.length) return
    const next = [...lines]
    const [x] = next.splice(from, 1)
    next.splice(to, 0, x)
    onChange(next)
  }
  const [armed, setArmed] = useState<number | null>(null) // 손잡이를 누른 칸(이 칸만 끌 수 있음)
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null) // 놓을 자리(0~lines.length, 이 번호 칸 앞)
  const endDrag = () => { setArmed(null); setDragFrom(null); setDropAt(null) }
  // 손잡이를 눌렀다가 끌지 않고 다른 곳에서 손을 떼도 풀어 둠(그 칸 글자를 고를 때 칸 전체가 끌리지 않게)
  useEffect(() => {
    if (armed === null) return
    const up = () => setArmed((a) => (dragFrom === null ? null : a))
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [armed, dragFrom])
  const arrowBtn = (disabled: boolean): React.CSSProperties => ({
    width: 26, height: 22, borderRadius: 6, border: `1px solid ${THEME.border}`, background: 'white', fontSize: 10, lineHeight: 1,
    color: disabled ? '#D1D5DB' : '#4B5563', cursor: disabled ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  })
  const dropLine = (at: number) => dragFrom !== null && dropAt === at && at !== dragFrom && at !== dragFrom + 1
    ? <div style={{ height: 3, borderRadius: 3, background: '#3182F6', margin: '-6px 0' }} /> : null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {lines.map((l, i) => (
        <div key={i} style={{ display: 'contents' }}>
        {dropLine(i)}
        <div
          draggable={armed === i}
          onDragStart={(e) => { setDragFrom(i); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)) }}
          onDragOver={(e) => {
            if (dragFrom === null) return
            e.preventDefault()
            const r = e.currentTarget.getBoundingClientRect()
            setDropAt(e.clientY < r.top + r.height / 2 ? i : i + 1)
          }}
          onDrop={(e) => {
            e.preventDefault()
            if (dragFrom !== null && dropAt !== null) move(dragFrom, dropAt > dragFrom ? dropAt - 1 : dropAt)
            endDrag()
          }}
          onDragEnd={endDrag}
          style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'white', border: `1px solid ${dragFrom === i ? '#3182F6' : THEME.border}`, borderRadius: 12, padding: 12, opacity: dragFrom === i ? 0.45 : 1 }}>
          {lines.length > 1 && (
            <span onMouseDown={() => setArmed(i)} onMouseUp={() => { if (dragFrom === null) setArmed(null) }} title="잡고 끌어서 순서 바꾸기" aria-label="잡고 끌어서 순서 바꾸기"
              style={{ flexShrink: 0, width: 18, height: 28, marginTop: 2, marginRight: -4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', fontSize: 16, cursor: 'grab', userSelect: 'none' }}>⠿</span>
          )}
          <span style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 999, background: THEME.navy, color: 'white', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>{i + 1}</span>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input value={l.title} onChange={(e) => set(i, 'title', e.target.value)} placeholder={`${i + 1}번 소식 제목 (ex. 여름 수련회 안내)`}
              style={{ width: '100%', border: '1px solid #D1D5DB', borderRadius: 10, padding: '10px 12px', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', outline: 'none' }} />
            <textarea value={l.content} onChange={(e) => set(i, 'content', e.target.value)} placeholder="내용 (선택) — 기간·장소 등" rows={2}
              style={{ width: '100%', border: '1px solid #D1D5DB', borderRadius: 10, padding: '10px 12px', fontSize: 13.5, fontFamily: 'inherit', outline: 'none', resize: 'vertical' }} />
          </div>
          {lines.length > 1 && (
            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <button type="button" onClick={() => onChange(lines.filter((_, j) => j !== i))} aria-label="이 소식 빼기"
                style={{ background: 'none', border: 'none', color: '#9CA3AF', fontSize: 18, cursor: 'pointer', lineHeight: 1, marginTop: 4, marginBottom: 4 }}>×</button>
              <button type="button" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label="위로 옮기기" style={arrowBtn(i === 0)}>▲</button>
              <button type="button" disabled={i === lines.length - 1} onClick={() => move(i, i + 1)} aria-label="아래로 옮기기" style={arrowBtn(i === lines.length - 1)}>▼</button>
            </div>
          )}
        </div>
        </div>
      ))}
      {dropLine(lines.length)}
      <button type="button" onClick={() => onChange([...lines, { title: '', content: '' }])}
        style={{ alignSelf: 'flex-start', background: 'none', border: '1px dashed #9CA3AF', borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 700, color: '#374151', cursor: 'pointer' }}>+ {lines.length + 1}번 소식 추가</button>
    </div>
  )
}

// "매주 업데이트" 탭의 교회 소식: 발행 날짜(달력) + 1번·2번… 소식을 쓰고 [소식 등록]하면 목록에 쌓임.
// 아래 표에서 지난 소식을 복사·수정·삭제(10개씩 넘김). 홈페이지에는 저장을 눌러야 반영
function NewsManager({ items: rawItems, onChange }: { items: NewsItem[]; onChange: (v: NewsItem[]) => void }) {
  // id가 없는 소식(예전 데이터)이 섞여 있으면 목록이 겹쳐 그려지는 문제가 있어서, 여기서 항상 서로 다른 id를 붙여 씀
  const seen = new Set<string>()
  const items = rawItems.map((n, i) => {
    let id = n.id || `site-${i}`
    if (seen.has(id)) id = `${id}-${i}`
    seen.add(id)
    return id === n.id ? n : { ...n, id }
  })
  const today = () => new Date().toLocaleDateString('sv-SE')
  const [draftDate, setDraftDate] = useState(today())
  const [draftLines, setDraftLines] = useState<NewsLine[]>([{ title: '', content: '' }])
  const [draftNotice, setDraftNotice] = useState('') // 전체 안내(번호 없음)
  const [editId, setEditId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const showDate = (d: string) => { const m = (d || '').match(/(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})/); return m ? `${m[1]}.${m[2].padStart(2, '0')}.${m[3].padStart(2, '0')}` : '-' }
  const isoDate = (d: string) => (showDate(d) === '-' ? '' : showDate(d).replace(/\./g, '-'))
  const sortKey = (d: string) => showDate(d).replace(/\./g, '')
  const sorted = [...items].sort((a, b) => sortKey(b.date).localeCompare(sortKey(a.date)))
  const PER = 10
  const pages = Math.max(1, Math.ceil(sorted.length / PER))
  const cur = Math.min(page, pages)
  const clean = (ls: NewsLine[]) => ls.map((l) => ({ title: l.title.trim(), content: l.content.trim() })).filter((l) => l.title || l.content)
  const entry = (id: string, date: string, ls: NewsLine[], notice = ''): NewsItem => {
    const c = clean(ls)
    return { id, date, items: c, title: c[0]?.title || '', content: c[0]?.content || '', notice: notice.trim() }
  }
  const add = () => {
    if (!clean(draftLines).length && !draftNotice.trim()) { alert('소식을 한 개 이상 입력해 주세요.'); return }
    if (!draftDate) { alert('발행 날짜를 골라 주세요.'); return }
    onChange([entry(`n${Date.now().toString(36)}`, draftDate, draftLines, draftNotice), ...items])
    setDraftLines([{ title: '', content: '' }])
    setDraftNotice('')
    setDraftDate(today())
    setPage(1)
  }
  const patch = (id: string, p: Partial<{ date: string; lines: NewsLine[]; notice: string }>) => onChange(items.map((n) => {
    if (n.id !== id) return n
    const lines = p.lines ?? newsLines(n)
    return { ...n, date: p.date ?? n.date, items: lines, title: lines[0]?.title || '', content: lines[0]?.content || '', notice: p.notice ?? n.notice ?? '' }
  }))
  const remove = (id: string) => { if (confirm('이 소식을 삭제할까요? (저장해야 홈페이지에 반영돼요)')) onChange(items.filter((n) => n.id !== id)) }
  // 복사: 그 소식(1번·2번…)을 같은 날짜로 똑같이 하나 더 만들어 원래 소식 바로 **위**에 넣음
  // → 새로 생긴 소식이 새 번호(가장 큰 번호, ex. 9건이면 10번)가 되고, 그 줄의 수정 칸이 바로 열림.
  // 화면도 그 위치로 옮겨 주고 잠깐 파란색으로 표시. 날짜는 열린 수정 칸에서 바꾸면 됨
  const [justCopied, setJustCopied] = useState<string | null>(null)
  const copy = (n: NewsItem) => {
    const id = `n${Date.now().toString(36)}`
    const at = items.findIndex((x) => x.id === n.id)
    const next = [...items]
    next.splice(Math.max(0, at), 0, entry(id, isoDate(n.date) || n.date || today(), newsLines(n), n.notice || ''))
    onChange(next)
    setEditId(id)
    setJustCopied(id)
  }
  // 복사한 소식이 있는 페이지로 넘기고 그 줄로 스크롤
  useEffect(() => {
    if (!justCopied) return
    const k = sorted.findIndex((x) => x.id === justCopied)
    if (k >= 0 && Math.floor(k / PER) + 1 !== cur) { setPage(Math.floor(k / PER) + 1); return }
    const el = document.getElementById(`news-row-${justCopied}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const t = setTimeout(() => setJustCopied(null), 1600)
    return () => clearTimeout(t)
  }, [justCopied, cur, sorted.length]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <h3 style={{ fontWeight: 700, color: THEME.navy, marginBottom: 6, fontSize: 16 }}>교회 소식</h3>
      <p style={{ color: THEME.muted, fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>발행 날짜를 고르고 <b>1번·2번…</b> 소식을 적은 뒤 <b>소식 등록</b>을 누르세요. 지난 소식은 아래 목록에 그대로 남아요. 다 하고 나면 위의 <b>저장</b>을 눌러 주세요.</p>
      <div style={{ border: `1px solid ${THEME.border}`, borderRadius: 12, padding: 16, background: '#F9FAFB' }}>
        <p style={{ fontSize: 12, fontWeight: 800, color: THEME.navy, marginBottom: 10 }}>새 소식 쓰기</p>
        <div style={{ maxWidth: 260, marginBottom: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>발행 날짜</label>
          <DatePickerField value={draftDate} onChange={setDraftDate} />
        </div>
        <NewsNoticeEditor value={draftNotice} onChange={setDraftNotice} />
        <NewsLinesEditor lines={draftLines} onChange={setDraftLines} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button type="button" onClick={add} style={{ background: THEME.navy, color: 'white', border: 'none', borderRadius: 10, padding: '10px 18px', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>소식 등록</button>
        </div>
      </div>
      <div style={{ marginTop: 18 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 8 }}>등록된 소식 <span style={{ color: THEME.muted, fontWeight: 500 }}>{items.length}건</span></p>
        {sorted.length === 0 ? (
          <p style={{ fontSize: 13, color: THEME.muted, padding: '16px 0' }}>아직 등록된 소식이 없어요.</p>
        ) : (
          <div style={{ borderTop: '2px solid #111827' }}>
            {sorted.slice((cur - 1) * PER, cur * PER).map((n, idx) => {
              // 번호: 게시판처럼 가장 최근 소식이 가장 큰 번호
              const no = sorted.length - ((cur - 1) * PER + idx)
              const id = n.id || ''
              const open = editId === id
              const ls = newsLines(n)
              return (
                <div key={id} id={`news-row-${id}`} style={{ borderBottom: `1px solid ${THEME.border}`, padding: '12px 4px', background: justCopied === id ? '#EFF6FF' : 'transparent', transition: 'background 0.6s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ width: 32, flexShrink: 0, textAlign: 'center', fontSize: 13, fontWeight: 700, color: THEME.muted, fontVariantNumeric: 'tabular-nums' }}>{no}</span>
                    {/* 제목: "2026. 11. 08 교회 소식" + 아래 작은 글씨로 1번 소식 미리보기 */}
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: '#111827' }}>{showDate(n.date).replace(/\./g, '. ')} 교회 소식</span>
                      <span style={{ display: 'block', marginTop: 2, fontSize: 12.5, color: THEME.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ls[0]?.title || (n.notice || '').replace(/\*\*/g, '') || '(제목 없음)'}{ls.length > 1 && ` 외 ${ls.length - 1}건`}
                      </span>
                    </span>
                    <button type="button" onClick={() => copy(n)} style={{ fontSize: 12, fontWeight: 700, color: '#4B5563', background: 'none', border: 'none', cursor: 'pointer' }}>복사</button>
                    <button type="button" onClick={() => setEditId(open ? null : id)} style={{ fontSize: 12, fontWeight: 700, color: '#2563EB', background: 'none', border: 'none', cursor: 'pointer' }}>{open ? '닫기' : '수정'}</button>
                    <button type="button" onClick={() => remove(id)} style={{ fontSize: 12, fontWeight: 700, color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer' }}>삭제</button>
                  </div>
                  {open && (
                    <div style={{ marginTop: 12, background: '#F9FAFB', borderRadius: 12, padding: 12 }}>
                      <div style={{ maxWidth: 260, marginBottom: 10 }}>
                        <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>발행 날짜</label>
                        <DatePickerField value={isoDate(n.date)} onChange={(v) => patch(id, { date: v })} />
                      </div>
                      <NewsNoticeEditor value={n.notice || ''} onChange={(v) => patch(id, { notice: v })} />
                      <NewsLinesEditor lines={ls} onChange={(v) => patch(id, { lines: v })} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
        {pages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 14 }}>
            {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
              <button key={p} type="button" onClick={() => setPage(p)} style={{ minWidth: 34, height: 34, borderRadius: 8, border: `1px solid ${p === cur ? THEME.navy : THEME.border}`, background: p === cur ? THEME.navy : 'white', color: p === cur ? 'white' : '#4B5563', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{p}</button>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

// ON/OFF 스위치(토스 스타일): 켜면 남색, 끄면 회색
function OnOffSwitch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)}
      style={{ flexShrink: 0, width: 50, height: 30, borderRadius: 999, border: 'none', padding: 3, cursor: 'pointer', background: on ? THEME.navy : '#D1D5DB', transition: 'background 0.2s', display: 'flex', justifyContent: on ? 'flex-end' : 'flex-start' }}>
      <span style={{ width: 24, height: 24, borderRadius: 999, background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
    </button>
  )
}

// "매주 업데이트" 탭의 이번 주 말씀 카드. 주보 플랫폼과 연동 중인 교회는 주보 설교가 먼저 나오므로 안내만 보여 줌
// heading·help를 바꿔 "다음 주 말씀" 카드로도 씀. enabled/onToggle을 주면 제목 오른쪽에 ON/OFF 스위치(끄면 홈페이지 말씀/영상 화면에서 그 카드가 안 보임)
function WeeklySermonCard({ value, onChange, fromBulletin, heading = '이번 주 말씀', help, enabled, onToggle }: {
  value: WeeklySermon; onChange: (v: WeeklySermon) => void; fromBulletin: boolean
  heading?: string; help?: React.ReactNode; enabled?: boolean; onToggle?: (v: boolean) => void
}) {
  const set = (k: keyof WeeklySermon) => (v: string) => onChange({ ...value, [k]: v })
  return (
    <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${THEME.border}`, padding: '28px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 6 }}>
        <h3 style={{ fontWeight: 700, color: THEME.navy, fontSize: 16 }}>{heading}</h3>
        {onToggle && <OnOffSwitch on={!!enabled} onChange={onToggle} />}
      </div>
      <p style={{ color: THEME.muted, fontSize: 13, marginBottom: fromBulletin ? 10 : 20, lineHeight: 1.6 }}>{help ?? <>홈페이지 <b>말씀/영상</b> 화면의 "이번 주 말씀"과 <b>온라인 예배</b> 화면 오른쪽에 나와요. 매주 바꿔 주세요.</>}{onToggle && !enabled && <b style={{ color: '#DC2626' }}> (지금 꺼져 있어서 홈페이지 말씀/영상 화면에 안 보여요)</b>}</p>
      {fromBulletin && (
        <p style={{ fontSize: 12.5, color: '#1E3A8A', background: '#EFF6FF', borderRadius: 8, padding: '8px 10px', marginBottom: 16, lineHeight: 1.5 }}>
          날짜가 같은 주보가 있으면 <b>여기 적은 내용</b>이 홈페이지에 나오고, 저장할 때 <b>주보에도 반영할지</b> 물어봐요. 날짜가 다르면 더 최근 날짜의 설교가 먼저 나와요.
        </p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="설교 제목" placeholder="ex. 하나님 나라" value={value.title} onChange={set('title')} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          <Field label="본문 말씀" placeholder="ex. 마태복음 6:33" value={value.scripture} onChange={set('scripture')} />
          <Field label="설교자" placeholder="ex. 홍길동 목사" value={value.preacher} onChange={set('preacher')} />
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>날짜</label>
            <DatePickerField value={value.date} onChange={set('date')} />
          </div>
        </div>
      </div>
    </div>
  )
}

// "2026년 9월 3일" 형태로 표기
const formatDateKorean = (date: Date) => `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`

const PAYMENT_PLANS = [
  { months: 1 as const, price: 9900, label: '1개월', priceLabel: '9,900원' },
  { months: 12 as const, price: 99000, label: '12개월', priceLabel: '99,000원', badge: '17% 할인' },
]

// 전역 CSS에 --navy/--sky 같은 변수가 실제로 정의되어 있지 않아 텍스트/배경색이 안 보이던 문제를 고치기 위해
// 이 파일 안에서 쓰는 색상은 전역 var(--x) 대신 이 상수로 직접 관리함
const THEME = {
  navy: '#1B3A6B',
  sky: '#3182F6',
  skyLight: '#EFF6FF',
  surface: '#F8FAFC',
  text: '#111827',
  muted: '#6B7280',
  border: '#E5E7EB',
}

interface Props {
  onBack: () => void
}

type WorshipService = { title: string; time: string; place: string; note: string; group: string }
type VisionItem = { title: string; desc: string }
type NewsItem = { id?: string; title: string; date: string; content: string; items?: { title: string; content: string }[]; notice?: string } // notice: 번호 없이 맨 위에 보이는 전체 안내
type PaperSermon = { service: string; title: string; scripture: string; preacher: string }
type PaperNews = { title: string; content: string }
// sermons/news: 자동 분석 후 교회가 확인 화면에서 고른 설교·교회 소식(홈페이지 '설교'·'교회 소식'에 보임)
// fileType: 파일 확장자(pdf·hwp·jpg…) / "images"(사진 여러 장 — images에 순서대로) / "link"(블로그·카페·드라이브 등 링크, fileUrl이 링크)
type PaperBulletin = { id: string; date: string; title: string; fileUrl: string; fileName: string; fileType: string; images?: string[]; sermons?: PaperSermon[]; news?: PaperNews[] }
// 주보 자동 분석 결과(서버 analyzePaperBulletin이 돌려주는 형식)
type PaperAnalysis = {
  sermons: PaperSermon[]
  news: PaperNews[]
  basic: {
    churchName: string; pastorName: string; phone: string; address: string; intro: string
    worshipServices: { group: string; title: string; time: string }[]
    staff: { role: string; name: string }[]
  }
}
type AnalysisReview = {
  bulletinId: string
  result: PaperAnalysis
  sermons: boolean[]
  news: boolean[]
  basic: Record<string, boolean>
}
const ANALYZE_URL = 'https://asia-northeast3-stayonsbplatform.cloudfunctions.net/analyzePaperBulletin'
// 다운로드 주소(…/o/<경로>?alt=media…) → Storage 경로
const storagePathFromUrl = (url: string) => {
  const m = url.match(/\/o\/([^?]+)/)
  return m ? decodeURIComponent(m[1]) : ''
}
// 교회 주보 파일로 받는 형식(한글·워드·PDF·사진). 한글·워드는 브라우저에서 바로 안 열려서 홈페이지에선 내려받기로 제공
const PAPER_BULLETIN_ACCEPT = '.hwp,.hwpx,.doc,.docx,.pdf,.jpg,.jpeg,.png,.webp'
const PAPER_IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp']
type StaffMember = { role: string; name: string; department: string; phone: string; email: string; photoUrl: string }
type LayLeader = { role: string; name: string; department: string; photoUrl: string }
type EduDepartment = { name: string; target: string; time: string; place: string; leader: string; desc: string; photoUrl: string }
// 주일학교/교육부서 메뉴 이름 기본 선택지(그 밖은 기타 직접 입력)
const EDU_MENU_OPTIONS = ['주일학교', '교육부서']
// comments/views는 실제 방문자 반응이 아니라 카드 디자인 상 보여주는 장식용 숫자라, 교회에서 직접 원하는 값을 적어넣는 선택 입력 필드
type Sermon = { title: string; speaker: string; scripture: string; youtubeVideoId: string; date: string; comments: string; views: string }

// 중직자 직분 표시 순서: 시무장로 > 원로장로 > 은퇴장로 > 권사
const LAY_LEADER_ROLES = ['시무장로', '원로장로', '은퇴장로', '권사']

// 예배 구분(그룹)을 따로 안 적은 예배가 속하는 기본 칸 이름. WebsiteRenderer.tsx의 기본값과 동일하게 맞춤
const WORSHIP_DEFAULT_GROUP = '예배 시간'

// AdminEditor.tsx의 사역자 연락처 입력과 동일한 방식: 숫자만 입력받아 000-0000-0000 형태로 자동 하이픈 처리
const formatPhoneInput = (raw: string) => {
  const digits = raw.replace(/[^0-9]/g, '')
  if (digits.length > 7) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`
  if (digits.length > 3) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  return digits
}

// Firestore Timestamp를 "2026.07.28" 형태로 표기
const formatUpdatedDate = (site: ChurchSite) => {
  const ts = site.updatedAt || site.createdAt
  if (!ts) return '-'
  const d = ts.toDate()
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

const colorPresets = [
  { label: '네이비', value: '#1B3A6B' },
  { label: '딥그린', value: '#1A4731' },
  { label: '버건디', value: '#6B1B2B' },
  { label: '다크브라운', value: '#4A2C0A' },
  { label: '미드나잇', value: '#1A1A2E' },
  { label: '퍼플', value: '#3B1B6B' },
]

const emptyForm = {
  churchName: '', pastor: '', pastorRole: '담임목사', pastorMessage: '', pastorTagline: '', pastorPhotoUrl: '',
  phone: '', email: '', address: '', locationDetail: '', shuttleInfo: '', naverMapLink: '', kakaoMapLink: '', intro: '', mottoText: '', mottoReference: '', vision: '', mission: '', logoUrl: '', heroImageUrl: '', buildingImageUrl: '',
  metaTitle: '', metaDesc: '',
  kakaoLink: '', youtubeLink: '', sermonPlaylistUrl: '', instagramLink: '',
  youtubeVideoId: '', latestSermonTitle: '', latestSermonSpeaker: '', sermonExcerpt: '',
}

// 선택한 이미지 파일을 캔버스로 리사이즈/압축해서 Blob으로 변환
const resizeImageToBlob = (file: File, maxSize: number, mime: 'image/png' | 'image/jpeg', quality?: number): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new Image()
      img.onload = () => {
        let { width, height } = img
        if (width > height && width > maxSize) { height *= maxSize / width; width = maxSize }
        else if (height >= width && height > maxSize) { width *= maxSize / height; height = maxSize }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        canvas.getContext('2d')?.drawImage(img, 0, 0, width, height)
        canvas.toBlob((blob) => {
          if (blob) resolve(blob)
          else reject(new Error('이미지 변환 실패'))
        }, mime, quality)
      }
      img.onerror = reject
      img.src = event.target?.result as string
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

// 리사이즈/압축한 이미지를 Firebase Storage에 올리고 실제 다운로드 URL을 반환.
// (예전엔 base64로 Firestore 문서에 직접 저장했지만, 카카오톡 등 링크 미리보기 봇이 base64
// 이미지를 못 읽어서 실제 http(s) URL이 필요해짐 — 이제 Storage에 업로드하고 그 주소만 저장함)
const uploadImageAndGetUrl = async (
  file: File,
  maxSize: number,
  mime: 'image/png' | 'image/jpeg',
  quality: number | undefined,
  uid: string,
  fieldKey: string,
): Promise<string> => {
  const blob = await resizeImageToBlob(file, maxSize, mime, quality)
  const ext = mime === 'image/png' ? 'png' : 'jpg'
  const path = `churchSiteUploads/${uid}/${fieldKey}-${Date.now()}.${ext}`
  const fileRef = storageRef(storage, path)
  await uploadBytes(fileRef, blob)
  return getDownloadURL(fileRef)
}

// 교회 홈페이지 속도 개선: 주보에서 가져온 사진(로고·교역자 사진 등)은 사진 데이터가 통째로(data:image)
// 들어 있어 교회 사이트 정보가 무거워짐(방문자가 매번 그만큼 받아야 함). 저장할 때 그런 사진만 Storage에
// 올리고 주소로 바꿔서 저장. 주보 데이터 자체는 건드리지 않음.
// 같은 사진을 저장할 때마다 또 올리지 않도록 이번 접속 동안 올린 결과를 기억
const inlineImageUploads = new Map<string, Promise<string>>()

const uploadInlineImage = (dataUrl: string, uid: string): Promise<string> => {
  let p = inlineImageUploads.get(dataUrl)
  if (!p) {
    p = (async () => {
      const blob = await (await fetch(dataUrl)).blob()
      const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg'
      // 같은 사진은 같은 파일 이름(내용 기준)으로 — 다음에 다시 저장해도 파일이 계속 늘어나지 않게
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())))
        .slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('')
      const fileRef = storageRef(storage, `churchSiteUploads/${uid}/inline-${hash}.${ext}`)
      await uploadBytes(fileRef, blob, { contentType: blob.type || undefined })
      return getDownloadURL(fileRef)
    })()
    inlineImageUploads.set(dataUrl, p)
    p.catch(() => inlineImageUploads.delete(dataUrl))
  }
  return p
}

// 저장할 값 안의 data:image 사진을 모두 Storage 주소로 바꿈. 올리기에 실패한 사진은 원래 값 그대로 저장(저장 자체는 막지 않음)
async function replaceInlineImages<T>(value: T, uid: string): Promise<T> {
  if (typeof value === 'string') {
    if (!value.startsWith('data:image/')) return value
    try { return (await uploadInlineImage(value, uid)) as T } catch (e) { console.error('사진 옮기기 실패:', e); return value }
  }
  if (Array.isArray(value)) return (await Promise.all(value.map((v) => replaceInlineImages(v, uid)))) as T
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const entries = await Promise.all(Object.entries(value as Record<string, unknown>).map(async ([k, v]) => [k, await replaceInlineImages(v, uid)] as const))
    return Object.fromEntries(entries) as T
  }
  return value
}

export default function BuilderPage({ onBack }: Props) {
  const [uid, setUid] = useState<string | null>(null)
  const [projects, setProjects] = useState<ChurchSite[]>([])
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [selectedProject, setSelectedProject] = useState<string | null>(null)
  const [pendingOpenSlug, setPendingOpenSlug] = useState<string | null>(null) // 운영자 ?site=주소로 열 사이트
  const [creating, setCreating] = useState(false)
  const [slug, setSlug] = useState('')
  const [slugError, setSlugError] = useState('')
  const [saving, setSaving] = useState(false)
  const [deploying, setDeploying] = useState(false)
  const [savedSnack, setSavedSnack] = useState(false)
  const [deploySnack, setDeploySnack] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [selectedPlanMonths, setSelectedPlanMonths] = useState<1 | 12>(1)
  const [paying, setPaying] = useState(false)
  const [paymentSuccessExpiry, setPaymentSuccessExpiry] = useState<Date | null>(null)
  const [urlCopied, setUrlCopied] = useState(false)
  const [selectedColor, setSelectedColor] = useState('#1B3A6B')
  // 편집 탭 = 홈페이지 메뉴 순서(2026-11-10 재구성). 매주 할 일은 첫 탭 하나에서
  const [activeTab, setActiveTab] = useState<'weekly' | 'home' | 'about' | 'worship' | 'edu' | 'settings'>('weekly')
  const [activeMenus, setActiveMenus] = useState<string[]>(['home', 'worship', 'community', 'news', 'online-worship', 'location'])
  const [form, setForm] = useState(emptyForm)
  const [worshipServices, setWorshipServices] = useState<WorshipService[]>([])
  const [newWorshipGroupName, setNewWorshipGroupName] = useState('')
  const [visionItems, setVisionItems] = useState<VisionItem[]>([])
  const [newsItems, setNewsItems] = useState<NewsItem[]>([])
  // 온라인 주보 연동: 불러온(마지막 저장) 시점의 교회 소식·이번 주 말씀. 저장할 때 이것과 달라진 것만
  // 같은 날짜 주보에 "주보에도 반영할까요?"로 물어봄
  const syncBase = useRef<{ news: Record<string, string>; sermon: string }>({ news: {}, sermon: '' })
  const [syncTargets, setSyncTargets] = useState<BulletinSyncTarget[] | null>(null)
  const [syncChecked, setSyncChecked] = useState<string[]>([])
  const [syncing, setSyncing] = useState(false)
  const [loadAsk, setLoadAsk] = useState<{ k: keyof BuilderDefaults['text']; label: string; value: string } | null>(null)
  const [leaderAsk, setLeaderAsk] = useState<LayLeader[] | null>(null) // 중직자 불러오기 확인 팝업
  const makeSyncBase = (news: NewsItem[], w: WeeklySermon) => {
    const map: Record<string, string> = {}
    news.forEach((n) => { const d = syncDate(n.date); if (d && !(d in map)) map[d] = JSON.stringify(siteNewsLines(n)) })
    return { news: map, sermon: JSON.stringify({ ...cleanSermon(w), date: syncDate(w.date) }) }
  }
  // 저장이 끝난 뒤: 이번에 바뀐 소식·말씀 중 같은 날짜 주보가 있고 내용이 다른 것만 골라 물어봄.
  // 여기서 오류가 나도 홈페이지 저장에는 영향 없음
  const askBulletinSync = async (ownerId: string) => {
    try {
      const base = syncBase.current
      const changedNews: { date: string; lines: ReturnType<typeof siteNewsLines> }[] = []
      const seen = new Set<string>()
      newsItems.forEach((n) => {
        const d = syncDate(n.date)
        if (!d || seen.has(d)) return
        seen.add(d)
        const lines = siteNewsLines(n)
        if (lines.length && base.news[d] !== JSON.stringify(lines)) changedNews.push({ date: d, lines })
      })
      const w = { ...cleanSermon(weeklySermon), date: syncDate(weeklySermon.date) }
      const changedSermon = w.title && w.date && JSON.stringify(w) !== base.sermon ? w : null
      syncBase.current = makeSyncBase(newsItems, weeklySermon)
      const targets = await findBulletinTargets(ownerId, changedNews, changedSermon)
      if (targets.length) {
        setSyncTargets(targets)
        setSyncChecked(targets.map((x) => x.date))
      }
    } catch (e) {
      console.error('주보 반영 확인 실패:', e)
    }
  }
  const confirmBulletinSync = async () => {
    if (!syncTargets) return
    setSyncing(true)
    try {
      for (const x of syncTargets.filter((x) => syncChecked.includes(x.date))) await applyBulletinTarget(x)
      setSyncTargets(null)
    } catch (e) {
      console.error('주보 반영 실패:', e)
      alert('주보에 반영하지 못했어요. 다시 시도해 주세요.')
    } finally {
      setSyncing(false)
    }
  }
  // 교회 주보(종이 주보 파일) — 한글·워드·PDF·사진 파일을 그대로 올림. 온라인 주보와 별개
  const [paperBulletins, setPaperBulletins] = useState<PaperBulletin[]>([])
  const [paperDraft, setPaperDraft] = useState<{ date: string; title: string }>({ date: '', title: '' })
  // 교회 주보 링크 등록(블로그·카페·구글 드라이브 등)
  const [paperLink, setPaperLink] = useState('')
  // 홈페이지 위쪽 메뉴에 "온라인 주보"를 보일지(온라인 주보가 있어도 끄면 숨김). 기본 켜짐
  const [juboMenuEnabled, setJuboMenuEnabled] = useState(true)
  // 위쪽 탭(2026-11-17): 교회 홈페이지 편집 / 교회 주보(종이 주보 만들기)
  const [builderMode, setBuilderMode] = useState<'site' | 'paper'>('site')
  const [uploadingPaper, setUploadingPaper] = useState(false)
  // "이 주보로 교회 소식·설교도 채우기" — 켜고 올리면 AI가 주보를 읽고 확인 화면을 띄움(교회가 고른 것만 들어감)
  const [paperAnalyze, setPaperAnalyze] = useState(false)
  const [analyzingPaperId, setAnalyzingPaperId] = useState<string | null>(null)
  const [analysisReview, setAnalysisReview] = useState<AnalysisReview | null>(null)
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([])
  const [layLeaders, setLayLeaders] = useState<LayLeader[]>([])
  const [eduMenuLabel, setEduMenuLabel] = useState('주일학교')
  const [eduDepartments, setEduDepartments] = useState<EduDepartment[]>([])
  // 교회 연혁 · 찬양팀 · 새가족 안내 · 설교 카드 ON/OFF(다음 주 말씀)
  const [historyItems, setHistoryItems] = useState<{ date: string; content: string }[]>([])
  // 교회소개 칸 켜기/끄기(2026-11-17): 끄고 저장하면 홈페이지에서 메뉴·화면 모두 숨김(기본 켜짐)
  const [staffEnabled, setStaffEnabled] = useState(true)
  const [officersEnabled, setOfficersEnabled] = useState(true)
  const [historyEnabled, setHistoryEnabled] = useState(true)
  const [newcomerEnabled, setNewcomerEnabled] = useState(true)
  const [praiseEnabled, setPraiseEnabled] = useState(false)
  // 교회 일정(홈페이지 위쪽 메뉴 "교회 일정", 앨범 오른쪽): ON일 때만 홈페이지에 보임
  const [scheduleEnabled, setScheduleEnabled] = useState(false)
  const [schedules, setSchedules] = useState<{ id: string; date: string; title: string }[]>([])
  const [praiseIntro, setPraiseIntro] = useState('')
  const [praiseTeams, setPraiseTeams] = useState<{ name: string; time: string; place: string; leader: string; desc: string; photoUrl: string }[]>([])
  const [uploadingPraiseIndex, setUploadingPraiseIndex] = useState<number | null>(null)
  const [newcomerIntro, setNewcomerIntro] = useState('')
  const [newcomerSteps, setNewcomerSteps] = useState<{ title: string; desc: string }[]>([])
  const [newcomerContact, setNewcomerContact] = useState('')
  const [weeklySermonEnabled, setWeeklySermonEnabled] = useState(true)
  const [nextSermon, setNextSermon] = useState<WeeklySermon>(EMPTY_WEEKLY)
  const [nextSermonEnabled, setNextSermonEnabled] = useState(false)
  const [uploadingEduIndex, setUploadingEduIndex] = useState<number | null>(null)
  const [albums, setAlbums] = useState<AlbumItem[]>([])
  const [uploadingAlbumIndex, setUploadingAlbumIndex] = useState<number | null>(null)
  const [galleryImages, setGalleryImages] = useState<string[]>([])
  // 히어로(첫 화면 배너) 사진 여러 장 + 2장 이상일 때 넘김 방식. 첫 번째 사진은 heroImageUrl에도
  // 같이 저장해서 원페이지형·카카오 미리보기·검색봇 등 예전 필드를 쓰는 곳이 그대로 동작하게 함
  const [heroImages, setHeroImages] = useState<string[]>([])
  const [heroTransition, setHeroTransition] = useState<'slide' | 'fade'>('slide')
  const [heroTextColor, setHeroTextColor] = useState('#FFFFFF')
  // 이번 주 말씀(주보 없이 홈페이지만 쓰는 교회용): 설교 탭·온라인 예배에 나옴
  const [weeklySermon, setWeeklySermon] = useState<WeeklySermon>(EMPTY_WEEKLY)
  // 메인 바로가기 카드 4개 문구(비우면 기본 문구)
  const [homeCards, setHomeCards] = useState<HomeCardText[]>(EMPTY_HOME_CARDS)
  const [denomination, setDenomination] = useState<string>(DEFAULT_DENOMINATION) // 교단 마크(기본 예장 합동)
  const [denominationWithLogo, setDenominationWithLogo] = useState(false) // 로고가 있어도 교단 마크 같이 표시
  const [denominationFullName, setDenominationFullName] = useState(false) // 교단 이름을 괄호까지: 대한예수교장로회(합신)
  const [hideLogo, setHideLogo] = useState(false) // 홈페이지에서는 로고 이미지 안 씀
  const [sermons, setSermons] = useState<Sermon[]>([])
  const [onlineWorshipEnabled, setOnlineWorshipEnabled] = useState<boolean>(true)
  // 화면 방식: 페이지 전환형(기본, 메뉴마다 주소가 따로 있어 검색에 유리) / 원페이지(예전 한 페이지 스크롤)
  const [layoutMode, setLayoutMode] = useState<'multipage' | 'onepage'>('multipage')
  // 화면 위쪽 배너(페이지 전환형): 사진 / 색상(투톤) / 끄기 — utils/pageBanners.ts
  const [bannerMode, setBannerMode] = useState<BannerMode>('photo')
  const [bannerColors, setBannerColors] = useState<[string, string] | null>(null) // null = 우리 교회 색
  const [bannerPhotos, setBannerPhotos] = useState<Record<string, string>>({})
  const [uploadingBannerKey, setUploadingBannerKey] = useState<string | null>(null)
  const [mainWorshipGroup, setMainWorshipGroup] = useState<string>('')
  const [worshipGroupPhotos, setWorshipGroupPhotos] = useState<Record<string, string>>({}) // 예배 구분별 대표 사진
  const [uploadingWorshipGroup, setUploadingWorshipGroup] = useState<string | null>(null)
  const [introVideoEnabled, setIntroVideoEnabled] = useState<boolean>(true)
  const [sermonDisplayMode, setSermonDisplayMode] = useState<'video' | 'text'>('video')

  const update = (field: keyof typeof form, value: string) => setForm(p => ({ ...p, [field]: value }))

  // ── 온라인 주보 내용으로 빈 칸 자동 채우기 + 주보와 다를 때 약한 안내 ──────────────────
  // 주보는 읽기만 함(빌더에서 고친 내용을 주보에 복사하지 않음)
  // 주보를 읽어 올 교회 = 지금 편집 중인 사이트의 소유 교회. 운영자가 다른 교회 사이트를
  // 편집할 때(?site=주소)도 운영자 주보가 아니라 그 교회 주보가 들어가야 하므로 uid가 아닌 ownerId 기준
  const currentOwnerId = (selectedProject && projects.find(p => p.slug === selectedProject)?.ownerId) || uid
  const navigate = useNavigate()
  // 홈페이지 이용 상태 = 교회 계정 요금제 기준(2026-11-13). /pricing의 프로·올인원에 홈페이지가 포함되므로
  // 결제는 /pricing 한 곳에서 하고, 여기서는 그 교회 계정(users/{소유자})의 요금제·만료일을 읽기만 함(결제 코드 변경 없음)
  const [ownerPlan, setOwnerPlan] = useState<{ status: string; expiry: ExpiryInfo } | null>(null)
  useEffect(() => {
    if (!currentOwnerId) { setOwnerPlan(null); return }
    let alive = true
    getDoc(doc(db, 'users', currentOwnerId))
      .then(snap => {
        if (!alive) return
        const u = (snap.data() || {}) as { status?: string; lastPaymentDate?: unknown; createdAt?: unknown }
        setOwnerPlan({ status: u.status || 'active', expiry: getExpiryInfo(u) })
      })
      .catch(() => { if (alive) setOwnerPlan(null) })
    return () => { alive = false }
  }, [currentOwnerId])
  const [bulletinDefaults, setBulletinDefaults] = useState<BuilderDefaults | null>(null)
  const [bulletinDefaultsOwner, setBulletinDefaultsOwner] = useState<string | null>(null)
  const prefilledFor = useRef<string | null>(null)
  // 운영자가 먼저 만들고 아직 교회 계정을 연결하지 않은 사이트(2026-11-17): 소유자가 운영자 계정이라
  // 그 주보(스테이온교회)를 읽으면 안 됨 — 편집 칸 자동 채우기·"주보에도 반영" 둘 다 안 함
  const currentPending = !!(selectedProject && (projects.find(p => p.slug === selectedProject) as { pendingOwner?: boolean } | undefined)?.pendingOwner)
  useEffect(() => {
    if (!currentOwnerId) return
    let cancelled = false
    setBulletinDefaults(null)
    setBulletinDefaultsOwner(null)
    if (currentPending) return
    fetchOwnerData(currentOwnerId).then(o => {
      if (cancelled) return
      setBulletinDefaults(builderDefaultsFromBulletin(o))
      setBulletinDefaultsOwner(currentOwnerId)
    })
    return () => { cancelled = true }
  }, [currentOwnerId, currentPending])
  // ── 교회 정보 가져오기 방식(dataSource) ──────────────────
  //  bulletin: 주보 플랫폼 정보와 연동(홈페이지에 주보 내용이 그대로 나옴) — 주보를 쓰는 교회 기본값
  //  custom  : 주보는 쓰지만 홈페이지는 주보와 다르게(여기 입력한 내용이 나옴)
  //  website : 주보는 안 쓰고 홈페이지만(여기 입력한 내용이 나옴)
  // null = 아직 저장된 적 없음 → 주보가 있으면 bulletin, 없으면 website로 취급
  const [dataSource, setDataSource] = useState<'bulletin' | 'custom' | 'website' | null>(null)
  // 운영자가 먼저 만든 사이트(currentPending)는 소유자가 운영자 계정이라 운영자 주보와 계정이 같음 →
  // 이미 받아 둔 운영자 주보(스테이온교회)를 "그 교회 주보"로 착각해 로고·표어 등이 채워졌음(2026-11-19). 이때는 언제나 주보 없음
  const bulletinReady = !currentPending && !!bulletinDefaults && bulletinDefaultsOwner === currentOwnerId
  const effectiveSource: 'bulletin' | 'custom' | 'website' = dataSource ?? (bulletinReady ? 'bulletin' : 'website')

  // 주보 내용을 편집 칸에 채움. overwrite=true면 지금 칸 값을 주보 내용으로 바꿈(연동 선택 시),
  // false면 빈 칸만 채움. 편집 칸은 언제나 수정 가능
  const applyBulletinDefaults = (overwrite: boolean) => {
    const d = bulletinDefaults
    if (!d || currentPending) return
    setForm(p => {
      const next = { ...p }
      ;(Object.keys(d.text) as (keyof typeof d.text)[]).forEach(k => {
        const cur = String(next[k] ?? '').trim()
        const val = d.text[k] || ''
        // 교회 이름은 이미 적혀 있으면 절대 덮어쓰지 않음(주보 계정 이름이 "마스터" 같은 계정명이라 홈페이지 이름이 바뀌던 문제)
        if (k === 'churchName' && cur) return
        if (overwrite ? !!val : (!cur || (k === 'pastorRole' && cur === '담임목사'))) (next as Record<string, string>)[k] = val
      })
      return next
    })
    setWorshipServices(prev => (overwrite && d.worshipServices.length ? d.worshipServices : (prev.length ? prev : d.worshipServices)))
    setStaffMembers(prev => (overwrite && d.staffMembers.length ? d.staffMembers : (prev.length ? prev : d.staffMembers)))
    setLayLeaders(prev => (overwrite && d.layLeaders.length ? d.layLeaders : (prev.length ? prev : d.layLeaders)))
  }
  useEffect(() => {
    const key = selectedProject ?? (creating ? '__new__' : null)
    // 다른 교회 주보로 빈 칸이 채워지는 일이 없게, 지금 사이트 소유 교회의 주보를 다 불러온 뒤에만 채움
    if (!key || currentPending || !bulletinDefaults || bulletinDefaultsOwner !== currentOwnerId || prefilledFor.current === key) return
    prefilledFor.current = key
    // 연동(1번, 또는 아직 선택 안 함) 상태면 주보 최신 내용으로 칸을 맞추고, 2·3번이면 빈 칸만 채움
    applyBulletinDefaults(dataSource === null || dataSource === 'bulletin')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulletinDefaults, bulletinDefaultsOwner, currentOwnerId, currentPending, selectedProject, creating])

  const chooseDataSource = (v: 'bulletin' | 'custom' | 'website') => {
    setDataSource(v)
    if (v === 'bulletin') applyBulletinDefaults(true) // 연동으로 바꾸면 칸도 주보 최신 내용으로
  }
  const norm = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim()
  // 홈페이지에서 실제로 어느 쪽이 보이는지(utils/churchSiteContent.ts buildSiteContent 기준)
  const HOMEPAGE_USES_BUILDER: string[] = ['churchName', 'email']
  const bulletinHint = (k: keyof BuilderDefaults['text']) => {
    // "주보와 다르게"·"홈페이지만"이면 홈페이지에는 언제나 여기 입력한 값이 나오므로 안내하지 않음
    if (effectiveSource !== 'bulletin') return undefined
    const dv = bulletinDefaults?.text[k]
    const cur = norm(form[k as keyof typeof form])
    if (!dv || !cur || cur === norm(dv)) return undefined
    return <BulletinDiffHint builderWins={HOMEPAGE_USES_BUILDER.includes(k)} />
  }
  // 온라인 주보에서 불러오기: 주보에 그 칸 내용이 있고 지금 칸과 다를 때만 이름 줄 오른쪽에 버튼.
  // 주보를 쓰지 않는 교회(주보 없음)는 안 보임. 누르면 팝업으로 불러올 내용을 보여 주고 "불러오기"를 눌러야 칸에 들어감
  const BULLETIN_LOAD_LABELS: Partial<Record<keyof BuilderDefaults['text'], string>> = {
    churchName: '교회 이름', phone: '대표 전화', email: '이메일', mottoText: '표어', mottoReference: '성구',
    intro: '교회 소개', vision: '비전', mission: '사명', address: '주소', locationDetail: '상세 위치 안내',
    pastor: '담임 목사 성함', pastorRole: '직분', pastorTagline: '짧은 소개', pastorMessage: '인사말',
    youtubeLink: '유튜브 채널 링크', instagramLink: '인스타그램 링크',
  }
  const bulletinLoad = (k: keyof BuilderDefaults['text']) => {
    const dv = bulletinReady ? (bulletinDefaults?.text[k] || '') : ''
    if (!dv.trim() || norm(dv) === norm(form[k as keyof typeof form])) return undefined
    return (
      <button type="button" onClick={() => setLoadAsk({ k, label: BULLETIN_LOAD_LABELS[k] || '', value: dv })}
        style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4, background: '#EFF6FF', color: '#2563EB', border: 'none', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
        ↓ 불러오기
      </button>
    )
  }
  const listHint = (cur: string[], def: string[]) =>
    effectiveSource === 'bulletin' && def.length && cur.length && norm(cur.join('|')) !== norm(def.join('|')) ? <BulletinDiffHint builderWins={false} /> : undefined

  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingHero, setUploadingHero] = useState(false)
  const [uploadingBuilding, setUploadingBuilding] = useState(false)
  const [uploadingPastorPhoto, setUploadingPastorPhoto] = useState(false)
  const [uploadingGallery, setUploadingGallery] = useState(false)

  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!uid) { alert('로그인이 필요합니다.'); return }
    if (!file.type.startsWith('image/')) { alert('이미지 파일만 업로드할 수 있습니다.'); return }
    setUploadingLogo(true)
    try {
      const url = await uploadImageAndGetUrl(file, 400, 'image/png', undefined, uid, 'logo')
      update('logoUrl', url)
    } catch {
      alert('이미지를 업로드하지 못했습니다. 다시 시도해주세요.')
    } finally {
      setUploadingLogo(false)
    }
  }

  // 히어로 사진: 한 번에 여러 장 선택 가능, 총 GALLERY_MAX_IMAGES장까지(홈 화면 사진과 같은 방식)
  const handleHeroFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    if (!uid) { alert('로그인이 필요합니다.'); return }
    if (files.some(f => !f.type.startsWith('image/'))) { alert('이미지 파일만 업로드할 수 있습니다.'); return }
    const remainingSlots = GALLERY_MAX_IMAGES - heroImages.length
    if (remainingSlots <= 0) { alert(`사진은 최대 ${GALLERY_MAX_IMAGES}장까지 올릴 수 있어요.`); return }
    const filesToUpload = files.slice(0, remainingSlots)
    if (files.length > filesToUpload.length) {
      alert(`사진은 최대 ${GALLERY_MAX_IMAGES}장까지 올릴 수 있어서, 앞의 ${filesToUpload.length}장만 업로드할게요.`)
    }
    setUploadingHero(true)
    try {
      const urls: string[] = []
      for (let i = 0; i < filesToUpload.length; i++) {
        urls.push(await uploadImageAndGetUrl(filesToUpload[i], 1920, 'image/jpeg', 0.75, uid, `hero-${Date.now()}-${i}`))
      }
      setHeroImages(prev => [...prev, ...urls])
    } catch {
      alert('이미지를 업로드하지 못했습니다. 다시 시도해주세요.')
    } finally {
      setUploadingHero(false)
    }
  }
  const removeHeroImage = (i: number) => setHeroImages(prev => prev.filter((_, idx) => idx !== i))
  // 순서 바꾸기(맨 앞 사진이 대표 사진 = 처음 보이는 사진)
  const moveHeroImage = (i: number, dir: -1 | 1) => setHeroImages(prev => {
    const j = i + dir
    if (j < 0 || j >= prev.length) return prev
    const next = [...prev]
    ;[next[i], next[j]] = [next[j], next[i]]
    return next
  })

  // 찬양팀 사진(팀마다 1장)
  const handlePraisePhoto = async (i: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!uid) { alert('로그인이 필요합니다.'); return }
    if (!file.type.startsWith('image/')) { alert('이미지 파일만 업로드할 수 있습니다.'); return }
    setUploadingPraiseIndex(i)
    try {
      const url = await uploadImageAndGetUrl(file, 1200, 'image/jpeg', 0.8, uid, 'praise')
      setPraiseTeams(prev => prev.map((x, j) => (j === i ? { ...x, photoUrl: url } : x)))
    } catch {
      alert('이미지를 업로드하지 못했습니다. 다시 시도해주세요.')
    } finally {
      setUploadingPraiseIndex(null)
    }
  }

  // 예배 안내 카드 왼쪽 대표 사진(예배 구분마다 1장)
  const handleWorshipGroupPhoto = async (group: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!uid) { alert('로그인이 필요합니다.'); return }
    if (!file.type.startsWith('image/')) { alert('이미지 파일만 업로드할 수 있습니다.'); return }
    setUploadingWorshipGroup(group)
    try {
      const url = await uploadImageAndGetUrl(file, 1200, 'image/jpeg', 0.8, uid, 'worship')
      setWorshipGroupPhotos(prev => ({ ...prev, [group]: url }))
    } catch {
      alert('이미지를 업로드하지 못했습니다. 다시 시도해주세요.')
    } finally {
      setUploadingWorshipGroup(null)
    }
  }

  const handleBuildingFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!uid) { alert('로그인이 필요합니다.'); return }
    if (!file.type.startsWith('image/')) { alert('이미지 파일만 업로드할 수 있습니다.'); return }
    setUploadingBuilding(true)
    try {
      const url = await uploadImageAndGetUrl(file, 1920, 'image/jpeg', 0.75, uid, 'building')
      update('buildingImageUrl', url)
    } catch {
      alert('이미지를 업로드하지 못했습니다. 다시 시도해주세요.')
    } finally {
      setUploadingBuilding(false)
    }
  }

  // 갤러리 사진은 한 번에 여러 장을 선택할 수 있고, 총 GALLERY_MAX_IMAGES장을 넘지 않게 앞에서부터 잘라서 업로드함
  const handleGalleryFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    if (!uid) { alert('로그인이 필요합니다.'); return }
    if (files.some(f => !f.type.startsWith('image/'))) { alert('이미지 파일만 업로드할 수 있습니다.'); return }

    const remainingSlots = GALLERY_MAX_IMAGES - galleryImages.length
    if (remainingSlots <= 0) { alert(`사진은 최대 ${GALLERY_MAX_IMAGES}장까지 올릴 수 있어요.`); return }

    const filesToUpload = files.slice(0, remainingSlots)
    if (files.length > filesToUpload.length) {
      alert(`사진은 최대 ${GALLERY_MAX_IMAGES}장까지 올릴 수 있어서, 앞의 ${filesToUpload.length}장만 업로드할게요.`)
    }

    setUploadingGallery(true)
    try {
      const urls: string[] = []
      for (let i = 0; i < filesToUpload.length; i++) {
        const url = await uploadImageAndGetUrl(filesToUpload[i], 1920, 'image/jpeg', 0.75, uid, `gallery-${Date.now()}-${i}`)
        urls.push(url)
      }
      setGalleryImages(prev => [...prev, ...urls])
    } catch {
      alert('이미지를 업로드하지 못했습니다. 다시 시도해주세요.')
    } finally {
      setUploadingGallery(false)
    }
  }
  const removeGalleryImage = (i: number) => setGalleryImages(prev => prev.filter((_, idx) => idx !== i))

  // 교회 주보 파일 올리기: 파일은 그대로(변환·압축 없이) 저장하고, 날짜·제목과 함께 목록에 추가
  // 교회 주보 파일 올리기(2026-11-17): PDF·한글·워드는 1개, 사진(JPG·PNG·WEBP)은 여러 장을 한 번에 → 한 주보로 묶어
  // 홈페이지에서 올린 순서대로 위에서 아래로 이어서 보여 줌
  const handlePaperBulletinFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    if (!uid) { alert('로그인이 필요합니다.'); return }
    if (!paperDraft.date) { alert('주보 날짜를 먼저 선택해 주세요.'); return }
    const extOf = (f: File) => (f.name.split('.').pop() || '').toLowerCase()
    const bad = files.find(f => !PAPER_BULLETIN_ACCEPT.split(',').includes(`.${extOf(f)}`))
    if (bad) { alert('한글(HWP)·워드·PDF·사진(JPG/PNG/WEBP) 파일만 올릴 수 있어요.'); return }
    const allImages = files.every(f => PAPER_IMAGE_EXTS.includes(extOf(f)))
    if (files.length > 1 && !allImages) { alert('여러 개를 한 번에 올릴 때는 사진(JPG·PNG·WEBP)만 가능해요. PDF·한글·워드는 1개씩 올려 주세요.'); return }
    if (files.length > 30) { alert('사진은 한 주보에 30장까지 올릴 수 있어요.'); return }
    if (files.some(f => f.size > 30 * 1024 * 1024)) { alert('파일은 하나에 30MB까지 올릴 수 있어요.'); return }
    setUploadingPaper(true)
    try {
      const stamp = Date.now()
      const urls: string[] = []
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const ext = extOf(file)
        const fileRef = storageRef(storage, `churchSiteUploads/${uid}/paper-bulletin-${stamp}-${i}.${ext}`)
        await uploadBytes(fileRef, file, { contentType: file.type || undefined, contentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(file.name)}` })
        urls.push(await getDownloadURL(fileRef))
      }
      const first = files[0]
      const entry: PaperBulletin = {
        id: `${stamp}`, date: paperDraft.date, title: paperDraft.title.trim() || `${paperDraft.date.replace(/-/g, '.')} 주보`,
        fileUrl: urls[0], fileName: allImages && files.length > 1 ? `사진 ${files.length}장` : first.name,
        fileType: allImages ? 'images' : extOf(first),
        ...(allImages ? { images: urls } : {}),
      }
      setPaperBulletins(prev => [...prev, entry].sort((a, z) => z.date.localeCompare(a.date)))
      setPaperDraft({ date: '', title: '' })
      if (paperAnalyze && !allImages) void analyzePaperBulletin(entry)
    } catch {
      alert('파일을 올리지 못했습니다. 다시 시도해주세요.')
    } finally {
      setUploadingPaper(false)
    }
  }
  // 교회 주보 링크 등록: 블로그·카페·구글 드라이브 등에 올린 주보 주소
  const addPaperBulletinLink = () => {
    if (!paperDraft.date) { alert('주보 날짜를 먼저 선택해 주세요.'); return }
    let url = paperLink.trim()
    if (!url) { alert('주보 링크 주소를 입력해 주세요.'); return }
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`
    try { new URL(url) } catch { alert('링크 주소를 다시 확인해 주세요.'); return }
    const entry: PaperBulletin = {
      id: `${Date.now()}`, date: paperDraft.date, title: paperDraft.title.trim() || `${paperDraft.date.replace(/-/g, '.')} 주보`,
      fileUrl: url, fileName: url, fileType: 'link',
    }
    setPaperBulletins(prev => [...prev, entry].sort((a, z) => z.date.localeCompare(a.date)))
    setPaperDraft({ date: '', title: '' })
    setPaperLink('')
  }
  const removePaperBulletin = (id: string) => setPaperBulletins(prev => prev.filter(p => p.id !== id))

  // 주보 파일을 AI로 읽기 → 확인 화면. 빌더에 아무것도 바로 넣지 않음
  const analyzePaperBulletin = async (p: PaperBulletin) => {
    const path = storagePathFromUrl(p.fileUrl)
    if (!path || !auth.currentUser) { alert('이 파일은 자동으로 읽을 수 없어요.'); return }
    setAnalyzingPaperId(p.id)
    try {
      const token = await auth.currentUser.getIdToken()
      const res = await fetch(ANALYZE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ path }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.result) { alert(data.error || '주보를 읽지 못했어요. 잠시 후 다시 해 주세요.'); return }
      const r = data.result as PaperAnalysis
      const b = r.basic
      // 기본 정보는 빌더에 아직 비어 있는 칸만 제안(이미 쓴 내용은 덮어쓰지 않음)
      const basic: Record<string, boolean> = {}
      if (b.churchName && !form.churchName.trim()) basic.churchName = true
      if (b.pastorName && !form.pastor.trim()) basic.pastor = true
      if (b.phone && !form.phone.trim()) basic.phone = true
      if (b.address && !form.address.trim()) basic.address = true
      if (b.intro && !form.intro.trim()) basic.intro = true
      if (b.worshipServices.length && worshipServices.length === 0) basic.worshipServices = true
      if (b.staff.length && staffMembers.length === 0) basic.staff = true
      if (!r.sermons.length && !r.news.length && !Object.keys(basic).length) { alert('주보에서 넣을 만한 내용을 찾지 못했어요.'); return }
      setAnalysisReview({ bulletinId: p.id, result: r, sermons: r.sermons.map(() => true), news: r.news.map(() => true), basic })
    } catch {
      alert('주보를 읽지 못했어요. 잠시 후 다시 해 주세요.')
    } finally {
      setAnalyzingPaperId(null)
    }
  }

  // 확인 화면에서 고른 것만 빌더에 넣기('저장'을 눌러야 홈페이지에 반영)
  const applyAnalysisReview = () => {
    if (!analysisReview) return
    const { bulletinId, result: r, basic } = analysisReview
    const sermons = r.sermons.filter((_, i) => analysisReview.sermons[i])
    const news = r.news.filter((_, i) => analysisReview.news[i])
    setPaperBulletins(prev => prev.map(p => p.id === bulletinId ? { ...p, sermons, news } : p))
    const b = r.basic
    setForm(prev => ({
      ...prev,
      ...(basic.churchName ? { churchName: b.churchName } : {}),
      ...(basic.pastor ? { pastor: b.pastorName } : {}),
      ...(basic.phone ? { phone: b.phone } : {}),
      ...(basic.address ? { address: b.address } : {}),
      ...(basic.intro ? { intro: b.intro } : {}),
    }))
    if (basic.worshipServices) setWorshipServices(b.worshipServices.map(w => ({ title: w.title, time: w.time, place: '', note: '', group: w.group || WORSHIP_DEFAULT_GROUP })))
    if (basic.staff) setStaffMembers(b.staff.map(m => ({ role: m.role, name: m.name, department: '', phone: '', email: '', photoUrl: '' })))
    setAnalysisReview(null)
  }

  const handlePastorPhotoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!uid) { alert('로그인이 필요합니다.'); return }
    if (!file.type.startsWith('image/')) { alert('이미지 파일만 업로드할 수 있습니다.'); return }
    setUploadingPastorPhoto(true)
    try {
      const url = await uploadImageAndGetUrl(file, 800, 'image/jpeg', 0.8, uid, 'pastor')
      update('pastorPhotoUrl', url)
    } catch {
      alert('이미지를 업로드하지 못했습니다. 다시 시도해주세요.')
    } finally {
      setUploadingPastorPhoto(false)
    }
  }

  const toggleMenu = (id: string) => {
    setActiveMenus(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    )
  }

  // 예배 목록 편집
  const addWorshipService = (group: string) => setWorshipServices(prev => [...prev, { title: '', time: '', place: '', note: '', group }])
  const updateWorshipService = (i: number, field: keyof WorshipService, value: string) =>
    setWorshipServices(prev => prev.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)))
  const removeWorshipService = (i: number) => setWorshipServices(prev => prev.filter((_, idx) => idx !== i))
  const removeWorshipGroup = (group: string) => {
    setWorshipServices(prev => prev.filter(s => (s.group?.trim() || WORSHIP_DEFAULT_GROUP) !== group))
    setMainWorshipGroup(prev => (prev === group ? '' : prev))
  }

  // 등록된 예배들의 구분(group) 값을 처음 등장한 순서대로 뽑아서, 구분별로 박스를 하나씩 그리기 위한 목록
  const worshipGroupNames = (() => {
    const seen: string[] = []
    worshipServices.forEach(s => {
      const key = s.group?.trim() || WORSHIP_DEFAULT_GROUP
      if (!seen.includes(key)) seen.push(key)
    })
    return seen
  })()

  const handleAddWorshipGroup = () => {
    const name = newWorshipGroupName.trim()
    if (!name) return
    addWorshipService(name)
    setNewWorshipGroupName('')
  }

  // 비전/소개 항목 편집
  const addVisionItem = () => setVisionItems(prev => [...prev, { title: '', desc: '' }])
  const updateVisionItem = (i: number, field: keyof VisionItem, value: string) =>
    setVisionItems(prev => prev.map((v, idx) => (idx === i ? { ...v, [field]: value } : v)))
  const removeVisionItem = (i: number) => setVisionItems(prev => prev.filter((_, idx) => idx !== i))

  // 소식(뉴스) 게시물 편집
  const addNewsItem = () => setNewsItems(prev => [...prev, { title: '', date: '', content: '' }])
  const updateNewsItem = (i: number, field: keyof NewsItem, value: string) =>
    setNewsItems(prev => prev.map((n, idx) => (idx === i ? { ...n, [field]: value } : n)))
  const removeNewsItem = (i: number) => setNewsItems(prev => prev.filter((_, idx) => idx !== i))

  // 온라인 예배(지난 설교) 목록 편집
  const addSermon = () => setSermons(prev => [...prev, { title: '', speaker: '', scripture: '', youtubeVideoId: '', date: '', comments: '', views: '' }])
  const updateSermon = (i: number, field: keyof Sermon, value: string) =>
    setSermons(prev => prev.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)))
  const removeSermon = (i: number) => setSermons(prev => prev.filter((_, idx) => idx !== i))

  // 섬기는 사람들(부목사·전도사 등 부교역자) 편집 — 숫자 제한 없음
  const addStaffMember = () => setStaffMembers(prev => [...prev, { role: '', name: '', department: '', phone: '', email: '', photoUrl: '' }])
  const updateStaffMember = (i: number, field: keyof StaffMember, value: string) =>
    setStaffMembers(prev => prev.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)))
  const removeStaffMember = (i: number) => setStaffMembers(prev => prev.filter((_, idx) => idx !== i))

  const [uploadingStaffIndex, setUploadingStaffIndex] = useState<number | null>(null)

  // 실제 화면에는 130*170 크기로 작게 표시되므로, 그 크기에서 화질이 깨지지 않는 선(레티나 2~3배수)까지만
  // 남기고 최대한 압축해서 Firestore 문서 용량을 아낌
  const handleStaffPhotoFileChange = async (i: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!uid) { alert('로그인이 필요합니다.'); return }
    if (!file.type.startsWith('image/')) { alert('이미지 파일만 업로드할 수 있습니다.'); return }
    setUploadingStaffIndex(i)
    try {
      const url = await uploadImageAndGetUrl(file, 480, 'image/jpeg', 0.82, uid, `staff-${i}`)
      updateStaffMember(i, 'photoUrl', url)
    } catch {
      alert('이미지를 업로드하지 못했습니다. 다시 시도해주세요.')
    } finally {
      setUploadingStaffIndex(null)
    }
  }

  // 앨범 편집: 앨범 추가(제목·날짜) → 사진 여러 장 한 번에 올리기
  const addAlbum = () => setAlbums(prev => [...prev, { id: `al${Date.now().toString(36)}`, title: '', date: new Date().toLocaleDateString('sv-SE'), photos: [] }])
  const updateAlbum = (i: number, patch: Partial<AlbumItem>) => setAlbums(prev => prev.map((a, idx) => (idx === i ? { ...a, ...patch } : a)))
  const removeAlbum = (i: number) => {
    if (!confirm('이 앨범을 삭제할까요? (저장해야 홈페이지에 반영돼요)')) return
    setAlbums(prev => prev.filter((_, idx) => idx !== i))
  }
  const handleAlbumPhotos = async (i: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'))
    e.target.value = ''
    if (!files.length) return
    if (!uid) { alert('로그인이 필요합니다.'); return }
    const remaining = ALBUM_MAX_PHOTOS - (albums[i]?.photos.length || 0)
    if (remaining <= 0) { alert(`앨범 하나에 사진은 최대 ${ALBUM_MAX_PHOTOS}장까지 올릴 수 있어요.`); return }
    const toUpload = files.slice(0, remaining)
    if (files.length > remaining) alert(`사진은 최대 ${ALBUM_MAX_PHOTOS}장까지라서, 앞의 ${toUpload.length}장만 올릴게요.`)
    setUploadingAlbumIndex(i)
    try {
      for (let k = 0; k < toUpload.length; k++) {
        const url = await uploadImageAndGetUrl(toUpload[k], 1600, 'image/jpeg', 0.8, uid, `album-${Date.now()}-${k}`)
        setAlbums(prev => prev.map((a, idx) => (idx === i ? { ...a, photos: [...a.photos, url] } : a)))
      }
    } catch {
      alert('사진을 올리지 못했습니다. 다시 시도해주세요.')
    } finally {
      setUploadingAlbumIndex(null)
    }
  }

  // 주일학교/교육부서 부서 편집(유초등부·중고등부·청년부 등) — 숫자 제한 없음
  const addEduDepartment = () => setEduDepartments(prev => [...prev, { name: '', target: '', time: '', place: '', leader: '', desc: '', photoUrl: '' }])
  const updateEduDepartment = (i: number, field: keyof EduDepartment, value: string) =>
    setEduDepartments(prev => prev.map((d, idx) => (idx === i ? { ...d, [field]: value } : d)))
  const removeEduDepartment = (i: number) => setEduDepartments(prev => prev.filter((_, idx) => idx !== i))
  const handleEduPhotoFileChange = async (i: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!uid) { alert('로그인이 필요합니다.'); return }
    if (!file.type.startsWith('image/')) { alert('이미지 파일만 업로드할 수 있습니다.'); return }
    setUploadingEduIndex(i)
    try {
      const url = await uploadImageAndGetUrl(file, 1200, 'image/jpeg', 0.8, uid, `edu-${Date.now()}-${i}`)
      updateEduDepartment(i, 'photoUrl', url)
    } catch {
      alert('이미지를 업로드하지 못했습니다. 다시 시도해주세요.')
    } finally {
      setUploadingEduIndex(null)
    }
  }

  // 중직자(장로·권사) 편집 — 숫자 제한 없음
  const addLayLeader = () => setLayLeaders(prev => [...prev, { role: LAY_LEADER_ROLES[0], name: '', department: '', photoUrl: '' }])
  const updateLayLeader = (i: number, field: keyof LayLeader, value: string) =>
    setLayLeaders(prev => prev.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)))
  const removeLayLeader = (i: number) => setLayLeaders(prev => prev.filter((_, idx) => idx !== i))

  const [uploadingLayLeaderIndex, setUploadingLayLeaderIndex] = useState<number | null>(null)

  const handleLayLeaderPhotoFileChange = async (i: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!uid) { alert('로그인이 필요합니다.'); return }
    if (!file.type.startsWith('image/')) { alert('이미지 파일만 업로드할 수 있습니다.'); return }
    setUploadingLayLeaderIndex(i)
    try {
      const url = await uploadImageAndGetUrl(file, 480, 'image/jpeg', 0.82, uid, `layleader-${i}`)
      updateLayLeader(i, 'photoUrl', url)
    } catch {
      alert('이미지를 업로드하지 못했습니다. 다시 시도해주세요.')
    } finally {
      setUploadingLayLeaderIndex(null)
    }
  }

  // 프로젝트 목록으로 돌아갈 때 폼을 비워서, 다음에 "새로 만들기"를 눌러도 이전 값이 남아있지 않게 함
  const goBackToList = () => {
    setSelectedProject(null)
    setCreating(false)
    setDataSource(null)
    setForm(emptyForm)
    setWorshipServices([])
    setVisionItems([])
    setNewsItems([])
    syncBase.current = { news: {}, sermon: '' }
    setPaperBulletins([])
    setStaffMembers([])
    setLayLeaders([])
    setEduMenuLabel('주일학교')
    setEduDepartments([])
    setHistoryItems([])
    setPraiseEnabled(false); setPraiseIntro(''); setPraiseTeams([])
    setNewcomerIntro(''); setNewcomerSteps([]); setNewcomerContact('')
    setWeeklySermonEnabled(true); setNextSermon(EMPTY_WEEKLY); setNextSermonEnabled(false)
    setAlbums([])
    setWeeklySermon(EMPTY_WEEKLY)
    setHomeCards(EMPTY_HOME_CARDS)
    setGalleryImages([])
    setHeroImages([])
    setHeroTransition('slide')
    setDenomination(DEFAULT_DENOMINATION)
    setDenominationWithLogo(false)
    setDenominationFullName(false)
    setHideLogo(false)
    setSermons([])
    setOnlineWorshipEnabled(true)
    setIntroVideoEnabled(true)
    setSermonDisplayMode('video')
    setMainWorshipGroup('')
    setWorshipGroupPhotos({})
    setSlug('')
    setSlugError('')
    setSelectedColor('#1B3A6B')
    setActiveTab('weekly')
    setActiveMenus(['home', 'worship', 'community', 'news', 'online-worship', 'location'])
  }

  // 기존 프로젝트를 선택하면, 이미 불러온 Firestore 데이터로 폼을 채워서 편집을 이어갈 수 있게 함
  const handleSelectProject = (site: ChurchSite) => {
    // 운영자가 Close(편집 잠금)한 사이트는 교회 관리자가 열 수 없음(운영자는 항상 가능, 2026-11-19)
    if (site.editLocked && !isOperatorEmail(auth.currentUser?.email)) {
      alert('아직 편집할 수 없는 사이트예요. 스테이온이 준비를 마치면 열어 드릴게요.')
      return
    }
    setSelectedProject(site.slug)
    setForm({
      churchName: site.churchName || '',
      pastor: site.pastor || '',
      pastorRole: site.pastorRole || '담임목사',
      pastorMessage: site.pastorMessage || '',
      pastorTagline: site.pastorTagline || '',
      pastorPhotoUrl: site.pastorPhotoUrl || '',
      phone: site.phone || '',
      email: site.email || '',
      address: site.address || '',
      locationDetail: site.locationDetail || '',
      shuttleInfo: site.shuttleInfo || '',
      naverMapLink: site.naverMapLink || '',
      kakaoMapLink: site.kakaoMapLink || '',
      mottoText: site.mottoText || '',
      mottoReference: site.mottoReference || '',
      vision: site.vision || '',
      mission: site.mission || '',
      intro: site.intro || '',
      logoUrl: site.logoUrl || '',
      heroImageUrl: site.heroImageUrl || '',
      buildingImageUrl: site.buildingImageUrl || '',
      metaTitle: site.metaTitle || '',
      metaDesc: site.metaDesc || '',
      kakaoLink: site.kakaoLink || '',
      youtubeLink: site.youtubeLink || '',
      sermonPlaylistUrl: site.sermonPlaylistUrl || '',
      instagramLink: site.instagramLink || '',
      youtubeVideoId: site.youtubeVideoId || '',
      latestSermonTitle: site.latestSermonTitle || '',
      latestSermonSpeaker: site.latestSermonSpeaker || '',
      sermonExcerpt: site.sermonExcerpt || '',
    })
    // 구버전에 단일 worshipTime 문자열만 있던 프로젝트는, 예배 1개짜리 목록으로 자동 변환해서 데이터 유실 없이 이어서 편집 가능하게 함
    setWorshipServices(
      site.worshipServices?.length
        ? site.worshipServices.map(s => ({ title: s.title, time: s.time, place: s.place || '', note: s.note || '', group: s.group || '' }))
        : site.worshipTime
          ? [{ title: '주일예배', time: site.worshipTime, place: '', note: '', group: '' }]
          : []
    )
    setVisionItems(site.visionItems || [])
    // 예전 소식에는 id가 없어서, 예전 주소(/news/site-0 …)가 그대로 유지되게 그 자리 번호로 id를 붙여 둠
    setNewsItems((site.newsItems || []).map((n, i) => ({ ...n, id: n.id || `site-${i}` })))
    setPaperBulletins(site.paperBulletins || [])
    setStaffMembers((site.staffMembers || []).map(s => ({ ...s, photoUrl: s.photoUrl || '' })))
    setLayLeaders((site.layLeaders || []).map(l => ({ ...l, photoUrl: l.photoUrl || '' })))
    setEduMenuLabel(site.eduMenuLabel || '주일학교')
    setHistoryItems((site.historyItems || []).map(h => ({ date: h.date || '', content: h.content || '' })))
    setPraiseEnabled(site.praiseEnabled === true)
    setScheduleEnabled(site.scheduleEnabled === true)
    setJuboMenuEnabled((site as { juboMenuEnabled?: boolean }).juboMenuEnabled !== false)
    {
      const t = site as { staffEnabled?: boolean; officersEnabled?: boolean; historyEnabled?: boolean; newcomerEnabled?: boolean }
      setStaffEnabled(t.staffEnabled !== false)
      setOfficersEnabled(t.officersEnabled !== false)
      setHistoryEnabled(t.historyEnabled !== false)
      setNewcomerEnabled(t.newcomerEnabled !== false)
    }
    setSchedules((site.schedules || []).map((x, i) => ({ id: x.id || `sch-${i}`, date: x.date || '', title: x.title || '' })))
    setPraiseIntro(site.praiseIntro || '')
    setPraiseTeams((site.praiseTeams || []).map(x => ({ name: x.name || '', time: x.time || '', place: x.place || '', leader: x.leader || '', desc: x.desc || '', photoUrl: x.photoUrl || '' })))
    setNewcomerIntro(site.newcomerIntro || '')
    setNewcomerSteps((site.newcomerSteps || []).map(x => ({ title: x.title || '', desc: x.desc || '' })))
    setNewcomerContact(site.newcomerContact || '')
    setWeeklySermonEnabled(site.weeklySermonEnabled !== false)
    setNextSermon({ ...EMPTY_WEEKLY, ...(site.nextSermon || {}) })
    setNextSermonEnabled(site.nextSermonEnabled === true)
    setEduDepartments((site.eduDepartments || []).map(d => ({ name: d.name || '', target: d.target || '', time: d.time || '', place: d.place || '', leader: d.leader || '', desc: d.desc || '', photoUrl: d.photoUrl || '' })))
    setAlbums((site.albums || []).map((a, i) => ({ id: a.id || `al${i}`, title: a.title || '', date: a.date || '', photos: Array.isArray(a.photos) ? a.photos : [] })))
    setGalleryImages(site.galleryImages || [])
    setHeroImages(site.heroImages?.length ? site.heroImages : site.heroImageUrl ? [site.heroImageUrl] : [])
    setHeroTransition(site.heroTransition === 'fade' ? 'fade' : 'slide')
    setWeeklySermon({ ...EMPTY_WEEKLY, ...(site.weeklySermon || {}) })
    syncBase.current = makeSyncBase(site.newsItems || [], { ...EMPTY_WEEKLY, ...(site.weeklySermon || {}) })
    setHomeCards(EMPTY_HOME_CARDS.map((e, i) => ({ title: site.homeCards?.[i]?.title || '', desc: site.homeCards?.[i]?.desc || '', hidden: site.homeCards?.[i]?.hidden === true })))
    setHeroTextColor(/^#[0-9a-f]{6}$/i.test(site.heroTextColor || '') ? site.heroTextColor! : '#FFFFFF')
    setDenomination(site.denomination || DEFAULT_DENOMINATION)
    setDenominationWithLogo(site.denominationWithLogo === true)
    setDenominationFullName(site.denominationFullName === true)
    setHideLogo(site.hideLogo === true)
    setSermons((site.sermons || []).map(s => ({
      title: s.title || '',
      speaker: s.speaker || '',
      scripture: s.scripture || '',
      youtubeVideoId: s.youtubeVideoId || '',
      date: s.date || '',
      comments: s.comments != null ? String(s.comments) : '',
      views: s.views || '',
    })))
    setOnlineWorshipEnabled(site.onlineWorshipEnabled !== false)
    setLayoutMode(site.layoutMode === 'onepage' ? 'onepage' : 'multipage')
    setDataSource(site.dataSource === 'bulletin' || site.dataSource === 'custom' || site.dataSource === 'website' ? site.dataSource : null)
    setIntroVideoEnabled(site.introVideoEnabled !== false)
    setSermonDisplayMode(site.sermonDisplayMode === 'text' ? 'text' : 'video')
    setMainWorshipGroup(site.mainWorshipGroup || '')
    setWorshipGroupPhotos({ ...(site.worshipGroupPhotos || {}) })
    setSelectedColor(site.primaryColor || '#1B3A6B')
    setBannerMode(site.bannerMode === 'color' || site.bannerMode === 'off' ? site.bannerMode : 'photo')
    setBannerColors(Array.isArray(site.bannerColors) && site.bannerColors.length === 2 ? [site.bannerColors[0], site.bannerColors[1]] : null)
    setBannerPhotos(site.bannerPhotos && typeof site.bannerPhotos === 'object' ? { ...site.bannerPhotos } : {})
    setActiveMenus(site.activeMenus || ['home', 'worship', 'community', 'news', 'online-worship', 'location'])
    setActiveTab('weekly')
  }

  const handleSlugChange = (value: string) => {
    setSlug(value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
    setSlugError('')
  }

  // 로그인한 회원(ownerId) 소유의 교회 사이트 프로젝트 목록을 Firestore에서 불러옴
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setUid(null)
        setProjects([])
        setLoadingProjects(false)
        return
      }
      setUid(user.uid)
      try {
        const sites = await getChurchSitesByOwner(user.uid)
        // 운영자가 /super > 교회 사이트 관리의 "편집"으로 들어온 경우(?site=주소): 다른 교회 사이트도
        // 목록에 넣고 바로 연다. 소유자(ownerId)는 그대로 그 교회 — 저장해도 소유자가 바뀌지 않음
        const siteParam = new URLSearchParams(window.location.search).get('site')
        if (siteParam && isOperatorEmail(user.email)) {
          const target = sites.find(s => s.slug === siteParam) || await getChurchSite(siteParam)
          if (target) {
            if (!sites.some(s => s.slug === target.slug)) sites.unshift(target)
            setPendingOpenSlug(target.slug)
          } else {
            alert(`'${siteParam}' 주소의 사이트를 찾을 수 없어요.`)
          }
        }
        setProjects(sites)
      } catch (error) {
        console.error('프로젝트 목록 로드 실패:', error)
        setProjects([])
      } finally {
        setLoadingProjects(false)
      }
    })
    return () => unsubscribe()
  }, [])

  // ?site=주소로 들어온 사이트를 목록 로드 후 한 번만 자동으로 열기
  useEffect(() => {
    if (!pendingOpenSlug) return
    const target = projects.find(p => p.slug === pendingOpenSlug)
    if (!target) return
    setPendingOpenSlug(null)
    handleSelectProject(target)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingOpenSlug, projects])

  // 폼에 입력된 값들을 Firestore에 저장할 형태로 변환 (BuilderPage 전용 단순 필드 구조)
  const buildSitePatch = () => ({
    churchName: form.churchName.trim(),
    pastor: form.pastor,
    pastorRole: form.pastorRole,
    pastorMessage: form.pastorMessage,
    pastorTagline: form.pastorTagline,
    pastorPhotoUrl: form.pastorPhotoUrl,
    phone: form.phone,
    email: form.email,
    address: form.address,
    locationDetail: form.locationDetail,
    shuttleInfo: form.shuttleInfo,
    naverMapLink: form.naverMapLink.trim(),
    kakaoMapLink: form.kakaoMapLink.trim(),
    mottoText: form.mottoText,
    mottoReference: form.mottoReference,
    vision: form.vision,
    mission: form.mission,
    intro: form.intro,
    logoUrl: form.logoUrl,
    heroImageUrl: heroImages[0] || '',
    heroImages: heroImages.slice(0, GALLERY_MAX_IMAGES),
    heroTransition,
    heroTextColor,
    weeklySermon,
    homeCards,
    denomination,
    denominationWithLogo,
    denominationFullName,
    hideLogo,
    buildingImageUrl: form.buildingImageUrl,
    metaTitle: form.metaTitle,
    metaDesc: form.metaDesc,
    kakaoLink: form.kakaoLink,
    youtubeLink: form.youtubeLink,
    sermonPlaylistUrl: form.sermonPlaylistUrl.trim(),
    instagramLink: form.instagramLink,
    youtubeVideoId: form.youtubeVideoId ? extractYoutubeId(form.youtubeVideoId) : '',
    introVideoEnabled,
    sermonDisplayMode,
    sermonExcerpt: form.sermonExcerpt,
    latestSermonTitle: form.latestSermonTitle,
    latestSermonSpeaker: form.latestSermonSpeaker,
    worshipServices: worshipServices.filter(s => s.title.trim() || s.time.trim()),
    visionItems: visionItems.filter(v => v.title.trim() || v.desc.trim()),
    newsItems: newsItems.filter(n => n.title.trim() || n.content.trim() || (n.notice || '').trim()), // 전체 안내만 있는 소식도 저장
    paperBulletins,
    staffMembers: staffMembers.filter(s => s.name.trim() || s.role.trim()),
    layLeaders: layLeaders.filter(l => l.name.trim()),
    eduMenuLabel: eduMenuLabel.trim() || '주일학교',
    eduDepartments: eduDepartments.filter(d => d.name.trim()),
    historyItems: historyItems.filter(h => h.date.trim() || h.content.trim()),
    praiseEnabled,
    praiseIntro,
    scheduleEnabled,
    juboMenuEnabled,
    staffEnabled,
    officersEnabled,
    historyEnabled,
    newcomerEnabled,
    // 날짜·내용 둘 다 있는 일정만, 날짜순으로 저장
    schedules: schedules.filter(x => x.date && x.title.trim()).map(x => ({ ...x, title: x.title.trim() })).sort((a, z) => a.date.localeCompare(z.date)),
    praiseTeams: praiseTeams.filter(x => x.name.trim()),
    newcomerIntro,
    newcomerSteps: newcomerSteps.filter(x => x.title.trim() || x.desc.trim()),
    newcomerContact,
    weeklySermonEnabled,
    nextSermon,
    nextSermonEnabled,
    albums: albums.filter(a => a.title.trim() || a.photos.length > 0),
    galleryImages: galleryImages.slice(0, GALLERY_MAX_IMAGES),
    sermons: sermons
      .filter(s => s.title.trim())
      .map(s => ({
        title: s.title.trim(),
        speaker: s.speaker,
        scripture: s.scripture,
        youtubeVideoId: s.youtubeVideoId ? extractYoutubeId(s.youtubeVideoId) : '',
        date: s.date,
        comments: s.comments ? Number(s.comments) || 0 : 0,
        views: s.views,
      })),
    onlineWorshipEnabled,
    mainWorshipGroup,
    worshipGroupPhotos: Object.fromEntries(Object.entries(worshipGroupPhotos).filter(([g, v]) => v && worshipServices.some(w => (w.group?.trim() || WORSHIP_DEFAULT_GROUP) === g))),
    primaryColor: selectedColor,
    activeMenus,
    layoutMode,
    bannerMode,
    bannerColors,
    bannerPhotos,
    dataSource: effectiveSource,
  })

  const handleSave = async () => {
    if (!uid) { alert('로그인이 필요합니다.'); return }
    if (!form.churchName.trim()) { alert('교회 이름을 입력해주세요.'); return }

    setSaving(true)
    try {
      if (selectedProject) {
        // 기존 프로젝트 수정
        const prevSite = projects.find(p => p.slug === selectedProject)
        const patch = await replaceInlineImages(buildSitePatch(), uid)
        await updateChurchSite(selectedProject, patch)
        // 유튜브 채널·지난 설교 재생목록 주소를 바꿨으면 그 영상 목록을 바로 새로 받아 사이트 데이터에 저장해 둠(실패해도 저장엔 영향 없음)
        ;([[patch.youtubeLink, prevSite?.youtubeLink], [patch.sermonPlaylistUrl, prevSite?.sermonPlaylistUrl]] as const).forEach(([now, before]) => {
          const ytUrl = (now || '').trim()
          if (ytUrl && ytUrl !== (before || '').trim()) {
            fetch(`https://asia-northeast3-stayonsbplatform.cloudfunctions.net/youtubeVideos?url=${encodeURIComponent(ytUrl)}&site=${encodeURIComponent(selectedProject)}`).catch(() => {})
          }
        })
        setProjects(prev => prev.map(p => (p.slug === selectedProject ? { ...p, ...patch } : p)))
      } else {
        // 새 프로젝트 생성 — 로그인 계정 1개당 사이트 1개 정책(주보 플랫폼과 동일).
        // "새로 만들기" 카드는 이미 숨겨두지만, 혹시 모를 우회 경로에 대비한 안전장치
        if (projects.length > 0) {
          alert('이미 교회 사이트를 보유하고 계셔서 추가로 만들 수 없습니다.')
          setSaving(false)
          return
        }
        const formatCheck = checkSlugFormat(slug)
        if (!formatCheck.valid) { setSlugError(formatCheck.reason || '주소를 확인해주세요.'); setSaving(false); return }
        if (await isSlugTaken(slug)) { setSlugError('이미 사용 중인 주소입니다.'); setSaving(false); return }
        if (!confirmPermanentAddress(`${slug}${SITE_DOMAIN_SUFFIX}`)) { setSaving(false); return }

        await createChurchSite(slug, form.churchName.trim(), uid)
        const patch = await replaceInlineImages(buildSitePatch(), uid)
        await updateChurchSite(slug, patch)

        const newSite: ChurchSite = { slug, ownerId: uid, published: false, ...patch }
        setProjects(prev => [...prev, newSite])
        setSelectedProject(slug)
        setCreating(false)
      }
      setSavedSnack(true)
      setTimeout(() => setSavedSnack(false), 2500)
      if (!currentPending) void askBulletinSync(currentOwnerId || uid)
    } catch (error) {
      console.error('저장 실패:', error)
      alert('저장 중 오류가 발생했습니다. 다시 시도해주세요.')
    } finally {
      setSaving(false)
    }
  }

  const handleDeploy = async () => {
    if (!selectedProject) return
    setDeploying(true)
    try {
      await publishChurchSite(selectedProject)
      // 최초 배포인 경우 서버에서 firstDeployedAt/accessExpiresAt(무료체험 만료일)가 같이 설정되므로,
      // 낙관적 업데이트 대신 실제 저장된 값을 다시 불러와서 화면에 정확히 반영함
      const updated = await getChurchSite(selectedProject)
      if (updated) setProjects(prev => prev.map(p => (p.slug === selectedProject ? updated : p)))
      setDeploySnack(true)
      setTimeout(() => setDeploySnack(false), 3000)
    } catch (error) {
      console.error('배포 실패:', error)
      alert('배포 중 오류가 발생했습니다. 다시 시도해주세요.')
    } finally {
      setDeploying(false)
    }
  }

  const handleCopyUrl = async () => {
    if (!selectedProject) return
    const url = `https://${selectedProject}${SITE_DOMAIN_SUFFIX}/`
    try {
      await navigator.clipboard.writeText(url)
      setUrlCopied(true)
      setTimeout(() => setUrlCopied(false), 2000)
    } catch {
      alert('복사에 실패했습니다. 주소를 직접 선택해서 복사해주세요.')
    }
  }

  // 결제 완료 처리 (아직 실제 카드결제(PG) 연동 전 단계 — 플랜 선택을 이용 기간 연장으로 바로 반영하는
  // 사전 작업용 로직). 실제 결제 게이트웨이 연동은 별도로 진행 예정
  const handlePayment = async () => {
    if (!selectedProject) return
    setPaying(true)
    try {
      const newExpiry = await extendChurchSiteAccess(selectedProject, selectedPlanMonths)
      setProjects(prev => prev.map(p => (p.slug === selectedProject ? { ...p, accessExpiresAt: Timestamp.fromDate(newExpiry) } : p)))
      setPaymentSuccessExpiry(newExpiry)
    } catch (error) {
      console.error('결제 처리 실패:', error)
      alert('결제 처리 중 오류가 발생했습니다. 다시 시도해주세요.')
    } finally {
      setPaying(false)
    }
  }

  const closePaymentModal = () => {
    setShowPaymentModal(false)
    setPaymentSuccessExpiry(null)
    setSelectedPlanMonths(1)
  }

  // 미리보기에 표시할 도메인: 실제 슬러그(선택된 프로젝트 또는 새로 입력 중인 슬러그)를 우선 사용
  const previewDomain = (selectedProject || slug || (form.churchName ? form.churchName.toLowerCase().replace(/\s/g, '') : 'church')) + SITE_DOMAIN_SUFFIX

  // 실제 배포 화면과 100% 동일하게 보이도록, 지금 폼에 입력 중인 값들로 진짜 WebsiteRenderer에 넘길 site 객체를 즉석에서 구성
  const previewSite: ChurchSite = {
    slug: selectedProject || slug || 'preview',
    ownerId: currentOwnerId || '',
    published: true,
    ...buildSitePatch(),
  }

  const previewContainerRef = useRef<HTMLDivElement>(null)
  const previewInnerRef = useRef<HTMLDivElement>(null)
  const [previewScaledHeight, setPreviewScaledHeight] = useState(0)
  const [previewScale, setPreviewScale] = useState(0.3)

  useEffect(() => {
    const containerEl = previewContainerRef.current
    const innerEl = previewInnerRef.current
    if (!containerEl || !innerEl) return

    const recompute = () => {
      const containerWidth = containerEl.clientWidth
      const scale = containerWidth / PREVIEW_WIDTH
      setPreviewScale(scale)
      setPreviewScaledHeight(innerEl.scrollHeight * scale)
    }

    recompute()
    const observer = new ResizeObserver(recompute)
    observer.observe(containerEl)
    observer.observe(innerEl)
    return () => observer.disconnect()
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: THEME.surface, position: 'relative' }}>
      {/* 온라인 주보에서 불러오기 확인 팝업: 불러올 내용을 보여 주고 "불러오기"를 눌러야 칸에 들어감(저장은 따로) */}
      {loadAsk && (
        <div onClick={() => setLoadAsk(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.45)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={{ background: 'white', borderRadius: 28, width: '100%', maxWidth: 440, padding: 24, boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}>
            <div style={{ width: 56, height: 56, borderRadius: 999, background: '#E8F3FF', color: '#3182F6', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', fontSize: 24, fontWeight: 800 }}>↓</div>
            <h3 style={{ textAlign: 'center', fontSize: 19, fontWeight: 800, color: '#111827', marginTop: 16 }}>온라인 주보의 {loadAsk.label}을(를) 불러올까요?</h3>
            <p style={{ textAlign: 'center', fontSize: 14, color: '#6B7280', marginTop: 8, lineHeight: 1.6 }}>아래 내용이 입력칸에 들어가요. 지금 적혀 있는 내용은 바뀌어요.<br />홈페이지에는 <b>저장</b>을 눌러야 반영돼요.</p>
            <div style={{ marginTop: 18, background: '#F9FAFB', borderRadius: 16, padding: '14px 16px', maxHeight: 260, overflowY: 'auto' }}>
              <p style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 700, marginBottom: 6 }}>불러올 내용</p>
              <p style={{ fontSize: 14, color: '#1F2937', fontWeight: 600, lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'keep-all' }}>{loadAsk.value}</p>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 22 }}>
              <button type="button" onClick={() => setLoadAsk(null)} style={{ flex: 1, height: 48, background: '#F3F4F6', color: '#4B5563', border: 'none', borderRadius: 16, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>취소</button>
              <button type="button" autoFocus onClick={() => { update(loadAsk.k as keyof typeof form, loadAsk.value); setLoadAsk(null) }} style={{ flex: 1, height: 48, background: '#3182F6', color: 'white', border: 'none', borderRadius: 16, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>불러오기</button>
            </div>
          </div>
        </div>
      )}
      {/* 중직자 불러오기 확인 팝업: 온라인 주보의 중직자 목록을 보여 주고 "불러오기"를 눌러야 바뀜(저장은 따로) */}
      {leaderAsk && (
        <div onClick={() => setLeaderAsk(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.45)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={{ background: 'white', borderRadius: 28, width: '100%', maxWidth: 440, padding: 24, boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}>
            <div style={{ width: 56, height: 56, borderRadius: 999, background: '#E8F3FF', color: '#3182F6', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', fontSize: 24, fontWeight: 800 }}>↓</div>
            <h3 style={{ textAlign: 'center', fontSize: 19, fontWeight: 800, color: '#111827', marginTop: 16 }}>온라인 주보의 중직자를 불러올까요?</h3>
            <p style={{ textAlign: 'center', fontSize: 14, color: '#6B7280', marginTop: 8, lineHeight: 1.6 }}>지금 목록 대신 아래 {leaderAsk.length}명이 들어가요.<br />홈페이지에는 <b>저장</b>을 눌러야 반영돼요.</p>
            <div style={{ marginTop: 18, background: '#F9FAFB', borderRadius: 16, padding: '6px 16px', maxHeight: 280, overflowY: 'auto' }}>
              {leaderAsk.map((m, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < leaderAsk.length - 1 ? '1px solid #EEF0F3' : 'none' }}>
                  {m.photoUrl
                    ? <img src={m.photoUrl} alt="" style={{ width: 36, height: 36, borderRadius: 999, objectFit: 'cover', flexShrink: 0 }} />
                    : <span style={{ width: 36, height: 36, borderRadius: 999, background: '#E5E7EB', color: '#6B7280', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, flexShrink: 0 }}>{m.name.slice(0, 1)}</span>}
                  <span style={{ fontSize: 13, color: '#6B7280', width: 64, flexShrink: 0 }}>{m.role || '-'}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#1F2937', flex: 1, minWidth: 0 }}>{m.name}</span>
                  {m.department && <span style={{ fontSize: 12.5, color: '#9CA3AF', flexShrink: 0 }}>{m.department}</span>}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 22 }}>
              <button type="button" onClick={() => setLeaderAsk(null)} style={{ flex: 1, height: 48, background: '#F3F4F6', color: '#4B5563', border: 'none', borderRadius: 16, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>취소</button>
              <button type="button" autoFocus onClick={() => { setLayLeaders(leaderAsk.map(m => ({ ...m }))); setLeaderAsk(null) }} style={{ flex: 1, height: 48, background: '#3182F6', color: 'white', border: 'none', borderRadius: 16, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>불러오기</button>
            </div>
          </div>
        </div>
      )}
      {/* 홈페이지 저장 후 "주보에도 반영할까요?" — 같은 날짜 주보가 있고 내용이 다를 때만 */}
      {syncTargets && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.45)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'white', borderRadius: 18, width: '100%', maxWidth: 420, padding: 24, boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}>
            <h3 style={{ fontSize: 17, fontWeight: 800, color: '#111827', marginBottom: 6 }}>온라인 주보에도 반영할까요?</h3>
            <p style={{ fontSize: 13, color: THEME.muted, lineHeight: 1.6, marginBottom: 16 }}>같은 날짜의 온라인 주보가 있어요. 체크한 주보의 내용이 지금 홈페이지 내용으로 바로 바뀌어요.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflowY: 'auto', marginBottom: 20 }}>
              {syncTargets.map((x) => {
                const on = syncChecked.includes(x.date)
                return (
                  <label key={x.date} style={{ display: 'flex', alignItems: 'center', gap: 10, border: `1px solid ${on ? THEME.navy : THEME.border}`, borderRadius: 12, padding: '12px 14px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={on} onChange={() => setSyncChecked((prev) => (on ? prev.filter((d) => d !== x.date) : [...prev, x.date]))} style={{ width: 18, height: 18, accentColor: THEME.navy }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: '#111827' }}>{dotDate(x.date)} 주보</span>
                      <span style={{ display: 'block', fontSize: 12.5, color: THEME.muted, marginTop: 2 }}>{[x.news && '교회 소식', x.sermon && '이번 주 말씀'].filter(Boolean).join(' · ')}</span>
                    </span>
                  </label>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" disabled={syncing} onClick={() => setSyncTargets(null)} style={{ flex: 1, background: '#F3F4F6', color: '#374151', border: 'none', borderRadius: 12, padding: '12px 0', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>아니오</button>
              <button type="button" disabled={syncing || syncChecked.length === 0} onClick={confirmBulletinSync} style={{ flex: 1, background: THEME.navy, color: 'white', border: 'none', borderRadius: 12, padding: '12px 0', fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: syncing || syncChecked.length === 0 ? 0.5 : 1 }}>{syncing ? '반영 중…' : '예, 반영할게요'}</button>
            </div>
          </div>
        </div>
      )}
      {/* SNACK BARS */}
      {savedSnack && (
        <div style={{
          position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
          background: '#10B981', color: 'white',
          borderRadius: 10, padding: '12px 28px', fontWeight: 600, fontSize: 14,
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)', zIndex: 1000,
        }}>
          ✓ 저장되었습니다
        </div>
      )}
      {deploySnack && (
        <div style={{
          position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
          background: THEME.navy, color: 'white',
          borderRadius: 10, padding: '12px 28px', fontWeight: 600, fontSize: 14,
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)', zIndex: 1000,
        }}>
          🚀 배포가 시작되었습니다. 잠시 후 반영됩니다.
        </div>
      )}

      {/* NAV */}
      <nav style={{
        background: 'white',
        borderBottom: `1px solid ${THEME.border}`,
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}>
        <div style={{
          maxWidth: 1200, margin: '0 auto', padding: '0 24px',
          height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button
              onClick={onBack}
              style={{
                background: 'none', border: `1px solid ${THEME.border}`, borderRadius: 8,
                padding: '6px 14px', fontFamily: 'inherit', fontSize: 13, cursor: 'pointer',
                color: THEME.muted, display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              ← 뒤로
            </button>
            <div style={{ height: 20, width: 1, background: THEME.border }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, background: THEME.navy, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 13 }}>S</div>
              <span style={{ fontWeight: 700, color: THEME.navy, fontSize: 15 }}>교회 사이트 제작</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={handleSave}
              disabled={saving || (!selectedProject && !creating)}
              style={{
                background: 'white', border: `1px solid ${THEME.navy}`,
                color: THEME.navy, borderRadius: 8,
                padding: '8px 20px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13,
                cursor: saving ? 'wait' : 'pointer',
                opacity: (!selectedProject && !creating) ? 0.5 : 1,
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = THEME.skyLight }}
              onMouseLeave={e => { e.currentTarget.style.background = 'white' }}
            >
              {saving ? '저장 중...' : '저 장'}
            </button>
            <button
              onClick={handleDeploy}
              disabled={deploying || !selectedProject}
              style={{
                background: selectedProject ? THEME.navy : '#D1D5DB',
                color: 'white',
                border: 'none', borderRadius: 8,
                padding: '8px 20px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13,
                cursor: selectedProject ? 'pointer' : 'not-allowed',
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => { if (selectedProject) e.currentTarget.style.opacity = '0.88' }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
            >
              {deploying ? '배포 중...' : '배 포'}
            </button>
          </div>
        </div>
      </nav>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>

        {/* 운영자가 다른 교회 사이트를 편집 중일 때 안내 (저장하면 그 교회 사이트에 바로 반영됨) */}
        {selectedProject && uid && currentOwnerId && currentOwnerId !== uid && (
          <div style={{ background: '#FEF3C7', border: '1px solid #FCD34D', color: '#92400E', borderRadius: 12, padding: '10px 16px', fontSize: 13, fontWeight: 700, marginBottom: 20 }}>
            운영자 편집 중: {projects.find(p => p.slug === selectedProject)?.churchName || selectedProject} 사이트입니다. 저장하면 이 교회 사이트에 바로 반영돼요.
          </div>
        )}

        {/* PROJECT SELECTOR */}
        {!selectedProject && !creating ? (
          <div>
            <div style={{ marginBottom: 32, display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <h1 style={{ fontSize: 26, fontWeight: 800, color: THEME.navy, marginBottom: 6 }}>내 프로젝트</h1>
                <p style={{ color: THEME.muted, fontSize: 14 }}>기존 프로젝트를 이어서 수정하거나, 새 교회 사이트를 만들어보세요.</p>
              </div>
              {/* 요금제·결제 화면으로(2026-11-19) — 편집 화면 안 "요금제 선택하기"와 같은 곳(/pricing, 홈페이지 포함 요금제 강조) */}
              <button
                type="button"
                onClick={() => navigate('/pricing?from=builder')}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: THEME.navy, color: 'white', border: 'none', borderRadius: 12,
                  padding: '12px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                요금제 · 결제하기 →
              </button>
            </div>

            {loadingProjects ? (
              <p style={{ color: THEME.muted, fontSize: 14, padding: '24px 0' }}>프로젝트 목록을 불러오는 중입니다...</p>
            ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {/* existing */}
              {projects.map(p => {
                // 운영자가 Close한 사이트: 교회 관리자에겐 흐리게 보이고 눌러도 안 열림(운영자는 그대로)
                const locked = !!p.editLocked && !isOperatorEmail(auth.currentUser?.email)
                return (
                <button
                  key={p.slug}
                  onClick={() => handleSelectProject(p)}
                  disabled={locked}
                  aria-disabled={locked}
                  style={{
                    background: locked ? '#F9FAFB' : 'white',
                    border: `1px solid ${THEME.border}`,
                    borderRadius: 16,
                    padding: '24px',
                    cursor: locked ? 'not-allowed' : 'pointer',
                    opacity: locked ? 0.55 : 1,
                    filter: locked ? 'grayscale(1)' : undefined,
                    textAlign: 'left',
                    transition: 'all 0.18s',
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={e => { if (locked) return; e.currentTarget.style.boxShadow = '0 8px 28px rgba(27,58,107,0.12)'; e.currentTarget.style.borderColor = THEME.sky }}
                  onMouseLeave={e => { if (locked) return; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = THEME.border }}
                >
                  {/* church icon placeholder */}
                  <div style={{
                    width: 52, height: 52,
                    background: p.primaryColor || '#1B3A6B',
                    borderRadius: 12,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', fontWeight: 900, fontSize: 20,
                    marginBottom: 16,
                  }}>
                    {p.churchName[0]}
                  </div>
                  <h3 style={{ fontWeight: 700, fontSize: 16, color: THEME.text, marginBottom: 4 }}>{p.churchName}</h3>
                  <p style={{ color: THEME.sky, fontSize: 12, marginBottom: 12 }}>{p.slug}{SITE_DOMAIN_SUFFIX}</p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: THEME.muted }}>수정 {formatUpdatedDate(p)}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 600,
                      background: p.published ? '#D1FAE5' : '#FEF3C7',
                      color: p.published ? '#065F46' : '#92400E',
                      borderRadius: 100, padding: '3px 10px',
                    }}>{p.published ? '운영중' : '초안'}</span>
                  </div>
                  {locked && <p style={{ marginTop: 12, fontSize: 12, fontWeight: 600, color: THEME.muted }}>🔒 스테이온에서 준비 중이에요. 열리면 편집할 수 있어요.</p>}
                </button>
                )
              })}

              {/* new project card — 로그인 계정 1개당 사이트 1개만 허용(주보 플랫폼과 동일한 정책)이라
                  이미 보유한 사이트가 있으면 이 카드 자체를 숨김 */}
              {projects.length === 0 && (
                <button
                  onClick={() => {
                    setForm(emptyForm)
                    setWorshipServices([])
                    setVisionItems([])
                    setNewsItems([])
                    setPaperBulletins([])
                    setGalleryImages([])
                    setHeroImages([])
                    setHeroTransition('slide')
                    setDenomination(DEFAULT_DENOMINATION)
                    setDenominationWithLogo(false)
                    setDenominationFullName(false)
                    setHideLogo(false)
                    setSermons([])
                    setOnlineWorshipEnabled(true)
                    setIntroVideoEnabled(true)
                    setSermonDisplayMode('video')
                    setMainWorshipGroup('')
                    setWorshipGroupPhotos({})
                    setSlug('')
                    setSlugError('')
                    setSelectedColor('#1B3A6B')
                    setActiveTab('weekly')
                    setActiveMenus(['home', 'worship', 'community', 'news', 'online-worship', 'location'])
                    setCreating(true)
                  }}
                  style={{
                    background: 'white',
                    border: '2px dashed #CBD5E1',
                    borderRadius: 16,
                    padding: '24px',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all 0.18s',
                    fontFamily: 'inherit',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: 180,
                    gap: 12,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = THEME.sky; e.currentTarget.style.background = THEME.skyLight }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#CBD5E1'; e.currentTarget.style.background = 'white' }}
                >
                  <div style={{
                    width: 48, height: 48,
                    background: '#EEF4FF',
                    borderRadius: 12,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 24,
                  }}>+</div>
                  <div>
                    <p style={{ fontWeight: 700, color: THEME.navy, fontSize: 15, marginBottom: 4 }}>새 교회 사이트 만들기</p>
                    <p style={{ fontSize: 12, color: THEME.muted }}>처음부터 새로 시작하기</p>
                  </div>
                </button>
              )}
            </div>
            )}
          </div>
        ) : (
          <>
          {/* 사이트 운영 정보: 배포된 주소 + 이용 기간 안내 + 결제하기 (교회 사이트 제작 기능 전용) */}
          {selectedProject && (() => {
            const currentProject = projects.find(p => p.slug === selectedProject)
            if (!currentProject) return null

            if (!currentProject.published) {
              return (
                <div style={{ background: THEME.skyLight, border: '1px solid #BFDBFE', borderRadius: 16, padding: '16px 20px', marginBottom: 24 }}>
                  <p style={{ fontSize: 13, color: '#1E40AF', lineHeight: 1.6 }}>💡 아직 배포되지 않았습니다. "배포" 버튼을 누르면 이 사이트의 실제 주소와 이용 기간이 여기에 표시됩니다.</p>
                </div>
              )
            }

            const deployedUrl = `https://${currentProject.slug}${SITE_DOMAIN_SUFFIX}/`
            // 홈페이지 이용 상태(2026-11-13)
            //  ① 교회 계정이 프로·올인원 결제 중(기간 남음) → 요금제에 포함되어 이용 중
            //  ② 그 외(무료체험·베이직·스탠다드) → 첫 배포 후 30일 홈페이지 무료체험(accessExpiresAt) 기준
            // 기간이 지나도 실제 차단은 아직 안 함(보류) — 안내만
            const expiry = currentProject.accessExpiresAt?.toDate() || null
            const firstDeployed = currentProject.firstDeployedAt?.toDate() || null
            const now = new Date()
            const tier = ownerPlan?.status || 'active'
            const tierLabel = getPlanTierMeta(tier).label
            const planIncludesWeb = (tier === 'pro' || tier === 'allinone') && !!ownerPlan && !ownerPlan.expiry.isTrial && ownerPlan.expiry.daysLeft >= 0
            const isPaidOtherPlan = (tier === 'basic' || tier === 'standard') && !!ownerPlan && !ownerPlan.expiry.isTrial && ownerPlan.expiry.daysLeft >= 0
            const isExpired = expiry ? expiry.getTime() < now.getTime() : false
            const trialOnlyExpiry = firstDeployed ? firstDeployed.getTime() + 30 * 24 * 60 * 60 * 1000 : null
            // 예전 빌더 결제 창으로 늘어난 기간(무료체험 30일보다 긴 경우)
            const extended = expiry && trialOnlyExpiry ? expiry.getTime() > trialOnlyExpiry : false
            const goPricing = () => navigate('/pricing?from=builder')
            const tone = planIncludesWeb ? 'ok' : isExpired ? 'bad' : extended ? 'ok' : 'info'
            const title = planIncludesWeb
              ? `${tierLabel} 요금제 이용 중 · ${ownerPlan?.expiry.date ? formatDateKorean(ownerPlan.expiry.date) : ''}까지`
              : isExpired
                ? `홈페이지 무료체험이 끝났어요 (${expiry ? formatDateKorean(expiry) : ''}까지)`
                : extended
                  ? `${expiry ? formatDateKorean(expiry) : ''}까지 이용 가능합니다`
                  : `홈페이지 무료체험 중 · ${expiry ? formatDateKorean(expiry) : ''}까지`
            const desc = planIncludesWeb
              ? '교회 홈페이지가 요금제에 포함되어 있어요. 요금제를 연장하면 홈페이지도 같이 이어서 이용할 수 있어요.'
              : isPaidOtherPlan
                ? `지금 이용 중인 ${tierLabel} 요금제에는 홈페이지가 포함되지 않아요. 프로 · 셀프형이나 관리형으로 바꾸면 홈페이지를 계속 이용할 수 있어요.`
                : isExpired
                  ? '프로 · 셀프형이나 관리형 요금제로 시작하면 홈페이지를 계속 이용할 수 있어요.'
                  : '교회 홈페이지는 프로 · 셀프형, 관리형 요금제에 포함돼 있어요. 무료체험이 끝나기 전에 시작해 보세요.'
            const colors = tone === 'ok'
              ? { bg: '#ECFDF5', border: '#A7F3D0', title: '#047857', desc: THEME.muted }
              : tone === 'bad'
                ? { bg: '#FEF2F2', border: '#FECACA', title: '#B91C1C', desc: '#DC2626' }
                : { bg: '#EFF6FF', border: '#BFDBFE', title: THEME.navy, desc: THEME.muted }

            return (
              <div style={{ marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* 배포된 URL */}
                <div style={{ background: 'white', border: `1px solid ${THEME.border}`, borderRadius: 16, padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: THEME.muted, marginBottom: 6 }}>🌐 배포된 사이트 주소</p>
                    <p style={{ fontSize: 16, fontWeight: 700, color: THEME.navy, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deployedUrl}</p>
                  </div>
                  <button
                    onClick={handleCopyUrl}
                    style={{
                      padding: '10px 18px', borderRadius: 10, fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                      border: `1px solid ${urlCopied ? '#10B981' : THEME.sky}`,
                      background: urlCopied ? '#ECFDF5' : THEME.skyLight,
                      color: urlCopied ? '#059669' : THEME.sky,
                      transition: 'all 0.15s', whiteSpace: 'nowrap',
                    }}
                  >
                    {urlCopied ? '✓ 복사됨' : '📋 주소 복사'}
                  </button>
                </div>

                {/* 이용 상태 안내 배너 → 결제는 /pricing(프로·올인원) */}
                {(expiry || planIncludesWeb) && (
                  <div style={{
                    borderRadius: 16, padding: '18px 24px',
                    background: colors.bg, border: `1px solid ${colors.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
                  }}>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 700, color: colors.title, marginBottom: 4 }}>{title}</p>
                      <p style={{ fontSize: 13, color: colors.desc }}>{desc}</p>
                    </div>
                    <button
                      onClick={goPricing}
                      style={{
                        padding: '12px 22px', borderRadius: 10, fontFamily: 'inherit', fontWeight: 700, fontSize: 14, cursor: 'pointer',
                        border: 'none', background: THEME.sky, color: 'white', whiteSpace: 'nowrap',
                      }}
                    >
                      {planIncludesWeb ? '요금제 보기' : '요금제 선택하기'}
                    </button>
                  </div>
                )}
              </div>
            )
          })()}

          {/* 위쪽 탭: 교회 홈페이지 / 교회 주보(종이 주보 만들기) — 사이트를 연 뒤에만 */}
          {selectedProject && (
            <div style={{ display: 'flex', gap: 4, background: '#EEF1F5', borderRadius: 14, padding: 4, marginBottom: 20, width: 'fit-content' }}>
              {([['site', '🌐 교회 홈페이지'], ['paper', '📄 교회 주보 (종이 주보 만들기)']] as const).map(([v, l]) => (
                <button key={v} type="button" onClick={() => setBuilderMode(v)}
                  style={{ border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
                    background: builderMode === v ? 'white' : 'transparent', color: builderMode === v ? THEME.navy : THEME.muted, boxShadow: builderMode === v ? '0 1px 3px rgba(0,0,0,.08)' : 'none' }}>{l}</button>
              ))}
            </div>
          )}
          {selectedProject && builderMode === 'paper' && (() => {
            const cur = projects.find(p => p.slug === selectedProject)
            return (
              <div style={{ marginBottom: 24 }}>
                <PaperJuboEditor
                  key={selectedProject}
                  slug={selectedProject}
                  initial={((cur as { paperJubo?: PaperJubo } | undefined)?.paperJubo) || null}
                  churchName={cur?.churchName || form.churchName}
                  onSaved={(pjNew) => setProjects(prev => prev.map(p => (p.slug === selectedProject ? ({ ...p, paperJubo: pjNew } as typeof p) : p)))}
                />
              </div>
            )
          })()}

          {/* BUILDER LAYOUT */}
          {/* 왼쪽 칸은 minmax(0,1fr): 안에 긴 글자(주보 파일 제목 등)가 있어도 왼쪽 칸이 늘어나 미리보기를 화면 밖으로 밀지 않게 */}
          <div style={{ display: selectedProject && builderMode === 'paper' ? 'none' : 'grid', gridTemplateColumns: 'minmax(0, 1fr) 380px', gap: 24, alignItems: 'start' }}>

            {/* LEFT: FORM */}
            <div style={{ minWidth: 0 }}>
              <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                  onClick={goBackToList}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: THEME.muted, fontSize: 14, fontFamily: 'inherit' }}
                >
                  ← 프로젝트 목록
                </button>
                <span style={{ color: THEME.border }}>|</span>
                <h2 style={{ fontWeight: 700, fontSize: 20, color: THEME.navy }}>
                  {selectedProject ? projects.find(p => p.slug === selectedProject)?.churchName : '새 교회 사이트'}
                </h2>
              </div>

              {/* 교회 정보 가져오기 방식: 셋 중 하나를 고르는 선택 카드(고른 카드는 남색 테두리 + 연한 파랑 바탕 + 체크 표시) */}
              <div style={{ background: 'white', border: `1px solid ${THEME.border}`, borderRadius: 16, padding: '20px 20px 18px', marginBottom: 16 }}>
                <p style={{ fontSize: 15, fontWeight: 800, color: THEME.navy }}>교회 정보 가져오기</p>
                <p style={{ fontSize: 12.5, color: THEME.muted, marginTop: 4, marginBottom: 14 }}>홈페이지에 보일 교회 정보(담임목사·예배 시간·교회 소개 등)를 어디서 가져올지 골라 주세요.</p>
                <div role="radiogroup" aria-label="교회 정보 가져오기" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                  {([
                    ['bulletin', '🔗', '주보와 연동', '온라인 주보 내용을 홈페이지에 그대로 보여 줘요. 주보만 고치면 홈페이지도 바뀌어요.', !bulletinReady],
                    ['custom', '✏️', '주보와 다르게', '주보 내용을 채워 두되, 여기서 고친 내용이 홈페이지에 나와요.', !bulletinReady],
                    ['website', '🌐', '홈페이지만 사용', '주보 플랫폼은 안 써요. 여기에 입력한 내용이 홈페이지에 나와요.', false],
                  ] as const).map(([value, icon, label, desc, disabled]) => {
                    const on = effectiveSource === value
                    return (
                      <button key={value} type="button" role="radio" aria-checked={on} disabled={disabled} onClick={() => chooseDataSource(value)}
                        style={{
                          position: 'relative', textAlign: 'left', borderRadius: 14, padding: '14px 14px 14px',
                          border: `2px solid ${on ? THEME.navy : '#E5E7EB'}`, background: on ? '#F0F5FF' : 'white',
                          boxShadow: on ? '0 4px 14px rgba(27,58,107,0.12)' : 'none',
                          cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1, transition: 'all 0.15s',
                        }}>
                        {/* 오른쪽 위 선택 표시: 고르면 남색 원 + 체크, 아니면 빈 원 */}
                        <span aria-hidden style={{ position: 'absolute', top: 12, right: 12, width: 22, height: 22, borderRadius: 999, border: on ? 'none' : '2px solid #D1D5DB', background: on ? THEME.navy : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {on && <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
                        </span>
                        <span style={{ fontSize: 22, lineHeight: 1 }}>{icon}</span>
                        <span style={{ display: 'block', marginTop: 10, paddingRight: 24, fontSize: 14.5, fontWeight: 800, color: on ? THEME.navy : THEME.text }}>{label}</span>
                        <span style={{ display: 'block', marginTop: 4, fontSize: 12, color: THEME.muted, lineHeight: 1.55 }}>{desc}</span>
                        {disabled && <span style={{ display: 'inline-block', marginTop: 8, fontSize: 11, fontWeight: 700, color: '#6B7280', background: '#F3F4F6', borderRadius: 999, padding: '2px 8px' }}>발행된 주보 없음</span>}
                      </button>
                    )
                  })}
                </div>
                {effectiveSource === 'bulletin' && (
                  <p style={{ fontSize: 12, color: '#1E3A8A', background: '#EFF6FF', borderRadius: 10, padding: '9px 12px', marginTop: 12, lineHeight: 1.5 }}>
                    아래 칸에는 주보 최신 내용이 채워져 있어요. 홈페이지에는 주보 내용이 그대로 나오니, 홈페이지만 다르게 고치려면 <b>주보와 다르게</b>를 골라 주세요.
                  </p>
                )}
              </div>

              {/* TABS — 선택 표시(남색 알약)가 누른 탭으로 스르륵 미끄러져 감 */}
              <BuilderTabs
                tabs={[
                  // 홈페이지 상단 메뉴와 같은 순서. 매주 바뀌는 것은 맨 앞 "매주 업데이트" 하나에
                  { key: 'weekly', label: '매주 업데이트' },
                  { key: 'home', label: '홈 화면' },
                  { key: 'about', label: '교회소개' },
                  { key: 'worship', label: '예배' },
                  { key: 'edu', label: eduMenuLabel.trim() || '교육부서' },
                  { key: 'settings', label: '기본 설정' },
                ]}
                active={activeTab}
                onChange={k => setActiveTab(k as typeof activeTab)}
              />

              {/* 탭을 바꿀 때 내용이 살짝 아래에서 올라오며 나타남(key가 바뀌면 다시 재생).
                  한 탭의 카드가 아래 여러 묶음에서 올 수 있어 묶음 사이도 같은 간격(20) */}
              <div key={activeTab} className="animate-in fade-in slide-in-from-bottom-2 duration-300" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* 매주 업데이트: 이번 주 말씀 */}
              {activeTab === 'weekly' && (
                <>
                <WeeklySermonCard
                  value={weeklySermon}
                  onChange={setWeeklySermon}
                  fromBulletin={effectiveSource === 'bulletin'}
                  enabled={weeklySermonEnabled}
                  onToggle={setWeeklySermonEnabled}
                />
                <WeeklySermonCard
                  heading="다음 주 말씀"
                  help={<>켜 두면 홈페이지 <b>말씀/영상</b> 화면의 "이번 주 말씀" 아래에 "다음 주 말씀" 카드로 나와요. 설교 제목을 적어야 보여요.</>}
                  value={nextSermon}
                  onChange={setNextSermon}
                  fromBulletin={false}
                  enabled={nextSermonEnabled}
                  onToggle={setNextSermonEnabled}
                />
                </>
              )}

              {/* 홈 화면: 메인 바로가기 카드 문구 */}
              {activeTab === 'home' && (
                <HomeCardsEditor value={homeCards} onChange={setHomeCards} churchName={form.churchName.trim() || '우리 교회'} />
              )}

              {/* 홈 화면: 화면 방식 — 홈 화면 탭 맨 위(order -2, 디자인·메인 사진(-1)보다 위) */}
              {activeTab === 'home' && (
                <div style={{ order: -2, display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${THEME.border}`, padding: '28px' }}>
                    <h3 style={{ fontWeight: 700, color: THEME.navy, marginBottom: 6, fontSize: 16 }}>화면 방식</h3>
                    <p style={{ color: THEME.muted, fontSize: 13, marginBottom: 16 }}>페이지 전환형은 메뉴마다 주소가 따로 있어서 네이버·구글 검색에 더 잘 노출돼요.</p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
                      {([
                        ['multipage', '페이지 전환형 (추천)', '메뉴를 누르면 그 내용만 담긴 새 페이지로 넘어가요',
                          ['메뉴마다 주소가 따로 생겨서(예: /about, /sermons) 검색에 잘 나와요', '설교·주보·소식이 많아도 깔끔하게 정리돼요', '대부분의 교회 홈페이지가 이 방식이에요']],
                        ['onepage', '원페이지형', '모든 내용이 한 페이지에 이어져 있어 아래로 내려 보며 읽어요',
                          ['메뉴를 누르면 같은 페이지 안에서 그 위치로 스크롤돼요', '내용이 적은 작은 교회·개척교회에 어울려요', '주소가 하나라 검색 노출은 전환형보다 약해요']],
                      ] as const).map(([value, label, desc, points]) => {
                        const on = layoutMode === value
                        return (
                          <label key={value} style={{ cursor: 'pointer', padding: '16px', borderRadius: 14, background: on ? THEME.skyLight : '#F9FAFB', border: `2px solid ${on ? THEME.navy : THEME.border}`, transition: 'all 0.15s' }}>
                            <input type="radio" name="layoutMode" checked={on} onChange={() => setLayoutMode(value)} style={{ display: 'none' }} />
                            <LayoutModeSketch mode={value} active={on} />
                            <p style={{ fontWeight: 700, color: THEME.navy, fontSize: 14, marginTop: 12 }}>{label}</p>
                            <p style={{ color: THEME.text, fontSize: 12.5, marginTop: 4, lineHeight: 1.5 }}>{desc}</p>
                            <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none' }}>
                              {points.map(t => (
                                <li key={t} style={{ display: 'flex', gap: 6, color: THEME.muted, fontSize: 12, lineHeight: 1.6 }}>
                                  <span style={{ color: on ? THEME.navy : '#9CA3AF', flexShrink: 0 }}>•</span>{t}
                                </li>
                              ))}
                            </ul>
                          </label>
                        )
                      })}
                    </div>
                  </div>

                  {/* 화면 위쪽 배너: 사진(기본 사진 / 화면별 우리 교회 사진) · 색상(투톤) · 끄기 — 페이지 전환형에서만 */}
                  {layoutMode === 'multipage' && (
                  <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${THEME.border}`, padding: '28px' }}>
                    <h3 style={{ fontWeight: 700, color: THEME.navy, marginBottom: 6, fontSize: 16 }}>화면 위쪽 배너</h3>
                    <p style={{ color: THEME.muted, fontSize: 13, marginBottom: 16 }}>교회 소개·예배 안내 같은 각 화면 맨 위 제목 부분이에요. 오른쪽 미리보기에서 메뉴를 눌러 확인해 보세요.</p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: bannerMode === 'off' ? 0 : 20 }}>
                      {([['photo', '사진', '화면마다 어울리는 사진'], ['color', '색상', '두 색 그라데이션(투톤)'], ['off', '끄기', '옅은 교회 색 띠']] as const).map(([v, label, desc]) => {
                        const on = bannerMode === v
                        return (
                          <button key={v} type="button" onClick={() => setBannerMode(v)}
                            style={{ cursor: 'pointer', textAlign: 'left', padding: '12px 14px', borderRadius: 12, background: on ? THEME.skyLight : '#F9FAFB', border: `2px solid ${on ? THEME.navy : THEME.border}`, fontFamily: 'inherit', transition: 'all 0.15s' }}>
                            <p style={{ fontWeight: 700, color: THEME.navy, fontSize: 14 }}>{label}</p>
                            <p style={{ color: THEME.muted, fontSize: 12, marginTop: 2 }}>{desc}</p>
                          </button>
                        )
                      })}
                    </div>

                    {bannerMode === 'photo' && (
                      <div>
                        <p style={{ color: THEME.text, fontSize: 13, fontWeight: 600, marginBottom: 10 }}>화면별 사진 <span style={{ color: THEME.muted, fontWeight: 400 }}>· 바꾸지 않으면 기본 사진이 보여요. 올린 사진은 가로로 긴 배너 모양(4:1)으로 가운데가 잘려요.</span></p>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 10 }}>
                          {BANNER_PAGES.map((pg) => {
                            const custom = bannerPhotos[pg.key]
                            const src = custom || defaultBannerPhoto(pg.key)
                            const busy = uploadingBannerKey === pg.key
                            return (
                              <div key={pg.key} style={{ border: `1px solid ${THEME.border}`, borderRadius: 12, overflow: 'hidden', background: '#FAFBFC' }}>
                                <div style={{ position: 'relative', aspectRatio: '4 / 1', background: `center / cover no-repeat url(${src})` }}>
                                  <span style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.25)' }} />
                                  <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 800, fontSize: 13 }}>{pg.label}</span>
                                  {custom && <span style={{ position: 'absolute', top: 6, left: 6, background: THEME.navy, color: 'white', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 6 }}>우리 교회 사진</span>}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: '8px 10px' }}>
                                  <label style={{ cursor: busy ? 'default' : 'pointer', fontSize: 12, fontWeight: 700, color: THEME.navy }}>
                                    {busy ? '올리는 중…' : custom ? '사진 바꾸기' : '우리 교회 사진으로'}
                                    <input type="file" accept="image/*" style={{ display: 'none' }} disabled={busy}
                                      onChange={async (e) => {
                                        const file = e.target.files?.[0]
                                        e.target.value = ''
                                        if (!file || !uid) return
                                        setUploadingBannerKey(pg.key)
                                        try {
                                          const blob = await cropToBannerBlob(file)
                                          const fileRef = storageRef(storage, `churchSiteUploads/${uid}/banner-${pg.key}-${Date.now()}.jpg`)
                                          await uploadBytes(fileRef, blob, { contentType: 'image/jpeg' })
                                          const url = await getDownloadURL(fileRef)
                                          setBannerPhotos(prev => ({ ...prev, [pg.key]: url }))
                                        } catch (err) {
                                          console.error('배너 사진 올리기 실패:', err)
                                          alert('사진을 올리지 못했어요. 다시 시도해 주세요.')
                                        } finally {
                                          setUploadingBannerKey(null)
                                        }
                                      }} />
                                  </label>
                                  {custom && (
                                    <button type="button" onClick={() => setBannerPhotos(prev => { const n = { ...prev }; delete n[pg.key]; return n })}
                                      style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, color: THEME.muted, fontFamily: 'inherit' }}>기본 사진으로</button>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {bannerMode === 'color' && (() => {
                      const [c1, c2] = resolveBannerColors(bannerColors, selectedColor)
                      const dark = bannerTextIsDark(c1, c2)
                      return (
                        <div>
                          {/* 미리보기 */}
                          <div style={{ borderRadius: 12, height: 90, background: `linear-gradient(120deg, ${c1}, ${c2})`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                            <span style={{ fontSize: 10, letterSpacing: '0.3em', fontWeight: 700, color: dark ? '#374151' : 'rgba(255,255,255,0.85)' }}>WORSHIP</span>
                            <span style={{ fontSize: 20, fontWeight: 900, color: dark ? '#111827' : 'white' }}>예배 안내</span>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
                            {BANNER_PRESETS.map((pr) => {
                              const cols = pr.id === 'church' ? resolveBannerColors(null, selectedColor) : pr.colors
                              const on = pr.id === 'church' ? bannerColors === null : !!bannerColors && bannerColors[0] === pr.colors[0] && bannerColors[1] === pr.colors[1]
                              return (
                                <button key={pr.id} type="button" onClick={() => setBannerColors(pr.id === 'church' ? null : pr.colors)}
                                  style={{ cursor: 'pointer', padding: 6, borderRadius: 10, border: `2px solid ${on ? THEME.navy : THEME.border}`, background: 'white', fontFamily: 'inherit' }}>
                                  <span style={{ display: 'block', height: 30, borderRadius: 6, background: `linear-gradient(120deg, ${cols[0]}, ${cols[1]})` }} />
                                  <span style={{ display: 'block', marginTop: 5, fontSize: 12, fontWeight: 700, color: on ? THEME.navy : THEME.text }}>{pr.label}</span>
                                </button>
                              )
                            })}
                          </div>
                          {/* 직접 고르기: 두 색이 같으면 단색 */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: THEME.text }}>직접 고르기</span>
                            {[0, 1].map((i) => (
                              <label key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: THEME.muted }}>
                                <input type="color" value={[c1, c2][i]} onChange={(e) => {
                                  const next: [string, string] = [c1, c2]
                                  next[i] = e.target.value
                                  setBannerColors(next)
                                }} style={{ width: 34, height: 28, border: `1px solid ${THEME.border}`, borderRadius: 6, padding: 0, background: 'none', cursor: 'pointer' }} />
                                {i === 0 ? '왼쪽 색' : '오른쪽 색'}
                              </label>
                            ))}
                            <button type="button" onClick={() => setBannerColors([c1, c1])}
                              style={{ border: `1px solid ${THEME.border}`, background: 'white', borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 600, color: THEME.text, cursor: 'pointer', fontFamily: 'inherit' }}>단색으로</button>
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                  )}
                </div>
              )}

              {/* 기본 설정: 교회 이름·주소(홈페이지)·연락처 */}
              {activeTab === 'settings' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${THEME.border}`, padding: '28px' }}>
                    <h3 style={{ fontWeight: 700, color: THEME.navy, marginBottom: 24, fontSize: 16 }}>교회 기본 정보</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                      <Field label="교회 이름 *" placeholder="ex. 새벽교회" value={form.churchName} onChange={v => update('churchName', v)} hint={bulletinHint('churchName')} action={bulletinLoad('churchName')} />
                      {!selectedProject && (
                        <div>
                          <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>홈페이지 주소 *</label>
                          <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #D1D5DB', borderRadius: 8, padding: '2px 14px', background: 'white' }}>
                            <input
                              value={slug}
                              onChange={e => handleSlugChange(e.target.value)}
                              placeholder="manna"
                              style={{ flex: 1, border: 'none', outline: 'none', fontFamily: 'inherit', fontSize: 14, padding: '8px 0', background: 'transparent' }}
                            />
                            <span style={{ color: '#9CA3AF', fontSize: 12, whiteSpace: 'nowrap' }}>{SITE_DOMAIN_SUFFIX}</span>
                          </div>
                          {slugError ? (
                            <p style={{ fontSize: 12, color: '#DC2626', marginTop: 4 }}>{slugError}</p>
                          ) : (
                            <p style={{ fontSize: 12, color: THEME.muted, marginTop: 4 }}>영문 소문자, 숫자, 하이픈만 (3~30자) · <b style={{ color: '#DC2626' }}>한 번 정하면 바꿀 수 없어요</b></p>
                          )}
                        </div>
                      )}
                      <Field label="대표 전화" placeholder="ex. 02-1234-5678" value={form.phone} onChange={v => update('phone', v)} hint={bulletinHint('phone')} action={bulletinLoad('phone')} />
                      <Field label="이메일" placeholder="ex. church@example.com" value={form.email} onChange={v => update('email', v)} hint={bulletinHint('email')} action={bulletinLoad('email')} />
                    </div>
                  </div>
                </div>
              )}

              {/* 교회소개: 교회 소개 문구 · 오시는 길 · 담임목사 (아래 다른 묶음에서 전경 사진·섬기는 사람들·중직자) */}
              {activeTab === 'about' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${THEME.border}`, padding: '28px' }}>
                    <h3 style={{ fontWeight: 700, color: THEME.navy, marginBottom: 6, fontSize: 16 }}>교회 소개</h3>
                    <p style={{ color: THEME.muted, fontSize: 13, marginBottom: 16 }}>홈페이지 '교회 소개'와 메인 사진 위 표어에 나오는 내용이에요.</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {/* 표어: 메인 사진 위(교회 이름 아래)와 교회 소개 페이지 맨 위에 나옴 */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 200px', gap: 12 }}>
                        <Field label="표어 (주제 성구)" placeholder="ex. 내가 곧 길이요 진리요 생명이니" value={form.mottoText} onChange={v => update('mottoText', v)} hint={bulletinHint('mottoText')} action={bulletinLoad('mottoText')} />
                        <Field label="성구" placeholder="ex. 요한복음 14:6" value={form.mottoReference} onChange={v => update('mottoReference', v)} hint={bulletinHint('mottoReference')} action={bulletinLoad('mottoReference')} />
                      </div>
                      <TextareaField label="교회 소개" placeholder="교회를 간략하게 소개해 주세요." value={form.intro} onChange={v => update('intro', v)} hint={bulletinHint('intro')} action={bulletinLoad('intro')} />
                      <TextareaField label="비전 (선택)" placeholder="ex. 다음 세대를 세우는 교회" value={form.vision} onChange={v => update('vision', v)} hint={bulletinHint('vision')} action={bulletinLoad('vision')} />
                      <TextareaField label="사명 (선택)" placeholder="ex. 예배로 살고 복음을 전하는 교회" value={form.mission} onChange={v => update('mission', v)} hint={bulletinHint('mission')} action={bulletinLoad('mission')} />
                    </div>
                  </div>
                  <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${THEME.border}`, padding: '28px' }}>
                    <h3 style={{ fontWeight: 700, color: THEME.navy, marginBottom: 6, fontSize: 16 }}>오시는 길</h3>
                    <p style={{ color: THEME.muted, fontSize: 13, marginBottom: 16 }}>홈페이지 '오시는 길'에 지도와 함께 나와요.</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 20 }}>
                      <div>
                        <Field label="주소" placeholder="ex. 서울특별시 마포구 ..." value={form.address} onChange={v => update('address', v)} hint={bulletinHint('address')} action={bulletinLoad('address')} />
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <Field label="상세 위치 안내" placeholder="ex. 상가 3층, 엘리베이터 옆 계단으로 올라오세요" value={form.locationDetail} onChange={v => update('locationDetail', v)} hint={bulletinHint('locationDetail')} action={bulletinLoad('locationDetail')} />
                        <p style={{ fontSize: 12, color: THEME.muted, marginTop: 4 }}>상가/건물 안에 있는 경우, 처음 오시는 분이 헷갈리지 않도록 입구·층수 등을 적어주세요.</p>
                      </div>
                      {/* 네이버 지도·카카오맵 버튼(2026-11-21): 교회가 직접 넣은 링크/검색어로 열림. 비우면 위 주소로 검색 */}
                      <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                        <Field label="네이버 지도 (선택)" placeholder="ex. https://naver.me/xxxx 또는 대구나눔의교회" value={form.naverMapLink} onChange={v => update('naverMapLink', v)} />
                        <Field label="카카오맵 (선택)" placeholder="ex. https://kko.to/xxxx 또는 대구나눔의교회" value={form.kakaoMapLink} onChange={v => update('kakaoMapLink', v)} />
                      </div>
                      <p style={{ gridColumn: '1 / -1', fontSize: 12, color: THEME.muted, marginTop: -12, lineHeight: 1.6 }}>
                        홈페이지 '네이버 지도'·'카카오맵' 버튼을 누르면 열리는 곳이에요. 지도 앱에서 우리 교회를 찾아 <b>공유 → 링크 복사</b>한 주소를 붙여 넣거나, 검색할 이름(ex. 교회 이름)을 적어 주세요. 비워 두면 위 주소로 검색돼요.
                      </p>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <TextareaField label="차량 운행 안내 (선택)" placeholder={"ex. 주일 오전 9:30 ○○아파트 정문 출발 → 교회\n주일 오후 1:00 교회 출발 → ○○역\n문의: 010-0000-0000"} value={form.shuttleInfo} onChange={v => update('shuttleInfo', v)} />
                        <p style={{ fontSize: 12, color: THEME.muted, marginTop: 4 }}>홈페이지 '오시는 길'에 펼쳐 보기로 나와요. 비워 두면 표시되지 않아요.</p>
                      </div>
                    </div>
                  </div>

                  <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${THEME.border}`, padding: '28px' }}>
                    <h3 style={{ fontWeight: 700, color: THEME.navy, marginBottom: 6, fontSize: 16 }}>담임 목사 소개</h3>
                    <p style={{ color: THEME.muted, fontSize: 13, marginBottom: 20 }}>방문자에게 첫인사를 전하는 인사말이에요.</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
                      <Field label="담임 목사 성함 *" placeholder="ex. 홍길동" value={form.pastor} onChange={v => update('pastor', v)} hint={bulletinHint('pastor')} action={bulletinLoad('pastor')} />
                      <Field label="직분" placeholder="ex. 담임목사" value={form.pastorRole} onChange={v => update('pastorRole', v)} hint={bulletinHint('pastorRole')} action={bulletinLoad('pastorRole')} />
                    </div>
                    <div style={{ marginBottom: 20 }}>
                      <TextareaField
                        label="짧은 소개 (선택)"
                        placeholder="ex. 고난을 말씀으로 해석하고, 삶의 모든 자리에서 십자가의 복음을 살아 내도록 돕습니다."
                        value={form.pastorTagline}
                        onChange={v => update('pastorTagline', v)}
                        hint={bulletinHint('pastorTagline')} action={bulletinLoad('pastorTagline')}
                      />
                      <p style={{ fontSize: 12, color: THEME.muted, marginTop: 6 }}>목사님 성함 아래 표시되는 한 줄 소개예요. 2~3줄 정도가 적당해요.</p>
                    </div>
                    <div style={{ marginBottom: 20 }}>
                      <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 10 }}>목사님 사진 <span style={{ fontWeight: 400, color: THEME.muted }}>(선택)</span></label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {form.pastorPhotoUrl ? (
                          <img src={form.pastorPhotoUrl} alt="목사님 사진 미리보기" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 10, border: `1px solid ${THEME.border}` }} />
                        ) : (
                          <div style={{ width: 56, height: 56, borderRadius: 10, border: `1px dashed ${THEME.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: THEME.muted }}>없음</div>
                        )}
                        <label style={{ padding: '9px 16px', borderRadius: 8, border: `1px solid ${THEME.border}`, background: 'white', fontSize: 13, fontWeight: 600, color: THEME.text, cursor: 'pointer' }}>
                          {uploadingPastorPhoto ? '업로드 중...' : '사진 선택'}
                          <input type="file" accept="image/*" onChange={handlePastorPhotoFileChange} disabled={uploadingPastorPhoto} style={{ display: 'none' }} />
                        </label>
                        {form.pastorPhotoUrl && (
                          <button type="button" onClick={() => update('pastorPhotoUrl', '')} style={{ fontSize: 12, color: THEME.muted, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>삭제</button>
                        )}
                      </div>
                    </div>
                    <TextareaField label="인사말 (MESSAGE)" placeholder="성도님들과 방문객을 환영하는 인사말을 적어주세요." value={form.pastorMessage} onChange={v => update('pastorMessage', v)} hint={bulletinHint('pastorMessage')} action={bulletinLoad('pastorMessage')} />
                    <p style={{ fontSize: 12, color: THEME.muted, marginTop: 6 }}>소개 카드 아래 별도 박스로 크게 표시돼요. 4~5줄 정도로 적어도 좋아요.</p>
                  </div>
                </div>
              )}

              {/* WORSHIP TAB */}
              {activeTab === 'worship' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${THEME.border}`, padding: '28px' }}>
                    <h3 style={{ fontWeight: 700, color: THEME.navy, marginBottom: 6, fontSize: 16 }}>예배 안내</h3>
                    {listHint(worshipServices.map(w => `${w.title} ${w.time}`), (bulletinDefaults?.worshipServices || []).map(w => `${w.title} ${w.time}`))}
                    <p style={{ color: THEME.muted, fontSize: 13, marginBottom: 20 }}>주일예배, 수요예배, 금요철야처럼 원하는 이름으로 구분을 만들고, 그 안에 1부·2부 같은 세부 예배를 등록하세요. 구분마다 실제 사이트에도 각각의 카드로 나뉘어서 보여져요.</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
                      {worshipGroupNames.map((group) => (
                        <div key={group} style={{ border: `1px solid ${THEME.border}`, borderRadius: 12, padding: 16, background: '#FAFBFC' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <h4 style={{ fontWeight: 700, color: THEME.navy, fontSize: 14 }}>{group}</h4>
                              {mainWorshipGroup === group && (
                                <span style={{ fontSize: 11, fontWeight: 700, color: '#1D4ED8', background: '#EFF6FF', borderRadius: 999, padding: '2px 8px' }}>본 예배</span>
                              )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                              <button
                                onClick={() => setMainWorshipGroup(prev => (prev === group ? '' : group))}
                                style={{ fontSize: 12, fontWeight: 600, color: mainWorshipGroup === group ? '#1D4ED8' : THEME.muted, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                              >
                                {mainWorshipGroup === group ? '본 예배 해제' : '본 예배로 지정'}
                              </button>
                              <button onClick={() => removeWorshipGroup(group)} style={removeLinkStyle}>이 구분 전체 삭제</button>
                            </div>
                          </div>
                          {/* 대표 사진: 홈페이지 예배 안내 카드 왼쪽에 나옴(없으면 빈 사진 자리) */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, background: 'white', border: `1px solid ${THEME.border}`, borderRadius: 10, padding: 10 }}>
                            <div style={{ width: 96, height: 64, borderRadius: 8, overflow: 'hidden', background: '#F3F4F6', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', fontSize: 11 }}>
                              {worshipGroupPhotos[group] ? <img src={worshipGroupPhotos[group]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '사진 없음'}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{group} 대표 사진</p>
                              <p style={{ fontSize: 12, color: THEME.muted, marginTop: 2 }}>예배 안내 카드 왼쪽에 나와요. 가로 사진을 권장해요.</p>
                            </div>
                            <label style={{ flexShrink: 0, fontSize: 12.5, fontWeight: 700, color: '#2563EB', background: '#EFF6FF', borderRadius: 999, padding: '6px 12px', cursor: 'pointer' }}>
                              {uploadingWorshipGroup === group ? '올리는 중…' : worshipGroupPhotos[group] ? '바꾸기' : '사진 올리기'}
                              <input type="file" accept="image/*" style={{ display: 'none' }} disabled={uploadingWorshipGroup === group} onChange={e => handleWorshipGroupPhoto(group, e)} />
                            </label>
                            {worshipGroupPhotos[group] && (
                              <button type="button" onClick={() => setWorshipGroupPhotos(prev => { const n = { ...prev }; delete n[group]; return n })} style={{ ...removeLinkStyle, flexShrink: 0 }}>삭제</button>
                            )}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
                            {worshipServices.map((s, i) => {
                              const key = s.group?.trim() || WORSHIP_DEFAULT_GROUP
                              if (key !== group) return null
                              return (
                                <div key={i} style={{ border: `1px solid ${THEME.border}`, borderRadius: 10, padding: 12, background: 'white' }}>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 8 }}>
                                    <Field label="예배명" placeholder="ex. 1부" value={s.title} onChange={v => updateWorshipService(i, 'title', v)} />
                                    <div>
                                      {/* 요일마다 시간이 다른 예배(새벽기도 등)는 엔터로 줄을 나눠 적으면 홈페이지에도 줄바꿈 그대로 나옴 */}
                                      <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>시간</label>
                                      <textarea value={s.time} onChange={e => updateWorshipService(i, 'time', e.target.value)} placeholder={'ex. 오전 9:00\n(엔터로 줄바꿈)'}
                                        rows={Math.max(1, s.time.split('\n').length)} style={{ ...inputStyle, resize: 'vertical' }} />
                                    </div>
                                  </div>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                    <Field label="장소" placeholder="ex. 본당 2층" value={s.place} onChange={v => updateWorshipService(i, 'place', v)} />
                                    <Field label="비고 (선택)" placeholder="ex. 유아부 동반 가능" value={s.note} onChange={v => updateWorshipService(i, 'note', v)} />
                                  </div>
                                  <button onClick={() => removeWorshipService(i)} style={removeLinkStyle}>삭제</button>
                                </div>
                              )
                            })}
                          </div>
                          <button onClick={() => addWorshipService(group)} style={addLinkStyle}>+ 예배 추가</button>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                      <div style={{ flex: 1 }}>
                        <Field label="새 예배 구분 추가" placeholder="ex. 수요예배, 금요철야" value={newWorshipGroupName} onChange={setNewWorshipGroupName} />
                      </div>
                      <button onClick={handleAddWorshipGroup} style={addLinkStyle}>+ 구분 추가</button>
                    </div>
                  </div>

                </div>
              )}

              {/* 홈 화면: 교회 소개 영상(원페이지형 홈에 나오는 영상) */}
              {activeTab === 'home' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${THEME.border}`, padding: '28px' }}>
                    <h3 style={{ fontWeight: 700, color: THEME.navy, marginBottom: 20, fontSize: 16 }}>교회 소개 영상</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <div>
                        <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>표시 방식</label>
                        <div style={{ display: 'flex', gap: 4, background: '#F3F4F6', borderRadius: 10, padding: 4, width: 'fit-content' }}>
                          {[
                            { key: 'video' as const, label: '영상으로 표시' },
                            { key: 'text' as const, label: '텍스트로 표시' },
                          ].map(opt => (
                            <button
                              key={opt.key}
                              onClick={() => setSermonDisplayMode(opt.key)}
                              style={{
                                background: sermonDisplayMode === opt.key ? 'white' : 'transparent',
                                border: 'none',
                                borderRadius: 8,
                                padding: '8px 16px',
                                fontFamily: 'inherit',
                                fontWeight: sermonDisplayMode === opt.key ? 700 : 500,
                                fontSize: 13,
                                color: sermonDisplayMode === opt.key ? THEME.navy : THEME.muted,
                                boxShadow: sermonDisplayMode === opt.key ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                                cursor: 'pointer',
                              }}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                        <p style={{ fontSize: 12, color: THEME.muted, marginTop: 6 }}>영상 없이 글로만 교회를 소개하고 싶을 때 "텍스트로 표시"를 선택하세요.</p>
                      </div>
                      {sermonDisplayMode === 'video' ? (
                        <div>
                          <Field label="유튜브 영상 ID 또는 링크" placeholder="ex. dQw4w9WgXcQ 또는 유튜브 주소" value={form.youtubeVideoId} onChange={v => update('youtubeVideoId', v)} />
                          <p style={{ fontSize: 12, color: THEME.muted, marginTop: 4 }}>유튜브 링크를 그대로 붙여넣어도 자동으로 인식됩니다. 비워두면 이 섹션 자체가 안 보입니다.</p>
                        </div>
                      ) : (
                        <div>
                          <TextareaField label="교회 소개 문구" placeholder="ex. 스테이온교회는 1936년에 설립되어 90여 년의 역사 속에서 하나님의 은혜로 성장해 왔습니다..." value={form.sermonExcerpt} onChange={v => update('sermonExcerpt', v)} />
                          <p style={{ fontSize: 12, color: THEME.muted, marginTop: 4 }}>2~5줄 정도의 짧은 요약을 권장합니다. 비워두면 이 섹션 자체가 안 보입니다.</p>
                        </div>
                      )}
                      <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', padding: '10px 14px', borderRadius: 10, background: introVideoEnabled ? THEME.skyLight : '#F9FAFB', border: `1px solid ${introVideoEnabled ? '#BFDBFE' : THEME.border}`, transition: 'all 0.15s' }}>
                        <div
                          onClick={() => setIntroVideoEnabled(v => !v)}
                          style={{
                            width: 20, height: 20, borderRadius: 6,
                            background: introVideoEnabled ? THEME.navy : 'white',
                            border: `2px solid ${introVideoEnabled ? THEME.navy : '#D1D5DB'}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0, cursor: 'pointer',
                            transition: 'all 0.15s',
                          }}
                        >
                          {introVideoEnabled && <span style={{ color: 'white', fontSize: 12, lineHeight: 1 }}>✓</span>}
                        </div>
                        <span style={{ fontWeight: 500, fontSize: 14, color: THEME.text, flex: 1 }} onClick={() => setIntroVideoEnabled(v => !v)}>교회 소개 영상 섹션 표시</span>
                      </label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <Field label="영상 제목" placeholder="ex. 스테이온교회를 소개합니다" value={form.latestSermonTitle} onChange={v => update('latestSermonTitle', v)} />
                        <Field label="부제 / 소개 문구 (선택)" placeholder="ex. 담임목사 홍길동" value={form.latestSermonSpeaker} onChange={v => update('latestSermonSpeaker', v)} />
                      </div>
                    </div>
                  </div>

                </div>
              )}

              {/* 예배: 유튜브 채널(지난 설교·실시간 예배 자동) + 직접 넣는 영상 */}
              {activeTab === 'worship' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${THEME.border}`, padding: '28px' }}>
                    <h3 style={{ fontWeight: 700, color: THEME.navy, marginBottom: 6, fontSize: 16 }}>유튜브 채널</h3>
                    <p style={{ color: THEME.muted, fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>채널 주소를 넣으면 실시간 방송 중일 때 <b>온라인 예배</b> 화면에 바로 나오고, 채널에 올린 영상이 <b>온라인 예배</b>와 <b>설교 → 지난 설교</b>에 나와요.</p>
                    <Field label="유튜브 채널 링크" placeholder="https://youtube.com/@채널아이디" value={form.youtubeLink} onChange={v => update('youtubeLink', v)} hint={bulletinHint('youtubeLink')} action={bulletinLoad('youtubeLink')} />
                    <div style={{ marginTop: 16 }}>
                      <Field label="지난 예배 재생목록 링크 (선택)" placeholder="https://www.youtube.com/playlist?list=..." value={form.sermonPlaylistUrl} onChange={v => update('sermonPlaylistUrl', v)} />
                      <p style={{ fontSize: 12.5, color: form.sermonPlaylistUrl.trim() && !/[?&]list=[\w-]+/.test(form.sermonPlaylistUrl) ? '#DC2626' : THEME.muted, marginTop: 6, lineHeight: 1.6 }}>
                        {form.sermonPlaylistUrl.trim() && !/[?&]list=[\w-]+/.test(form.sermonPlaylistUrl)
                          ? '재생목록 주소가 아니에요. 주소에 list= 가 들어 있는지 확인해 주세요.'
                          : <>주일설교처럼 따로 모아 둔 재생목록이 있으면 넣어 주세요. <b>온라인 예배 → 최근 예배 영상</b>에는 이 재생목록 영상만 나와요(최근 24개). 유튜브에서 재생목록을 열면 나오는 주소예요.</>}
                      </p>
                    </div>
                  </div>
                  <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${THEME.border}`, padding: '28px' }}>
                    {/* ON: 아래에 직접 넣은 영상을 씀 / OFF: 위 유튜브 채널 영상을 씀(넣어 둔 영상은 지워지지 않고 그대로 남음) */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: onlineWorshipEnabled ? 20 : 0 }}>
                      <div>
                        <h3 style={{ fontWeight: 700, color: THEME.navy, marginBottom: 6, fontSize: 16 }}>예배 영상 직접 넣기 (선택)</h3>
                        <p style={{ color: THEME.muted, fontSize: 13, lineHeight: 1.6 }}>
                          {onlineWorshipEnabled
                            ? <>켜져 있어요. 아래에 넣은 영상이 <b>지난 설교</b>와 <b>온라인 예배</b>에 나와요.</>
                            : <>꺼져 있어요. 위에 넣은 <b>유튜브 채널</b>의 영상이 나와요.</>}
                        </p>
                      </div>
                      <button type="button" role="switch" aria-checked={onlineWorshipEnabled} onClick={() => setOnlineWorshipEnabled(v => !v)}
                        style={{ flexShrink: 0, width: 50, height: 30, borderRadius: 999, border: 'none', padding: 3, cursor: 'pointer', background: onlineWorshipEnabled ? THEME.navy : '#D1D5DB', transition: 'background 0.2s', display: 'flex', justifyContent: onlineWorshipEnabled ? 'flex-end' : 'flex-start' }}>
                        <span style={{ width: 24, height: 24, borderRadius: 999, background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
                      </button>
                    </div>
                    {onlineWorshipEnabled && (
                    <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {sermons.map((s, i) => (
                        <div key={i} style={{ border: `1px solid ${THEME.border}`, borderRadius: 12, padding: 16 }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
                            <Field label="설교 제목" placeholder="ex. 은혜 위에 은혜러라" value={s.title} onChange={v => updateSermon(i, 'title', v)} />
                            <Field label="유튜브 영상 ID 또는 링크" placeholder="ex. dQw4w9WgXcQ" value={s.youtubeVideoId} onChange={v => updateSermon(i, 'youtubeVideoId', v)} />
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
                            <Field label="설교자" placeholder="ex. 홍길동 목사" value={s.speaker} onChange={v => updateSermon(i, 'speaker', v)} />
                            <Field label="본문 (성경 구절)" placeholder="ex. 요한복음 3:16" value={s.scripture} onChange={v => updateSermon(i, 'scripture', v)} />
                          </div>
                          <div style={{ marginBottom: 10 }}>
                            <Field label="날짜 (선택)" placeholder="ex. 2026.08.09" value={s.date} onChange={v => updateSermon(i, 'date', v)} />
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
                            <Field label="댓글 수 (선택)" placeholder="ex. 12" value={s.comments} onChange={v => updateSermon(i, 'comments', v.replace(/[^0-9]/g, ''))} />
                            <Field label="조회수 (선택)" placeholder="ex. 850" value={s.views} onChange={v => updateSermon(i, 'views', v)} />
                          </div>
                          <p style={{ fontSize: 12, color: THEME.muted, marginBottom: 10 }}>댓글 수·조회수는 실제 집계가 아니라 카드에 보여줄 숫자를 직접 정하는 선택 항목이에요. 비워두면 0으로 표시됩니다.</p>
                          <button onClick={() => removeSermon(i)} style={removeLinkStyle}>삭제</button>
                        </div>
                      ))}
                    </div>
                    <button onClick={addSermon} style={addLinkStyle}>+ 설교 추가</button>
                    </>
                    )}
                  </div>
                </div>
              )}

              {/* 매주 업데이트: 교회 주보 파일 */}
              {activeTab === 'weekly' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${THEME.border}`, padding: '28px' }}>
                    <h3 style={{ fontWeight: 700, color: THEME.navy, marginBottom: 6, fontSize: 16 }}>교회 주보 (종이 주보 파일)</h3>
                    <p style={{ color: THEME.muted, fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
                      교회에서 쓰는 주보를 그대로 올리면 홈페이지 '교회 주보'에 보여요. <b>PDF</b>는 바로 열리고, <b>사진(JPG·PNG·WEBP)</b>은
                      여러 장을 한 번에 올리면 올린 순서대로 이어서 보여요. 한글·워드는 내려받기로 제공돼요. 블로그·카페·구글 드라이브에 올린 주보는 아래 <b>링크로 등록</b>하세요.
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr auto', gap: 10, alignItems: 'end' }}>
                      <div>
                        <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>주보 날짜 *</label>
                        <DatePickerField compact value={paperDraft.date} onChange={v => setPaperDraft(d => ({ ...d, date: v }))} />
                      </div>
                      <div>
                        <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>제목 (선택)</label>
                        <input value={paperDraft.title} onChange={e => setPaperDraft(d => ({ ...d, title: e.target.value }))} placeholder="비우면 '2026.11.01 주보'로 표시돼요" style={inputStyle} />
                      </div>
                      <label style={{ padding: '11px 16px', borderRadius: 8, background: THEME.navy, color: 'white', fontSize: 13, fontWeight: 700, cursor: uploadingPaper ? 'wait' : 'pointer', whiteSpace: 'nowrap', opacity: uploadingPaper ? 0.6 : 1 }}>
                        {uploadingPaper ? '올리는 중...' : '파일 올리기'}
                        <input type="file" accept={PAPER_BULLETIN_ACCEPT} multiple onChange={handlePaperBulletinFile} disabled={uploadingPaper} style={{ display: 'none' }} />
                      </label>
                    </div>
                    {/* 링크로 등록(위에서 고른 날짜·제목으로) */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'end', marginTop: 10 }}>
                      <div>
                        <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>또는 링크로 등록</label>
                        <input value={paperLink} onChange={e => setPaperLink(e.target.value)} placeholder="블로그·카페·구글 드라이브 주보 주소 (https://...)" style={inputStyle} />
                      </div>
                      <button type="button" onClick={addPaperBulletinLink}
                        style={{ padding: '11px 16px', borderRadius: 8, border: `1px solid ${THEME.navy}`, background: 'white', color: THEME.navy, fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        링크 등록
                      </button>
                    </div>
                    {/* AI 주보 분석: ANTHROPIC_API_KEY 등록 + analyzePaperBulletin 함수 배포 전까지 화면에서 숨김(아래 "내용 읽기" 버튼도)
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 12, cursor: 'pointer', fontSize: 13, color: THEME.text }}>
                      <input type="checkbox" checked={paperAnalyze} onChange={e => setPaperAnalyze(e.target.checked)} style={{ marginTop: 2 }} />
                      <span>
                        <b>이 주보로 교회 소식·설교도 채우기</b>
                        <span style={{ display: 'block', color: THEME.muted, fontSize: 12, marginTop: 2, lineHeight: 1.6 }}>
                          AI가 주보를 읽고 설교·교회 소식(처음이면 교회 기본 정보도)을 찾아 보여드려요. 확인 화면에서 고른 것만 들어가고,
                          개인 연락처·계좌번호·헌금자 명단·경조사는 넣지 않아요. 1~2분 걸릴 수 있어요. (예전 워드 .doc 파일은 읽지 못해요)
                        </span>
                      </span>
                    </label>
                    */}
                    {paperBulletins.length > 0 && (
                      <div style={{ marginTop: 16, border: `1px solid ${THEME.border}`, borderRadius: 10, overflow: 'hidden' }}>
                        {paperBulletins.map((p, i) => (
                          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderTop: i ? `1px solid ${THEME.border}` : 'none', fontSize: 13 }}>
                            <span style={{ color: THEME.muted, width: 84, flexShrink: 0 }}>{p.date.replace(/-/g, '.')}</span>
                            <span style={{ flex: 1, minWidth: 0, fontWeight: 600, color: THEME.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: THEME.navy, background: THEME.skyLight, borderRadius: 6, padding: '2px 8px', textTransform: 'uppercase' }}>{p.fileType === 'images' ? `사진 ${p.images?.length || 1}장` : p.fileType === 'link' ? '링크' : p.fileType}</span>
                            {(p.sermons?.length || p.news?.length) ? (
                              <span style={{ fontSize: 11, color: THEME.muted, whiteSpace: 'nowrap' }}>설교 {p.sermons?.length || 0} · 소식 {p.news?.length || 0}</span>
                            ) : null}
                            {/* AI 주보 분석 준비 전까지 숨김
                            {p.fileType !== 'doc' && (
                              <button type="button" onClick={() => analyzePaperBulletin(p)} disabled={!!analyzingPaperId}
                                style={{ fontSize: 12, color: THEME.navy, background: 'none', border: 'none', cursor: analyzingPaperId ? 'wait' : 'pointer', whiteSpace: 'nowrap' }}>
                                {analyzingPaperId === p.id ? '읽는 중...' : '내용 읽기'}
                              </button>
                            )}
                            */}
                            <a href={p.fileUrl} target="_blank" rel="noopener noreferrer" style={{ color: THEME.sky, fontSize: 12 }}>열기</a>
                            <button type="button" onClick={() => removePaperBulletin(p.id)} style={{ fontSize: 12, color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer' }}>삭제</button>
                          </div>
                        ))}
                      </div>
                    )}
                    <p style={{ fontSize: 12, color: THEME.muted, marginTop: 10 }}>파일을 올리거나 지운 뒤 '저장'을 눌러야 홈페이지에 반영돼요.</p>
                  </div>
                  {/* 온라인 주보 메뉴 보이기(2026-11-17): 온라인 주보를 쓰지 않거나 홈페이지에 안 보이게 하고 싶은 교회용.
                      온라인 주보가 하나도 없으면 켜 있어도 메뉴는 자동으로 안 보임 */}
                  <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${THEME.border}`, padding: '28px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 6 }}>
                      <h3 style={{ fontWeight: 700, color: THEME.navy, fontSize: 16 }}>온라인 주보 메뉴</h3>
                      <OnOffSwitch on={juboMenuEnabled} onChange={setJuboMenuEnabled} />
                    </div>
                    <p style={{ color: THEME.muted, fontSize: 13, lineHeight: 1.6 }}>
                      {juboMenuEnabled
                        ? <>켜져 있어요. 스테이온 온라인 주보가 있으면 홈페이지 <b>주보</b> 메뉴에 <b>온라인 주보</b>가 보여요(온라인 주보가 없으면 자동으로 안 보여요).</>
                        : <>꺼져 있어요. 홈페이지에 <b>온라인 주보</b> 메뉴가 <b>보이지 않아요</b>.</>}
                    </p>
                  </div>
                </div>
              )}

              {/* 교회소개: 교회 전경 사진 */}
              {activeTab === 'about' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${THEME.border}`, padding: '28px' }}>
                    <h3 style={{ fontWeight: 700, color: THEME.navy, marginBottom: 6, fontSize: 16 }}>교회 전경 사진</h3>
                    <p style={{ color: THEME.muted, fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>교회 소개 페이지 맨 위에 표시될 건물 외관 사진이에요. 방문객이 실제 건물을 미리 알아볼 수 있게 도와줍니다.</p>
                    {form.buildingImageUrl && (
                      <img src={form.buildingImageUrl} alt="교회 전경 미리보기" style={{ width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', borderRadius: 10, marginBottom: 12, border: `1px solid ${THEME.border}` }} />
                    )}
                    <div style={{ display: 'flex', gap: 10 }}>
                      <label style={{ padding: '9px 16px', borderRadius: 8, border: `1px solid ${THEME.border}`, background: 'white', fontSize: 13, fontWeight: 600, color: THEME.text, cursor: 'pointer' }}>
                        {uploadingBuilding ? '업로드 중...' : '사진 선택'}
                        <input type="file" accept="image/*" onChange={handleBuildingFileChange} disabled={uploadingBuilding} style={{ display: 'none' }} />
                      </label>
                      {form.buildingImageUrl && (
                        <button type="button" onClick={() => update('buildingImageUrl', '')} style={{ fontSize: 12, color: THEME.muted, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>삭제</button>
                      )}
                    </div>
                  </div>

                </div>
              )}

              {/* 홈 화면: 홈 화면 사진 */}
              {activeTab === 'home' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${THEME.border}`, padding: '28px' }}>
                    <h3 style={{ fontWeight: 700, color: THEME.navy, marginBottom: 6, fontSize: 16 }}>홈 화면 사진 (최대 {GALLERY_MAX_IMAGES}장)</h3>
                    <p style={{ color: THEME.muted, fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>홈 화면의 "이번 주 예배 시간" 바로 위에 화면 꽉 채워 표시돼요. 여러 장 올리면 자동으로 넘어가며 보여줘요.</p>
                    {galleryImages.length > 0 && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 10, marginBottom: 14 }}>
                        {galleryImages.map((url, i) => (
                          <div key={i} style={{ position: 'relative', aspectRatio: '1 / 1' }}>
                            <img src={url} alt={`갤러리 사진 ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10, border: `1px solid ${THEME.border}` }} />
                            <button
                              type="button"
                              onClick={() => removeGalleryImage(i)}
                              style={{
                                position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: '50%',
                                background: 'rgba(0,0,0,0.6)', color: 'white', border: 'none', cursor: 'pointer',
                                fontSize: 13, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}
                            >×</button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <label
                        style={{
                          padding: '9px 16px', borderRadius: 8, border: `1px solid ${THEME.border}`, background: 'white',
                          fontSize: 13, fontWeight: 600, color: THEME.text,
                          cursor: galleryImages.length >= GALLERY_MAX_IMAGES ? 'not-allowed' : 'pointer',
                          opacity: galleryImages.length >= GALLERY_MAX_IMAGES ? 0.5 : 1,
                        }}
                      >
                        {uploadingGallery ? '업로드 중...' : '사진 추가'}
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={handleGalleryFileChange}
                          disabled={uploadingGallery || galleryImages.length >= GALLERY_MAX_IMAGES}
                          style={{ display: 'none' }}
                        />
                      </label>
                      <span style={{ fontSize: 12, color: THEME.muted }}>{galleryImages.length}/{GALLERY_MAX_IMAGES}장</span>
                    </div>
                  </div>

                  {/* 비전 · 소개 항목: 홈페이지 교회 소개에서 쓰지 않기로 해서 입력칸도 숨김(저장된 값은 그대로 둠)
                  <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${THEME.border}`, padding: '28px' }}>
                    <h3 style={{ fontWeight: 700, color: THEME.navy, marginBottom: 6, fontSize: 16 }}>비전 · 소개 항목</h3>
                    <p style={{ color: THEME.muted, fontSize: 13, marginBottom: 20 }}>교회의 비전이나 특징을 여러 항목으로 소개해보세요.</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {visionItems.map((v, i) => (
                        <div key={i} style={{ border: `1px solid ${THEME.border}`, borderRadius: 12, padding: 16 }}>
                          <div style={{ marginBottom: 10 }}>
                            <Field label="제목" placeholder="ex. 다음세대를 세우는 교회" value={v.title} onChange={val => updateVisionItem(i, 'title', val)} />
                          </div>
                          <Field label="설명" placeholder="ex. 유초등부부터 청년부까지 체계적인 신앙 교육을 제공합니다." value={v.desc} onChange={val => updateVisionItem(i, 'desc', val)} />
                          <button onClick={() => removeVisionItem(i)} style={removeLinkStyle}>삭제</button>
                        </div>
                      ))}
                    </div>
                    <button onClick={addVisionItem} style={addLinkStyle}>+ 항목 추가</button>
                  </div>
                  */}

                </div>
              )}

              {/* 매주 업데이트: 교회 소식 */}
              {activeTab === 'weekly' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${THEME.border}`, padding: '28px' }}>
                    <NewsManager items={newsItems} onChange={setNewsItems} />
                  </div>
                  {/* 앨범: 홈페이지 위쪽 "앨범" 메뉴(주보 오른쪽). 앨범마다 제목·날짜·사진 여러 장 */}
                  <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${THEME.border}`, padding: '28px' }}>
                    <h3 style={{ fontWeight: 700, color: THEME.navy, marginBottom: 6, fontSize: 16 }}>앨범</h3>
                    <p style={{ color: THEME.muted, fontSize: 13, marginBottom: 20 }}>수련회·성탄절 같은 행사 사진을 앨범으로 묶어 올려 보세요. 홈페이지 위쪽 "앨범" 메뉴(주보 오른쪽)에 카드로, 최신 날짜 순으로 보여요. 앨범 하나에 사진은 최대 {ALBUM_MAX_PHOTOS}장까지 올릴 수 있어요.</p>
                    <div className="space-y-4">
                      {albums.map((a, i) => (
                        <div key={a.id} className="rounded-2xl border border-slate-200 p-4 sm:p-5">
                          <div className="flex items-center justify-between mb-3">
                            <b className="text-[15px] text-slate-800">{a.title || `앨범 ${i + 1}`}</b>
                            <button type="button" onClick={() => removeAlbum(i)} className="text-[13px] font-bold text-red-500 px-2 py-1 rounded-lg hover:bg-red-50">앨범 삭제</button>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_200px] gap-3">
                            <PersonInput label="앨범 제목" placeholder="예: 2026 여름 수련회" value={a.title} onChange={v => updateAlbum(i, { title: v })} strong />
                            <div>
                              <span className="block text-[13px] font-bold text-slate-600 mb-1.5">날짜</span>
                              <DatePickerField compact value={a.date} onChange={v => updateAlbum(i, { date: v })} />
                            </div>
                          </div>
                          <div className="mt-4 grid grid-cols-3 sm:grid-cols-5 gap-2">
                            {a.photos.map((src, k) => (
                              <div key={src + k} className="relative aspect-square overflow-hidden rounded-xl bg-slate-100">
                                <img src={src} alt="" className="w-full h-full object-cover" />
                                {k === 0 && <span className="absolute left-1.5 top-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-bold text-white">대표</span>}
                                <button type="button" aria-label="사진 삭제" onClick={() => updateAlbum(i, { photos: a.photos.filter((_, x) => x !== k) })}
                                  className="absolute right-1.5 top-1.5 w-6 h-6 rounded-full bg-black/60 text-white text-sm leading-none">×</button>
                              </div>
                            ))}
                            {a.photos.length < ALBUM_MAX_PHOTOS && (
                              <label className={`aspect-square rounded-xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-500 text-[13px] font-bold ${uploadingAlbumIndex === i ? 'opacity-60 cursor-wait' : 'cursor-pointer hover:border-blue-400 hover:text-blue-600'}`}>
                                <span className="text-2xl leading-none mb-1">{uploadingAlbumIndex === i ? '…' : '+'}</span>
                                {uploadingAlbumIndex === i ? '올리는 중' : '사진 추가'}
                                <input type="file" accept="image/*" multiple className="hidden" disabled={uploadingAlbumIndex !== null} onChange={e => handleAlbumPhotos(i, e)} />
                              </label>
                            )}
                          </div>
                          <p className="mt-2 text-[12px] text-slate-400">첫 번째 사진이 앨범 목록의 대표 사진이 돼요. ({a.photos.length}/{ALBUM_MAX_PHOTOS}장)</p>
                        </div>
                      ))}
                    </div>
                    <PersonAddButton label="앨범 추가" onClick={addAlbum} />
                  </div>
                  {/* 교회 일정: ON이면 홈페이지 위쪽 메뉴 "교회 일정"(앨범 오른쪽)에 달력 + 이 달의 일정 목록으로 보임, OFF면 숨김 */}
                  <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${THEME.border}`, padding: '28px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 6 }}>
                      <h3 style={{ fontWeight: 700, color: THEME.navy, fontSize: 16 }}>교회 일정</h3>
                      <OnOffSwitch on={scheduleEnabled} onChange={setScheduleEnabled} />
                    </div>
                    <p style={{ color: THEME.muted, fontSize: 13, marginBottom: scheduleEnabled ? 16 : 0, lineHeight: 1.6 }}>
                      {scheduleEnabled
                        ? <>켜져 있어요. 홈페이지 위쪽 메뉴 <b>교회 일정</b>(앨범 오른쪽)에 달력과 <b>이 달의 일정</b> 목록으로 보여요.</>
                        : <>꺼져 있어요. 홈페이지에 교회 일정이 <b>보이지 않아요</b>.</>}
                    </p>
                    {scheduleEnabled && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {schedules.length === 0 && (
                          <p style={{ color: THEME.muted, fontSize: 13, padding: '14px 0', textAlign: 'center' }}>아직 일정이 없어요. 아래 "일정 추가"를 눌러 보세요.</p>
                        )}
                        {[...schedules].map((x, i) => (
                          <div key={x.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', border: `1px solid ${THEME.border}`, borderRadius: 12, padding: 10, background: '#FAFBFC' }}>
                            <div style={{ width: 190, flexShrink: 0 }}>
                              <DatePickerField compact value={x.date} onChange={v => setSchedules(list => list.map((y, j) => j === i ? { ...y, date: v } : y))} />
                            </div>
                            <input
                              value={x.title}
                              onChange={e => setSchedules(list => list.map((y, j) => j === i ? { ...y, title: e.target.value } : y))}
                              placeholder="ex. 추수감사절 연합예배"
                              style={{ flex: 1, minWidth: 160, border: `1px solid ${THEME.border}`, borderRadius: 10, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', background: 'white', outline: 'none' }}
                            />
                            <button type="button" onClick={() => setSchedules(list => list.filter((_, j) => j !== i))}
                              style={{ border: 'none', background: 'none', color: '#F04452', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: '6px 8px' }}>삭제</button>
                          </div>
                        ))}
                        <PersonAddButton label="일정 추가" onClick={() => setSchedules(list => [...list, { id: `sch-${Date.now()}`, date: new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10), title: '' }])} />
                        <p style={{ color: THEME.muted, fontSize: 12 }}>저장하면 날짜순으로 정렬돼요. 날짜와 내용이 모두 있어야 홈페이지에 보여요.</p>
                      </div>
                    )}
                  </div>

                </div>
              )}

              {/* 교회소개: 섬기는 사람들·중직자 */}
              {activeTab === 'about' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${THEME.border}`, padding: '28px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 6 }}>
                      <h3 style={{ fontWeight: 700, color: THEME.navy, fontSize: 16 }}>섬기는 사람들</h3>
                      <OnOffSwitch on={staffEnabled} onChange={setStaffEnabled} />
                    </div>
                    {!staffEnabled && <p style={{ fontSize: 12, fontWeight: 700, color: '#DC2626', marginBottom: 8 }}>꺼져 있어요. 저장하면 홈페이지에 섬기는 사람들이 보이지 않아요.</p>}
                    {listHint(staffMembers.map(m => `${m.role} ${m.name}`), (bulletinDefaults?.staffMembers || []).map(m => `${m.role} ${m.name}`))}
                    <p style={{ color: THEME.muted, fontSize: 13, marginBottom: 20 }}>부목사·전도사 등 함께 섬기는 사역자를 소개해보세요. 숫자 제한 없이 추가할 수 있어요.</p>
                    {/* 주보 편집 화면 "섬기시는분 안내 설정"과 같은 형태: 큰 세로 사진 | 직분·이름 / 담당 부서 / 연락처·이메일 */}
                    <div className="space-y-4">
                      {staffMembers.map((s, i) => (
                        <PersonEditorCard
                          key={i}
                          title={`사역자 ${i + 1}`}
                          photoUrl={s.photoUrl}
                          uploading={uploadingStaffIndex === i}
                          onPickFile={e => handleStaffPhotoFileChange(i, e)}
                          onRemovePhoto={() => updateStaffMember(i, 'photoUrl', '')}
                          onDelete={() => removeStaffMember(i)}
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <PersonInput label="직분" placeholder="예: 부목사" value={s.role} onChange={v => updateStaffMember(i, 'role', v)} />
                            <PersonInput label="이름" placeholder="예: 홍길동" value={s.name} onChange={v => updateStaffMember(i, 'name', v)} strong />
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <PersonInput label="담당 부서" placeholder="예: 청년부" value={s.department} onChange={v => updateStaffMember(i, 'department', v)} />
                            <PersonInput label="연락처" placeholder="숫자만 입력" value={s.phone} onChange={v => updateStaffMember(i, 'phone', formatPhoneInput(v))} />
                          </div>
                          <PersonInput label="이메일" placeholder="예: staff@example.com" value={s.email} onChange={v => updateStaffMember(i, 'email', v)} />
                        </PersonEditorCard>
                      ))}
                    </div>
                    <PersonAddButton label="사역자 추가" onClick={addStaffMember} />
                  </div>

                  <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${THEME.border}`, padding: '28px' }}>
                    {/* 제목 오른쪽 "불러오기": 온라인 주보에 중직자가 있고 지금 목록과 다를 때만(주보를 쓰지 않는 교회는 안 보임) */}
                    {(() => {
                      const fromBulletin = bulletinReady ? (bulletinDefaults?.layLeaders || []) : []
                      const key = (ls: LayLeader[]) => JSON.stringify(ls.map(m => [m.role, m.name, m.department, m.photoUrl].map(v => (v || '').trim())))
                      const canLoad = fromBulletin.length > 0 && key(fromBulletin) !== key(layLeaders)
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <h3 style={{ fontWeight: 700, color: THEME.navy, fontSize: 16 }}>중직자 (장로·권사)</h3>
                            <OnOffSwitch on={officersEnabled} onChange={setOfficersEnabled} />
                          </span>
                          {canLoad && (
                            <button type="button" onClick={() => setLeaderAsk(fromBulletin)}
                              style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4, background: '#EFF6FF', color: '#2563EB', border: 'none', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                              ↓ 불러오기
                            </button>
                          )}
                        </div>
                      )
                    })()}
                    {listHint(layLeaders.map(m => `${m.role} ${m.name}`), (bulletinDefaults?.layLeaders || []).map(m => `${m.role} ${m.name}`))}
                    <p style={{ color: THEME.muted, fontSize: 13, marginBottom: 20 }}>장로님·권사님을 소개해보세요. 시무장로 → 원로장로 → 은퇴장로 → 권사 순으로 자동 정렬되어 표시돼요. 숫자 제한 없이 추가할 수 있어요.</p>
                    {/* 주보 편집 화면 "중직자 소개"와 같은 형태: 큰 세로 사진 | 직분 / 이름 / 담당 부서 */}
                    <div className="space-y-4">
                      {layLeaders.map((l, i) => (
                        <PersonEditorCard
                          key={i}
                          title={`중직자 ${i + 1}`}
                          photoUrl={l.photoUrl}
                          uploading={uploadingLayLeaderIndex === i}
                          onPickFile={e => handleLayLeaderPhotoFileChange(i, e)}
                          onRemovePhoto={() => updateLayLeader(i, 'photoUrl', '')}
                          onDelete={() => removeLayLeader(i)}
                        >
                          <RolePicker label="직분" options={LAY_LEADER_ROLES} value={l.role} onChange={v => updateLayLeader(i, 'role', v)} />
                          <PersonInput label="이름" placeholder="예: 홍길동" value={l.name} onChange={v => updateLayLeader(i, 'name', v)} strong />
                          <PersonInput label="담당 부서 (선택)" placeholder="예: 교육부" value={l.department} onChange={v => updateLayLeader(i, 'department', v)} />
                        </PersonEditorCard>
                      ))}
                    </div>
                    <PersonAddButton label="중직자 추가" onClick={addLayLeader} />
                  </div>

                </div>
              )}

              {/* 교육부서 */}
              {activeTab === 'edu' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${THEME.border}`, padding: '28px' }}>
                    <h3 style={{ fontWeight: 700, color: THEME.navy, marginBottom: 6, fontSize: 16 }}>주일학교 · 교육부서</h3>
                    <p style={{ color: THEME.muted, fontSize: 13, marginBottom: 20 }}>유초등부·중고등부·청년부 같은 부서를 소개해 보세요. 부서를 하나 이상 넣으면 홈페이지 위쪽 메뉴에 나타나요.</p>
                    <div className="max-w-sm mb-5">
                      <RolePicker label="홈페이지 메뉴 이름" options={EDU_MENU_OPTIONS} value={eduMenuLabel} onChange={setEduMenuLabel} />
                    </div>
                    <div className="space-y-4">
                      {eduDepartments.map((d, i) => (
                        <PersonEditorCard
                          key={i}
                          title={d.name || `부서 ${i + 1}`}
                          photoUrl={d.photoUrl}
                          uploading={uploadingEduIndex === i}
                          onPickFile={e => handleEduPhotoFileChange(i, e)}
                          onRemovePhoto={() => updateEduDepartment(i, 'photoUrl', '')}
                          onDelete={() => removeEduDepartment(i)}
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <PersonInput label="부서 이름" placeholder="예: 유초등부" value={d.name} onChange={v => updateEduDepartment(i, 'name', v)} strong />
                            <PersonInput label="대상" placeholder="예: 초등 1~6학년" value={d.target} onChange={v => updateEduDepartment(i, 'target', v)} />
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <PersonInput label="예배 시간" placeholder="예: 주일 오전 11시" value={d.time} onChange={v => updateEduDepartment(i, 'time', v)} />
                            <PersonInput label="장소" placeholder="예: 교육관 2층" value={d.place} onChange={v => updateEduDepartment(i, 'place', v)} />
                          </div>
                          <PersonInput label="담당 (선택)" placeholder="예: 김도현 전도사" value={d.leader} onChange={v => updateEduDepartment(i, 'leader', v)} />
                          <label className="block">
                            <span className="block text-[13px] font-bold text-slate-600 mb-1.5">소개 (선택)</span>
                            <textarea
                              value={d.desc}
                              onChange={e => updateEduDepartment(i, 'desc', e.target.value)}
                              placeholder="예: 말씀과 찬양으로 하나님을 알아가는 어린이 예배입니다."
                              rows={3}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[15px] font-medium text-slate-800 outline-none placeholder:text-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 resize-none"
                            />
                          </label>
                        </PersonEditorCard>
                      ))}
                    </div>
                    <PersonAddButton label="부서 추가" onClick={addEduDepartment} />
                  </div>


                </div>
              )}

              {/* 교회소개: 교회 연혁 · 새가족 안내 */}
              {activeTab === 'about' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${THEME.border}`, padding: '28px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 6 }}>
                      <h3 style={{ fontWeight: 700, color: THEME.navy, fontSize: 16 }}>교회 연혁</h3>
                      <OnOffSwitch on={historyEnabled} onChange={setHistoryEnabled} />
                    </div>
                    {!historyEnabled && <p style={{ fontSize: 12, fontWeight: 700, color: '#DC2626', marginBottom: 8 }}>꺼져 있어요. 저장하면 홈페이지에 교회 연혁이 보이지 않아요.</p>}
                    <p style={{ color: THEME.muted, fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>교회소개 &gt; <b>교회 연혁</b> 화면에 적은 순서대로 나와요. 한 줄이라도 적으면 메뉴에 보여요. 날짜는 칸에 직접 입력하거나(1998. 03 처럼 월까지만도 돼요) 오른쪽 달력에서 고를 수 있어요.</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {historyItems.map((h, i) => (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '180px minmax(0,1fr) auto', gap: 10, alignItems: 'end' }}>
                          <div>
                            {i === 0 && <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>날짜</label>}
                            {/* 직접 입력(1998. 03 처럼 월까지만도 OK) + 오른쪽 달력 버튼(날짜 검색 가능) */}
                            <TypeableDateField value={h.date} onChange={v => setHistoryItems(prev => prev.map((x, j) => (j === i ? { ...x, date: v } : x)))} />
                          </div>
                          <Field label={i === 0 ? '내용' : ''} placeholder="ex. 교회 설립 예배" value={h.content} onChange={v => setHistoryItems(prev => prev.map((x, j) => (j === i ? { ...x, content: v } : x)))} />
                          <button type="button" onClick={() => setHistoryItems(prev => prev.filter((_, j) => j !== i))} style={{ ...removeLinkStyle, marginBottom: 12 }}>삭제</button>
                        </div>
                      ))}
                    </div>
                    <button type="button" onClick={() => setHistoryItems(prev => [...prev, { date: '', content: '' }])} style={{ ...addLinkStyle, marginTop: 12 }}>+ 연혁 추가</button>
                  </div>

                  <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${THEME.border}`, padding: '28px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 6 }}>
                      <h3 style={{ fontWeight: 700, color: THEME.navy, fontSize: 16 }}>새가족 안내</h3>
                      <OnOffSwitch on={newcomerEnabled} onChange={setNewcomerEnabled} />
                    </div>
                    {!newcomerEnabled && <p style={{ fontSize: 12, fontWeight: 700, color: '#DC2626', marginBottom: 8 }}>꺼져 있어요. 저장하면 홈페이지에 새가족 안내가 보이지 않아요.</p>}
                    <p style={{ color: THEME.muted, fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>교회소개 &gt; <b>새가족 안내</b> 화면에 나와요. 소개·등록 절차·문의 중 하나라도 적으면 메뉴에 보여요.</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      <TextareaField label="안내 문구" placeholder="ex. 처음 오신 여러분을 진심으로 환영합니다. 아래 순서로 새가족 등록을 도와드려요." value={newcomerIntro} onChange={setNewcomerIntro} />
                      <div>
                        <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>등록 절차</label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {newcomerSteps.map((st, i) => (
                            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', border: `1px solid ${THEME.border}`, borderRadius: 12, padding: 12, background: '#FAFBFC' }}>
                              <span style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 999, background: THEME.navy, color: 'white', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 4 }}>{i + 1}</span>
                              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <Field label="" placeholder={`${i + 1}단계 제목 (ex. 새가족 카드 작성)`} value={st.title} onChange={v => setNewcomerSteps(prev => prev.map((x, j) => (j === i ? { ...x, title: v } : x)))} />
                                <TextareaField label="" placeholder="설명 (선택)" value={st.desc} onChange={v => setNewcomerSteps(prev => prev.map((x, j) => (j === i ? { ...x, desc: v } : x)))} />
                              </div>
                              <button type="button" onClick={() => setNewcomerSteps(prev => prev.filter((_, j) => j !== i))} style={{ ...removeLinkStyle, marginTop: 6 }}>삭제</button>
                            </div>
                          ))}
                        </div>
                        <button type="button" onClick={() => setNewcomerSteps(prev => [...prev, { title: '', desc: '' }])} style={{ ...addLinkStyle, marginTop: 10 }}>+ {newcomerSteps.length + 1}단계 추가</button>
                      </div>
                      <Field label="문의 (선택)" placeholder="ex. 새가족부 010-0000-0000 / 예배 후 1층 안내데스크" value={newcomerContact} onChange={setNewcomerContact} />
                    </div>
                  </div>
                </div>
              )}

              {/* 예배: 찬양팀(ON이면 홈페이지 위쪽 메뉴에 "찬양팀", OFF면 메뉴에서 아예 사라짐) */}
              {activeTab === 'worship' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${THEME.border}`, padding: '28px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 6 }}>
                      <h3 style={{ fontWeight: 700, color: THEME.navy, fontSize: 16 }}>찬양팀</h3>
                      <OnOffSwitch on={praiseEnabled} onChange={setPraiseEnabled} />
                    </div>
                    <p style={{ color: THEME.muted, fontSize: 13, marginBottom: praiseEnabled ? 16 : 0, lineHeight: 1.6 }}>
                      {praiseEnabled ? <>켜져 있어요. 홈페이지 위쪽 메뉴에 <b>찬양팀</b>이 보여요.</> : <>꺼져 있어요. 홈페이지 메뉴에 찬양팀이 <b>보이지 않아요</b>.</>}
                    </p>
                    {praiseEnabled && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <TextareaField label="찬양팀 소개 (선택)" placeholder="ex. 예배를 섬기는 찬양팀을 소개합니다." value={praiseIntro} onChange={setPraiseIntro} />
                        {praiseTeams.map((x, i) => (
                          <div key={i} style={{ border: `1px solid ${THEME.border}`, borderRadius: 12, padding: 14, background: '#FAFBFC', display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <div style={{ width: 96, height: 64, borderRadius: 8, overflow: 'hidden', background: '#F3F4F6', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', fontSize: 11 }}>
                                {x.photoUrl ? <img src={x.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '사진 없음'}
                              </div>
                              <label style={{ fontSize: 12.5, fontWeight: 700, color: '#2563EB', background: '#EFF6FF', borderRadius: 999, padding: '6px 12px', cursor: 'pointer' }}>
                                {uploadingPraiseIndex === i ? '올리는 중…' : x.photoUrl ? '사진 바꾸기' : '사진 올리기'}
                                <input type="file" accept="image/*" style={{ display: 'none' }} disabled={uploadingPraiseIndex !== null} onChange={e => handlePraisePhoto(i, e)} />
                              </label>
                              {x.photoUrl && <button type="button" onClick={() => setPraiseTeams(prev => prev.map((y, j) => (j === i ? { ...y, photoUrl: '' } : y)))} style={removeLinkStyle}>사진 삭제</button>}
                              <span style={{ flex: 1 }} />
                              <button type="button" onClick={() => setPraiseTeams(prev => prev.filter((_, j) => j !== i))} style={removeLinkStyle}>팀 삭제</button>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                              <Field label="팀 이름 *" placeholder="ex. 주일 1부 찬양팀" value={x.name} onChange={v => setPraiseTeams(prev => prev.map((y, j) => (j === i ? { ...y, name: v } : y)))} />
                              <Field label="리더 (선택)" placeholder="ex. 홍길동 집사" value={x.leader} onChange={v => setPraiseTeams(prev => prev.map((y, j) => (j === i ? { ...y, leader: v } : y)))} />
                              <Field label="섬기는 예배 · 연습 시간" placeholder="ex. 주일 1부 / 토 오후 4시 연습" value={x.time} onChange={v => setPraiseTeams(prev => prev.map((y, j) => (j === i ? { ...y, time: v } : y)))} />
                              <Field label="장소 (선택)" placeholder="ex. 본당" value={x.place} onChange={v => setPraiseTeams(prev => prev.map((y, j) => (j === i ? { ...y, place: v } : y)))} />
                            </div>
                            <TextareaField label="소개 (선택)" placeholder="ex. 주일 1부 예배를 섬기는 찬양팀입니다." value={x.desc} onChange={v => setPraiseTeams(prev => prev.map((y, j) => (j === i ? { ...y, desc: v } : y)))} />
                          </div>
                        ))}
                        <button type="button" onClick={() => setPraiseTeams(prev => [...prev, { name: '', time: '', place: '', leader: '', desc: '', photoUrl: '' }])} style={addLinkStyle}>+ 찬양팀 추가</button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 기본 설정: 메뉴 구성·SNS */}
              {activeTab === 'settings' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${THEME.border}`, padding: '28px' }}>
                    <h3 style={{ fontWeight: 700, color: THEME.navy, marginBottom: 6, fontSize: 16 }}>메뉴 구성</h3>
                    <p style={{ color: THEME.muted, fontSize: 13, marginBottom: 3 }}>사이트 상단 메뉴에 표시할 항목을 선택하세요. 클릭하면 해당 섹션으로 바로 이동해요.</p>
                    <p style={{ color: THEME.muted, fontSize: 13, marginBottom: 20 }}>상단 메뉴는 체크박스를 체크하는 순서대로 나열 됩니다. 순서를 변경하려면 체크박스를 전체 해제 후 원하는 순서대로 클릭하세요.</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {menuItems.map(m => (
                        <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', padding: '10px 14px', borderRadius: 10, background: activeMenus.includes(m.id) ? THEME.skyLight : '#F9FAFB', border: `1px solid ${activeMenus.includes(m.id) ? '#BFDBFE' : THEME.border}`, transition: 'all 0.15s' }}>
                          <div
                            onClick={() => toggleMenu(m.id)}
                            style={{
                              width: 20, height: 20, borderRadius: 6,
                              background: activeMenus.includes(m.id) ? THEME.navy : 'white',
                              border: `2px solid ${activeMenus.includes(m.id) ? THEME.navy : '#D1D5DB'}`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              flexShrink: 0, cursor: 'pointer',
                              transition: 'all 0.15s',
                            }}
                          >
                            {activeMenus.includes(m.id) && <span style={{ color: 'white', fontSize: 12, lineHeight: 1 }}>✓</span>}
                          </div>
                          <span style={{ fontWeight: 500, fontSize: 14, color: THEME.text, flex: 1 }} onClick={() => toggleMenu(m.id)}>{m.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${THEME.border}`, padding: '28px' }}>
                    <h3 style={{ fontWeight: 700, color: THEME.navy, marginBottom: 20, fontSize: 16 }}>SNS 링크</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <Field label="카카오채널 링크" placeholder="https://pf.kakao.com/..." value={form.kakaoLink} onChange={v => update('kakaoLink', v)} />
                      <Field label="인스타그램 링크" placeholder="https://instagram.com/..." value={form.instagramLink} onChange={v => update('instagramLink', v)} hint={bulletinHint('instagramLink')} action={bulletinLoad('instagramLink')} />
                    </div>
                  </div>
                </div>
              )}

              {/* 홈 화면: 디자인(색·로고·메인 사진) */}
              {activeTab === 'home' && (
                // 홈 화면 탭에서 맨 위에(order -1): 색·로고·메인 사진
                <div style={{ order: -1, background: 'white', borderRadius: 16, border: `1px solid ${THEME.border}`, padding: '28px' }}>
                  <h3 style={{ fontWeight: 700, color: THEME.navy, marginBottom: 24, fontSize: 16 }}>디자인 · 메인 사진</h3>
                  <div style={{ marginBottom: 28 }}>
                    <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 12 }}>주요 색상</label>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {colorPresets.map(c => (
                        <button
                          key={c.value}
                          onClick={() => setSelectedColor(c.value)}
                          title={c.label}
                          style={{
                            width: 40, height: 40,
                            borderRadius: 10,
                            background: c.value,
                            border: selectedColor === c.value ? '3px solid #60A5FA' : '2px solid transparent',
                            outline: selectedColor === c.value ? '2px solid #60A5FA' : 'none',
                            cursor: 'pointer',
                            transition: 'transform 0.15s',
                            transform: selectedColor === c.value ? 'scale(1.12)' : 'scale(1)',
                          }}
                        />
                      ))}
                    </div>
                  </div>
                  <div style={{ marginBottom: 24 }}>
                    <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>교단 마크</label>
                    <p style={{ fontSize: 12, color: THEME.muted, marginBottom: 10, lineHeight: 1.6 }}>사이트 맨 위 교회 이름 옆에 표시돼요. 아래 '로고 이미지'를 직접 올리면 그 로고가 대신 보여요.</p>
                    <DenominationPicker value={denomination} onChange={setDenomination} emptyLabel="사용 안 함" emptyValue={NO_DENOMINATION} />
                    {denomination !== NO_DENOMINATION && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, cursor: 'pointer', fontSize: 13, color: THEME.text }}>
                        <input type="checkbox" checked={denominationWithLogo} onChange={e => setDenominationWithLogo(e.target.checked)} style={{ width: 16, height: 16, accentColor: THEME.navy }} />
                        로고 이미지가 있어도 교단 마크를 옆에 같이 표시
                      </label>
                    )}
                    {/* 교단 이름까지 표시(2026-11-21): 괄호가 있는 교단(합동·통합·고신·백석·합신·KAICAM)만 보임 */}
                    {hasDenominationBranch(resolveDenomination(denomination)) && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, cursor: 'pointer', fontSize: 13, color: THEME.text }}>
                        <input type="checkbox" checked={denominationFullName} onChange={e => setDenominationFullName(e.target.checked)} style={{ width: 16, height: 16, accentColor: THEME.navy }} />
                        <span>교단 이름까지 표시 <span style={{ color: THEME.muted }}>(예: {resolveDenomination(denomination)?.name})</span></span>
                      </label>
                    )}
                  </div>
                  <div style={{ marginBottom: 28 }}>
                    <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 10 }}>로고 이미지 <span style={{ fontWeight: 400, color: THEME.muted }}>(선택 · 직접 올리면 교단 마크 대신 표시)</span></label>
                    {bulletinReady && bulletinDefaults?.text.logoUrl && form.logoUrl === bulletinDefaults.text.logoUrl && (
                      <p style={{ fontSize: 12, color: THEME.muted, marginTop: -4, marginBottom: 10 }}>주보 관리자 화면에 등록된 교회 로고를 불러왔어요.</p>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {form.logoUrl ? (
                        <img src={form.logoUrl} alt="로고 미리보기" style={{ height: 44, maxWidth: 120, objectFit: 'contain', borderRadius: 8, border: `1px solid ${THEME.border}`, background: '#F9FAFB', padding: 4 }} />
                      ) : (
                        <div style={{ height: 44, width: 44, borderRadius: 8, border: `1px dashed ${THEME.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: THEME.muted }}>없음</div>
                      )}
                      <label style={{ padding: '9px 16px', borderRadius: 8, border: `1px solid ${THEME.border}`, background: 'white', fontSize: 13, fontWeight: 600, color: THEME.text, cursor: 'pointer' }}>
                        {uploadingLogo ? '업로드 중...' : '파일 선택'}
                        <input type="file" accept="image/*" onChange={handleLogoFileChange} disabled={uploadingLogo} style={{ display: 'none' }} />
                      </label>
                      {form.logoUrl && (
                        <button type="button" onClick={() => update('logoUrl', '')} style={{ fontSize: 12, color: THEME.muted, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>삭제</button>
                      )}
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, cursor: 'pointer', fontSize: 13, color: THEME.text }}>
                      <input type="checkbox" checked={hideLogo} onChange={e => setHideLogo(e.target.checked)} style={{ width: 16, height: 16, accentColor: THEME.navy }} />
                      홈페이지에서는 로고 이미지 안 쓸게요
                    </label>
                    {hideLogo && <p style={{ fontSize: 12, color: THEME.muted, marginTop: 4, marginLeft: 24 }}>홈페이지 맨 위에는 교단 마크와 교회 이름이 표시돼요. 주보의 로고는 그대로예요.</p>}
                  </div>
                  <div style={{ marginBottom: 28 }}>
                    <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>히어로 배경 사진 <span style={{ fontWeight: 400, color: THEME.muted }}>(선택 · 최대 {GALLERY_MAX_IMAGES}장)</span></label>
                    <p style={{ fontSize: 12, color: THEME.muted, marginBottom: 8, lineHeight: 1.6 }}>메인 화면 상단에 교회 사진을 배경으로 넣을 수 있어요. 넣지 않으면 선택하신 색상의 그라데이션이 표시됩니다.</p>
                    {/* 권장 크기: 배너는 PC에선 가로로 넓게, 모바일에선 세로로 잘려 보여서(MultiPageSite 첫 화면, object-cover)
                        가로 사진 + 중요한 부분은 가운데에 두는 게 가장 안전함 */}
                    <div style={{ fontSize: 12, color: '#1E40AF', background: THEME.skyLight, border: '1px solid #BFDBFE', borderRadius: 8, padding: '10px 12px', marginBottom: 12, lineHeight: 1.7 }}>
                      <b>권장 크기: 가로 1920 × 세로 812px (16:9 가로 사진)</b><br />
                      화면 높이에 따라 PC에서는 위아래가 각각 최대 약 12%(130px 정도), 모바일에서는 양옆이 잘려요. 십자가 꼭대기는 사진 위에서 150px 이상 아래에 두고, 꼭 보여야 하는 부분은 가운데에 오게 해 주세요.
                    </div>
                    {heroImages.length > 0 && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
                        {heroImages.map((url, i) => (
                          <div key={url} style={{ position: 'relative', aspectRatio: '16 / 9' }}>
                            <img src={url} alt={`히어로 사진 ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10, border: `1px solid ${THEME.border}` }} />
                            <span style={{ position: 'absolute', top: 6, left: 6, padding: '2px 8px', borderRadius: 999, background: i === 0 ? THEME.navy : 'rgba(0,0,0,0.55)', color: 'white', fontSize: 11, fontWeight: 700 }}>
                              {i === 0 ? '대표' : i + 1}
                            </span>
                            <button type="button" onClick={() => removeHeroImage(i)} aria-label="삭제"
                              style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', color: 'white', border: 'none', cursor: 'pointer', fontSize: 13, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                            {heroImages.length > 1 && (
                              <div style={{ position: 'absolute', bottom: 6, right: 6, display: 'flex', gap: 4 }}>
                                {([[-1, '◀'], [1, '▶']] as const).map(([dir, label]) => (
                                  <button key={dir} type="button" onClick={() => moveHeroImage(i, dir)} disabled={(dir === -1 && i === 0) || (dir === 1 && i === heroImages.length - 1)}
                                    style={{ width: 24, height: 22, borderRadius: 6, background: 'rgba(0,0,0,0.6)', color: 'white', border: 'none', cursor: 'pointer', fontSize: 10, opacity: (dir === -1 && i === 0) || (dir === 1 && i === heroImages.length - 1) ? 0.3 : 1 }}>{label}</button>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <label style={{ padding: '9px 16px', borderRadius: 8, border: `1px solid ${THEME.border}`, background: 'white', fontSize: 13, fontWeight: 600, color: THEME.text, cursor: heroImages.length >= GALLERY_MAX_IMAGES ? 'not-allowed' : 'pointer', opacity: heroImages.length >= GALLERY_MAX_IMAGES ? 0.5 : 1 }}>
                        {uploadingHero ? '업로드 중...' : '사진 추가'}
                        <input type="file" accept="image/*" multiple onChange={handleHeroFileChange} disabled={uploadingHero || heroImages.length >= GALLERY_MAX_IMAGES} style={{ display: 'none' }} />
                      </label>
                      <span style={{ fontSize: 12, color: THEME.muted }}>{heroImages.length}/{GALLERY_MAX_IMAGES}장 · ◀ ▶ 로 순서를 바꿀 수 있어요</span>
                    </div>
                    {heroImages.length > 1 && (
                      <div style={{ marginTop: 16 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>사진 넘김 방식 <span style={{ fontWeight: 400, color: THEME.muted }}>(5초마다 자동으로 바뀌어요)</span></p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                          {([['slide', '슬라이드', '옆으로 밀리면서 다음 사진으로 넘어가요'], ['fade', '디졸브', '사진이 부드럽게 겹쳐지며 바뀌어요']] as const).map(([value, label, desc]) => (
                            <label key={value} style={{ cursor: 'pointer', padding: '12px 14px', borderRadius: 12, background: heroTransition === value ? THEME.skyLight : '#F9FAFB', border: `2px solid ${heroTransition === value ? THEME.navy : THEME.border}` }}>
                              <input type="radio" name="heroTransition" checked={heroTransition === value} onChange={() => setHeroTransition(value)} style={{ display: 'none' }} />
                              <p style={{ fontWeight: 700, color: THEME.navy, fontSize: 14 }}>{label}</p>
                              <p style={{ color: THEME.muted, fontSize: 12, marginTop: 2 }}>{desc}</p>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* 사진 위 글자(WELCOME·교회 이름·표어) 색 */}
                    <div style={{ marginTop: 16 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>사진 위 글자 색 <span style={{ fontWeight: 400, color: THEME.muted }}>(WELCOME · 교회 이름 · 표어)</span></p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                        {([['#FFFFFF', '흰색'], ['#111827', '검정'], [selectedColor, '교회 색'], ['#FDE68A', '연노랑']] as const).map(([value, label]) => {
                          const on = heroTextColor.toUpperCase() === value.toUpperCase()
                          return (
                            <button key={label} type="button" onClick={() => setHeroTextColor(value)}
                              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, fontSize: 13, fontWeight: 600, color: THEME.text, background: on ? THEME.skyLight : 'white', border: `2px solid ${on ? THEME.navy : THEME.border}`, cursor: 'pointer' }}>
                              <span style={{ width: 18, height: 18, borderRadius: 999, background: value, border: '1px solid #D1D5DB' }} />
                              {label}
                            </button>
                          )
                        })}
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, fontSize: 13, fontWeight: 600, color: THEME.text, background: 'white', border: `2px solid ${THEME.border}`, cursor: 'pointer' }}>
                          <input type="color" value={heroTextColor} onChange={e => setHeroTextColor(e.target.value.toUpperCase())} style={{ width: 22, height: 22, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }} />
                          직접 선택
                        </label>
                      </div>
                      {/* 미리보기: 첫 번째 사진 위에 글자 색 */}
                      <div style={{ marginTop: 10, borderRadius: 10, overflow: 'hidden', position: 'relative', height: 72, background: heroImages[0] ? `center/cover url("${heroImages[0]}")` : selectedColor }}>
                        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,.6), rgba(0,0,0,.15))' }} />
                        <div style={{ position: 'absolute', left: 14, bottom: 10, color: heroTextColor }}>
                          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.25em', opacity: 0.8 }}>WELCOME</p>
                          <p style={{ fontSize: 18, fontWeight: 900 }}>{form.churchName || '교회 이름'}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div style={{
                    background: THEME.skyLight,
                    border: '1px solid #BFDBFE',
                    borderRadius: 10,
                    padding: '16px',
                    fontSize: 13,
                    color: '#1E40AF',
                    lineHeight: 1.7,
                  }}>
                    💡 로고가 없으시면 교회 이름을 텍스트 로고로 자동 생성해드립니다.
                  </div>
                </div>
              )}

              {/* 기본 설정: 검색엔진(SEO) */}
              {activeTab === 'settings' && (
                <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${THEME.border}`, padding: '28px' }}>
                  <h3 style={{ fontWeight: 700, color: THEME.navy, marginBottom: 8, fontSize: 16 }}>SEO 설정</h3>
                  <p style={{ color: THEME.muted, fontSize: 13, marginBottom: 24, lineHeight: 1.7 }}>구글·네이버 검색 결과에 표시되는 정보를 설정합니다.</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <div>
                      <Field
                        label="검색 제목 (Meta Title)"
                        placeholder="ex. 새벽교회 | 서울 마포구 교회"
                        value={form.metaTitle}
                        onChange={v => update('metaTitle', v)}
                      />
                      <p style={{ fontSize: 12, color: THEME.muted, marginTop: 6 }}>권장: 50~60자 이내</p>
                    </div>
                    <div>
                      <TextareaField
                        label="검색 설명 (Meta Description)"
                        placeholder="ex. 서울 마포구에 위치한 새벽교회입니다. 주일예배 오전 11시, 모든 분들을 환영합니다."
                        value={form.metaDesc}
                        onChange={v => update('metaDesc', v)}
                      />
                      <p style={{ fontSize: 12, color: THEME.muted, marginTop: 6 }}>권장: 120~160자 이내</p>
                    </div>
                  </div>
                  <div style={{
                    marginTop: 28,
                    border: `1px solid ${THEME.border}`,
                    borderRadius: 10,
                    padding: '16px 20px',
                    background: '#F9FAFB',
                  }}>
                    <p style={{ fontSize: 11, color: THEME.muted, fontWeight: 600, marginBottom: 8, letterSpacing: '0.05em' }}>검색 결과 미리보기</p>
                    <p style={{ color: '#1A0DAB', fontSize: 15, fontWeight: 500, marginBottom: 2 }}>
                      {form.metaTitle || `${form.churchName || '교회명'} | 스테이온`}
                    </p>
                    <p style={{ color: '#006621', fontSize: 12, marginBottom: 4 }}>
                      {previewDomain}
                    </p>
                    <p style={{ color: '#4D5156', fontSize: 13, lineHeight: 1.5 }}>
                      {form.metaDesc || '교회를 소개해 주세요. 검색 결과에 표시됩니다.'}
                    </p>
                  </div>
                </div>
              )}
              </div>
            </div>

            {/* RIGHT: PREVIEW */}
            <div style={{ position: 'sticky', top: 80 }}>
              <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: THEME.muted }}>사이트 미리보기</span>
                <span style={{ fontSize: 11, color: THEME.muted, background: '#F3F4F6', borderRadius: 4, padding: '2px 8px' }}>실시간 반영</span>
              </div>

              {/* Browser frame */}
              <div style={{
                background: 'white',
                borderRadius: 16,
                border: `1px solid ${THEME.border}`,
                overflow: 'hidden',
                boxShadow: '0 8px 32px rgba(0,0,0,0.10)',
              }}>
                {/* browser bar */}
                <div style={{ background: '#F3F4F6', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: `1px solid ${THEME.border}` }}>
                  <div style={{ display: 'flex', gap: 5 }}>
                    {['#FF5F57', '#FEBC2E', '#28C840'].map(c => (
                      <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />
                    ))}
                  </div>
                  <div style={{ flex: 1, background: 'white', borderRadius: 6, padding: '4px 12px', fontSize: 11, color: THEME.muted, border: `1px solid ${THEME.border}` }}>
                    {previewDomain}
                  </div>
                </div>

                {/* 실제 배포 화면(WebsiteRenderer)을 그대로 렌더링해서 축소 표시 — 손으로 그린 미리보기가 아니라
                    진짜 컴포넌트라서 디자인이 바뀌어도 항상 실제 배포 화면과 100% 일치함 */}
                <div ref={previewContainerRef} style={{ width: '100%', height: Math.min(previewScaledHeight || 400, 640), overflowY: 'auto', overflowX: 'hidden', background: 'white' }}>
                  <div
                    ref={previewInnerRef}
                    style={{ width: PREVIEW_WIDTH, transform: `scale(${previewScale})`, transformOrigin: 'top left' }}
                  >
                    <WebsiteRenderer site={previewSite} />
                  </div>
                </div>
              </div>

              {/* action buttons */}
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  style={{
                    flex: 1,
                    background: 'white',
                    border: `1px solid ${THEME.navy}`,
                    color: THEME.navy,
                    borderRadius: 10,
                    padding: '12px',
                    fontFamily: 'inherit',
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: saving ? 'wait' : 'pointer',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = THEME.skyLight }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'white' }}
                >
                  {saving ? '저장 중...' : '💾 저장'}
                </button>
                <button
                  onClick={handleDeploy}
                  disabled={deploying || !selectedProject}
                  style={{
                    flex: 1,
                    background: selectedProject ? THEME.navy : '#D1D5DB',
                    color: 'white',
                    border: 'none',
                    borderRadius: 10,
                    padding: '12px',
                    fontFamily: 'inherit',
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: selectedProject ? 'pointer' : 'not-allowed',
                    transition: 'opacity 0.15s',
                  }}
                  onMouseEnter={e => { if (selectedProject) e.currentTarget.style.opacity = '0.88' }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
                >
                  {deploying ? '배포 중...' : '🚀 배포'}
                </button>
              </div>
              <p style={{ textAlign: 'center', fontSize: 11, color: THEME.muted, marginTop: 8 }}>
                배포 후 약 1~2분 내 반영됩니다
              </p>
            </div>

          </div>

          {/* 결제 플랜 선택 모달 */}
          {analysisReview && (() => {
            const r = analysisReview.result
            const b = r.basic
            const toggle = (key: 'sermons' | 'news', i: number) => setAnalysisReview(v => v && { ...v, [key]: v[key].map((x, idx) => idx === i ? !x : x) })
            const toggleBasic = (k: string) => setAnalysisReview(v => v && { ...v, basic: { ...v.basic, [k]: !v.basic[k] } })
            const basicRows: { key: string; label: string; value: string }[] = [
              { key: 'churchName', label: '교회 이름', value: b.churchName },
              { key: 'pastor', label: '담임목사', value: b.pastorName },
              { key: 'phone', label: '교회 전화', value: b.phone },
              { key: 'address', label: '주소', value: b.address },
              { key: 'intro', label: '교회 소개', value: b.intro },
              { key: 'worshipServices', label: '예배 시간', value: b.worshipServices.map(w => `${w.title} ${w.time}`).join(', ') },
              { key: 'staff', label: '섬기는 사람들', value: b.staff.map(m => `${m.role} ${m.name}`).join(', ') },
            ].filter(x => x.key in analysisReview.basic)
            const row = (checked: boolean, onChange: () => void, title: string, sub: string, key: string) => (
              <label key={key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', borderTop: `1px solid ${THEME.border}`, cursor: 'pointer' }}>
                <input type="checkbox" checked={checked} onChange={onChange} style={{ marginTop: 3 }} />
                <span style={{ fontSize: 13, lineHeight: 1.6, minWidth: 0 }}>
                  <b style={{ color: THEME.text }}>{title}</b>
                  {sub && <span style={{ display: 'block', color: THEME.muted, whiteSpace: 'pre-wrap', wordBreak: 'keep-all' }}>{sub}</span>}
                </span>
              </label>
            )
            const section = (label: string, children: React.ReactNode[]) => children.length > 0 && (
              <div style={{ border: `1px solid ${THEME.border}`, borderRadius: 10, overflow: 'hidden', marginBottom: 14 }}>
                <p style={{ background: '#F9FAFB', padding: '9px 12px', fontSize: 13, fontWeight: 700, color: THEME.navy }}>{label}</p>
                {children}
              </div>
            )
            return (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 640, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ padding: '20px 24px 12px' }}>
                    <h3 style={{ fontWeight: 700, color: THEME.navy, fontSize: 17 }}>주보에서 찾은 내용</h3>
                    <p style={{ color: THEME.muted, fontSize: 13, marginTop: 4, lineHeight: 1.6 }}>
                      홈페이지에 넣을 것만 체크해 주세요. AI가 읽은 내용이라 틀린 곳이 있을 수 있어요. 넣은 뒤에도 빌더에서 고칠 수 있고, '저장'을 눌러야 홈페이지에 반영돼요.
                    </p>
                  </div>
                  <div style={{ padding: '0 24px', overflowY: 'auto', flex: 1 }}>
                    {section('설교', r.sermons.map((x, i) => row(analysisReview.sermons[i], () => toggle('sermons', i), x.title || '말씀', [x.service, x.scripture, x.preacher].filter(Boolean).join(' · '), `s${i}`)))}
                    {section('교회 소식', r.news.map((x, i) => row(analysisReview.news[i], () => toggle('news', i), x.title || '교회 소식', x.content, `n${i}`)))}
                    {section('기본 정보 (빌더에 비어 있는 칸만)', basicRows.map(x => row(!!analysisReview.basic[x.key], () => toggleBasic(x.key), x.label, x.value, x.key)))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 24px', borderTop: `1px solid ${THEME.border}` }}>
                    <button type="button" onClick={() => setAnalysisReview(null)} style={{ padding: '10px 18px', borderRadius: 8, border: `1px solid ${THEME.border}`, background: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>취소</button>
                    <button type="button" onClick={applyAnalysisReview} style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: THEME.navy, color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>선택한 내용 넣기</button>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* 예전 빌더 자체 결제 창(실제 카드결제 없이 기간만 늘어나던 창) — 결제는 /pricing으로 통일(2026-11-13)해서 숨김. 다시 쓰려면 false 지우기 */}
          {false && showPaymentModal && selectedProject && (
            <div
              style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 20 }}
              onClick={closePaymentModal}
            >
              <div
                style={{ background: 'white', borderRadius: 24, padding: 32, width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}
                onClick={e => e.stopPropagation()}
              >
                {paymentSuccessExpiry ? (
                  <div style={{ textAlign: 'center', padding: '20px 0' }}>
                    <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 32 }}>✓</div>
                    <h3 style={{ fontSize: 20, fontWeight: 800, color: THEME.navy, marginBottom: 10 }}>결제가 완료되었습니다</h3>
                    <p style={{ fontSize: 15, color: THEME.text, marginBottom: 28 }}>
                      <strong style={{ color: THEME.sky }}>{formatDateKorean(paymentSuccessExpiry)}</strong>까지 이용 가능합니다
                    </p>
                    <button
                      onClick={closePaymentModal}
                      style={{ width: '100%', padding: '14px', borderRadius: 12, background: THEME.navy, color: 'white', border: 'none', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      확인
                    </button>
                  </div>
                ) : (
                  <>
                    <h3 style={{ fontSize: 20, fontWeight: 800, color: THEME.navy, marginBottom: 6 }}>결제 플랜 선택</h3>
                    <p style={{ fontSize: 13, color: THEME.muted, marginBottom: 24 }}>결제 즉시 이용 기간이 연장됩니다.</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
                      {PAYMENT_PLANS.map(plan => (
                        <button
                          key={plan.months}
                          onClick={() => setSelectedPlanMonths(plan.months)}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '18px 20px', borderRadius: 14,
                            border: selectedPlanMonths === plan.months ? `2px solid ${THEME.sky}` : `1px solid ${THEME.border}`,
                            background: selectedPlanMonths === plan.months ? THEME.skyLight : 'white',
                            cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                            transition: 'all 0.15s',
                          }}
                        >
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontWeight: 700, fontSize: 15, color: THEME.text }}>{plan.label}</span>
                              {plan.badge && (
                                <span style={{ fontSize: 11, fontWeight: 700, color: 'white', background: '#F04452', borderRadius: 100, padding: '2px 8px' }}>{plan.badge}</span>
                              )}
                            </div>
                            {plan.months === 12 && (
                              <p style={{ fontSize: 12, color: THEME.muted, marginTop: 4 }}>월 8,250원 꼴</p>
                            )}
                          </div>
                          <span style={{ fontWeight: 800, fontSize: 17, color: THEME.navy }}>{plan.priceLabel}</span>
                        </button>
                      ))}

                      {/* 운영 관리 대행 서비스 - 아직 준비 중인 선택 옵션이라 자물쇠 표시로 비활성화만 해둠 */}
                      <div
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '18px 20px', borderRadius: 14,
                          border: `1px dashed ${THEME.border}`,
                          background: '#F9FAFB',
                          cursor: 'not-allowed',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 16, color: '#9CA3AF' }}>🔒</span>
                          <div>
                            <p style={{ fontWeight: 700, fontSize: 14, color: '#9CA3AF' }}>운영 관리 대행 서비스</p>
                            <p style={{ fontSize: 12, color: '#B0B7C3', marginTop: 2 }}>선택 옵션</p>
                          </div>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', background: '#EEF0F3', borderRadius: 100, padding: '4px 10px', whiteSpace: 'nowrap' }}>
                          준비중
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={handlePayment}
                      disabled={paying}
                      style={{ width: '100%', padding: '16px', borderRadius: 12, background: THEME.sky, color: 'white', border: 'none', fontWeight: 700, fontSize: 16, cursor: paying ? 'wait' : 'pointer', fontFamily: 'inherit' }}
                    >
                      {paying ? '처리 중...' : `${PAYMENT_PLANS.find(p => p.months === selectedPlanMonths)?.priceLabel} 결제하기`}
                    </button>
                    <button
                      onClick={closePaymentModal}
                      style={{ width: '100%', padding: '12px', marginTop: 8, background: 'none', border: 'none', color: THEME.muted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      취소
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
          </>
        )}
      </div>
    </div>
  )
}

// ── 섬기는 사람들·중직자 입력 카드(주보 편집 화면과 같은 형태) ──────────────────
// 왼쪽: 크게 보이는 세로 사진(눌러서 넣기/바꾸기) / 오른쪽: 이름표가 붙은 큰 입력칸
function PersonEditorCard({ title, photoUrl, uploading, onPickFile, onRemovePhoto, onDelete, children }: {
  title: string
  photoUrl?: string
  uploading: boolean
  onPickFile: (e: React.ChangeEvent<HTMLInputElement>) => void
  onRemovePhoto: () => void
  onDelete: () => void
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <span className="text-[15px] font-extrabold text-slate-800">{title}</span>
        <button type="button" onClick={onDelete} className="rounded-lg px-3 py-1.5 text-sm font-bold text-red-500 hover:bg-red-50">삭제</button>
      </div>
      <div className="mt-3 grid grid-cols-[104px_minmax(0,1fr)] sm:grid-cols-[150px_minmax(0,1fr)] gap-4 items-start">
        <div>
          <label className={`group relative block w-full aspect-[3/4] overflow-hidden rounded-xl border-2 border-dashed bg-white ${uploading ? 'cursor-wait border-blue-300' : 'cursor-pointer border-blue-300 hover:border-blue-500'}`}>
            {photoUrl ? (
              <>
                <img src={photoUrl} alt={title} className="absolute inset-0 h-full w-full object-cover object-top" />
                <span className="absolute inset-x-0 bottom-0 bg-black/55 py-1.5 text-center text-xs font-bold text-white opacity-0 transition-opacity group-hover:opacity-100">사진 바꾸기</span>
              </>
            ) : (
              <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-blue-500">
                <span className="text-2xl leading-none">＋</span>
                <span className="text-[13px] font-bold">사진 넣기</span>
              </span>
            )}
            {uploading && <span className="absolute inset-0 flex items-center justify-center bg-white/80 text-[13px] font-bold text-blue-600">올리는 중…</span>}
            <input type="file" accept="image/*" onChange={onPickFile} disabled={uploading} className="hidden" />
          </label>
          {photoUrl && (
            <button type="button" onClick={onRemovePhoto} className="mt-1.5 w-full text-center text-xs font-semibold text-slate-400 hover:text-red-500">사진 빼기</button>
          )}
        </div>
        <div className="space-y-3 min-w-0">{children}</div>
      </div>
    </div>
  )
}

function PersonInput({ label, placeholder, value, onChange, strong }: { label: string; placeholder?: string; value: string; onChange: (v: string) => void; strong?: boolean }) {
  return (
    <label className="block">
      <span className="block text-[13px] font-bold text-slate-600 mb-1.5">{label}</span>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full h-12 rounded-xl border border-slate-200 bg-white px-3 text-[15px] outline-none placeholder:text-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 ${strong ? 'font-extrabold text-blue-700' : 'font-semibold text-slate-800'}`}
      />
    </label>
  )
}

function PersonAddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="mt-4 w-full rounded-2xl border-2 border-dashed border-blue-200 py-3.5 text-[15px] font-bold text-blue-600 transition-colors hover:border-blue-400 hover:bg-blue-50">
      ＋ {label}
    </button>
  )
}

// 빌더 상단 탭. 선택된 탭 뒤에 남색 알약이 깔리고, 다른 탭을 누르면 그 자리로 미끄러지듯 이동.
// 화면 폭이 좁아 탭이 두 줄로 접혀도 위치·크기를 실제 버튼에서 재서 맞춤
function BuilderTabs({ tabs, active, onChange }: { tabs: { key: string; label: string }[]; active: string; onChange: (key: string) => void }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const [pill, setPill] = useState<{ left: number; top: number; width: number; height: number } | null>(null)

  useLayoutEffect(() => {
    const measure = () => {
      const b = btnRefs.current[active]
      if (b) setPill({ left: b.offsetLeft, top: b.offsetTop, width: b.offsetWidth, height: b.offsetHeight })
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (wrapRef.current) ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [active])

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'flex', gap: 4, flexWrap: 'wrap', background: '#F3F4F6', borderRadius: 12, padding: 4, marginBottom: 24 }}>
      {pill && (
        <span aria-hidden style={{
          position: 'absolute', left: pill.left, top: pill.top, width: pill.width, height: pill.height,
          background: THEME.navy, borderRadius: 9, boxShadow: '0 4px 12px rgba(27,58,107,0.28)',
          transition: 'left 0.32s cubic-bezier(0.22, 1, 0.36, 1), top 0.32s cubic-bezier(0.22, 1, 0.36, 1), width 0.32s cubic-bezier(0.22, 1, 0.36, 1)',
        }} />
      )}
      {tabs.map(tab => {
        const on = tab.key === active
        return (
          <button
            key={tab.key}
            ref={el => { btnRefs.current[tab.key] = el }}
            onClick={() => onChange(tab.key)}
            className="active:scale-[0.97]"
            style={{
              position: 'relative', zIndex: 1, flex: '1 1 100px',
              background: 'transparent', border: 'none', borderRadius: 9,
              padding: '10px 8px', fontFamily: 'inherit', fontSize: 13,
              fontWeight: on ? 700 : 500,
              color: on ? 'white' : THEME.muted,
              cursor: 'pointer',
              transition: 'color 0.25s, transform 0.1s',
            }}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

// "화면 방식" 카드의 작은 그림. 전환형: 메뉴 탭 + 페이지 여러 장이 겹친 모습 / 원페이지형: 긴 한 장을 아래로 스크롤
function LayoutModeSketch({ mode, active }: { mode: 'multipage' | 'onepage'; active: boolean }) {
  const ink = active ? '#1B3A6B' : '#9CA3AF'
  const soft = active ? '#BFD3EE' : '#E5E7EB'
  const paper = '#FFFFFF'
  return (
    <svg viewBox="0 0 240 96" style={{ width: '100%', height: 96, display: 'block', borderRadius: 10, background: active ? '#EEF4FB' : '#F3F4F6' }} aria-hidden>
      {mode === 'multipage' ? (
        <>
          {/* 뒤에 겹친 페이지들 */}
          <rect x="62" y="14" width="120" height="74" rx="6" fill={paper} stroke={soft} />
          <rect x="54" y="10" width="120" height="74" rx="6" fill={paper} stroke={soft} />
          {/* 앞 페이지: 상단 메뉴 탭(첫 탭 선택) + 내용 */}
          <rect x="46" y="6" width="120" height="78" rx="6" fill={paper} stroke={ink} strokeWidth="1.5" />
          <rect x="54" y="14" width="22" height="8" rx="3" fill={ink} />
          <rect x="80" y="14" width="22" height="8" rx="3" fill={soft} />
          <rect x="106" y="14" width="22" height="8" rx="3" fill={soft} />
          <rect x="132" y="14" width="22" height="8" rx="3" fill={soft} />
          <rect x="54" y="32" width="70" height="6" rx="3" fill={ink} opacity="0.8" />
          <rect x="54" y="44" width="104" height="5" rx="2.5" fill={soft} />
          <rect x="54" y="54" width="96" height="5" rx="2.5" fill={soft} />
          <rect x="54" y="64" width="84" height="5" rx="2.5" fill={soft} />
          {/* 탭 → 새 페이지 화살표 */}
          <path d="M186 40 h26 m-7 -6 l7 6 l-7 6" fill="none" stroke={ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <>
          {/* 긴 한 장(아래가 화면 밖으로 이어짐) */}
          <rect x="70" y="6" width="100" height="96" rx="6" fill={paper} stroke={ink} strokeWidth="1.5" />
          <rect x="78" y="14" width="84" height="16" rx="3" fill={ink} opacity="0.85" />
          <rect x="78" y="36" width="84" height="5" rx="2.5" fill={soft} />
          <rect x="78" y="45" width="70" height="5" rx="2.5" fill={soft} />
          <rect x="78" y="56" width="40" height="18" rx="3" fill={soft} />
          <rect x="122" y="56" width="40" height="18" rx="3" fill={soft} />
          <rect x="78" y="80" width="84" height="5" rx="2.5" fill={soft} />
          {/* 스크롤 화살표 */}
          <path d="M196 24 v44 m-7 -7 l7 7 l7 -7" fill="none" stroke={ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid #D1D5DB',
  borderRadius: 8,
  padding: '10px 14px',
  fontFamily: 'inherit',
  fontSize: 14,
  color: '#111827',
  outline: 'none',
  background: 'white',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s',
}

const addLinkStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
  color: THEME.sky, fontSize: 13, fontWeight: 700, marginTop: 12, padding: 0,
}

const removeLinkStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
  color: '#DC2626', fontSize: 12, fontWeight: 600, marginTop: 10, padding: 0,
}

function Field({ label, placeholder, value, onChange, hint, action }: {
  label: string; placeholder: string; value: string; onChange: (v: string) => void; hint?: React.ReactNode
  action?: React.ReactNode // 이름 줄 오른쪽 버튼(ex. 온라인 주보에서 불러오기)
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block' }}>{label}</label>
        {action}
      </div>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={inputStyle}
        onFocus={e => { e.currentTarget.style.borderColor = THEME.sky }}
        onBlur={e => { e.currentTarget.style.borderColor = '#D1D5DB' }}
      />
      {hint}
    </div>
  )
}

function TextareaField({ label, placeholder, value, onChange, hint, action }: {
  label: string; placeholder: string; value: string; onChange: (v: string) => void; hint?: React.ReactNode
  action?: React.ReactNode // 이름 줄 오른쪽 버튼(ex. 온라인 주보에서 불러오기)
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block' }}>{label}</label>
        {action}
      </div>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={4}
        style={{ ...inputStyle, resize: 'vertical' }}
        onFocus={e => { e.currentTarget.style.borderColor = THEME.sky }}
        onBlur={e => { e.currentTarget.style.borderColor = '#D1D5DB' }}
      />
      {hint}
    </div>
  )
}

// 온라인 주보와 내용이 다를 때 입력칸 아래에 보이는 약한 안내(아무 동작도 하지 않음)
function BulletinDiffHint({ builderWins }: { builderWins: boolean }) {
  return (
    <p style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 12, color: '#6B7280', marginTop: 6, lineHeight: 1.6 }}>
      <span aria-hidden style={{ flexShrink: 0 }}>ⓘ</span>
      <span>
        온라인 주보를 사용 중이시네요. 이 내용은 주보에 입력된 내용과 달라요.
        {builderWins ? ' 홈페이지에는 지금 입력한 내용이 표시돼요.' : ' 홈페이지에는 주보 내용이 먼저 표시돼요.'}
      </span>
    </p>
  )
}
