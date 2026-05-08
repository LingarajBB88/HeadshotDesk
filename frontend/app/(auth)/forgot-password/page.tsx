"use client";

import Link from "next/link";
import { useState } from "react";

import { AuthCard } from "@/components/AuthCard";
import { FormField } from "@/components/FormField";
import { ApiError } from "@/lib/api";
import { requestPasswordReset } from "@/lib/auth";

export default function ForgotPasswordPage() {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEmailError(null);
    setSubmitting(true);
    try {
      const data = new FormData(e.currentTarget);
      const email = String(data.get("email") ?? "").trim();
      await requestPasswordReset(email);
      setSubmitted(true);
    } catch (err) {
      // 422 means the email format is invalid — that's a UX problem, not a
      // privacy concern, so we surface it inline rather than show fake success.
      if (err instanceof ApiError && err.status === 422) {
        setEmailError("Enter a valid email address.");
      } else {
        // Any other error (network, server) — preserve enumeration safety
        // by still showing the "check your email" state.
        setSubmitted(true);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <AuthCard
        title="Check your email"
        subtitle="If an account exists for that email, we've sent a link to reset your password. The link will expire in one hour."
        footer={
          <Link href="/login" className="text-accent hover:underline">
            Back to sign in
          </Link>
        }
      >
        <p className="text-sm text-muted-600">
          Didn&apos;t get an email? Check your spam folder, or{" "}
          <button
            onClick={() => setSubmitted(false)}
            className="text-accent hover:underline"
          >
            try a different address
          </button>
          .
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Reset your password"
      subtitle="We'll email you a link to set a new password."
      footer={
        <>
          Remembered it?{" "}
          <Link href="/login" className="text-accent hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate>
        <FormField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          error={emailError}
        />

        <button
          type="submit"
          disabled={submitting}
          className="btn-primary w-full disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {submitting ? "Sending…" : "Send reset link"}
        </button>
      </form>
    </AuthCard>
  );
}
