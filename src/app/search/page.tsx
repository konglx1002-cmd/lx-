import Link from "next/link";

import { searchDiaries } from "@/features/diary/diary-service";
import { formatDiaryDate } from "@/features/diary/format";

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <p className="line-clamp-2 text-sm leading-6 text-slate-600">
      <span className="font-medium text-slate-800">{label}：</span>
      {value.trim() || "未填写"}
    </p>
  );
}

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const rawQuery = (await searchParams).q;
  const query = (Array.isArray(rawQuery) ? rawQuery[0] : rawQuery ?? "").trim();
  const diaries = query ? await searchDiaries(query) : [];

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12 sm:py-16">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">查找科研记录</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">搜索日志</h1>
        </div>
        <Link className="text-sm font-medium text-slate-600 hover:text-slate-950" href="/history">
          返回历史列表
        </Link>
      </header>

      <form action="/search" className="mt-8 flex gap-3" method="get">
        <label className="sr-only" htmlFor="diary-query">
          搜索日志关键词
        </label>
        <input
          className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none transition focus:border-slate-600 focus:ring-2 focus:ring-slate-200"
          defaultValue={query}
          id="diary-query"
          name="q"
          placeholder="输入关键词，例如 YOLO"
          type="search"
        />
        <button
          className="rounded-xl bg-slate-900 px-5 py-3 font-medium text-white transition hover:bg-slate-700"
          type="submit"
        >
          搜索
        </button>
      </form>

      {!query ? (
        <p className="mt-8 text-slate-600">输入关键词，搜索完成事项、遇到问题和下一步计划。</p>
      ) : diaries.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
          未找到包含“{query}”的日志。
        </div>
      ) : (
        <section className="mt-8" aria-label="搜索结果">
          <p className="text-sm text-slate-500">找到 {diaries.length} 篇日志</p>
          <div className="mt-4 space-y-4">
            {diaries.map((diary) => (
              <Link
                className="block rounded-xl border border-slate-200 bg-white p-5 transition hover:border-slate-400 hover:shadow-sm"
                href={`/diary/${diary.id}`}
                key={diary.id}
              >
                <time className="text-sm font-semibold text-slate-900" dateTime={diary.date}>
                  {formatDiaryDate(diary.date)}
                </time>
                <div className="mt-4 space-y-2">
                  <Summary label="完成事项" value={diary.completedTasks} />
                  <Summary label="遇到问题" value={diary.problems} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
