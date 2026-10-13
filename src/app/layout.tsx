import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthNavigation } from "@/components/auth-navigation";

import "./globals.css";

export const metadata: Metadata = {
  title: "科研成长日志",
  description: "记录每日科研、学习与工程实践。",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <Suspense fallback={<div className="h-[73px] border-b border-slate-200 bg-white" />}>
          <AuthNavigation />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
