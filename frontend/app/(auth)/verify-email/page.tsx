"use client";

// Landing page for the link in the verification email.
//
// Unauthenticated on purpose: these get clicked from a mail app on a phone
// that isn't logged in, and demanding a login first is how a verification
// flow turns into a support ticket.

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { AuthCard } from "@/components/AuthCard";
import { api, ApiError } from "@/lib/api";

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmail />
    </Suspense>
  );
}

function VerifyEmail() {
  const token = useSearchParams().get("token");
  const [state, setState] = useState<"working" | "done" | "failed">("working");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setState("failed");
      setError("This link is missing its token. Try the link in your email again.");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        await api("/api/v1/auth/verify-email", {
          method: "POST",
          body: JSON.stringify({ token }),
        });
        if (!cancelled) setState("done");
      } catch (err) {
        if (cancelled) return;
        setState("failed");
        setError(
          err instanceof ApiError
            ? err.message
            : "Couldn't confirm your email. Try again in a moment.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <AuthCard
      title={
        state === "done" ? "Email confirmed" : "Confirming your email"
      }
      subtitle={
        state === "done"
          ? "You're all set. Everything's unlocked."
          : state === "failed"
            ? "Something went wrong with that link."
            : "One moment."
      }
      footer={
        <>
          Need help?{" "}
          <a
            href="mailto:info@pantherstudios.nl"
            className="text-accent hover:underline"
          >
            Email us
          </a>
        </>
      }
    >
      {state === "working" ? (
        <p className="text-sm text-muted-600">Checking your link…</p>
      ) : state === "done" ? (
        <>
          <p className="text-sm text-muted-600">
            You can now share signup links and deliver galleries.
          </p>
          <Link href="/jobs" className="mt-4 inline-block btn-primary">
            Go to your jobs
          </Link>
        </>
      ) : (
        <>
          <p className="text-sm text-red-600">{error}</p>
          {/* The recovery is in the app, behind a login, because that's
              where we know who to send a new link to. */}
          <p className="mt-3 text-sm text-muted-600">
            Sign in and use the banner at the top to send yourself a new
            link.
          </p>
          <Link href="/login" className="mt-4 inline-block btn-primary">
            Sign in
          </Link>
        </>
      )}
    </AuthCard>
  );
}
