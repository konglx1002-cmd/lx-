"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { authClient } from "@/lib/auth-client";

export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsPending(true);

    const formData = new FormData(event.currentTarget);
    const result = await authClient.signUp.email({
      name: String(formData.get("name")).trim(),
      email: String(formData.get("email")),
      password: String(formData.get("password")),
    });

    if (result.error) {
      setError(result.error.message ?? "注册失败，请稍后重试");
      setIsPending(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">用户名</span>
        <input
          autoComplete="name"
          className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-slate-600 focus:ring-2 focus:ring-slate-200"
          maxLength={80}
          minLength={1}
          name="name"
          required
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">邮箱</span>
        <input
          autoComplete="email"
          className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-slate-600 focus:ring-2 focus:ring-slate-200"
          name="email"
          required
          type="email"
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">密码</span>
        <input
          autoComplete="new-password"
          className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-slate-600 focus:ring-2 focus:ring-slate-200"
          maxLength={128}
          minLength={8}
          name="password"
          required
          type="password"
        />
        <span className="mt-2 block text-xs text-slate-500">至少 8 个字符</span>
      </label>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button
        className="w-full rounded-xl bg-slate-900 px-5 py-3 font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "注册中…" : "注册"}
      </button>
      <p className="text-center text-sm text-slate-600">
        已有账号？
        <Link className="ml-1 font-medium text-slate-900 hover:underline" href="/login">
          登录
        </Link>
      </p>
    </form>
  );
}
