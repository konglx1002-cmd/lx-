import { AppNavigation } from "@/components/app-navigation";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-16">
      <div className="flex-1">
        <p className="text-sm font-medium text-slate-500">个人成长记录工具</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">科研成长日志</h1>
        <p className="mt-4 max-w-xl text-slate-600">
          记录每日科研、学习与工程实践，沉淀长期成长轨迹。
        </p>
        <AppNavigation />
      </div>
    </main>
  );
}
