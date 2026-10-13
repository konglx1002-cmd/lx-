import Link from "next/link";
import { redirect } from "next/navigation";

import { getAllDiaries } from "@/features/diary/diary-service";
import { formatDiaryDate } from "@/features/diary/format";
import { getCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <p className="line-clamp-2 text-sm leading-6 text-slate-600">
      <span className="font-medium text-slate-800">{label}：</span>
      {value.trim() || "未填写"}
    </p>
  );
}

export default async function HistoryPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const diaries = await getAllDiaries(user.id);

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12 sm:py-16">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">成长轨迹</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">历史日志</h1>
        </div>
        <Link className="text-sm font-medium text-slate-600 hover:text-slate-950" href="/diary">
          返回今日记录
        </Link>
      </header>

      {diaries.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
          暂无历史日志，先完成今天的记录吧。
        </div>
      ) : (
        <div className="mt-10 space-y-4">
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
                <Summary label="下一步计划" value={diary.nextPlan} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
