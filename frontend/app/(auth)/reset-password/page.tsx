"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { AuthCard } from "@/components/AuthCard";
import { FormField } from "@/components/FormField";
import { ApiError } from "@/lib/api";
import { resetPassword } from "@/lib/auth";

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});
    setSubmitting(true);
    try {
      const data = new FormData(e.currentTarget);
      const newPassword = String(data.get("password") ?? "");
      const confirm = String(data.get("confirm_password") ?? "");

      // Client-side check before hitting the server.
      if (newPassword.length < 8) {
        setFieldErrors({ password: "At least 8 characters." });
        return;
      }
      if (newPassword !== confirm) {
        setFieldErrors({ confirm_password: "Passwords don't match." });
        return;
      }

      await resetPassword(token, newPassword);
      setDone(true);
      // Give the user a beat to see the success message, then send to /login.
      setTimeout(() => router.push("/login"), 1800);
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        const fields = err.fieldErrors;
        if (fields.new_password) {
          setFieldErrors({ password: "At least 8 characters." });
        } else {
          setFormError("Please check your input and try again.");
        }
      } else if (err instanceof ApiError) {
        // 400 — token invalid / expired. Backend message is already user-friendly.
        setFormError(err.message);
      } else {
        setFormError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <AuthCard
        title="Invalid reset link"
        subtitle="This link is missing required information. Request a new one."
        footer={
          <Link href="/forgot-password" className="text-accent hover:underline">
            Request a new reset link
          </Link>
        }
      >
        <p className="text-sm text-muted-600">
          Reset links are valid for one hour. If you waited too long, just request another.
        </p>
      </AuthCard>
    );
  }

  if (done) {
    return (
      <AuthCard
        title="Password updated"
        subtitle="You'll be redirected to sign in shortly."
        footer={
          <Link href="/login" className="text-accent hover:underline">
            Sign in now
          </Link>
        }
      >
        <p className="text-sm text-muted-600">
          For your security, all of your existing sessions have been signed out.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Set a new password"
      subtitle="Enter your new password below. You'll be signed out everywhere for safety."
      footer={
        <Link href="/login" className="text-accent hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={onSubmit} noValidate>
        <FormField
          label="New password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          hint="At least 8 characters."
          error={fieldErrors.password}
        />
        <FormField
          label="Confirm new password"
          name="confirm_password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          error={fieldErrors.confirm_password}
        />

        {formError ? (
          <p className="mb-4 text-sm text-red-600" role="alert">
            {formError}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="btn-primary w-full disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {submitting ? "Updating…" : "Set new password"}
        </button>
      </form>
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
