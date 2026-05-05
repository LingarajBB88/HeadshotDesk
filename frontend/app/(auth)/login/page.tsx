"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AuthCard } from "@/components/AuthCard";
import { FormField } from "@/components/FormField";
import { ApiError } from "@/lib/api";
import { login } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
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
        setFormError("Incorrect email or password.");
      } else {
        setFormError("Something went wrong. Please try again.");
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
          New to HeadshotDesk?{" "}
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
        />
        <FormField
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
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
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </AuthCard>
  );
}
