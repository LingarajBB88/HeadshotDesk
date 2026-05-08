// Thin wrapper around fetch that points at the FastAPI backend.
// All API calls flow through here so we can centralize auth, errors, and base URL.

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
  }

  /**
   * For Pydantic 422 validation errors, return a `{ field: message }` map so
   * forms can show errors inline next to the right input.
   * Returns an empty object for non-validation errors.
   */
  get fieldErrors(): Record<string, string> {
    const detail = (this.body as { detail?: unknown })?.detail;
    if (!Array.isArray(detail)) return {};
    const errors: Record<string, string> = {};
    for (const item of detail) {
      const loc = (item as { loc?: unknown[] }).loc ?? [];
      const field = loc[loc.length - 1];
      const msg = (item as { msg?: string }).msg ?? "Invalid value";
      if (typeof field === "string" && !(field in errors)) {
        errors[field] = msg;
      }
    }
    return errors;
  }
}

function extractMessage(body: unknown, fallback: string): string {
  const detail = (body as { detail?: unknown })?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    // Pydantic 422: pick the first error's human-readable message.
    const first = detail[0] as { msg?: string; loc?: unknown[] };
    if (first.msg) {
      const loc = first.loc ?? [];
      const field = loc[loc.length - 1];
      // Prefix the field name when we have one, e.g. "client_email: not a valid email"
      return field ? `${String(field)}: ${first.msg}` : first.msg;
    }
  }
  return fallback;
}

export async function api<T = unknown>(
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, headers, ...rest } = init;
  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, extractMessage(body, res.statusText), body);
  }

  // 204 No Content responses (logout, forgot/reset password) have no body.
  // Calling res.json() on them throws "Unexpected end of JSON input".
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}
