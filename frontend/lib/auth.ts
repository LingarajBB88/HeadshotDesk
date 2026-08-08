// Auth client — token storage + signup/login/logout/me wrappers.
// Tokens live in localStorage for v0.1. We can migrate to httpOnly cookies later.

import { api, ApiError } from "./api";

const ACCESS_KEY = "hsd_access";
const REFRESH_KEY = "hsd_refresh";

export type User = {
  id: string;
  email: string;
  name: string;
  role: string;
  email_verified_at: string | null;
  created_at: string;
};

export type Account = {
  id: string;
  type: "photographer" | "corporate";
  name: string;
  plan: string;
};

type TokenPair = {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  expires_in: number;
};

type AuthResponse = {
  user: User;
  account: Account;
  tokens: TokenPair;
};

type MeResponse = {
  user: User;
  account: Account;
  /** HSD-66: cosmetic — the server gates every admin endpoint itself. */
  is_admin?: boolean;
};

// --- Token storage ---

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_KEY);
}

function setTokens(tokens: TokenPair) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACCESS_KEY, tokens.access_token);
  localStorage.setItem(REFRESH_KEY, tokens.refresh_token);
}

function clearTokens() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

// --- API calls ---

export async function signup(input: {
  email: string;
  password: string;
  name: string;
  account_name: string;
  account_type?: "photographer" | "corporate";
  /** From ?ref= in the URL. Extends this account's trial. */
  referral_code?: string | null;
  /** From ?invite= in the URL. Claims a free beta seat if one is left. */
  invite_code?: string | null;
}): Promise<AuthResponse> {
  const res = await api<AuthResponse>("/api/v1/auth/signup", {
    method: "POST",
    body: JSON.stringify({ account_type: "photographer", ...input }),
  });
  setTokens(res.tokens);
  return res;
}

export async function login(input: {
  email: string;
  password: string;
}): Promise<AuthResponse> {
  const res = await api<AuthResponse>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
  setTokens(res.tokens);
  return res;
}

export async function logout(): Promise<void> {
  const refresh = getRefreshToken();
  if (refresh) {
    try {
      await api("/api/v1/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refresh_token: refresh }),
      });
    } catch {
      // Best-effort. Clear locally even if server call fails.
    }
  }
  clearTokens();
}

export async function fetchMe(): Promise<MeResponse | null> {
  const token = getAccessToken();
  if (!token) return null;
  try {
    return await api<MeResponse>("/api/v1/auth/me", { token });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      clearTokens();
      return null;
    }
    throw e;
  }
}

// --- Password reset ---

export async function requestPasswordReset(email: string): Promise<void> {
  await api("/api/v1/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(
  token: string,
  newPassword: string,
): Promise<void> {
  await api("/api/v1/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, new_password: newPassword }),
  });
}
