"use client";

import { usePathname } from "next/navigation";
import Script from "next/script";

/**
 * Plausible, kept away from anything that carries a token.
 *
 * Four public routes have an access token in the path:
 *
 *   /g/{token}   a participant's private gallery
 *   /q/{token}   their live queue position
 *   /c/{token}   the photographer's client dashboard
 *   /r/{code}    a referral link
 *
 * The token IS the authentication: anyone holding the URL can open a
 * stranger's photos. Plausible records the full path, so a naive install
 * would put every gallery token into an external dashboard.
 *
 * We do not load the script at all on those routes. Plausible's own Shields
 * blocklist is not equivalent: it discards the pageview after receiving it,
 * so the token still leaves the browser and still lands in someone else's
 * logs. Shields is worth having as a second line, but it cannot be first.
 *
 * Not loading is airtight here because nothing in the app links to a token
 * route. You arrive by email link or pasted URL, both full page loads where
 * this component decides before the script exists. If a <Link> to a gallery
 * is ever added, this reasoning breaks.
 *
 * `referrer: "origin"` in those routes' layouts covers the other half: the
 * token travelling onward in a Referer header from a gallery.
 */
const TOKEN_ROUTES = ["/g/", "/q/", "/c/", "/r/"];

declare global {
  interface Window {
    plausible?: {
      init?: (options?: Record<string, unknown>) => void;
      (event: string, options?: Record<string, unknown>): void;
      q?: unknown[];
    };
  }
}

export function Analytics() {
  const pathname = usePathname();
  const src = process.env.NEXT_PUBLIC_PLAUSIBLE_SRC;

  if (!src) return null;
  if (TOKEN_ROUTES.some((prefix) => pathname?.startsWith(prefix))) return null;

  return (
    <Script
      defer
      src={src}
      strategy="afterInteractive"
      // Plausible's current script does nothing until init() is called.
      // Their snippet has two halves and loading only the first leaves
      // window.plausible as {init: function}: present, ready, and silent.
      // No error, no request, no data. Worth knowing that a loaded tracker
      // is not the same as a running one.
      onLoad={() => {
        try {
          window.plausible?.init?.();
        } catch {
          // Analytics must never be able to break a page.
        }
      }}
    />
  );
}
