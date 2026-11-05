import { Fragment, useEffect, useState } from "react";
import { collection, getDocs, query, orderBy, doc, setDoc, where } from "firebase/firestore";
import { auth, db } from "../../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { Mail, Calendar, Shield, UserCheck, Search, Globe } from "lucide-react";
import { Switch } from "../../components/ui/switch";

// 교회별 주보 전용 주소({주소}-jubo.stayon-platform.com) — functions/src/bulletinSeo.ts의
// BULLETIN_SLUG_REGEX / verificationCode와 같은 규칙. 주보플러스처럼 교회 하나를 네이버·구글에
// 사이트 하나로 등록하기 위한 주소이고, 기존 QR 주소(/view/교회ID)는 그대로 열린다
const JUBO_HOST_SUFFIX = "-jubo.stayon-platform.com";
const BULLETIN_SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])?$/;
const toVerificationCode = (v: string) => {
  const m = v.trim().match(/content=["']([^"']+)["']/);
  return (m ? m[1] : v).trim();
};

const JuboSiteEditor = ({ user, onSaved, onClose }: { user: any; onSaved: (data: Record<string, string>) => void; onClose: () => void }) => {
  const [slug, setSlug] = useState<string>(user.bulletinSlug || "");
  const [naver, setNaver] = useState<string>(user.naverSiteVerification || "");
  const [google, setGoogle] = useState<string>(user.googleSiteVerification || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const nextSlug = slug.trim().toLowerCase();
    if (nextSlug && !BULLETIN_SLUG_REGEX.test(nextSlug)) {
      alert("주소는 영어 소문자·숫자·하이픈(-)만, 30자 이내로 입력해 주세요. (예: haeundae)");
      return;
    }
    setSaving(true);
    try {
      if (nextSlug) {
        const dup = await getDocs(query(collection(db, "users"), where("bulletinSlug", "==", nextSlug)));
        if (dup.docs.some((d) => d.id !== user.id)) {
          alert("이미 다른 교회가 쓰고 있는 주소입니다.");
          return;
        }
      }
      // 주소를 새로 정하거나 바꿀 때만 두 번 확인(소유확인 코드만 바꿀 땐 묻지 않음)
      if (nextSlug !== (user.bulletinSlug || "")) {
        const full = nextSlug ? `${nextSlug}${JUBO_HOST_SUFFIX}` : "(주소 없음)";
        if (!window.confirm(
          `주보 전용 주소를 "${full}"(으)로 정합니다.\n\n` +
          "네이버·구글에 등록한 뒤에는 바꾸면 처음부터 다시 등록해야 합니다. 신중하게 확인해 주세요."
        )) return;
        if (!window.confirm(`정말 "${full}"(으)로 진행하시겠어요?`)) return;
      }
      const data = {
        bulletinSlug: nextSlug,
        naverSiteVerification: toVerificationCode(naver),
        googleSiteVerification: toVerificationCode(google),
      };
      await setDoc(doc(db, "users", user.id), data, { merge: true });
      onSaved(data);
    } catch (error) {
      console.error("주보 전용 주소 저장 오류:", error);
      alert("저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const inputClass = "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400";
  return (
    <div className="space-y-3 rounded-xl bg-gray-50 p-4">
      <label className="block">
        <span className="text-xs font-bold text-gray-600">주보 전용 주소</span>
        <div className="mt-1 flex items-center gap-1">
          <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="haeundae" className={inputClass} />
          <span className="text-xs text-gray-500 whitespace-nowrap">{JUBO_HOST_SUFFIX}</span>
        </div>
      </label>
      <label className="block">
        <span className="text-xs font-bold text-gray-600">네이버 소유확인 코드 (메타 태그 전체를 붙여넣어도 됩니다)</span>
        <input value={naver} onChange={(e) => setNaver(e.target.value)} placeholder='<meta name="naver-site-verification" content="..." />' className={`${inputClass} mt-1`} />
      </label>
      <label className="block">
        <span className="text-xs font-bold text-gray-600">구글 소유확인 코드 (선택)</span>
        <input value={google} onChange={(e) => setGoogle(e.target.value)} placeholder='<meta name="google-site-verification" content="..." />' className={`${inputClass} mt-1`} />
      </label>
      {user.bulletinSlug && slug.trim().toLowerCase() !== user.bulletinSlug && (
        <p className="text-xs font-bold text-red-600">
          주소를 바꾸면 기존 주소({user.bulletinSlug}{JUBO_HOST_SUFFIX})는 더 이상 열리지 않고, 네이버·구글에 새 주소로 다시 등록해야 합니다.
        </p>
      )}
      {user.bulletinSearchable !== true && (
        <p className="text-xs font-bold text-amber-600">검색엔진 노출이 꺼져 있으면 이 주소도 검색에 나오지 않습니다.</p>
      )}
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg px-4 py-2 text-xs font-bold text-gray-500 hover:bg-gray-100">닫기</button>
        <button onClick={handleSave} disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50">
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>
    </div>
  );
};

const JuboSiteLink = ({ user, onEdit }: { user: any; onEdit: () => void }) => (
  <div className="flex items-center gap-2">
    {user.bulletinSlug ? (
      <a href={`https://${user.bulletinSlug}${JUBO_HOST_SUFFIX}`} target="_blank" rel="noreferrer" className="text-xs font-bold text-blue-600 hover:underline whitespace-nowrap">
        {user.bulletinSlug}{JUBO_HOST_SUFFIX}
      </a>
    ) : (
      <span className="text-xs text-gray-400">미설정</span>
    )}
    <button onClick={onEdit} className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-bold text-gray-700 hover:bg-gray-50 whitespace-nowrap">{user.bulletinSlug ? "변경" : "설정"}</button>
  </div>
);

export const AdminAuthUsers = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingSiteId, setEditingSiteId] = useState<string | null>(null); // 주보 전용 주소 편집 중인 교회
  const handleSiteSaved = (userId: string, data: Record<string, string>) => {
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, ...data } : u)));
    setEditingSiteId(null);
  };
  const ADMIN_EMAILS = ["akhj123akhjk@gmail.com", "stayon.platform@gmail.com"];

  // 교회 관리자 화면(AdminEditor.tsx "검색엔진 노출" 토글)과 같은 필드(users/{uid}.bulletinSearchable)를
  // 운영자가 여기서 직접 켜고 끌 수 있게 함. 기본값은 꺼짐(opt-in) — 주보엔 심방·애경사 같은
  // 외부 공개를 원치 않는 내용이 들어갈 수 있어서, 운영자가 임의로 켤 땐 신중해야 함.
  const handleToggleSearchable = async (userId: string, checked: boolean) => {
    setSavingId(userId);
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, bulletinSearchable: checked } : u)));
    try {
      await setDoc(doc(db, "users", userId), { bulletinSearchable: checked }, { merge: true });
    } catch (error) {
      console.error("검색엔진 노출 설정 변경 오류:", error);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, bulletinSearchable: !checked } : u)));
      alert("설정 저장에 실패했습니다.");
    } finally {
      setSavingId(null);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user || !ADMIN_EMAILS.includes(user.email || "")) {
        alert("접근 권한이 없습니다.");
        window.location.href = "/login";
        return;
      }

      const fetchAuthUsers = async () => {
        try {
          // Firestore에 저장된 회원 데이터 불러오기 (가입일 기준 최신순 정렬)
          const q = query(collection(db, "users"), orderBy("createdAt", "desc"));
          const querySnapshot = await getDocs(q);
          const userData = querySnapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));
          setUsers(userData);
        } catch (error) {
          console.error("가입자 목록 조회 오류:", error);
        } finally {
          setLoading(false);
        }
      };

      fetchAuthUsers();
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="w-full">
        <div className="mb-5 flex justify-between items-end">
          <div>
            <h1 className="text-xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">전체 가입자 현황</h1>
            <p className="text-gray-500 mt-1.5 md:mt-2 text-xs sm:text-base font-medium">
              가입한 전체 사용자 계정 목록입니다. (총 <span className="text-blue-600 font-bold">{users.length}</span>명 ·
              검색엔진 노출 <span className="text-emerald-600 font-bold">{users.filter((u) => u.bulletinSearchable === true).length}</span>개 교회)
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-10 md:p-12 text-center text-gray-400 font-bold text-sm">가입자 목록을 불러오는 중입니다...</div>
          ) : users.length === 0 ? (
            <div className="p-10 md:p-12 text-center text-gray-400 font-bold text-sm">등록된 가입자가 없습니다.</div>
          ) : (
            <>
              {/* 모바일: 카드형 목록 */}
              <div className="md:hidden divide-y divide-gray-100">
                {users.map((user) => (
                  <div key={user.id} className="p-4 space-y-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Mail className="w-4 h-4 text-blue-500 shrink-0" />
                      <span className="font-bold text-gray-900 text-sm truncate">{user.email || user.id}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-gray-600 font-medium">{user.churchName || "교회명 미등록"}</span>
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-md text-[10px] font-bold uppercase">
                        {user.provider || "Email / Password"}
                      </span>
                    </div>
                    <div className="text-[11px] text-gray-400 font-mono flex flex-wrap gap-x-3 gap-y-0.5">
                      <span>가입일 {user.createdAt ? new Date(user.createdAt.toDate ? user.createdAt.toDate() : user.createdAt).toLocaleDateString() : "기록 없음"}</span>
                      <span className="truncate">UID {user.uid || user.id}</span>
                    </div>
                    <div className="flex items-center justify-between pt-1.5 mt-1.5 border-t border-gray-100">
                      <span className="text-[11px] font-bold text-gray-500 flex items-center gap-1.5">
                        <Search className="w-3 h-3 text-gray-400" /> 검색엔진 노출
                      </span>
                      <Switch
                        checked={user.bulletinSearchable === true}
                        onCheckedChange={(checked) => handleToggleSearchable(user.id, checked)}
                        disabled={savingId === user.id}
                        className="data-[state=unchecked]:!bg-gray-300 data-[state=checked]:!bg-emerald-500"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-gray-500 flex items-center gap-1.5 shrink-0">
                        <Globe className="w-3 h-3 text-gray-400" /> 주보 주소
                      </span>
                      <JuboSiteLink user={user} onEdit={() => setEditingSiteId(user.id)} />
                    </div>
                    {editingSiteId === user.id && (
                      <JuboSiteEditor user={user} onSaved={(data) => handleSiteSaved(user.id, data)} onClose={() => setEditingSiteId(null)} />
                    )}
                  </div>
                ))}
              </div>

              {/* 데스크톱: 화면 폭을 다 쓰는 한 줄짜리 표 */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr className="text-xs font-bold text-gray-500 whitespace-nowrap">
                      <th className="px-4 py-3">이메일 (계정 ID)</th>
                      <th className="px-4 py-3">교회명</th>
                      <th className="px-4 py-3">로그인 방식</th>
                      <th className="px-4 py-3">가입일</th>
                      <th className="px-4 py-3">UID</th>
                      <th className="px-4 py-3">검색엔진 노출</th>
                      <th className="px-4 py-3">주보 전용 주소</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {users.map((user) => (
                      <Fragment key={user.id}>
                      <tr className="hover:bg-blue-50/40 transition-colors whitespace-nowrap">
                        <td className="px-4 py-3 font-semibold text-gray-900">
                          <span className="flex items-center gap-2">
                            <Mail className="w-4 h-4 text-blue-500 shrink-0" />
                            {user.email || user.id}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-semibold text-gray-800">
                          {user.churchName || "-"}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {user.provider || "이메일"}
                        </td>
                        <td className="px-4 py-3 text-gray-600 tabular-nums">
                          {user.createdAt ? new Date(user.createdAt.toDate ? user.createdAt.toDate() : user.createdAt).toLocaleDateString() : "기록 없음"}
                        </td>
                        <td className="px-4 py-3 text-gray-400 font-mono text-xs max-w-[180px] truncate" title={user.uid || user.id}>
                          {user.uid || user.id}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={user.bulletinSearchable === true}
                              onCheckedChange={(checked) => handleToggleSearchable(user.id, checked)}
                              disabled={savingId === user.id}
                              className="data-[state=unchecked]:!bg-gray-300 data-[state=checked]:!bg-emerald-500"
                            />
                            <span className={`text-xs font-bold ${user.bulletinSearchable === true ? "text-emerald-600" : "text-gray-400"}`}>
                              {user.bulletinSearchable === true ? "노출중" : "꺼짐"}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <JuboSiteLink user={user} onEdit={() => setEditingSiteId(editingSiteId === user.id ? null : user.id)} />
                        </td>
                      </tr>
                      {editingSiteId === user.id && (
                        <tr className="bg-blue-50/30">
                          <td colSpan={7} className="px-4 pb-4 pt-1">
                            <JuboSiteEditor user={user} onSaved={(data) => handleSiteSaved(user.id, data)} onClose={() => setEditingSiteId(null)} />
                          </td>
                        </tr>
                      )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
