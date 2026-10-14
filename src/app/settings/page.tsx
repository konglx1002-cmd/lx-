import { redirect } from "next/navigation";

import { SettingsForm } from "@/components/settings-form";
import { getCurrentUser } from "@/lib/current-user";

export default async function SettingsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="mx-auto min-h-[calc(100vh-73px)] max-w-xl px-6 py-12 sm:py-16">
      <p className="text-sm font-medium text-slate-500">个人资料</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">用户设置</h1>
      <p className="mt-3 text-slate-600">修改用户名和用于判断“今天”的时区。</p>
      <SettingsForm
        initialSettings={{
          name: user.name,
          email: user.email,
          timeZone: user.timeZone,
        }}
      />
    </main>
  );
}
