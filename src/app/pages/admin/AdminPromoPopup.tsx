import { useEffect, useState } from "react";
import { collection, doc, getDocs, limit, onSnapshot, orderBy, query, setDoc, serverTimestamp } from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "../../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { Button } from "../../components/ui/button";
import { Megaphone } from "lucide-react";
import { toast } from "sonner";
import { PROMO_HIDES, PROMO_POPUP_DEFAULT, PROMO_POPUP_DOC, PromoPopupCard, PromoPopupData, readPromoPopup } from "../../components/PromoPopup";

// /super > 홍보 팝업(2026-11-20). 주보 첫 화면(/)과 주보 관리 화면(/admin)에 뜨는 팝업을 켜고 끄고, 문구·사진·버튼을 바꿈.
// 저장 위치: settings/promoPopup. 성도 주보 화면·교회 홈페이지에는 뜨지 않음
const ADMIN_EMAILS = ["akhj123akhjk@gmail.com", "stayon.platform@gmail.com"];

// 사진을 줄여서 올림(긴 쪽 maxSize, jpg)
async function resizeToBlob(file: File, maxSize: number, quality = 0.85): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = URL.createObjectURL(file);
  });
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
  const cv = document.createElement("canvas");
  cv.width = Math.round(img.width * scale);
  cv.height = Math.round(img.height * scale);
  cv.getContext("2d")!.drawImage(img, 0, 0, cv.width, cv.height);
  URL.revokeObjectURL(img.src);
  return new Promise((res) => cv.toBlob((b) => res(b!), "image/jpeg", quality));
}

// "오늘 하루 보지 않기" 누른 기록(최근 500건). 로그인한 교회는 교회 이름으로, 로그인 안 한 방문자는 날짜별 숫자로
interface HideRow { id: string; churchName: string | null; email: string | null; loggedIn: boolean; page: string; date: string }
function HideLog() {
  const [rows, setRows] = useState<HideRow[] | null>(null);
  useEffect(() => {
    getDocs(query(collection(db, PROMO_HIDES), orderBy("at", "desc"), limit(500)))
      .then((s) => setRows(s.docs.map((x) => ({ id: x.id, ...(x.data() as Omit<HideRow, "id">) }))))
      .catch(() => setRows([]));
  }, []);
  if (!rows) return null;
  const churches = rows.filter((r) => r.loggedIn);
  const visitorsByDate = rows.filter((r) => !r.loggedIn).reduce<Record<string, number>>((a, r) => ({ ...a, [r.date]: (a[r.date] ?? 0) + 1 }), {});
  const today = new Date().toLocaleDateString("sv-SE");
  return (
    <div className="mt-6 bg-white rounded-2xl md:rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 p-4 sm:p-6">
      <p className="font-bold text-gray-900 text-sm sm:text-base">"오늘 하루 보지 않기" 누른 기록</p>
      <p className="text-[11px] sm:text-xs text-gray-400 mt-0.5">오늘 {rows.filter((r) => r.date === today).length}건 · 로그인한 교회는 이름이 남고, 로그인 안 한 방문자는 숫자로만 남아요 (최근 500건)</p>

      <p className="mt-5 text-xs font-bold text-gray-500">교회 {churches.length}건</p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[520px] text-left">
          <thead><tr className="border-b border-gray-100 text-[12px] text-gray-400"><th className="py-2 pr-3 font-bold">날짜</th><th className="py-2 pr-3 font-bold">교회</th><th className="py-2 pr-3 font-bold">이메일</th><th className="py-2 font-bold">누른 곳</th></tr></thead>
          <tbody className="text-[13px] text-gray-700">
            {churches.map((r) => (
              <tr key={r.id} className="border-b border-gray-50 last:border-0">
                <td className="py-2 pr-3 whitespace-nowrap">{r.date}</td>
                <td className="py-2 pr-3 font-bold text-gray-900">{r.churchName || "(교회 이름 없음)"}</td>
                <td className="py-2 pr-3 text-gray-500">{r.email}</td>
                <td className="py-2 whitespace-nowrap">{r.page === "/admin" ? "주보 관리 화면" : "첫 화면"}</td>
              </tr>
            ))}
            {!churches.length && <tr><td colSpan={4} className="py-6 text-center text-gray-400">아직 없어요</td></tr>}
          </tbody>
        </table>
      </div>

      <p className="mt-5 text-xs font-bold text-gray-500">로그인 안 한 방문자</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {Object.entries(visitorsByDate).map(([date, n]) => (
          <span key={date} className="rounded-full bg-gray-50 border border-gray-100 px-3 py-1 text-[12px] text-gray-600">{date} · <b className="text-gray-900">{n}명</b></span>
        ))}
        {!Object.keys(visitorsByDate).length && <span className="text-[13px] text-gray-400">아직 없어요</span>}
      </div>
    </div>
  );
}

export const AdminPromoPopup = () => {
  const [d, setD] = useState<PromoPopupData>(PROMO_POPUP_DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const set = (p: Partial<PromoPopupData>) => setD((x) => ({ ...x, ...p }));

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user || !ADMIN_EMAILS.includes(user.email || "")) {
        alert("접근 권한이 없습니다.");
        window.location.href = "/login";
      }
    });
    return () => unsubAuth();
  }, []);

  // 처음 한 번만 불러옴(입력 중에 덮어쓰지 않게)
  useEffect(() => {
    const unsub = onSnapshot(doc(db, ...PROMO_POPUP_DOC), (snap) => {
      setD(readPromoPopup(snap.data()));
      setLoading(false);
      unsub();
    }, () => setLoading(false));
    return () => unsub();
  }, []);

  const upload = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const blob = await resizeToBlob(file, 1000);
      const r = storageRef(storage, `promoPopup/${Date.now()}.jpg`);
      await uploadBytes(r, blob, { contentType: "image/jpeg" });
      set({ imageUrl: await getDownloadURL(r) });
    } catch (e) {
      console.error("팝업 사진 올리기 오류:", e);
      toast.error("사진을 올리지 못했어요.");
    } finally {
      setUploading(false);
    }
  };

  const save = async (next: PromoPopupData = d) => {
    setSaving(true);
    try {
      await setDoc(doc(db, ...PROMO_POPUP_DOC), { ...next, updatedAt: serverTimestamp() }, { merge: true });
      toast.success(next.enabled ? "저장했어요. 지금부터 팝업이 떠요." : "저장했어요. 팝업은 꺼져 있어요.");
    } catch (e) {
      console.error("홍보 팝업 저장 실패:", e);
      toast.error("저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  // 스위치는 누르면 바로 저장(켜고 끄기만 할 때 저장 버튼 안 눌러도 되게)
  const toggle = (on: boolean) => { const next = { ...d, enabled: on }; setD(next); save(next); };

  const input = "w-full px-3.5 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium";

  return (
    <div className="p-4 sm:p-8 md:p-12">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6 md:mb-10">
          <h1 className="text-xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">홍보 팝업</h1>
          <p className="text-gray-500 mt-1.5 md:mt-2 text-xs sm:text-base font-medium leading-relaxed">
            주보 플랫폼 <b>첫 화면</b>과 교회 <b>주보 관리 화면</b>에 들어오자마자 뜨는 팝업이에요.
            성도님들이 보는 주보 화면과 교회 홈페이지에는 뜨지 않아요. "오늘 하루 보지 않기"를 누른 사람에게는 그날 다시 안 떠요.
          </p>
        </div>

        {loading ? (
          <div className="bg-white rounded-3xl border border-gray-100 p-16 text-center text-gray-400 font-medium text-sm">불러오는 중입니다...</div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_400px] items-start">
            <div className="bg-white rounded-2xl md:rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 p-4 sm:p-6 space-y-5">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${d.enabled ? "bg-blue-50 text-blue-600" : "bg-gray-100 text-gray-400"}`}>
                    <Megaphone className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 text-sm sm:text-base">팝업 {d.enabled ? "켜짐 (ON)" : "꺼짐 (OFF)"}</p>
                    <p className="text-[11px] sm:text-xs text-gray-400 mt-0.5">누르면 바로 적용돼요. 꺼도 내용은 남아 있어요</p>
                  </div>
                </div>
                {/* ON/OFF 토글(2026-11-20): 꺼져 있어도 회색 막대 + "OFF" 글자로 또렷하게 보이게(공용 Switch는 꺼지면 점처럼 보여서 이 화면만 따로) */}
                <button type="button" role="switch" aria-checked={d.enabled} aria-label={d.enabled ? "팝업 끄기" : "팝업 켜기"}
                  onClick={() => toggle(!d.enabled)} disabled={saving}
                  className="inline-flex shrink-0 items-center gap-2.5 disabled:opacity-60 disabled:cursor-wait">
                  <span className={`w-8 text-right text-sm font-black ${d.enabled ? "text-[#3182F6]" : "text-gray-400"}`}>{d.enabled ? "ON" : "OFF"}</span>
                  <span className={`relative h-8 w-14 rounded-full transition-colors duration-200 ${d.enabled ? "bg-[#3182F6]" : "bg-gray-300"}`}>
                    <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.25)] transition-all duration-200 ${d.enabled ? "left-7" : "left-1"}`} />
                  </span>
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">제목 (엔터로 줄바꿈)</label>
                <textarea rows={2} value={d.title} onChange={(e) => set({ title: e.target.value })} className={`${input} resize-none`} />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">설명 (한 줄에 한 가지씩 — 줄 끝에 (괄호)로 쓰면 아래에 파란 작은 글씨로 나와요)</label>
                <textarea rows={3} value={d.message} onChange={(e) => set({ message: e.target.value })} className={`${input} resize-none`} />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">사진 (선택 · 카드 맨 위에 표시)</label>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="cursor-pointer rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50">
                    {uploading ? "올리는 중..." : d.imageUrl ? "사진 바꾸기" : "사진 올리기"}
                    <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
                  </label>
                  {d.imageUrl && (
                    <button type="button" onClick={() => set({ imageUrl: "" })} className="rounded-xl px-3 py-2.5 text-sm font-bold text-red-500 hover:bg-red-50">사진 빼기</button>
                  )}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">버튼 글자</label>
                  <input value={d.buttonText} onChange={(e) => set({ buttonText: e.target.value })} className={input} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">버튼 누르면 갈 주소</label>
                  <input value={d.linkUrl} onChange={(e) => set({ linkUrl: e.target.value })} placeholder="https://website.stayon-platform.com/" className={input} />
                </div>
              </div>
              <p className="text-[11px] text-gray-400 -mt-2">버튼 글자나 주소를 비우면 버튼 없이 떠요. website 주소로 보내면 로그인이 이어져요.</p>

              <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2 pt-2">
                <button type="button" onClick={() => setD({ ...PROMO_POPUP_DEFAULT, enabled: d.enabled, imageUrl: d.imageUrl })}
                  className="rounded-xl px-4 py-3 text-sm font-bold text-gray-500 hover:bg-gray-50">기본 문구로 되돌리기</button>
                <Button onClick={() => save()} disabled={saving || uploading} className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold px-6 py-3 shadow-sm">
                  {saving ? "저장 중..." : "저장하기"}
                </Button>
              </div>
            </div>

            <div className="lg:sticky lg:top-8">
              <p className="text-xs font-bold text-gray-400 mb-2">미리보기 (실제 화면과 같은 모양)</p>
              <div className="rounded-3xl bg-black/45 p-4 sm:p-6">
                <PromoPopupCard data={d} />
              </div>
            </div>
          </div>
        )}

        {!loading && <HideLog />}
      </div>
    </div>
  );
};
