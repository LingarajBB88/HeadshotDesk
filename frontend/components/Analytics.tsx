import Script from "next/script";

/**
 * Plausible, loaded site-wide but blind to anything sensitive.
 *
 * Four of our public routes carry an access token in the path:
 *
 *   /g/{token}   a participant's private gallery
 *   /q/{token}   their live queue position
 *   /c/{token}   the photographer's client dashboard
 *   /r/{code}    a referral link
 *
 * Those tokens are the authentication. Anyone holding the URL can open a
 * stranger's photos, so the URL must never reach a third party. Analytics
 * scripts send the full path by default, which would put every gallery
 * token into an external dashboard.
 *
 * Two defences, because one is not enough:
 *
 * 1. The `exclusions` build of the script, which drops the event entirely
 *    for the paths below. This covers client-side navigation too, which a
 *    "don't render the component" approach would miss once the script is
 *    already on the page.
 *
 * 2. `referrer: "origin"` in the metadata of those routes (see their
 *    layouts), so a participant clicking from their gallery to any other
 *    page sends only the origin. Without it the token would travel in the
 *    Referer header of the very next request, and exclusions do nothing
 *    about that.
 *
 * Set NEXT_PUBLIC_PLAUSIBLE_DOMAIN to enable. Unset in development, so
 * local page views never pollute the numbers.
 */
const EXCLUDED = ["/g/*", "/q/*", "/c/*", "/r/*"].join(", ");

export function Analytics() {
  const domain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
  if (!domain) return null;

  return (
    <Script
      defer
      data-domain={domain}
      data-exclude={EXCLUDED}
      src="https://plausible.io/js/script.exclusions.js"
      strategy="afterInteractive"
    />
  );
}
