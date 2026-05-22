"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Logo } from "@/components/Logo";
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
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6 h-14 flex items-center gap-3 sm:gap-6">
          {/* Logo — wordmark hidden on small screens, only HD tile shows */}
          <Link href="/jobs">
            <Logo size="sm" wordmark hideWordmarkOnMobile />
          </Link>

          {/* Primary nav — tighter spacing on mobile.
              "Galleries" tab removed 2026-05-22 — was a stub link to a
              non-existent /galleries route. Cross-job galleries dashboard
              is now backlogged as F7 (v0.2). When that ships, restore the
              link here. */}
          <nav className="flex items-center gap-3 sm:gap-5 text-sm text-muted-600">
            <Link href="/jobs" className="hover:text-ink">
              Jobs
            </Link>
            <Link href="/settings" className="hover:text-ink">
              Settings
            </Link>
          </nav>

          {/* Account info — name hidden on mobile, sign-out always visible */}
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden md:inline text-muted-600">{state.account.name}</span>
            <button
              onClick={handleLogout}
              className="text-muted-600 hover:text-ink transition"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-4 sm:px-6 py-6 sm:py-10">{children}</main>
    </div>
  );
}
