import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, orderBy, doc, updateDoc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "../../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { Search, Palette, Check, Lock, CalendarClock } from "lucide-react";
import { BULLETIN_TEMPLATES, DEFAULT_BULLETIN_TEMPLATE_ID } from "../../../utils/bulletinTemplates";
import {
  DEFAULT_CUSTOM_DESIGN_PAYWALL_START,
  isCustomDesignFreePeriod,
  type CustomDesignConfig,
} from "../../../utils/customDesignAccess";

// /super > 커스텀 디자인 관리.
// 커스텀 디자인(주보 템플릿)은 프로 요금제 전용 기능이지만, 여기서 운영자가 특정 교회에
// 특정 템플릿을 "무료로" 열어줄 수 있다. 저장 위치는 users/{uid}.allowedTemplates (템플릿 ID 배열).
// AdminEditor 는 이 배열에 있는 템플릿만 적용을 허용한다("기본"은 항상 허용).

const ADMIN_EMAILS = ["akhj123akhjk@gmail.com", "stayon.platform@gmail.com"];

// "기본"을 뺀, 실제로 권한을 열고 닫을 수 있는 템플릿 목록
const CUSTOM_TEMPLATES = BULLETIN_TEMPLATES.filter((t) => t.id !== DEFAULT_BULLETIN_TEMPLATE_ID);

export const AdminCustomDesign = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // 유료화 시작일 설정 (settings/customDesign)
  const [paywallDate, setPaywallDate] = useState(DEFAULT_CUSTOM_DESIGN_PAYWALL_START);
  const [paywallDateSaved, setPaywallDateSaved] = useState(DEFAULT_CUSTOM_DESIGN_PAYWALL_START);
  const [savingDate, setSavingDate] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user || !ADMIN_EMAILS.includes(user.email || "")) {
        alert("접근 권한이 없습니다.");
        window.location.href = "/login";
        return;
      }

      const fetchUsers = async () => {
        try {
          const q = query(collection(db, "users"), orderBy("createdAt", "desc"));
          const snap = await getDocs(q);
          setUsers(
            snap.docs.map((d) => ({
              id: d.id,
              ...d.data(),
              allowedTemplates: Array.isArray(d.data().allowedTemplates)
                ? d.data().allowedTemplates.map(String)
                : [],
            }))
          );
        } catch (error) {
          console.error("교회 목록 조회 오류:", error);
        } finally {
          setLoading(false);
        }
      };

      fetchUsers();
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    getDoc(doc(db, "settings", "customDesign"))
      .then((snap) => {
        const d = (snap.exists() ? snap.data() : {}) as CustomDesignConfig;
        const v = d.paywallStartDate || DEFAULT_CUSTOM_DESIGN_PAYWALL_START;
        setPaywallDate(v);
        setPaywallDateSaved(v);
      })
      .catch(() => {});
  }, []);

  const savePaywallDate = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paywallDate)) {
      alert("날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)");
      return;
    }
    setSavingDate(true);
    try {
      await setDoc(doc(db, "settings", "customDesign"), { paywallStartDate: paywallDate }, { merge: true });
      setPaywallDateSaved(paywallDate);
    } catch (error) {
      console.error("유료화 시작일 저장 실패:", error);
      alert("저장에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setSavingDate(false);
    }
  };

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return users;
    return users.filter(
      (u) =>
        (u.churchName || "").toLowerCase().includes(kw) ||
        (u.email || "").toLowerCase().includes(kw)
    );
  }, [users, keyword]);

  const grantedCount = useMemo(
    () => users.filter((u) => (u.allowedTemplates || []).length > 0).length,
    [users]
  );

  const toggleTemplate = async (userId: string, templateId: string, currentlyOn: boolean) => {
    const key = `${userId}:${templateId}`;
    setSavingKey(key);
    const target = users.find((u) => u.id === userId);
    const current: string[] = target?.allowedTemplates || [];
    const next = currentlyOn
      ? current.filter((t) => t !== templateId)
      : [...current, templateId];
    try {
      await updateDoc(doc(db, "users", userId), { allowedTemplates: next });
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, allowedTemplates: next } : u))
      );
    } catch (error) {
      console.error("권한 저장 실패:", error);
      alert("저장에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="p-4 sm:p-8 md:p-12">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6 md:mb-10">
          <h1 className="text-xl sm:text-3xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2.5">
            <Palette className="w-6 h-6 text-purple-500 shrink-0" /> 커스텀 디자인 관리
          </h1>
          <p className="text-gray-500 mt-1.5 md:mt-2 text-xs sm:text-base font-medium leading-relaxed">
            커스텀 디자인은 프로 요금제 전용이에요. 아래에서 특정 교회에 특정 템플릿을 열어주면,
            그 교회는 <span className="font-bold text-gray-700">베이직 요금제여도</span> 해당 템플릿을 무료로 쓸 수 있어요.
            {" "}현재 <span className="text-purple-600 font-bold">{grantedCount}</span>개 교회에 열려 있어요. (전체 {users.length}개)
          </p>
        </div>

        {/* 유료화 시작일 설정 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-4 sm:p-5 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <CalendarClock className="w-4 h-4 text-purple-500 shrink-0" />
            <h2 className="font-bold text-gray-900 text-sm">유료화 시작일</h2>
            <span
              className={`ml-auto text-[11px] font-bold px-2 py-0.5 rounded-full ${
                isCustomDesignFreePeriod({ paywallStartDate: paywallDateSaved })
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-gray-200 text-gray-600"
              }`}
            >
              {isCustomDesignFreePeriod({ paywallStartDate: paywallDateSaved }) ? "현재 오픈 기간 (전체 무료)" : "요금제 잠금 적용 중"}
            </span>
          </div>
          <p className="text-[11px] sm:text-xs text-gray-400 font-medium leading-relaxed mb-3">
            이 날짜(KST 자정) 전까지는 요금제와 무관하게 모든 교회가 커스텀 디자인을 무료로 써요.
            이후에는 프로 이상(프로·올인원) 요금제이거나, 아래에서 열어준 교회만 쓸 수 있고, 그 외에는 성도 화면이 "기본" 디자인으로 표시돼요.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={paywallDate}
              onChange={(e) => setPaywallDate(e.target.value)}
              className="px-3 py-2 rounded-xl border border-gray-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400"
            />
            <button
              type="button"
              onClick={savePaywallDate}
              disabled={savingDate || paywallDate === paywallDateSaved}
              className="px-4 py-2 rounded-xl bg-purple-600 text-white text-sm font-bold disabled:opacity-40 hover:bg-purple-700 transition-colors"
            >
              {savingDate ? "저장 중…" : paywallDate === paywallDateSaved ? "저장됨" : "저장"}
            </button>
          </div>
        </div>

        {/* 검색 */}
        <div className="relative mb-4">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="교회명 또는 이메일로 검색"
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400"
          />
        </div>

        <div className="bg-white rounded-2xl md:rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="p-10 md:p-12 text-center text-gray-400 font-bold text-sm">교회 목록을 불러오는 중입니다...</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 md:p-12 text-center text-gray-400 font-bold text-sm">
              {keyword ? "검색 결과가 없습니다." : "등록된 교회가 없습니다."}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filtered.map((user) => {
                const allowed: string[] = user.allowedTemplates || [];
                return (
                  <div key={user.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
                    <div className="min-w-0 sm:w-56 shrink-0">
                      <div className="font-bold text-gray-900 text-sm truncate">
                        {user.churchName || "교회명 미등록"}
                        {allowed.length > 0 && (
                          <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-purple-100 text-purple-700 text-[10px] font-bold px-2 py-0.5 align-middle">
                            <Check className="w-3 h-3" /> {allowed.length}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-gray-400 font-mono truncate mt-0.5">{user.email || user.id}</div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {CUSTOM_TEMPLATES.map((tpl) => {
                        const on = allowed.includes(tpl.id);
                        const key = `${user.id}:${tpl.id}`;
                        const busy = savingKey === key;
                        return (
                          <button
                            key={tpl.id}
                            type="button"
                            disabled={busy}
                            onClick={() => toggleTemplate(user.id, tpl.id, on)}
                            className={`inline-flex items-center gap-1.5 rounded-xl border-2 px-3 py-2 text-xs font-bold transition-all disabled:opacity-50 ${
                              on
                                ? "border-purple-500 bg-purple-50 text-purple-700"
                                : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                            }`}
                          >
                            <span
                              className="w-4 h-4 rounded-md border border-black/10 shrink-0 flex items-center justify-center"
                              style={{ backgroundColor: tpl.swatch }}
                            >
                              {on ? (
                                <Check className="w-3 h-3 stroke-[3px]" style={{ color: tpl.accent }} />
                              ) : (
                                <Lock className="w-2.5 h-2.5 text-black/30" />
                              )}
                            </span>
                            {tpl.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <p className="text-[11px] text-gray-400 mt-4 font-medium leading-relaxed">
          · "기본" 템플릿은 모든 교회가 항상 무료로 쓸 수 있어 여기 목록에 없어요.<br />
          · 정식 프로/올인원 요금제가 출시되면, 결제한 교회는 여기 지정과 상관없이 전체 템플릿이 자동으로 열립니다.
        </p>
      </div>
    </div>
  );
};
