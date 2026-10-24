/**
 * Plausible custom events. The goals to create in Plausible's dashboard
 * (Site settings → Goals → Add goal → Custom event) use exactly these names.
 *
 * Fire-and-forget: analytics must never break or delay a page. If the
 * script is blocked, not configured, or not loaded on this route (token
 * routes never load it, see components/Analytics.tsx), this does nothing.
 *
 * Never pass personal data as a prop: no names, emails, or tokens.
 */
export type TrackedEvent =
  | "Signup" // account created
  | "Job created" // any job; unique conversions ≈ accounts that created one
  | "Start free clicked" // a "Try it free" / "Create your account" CTA
  | "Demo booked"; // reserved for the walkthrough booking (HSD-81)

export function track(event: TrackedEvent, props?: Record<string, string>) {
  try {
    if (typeof window === "undefined" || !window.plausible) return;
    window.plausible(event, props ? { props } : undefined);
  } catch {
    // Never let analytics surface an error.
  }
}
