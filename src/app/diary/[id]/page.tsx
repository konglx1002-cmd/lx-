import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getDiaryById } from "@/features/diary/diary-service";
import { formatDiaryDate } from "@/features/diary/format";
import { getCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

function DiarySection({ title, content }: { title: string; content: string }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
      <p className="mt-2 whitespace-pre-wrap leading-7 text-slate-700">{content.trim() || "未填写"}</p>
    </section>
  );
}

export default async function DiaryDetailPage({ params }: PageProps<"/diary/[id]">) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const { id } = await params;
  const diary = await getDiaryById(user.id, id);

  if (!diary) {
    notFound();
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12 sm:py-16">
      <Link className="text-sm font-medium text-slate-600 hover:text-slate-950" href="/history">
        ← 返回历史列表
      </Link>

      <article className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
        <time className="text-sm font-medium text-slate-500" dateTime={diary.date}>
          {formatDiaryDate(diary.date)}
        </time>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">科研日志</h1>

        <div className="mt-10 space-y-9">
          <DiarySection content={diary.completedTasks} title="完成事项" />
          <DiarySection content={diary.problems} title="遇到问题" />
          <DiarySection content={diary.nextPlan} title="下一步计划" />
        </div>
      </article>
    </main>
  );
}
