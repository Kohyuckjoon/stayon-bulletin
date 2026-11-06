import { useState, useEffect, useRef } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { Timestamp } from 'firebase/firestore'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { auth, storage } from '../../../firebase'
import { getChurchSite, getChurchSitesByOwner, createChurchSite, updateChurchSite, publishChurchSite, extendChurchSiteAccess, extractYoutubeId, MENU_ITEMS as menuItems, ChurchSite } from '../../../utils/churchSite'
import { checkSlugFormat, isSlugTaken, confirmPermanentAddress } from '../../../utils/slugValidation'
import { DENOMINATIONS, DEFAULT_DENOMINATION, NO_DENOMINATION, denominationLogoSrc } from '../../../utils/denominations'
import { fetchOwnerData, builderDefaultsFromBulletin, BuilderDefaults } from '../../../utils/churchSiteContent'
import { isOperatorEmail } from '../../../utils/operator'
import { WebsiteRenderer } from './WebsiteRenderer'

// 미리보기 패널 안에서 실제 배포 화면(WebsiteRenderer)을 데스크톱 폭(1280px) 기준으로 그린 뒤
// 사이드바 폭에 맞춰 축소 표시함. 이렇게 해야 두 화면이 항상 100% 동일하게 유지됨(별도로 손으로
// 그린 미리보기 마크업은 WebsiteRenderer 디자인이 바뀔 때마다 매번 따로 고쳐줘야 해서 계속 어긋났었음)
const PREVIEW_WIDTH = 1280

const SITE_DOMAIN_SUFFIX = '.stayon-platform.com'
const GALLERY_MAX_IMAGES = 10

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

type WorshipService = { title: string; time: string; note: string; group: string }
type VisionItem = { title: string; desc: string }
type NewsItem = { title: string; date: string; content: string }
type PaperSermon = { service: string; title: string; scripture: string; preacher: string }
type PaperNews = { title: string; content: string }
// sermons/news: 자동 분석 후 교회가 확인 화면에서 고른 설교·교회 소식(홈페이지 '설교'·'교회 소식'에 보임)
type PaperBulletin = { id: string; date: string; title: string; fileUrl: string; fileName: string; fileType: string; sermons?: PaperSermon[]; news?: PaperNews[] }
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
const PAPER_BULLETIN_ACCEPT = '.hwp,.hwpx,.doc,.docx,.pdf,.jpg,.jpeg,.png'
type StaffMember = { role: string; name: string; department: string; phone: string; email: string; photoUrl: string }
type LayLeader = { role: string; name: string; department: string; photoUrl: string }
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
  phone: '', email: '', address: '', locationDetail: '', intro: '', logoUrl: '', heroImageUrl: '', buildingImageUrl: '',
  metaTitle: '', metaDesc: '',
  kakaoLink: '', youtubeLink: '', instagramLink: '',
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
  const [activeTab, setActiveTab] = useState<'basic' | 'worship' | 'content' | 'service' | 'design' | 'seo'>('basic')
  const [activeMenus, setActiveMenus] = useState<string[]>(['home', 'worship', 'community', 'news', 'online-worship', 'location'])
  const [form, setForm] = useState(emptyForm)
  const [worshipServices, setWorshipServices] = useState<WorshipService[]>([])
  const [newWorshipGroupName, setNewWorshipGroupName] = useState('')
  const [visionItems, setVisionItems] = useState<VisionItem[]>([])
  const [newsItems, setNewsItems] = useState<NewsItem[]>([])
  // 교회 주보(종이 주보 파일) — 한글·워드·PDF·사진 파일을 그대로 올림. 온라인 주보와 별개
  const [paperBulletins, setPaperBulletins] = useState<PaperBulletin[]>([])
  const [paperDraft, setPaperDraft] = useState<{ date: string; title: string }>({ date: '', title: '' })
  const [uploadingPaper, setUploadingPaper] = useState(false)
  // "이 주보로 교회 소식·설교도 채우기" — 켜고 올리면 AI가 주보를 읽고 확인 화면을 띄움(교회가 고른 것만 들어감)
  const [paperAnalyze, setPaperAnalyze] = useState(false)
  const [analyzingPaperId, setAnalyzingPaperId] = useState<string | null>(null)
  const [analysisReview, setAnalysisReview] = useState<AnalysisReview | null>(null)
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([])
  const [layLeaders, setLayLeaders] = useState<LayLeader[]>([])
  const [galleryImages, setGalleryImages] = useState<string[]>([])
  // 히어로(첫 화면 배너) 사진 여러 장 + 2장 이상일 때 넘김 방식. 첫 번째 사진은 heroImageUrl에도
  // 같이 저장해서 원페이지형·카카오 미리보기·검색봇 등 예전 필드를 쓰는 곳이 그대로 동작하게 함
  const [heroImages, setHeroImages] = useState<string[]>([])
  const [heroTransition, setHeroTransition] = useState<'slide' | 'fade'>('slide')
  const [denomination, setDenomination] = useState<string>(DEFAULT_DENOMINATION) // 교단 마크(기본 예장 합동)
  const [denominationWithLogo, setDenominationWithLogo] = useState(false) // 로고가 있어도 교단 마크 같이 표시
  const [hideLogo, setHideLogo] = useState(false) // 홈페이지에서는 로고 이미지 안 씀
  const [sermons, setSermons] = useState<Sermon[]>([])
  const [onlineWorshipEnabled, setOnlineWorshipEnabled] = useState<boolean>(true)
  // 화면 방식: 페이지 전환형(기본, 메뉴마다 주소가 따로 있어 검색에 유리) / 원페이지(예전 한 페이지 스크롤)
  const [layoutMode, setLayoutMode] = useState<'multipage' | 'onepage'>('multipage')
  const [mainWorshipGroup, setMainWorshipGroup] = useState<string>('')
  const [introVideoEnabled, setIntroVideoEnabled] = useState<boolean>(true)
  const [sermonDisplayMode, setSermonDisplayMode] = useState<'video' | 'text'>('video')

  const update = (field: keyof typeof form, value: string) => setForm(p => ({ ...p, [field]: value }))

  // ── 온라인 주보 내용으로 빈 칸 자동 채우기 + 주보와 다를 때 약한 안내 ──────────────────
  // 주보는 읽기만 함(빌더에서 고친 내용을 주보에 복사하지 않음)
  // 주보를 읽어 올 교회 = 지금 편집 중인 사이트의 소유 교회. 운영자가 다른 교회 사이트를
  // 편집할 때(?site=주소)도 운영자 주보가 아니라 그 교회 주보가 들어가야 하므로 uid가 아닌 ownerId 기준
  const currentOwnerId = (selectedProject && projects.find(p => p.slug === selectedProject)?.ownerId) || uid
  const [bulletinDefaults, setBulletinDefaults] = useState<BuilderDefaults | null>(null)
  const [bulletinDefaultsOwner, setBulletinDefaultsOwner] = useState<string | null>(null)
  const prefilledFor = useRef<string | null>(null)
  useEffect(() => {
    if (!currentOwnerId) return
    let cancelled = false
    setBulletinDefaults(null)
    setBulletinDefaultsOwner(null)
    fetchOwnerData(currentOwnerId).then(o => {
      if (cancelled) return
      setBulletinDefaults(builderDefaultsFromBulletin(o))
      setBulletinDefaultsOwner(currentOwnerId)
    })
    return () => { cancelled = true }
  }, [currentOwnerId])
  useEffect(() => {
    const key = selectedProject ?? (creating ? '__new__' : null)
    // 다른 교회 주보로 빈 칸이 채워지는 일이 없게, 지금 사이트 소유 교회의 주보를 다 불러온 뒤에만 채움
    if (!key || !bulletinDefaults || bulletinDefaultsOwner !== currentOwnerId || prefilledFor.current === key) return
    prefilledFor.current = key
    const d = bulletinDefaults
    setForm(p => {
      const next = { ...p }
      ;(Object.keys(d.text) as (keyof typeof d.text)[]).forEach(k => {
        const cur = String(next[k] ?? '').trim()
        if (!cur || (k === 'pastorRole' && cur === '담임목사')) (next as Record<string, string>)[k] = d.text[k] || ''
      })
      return next
    })
    setWorshipServices(prev => (prev.length ? prev : d.worshipServices))
    setStaffMembers(prev => (prev.length ? prev : d.staffMembers))
    setLayLeaders(prev => (prev.length ? prev : d.layLeaders))
  }, [bulletinDefaults, bulletinDefaultsOwner, currentOwnerId, selectedProject, creating])
  const norm = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim()
  // 홈페이지에서 실제로 어느 쪽이 보이는지(utils/churchSiteContent.ts buildSiteContent 기준)
  const HOMEPAGE_USES_BUILDER: string[] = ['churchName', 'email']
  const bulletinHint = (k: keyof BuilderDefaults['text']) => {
    const dv = bulletinDefaults?.text[k]
    const cur = norm(form[k as keyof typeof form])
    if (!dv || !cur || cur === norm(dv)) return undefined
    return <BulletinDiffHint builderWins={HOMEPAGE_USES_BUILDER.includes(k)} />
  }
  const listHint = (cur: string[], def: string[]) =>
    def.length && cur.length && norm(cur.join('|')) !== norm(def.join('|')) ? <BulletinDiffHint builderWins={false} /> : undefined

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
  const handlePaperBulletinFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!uid) { alert('로그인이 필요합니다.'); return }
    if (!paperDraft.date) { alert('주보 날짜를 먼저 선택해 주세요.'); return }
    const ext = (file.name.split('.').pop() || '').toLowerCase()
    if (!PAPER_BULLETIN_ACCEPT.split(',').includes(`.${ext}`)) { alert('한글(HWP)·워드·PDF·사진(JPG/PNG) 파일만 올릴 수 있어요.'); return }
    if (file.size > 30 * 1024 * 1024) { alert('파일은 30MB까지 올릴 수 있어요.'); return }
    setUploadingPaper(true)
    try {
      const fileRef = storageRef(storage, `churchSiteUploads/${uid}/paper-bulletin-${Date.now()}.${ext}`)
      await uploadBytes(fileRef, file, { contentType: file.type || undefined, contentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(file.name)}` })
      const fileUrl = await getDownloadURL(fileRef)
      const entry: PaperBulletin = {
        id: `${Date.now()}`, date: paperDraft.date, title: paperDraft.title.trim() || `${paperDraft.date.replace(/-/g, '.')} 주보`,
        fileUrl, fileName: file.name, fileType: ext,
      }
      setPaperBulletins(prev => [...prev, entry].sort((a, z) => z.date.localeCompare(a.date)))
      setPaperDraft({ date: '', title: '' })
      if (paperAnalyze) void analyzePaperBulletin(entry)
    } catch {
      alert('파일을 올리지 못했습니다. 다시 시도해주세요.')
    } finally {
      setUploadingPaper(false)
    }
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
    if (basic.worshipServices) setWorshipServices(b.worshipServices.map(w => ({ title: w.title, time: w.time, note: '', group: w.group || WORSHIP_DEFAULT_GROUP })))
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
  const addWorshipService = (group: string) => setWorshipServices(prev => [...prev, { title: '', time: '', note: '', group }])
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
    setForm(emptyForm)
    setWorshipServices([])
    setVisionItems([])
    setNewsItems([])
    setPaperBulletins([])
    setStaffMembers([])
    setLayLeaders([])
    setGalleryImages([])
    setHeroImages([])
    setHeroTransition('slide')
    setDenomination(DEFAULT_DENOMINATION)
    setDenominationWithLogo(false)
    setHideLogo(false)
    setSermons([])
    setOnlineWorshipEnabled(true)
    setIntroVideoEnabled(true)
    setSermonDisplayMode('video')
    setMainWorshipGroup('')
    setSlug('')
    setSlugError('')
    setSelectedColor('#1B3A6B')
    setActiveTab('basic')
    setActiveMenus(['home', 'worship', 'community', 'news', 'online-worship', 'location'])
  }

  // 기존 프로젝트를 선택하면, 이미 불러온 Firestore 데이터로 폼을 채워서 편집을 이어갈 수 있게 함
  const handleSelectProject = (site: ChurchSite) => {
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
      intro: site.intro || '',
      logoUrl: site.logoUrl || '',
      heroImageUrl: site.heroImageUrl || '',
      buildingImageUrl: site.buildingImageUrl || '',
      metaTitle: site.metaTitle || '',
      metaDesc: site.metaDesc || '',
      kakaoLink: site.kakaoLink || '',
      youtubeLink: site.youtubeLink || '',
      instagramLink: site.instagramLink || '',
      youtubeVideoId: site.youtubeVideoId || '',
      latestSermonTitle: site.latestSermonTitle || '',
      latestSermonSpeaker: site.latestSermonSpeaker || '',
      sermonExcerpt: site.sermonExcerpt || '',
    })
    // 구버전에 단일 worshipTime 문자열만 있던 프로젝트는, 예배 1개짜리 목록으로 자동 변환해서 데이터 유실 없이 이어서 편집 가능하게 함
    setWorshipServices(
      site.worshipServices?.length
        ? site.worshipServices.map(s => ({ title: s.title, time: s.time, note: s.note || '', group: s.group || '' }))
        : site.worshipTime
          ? [{ title: '주일예배', time: site.worshipTime, note: '', group: '' }]
          : []
    )
    setVisionItems(site.visionItems || [])
    setNewsItems(site.newsItems || [])
    setPaperBulletins(site.paperBulletins || [])
    setStaffMembers((site.staffMembers || []).map(s => ({ ...s, photoUrl: s.photoUrl || '' })))
    setLayLeaders((site.layLeaders || []).map(l => ({ ...l, photoUrl: l.photoUrl || '' })))
    setGalleryImages(site.galleryImages || [])
    setHeroImages(site.heroImages?.length ? site.heroImages : site.heroImageUrl ? [site.heroImageUrl] : [])
    setHeroTransition(site.heroTransition === 'fade' ? 'fade' : 'slide')
    setDenomination(site.denomination || DEFAULT_DENOMINATION)
    setDenominationWithLogo(site.denominationWithLogo === true)
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
    setIntroVideoEnabled(site.introVideoEnabled !== false)
    setSermonDisplayMode(site.sermonDisplayMode === 'text' ? 'text' : 'video')
    setMainWorshipGroup(site.mainWorshipGroup || '')
    setSelectedColor(site.primaryColor || '#1B3A6B')
    setActiveMenus(site.activeMenus || ['home', 'worship', 'community', 'news', 'online-worship', 'location'])
    setActiveTab('basic')
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
    intro: form.intro,
    logoUrl: form.logoUrl,
    heroImageUrl: heroImages[0] || '',
    heroImages: heroImages.slice(0, GALLERY_MAX_IMAGES),
    heroTransition,
    denomination,
    denominationWithLogo,
    hideLogo,
    buildingImageUrl: form.buildingImageUrl,
    metaTitle: form.metaTitle,
    metaDesc: form.metaDesc,
    kakaoLink: form.kakaoLink,
    youtubeLink: form.youtubeLink,
    instagramLink: form.instagramLink,
    youtubeVideoId: form.youtubeVideoId ? extractYoutubeId(form.youtubeVideoId) : '',
    introVideoEnabled,
    sermonDisplayMode,
    sermonExcerpt: form.sermonExcerpt,
    latestSermonTitle: form.latestSermonTitle,
    latestSermonSpeaker: form.latestSermonSpeaker,
    worshipServices: worshipServices.filter(s => s.title.trim() || s.time.trim()),
    visionItems: visionItems.filter(v => v.title.trim() || v.desc.trim()),
    newsItems: newsItems.filter(n => n.title.trim() || n.content.trim()),
    paperBulletins,
    staffMembers: staffMembers.filter(s => s.name.trim() || s.role.trim()),
    layLeaders: layLeaders.filter(l => l.name.trim()),
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
    primaryColor: selectedColor,
    activeMenus,
    layoutMode,
  })

  const handleSave = async () => {
    if (!uid) { alert('로그인이 필요합니다.'); return }
    if (!form.churchName.trim()) { alert('교회 이름을 입력해주세요.'); return }

    setSaving(true)
    try {
      if (selectedProject) {
        // 기존 프로젝트 수정
        const patch = buildSitePatch()
        await updateChurchSite(selectedProject, patch)
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
        const patch = buildSitePatch()
        await updateChurchSite(slug, patch)

        const newSite: ChurchSite = { slug, ownerId: uid, published: false, ...patch }
        setProjects(prev => [...prev, newSite])
        setSelectedProject(slug)
        setCreating(false)
      }
      setSavedSnack(true)
      setTimeout(() => setSavedSnack(false), 2500)
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
            <div style={{ marginBottom: 32 }}>
              <h1 style={{ fontSize: 26, fontWeight: 800, color: THEME.navy, marginBottom: 6 }}>내 프로젝트</h1>
              <p style={{ color: THEME.muted, fontSize: 14 }}>기존 프로젝트를 이어서 수정하거나, 새 교회 사이트를 만들어보세요.</p>
            </div>

            {loadingProjects ? (
              <p style={{ color: THEME.muted, fontSize: 14, padding: '24px 0' }}>프로젝트 목록을 불러오는 중입니다...</p>
            ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {/* existing */}
              {projects.map(p => (
                <button
                  key={p.slug}
                  onClick={() => handleSelectProject(p)}
                  style={{
                    background: 'white',
                    border: `1px solid ${THEME.border}`,
                    borderRadius: 16,
                    padding: '24px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.18s',
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 8px 28px rgba(27,58,107,0.12)'; e.currentTarget.style.borderColor = THEME.sky }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = THEME.border }}
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
                </button>
              ))}

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
                    setHideLogo(false)
                    setSermons([])
                    setOnlineWorshipEnabled(true)
                    setIntroVideoEnabled(true)
                    setSermonDisplayMode('video')
                    setMainWorshipGroup('')
                    setSlug('')
                    setSlugError('')
                    setSelectedColor('#1B3A6B')
                    setActiveTab('basic')
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
            const expiry = currentProject.accessExpiresAt?.toDate() || null
            const firstDeployed = currentProject.firstDeployedAt?.toDate() || null
            const now = new Date()
            const isExpired = expiry ? expiry.getTime() < now.getTime() : false
            const trialOnlyExpiry = firstDeployed ? firstDeployed.getTime() + 30 * 24 * 60 * 60 * 1000 : null
            const hasPaid = expiry && trialOnlyExpiry ? expiry.getTime() > trialOnlyExpiry : false

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

                {/* 이용 기간 안내 배너 */}
                {expiry && (
                  <div style={{
                    borderRadius: 16, padding: '18px 24px',
                    background: isExpired ? '#FEF2F2' : hasPaid ? '#ECFDF5' : '#EFF6FF',
                    border: `1px solid ${isExpired ? '#FECACA' : hasPaid ? '#A7F3D0' : '#BFDBFE'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
                  }}>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 700, color: isExpired ? '#B91C1C' : hasPaid ? '#047857' : THEME.navy, marginBottom: 4 }}>
                        {isExpired
                          ? `이용 기간이 만료되었습니다 (${formatDateKorean(expiry)}까지)`
                          : hasPaid
                            ? `결제 완료 · ${formatDateKorean(expiry)}까지 이용 가능합니다`
                            : `무료체험 중 · ${formatDateKorean(expiry)}까지 무료로 이용 가능합니다`}
                      </p>
                      <p style={{ fontSize: 13, color: isExpired ? '#DC2626' : THEME.muted }}>
                        {isExpired
                          ? '결제하지 않으면 사이트 접속이 제한됩니다. 결제 후 바로 다시 이용하실 수 있어요.'
                          : hasPaid
                            ? '이용 기간이 끝나기 전에 다시 결제하면 남은 기간에 이어서 연장됩니다.'
                            : '30일 무료체험이 끝난 후 결제하지 않으면 사이트가 자동으로 차단됩니다.'}
                      </p>
                    </div>
                    <button
                      onClick={() => setShowPaymentModal(true)}
                      style={{
                        padding: '12px 22px', borderRadius: 10, fontFamily: 'inherit', fontWeight: 700, fontSize: 14, cursor: 'pointer',
                        border: 'none', background: THEME.sky, color: 'white', whiteSpace: 'nowrap',
                      }}
                    >
                      결제하기
                    </button>
                  </div>
                )}
              </div>
            )
          })()}

          {/* BUILDER LAYOUT */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 24, alignItems: 'start' }}>

            {/* LEFT: FORM */}
            <div>
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

              {/* TABS */}
              <div style={{
                display: 'flex', gap: 4, flexWrap: 'wrap',
                background: '#F3F4F6', borderRadius: 10,
                padding: 4, marginBottom: 24,
              }}>
                {[
                  { key: 'basic', label: '기본 정보' },
                  { key: 'worship', label: '예배·설교' },
                  { key: 'content', label: '소개·소식' },
                  { key: 'service', label: '서비스 설정' },
                  { key: 'design', label: '디자인' },
                  { key: 'seo', label: 'SEO' },
                ].map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key as typeof activeTab)}
                    style={{
                      flex: '1 1 100px',
                      background: activeTab === tab.key ? 'white' : 'transparent',
                      border: 'none',
                      borderRadius: 8,
                      padding: '9px 8px',
                      fontFamily: 'inherit',
                      fontWeight: activeTab === tab.key ? 700 : 500,
                      fontSize: 13,
                      color: activeTab === tab.key ? THEME.navy : THEME.muted,
                      cursor: 'pointer',
                      boxShadow: activeTab === tab.key ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                      transition: 'all 0.15s',
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* BASIC TAB */}
              {activeTab === 'basic' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${THEME.border}`, padding: '28px' }}>
                    <h3 style={{ fontWeight: 700, color: THEME.navy, marginBottom: 6, fontSize: 16 }}>화면 방식</h3>
                    <p style={{ color: THEME.muted, fontSize: 13, marginBottom: 16 }}>페이지 전환형은 메뉴마다 주소가 따로 있어서 네이버·구글 검색에 더 잘 노출돼요.</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      {([
                        ['multipage', '페이지 전환형 (추천)', '교회 소개·예배·주보·소식이 각각 다른 페이지로 열려요'],
                        ['onepage', '원페이지형', '모든 내용을 한 페이지에서 아래로 스크롤해서 봐요'],
                      ] as const).map(([value, label, desc]) => (
                        <label key={value} style={{ cursor: 'pointer', padding: '14px 16px', borderRadius: 12, background: layoutMode === value ? THEME.skyLight : '#F9FAFB', border: `2px solid ${layoutMode === value ? THEME.navy : THEME.border}` }}>
                          <input type="radio" name="layoutMode" checked={layoutMode === value} onChange={() => setLayoutMode(value)} style={{ display: 'none' }} />
                          <p style={{ fontWeight: 700, color: THEME.navy, fontSize: 14 }}>{label}</p>
                          <p style={{ color: THEME.muted, fontSize: 12, marginTop: 4 }}>{desc}</p>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${THEME.border}`, padding: '28px' }}>
                    <h3 style={{ fontWeight: 700, color: THEME.navy, marginBottom: 24, fontSize: 16 }}>교회 기본 정보</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                      <Field label="교회 이름 *" placeholder="ex. 새벽교회" value={form.churchName} onChange={v => update('churchName', v)} hint={bulletinHint('churchName')} />
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
                      <Field label="대표 전화" placeholder="ex. 02-1234-5678" value={form.phone} onChange={v => update('phone', v)} hint={bulletinHint('phone')} />
                      <Field label="이메일" placeholder="ex. church@example.com" value={form.email} onChange={v => update('email', v)} hint={bulletinHint('email')} />
                      <div style={{ gridColumn: '1 / -1' }}>
                        <Field label="주소" placeholder="ex. 서울특별시 마포구 ..." value={form.address} onChange={v => update('address', v)} hint={bulletinHint('address')} />
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <Field label="상세 위치 안내" placeholder="ex. 상가 3층, 엘리베이터 옆 계단으로 올라오세요" value={form.locationDetail} onChange={v => update('locationDetail', v)} hint={bulletinHint('locationDetail')} />
                        <p style={{ fontSize: 12, color: THEME.muted, marginTop: 4 }}>상가/건물 안에 있는 경우, 처음 오시는 분이 헷갈리지 않도록 입구·층수 등을 적어주세요.</p>
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <TextareaField label="교회 소개" placeholder="교회를 간략하게 소개해 주세요." value={form.intro} onChange={v => update('intro', v)} hint={bulletinHint('intro')} />
                      </div>
                    </div>
                  </div>

                  <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${THEME.border}`, padding: '28px' }}>
                    <h3 style={{ fontWeight: 700, color: THEME.navy, marginBottom: 6, fontSize: 16 }}>담임 목사 소개</h3>
                    <p style={{ color: THEME.muted, fontSize: 13, marginBottom: 20 }}>방문자에게 첫인사를 전하는 인사말이에요.</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
                      <Field label="담임 목사 성함 *" placeholder="ex. 홍길동" value={form.pastor} onChange={v => update('pastor', v)} hint={bulletinHint('pastor')} />
                      <Field label="직분" placeholder="ex. 담임목사" value={form.pastorRole} onChange={v => update('pastorRole', v)} hint={bulletinHint('pastorRole')} />
                    </div>
                    <div style={{ marginBottom: 20 }}>
                      <TextareaField
                        label="짧은 소개 (선택)"
                        placeholder="ex. 고난을 말씀으로 해석하고, 삶의 모든 자리에서 십자가의 복음을 살아 내도록 돕습니다."
                        value={form.pastorTagline}
                        onChange={v => update('pastorTagline', v)}
                        hint={bulletinHint('pastorTagline')}
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
                    <TextareaField label="인사말 (MESSAGE)" placeholder="성도님들과 방문객을 환영하는 인사말을 적어주세요." value={form.pastorMessage} onChange={v => update('pastorMessage', v)} hint={bulletinHint('pastorMessage')} />
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
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
                            {worshipServices.map((s, i) => {
                              const key = s.group?.trim() || WORSHIP_DEFAULT_GROUP
                              if (key !== group) return null
                              return (
                                <div key={i} style={{ border: `1px solid ${THEME.border}`, borderRadius: 10, padding: 12, background: 'white' }}>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 8 }}>
                                    <Field label="예배명" placeholder="ex. 1부" value={s.title} onChange={v => updateWorshipService(i, 'title', v)} />
                                    <Field label="시간" placeholder="ex. 오전 9:00" value={s.time} onChange={v => updateWorshipService(i, 'time', v)} />
                                  </div>
                                  <Field label="비고 (선택)" placeholder="ex. 본당 / 유아부 동반 가능" value={s.note} onChange={v => updateWorshipService(i, 'note', v)} />
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

                  <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${THEME.border}`, padding: '28px' }}>
                    <h3 style={{ fontWeight: 700, color: THEME.navy, marginBottom: 20, fontSize: 16 }}>설교 · 미디어</h3>
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

                  <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${THEME.border}`, padding: '28px' }}>
                    <h3 style={{ fontWeight: 700, color: THEME.navy, marginBottom: 6, fontSize: 16 }}>온라인 예배 (지난 설교 목록)</h3>
                    <p style={{ color: THEME.muted, fontSize: 13, marginBottom: 20 }}>홈 화면에 카드 목록으로 표시돼요. 비워두면 이 섹션 자체가 안 보입니다.</p>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', padding: '10px 14px', borderRadius: 10, background: onlineWorshipEnabled ? THEME.skyLight : '#F9FAFB', border: `1px solid ${onlineWorshipEnabled ? '#BFDBFE' : THEME.border}`, transition: 'all 0.15s', marginBottom: 20 }}>
                      <div
                        onClick={() => setOnlineWorshipEnabled(v => !v)}
                        style={{
                          width: 20, height: 20, borderRadius: 6,
                          background: onlineWorshipEnabled ? THEME.navy : 'white',
                          border: `2px solid ${onlineWorshipEnabled ? THEME.navy : '#D1D5DB'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0, cursor: 'pointer',
                          transition: 'all 0.15s',
                        }}
                      >
                        {onlineWorshipEnabled && <span style={{ color: 'white', fontSize: 12, lineHeight: 1 }}>✓</span>}
                      </div>
                      <span style={{ fontWeight: 500, fontSize: 14, color: THEME.text, flex: 1 }} onClick={() => setOnlineWorshipEnabled(v => !v)}>온라인 예배 섹션 표시</span>
                    </label>
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
                  </div>
                </div>
              )}

              {/* CONTENT TAB */}
              {activeTab === 'content' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${THEME.border}`, padding: '28px' }}>
                    <h3 style={{ fontWeight: 700, color: THEME.navy, marginBottom: 6, fontSize: 16 }}>교회 주보 (종이 주보 파일)</h3>
                    <p style={{ color: THEME.muted, fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
                      교회에서 쓰는 한글(HWP)·워드·PDF·사진 파일을 그대로 올리면 홈페이지 '교회 주보'에 표로 보여요.
                      PDF·사진은 바로 열리고, 한글·워드는 내려받기로 제공돼요. 온라인 주보는 따로 '온라인 주보'에 자동으로 보여요.
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr auto', gap: 10, alignItems: 'end' }}>
                      <div>
                        <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>주보 날짜 *</label>
                        <input type="date" value={paperDraft.date} onChange={e => setPaperDraft(d => ({ ...d, date: e.target.value }))} style={inputStyle} />
                      </div>
                      <div>
                        <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>제목 (선택)</label>
                        <input value={paperDraft.title} onChange={e => setPaperDraft(d => ({ ...d, title: e.target.value }))} placeholder="비우면 '2026.11.01 주보'로 표시돼요" style={inputStyle} />
                      </div>
                      <label style={{ padding: '11px 16px', borderRadius: 8, background: THEME.navy, color: 'white', fontSize: 13, fontWeight: 700, cursor: uploadingPaper ? 'wait' : 'pointer', whiteSpace: 'nowrap', opacity: uploadingPaper ? 0.6 : 1 }}>
                        {uploadingPaper ? '올리는 중...' : '파일 올리기'}
                        <input type="file" accept={PAPER_BULLETIN_ACCEPT} onChange={handlePaperBulletinFile} disabled={uploadingPaper} style={{ display: 'none' }} />
                      </label>
                    </div>
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
                    {paperBulletins.length > 0 && (
                      <div style={{ marginTop: 16, border: `1px solid ${THEME.border}`, borderRadius: 10, overflow: 'hidden' }}>
                        {paperBulletins.map((p, i) => (
                          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderTop: i ? `1px solid ${THEME.border}` : 'none', fontSize: 13 }}>
                            <span style={{ color: THEME.muted, width: 84, flexShrink: 0 }}>{p.date.replace(/-/g, '.')}</span>
                            <span style={{ flex: 1, fontWeight: 600, color: THEME.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: THEME.navy, background: THEME.skyLight, borderRadius: 6, padding: '2px 8px', textTransform: 'uppercase' }}>{p.fileType}</span>
                            {(p.sermons?.length || p.news?.length) ? (
                              <span style={{ fontSize: 11, color: THEME.muted, whiteSpace: 'nowrap' }}>설교 {p.sermons?.length || 0} · 소식 {p.news?.length || 0}</span>
                            ) : null}
                            {p.fileType !== 'doc' && (
                              <button type="button" onClick={() => analyzePaperBulletin(p)} disabled={!!analyzingPaperId}
                                style={{ fontSize: 12, color: THEME.navy, background: 'none', border: 'none', cursor: analyzingPaperId ? 'wait' : 'pointer', whiteSpace: 'nowrap' }}>
                                {analyzingPaperId === p.id ? '읽는 중...' : '내용 읽기'}
                              </button>
                            )}
                            <a href={p.fileUrl} target="_blank" rel="noopener noreferrer" style={{ color: THEME.sky, fontSize: 12 }}>열기</a>
                            <button type="button" onClick={() => removePaperBulletin(p.id)} style={{ fontSize: 12, color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer' }}>삭제</button>
                          </div>
                        ))}
                      </div>
                    )}
                    <p style={{ fontSize: 12, color: THEME.muted, marginTop: 10 }}>파일을 올리거나 지운 뒤 '저장'을 눌러야 홈페이지에 반영돼요.</p>
                  </div>
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

                  <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${THEME.border}`, padding: '28px' }}>
                    <h3 style={{ fontWeight: 700, color: THEME.navy, marginBottom: 6, fontSize: 16 }}>소식 (뉴스)</h3>
                    <p style={{ color: THEME.muted, fontSize: 13, marginBottom: 20 }}>교회 소식이나 행사 안내를 게시물 형태로 올릴 수 있어요.</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {newsItems.map((n, i) => (
                        <div key={i} style={{ border: `1px solid ${THEME.border}`, borderRadius: 12, padding: 16 }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 10 }}>
                            <Field label="제목" placeholder="ex. 여름 수련회 안내" value={n.title} onChange={val => updateNewsItem(i, 'title', val)} />
                            <Field label="날짜" placeholder="ex. 2026.08.15" value={n.date} onChange={val => updateNewsItem(i, 'date', val)} />
                          </div>
                          <TextareaField label="내용" placeholder="소식 내용을 적어주세요." value={n.content} onChange={val => updateNewsItem(i, 'content', val)} />
                          <button onClick={() => removeNewsItem(i)} style={removeLinkStyle}>삭제</button>
                        </div>
                      ))}
                    </div>
                    <button onClick={addNewsItem} style={addLinkStyle}>+ 소식 추가</button>
                  </div>

                  <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${THEME.border}`, padding: '28px' }}>
                    <h3 style={{ fontWeight: 700, color: THEME.navy, marginBottom: 6, fontSize: 16 }}>섬기는 사람들</h3>
                    {listHint(staffMembers.map(m => `${m.role} ${m.name}`), (bulletinDefaults?.staffMembers || []).map(m => `${m.role} ${m.name}`))}
                    <p style={{ color: THEME.muted, fontSize: 13, marginBottom: 20 }}>부목사·전도사 등 함께 섬기는 사역자를 소개해보세요. 숫자 제한 없이 추가할 수 있어요.</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {staffMembers.map((s, i) => (
                        <div key={i} style={{ border: `1px solid ${THEME.border}`, borderRadius: 12, padding: 16 }}>
                          <div style={{ marginBottom: 12 }}>
                            <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 10 }}>사진 <span style={{ fontWeight: 400, color: THEME.muted }}>(선택)</span></label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              {s.photoUrl ? (
                                <img src={s.photoUrl} alt={s.name || '사역자 사진 미리보기'} style={{ width: 44, height: 58, objectFit: 'cover', borderRadius: 8, border: `1px solid ${THEME.border}` }} />
                              ) : (
                                <div style={{ width: 44, height: 58, borderRadius: 8, border: `1px dashed ${THEME.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: THEME.muted }}>없음</div>
                              )}
                              <label style={{ padding: '9px 16px', borderRadius: 8, border: `1px solid ${THEME.border}`, background: 'white', fontSize: 13, fontWeight: 600, color: THEME.text, cursor: 'pointer' }}>
                                {uploadingStaffIndex === i ? '업로드 중...' : '사진 선택'}
                                <input type="file" accept="image/*" onChange={e => handleStaffPhotoFileChange(i, e)} disabled={uploadingStaffIndex === i} style={{ display: 'none' }} />
                              </label>
                              {s.photoUrl && (
                                <button type="button" onClick={() => updateStaffMember(i, 'photoUrl', '')} style={{ fontSize: 12, color: THEME.muted, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>삭제</button>
                              )}
                            </div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
                            <Field label="직분" placeholder="ex. 부목사 / 전도사 / 강도사" value={s.role} onChange={val => updateStaffMember(i, 'role', val)} />
                            <Field label="이름" placeholder="ex. 홍길동" value={s.name} onChange={val => updateStaffMember(i, 'name', val)} />
                          </div>
                          <div style={{ marginBottom: 10 }}>
                            <Field label="담당 부서" placeholder="ex. 청년부 / 교육부 / 찬양팀" value={s.department} onChange={val => updateStaffMember(i, 'department', val)} />
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
                            <Field label="연락처" placeholder="숫자만 입력" value={s.phone} onChange={val => updateStaffMember(i, 'phone', formatPhoneInput(val))} />
                            <Field label="이메일" placeholder="ex. staff@example.com" value={s.email} onChange={val => updateStaffMember(i, 'email', val)} />
                          </div>
                          <button onClick={() => removeStaffMember(i)} style={removeLinkStyle}>삭제</button>
                        </div>
                      ))}
                    </div>
                    <button onClick={addStaffMember} style={addLinkStyle}>+ 사역자 추가</button>
                  </div>

                  <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${THEME.border}`, padding: '28px' }}>
                    <h3 style={{ fontWeight: 700, color: THEME.navy, marginBottom: 6, fontSize: 16 }}>중직자 (장로·권사)</h3>
                    {listHint(layLeaders.map(m => `${m.role} ${m.name}`), (bulletinDefaults?.layLeaders || []).map(m => `${m.role} ${m.name}`))}
                    <p style={{ color: THEME.muted, fontSize: 13, marginBottom: 20 }}>장로님·권사님을 소개해보세요. 시무장로 → 원로장로 → 은퇴장로 → 권사 순으로 자동 정렬되어 표시돼요. 숫자 제한 없이 추가할 수 있어요.</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {layLeaders.map((l, i) => (
                        <div key={i} style={{ border: `1px solid ${THEME.border}`, borderRadius: 12, padding: 16 }}>
                          <div style={{ marginBottom: 12 }}>
                            <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 10 }}>사진 <span style={{ fontWeight: 400, color: THEME.muted }}>(선택)</span></label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              {l.photoUrl ? (
                                <img src={l.photoUrl} alt={l.name || '중직자 사진 미리보기'} style={{ width: 44, height: 58, objectFit: 'cover', borderRadius: 8, border: `1px solid ${THEME.border}` }} />
                              ) : (
                                <div style={{ width: 44, height: 58, borderRadius: 8, border: `1px dashed ${THEME.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: THEME.muted }}>없음</div>
                              )}
                              <label style={{ padding: '9px 16px', borderRadius: 8, border: `1px solid ${THEME.border}`, background: 'white', fontSize: 13, fontWeight: 600, color: THEME.text, cursor: 'pointer' }}>
                                {uploadingLayLeaderIndex === i ? '업로드 중...' : '사진 선택'}
                                <input type="file" accept="image/*" onChange={e => handleLayLeaderPhotoFileChange(i, e)} disabled={uploadingLayLeaderIndex === i} style={{ display: 'none' }} />
                              </label>
                              {l.photoUrl && (
                                <button type="button" onClick={() => updateLayLeader(i, 'photoUrl', '')} style={{ fontSize: 12, color: THEME.muted, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>삭제</button>
                              )}
                            </div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
                            <div>
                              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>직분</label>
                              <select
                                value={l.role}
                                onChange={e => updateLayLeader(i, 'role', e.target.value)}
                                style={inputStyle}
                              >
                                {LAY_LEADER_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                              </select>
                            </div>
                            <Field label="이름" placeholder="ex. 홍길동" value={l.name} onChange={val => updateLayLeader(i, 'name', val)} />
                          </div>
                          <Field label="담당 부서 (선택)" placeholder="ex. 교육부 / 재정부" value={l.department} onChange={val => updateLayLeader(i, 'department', val)} />
                          <div style={{ marginTop: 10 }}>
                            <button onClick={() => removeLayLeader(i)} style={removeLinkStyle}>삭제</button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <button onClick={addLayLeader} style={addLinkStyle}>+ 중직자 추가</button>
                  </div>
                </div>
              )}

              {/* SERVICE TAB */}
              {activeTab === 'service' && (
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
                    <h3 style={{ fontWeight: 700, color: THEME.navy, marginBottom: 20, fontSize: 16 }}>채널 연동</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <Field label="카카오채널 링크" placeholder="https://pf.kakao.com/..." value={form.kakaoLink} onChange={v => update('kakaoLink', v)} />
                      <Field label="유튜브 채널 링크" placeholder="https://youtube.com/@..." value={form.youtubeLink} onChange={v => update('youtubeLink', v)} hint={bulletinHint('youtubeLink')} />
                      <Field label="인스타그램 링크" placeholder="https://instagram.com/..." value={form.instagramLink} onChange={v => update('instagramLink', v)} hint={bulletinHint('instagramLink')} />
                    </div>
                  </div>
                </div>
              )}

              {/* DESIGN TAB */}
              {activeTab === 'design' && (
                <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${THEME.border}`, padding: '28px' }}>
                  <h3 style={{ fontWeight: 700, color: THEME.navy, marginBottom: 24, fontSize: 16 }}>디자인 설정</h3>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ height: 44, width: 44, borderRadius: 8, border: `1px solid ${THEME.border}`, background: '#F9FAFB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {denomination !== NO_DENOMINATION
                          ? <img key={denomination} src={denominationLogoSrc(denomination)} alt="" style={{ height: 34, width: 34, objectFit: 'contain' }} onError={e => { e.currentTarget.style.display = 'none' }} />
                          : <span style={{ fontSize: 11, color: THEME.muted }}>없음</span>}
                      </div>
                      <select value={denomination} onChange={e => setDenomination(e.target.value)}
                        style={{ flex: 1, border: `1px solid ${THEME.border}`, borderRadius: 8, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', background: 'white', color: THEME.text }}>
                        {DENOMINATIONS.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        <option value={NO_DENOMINATION}>사용 안 함</option>
                      </select>
                    </div>
                    {denomination !== NO_DENOMINATION && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, cursor: 'pointer', fontSize: 13, color: THEME.text }}>
                        <input type="checkbox" checked={denominationWithLogo} onChange={e => setDenominationWithLogo(e.target.checked)} style={{ width: 16, height: 16, accentColor: THEME.navy }} />
                        로고 이미지가 있어도 교단 마크를 옆에 같이 표시
                      </label>
                    )}
                  </div>
                  <div style={{ marginBottom: 28 }}>
                    <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 10 }}>로고 이미지 <span style={{ fontWeight: 400, color: THEME.muted }}>(선택 · 직접 올리면 교단 마크 대신 표시)</span></label>
                    {bulletinDefaults?.text.logoUrl && form.logoUrl === bulletinDefaults.text.logoUrl && (
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
                      <b>권장 크기: 가로 1920 × 세로 1080px (16:9 가로 사진)</b><br />
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

              {/* SEO TAB */}
              {activeTab === 'seo' && (
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

          {showPaymentModal && selectedProject && (
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

function Field({ label, placeholder, value, onChange, hint }: {
  label: string; placeholder: string; value: string; onChange: (v: string) => void; hint?: React.ReactNode
}) {
  return (
    <div>
      <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>{label}</label>
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

function TextareaField({ label, placeholder, value, onChange, hint }: {
  label: string; placeholder: string; value: string; onChange: (v: string) => void; hint?: React.ReactNode
}) {
  return (
    <div>
      <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>{label}</label>
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
