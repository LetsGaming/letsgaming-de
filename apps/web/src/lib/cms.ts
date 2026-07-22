/**
 * Browser-side CMS API client. The OAuth session cookie (http-only, credentials:
 * include) is the primary auth. The bearer token is a fallback for scripts/first
 * setup; when used interactively it's held in `sessionStorage` — scoped to the tab
 * and cleared on close — rather than `localStorage`, to shrink the window in which
 * a full-access credential sits readable in the browser (SEC-05). Prefer OAuth.
 * Runs only in the CMS, never on the public site.
 */

import { STORAGE_KEY, type ModerationAction } from "@lg/core";
// The response contracts. Both ends import these — the server's routes are typed
// to return them, so a route that drifts is a compile error over there.
import type {
  Asset,
  AnalyticsResponse,
  AssetDetail,
  AssetFolderResponse,
  AssetListResponse,
  ClearAnalyticsResponse,
  CmsContentResponse,
  GuestbookListResponse,
  MarkdownAssetResponse,
  MeResponse,
  OkIdResponse,
  OkResponse,
  RestoreResponse,
  RevisionListResponse,
  SiteView,
} from "@lg/core";
import { apiBase } from "./api";

const TOKEN_KEY = STORAGE_KEY.cmsToken;

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

/**
 * Unwrap a response, or throw something the CMS can show.
 *
 * The `as T` is the one assertion this file makes, and it's here rather than at
 * twenty-four call sites for a reason: the wire is untyped, so *something* has to
 * claim a shape. Making that a parameter means each method below declares what it
 * expects, once, against a type from `@lg/core` that the **server compiles
 * against too** — so a route that drifts fails the server's typecheck, which is
 * the side that can actually be wrong.
 *
 * It used to return `res.json()` — `any` — and the claim was made at the call
 * site instead: `(await cms.uploadAsset(file)) as PostAsset`. That compiled, built
 * and shipped, and was wrong; the server returns an `Asset`. A cast at the call
 * site is a check that can't fail, made by the side with no way of knowing.
 *
 * Not runtime validation: the server is ours and compiles against these shapes.
 * Requests are validated because they come from strangers. Responses are checked
 * where they're produced.
 */
async function handle<T>(res: Response): Promise<T> {
  if (res.status === 401 || res.status === 403) throw new AuthError();
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? `HTTP ${res.status}`);
  return (await res.json()) as T;
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
      handle<MeResponse>,
    ),
  content: () =>
    fetch(`${apiBase}/api/cms/content`, { headers: headers(false), credentials: "include" }).then(
      handle<CmsContentResponse>,
    ),
  analytics: (hours?: number) => {
    const q = new URLSearchParams();
    if (hours) q.set("hours", String(hours));
    return fetch(`${apiBase}/api/cms/analytics?${q}`, {
      headers: headers(false),
      credentials: "include",
    }).then(handle<AnalyticsResponse>);
  },
  clearAnalytics: (range: string) =>
    fetch(`${apiBase}/api/cms/analytics/clear`, {
      method: "POST",
      headers: headers(),
      credentials: "include",
      body: JSON.stringify({ range }),
    }).then(handle<ClearAnalyticsResponse>),

  guestbook: () =>
    fetch(`${apiBase}/api/cms/guestbook`, {
      headers: headers(false),
      credentials: "include",
    }).then(handle<GuestbookListResponse>),
  moderate: (id: number, action: ModerationAction) =>
    fetch(`${apiBase}/api/cms/guestbook/${id}/${action}`, {
      method: "POST",
      headers: headers(false),
      credentials: "include",
    }).then(handle<OkResponse>),

  /** Content history — newest first. */
  revisions: () => fetch(`${apiBase}/api/cms/revisions`, { headers: headers(), credentials: "include" }).then(handle<RevisionListResponse>),
  /** Put a past revision back. Writes forward: the restore is itself archived. */
  restoreRevision: (id: number) =>
    fetch(`${apiBase}/api/cms/revisions/${id}/restore`, {
      method: "POST",
      headers: headers(),
      credentials: "include",
    }).then(handle<RestoreResponse>),

  /** What the site *would* look like with this order. Resolves, saves nothing. */
  preview: (order: { area: string; modules: string[] }[], locale: string) =>
    fetch(`${apiBase}/api/cms/preview`, {
      method: "POST",
      headers: headers(),
      credentials: "include",
      body: JSON.stringify({ order, locale }),
    }).then(handle<SiteView>),

  /** A whole gallery's order in one request — see PUT /api/cms/gallery-order. */
  reorderGallery: (module: string, ids: string[]) =>
    cms.put("gallery-order", { module, ids }),

  put: (path: string, body: unknown) =>
    fetch(`${apiBase}/api/cms/${path}`, {
      method: "PUT",
      headers: headers(),
      credentials: "include",
      body: JSON.stringify(body),
    }).then(handle<OkResponse>),

  del: (path: string) =>
    fetch(`${apiBase}/api/cms/${path}`, {
      method: "DELETE",
      headers: headers(false),
      credentials: "include",
    }).then(handle<OkResponse>),

  createGallery: (heading: { en: string; de?: string }) =>
    fetch(`${apiBase}/api/cms/gallery-module`, {
      method: "POST",
      headers: headers(),
      credentials: "include",
      body: JSON.stringify({ heading }),
    }).then(handle<OkIdResponse>),
  deleteGallery: (id: string) =>
    fetch(`${apiBase}/api/cms/gallery-module/${id}`, {
      method: "DELETE",
      headers: headers(false),
      credentials: "include",
    }).then(handle<OkResponse>),

  // ── asset library ──────────────────────────────────────────────────────────
  assetUrl: (id: string, variant?: string) =>
    `${apiBase}/assets/${id}${variant ? `/${variant}` : ""}`,
  listAssets: (params: { folder?: string; tag?: string; kind?: string; q?: string } = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    return fetch(`${apiBase}/api/cms/assets${qs ? `?${qs}` : ""}`, {
      headers: headers(false),
      credentials: "include",
    }).then(handle<AssetListResponse>);
  },
  getAsset: (id: string) =>
    fetch(`${apiBase}/api/cms/assets/${id}`, { headers: headers(false), credentials: "include" }).then(handle<AssetDetail>),
  uploadAsset: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return fetch(`${apiBase}/api/cms/assets`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: "include",
      body: fd,
    }).then(handle<Asset>);
  },
  /** Read a markdown asset's source for editing. Public route: the editor needs
   *  the raw file, and drafts are already gated there by the preview token. */
  getMarkdown: (slug: string) =>
    fetch(`${apiBase}/api/assets/md/${encodeURIComponent(slug)}`, {
      headers: headers(false),
      credentials: "include",
    }).then(handle<MarkdownAssetResponse>),
  /** Rewrite a markdown asset's contents. Stable id, new bytes — see the route. */
  putMarkdown: (id: string, markdown: string) =>
    fetch(`${apiBase}/api/cms/assets/${id}/content`, {
      method: "PUT",
      headers: headers(true),
      credentials: "include",
      body: JSON.stringify({ markdown }),
    }).then(handle<OkResponse>),
  updateAsset: (id: string, patch: Record<string, unknown>) =>
    fetch(`${apiBase}/api/cms/assets/${id}`, {
      method: "PATCH",
      headers: headers(),
      credentials: "include",
      body: JSON.stringify(patch),
    }).then(handle<OkResponse>),
  deleteAsset: (id: string) =>
    fetch(`${apiBase}/api/cms/assets/${id}`, {
      method: "DELETE",
      headers: headers(false),
      credentials: "include",
    }).then(handle<OkResponse>),
  createAssetFolder: (name: string, parentId: string | null = null) =>
    fetch(`${apiBase}/api/cms/assets/folders`, {
      method: "POST",
      headers: headers(),
      credentials: "include",
      body: JSON.stringify({ name, parentId }),
    }).then(handle<AssetFolderResponse>),
  deleteAssetFolder: (id: string) =>
    fetch(`${apiBase}/api/cms/assets/folders/${id}`, {
      method: "DELETE",
      headers: headers(false),
      credentials: "include",
    }).then(handle<OkResponse>),
  loginUrl: () => `${apiBase}/auth/github/login`,
  /** Dev-only shortcut. The server only registers this route outside production
   *  and only answers loopback callers; the button that uses it is compiled out
   *  of production builds. */
  devLoginUrl: () => `${apiBase}/auth/dev/login`,
};
