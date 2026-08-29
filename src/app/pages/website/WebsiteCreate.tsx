import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { checkSlugFormat, isSlugTaken } from "../../../utils/slugValidation";
import { createChurchSite, getChurchSiteByOwner } from "../../../utils/churchSite";

export function WebsiteCreate() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [churchName, setChurchName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(getAuth(), async (user) => {
      if (!user) { navigate("/login", { replace: true }); return; }

      const existing = await getChurchSiteByOwner(user.uid);
      if (existing) {
        navigate("/website-builder", { replace: true });
      } else {
        setChecking(false);
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  const handleSlugChange = (value: string) => {
    setSlug(value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
    setError("");
  };

  const handleSubmit = async () => {
    setError("");
    const user = getAuth().currentUser;
    if (!user) { setError("로그인이 필요합니다."); navigate("/login"); return; }
    if (!churchName.trim()) { setError("교회 이름을 입력해주세요."); return; }

    const formatCheck = checkSlugFormat(slug);
    if (!formatCheck.valid) { setError(formatCheck.reason!); return; }

    setLoading(true);
    try {
      if (await isSlugTaken(slug)) {
        setError("이미 사용 중인 주소입니다. 다른 이름을 입력해주세요.");
        setLoading(false);
        return;
      }
      await createChurchSite(slug, churchName.trim(), user.uid);
      navigate("/website-builder");
    } catch {
      setError("생성 중 오류가 발생했습니다. 다시 시도해주세요.");
      setLoading(false);
    }
  };

  if (checking) {
    return <div className="max-w-lg mx-auto px-4 py-16 text-center text-gray-400">확인 중...</div>;
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-16">
      <h1 className="text-2xl font-black text-gray-900 mb-2">교회 홈페이지 만들기</h1>
      <p className="text-gray-500 mb-8">교회 이름과 주소를 입력하면 바로 시작할 수 있어요.</p>

      <label className="block text-sm font-bold text-gray-700 mb-1">교회 이름</label>
      <input className="w-full border rounded-lg px-4 py-3 mb-4" placeholder="예: 만나교회"
        value={churchName} onChange={(e) => setChurchName(e.target.value)} />

      <label className="block text-sm font-bold text-gray-700 mb-1">홈페이지 주소</label>
      <div className="flex items-center border rounded-lg px-4 py-3 mb-1">
        <input className="flex-1 outline-none" placeholder="manna"
          value={slug} onChange={(e) => handleSlugChange(e.target.value)} />
        <span className="text-gray-400 text-sm whitespace-nowrap">.stayon-platform.com</span>
      </div>
      <p className="text-xs text-gray-400 mb-4">영문 소문자, 숫자, 하이픈만 사용 가능 (3~30자)</p>

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      <button onClick={handleSubmit} disabled={loading}
        className="w-full bg-blue-600 text-white font-bold rounded-full py-3 disabled:opacity-50">
        {loading ? "생성 중..." : "홈페이지 만들기 시작"}
      </button>
    </div>
  );
}
