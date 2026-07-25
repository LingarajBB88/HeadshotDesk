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

// --- Silent access-token refresh -------------------------------------------
// Access tokens expire while long-lived pages (job detail, shoot screen)
// stay open; without this every authed call starts failing with 401 until
// the user logs in again. On a 401 we exchange the refresh token for a new
// access token once (single-flight, so 15s polling doesn't stampede) and
// retry the original request. Storage keys mirror lib/auth.ts — api.ts
// can't import it without a cycle.
const ACCESS_KEY = "hsd_access";
const REFRESH_KEY = "hsd_refresh";

let refreshInFlight: Promise<string | null> | null = null;

function refreshAccessToken(): Promise<string | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  const refresh = localStorage.getItem(REFRESH_KEY);
  if (!refresh) return Promise.resolve(null);
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${BASE}/api/v1/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refresh }),
        });
        if (!res.ok) {
          // Refresh token itself is dead (revoked/expired) — clear both so
          // the app falls back to the login screen instead of looping.
          localStorage.removeItem(ACCESS_KEY);
          localStorage.removeItem(REFRESH_KEY);
          return null;
        }
        const data = (await res.json()) as { access_token: string };
        localStorage.setItem(ACCESS_KEY, data.access_token);
        return data.access_token;
      } catch {
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

export async function api<T = unknown>(
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, headers, ...rest } = init;

  async function doFetch(bearer: string | undefined): Promise<Response> {
    return fetch(`${BASE}${path}`, {
      ...rest,
      headers: {
        "Content-Type": "application/json",
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
        ...headers,
      },
    });
  }

  let res = await doFetch(token);

  // Expired access token: refresh once and retry with the new one.
  if (res.status === 401 && token) {
    const fresh = await refreshAccessToken();
    if (fresh && fresh !== token) {
      res = await doFetch(fresh);
    }
  }

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
