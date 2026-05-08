// Shared layout shell for /login and /signup pages.
// Renders the HD logo above a centered card with the form inside.

import Link from "next/link";

import { Logo } from "@/components/Logo";

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <main className="min-h-dvh flex items-center justify-center px-6 py-12 bg-muted-50">
      <div className="w-full max-w-md">
        <Link href="/" className="flex justify-center mb-8">
          <Logo size="md" wordmark />
        </Link>

        <div className="bg-paper border border-muted-200 rounded-dialog p-8 shadow-sm">
          <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle ? (
            <p className="mt-1 text-sm text-muted-600">{subtitle}</p>
          ) : null}
          <div className="mt-6">{children}</div>
        </div>

        <div className="mt-6 text-center text-sm text-muted-600">{footer}</div>
      </div>
    </main>
  );
}
