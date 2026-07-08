/**
 * Browser-side CMS API client. The OAuth session cookie (http-only, credentials:
 * include) is the primary auth. The bearer token is a fallback for scripts/first
 * setup; when used interactively it's held in `sessionStorage` — scoped to the tab
 * and cleared on close — rather than `localStorage`, to shrink the window in which
 * a full-access credential sits readable in the browser (SEC-05). Prefer OAuth.
 * Runs only in the CMS, never on the public site.
 */

const API_BASE = (import.meta.env.PUBLIC_API_URL ?? "").replace(/\/$/, "");
const TOKEN_KEY = "cms_token";

let token: string | null = null;

export function setToken(value: string | null) {
  token = value && value.trim() ? value.trim() : null;
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY); // migrate off any previously-persisted token
  } catch {
    /* ignore */
  }
}

export function loadToken(): string | null {
  try {
    token = sessionStorage.getItem(TOKEN_KEY);
  } catch {
    token = null;
  }
  return token;
}

function headers(json = true): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h["Content-Type"] = "application/json";
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

async function handle(res: Response) {
  if (res.status === 401 || res.status === 403) throw new AuthError();
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? `HTTP ${res.status}`);
  return res.json();
}

export class AuthError extends Error {
  constructor() {
    super("Not authenticated");
    this.name = "AuthError";
  }
}

export const cms = {
  base: API_BASE,

  me: () =>
    fetch(`${API_BASE}/api/cms/me`, { headers: headers(false), credentials: "include" }).then(
      handle,
    ),
  content: () =>
    fetch(`${API_BASE}/api/cms/content`, { headers: headers(false), credentials: "include" }).then(
      handle,
    ),
  analytics: (hours?: number) => {
    const q = new URLSearchParams();
    if (hours) q.set("hours", String(hours));
    return fetch(`${API_BASE}/api/cms/analytics?${q}`, {
      headers: headers(false),
      credentials: "include",
    }).then(handle);
  },
  clearAnalytics: (range: string) =>
    fetch(`${API_BASE}/api/cms/analytics/clear`, {
      method: "POST",
      headers: headers(),
      credentials: "include",
      body: JSON.stringify({ range }),
    }).then(handle),

  guestbook: () =>
    fetch(`${API_BASE}/api/cms/guestbook`, {
      headers: headers(false),
      credentials: "include",
    }).then(handle),
  moderate: (id: number, action: "approve" | "reject") =>
    fetch(`${API_BASE}/api/cms/guestbook/${id}/${action}`, {
      method: "POST",
      headers: headers(false),
      credentials: "include",
    }).then(handle),

  put: (path: string, body: unknown) =>
    fetch(`${API_BASE}/api/cms/${path}`, {
      method: "PUT",
      headers: headers(),
      credentials: "include",
      body: JSON.stringify(body),
    }).then(handle),

  del: (path: string) =>
    fetch(`${API_BASE}/api/cms/${path}`, {
      method: "DELETE",
      headers: headers(false),
      credentials: "include",
    }).then(handle),

  listMedia: () =>
    fetch(`${API_BASE}/api/cms/media`, { headers: headers(false), credentials: "include" }).then(
      handle,
    ),
  upload: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return fetch(`${API_BASE}/api/cms/media`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: "include",
      body: fd,
    }).then(handle);
  },

  mediaUrl: (path: string) => `${API_BASE}${path}`,
  loginUrl: () => `${API_BASE}/auth/github/login`,
};
