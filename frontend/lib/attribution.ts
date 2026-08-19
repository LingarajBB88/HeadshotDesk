// First-touch attribution.
//
// Plausible can tell you a Facebook group sent 40 visitors. It cannot tell
// you that two of them are still paying in month three, because it has no
// idea who signed up. That question is the one worth answering, and it
// needs the source carried from the landing page through to the account.
//
// First touch, not last: someone finds you in a Facebook group, reads for a
// week, then arrives via a Google search for your name and signs up. Last
// touch credits Google. The group did the work.
//
// Stored in localStorage rather than a cookie on purpose. It is only ever
// read by our own signup form, never sent to a third party, and it means no
// consent banner.

const KEY = "hd_attribution";

export type Attribution = {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  /** External referrer only. Our own pages are not a source. */
  referrer: string | null;
  /** The page they first landed on, which says a lot on its own. */
  landing_path: string | null;
};

/** Nothing here is free text from us, but it is free text from the URL. */
function clean(value: string | null, max = 120): string | null {
  if (!value) return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed || null;
}

/**
 * Record where this visit came from, unless something is already recorded.
 * Safe to call on every page load.
 */
export function captureAttribution(): void {
  if (typeof window === "undefined") return;
  try {
    if (window.localStorage.getItem(KEY)) return; // First touch wins.

    const params = new URLSearchParams(window.location.search);
    let referrer: string | null = null;
    if (document.referrer) {
      try {
        const url = new URL(document.referrer);
        // Our own pages are navigation, not a source. Recording them would
        // make "headshotdesk.com" the top referrer, which tells you nothing.
        if (url.host !== window.location.host) referrer = url.host + url.pathname;
      } catch {
        // Malformed referrer. Not worth a broken page.
      }
    }

    const attribution: Attribution = {
      source: clean(params.get("utm_source")),
      medium: clean(params.get("utm_medium")),
      campaign: clean(params.get("utm_campaign")),
      referrer: clean(referrer, 200),
      landing_path: clean(window.location.pathname, 200),
    };

    // A direct visit to the home page with no referrer says nothing worth
    // storing, and storing it would block a later, real source from being
    // recorded.
    const hasSignal =
      attribution.source || attribution.referrer || attribution.campaign;
    if (!hasSignal && attribution.landing_path === "/") return;

    window.localStorage.setItem(KEY, JSON.stringify(attribution));
  } catch {
    // Private browsing, storage disabled, quota. None of it should cost
    // someone a signup.
  }
}

export function readAttribution(): Attribution | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Attribution) : null;
  } catch {
    return null;
  }
}
