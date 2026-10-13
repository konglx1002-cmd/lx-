import { redirect } from "next/navigation";

import { LoginForm } from "@/components/login-form";
import { getCurrentUser } from "@/lib/current-user";

export default async function LoginPage() {
  if (await getCurrentUser()) {
    redirect("/");
  }

  return (
    <main className="mx-auto min-h-[calc(100vh-73px)] max-w-md px-6 py-16">
      <p className="text-sm font-medium text-slate-500">欢迎回来</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">登录</h1>
      <LoginForm />
    </main>
  );
}
