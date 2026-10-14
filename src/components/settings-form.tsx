"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type Settings = {
  name: string;
  email: string;
  timeZone: string;
};

type FormStatus = "idle" | "saving" | "success" | "error";

export function SettingsForm({ initialSettings }: { initialSettings: Settings }) {
  const router = useRouter();
  const [settings, setSettings] = useState(initialSettings);
  const [status, setStatus] = useState<FormStatus>("idle");
  const [message, setMessage] = useState("");

  function updateField(field: "name" | "timeZone", value: string) {
    setSettings((current) => ({ ...current, [field]: value }));
    setStatus("idle");
    setMessage("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setMessage("正在保存…");

    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: settings.name,
          timeZone: settings.timeZone,
        }),
      });
      const result: { message?: string; settings?: Settings } = await response
        .json()
        .catch(() => ({}));

      if (!response.ok) {
        setStatus("error");
        setMessage(result.message ?? "保存设置失败，请稍后重试");
        return;
      }

      if (!result.settings) {
        setStatus("error");
        setMessage("保存设置失败，请稍后重试");
        return;
      }

      setSettings(result.settings);
      setStatus("success");
      setMessage("保存成功");
      router.refresh();
    } catch {
      setStatus("error");
      setMessage("保存设置失败，请稍后重试");
    }
  }

  return (
    <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">用户名</span>
        <input
          autoComplete="name"
          className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none transition focus:border-slate-600 focus:ring-2 focus:ring-slate-200"
          name="name"
          onChange={(event) => updateField("name", event.target.value)}
          required
          value={settings.name}
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">邮箱</span>
        <input
          className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 text-slate-600"
          readOnly
          type="email"
          value={settings.email}
        />
        <span className="mt-2 block text-xs text-slate-500">当前暂不支持修改邮箱</span>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">当前时区</span>
        <input
          className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none transition focus:border-slate-600 focus:ring-2 focus:ring-slate-200"
          name="timeZone"
          onChange={(event) => updateField("timeZone", event.target.value)}
          placeholder="例如 Asia/Shanghai"
          required
          spellCheck={false}
          value={settings.timeZone}
        />
        <span className="mt-2 block text-xs text-slate-500">请输入有效的 IANA 时区名称</span>
      </label>

      <div className="flex flex-wrap items-center gap-4">
        <button
          className="rounded-xl bg-slate-900 px-6 py-3 font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={status === "saving"}
          type="submit"
        >
          {status === "saving" ? "保存中…" : "保存设置"}
        </button>
        <p
          aria-live="polite"
          className={status === "error" ? "text-sm text-red-600" : "text-sm text-emerald-700"}
        >
          {message}
        </p>
      </div>
    </form>
  );
}
