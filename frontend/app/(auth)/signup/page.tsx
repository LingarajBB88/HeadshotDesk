"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AuthCard } from "@/components/AuthCard";
import { FormField } from "@/components/FormField";
import { ApiError } from "@/lib/api";
import { signup } from "@/lib/auth";

export default function SignupPage() {
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
      await signup({
        email: String(data.get("email") ?? "").trim(),
        password: String(data.get("password") ?? ""),
        name: String(data.get("name") ?? "").trim(),
        account_name: String(data.get("account_name") ?? "").trim(),
      });
      router.push("/jobs");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setFieldErrors({ email: err.message });
        } else if (err.status === 422) {
          setFormError("Please double-check your details.");
        } else {
          setFormError(err.message);
        }
      } else {
        setFormError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard
      title="Create your account"
      subtitle="Start your free trial. No credit card required."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="text-accent hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate>
        <FormField
          label="Your name"
          name="name"
          autoComplete="name"
          required
          error={fieldErrors.name}
        />
        <FormField
          label="Studio or business name"
          name="account_name"
          required
          hint="This shows on participant gallery emails. You can change it later."
          error={fieldErrors.account_name}
        />
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
          autoComplete="new-password"
          minLength={8}
          required
          hint="At least 8 characters."
          error={fieldErrors.password}
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
          {submitting ? "Creating account…" : "Create account"}
        </button>
      </form>
    </AuthCard>
  );
}
