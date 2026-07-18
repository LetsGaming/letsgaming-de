# syntax=docker/dockerfile:1
# Fastify server: read API + CMS API + OAuth + the in-process sync worker (§10).
# Multi-stage: build the whole workspace, prune to prod-only, then run the server.
# Uses node:sqlite (built into Node) — no native build, no node-gyp.

# --- base: toolchain shared by the build stages; store lives at /pnpm/store ---
FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

# --- build: fetch (lockfile-cached) → offline install → build → prune to /prod ---
FROM base AS build
# Populate the store from the lockfile alone. This layer is cached until
# pnpm-lock.yaml changes — source edits never reach it, so no re-download.
COPY pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm fetch
# Now the source; install runs fully offline off the warm store.
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --offline --frozen-lockfile
# core → db → sources → server (each dep built before its consumer).
RUN pnpm --filter @lg/core build \
 && pnpm --filter @lg/db build \
 && pnpm --filter @lg/sources build \
 && pnpm --filter @lg/server build
# Prune to a self-contained, prod-only tree: built dist + prod deps (incl. the
# compiled sharp addon), workspace packages resolved in, NO dev deps (tsx,
# typescript, vitest, happy-dom). CI=1 keeps pnpm non-interactive; --legacy copies
# node_modules. Needs `files: ["dist"]` on each package so dist is included.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    CI=1 pnpm --filter @lg/server --prod deploy --legacy /prod

# --- runtime: only the pruned prod tree, no pnpm/corepack in the shipped image ---
FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# The deploy root IS the server package, so the entrypoint is dist/index.js.
COPY --from=build --chown=node:node /prod .
# /data is the mounted store+media volume; owning it here means a fresh named
# volume inherits node ownership.
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8787
CMD ["node", "dist/index.js"]
