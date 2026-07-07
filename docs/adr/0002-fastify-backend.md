# 0002 — Fastify for the backend

**Status:** Accepted · 2026 · (PROJECT.md §13.1)

## Context
The backend hosts the read API, the CMS API, OAuth, and the sync worker. It needs
schema-first validation and a clean plugin model for the modular-source design,
and it must be TS-native.

## Decision
Fastify over Express. Its JSON-schema validation guards CMS writes, and its plugin
model fits the modular structure. One process runs API + CMS + the sync worker.

## Consequences
- Request validation is declarative and rejects bad input before handlers run.
- The whole backend is one deployable/container, simple for a homelab.
- Express middleware isn't drop-in reusable; acceptable given the small surface.
