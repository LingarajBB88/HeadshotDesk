// Shared helpers for turning Pydantic 422 errors into user-friendly inline messages.

import { ApiError } from "./api";

/**
 * Convert a Pydantic 422 fieldErrors map into UI-ready strings.
 *
 * The mapping rules are intentionally conservative — we keep Pydantic's wording
 * unless we have a known nicer phrase. New rules should be added here so all
 * forms benefit immediately.
 */
function prettifyFieldErrors(
  raw: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [field, msg] of Object.entries(raw)) {
    out[field] = prettifyMessage(field, msg);
  }
  return out;
}

function prettifyMessage(field: string, msg: string): string {
  const lower = msg.toLowerCase();

  // Common Pydantic patterns
  if (lower.includes("valid email")) {
    return "Enter a valid email address.";
  }
  if (lower.includes("date") && lower.includes("valid")) {
    return "Enter a valid date.";
  }
  if (lower.includes("field required") || lower === "field required") {
    return "This field is required.";
  }
  if (lower.includes("at least") && lower.includes("character")) {
    // e.g. "string should have at least 8 characters"
    return capitalize(msg) + ".";
  }
  if (lower.includes("at most") && lower.includes("character")) {
    return capitalize(msg) + ".";
  }
  if (lower.includes("ensure this value") && lower.includes("character")) {
    return capitalize(msg) + ".";
  }

  // Default: capitalize, ensure terminal period
  const out = capitalize(msg);
  return out.endsWith(".") ? out : out + ".";
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * One-call helper: given an unknown error from a try/catch, return the bits
 * a form needs. Returns:
 *  - { fieldErrors }     — for 422 (per-field)
 *  - { formError }       — for any other ApiError (generic message)
 *  - { fallback: true }  — for non-ApiError (network etc.)
 */
export function classifyFormError(
  err: unknown,
): { fieldErrors?: Record<string, string>; formError?: string; fallback?: true } {
  if (err instanceof ApiError) {
    if (err.status === 422) {
      return { fieldErrors: prettifyFieldErrors(err.fieldErrors) };
    }
    return { formError: err.message };
  }
  return { fallback: true };
}
