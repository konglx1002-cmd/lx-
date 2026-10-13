"use client";

import { FormEvent, useEffect, useState } from "react";

import { formatDiaryDate } from "@/features/diary/format";
import type { DiaryData, DiaryInput } from "@/features/diary/types";

const emptyDiary: DiaryInput = {
  completedTasks: "",
  problems: "",
  nextPlan: "",
};

type PageStatus = "loading" | "idle" | "saving" | "success" | "error";

export default function DiaryPage() {
  const [date, setDate] = useState("");
  const [diary, setDiary] = useState<DiaryInput>(emptyDiary);
  const [status, setStatus] = useState<PageStatus>("loading");
  const [message, setMessage] = useState("正在加载今日日志…");

  useEffect(() => {
    let cancelled = false;

    async function loadDiary() {
      try {
        const response = await fetch("/api/diary/today", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("读取失败");
        }

        const result: { date: string; diary: DiaryData | null } = await response.json();
        if (cancelled) {
          return;
        }

        setDate(result.date);
        if (result.diary) {
          setDiary({
            completedTasks: result.diary.completedTasks,
            problems: result.diary.problems,
            nextPlan: result.diary.nextPlan,
          });
        }
        setStatus("idle");
        setMessage("");
      } catch {
        if (!cancelled) {
          setStatus("error");
          setMessage("今日日志加载失败，请刷新页面重试。");
        }
      }
    }

    loadDiary();
    return () => {
      cancelled = true;
    };
  }, []);

  function updateField(field: keyof DiaryInput, value: string) {
    setDiary((current) => ({ ...current, [field]: value }));
    if (status === "success" || status === "error") {
      setStatus("idle");
      setMessage("");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setMessage("正在保存…");

    try {
      const response = await fetch("/api/diary/today", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(diary),
      });

      if (!response.ok) {
        throw new Error("保存失败");
      }

      setStatus("success");
      setMessage("日志保存成功");
    } catch {
      setStatus("error");
      setMessage("日志保存失败，请稍后重试。");
    }
  }

  const isBusy = status === "loading" || status === "saving";

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12 sm:py-16">
      <header>
        <p className="text-sm font-medium text-slate-500">
          {date ? formatDiaryDate(date) : "今日记录"}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">今日科研日志</h1>
      </header>

      <form className="mt-10 space-y-7" onSubmit={handleSubmit}>
        <label className="block">
          <span className="text-sm font-semibold text-slate-800">完成事项</span>
          <textarea
            className="mt-2 min-h-36 w-full rounded-xl border border-slate-300 bg-white p-4 outline-none transition focus:border-slate-600 focus:ring-2 focus:ring-slate-200"
            disabled={status === "loading"}
            onChange={(event) => updateField("completedTasks", event.target.value)}
            placeholder="记录今天完成的科研、学习或工程任务"
            value={diary.completedTasks}
          />
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-slate-800">遇到问题</span>
          <textarea
            className="mt-2 min-h-36 w-full rounded-xl border border-slate-300 bg-white p-4 outline-none transition focus:border-slate-600 focus:ring-2 focus:ring-slate-200"
            disabled={status === "loading"}
            onChange={(event) => updateField("problems", event.target.value)}
            placeholder="记录遇到的问题、阻塞或待确认事项"
            value={diary.problems}
          />
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-slate-800">下一步计划</span>
          <textarea
            className="mt-2 min-h-36 w-full rounded-xl border border-slate-300 bg-white p-4 outline-none transition focus:border-slate-600 focus:ring-2 focus:ring-slate-200"
            disabled={status === "loading"}
            onChange={(event) => updateField("nextPlan", event.target.value)}
            placeholder="记录下一步准备推进的工作"
            value={diary.nextPlan}
          />
        </label>

        <div className="flex flex-wrap items-center gap-4">
          <button
            className="rounded-lg bg-slate-900 px-6 py-3 font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            disabled={isBusy}
            type="submit"
          >
            {status === "saving" ? "保存中…" : "保存日志"}
          </button>
          <p
            aria-live="polite"
            className={status === "error" ? "text-sm text-red-600" : "text-sm text-emerald-700"}
          >
            {message}
          </p>
        </div>
      </form>
    </main>
  );
}
