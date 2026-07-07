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
  github: { username: string; token?: string };
  /**
   * Simple bearer token guarding the CMS API for v1. GitHub OAuth (single user)
   * is the intended replacement — see `auth/github-oauth.ts`.
   */
  cmsToken?: string;
  oauth: { clientId?: string; clientSecret?: string; allowedLogin: string };
  /** Secret used to sign session cookies. Falls back to CMS_TOKEN in dev. */
  sessionSecret: string;
  /** Directory for uploaded media (served read-only, backed up alongside the DB). */
  mediaDir: string;
  /** Contact relay. When unset, the contact endpoint reports "not configured". */
  smtp?: { host: string; port: number; user?: string; pass?: string; from: string; to: string };
}

function num(value: string | undefined, fallback: number): number {
  const n = value ? Number(value) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  return {
    port: num(source.PORT, 8787),
    host: source.HOST ?? "0.0.0.0",
    dbPath: source.DB_PATH ?? "./data/letsgaming.sqlite",
    webOrigin: source.WEB_ORIGIN ?? "http://localhost:4321",
    github: {
      username: source.GITHUB_USERNAME ?? "LetsGaming",
      ...(source.GITHUB_TOKEN ? { token: source.GITHUB_TOKEN } : {}),
    },
    ...(source.CMS_TOKEN ? { cmsToken: source.CMS_TOKEN } : {}),
    oauth: {
      ...(source.GITHUB_OAUTH_CLIENT_ID ? { clientId: source.GITHUB_OAUTH_CLIENT_ID } : {}),
      ...(source.GITHUB_OAUTH_CLIENT_SECRET
        ? { clientSecret: source.GITHUB_OAUTH_CLIENT_SECRET }
        : {}),
      allowedLogin: source.CMS_ALLOWED_LOGIN ?? source.GITHUB_USERNAME ?? "LetsGaming",
    },
    sessionSecret:
      source.SESSION_SECRET ?? source.CMS_TOKEN ?? "dev-insecure-secret-change-me-please",
    mediaDir: source.MEDIA_DIR ?? "./data/media",
    ...(source.SMTP_HOST && source.CONTACT_TO
      ? {
          smtp: {
            host: source.SMTP_HOST,
            port: num(source.SMTP_PORT, 587),
            ...(source.SMTP_USER ? { user: source.SMTP_USER } : {}),
            ...(source.SMTP_PASS ? { pass: source.SMTP_PASS } : {}),
            from: source.CONTACT_FROM ?? source.SMTP_USER ?? `no-reply@letsgaming.de`,
            to: source.CONTACT_TO,
          },
        }
      : {}),
  };
}
