# Security

This is a single-user personal site on a homelab, so the threat model is modest.
But the CMS writes to disk and the site takes requests from anyone, so a few
things matter. The privacy side (analytics, contact, the Impressum decision) is in
[concepts/analytics-and-privacy](./concepts/analytics-and-privacy.md).

## Reporting something

Don't open a public issue for a vulnerability. Open a private security advisory on
the GitHub repo, or reach out through the site's contact form. This is a personal
project maintained by one person, so expect a best-effort, human timeline.

## Authentication

Two ways in, both resolving to the single allowed identity: a signed, http-only
session cookie from GitHub OAuth, or a bearer `CMS_TOKEN`.

- OAuth only admits `CMS_ALLOWED_LOGIN`. Any other GitHub user gets `403`.
- The session cookie is signed with `SESSION_SECRET`, `httpOnly`, `sameSite=lax`,
  and `secure` in production.
- Token comparison is length-checked and then constant-time, to avoid trivial
  timing leaks.
- It fails closed. If neither `CMS_TOKEN` nor OAuth is configured, every CMS write
  returns `503`. There is no open state.
- It refuses to start unsafely. When the CMS is enabled but `SESSION_SECRET` is
  empty or the shipped dev default, the server won't boot, because that secret
  would let anyone forge a session cookie for the (public) allowed login. Set a
  long random value in production.

## Input handling

- Every CMS write body is validated against a JSON schema
  (`apps/server/src/schemas.ts`) with `additionalProperties: false`. Bad input is
  rejected with `400` before it reaches the store.
- All DB access uses parameterized statements (`node:sqlite` prepared
  statements). No SQL is built by string concatenation.
- Prose is stored as text, and the frontend renders only a `**bold**` subset with
  no raw HTML, so stored content can't inject script.
- The contact and guestbook endpoints strip CR/LF from short fields so a name or
  email can't inject extra email headers, and both have a honeypot field and a
  per-IP rate limit.

## Asset uploads

- Authed only. Type allow-list (images, SVG, GIF, PDF, Markdown), an 8 MB cap,
  and images re-encoded through sharp, which discards the original container and
  most metadata. SVGs are sanitized on upload before they can be inlined.
- Identity is the content hash, and served files use generated ids, so a filename
  can't be used for path traversal.

## Transport, CORS, and headers

- CORS allows only `WEB_ORIGIN` (comma-separated) with credentials. `*` is treated
  as public and no-credentials, so don't use it in production if you want the CMS
  to work.
- TLS terminates at the reverse proxy (Let's Encrypt). Because the cookie is
  `secure` and `sameSite=lax`, keep the site and the API same-site (same domain,
  or an `api.` subdomain with the site origin in `WEB_ORIGIN`).
- Every response carries `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, and `Referrer-Policy: no-referrer`. These are
  hand-rolled rather than pulling in helmet, since the API serves JSON and images
  and the surface is small.
- `TRUST_PROXY` is off by default so a directly-exposed server can't be fooled by
  a spoofed `X-Forwarded-*`. Turn it on only behind a trusted proxy, so the
  contact rate limiter sees the real client IP.

## Secrets

- Secrets come from the environment and are never committed. `.env` is
  git-ignored; `.env.example` holds only placeholders. Nothing secret is logged.
- In CI, the tag-driven Release workflow uses the built-in `GITHUB_TOKEN` for GHCR
  and reads `PUBLIC_API_URL` from a repo variable, so the default flow needs no
  long-lived secrets.

## Not in scope, yet

No WAF, no bot management beyond the contact and guestbook honeypots plus rate
limits, no audit log. For a single-user homelab behind a reverse proxy these are
acceptable omissions. Revisit if the site ever turns commercial.
