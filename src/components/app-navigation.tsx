import Link from "next/link";

export function AppNavigation() {
  return (
    <nav aria-label="主要入口" className="mt-10 flex flex-wrap gap-4">
      <Link
        className="rounded-lg bg-slate-900 px-5 py-3 font-medium text-white transition hover:bg-slate-700"
        href="/login"
      >
        登录
      </Link>
      <Link
        className="rounded-lg border border-slate-300 bg-white px-5 py-3 font-medium text-slate-800 transition hover:border-slate-500"
        href="/register"
      >
        注册
      </Link>
    </nav>
  );
}
