# Security & privacy

This is a single-user personal site on a homelab. The threat model is modest, but
the CMS writes to disk and the site processes visitor requests, so a few things
matter.

## Authentication (CMS)

- Two ways in, both resolving to the single allowed identity: a **signed,
  http-only session cookie** issued by GitHub OAuth, or a **bearer `CMS_TOKEN`**.
- OAuth only admits `CMS_ALLOWED_LOGIN`; any other GitHub user gets `403`.
- The session cookie is signed with `SESSION_SECRET`, `httpOnly`, `sameSite=lax`,
  and `secure` in production. **Set a long random `SESSION_SECRET` in prod** — the
  dev default is intentionally insecure and must not ship.
- Token comparison is length-checked then constant-time-ish to avoid trivial
  timing leaks.
- **Fails closed:** if neither `CMS_TOKEN` nor OAuth is configured, every CMS write
  returns `503`. There is no open state.

## Input handling

- Every CMS write body is validated against a JSON schema
  (`apps/server/src/schemas.ts`) with `additionalProperties: false`; bad input is
  rejected with `400` before it reaches the store.
- All DB access uses parameterized statements (node:sqlite prepared
  statements) — no string-built SQL.
- Prose is stored as text; the frontend renders only a `**bold**` subset and never
  injects raw HTML, so stored content can't inject script.

## Media uploads

- Authed only. Type allow-list (JPEG/PNG/WebP/GIF), 8 MB cap, re-encoded to WebP
  via sharp (which discards the original container and most metadata).
- Filenames are server-generated UUIDs; the public serve route validates the name
  against `^[a-f0-9-]+\.webp$`, blocking path traversal.

## Transport & CORS

- CORS allows only `WEB_ORIGIN` (comma-separated) with credentials; avoid `*` in
  production since credentials are involved.
- TLS terminates at the reverse proxy (Let's Encrypt). Keep the API and site on
  origins that satisfy the cookie's `sameSite`/`secure` needs (same site, or an
  `api.` subdomain with the site origin in `WEB_ORIGIN`).

## Secrets

- Secrets come from the environment, never committed (`.env` is git-ignored;
  `.env.example` holds only placeholders).
- In CI, the Docker workflow uses the built-in `GITHUB_TOKEN` for GHCR and reads
  `PUBLIC_API_URL` from a repo variable — no long-lived secrets required for the
  default flow.

## Privacy posture (§9)

Privacy by omission — if collecting data risks liability, it isn't collected.

- **Analytics** parses the reverse-proxy access log into anonymous per-day counts.
  The IP is dropped at parse time and never stored; there are no cookies, no
  identifiers, and no per-visitor rows. A regression test asserts the IP never
  appears in parsed output.
- **Contact** relays to email and persists nothing — no message archive.
- **Fonts are self-hosted** (Fontsource); no request leaves the user's browser to a
  third party, so there's no IP leak and no consent burden.
- A static **Datenschutzerklärung** ships at `/datenschutz`. There is deliberately
  **no Impressum** — a documented, eyes-open risk acceptance (see PROJECT.md §9).

## Not in scope (yet)

No WAF, no bot management beyond the contact honeypot + rate limit, no audit log.
For a single-user homelab behind a reverse proxy, these are acceptable omissions;
revisit if the site ever turns commercial.
