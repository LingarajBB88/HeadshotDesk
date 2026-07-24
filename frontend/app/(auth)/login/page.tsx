"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AuthCard } from "@/components/AuthCard";
import { BrandName } from "@/components/BrandName";
import { FormField } from "@/components/FormField";
import { ApiError } from "@/lib/api";
import { login } from "@/lib/auth";
import { classifyFormError } from "@/lib/form-errors";

export default function LoginPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});
    setSubmitting(true);
    try {
      const data = new FormData(e.currentTarget);
      await login({
        email: String(data.get("email") ?? "").trim(),
        password: String(data.get("password") ?? ""),
      });
      router.push("/jobs");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        // Generic — don't leak which was wrong.
        setFormError("Incorrect email or password.");
      } else {
        const c = classifyFormError(err);
        if (c.fieldErrors) setFieldErrors(c.fieldErrors);
        else if (c.formError) setFormError(c.formError);
        else setFormError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard
      title="Sign in"
      subtitle="Welcome back."
      footer={
        <>
          New to <BrandName />?{" "}
          <Link href="/signup" className="text-accent hover:underline">
            Create an account
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
          error={fieldErrors.email}
        />
        <FormField
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          error={fieldErrors.password}
        />

        <p className="-mt-2 mb-4 text-right text-xs">
          <Link href="/forgot-password" className="text-muted-600 hover:text-accent">
            Forgot password?
          </Link>
        </p>

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
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </AuthCard>
  );
}
