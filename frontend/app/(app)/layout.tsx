"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Logo } from "@/components/Logo";
import { VerifyEmailBanner } from "@/components/VerifyEmailBanner";
import { type Account, type User, fetchMe, logout } from "@/lib/auth";

// Layout for authenticated pages. Redirects to /login if no valid session.

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<{
    user: User;
    account: Account;
    isAdmin: boolean;
  } | null>(null);
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
      setState({
        user: me.user,
        account: me.account,
        isAdmin: !!me.is_admin,
      });
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
      {/* Above the nav, so it's the first thing on the page until it's
          dealt with. It blocks nothing here; the API is the real gate. */}
      {state.user.email_verified_at === null ? (
        <VerifyEmailBanner email={state.user.email} />
      ) : null}
      {/* print:hidden keeps the app chrome off printed pages (the QR card). */}
      <header className="border-b border-muted-200 bg-paper print:hidden">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6 h-14 flex items-center gap-3 sm:gap-6">
          {/* Logo — wordmark hidden on small screens, only HD tile shows */}
          <Link href="/jobs">
            <Logo size="sm" wordmark hideWordmarkOnMobile />
          </Link>

          {/* Primary nav — tighter spacing on mobile.
              "Galleries" tab removed 2026-05-22 (F7 backlogged) and
              "Settings" removed 2026-07-23 — both were stub links to
              non-existent routes; typedRoutes rightly failed the prod
              build on them. Restore each when its page ships. */}
          <nav className="flex items-center gap-3 sm:gap-5 text-sm text-muted-600">
            <Link href="/jobs" className="hover:text-ink">
              Jobs
            </Link>
            {/* HSD-36: client entities own branding (logos). */}
            <Link href="/clients" className="hover:text-ink">
              Clients
            </Link>
            {/* Help opens in a new tab so mid-shoot work isn't lost. */}
            <a
              href="/help"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-ink"
            >
              Help
            </a>
            {/* HSD-66: operator dashboard. Link shown only for admins;
                the API enforces access regardless. */}
            {state.isAdmin ? (
              <Link href="/admin" className="hover:text-ink">
                Admin
              </Link>
            ) : null}
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
      <main className="mx-auto max-w-[1400px] px-4 sm:px-6 py-6 sm:py-10 print:max-w-none print:p-0">
        {children}
      </main>
    </div>
  );
}
