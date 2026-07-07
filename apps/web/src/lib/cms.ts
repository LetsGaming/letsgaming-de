/**
 * Browser-side CMS API client. Authenticates with either a bearer token (entered
 * once, kept in this tab) or the OAuth session cookie (credentials: include).
 * Runs only in the CMS, never on the public site.
 */

const API_BASE = (import.meta.env.PUBLIC_API_URL ?? "").replace(/\/$/, "");

let token: string | null = null;

export function setToken(value: string | null) {
  token = value && value.trim() ? value.trim() : null;
  try {
    if (token) localStorage.setItem("cms_token", token);
    else localStorage.removeItem("cms_token");
  } catch {
    /* ignore */
  }
}

export function loadToken(): string | null {
  try {
    token = localStorage.getItem("cms_token");
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
  analytics: (from?: string, to?: string) => {
    const q = new URLSearchParams();
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    return fetch(`${API_BASE}/api/cms/analytics?${q}`, {
      headers: headers(false),
      credentials: "include",
    }).then(handle);
  },

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
