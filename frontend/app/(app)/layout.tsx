"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { type Account, type User, fetchMe, logout } from "@/lib/auth";

// Layout for authenticated pages. Redirects to /login if no valid session.

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<{ user: User; account: Account } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const me = await fetchMe();
      if (cancelled) return;
      if (!me) {
        router.replace("/login");
        return;
      }
      setState({ user: me.user, account: me.account });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  if (loading || !state) {
    return (
      <main className="min-h-dvh flex items-center justify-center text-sm text-muted-600">
        Loading…
      </main>
    );
  }

  return (
    <div className="min-h-dvh">
      <header className="border-b border-muted-200 bg-paper">
        <div className="mx-auto max-w-[1400px] px-6 h-14 flex items-center gap-6">
          <Link href="/jobs" className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center h-7 w-7 rounded-md bg-ink text-paper text-xs font-display font-semibold">
              HD
            </span>
            <span className="font-medium text-sm tracking-tight">
              <span className="text-accent">Headshot</span>
              <span className="text-ink">Desk</span>
            </span>
          </Link>
          <nav className="flex items-center gap-5 text-sm text-muted-600">
            <Link href="/jobs" className="hover:text-ink">
              Jobs
            </Link>
            <Link href="/galleries" className="hover:text-ink">
              Galleries
            </Link>
            <Link href="/settings" className="hover:text-ink">
              Settings
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-muted-600">{state.account.name}</span>
            <button
              onClick={handleLogout}
              className="text-muted-600 hover:text-ink transition"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-6 py-10">{children}</main>
    </div>
  );
}
