import { lazy, Suspense, type ComponentType } from "react";

// 화면을 처음 열 때 필요한 파일만 받도록, 자주 안 쓰는 화면(관리자·편집·청빙 등)은 따로 떼어 냄.
// 성도 주보 화면·결제 화면·메인·교회 홈페이지는 여기 쓰지 않고 기존처럼 바로 불러옴(routes.tsx).
//
// 배포 직후, 이미 열려 있던 옛 화면에서 새로 떼어 낸 파일(이름이 바뀜)을 못 찾으면
// 한 번만 새로고침해서 새 화면을 받음(무한 새로고침 방지)
const RELOAD_KEY = "stayon:chunk-reload";

function withReload<T>(loader: () => Promise<T>): () => Promise<T> {
  return () =>
    loader()
      .then((m) => {
        try { sessionStorage.removeItem(RELOAD_KEY); } catch { /* 무시 */ }
        return m;
      })
      .catch((err) => {
        let reloaded = false;
        try { reloaded = sessionStorage.getItem(RELOAD_KEY) === "1"; } catch { /* 무시 */ }
        if (!reloaded) {
          try { sessionStorage.setItem(RELOAD_KEY, "1"); } catch { /* 무시 */ }
          window.location.reload();
          return new Promise<T>(() => {}); // 새로고침되는 동안 대기
        }
        throw err;
      });
}

function PageLoading() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="h-8 w-8 rounded-full border-[3px] border-gray-200 border-t-blue-600 animate-spin" aria-label="불러오는 중" />
    </div>
  );
}

// 이름 있는 export(예: export const AdminEditor)를 떼어 내서 불러오는 화면으로 만듦
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyPage<M extends Record<string, any>, K extends keyof M>(loader: () => Promise<M>, name: K) {
  const Lazy = lazy(withReload(() => loader().then((m) => ({ default: m[name] as ComponentType<Record<string, unknown>> }))));
  return function LazyPage(props: Record<string, unknown>) {
    return (
      <Suspense fallback={<PageLoading />}>
        <Lazy {...props} />
      </Suspense>
    );
  };
}
