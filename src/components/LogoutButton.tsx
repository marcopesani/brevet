"use client";

import { useRouter } from "next/navigation";
import { useDisconnect } from "wagmi";

export default function LogoutButton() {
  const router = useRouter();
  const { disconnect } = useDisconnect();

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    disconnect();
    router.push("/login");
  };

  return (
    <button
      onClick={handleLogout}
      className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
    >
      Disconnect
    </button>
  );
}
