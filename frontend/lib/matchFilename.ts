// Client-side port of the backend's filename-to-participant matching logic.
//
// Used by the folder watcher to decide whether a freshly-exported file should
// be uploaded automatically (matches a participant) or skipped (would have
// landed in the "Unassigned" bucket — noise).
//
// Mirrors app/services/file_service.py::match_filename_to_participant.
// Keep them in sync if you change either side.

function normalize(s: string): string {
  return s
    .replace(/[_\-]+/g, " ")
    .replace(/[^a-zA-Z0-9 ]+/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function stripIndexSuffix(stem: string): string {
  // Drop trailing "_001", " 042", "-7", etc.
  return stem.replace(/[\s_\-]\d+$/, "");
}

/**
 * Find the best-matching participant for a filename. Returns null if no
 * participant matches.
 *
 * When multiple participants share a name (e.g., two "John Smith"s on the
 * same job), we prefer one that has been marked as shot — the photographer's
 * shoot-queue action disambiguates "which John is this photo of."
 *
 *   findMatchingParticipant("Jane_Doe_001.jpg", [{name:"Jane Doe", shot_at:"..."}])
 *     → the Jane Doe participant
 *   findMatchingParticipant("Doe_Jane.jpg", ...)  → matches by token set
 *   findMatchingParticipant("IMG_1234.jpg", ...)  → null
 */
export function findMatchingParticipant<
  T extends { name: string; shot_at?: string | null },
>(filename: string, participants: T[]): T | null {
  const stem = filename.replace(/\.[^.]+$/, "");
  const fileNorm = normalize(stripIndexSuffix(stem));
  if (!fileNorm) return null;
  const fileTokens = new Set(fileNorm.split(" "));

  const matches: T[] = [];
  for (const p of participants) {
    const nameNorm = normalize(p.name);
    if (!nameNorm) continue;
    if (nameNorm === fileNorm) {
      matches.push(p);
      continue;
    }
    // Token-set match. Require ≥2 participant tokens — otherwise a participant
    // named "Test" would grab "Sangeetha Test.jpg". Single-token participants
    // ("Madonna") match only via exact match above.
    const nameTokens = nameNorm.split(" ").filter(Boolean);
    if (nameTokens.length >= 2 && nameTokens.every((t) => fileTokens.has(t))) {
      matches.push(p);
    }
  }

  // Substring fallback: the full name sits inside the filename with no
  // separator before the counter — "Antonella Di Santi9223.jpg", or a
  // Finder duplicate "… copy.jpg". Capture One writes the first form when
  // the naming token is clipboard + counter with nothing between them.
  // Longest name wins so a Doerr file can't fall to Doe.
  if (matches.length === 0) {
    let best: T | null = null;
    let bestLen = 0;
    for (const p of participants) {
      const nameNorm = normalize(p.name);
      if (nameNorm.split(" ").filter(Boolean).length < 2) continue;
      if (fileNorm.includes(nameNorm) && nameNorm.length > bestLen) {
        best = p;
        bestLen = nameNorm.length;
      }
    }
    if (best) return best;
  }

  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];
  // Tie-break: prefer participants already marked as shot in the queue.
  const shot = matches.filter((p) => p.shot_at);
  return shot.length > 0 ? shot[0] : matches[0];
}

/**
 * Convenience wrapper for callers that only have names (no shot status).
 * Equivalent to `findMatchingParticipant(...) !== null`.
 */
export function matchesAnyParticipant(
  filename: string,
  participantNames: string[],
): boolean {
  return (
    findMatchingParticipant(
      filename,
      participantNames.map((name) => ({ name })),
    ) !== null
  );
}
