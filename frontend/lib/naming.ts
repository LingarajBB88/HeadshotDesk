// Shared naming helpers for participant-facing pages.

/**
 * Whether a job name already names the client, so "with {client}" would be
 * redundant.
 *
 * Photographers name jobs however they like, and "Headshots for InvestNL"
 * is a perfectly reasonable name. Appending the client to it produced
 * "Headshots for InvestNL with InvestNL", which reads like a bug to the
 * participant even though both fields are correct.
 *
 * Compares on letters and digits only, so "Invest-NL", "invest nl" and
 * "InvestNL" all count as already present. Deliberately not fuzzy beyond
 * that: a false positive silently drops information the participant might
 * need, and dropping it is worse than a slightly clumsy sentence.
 */
export function mentionsClient(jobName: string, clientName: string): boolean {
  const flatten = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const client = flatten(clientName);
  return client.length > 0 && flatten(jobName).includes(client);
}
