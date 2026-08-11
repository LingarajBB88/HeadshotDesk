"use client";

// Sits at the top of every authenticated page until the address is
// confirmed.
//
// It states the consequence rather than just nagging. "Please verify your
// email" gets ignored; "we won't email your participants until you do"
// gets clicked, because it's the thing that will bite on shoot day.

import { useState } from "react";

import { api, ApiError } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

export function VerifyEmailBanner({ email }: { email: string }) {
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
    <div className="border-b border-amber-200 bg-amber-50 print:hidden">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 sm:px-6">
        <p className="text-sm text-amber-900">
          <strong>Confirm your email to finish setting up.</strong> Until you
          do, your signup links stay private and galleries won&apos;t send.
        </p>
        {sent ? (
          <span className="text-sm text-amber-800">
            Sent to {email}. Check your inbox.
          </span>
        ) : (
          <button
            onClick={resend}
            disabled={busy}
            className="text-sm font-medium text-amber-900 underline disabled:opacity-60"
          >
            {busy ? "Sending…" : "Send me the link again"}
          </button>
        )}
        {error ? (
          <span className="text-sm text-red-700">{error}</span>
        ) : null}
      </div>
    </div>
  );
}
