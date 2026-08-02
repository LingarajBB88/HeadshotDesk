"use client";

// HSD-65 (pitch kit, component 2) — the sample experience.
//
// A client deciding whether to book asks "what will my colleagues actually
// have to do?" Describing it loses; letting them click through it wins.
// This is the participant journey end to end: signup, picking a time, and
// the gallery they receive.
//
// Deliberately 100% client-side. No API calls, no demo rows in anyone's
// database, nothing to clean up later, and it keeps working even if the
// backend is down mid-pitch. Every action is simulated in local state and
// labelled as a sample so nobody mistakes it for their real photos.

import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";

import { BrandName } from "@/components/BrandName";
import { Logo } from "@/components/Logo";

type Step = "signup" | "booked" | "gallery";

const SLOTS = [
  "09:00", "09:10", "09:20", "09:30", "09:40", "09:50",
  "10:00", "10:10", "10:20", "10:30", "10:40", "10:50",
];
// A couple already taken so the picker looks like a real shoot day.
const TAKEN = new Set(["09:10", "09:40", "10:20"]);

const PHOTO_TINTS = [
  ["#E7ECFF", "#C9D4FF"],
  ["#FDE9E4", "#F8CFC4"],
  ["#E4F4EC", "#C6E7D6"],
  ["#F3E9FB", "#DFC9F3"],
  ["#FFF3DC", "#F7E0B0"],
  ["#E6F1F8", "#C6DEEE"],
];

/** Placeholder "photo": a soft studio-ish backdrop with a portrait
 *  silhouette. Drawn rather than shipped as stock images — no likeness of
 *  a real person, no licensing question, and it reads as a sample. */
function SamplePhoto({ index }: { index: number }) {
  const [from, to] = PHOTO_TINTS[index % PHOTO_TINTS.length];
  return (
    <svg viewBox="0 0 200 200" className="w-full h-full" aria-hidden>
      <defs>
        <linearGradient id={`bg${index}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={from} />
          <stop offset="100%" stopColor={to} />
        </linearGradient>
      </defs>
      <rect width="200" height="200" fill={`url(#bg${index})`} />
      <circle cx="100" cy="78" r="30" fill="#FFFFFF" opacity="0.85" />
      <path
        d="M40 200c0-33 27-60 60-60s60 27 60 60z"
        fill="#FFFFFF"
        opacity="0.85"
      />
    </svg>
  );
}

function DemoBanner() {
  return (
    <div className="bg-ink text-white">
      <div className="mx-auto max-w-[var(--max-content)] px-4 sm:px-6 py-2.5 text-xs sm:text-sm flex flex-wrap items-center justify-between gap-2">
        <span>
          <strong className="font-semibold">Sample experience.</strong> Click
          around freely: nothing is saved, nothing is sent, and these are not
          real photos.
        </span>
        <Link href={"/for-clients" as Route} className="underline hover:no-underline">
          Back to the overview
        </Link>
      </div>
    </div>
  );
}

export default function SamplePage() {
  const [step, setStep] = useState<Step>("signup");
  const [name, setName] = useState("");
  const [slot, setSlot] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [downloadNote, setDownloadNote] = useState(false);

  const firstName = (name.trim().split(" ")[0] || "there").trim();

  return (
    <main className="min-h-dvh bg-muted-50">
      <DemoBanner />

      {/* Step rail — lets the client jump straight to the gallery, which is
          the part that sells the experience. */}
      <div className="mx-auto max-w-[var(--max-content)] px-4 sm:px-6 pt-8">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {(
            [
              ["signup", "1. Your colleague signs up"],
              ["booked", "2. They pick a time"],
              ["gallery", "3. They get their photos"],
            ] as [Step, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setStep(key)}
              className={
                "rounded-card border px-3 py-1.5 transition " +
                (step === key
                  ? "border-accent bg-accent text-accent-fg"
                  : "border-muted-200 bg-paper text-muted-600 hover:border-accent")
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-[var(--max-content)] px-4 sm:px-6 py-10">
        {/* ---------------------------------------------- 1. Signup */}
        {step === "signup" ? (
          <div className="mx-auto max-w-md">
            <p className="text-center text-sm text-muted-600 mb-6">
              This is the only page you send to your team. It works on a
              phone, and nobody creates an account.
            </p>
            <div className="bg-paper border border-muted-200 rounded-dialog p-8 shadow-sm">
              <div className="flex justify-center mb-6">
                <span className="inline-flex h-12 items-center rounded-md bg-muted-100 px-4 text-sm font-semibold text-muted-600">
                  Your company logo
                </span>
              </div>
              <h1 className="font-display text-2xl font-semibold tracking-tight text-center">
                Headshot day
              </h1>
              <p className="mt-2 text-sm text-muted-600 text-center">
                Tuesday 15 September · Meeting room 2
              </p>
              <div className="mt-6 space-y-3">
                <label className="block">
                  <span className="block text-sm font-medium text-ink mb-1">
                    Your name
                  </span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jane Doe"
                    className="w-full rounded-md border border-muted-200 bg-paper px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                  />
                </label>
                <label className="block">
                  <span className="block text-sm font-medium text-ink mb-1">
                    Work email
                  </span>
                  <input
                    placeholder="jane@company.com"
                    className="w-full rounded-md border border-muted-200 bg-paper px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                  />
                </label>
                <p className="text-xs text-muted-600">
                  Pick a time that suits you:
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {SLOTS.map((s) => {
                    const taken = TAKEN.has(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        disabled={taken}
                        onClick={() => setSlot(s)}
                        className={
                          "rounded-md border px-2 py-2 text-sm font-medium transition " +
                          (taken
                            ? "border-muted-200 bg-muted-100 text-muted-400 line-through cursor-not-allowed"
                            : slot === s
                              ? "border-accent bg-accent text-accent-fg"
                              : "border-muted-200 bg-paper hover:border-accent")
                        }
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
                <label className="flex items-start gap-2 text-xs text-muted-600">
                  <input type="checkbox" className="mt-0.5 accent-accent" />
                  <span>
                    I agree to my photos being taken and shared with me
                    privately.
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => setStep("booked")}
                  className="btn-primary w-full"
                >
                  I&apos;m in
                </button>
              </div>
            </div>
            <p className="mt-4 text-center text-xs text-muted-600">
              That is the whole task for each colleague. Under a minute.
            </p>
          </div>
        ) : null}

        {/* ---------------------------------------------- 2. Booked */}
        {step === "booked" ? (
          <div className="mx-auto max-w-md text-center">
            <div className="bg-paper border border-muted-200 rounded-dialog p-8 shadow-sm">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-700 text-xl">
                ✓
              </div>
              <h1 className="mt-4 font-display text-2xl font-semibold tracking-tight">
                You&apos;re booked, {firstName}
              </h1>
              <p className="mt-2 text-sm text-muted-600">
                Tuesday 15 September at{" "}
                <strong className="text-ink">{slot ?? "09:30"}</strong>,
                meeting room 2. We&apos;ll email your photos when they&apos;re
                ready.
              </p>
              <button
                type="button"
                onClick={() => setStep("gallery")}
                className="btn-primary mt-6"
              >
                See the photos they receive
              </button>
            </div>
            <p className="mt-4 text-xs text-muted-600">
              No reminders for you to send: they picked the slot, so it&apos;s
              in their own calendar logic, not your spreadsheet.
            </p>
          </div>
        ) : null}

        {/* ---------------------------------------------- 3. Gallery */}
        {step === "gallery" ? (
          <div>
            <div className="mx-auto max-w-3xl text-center">
              <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
                Hi {firstName}, here are your photos
              </h1>
              <p className="mt-2 text-sm text-muted-600">
                Every colleague gets a private link like this, showing only
                their own photos. Star a favourite, download, done.
              </p>
            </div>

            <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => {
                const isPicked = picked.has(i);
                return (
                  <figure
                    key={i}
                    className={
                      "rounded-card overflow-hidden border bg-paper shadow-sm transition " +
                      (isPicked ? "border-accent ring-2 ring-accent/30" : "border-muted-200")
                    }
                  >
                    <div className="relative aspect-square bg-muted-100">
                      <SamplePhoto index={i} />
                      <button
                        type="button"
                        onClick={() =>
                          setPicked((p) => {
                            const next = new Set(p);
                            if (next.has(i)) next.delete(i);
                            else next.add(i);
                            return next;
                          })
                        }
                        aria-label={isPicked ? "Remove favourite" : "Mark favourite"}
                        className={
                          "absolute top-2 right-2 inline-flex h-8 w-8 items-center justify-center rounded-full text-base shadow-sm transition " +
                          (isPicked
                            ? "bg-amber-400 text-white"
                            : "bg-white/90 text-muted-600 hover:text-amber-500")
                        }
                      >
                        {isPicked ? "★" : "☆"}
                      </button>
                    </div>
                    <figcaption className="p-3">
                      <button
                        type="button"
                        onClick={() => setDownloadNote(true)}
                        className="btn-primary w-full text-xs py-2"
                      >
                        Save photo
                      </button>
                    </figcaption>
                  </figure>
                );
              })}
            </div>

            {downloadNote ? (
              <p className="mt-4 text-center text-sm text-muted-600" role="status">
                In a real gallery this saves the full-resolution file. Nothing
                downloads here, because these are drawn placeholders.
              </p>
            ) : null}

            <div className="mt-10 rounded-card border border-accent/30 bg-accent-muted p-6 text-center">
              <p className="text-sm text-ink font-medium">
                That is the entire experience for your team.
              </p>
              <p className="mt-1 text-sm text-muted-600">
                One link to sign up, one link to collect photos, and nothing
                routed through your inbox.
              </p>
              <Link
                href={"/for-clients" as Route}
                className="btn-secondary text-sm mt-4 inline-flex"
              >
                Back to the overview
              </Link>
            </div>
          </div>
        ) : null}
      </div>

      <footer className="border-t border-muted-200 bg-paper">
        <div className="mx-auto max-w-[var(--max-content)] px-4 sm:px-6 py-8 flex items-center justify-center gap-2 text-xs text-muted-600">
          <span>Shoot day runs on</span>
          <Link href="/" className="inline-flex items-center">
            <Logo size="sm" wordmark />
          </Link>
        </div>
      </footer>
    </main>
  );
}
