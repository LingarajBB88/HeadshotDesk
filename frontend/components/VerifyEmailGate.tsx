"use client";

// Shown instead of the app until the address is confirmed.
//
// A banner would have been friendlier, but friendlier is not the point:
// unverified accounts were still able to create jobs and upload photos,
// which meant fake signups accumulated real data and real storage cost.
// If the rule is "no junk accounts", the door is where it has to be
// enforced. The API agrees; this screen is just the polite version of the
// 403.

import { useState } from "react";

import { Logo } from "@/components/Logo";
import { api, ApiError } from "@/lib/api";
import { getAccessToken, logout } from "@/lib/auth";

export function VerifyEmailGate({ email }: { email: string }) {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resend() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/v1/auth/resend-verification", {
        method: "POST",
        token: getAccessToken() ?? undefined,
      });
      setSent(true);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Couldn't send it. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-dvh bg-muted-50 px-4 py-16">
      <div className="mx-auto max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo size="sm" wordmark />
        </div>

        <div className="rounded-dialog border border-muted-200 bg-paper p-8 shadow-sm">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Check your email
          </h1>
          <p className="mt-2 text-sm text-muted-600">
            We&apos;ve sent a link to{" "}
            <strong className="text-ink">{email}</strong>. Click it and
            you&apos;re in.
          </p>

          <div className="mt-6 rounded-card bg-muted-50 p-4">
            <p className="text-sm text-muted-600">
              Can&apos;t find it? Check your spam folder. It arrives within a
              minute or two.
            </p>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {sent ? (
              <p className="text-sm text-green-700">
                Sent. Have another look in your inbox.
              </p>
            ) : (
              <button
                onClick={resend}
                disabled={busy}
                className="btn-primary text-sm disabled:opacity-60"
              >
                {busy ? "Sending…" : "Send the link again"}
              </button>
            )}
            {/* Signing out matters here: someone who typed their address
                wrong has no other way back to a signup form. */}
            <button
              onClick={() => logout().then(() => window.location.assign("/login"))}
              className="text-sm text-muted-600 hover:text-ink transition"
            >
              Sign out
            </button>
          </div>

          {error ? (
            <p className="mt-3 text-sm text-red-600">{error}</p>
          ) : null}

          <p className="mt-6 border-t border-muted-200 pt-4 text-xs text-muted-600">
            Wrong address, or the link isn&apos;t arriving? Email{" "}
            <a
              href="mailto:info@headshotdesk.com"
              className="text-accent hover:underline"
            >
              info@headshotdesk.com
            </a>{" "}
            and we&apos;ll sort it out.
          </p>
        </div>
      </div>
    </main>
  );
}
