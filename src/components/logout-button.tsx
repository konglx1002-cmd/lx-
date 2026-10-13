"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";

export function LogoutButton() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function handleLogout() {
    setIsPending(true);
    await authClient.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <button
      className="text-sm font-medium text-slate-600 transition hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={isPending}
      onClick={handleLogout}
      type="button"
    >
      {isPending ? "退出中…" : "退出"}
    </button>
  );
}
