/**
 * Environment/config. One typed object read once at boot. No secrets are logged.
 */

export interface ServerEnv {
  port: number;
  host: string;
  /** SQLite file path. The store is the archive — back this up (§10). */
  dbPath: string;
  /** Allowed origin for the public site (CORS). */
  webOrigin: string;
  /** Trust X-Forwarded-* from a front proxy so `req.ip` is the real client. */
  trustProxy: boolean;
  github: { username: string; token?: string };
  /**
   * Simple bearer token guarding the CMS API for v1. GitHub OAuth (single user)
   * is the intended replacement — see `auth/github-oauth.ts`.
   */
  cmsToken?: string;
  oauth: { clientId?: string; clientSecret?: string; allowedLogin: string };
  /** Secret used to sign session cookies. Falls back to CMS_TOKEN. */
  sessionSecret: string;
  /** Directory for uploaded media (served read-only, backed up alongside the DB). */
  mediaDir: string;
  /** Contact relay. When unset, the contact endpoint reports "not configured". */
  smtp?: { host: string; port: number; user?: string; pass?: string; from: string; to: string };
}

/** The literal dev fallback — refused at boot when the CMS is enabled (SEC-01). */
export const DEV_SESSION_SECRET = "dev-insecure-secret-change-me-please";

/**
 * Read an env var, treating an empty/whitespace-only value as unset. Docker
 * Compose passes `${VAR:-}` as "" rather than leaving it undefined, so a plain
 * `??` chain would treat that "" as a real value and skip the fallback (BUG-02).
 */
function str(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function num(value: string | undefined, fallback: number): number {
  const n = value ? Number(value) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function bool(value: string | undefined): boolean {
  const v = str(value)?.toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  const cmsToken = str(source.CMS_TOKEN);
  const clientId = str(source.GITHUB_OAUTH_CLIENT_ID);
  const clientSecret = str(source.GITHUB_OAUTH_CLIENT_SECRET);
  const githubUsername = str(source.GITHUB_USERNAME) ?? "LetsGaming";

  // Empty-string-aware, so an unset SESSION_SECRET actually falls through to
  // CMS_TOKEN and then to the dev default (which boot-validation then rejects).
  const sessionSecret = str(source.SESSION_SECRET) ?? cmsToken ?? DEV_SESSION_SECRET;

  const env: ServerEnv = {
    port: num(source.PORT, 8787),
    host: source.HOST ?? "0.0.0.0",
    dbPath: source.DB_PATH ?? "./data/letsgaming.sqlite",
    webOrigin: str(source.WEB_ORIGIN) ?? "http://localhost:4321",
    trustProxy: bool(source.TRUST_PROXY),
    github: {
      username: githubUsername,
      ...(str(source.GITHUB_TOKEN) ? { token: str(source.GITHUB_TOKEN)! } : {}),
    },
    ...(cmsToken ? { cmsToken } : {}),
    oauth: {
      ...(clientId ? { clientId } : {}),
      ...(clientSecret ? { clientSecret } : {}),
      allowedLogin: str(source.CMS_ALLOWED_LOGIN) ?? githubUsername,
    },
    sessionSecret,
    mediaDir: source.MEDIA_DIR ?? "./data/media",
    ...(str(source.SMTP_HOST) && str(source.CONTACT_TO)
      ? {
          smtp: {
            host: str(source.SMTP_HOST)!,
            port: num(source.SMTP_PORT, 587),
            ...(str(source.SMTP_USER) ? { user: str(source.SMTP_USER)! } : {}),
            ...(str(source.SMTP_PASS) ? { pass: str(source.SMTP_PASS)! } : {}),
            from: str(source.CONTACT_FROM) ?? str(source.SMTP_USER) ?? `no-reply@letsgaming.de`,
            to: str(source.CONTACT_TO)!,
          },
        }
      : {}),
  };

  assertSecureConfig(env);
  return env;
}

/**
 * Fail closed at boot rather than silently accepting a forgeable session (SEC-01).
 * When the CMS is reachable (a bearer token or OAuth is configured), the cookie
 * signing secret must be a real, operator-set value — never empty and never the
 * shipped dev default, either of which an attacker could use to forge a session
 * cookie for the (public) allowed login.
 */
export function assertSecureConfig(env: ServerEnv): void {
  const cmsEnabled = Boolean(env.cmsToken || env.oauth.clientId);
  if (!cmsEnabled) return;
  if (!env.sessionSecret || env.sessionSecret === DEV_SESSION_SECRET) {
    throw new Error(
      "SESSION_SECRET must be set to a long, random value when the CMS is enabled " +
        "(a bearer token or GitHub OAuth is configured). Refusing to start with an " +
        "empty or default cookie-signing secret — it would let anyone forge a CMS session.",
    );
  }
}
