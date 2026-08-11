"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { AuthCard } from "@/components/AuthCard";
import { FormField } from "@/components/FormField";
import { ApiError } from "@/lib/api";
import { signup } from "@/lib/auth";
import { classifyFormError } from "@/lib/form-errors";

// useSearchParams needs a Suspense boundary in the App Router, so the page
// is a thin shell around the real form.
export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Who sent them, and whether they're claiming a free seat. The backend
  // also reads an attribution cookie, so losing the query string on the way
  // here doesn't lose the credit.
  const referralCode = searchParams.get("ref");
  const inviteCode = searchParams.get("invite");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Controlled password + confirm so we can compare without round-tripping
  // through FormData. Both fields stay uncontrolled-ish for the rest of the
  // form to keep this change small.
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  // Only surface the mismatch after the user leaves the confirm field or
  // hits submit — avoids nagging on every keystroke while they're typing.
  const [confirmTouched, setConfirmTouched] = useState(false);

  const confirmMismatch =
    confirmTouched && confirm.length > 0 && confirm !== password;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});

    // Block submission on mismatch. Force the touched state so the error
    // shows even if the user hit submit without ever blurring the field.
    if (password !== confirm) {
      setConfirmTouched(true);
      setFieldErrors({ confirm_password: "Passwords don't match." });
      return;
    }

    setSubmitting(true);
    try {
      const data = new FormData(e.currentTarget);
      await signup({
        email: String(data.get("email") ?? "").trim(),
        password,
        name: String(data.get("name") ?? "").trim(),
        account_name: String(data.get("account_name") ?? "").trim(),
        referral_code: referralCode,
        invite_code: inviteCode,
      });
      router.push("/jobs");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setFieldErrors({ email: err.message });
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
      {/* Arriving on someone's link should be visible, not silent. It's
          also the honest place to say the bonus is real. */}
      {inviteCode ? (
        <p className="mb-4 rounded-md bg-accent-muted px-3 py-2 text-sm text-accent">
          You&apos;ve been invited. Your account will be free while
          HeadshotDesk is in beta.
        </p>
      ) : referralCode ? (
        // No longer promises anything: the trial is the same length for
        // everyone, and the reward goes to whoever made the introduction.
        // Still worth acknowledging, so arriving on someone's link isn't
        // silent.
        <p className="mb-4 rounded-md bg-accent-muted px-3 py-2 text-sm text-accent">
          A photographer sent you here. We&apos;ll let them know you signed
          up.
        </p>
      ) : null}

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
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
        />
        <FormField
          label="Confirm password"
          name="confirm_password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          onBlur={() => setConfirmTouched(true)}
          error={
            fieldErrors.confirm_password ??
            (confirmMismatch ? "Passwords don't match." : undefined)
          }
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
