import { redirect } from "next/navigation";

import { RegisterForm } from "@/components/register-form";
import { getCurrentUser } from "@/lib/current-user";

export default async function RegisterPage() {
  if (await getCurrentUser()) {
    redirect("/");
  }

  return (
    <main className="mx-auto min-h-[calc(100vh-73px)] max-w-md px-6 py-16">
      <p className="text-sm font-medium text-slate-500">创建个人账号</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">注册</h1>
      <RegisterForm />
    </main>
  );
}
