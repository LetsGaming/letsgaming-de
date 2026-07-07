# Documentation

Everything about letsgaming.de beyond the top-level [README](../README.md).

## Start here

- [**PROJECT.md**](./PROJECT.md) — the locked spec: every decision and why.
- [**ARCHITECTURE.md**](./ARCHITECTURE.md) — the seams, package roles, and the
  playbooks for adding a source / module / nav node.

## Reference

- [**CONFIGURATION.md**](./CONFIGURATION.md) — every environment variable, its
  default, and what it does.
- [**API.md**](./API.md) — the HTTP API: read, CMS, media, contact, analytics,
  auth. Request/response shapes and status codes.
- [**DATA-MODEL.md**](./DATA-MODEL.md) — the store schema, the content model, and
  the normalized source shapes.
- [**SECURITY.md**](./SECURITY.md) — the auth model, secret handling, upload
  safety, CORS, and the privacy/GDPR posture.

## Operations

- [**DEPLOYMENT.md**](./DEPLOYMENT.md) — homelab Docker, reverse proxy, TLS,
  analytics ingestion, and backups.
- [**CONTRIBUTING.md**](./CONTRIBUTING.md) — dev setup, conventions, pre-push
  checklist.

## Decisions

- [**adr/**](./adr/) — Architecture Decision Records. Short, dated notes on the
  choices that were expensive to reverse, with context and consequences.

## Per-package docs

Each workspace has its own README:
[`core`](../packages/core/README.md) ·
[`db`](../packages/db/README.md) ·
[`sources`](../packages/sources/README.md) ·
[`server`](../apps/server/README.md) ·
[`web`](../apps/web/README.md)
