# Troubleshooting

The things that go wrong, and what they mean. Most are a missing or misread
environment variable; the full list of those is in
[reference/configuration](../reference/configuration.md).

## The site shows placeholder data

No `GITHUB_TOKEN` is set, so the deterministic mock GitHub source is running. Set
a real classic PAT with `read:user`, then re-sync (`docker compose exec server
node dist/sync/cli.js`). Steam and Wakapi are similar but have no mock in
production: if their variables aren't set, those modules simply show nothing.

## CMS login redirects to GitHub, comes back, still logged out

The session cookie isn't being sent. Two usual causes:

- `WEB_ORIGIN=*`. That disables credentialed CORS, so the browser won't send the
  cookie. Set explicit origin(s).
- The site and the API aren't same-site. In production the cookie is `secure` and
  `sameSite=lax`, so it's dropped across unrelated domains. Put the API on an
  `api.` subdomain of the site domain, and include the site origin in
  `WEB_ORIGIN`. See [SECURITY](../SECURITY.md).

## The server refuses to start, complaining about SESSION_SECRET

The CMS is enabled (`CMS_TOKEN` or `GITHUB_OAUTH_CLIENT_ID` is set) but
`SESSION_SECRET` is empty or still the dev default. That's deliberate: it won't
run with a forgeable cookie secret. Set a long random value, for example
`openssl rand -hex 32`.

## Contact returns 503, "not configured"

`SMTP_HOST` and `CONTACT_TO` aren't both set. The contact endpoint stays disabled
until they are.

## The presence widget always shows offline

One of: `DISCORD_USER_ID` isn't set; no presence category is enabled in the CMS
(Widgets, then Presence); or your Discord presence isn't exposed to Lanyard yet.
For the last one, join the Lanyard Discord once (`discord.gg/lanyard`) so your
presence becomes available.

## Traffic analytics stay empty

Engagement stats and traffic stats are separate; if engagement works and traffic
doesn't, it's the log ingest. First check the server can see the log:

```bash
docker compose exec server sh -c 'echo "ACCESS_LOG=[$ACCESS_LOG]"; ls -l "$ACCESS_LOG" 2>&1'
```

An empty `ACCESS_LOG` means the value isn't reaching the container (set it in
`.env`, then `docker compose up -d` to recreate, a restart won't re-read env). A
missing file means `ACCESS_LOG_DIR` isn't mounted or points at the wrong
directory. Also check the log is nginx combined format, and that if the proxy runs
on a different box you've synced its log into `ACCESS_LOG_DIR` first (the container
can't read another host's filesystem). See
[operations/analytics-ingestion](./analytics-ingestion.md).

## A startup warning about node:sqlite being experimental

Harmless. `node:sqlite` is marked experimental in Node and prints a warning on
boot. It's stable in practice on the supported Node versions. This is noted in
[ADR-0009](../adr/0009-sqlite-node-sqlite.md).

## pnpm build fails at the nav lint

The nav tree broke a structural gate: too many children on a level, nested too
deep, a branch with one child, an empty leaf, or a module that's registered but
unplaced (or placed but unregistered). The lint prints which. See
[concepts/information-architecture](../concepts/information-architecture.md).

## Typecheck or test fails right after cloning

`@lg/core` isn't built, and everything imports it. Build it once:
`pnpm --filter @lg/core build`. `pnpm build` and CI do this first.
