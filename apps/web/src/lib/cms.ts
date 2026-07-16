/**
 * Browser-side CMS API client. The OAuth session cookie (http-only, credentials:
 * include) is the primary auth. The bearer token is a fallback for scripts/first
 * setup; when used interactively it's held in `sessionStorage` — scoped to the tab
 * and cleared on close — rather than `localStorage`, to shrink the window in which
 * a full-access credential sits readable in the browser (SEC-05). Prefer OAuth.
 * Runs only in the CMS, never on the public site.
 */

import { apiBase } from "./api";
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
  base: apiBase,

  me: () =>
    fetch(`${apiBase}/api/cms/me`, { headers: headers(false), credentials: "include" }).then(
      handle,
    ),
  content: () =>
    fetch(`${apiBase}/api/cms/content`, { headers: headers(false), credentials: "include" }).then(
      handle,
    ),
  analytics: (hours?: number) => {
    const q = new URLSearchParams();
    if (hours) q.set("hours", String(hours));
    return fetch(`${apiBase}/api/cms/analytics?${q}`, {
      headers: headers(false),
      credentials: "include",
    }).then(handle);
  },
  clearAnalytics: (range: string) =>
    fetch(`${apiBase}/api/cms/analytics/clear`, {
      method: "POST",
      headers: headers(),
      credentials: "include",
      body: JSON.stringify({ range }),
    }).then(handle),

  guestbook: () =>
    fetch(`${apiBase}/api/cms/guestbook`, {
      headers: headers(false),
      credentials: "include",
    }).then(handle),
  moderate: (id: number, action: "approve" | "reject") =>
    fetch(`${apiBase}/api/cms/guestbook/${id}/${action}`, {
      method: "POST",
      headers: headers(false),
      credentials: "include",
    }).then(handle),

  put: (path: string, body: unknown) =>
    fetch(`${apiBase}/api/cms/${path}`, {
      method: "PUT",
      headers: headers(),
      credentials: "include",
      body: JSON.stringify(body),
    }).then(handle),

  del: (path: string) =>
    fetch(`${apiBase}/api/cms/${path}`, {
      method: "DELETE",
      headers: headers(false),
      credentials: "include",
    }).then(handle),

  createGallery: (heading: { en: string; de?: string }) =>
    fetch(`${apiBase}/api/cms/gallery-module`, {
      method: "POST",
      headers: headers(),
      credentials: "include",
      body: JSON.stringify({ heading }),
    }).then(handle),
  deleteGallery: (id: string) =>
    fetch(`${apiBase}/api/cms/gallery-module/${id}`, {
      method: "DELETE",
      headers: headers(false),
      credentials: "include",
    }).then(handle),

  // ── asset library ──────────────────────────────────────────────────────────
  assetUrl: (id: string, variant?: string) =>
    `${apiBase}/assets/${id}${variant ? `/${variant}` : ""}`,
  listAssets: (params: { folder?: string; tag?: string; kind?: string; q?: string } = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    return fetch(`${apiBase}/api/cms/assets${qs ? `?${qs}` : ""}`, {
      headers: headers(false),
      credentials: "include",
    }).then(handle);
  },
  getAsset: (id: string) =>
    fetch(`${apiBase}/api/cms/assets/${id}`, { headers: headers(false), credentials: "include" }).then(handle),
  uploadAsset: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return fetch(`${apiBase}/api/cms/assets`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: "include",
      body: fd,
    }).then(handle);
  },
  /** Read a markdown asset's source for editing. Public route: the editor needs
   *  the raw file, and drafts are already gated there by the preview token. */
  getMarkdown: (slug: string) =>
    fetch(`${apiBase}/api/assets/md/${encodeURIComponent(slug)}`, {
      headers: headers(false),
      credentials: "include",
    }).then(handle),
  /** Rewrite a markdown asset's contents. Stable id, new bytes — see the route. */
  putMarkdown: (id: string, markdown: string) =>
    fetch(`${apiBase}/api/cms/assets/${id}/content`, {
      method: "PUT",
      headers: headers(true),
      credentials: "include",
      body: JSON.stringify({ markdown }),
    }).then(handle),
  updateAsset: (id: string, patch: Record<string, unknown>) =>
    fetch(`${apiBase}/api/cms/assets/${id}`, {
      method: "PATCH",
      headers: headers(),
      credentials: "include",
      body: JSON.stringify(patch),
    }).then(handle),
  deleteAsset: (id: string) =>
    fetch(`${apiBase}/api/cms/assets/${id}`, {
      method: "DELETE",
      headers: headers(false),
      credentials: "include",
    }).then(handle),
  createAssetFolder: (name: string, parentId: string | null = null) =>
    fetch(`${apiBase}/api/cms/assets/folders`, {
      method: "POST",
      headers: headers(),
      credentials: "include",
      body: JSON.stringify({ name, parentId }),
    }).then(handle),
  deleteAssetFolder: (id: string) =>
    fetch(`${apiBase}/api/cms/assets/folders/${id}`, {
      method: "DELETE",
      headers: headers(false),
      credentials: "include",
    }).then(handle),
  loginUrl: () => `${apiBase}/auth/github/login`,
};
