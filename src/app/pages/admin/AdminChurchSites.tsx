import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { auth, db } from "../../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { ExternalLink, Trash2, Globe } from "lucide-react";
import { deleteChurchSite, ChurchSite } from "../../../utils/churchSite";

// 교회 사이트 제작 플랫폼(주보 플랫폼과는 완전히 별개 기능) 전용 운영자 페이지.
// 실제 배포(published)된 교회 사이트를 계정별로 조회 + 바로가기 + 삭제하는 화면.
// 주보 관련 컬렉션/화면은 전혀 건드리지 않음 — churchSites 컬렉션만 다룸.

interface SiteRow extends ChurchSite {
  ownerEmail: string;
}

export const AdminChurchSites = () => {
  const [rows, setRows] = useState<SiteRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null);
  const ADMIN_EMAILS = ["akhj123akhjk@gmail.com", "stayon.platform@gmail.com"];

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user || !ADMIN_EMAILS.includes(user.email || "")) {
        alert("접근 권한이 없습니다.");
        window.location.href = "/login";
        return;
      }

      const fetchSites = async () => {
        try {
          const [usersSnap, sitesSnap] = await Promise.all([
            getDocs(collection(db, "users")),
            getDocs(query(collection(db, "churchSites"), where("published", "==", true))),
          ]);

          const emailByUid = new Map<string, string>();
          usersSnap.forEach((d) => {
            const data = d.data() as { email?: string };
            emailByUid.set(d.id, data.email || d.id);
          });

          const siteRows: SiteRow[] = sitesSnap.docs.map((d) => {
            const site = d.data() as ChurchSite;
            return { ...site, ownerEmail: emailByUid.get(site.ownerId) || site.ownerId };
          });
          setRows(siteRows);
        } catch (error) {
          console.error("교회 사이트 목록 조회 오류:", error);
        } finally {
          setLoading(false);
        }
      };

      fetchSites();
    });

    return () => unsubscribe();
  }, []);

  const handleDelete = async (slug: string, churchName: string) => {
    if (!window.confirm(`"${churchName}"(${slug}) 사이트를 정말 삭제하시겠습니까? 되돌릴 수 없습니다.`)) return;
    setDeletingSlug(slug);
    try {
      await deleteChurchSite(slug);
      setRows((prev) => prev.filter((r) => r.slug !== slug));
    } catch (error) {
      console.error("사이트 삭제 오류:", error);
      alert("삭제 중 오류가 발생했습니다.");
    } finally {
      setDeletingSlug(null);
    }
  };

  return (
    <div className="p-4 sm:p-8 md:p-12">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 md:mb-10 flex justify-between items-end">
          <div>
            <h1 className="text-lg sm:text-3xl font-extrabold text-gray-900 tracking-tight leading-tight">교회 사이트 제작 플랫폼 — 사이트 발행 관리</h1>
            <p className="text-gray-500 mt-1.5 md:mt-2 text-xs sm:text-base font-medium">
              현재 발행된 교회 사이트 목록입니다. (총 <span className="text-blue-600 font-bold">{rows.length}</span>개)
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl md:rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="p-10 md:p-12 text-center text-gray-400 font-bold text-sm">목록을 불러오는 중입니다...</div>
          ) : rows.length === 0 ? (
            <div className="p-10 md:p-12 text-center text-gray-400 font-bold text-sm">발행된 사이트가 없습니다.</div>
          ) : (
            <>
              {/* 모바일: 카드형 목록 */}
              <div className="md:hidden divide-y divide-gray-100">
                {rows.map((site) => (
                  <div key={site.slug} className="p-4 space-y-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <Globe className="w-4 h-4 text-blue-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-bold text-gray-900 text-sm truncate">{site.churchName}</p>
                        <p className="text-[11px] text-gray-400 truncate">{site.slug}.stayon-platform.com</p>
                      </div>
                    </div>
                    <div className="text-[11px] text-gray-400 font-mono flex flex-wrap gap-x-3">
                      <span className="truncate">{site.ownerEmail}</span>
                      <span>
                        {site.firstDeployedAt
                          ? new Date(
                              (site.firstDeployedAt as unknown as { toDate?: () => Date }).toDate
                                ? (site.firstDeployedAt as unknown as { toDate: () => Date }).toDate()
                                : (site.firstDeployedAt as unknown as Date)
                            ).toLocaleDateString()
                          : "기록 없음"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={`https://${site.slug}.stayon-platform.com`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-200 transition-colors"
                      >
                        바로가기 <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      <button
                        onClick={() => handleDelete(site.slug, site.churchName)}
                        disabled={deletingSlug === site.slug}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-red-50 text-red-600 rounded-lg text-xs font-bold hover:bg-red-100 transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> {deletingSlug === site.slug ? "삭제 중..." : "삭제"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* 데스크톱: 기존 표 */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-gray-50/50">
                    <tr>
                      <th className="p-6 text-xs font-bold text-gray-400 uppercase tracking-widest">계정 이메일</th>
                      <th className="p-6 text-xs font-bold text-gray-400 uppercase tracking-widest">교회명 / 사이트 주소</th>
                      <th className="p-6 text-xs font-bold text-gray-400 uppercase tracking-widest">발행일</th>
                      <th className="p-6 text-xs font-bold text-gray-400 uppercase tracking-widest">바로가기</th>
                      <th className="p-6 text-xs font-bold text-gray-400 uppercase tracking-widest">삭제</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map((site) => (
                      <tr key={site.slug} className="hover:bg-blue-50/30 transition-colors">
                        <td className="p-6 font-bold text-gray-900">{site.ownerEmail}</td>
                        <td className="p-6 text-gray-700 font-medium">
                          <div className="flex items-center gap-2">
                            <Globe className="w-4 h-4 text-blue-500 shrink-0" />
                            <div>
                              <p>{site.churchName}</p>
                              <p className="text-xs text-gray-400">{site.slug}.stayon-platform.com</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-6 text-gray-500 font-mono text-sm">
                          {site.firstDeployedAt
                            ? new Date(
                                (site.firstDeployedAt as unknown as { toDate?: () => Date }).toDate
                                  ? (site.firstDeployedAt as unknown as { toDate: () => Date }).toDate()
                                  : (site.firstDeployedAt as unknown as Date)
                              ).toLocaleDateString()
                            : "기록 없음"}
                        </td>
                        <td className="p-6">
                          <a
                            href={`https://${site.slug}.stayon-platform.com`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-200 transition-colors"
                          >
                            바로가기 <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </td>
                        <td className="p-6">
                          <button
                            onClick={() => handleDelete(site.slug, site.churchName)}
                            disabled={deletingSlug === site.slug}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-bold hover:bg-red-100 transition-colors disabled:opacity-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> {deletingSlug === site.slug ? "삭제 중..." : "삭제"}
                          </button>
                        </td>
                      </tr>
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
