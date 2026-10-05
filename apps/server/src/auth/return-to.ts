export const DEFAULT_RETURN = "/admin";

/**
 * Reduces a caller-supplied post-login target to a same-origin relative path.
 * Anything that a browser could resolve to another host (`//host`, `/\host`,
 * absolute URLs) or that carries control characters falls back to `/admin`.
 */
export function safeReturnTo(raw: unknown): string {
  if (typeof raw !== "string") return DEFAULT_RETURN;
  const isRelative = raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\");
  // eslint-disable-next-line no-control-regex
  if (!isRelative || /[\u0000-\u001f\u007f\\]/.test(raw)) return DEFAULT_RETURN;
  return raw;
}

/** The CMS web origin (first entry of WEB_ORIGIN) joined with a validated path. */
export function returnUrl(webOrigin: string, returnTo: unknown): string {
  const origin = webOrigin.split(",")[0]?.trim() ?? "";
  return `${origin}${safeReturnTo(returnTo)}`;
}
