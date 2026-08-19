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
 * We do not load the script at all on those routes. The obvious
 * alternative, Plausible's Shields blocklist, is not equivalent: it
 * discards the pageview after receiving it, so the token still leaves the
 * browser and still lands in someone else's logs. Shields is worth setting
 * up as a second line, but it cannot be the first.
 *
 * Not loading is airtight here because there is no link anywhere in the app
 * to a token route. You reach one by opening a link from an email or
 * pasting a URL, both of which are full page loads where this component
 * decides before the script exists. If a <Link> to a gallery is ever added,
 * this reasoning breaks and the script would need manual pageview control
 * instead.
 *
 * `referrer: "origin"` in those routes' layouts covers the other half: the
 * token travelling onward in a Referer header when someone clicks a link
 * from their gallery.
 *
 * Enabled by NEXT_PUBLIC_PLAUSIBLE_SRC, the site-specific script URL from
 * the Plausible dashboard. Unset in development so local browsing stays out
 * of the numbers.
 */
const TOKEN_ROUTES = ["/g/", "/q/", "/c/", "/r/"];

export function Analytics() {
  const pathname = usePathname();
  const src = process.env.NEXT_PUBLIC_PLAUSIBLE_SRC;

  if (!src) return null;
  if (TOKEN_ROUTES.some((prefix) => pathname?.startsWith(prefix))) return null;

  return <Script defer src={src} strategy="afterInteractive" />;
}
