// Catching mistyped email domains on the signup form.
//
// The address format check passes for "name@gmailc.com": it is a perfectly
// well-formed address at a domain that does not exist. The participant is
// then on the list, the photographer shoots them, and the gallery bounces
// into nothing. Nobody finds out until someone asks where their photos are,
// by which point the shoot is over.
//
// This only ever suggests. It never blocks and never rewrites, because
// plenty of real domains look like near-misses of common ones and being
// wrong here would keep someone off the list entirely.

/** Domains common enough that a near-miss is almost certainly a typo. */
const COMMON_DOMAINS = [
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com",
  "yahoo.com", "yahoo.co.uk", "icloud.com", "me.com", "aol.com",
  "protonmail.com", "proton.me", "gmx.com", "zoho.com",
  // Dutch providers, since that is where most of these shoots are.
  "ziggo.nl", "kpnmail.nl", "planet.nl", "xs4all.nl", "home.nl", "upcmail.nl",
];

/** Optimal string alignment distance, capped for speed. */
function distance(a: string, b: string): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 99;
  const rows: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + cost,
      );
      // Transposition, so "gmial.com" is one mistake rather than two.
      if (
        i > 1 && j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
      }
    }
  }
  return rows[a.length][b.length];
}

/**
 * A corrected address to offer, or null when the domain looks fine or is
 * too far from anything we know to guess at.
 */
export function suggestEmail(raw: string): string | null {
  const value = (raw || "").trim();
  const at = value.lastIndexOf("@");
  if (at < 1 || at === value.length - 1) return null;

  const local = value.slice(0, at);
  const domain = value.slice(at + 1).toLowerCase();
  // Already a domain we recognise, so leave it alone.
  if (COMMON_DOMAINS.includes(domain)) return null;

  let best: string | null = null;
  let bestDistance = 3; // Anything further is a guess, not a correction.
  for (const candidate of COMMON_DOMAINS) {
    const d = distance(domain, candidate);
    if (d < bestDistance) {
      bestDistance = d;
      best = candidate;
    }
  }
  // Two edits is only convincing on a longer domain. On something short
  // like "gmx.com" it starts inventing corrections for real addresses.
  if (best && bestDistance === 2 && domain.length < 8) return null;
  return best ? `${local}@${best}` : null;
}
