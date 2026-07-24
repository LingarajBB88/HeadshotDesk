"use client";

import { useState } from "react";

import { BrandName } from "@/components/BrandName";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/**
 * Public feature-request form for the landing page roadmap section.
 * Stores the request server-side and forwards it to the team inbox.
 */
export function FeatureRequestForm() {
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (message.trim().length < 10) {
      setState("error");
      return;
    }
    setState("sending");
    try {
      const res = await fetch(`${BASE}/api/v1/public/feature-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message.trim(),
          email: email.trim() || null,
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setState("sent");
      setMessage("");
      setEmail("");
    } catch {
      setState("error");
    }
  }

  if (state === "sent") {
    return (
      <div className="rounded-card border border-green-200 bg-green-50 p-4">
        <p className="text-sm font-medium text-green-700">
          Got it, thanks. Every request lands directly with the team.
        </p>
        <button
          type="button"
          onClick={() => setState("idle")}
          className="mt-1 text-xs text-green-700 hover:underline"
        >
          Send another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="max-w-xl">
      <label
        htmlFor="feature-message"
        className="block text-sm font-medium text-ink"
      >
        What should <BrandName /> do next?
      </label>
      <textarea
        id="feature-message"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="Describe the feature and the problem it would solve for you…"
        className="mt-1.5 w-full rounded-card border border-muted-200 bg-paper px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-accent/30 focus:border-accent"
      />
      <div className="mt-2 flex flex-col sm:flex-row gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Your email (optional, if you want a reply)"
          className="flex-1 rounded-md border border-muted-200 bg-paper px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-accent/30 focus:border-accent"
          aria-label="Your email, optional"
        />
        <button
          type="submit"
          disabled={state === "sending"}
          className="btn-primary text-sm disabled:opacity-60"
        >
          {state === "sending" ? "Sending…" : "Send request"}
        </button>
      </div>
      {state === "error" ? (
        <p className="mt-2 text-xs text-red-600" role="alert">
          Didn&apos;t go through. Write at least a sentence, then try again.
        </p>
      ) : null}
    </form>
  );
}
