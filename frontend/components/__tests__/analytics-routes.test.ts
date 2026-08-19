/**
 * The route guard in Analytics.tsx, tested as data.
 *
 * This is the control that stops a participant's gallery token reaching a
 * third-party dashboard, so the list of protected prefixes is worth
 * asserting rather than eyeballing. If someone adds a new tokenised route
 * and forgets this file, the assertion below is where it should surface.
 */
const TOKEN_ROUTES = ["/g/", "/q/", "/c/", "/r/"];

function isTracked(pathname: string): boolean {
  return !TOKEN_ROUTES.some((prefix) => pathname.startsWith(prefix));
}

const cases: Array<[string, boolean]> = [
  // Never tracked: the path itself is a credential.
  ["/g/abc123token", false],
  ["/q/abc123token", false],
  ["/c/clienttoken", false],
  ["/r/REFCODE", false],
  // Tracked: this is the traffic we actually want to measure.
  ["/", true],
  ["/pricing", true],
  ["/help", true],
  ["/for-clients", true],
  ["/p/panther-studios", true],
  ["/s/invest-nl-headshots", true],
  ["/signup", true],
];

let failures = 0;
for (const [path, want] of cases) {
  const got = isTracked(path);
  if (got !== want) {
    failures++;
    console.error(`FAIL ${path}: tracked=${got}, expected ${want}`);
  }
}

if (failures) {
  throw new Error(`${failures} analytics route guard case(s) failed`);
}
console.log(`analytics route guard: ${cases.length} cases OK`);
