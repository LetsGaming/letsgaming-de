# syntax=docker/dockerfile:1
# Public site: Astro SSR (Node standalone). Every request resolves the SiteView
# from the read API, so a sync or CMS edit shows up immediately — no rebuild.
#
# Two API URLs, by design:
#   API_URL        (runtime, server-side) — how SSR reaches the API (internal).
#   PUBLIC_API_URL (build-time, client)   — baked into the CMS/client bundle.

# --- base: shared toolchain; store at /pnpm/store ---
FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

# --- build: fetch (lockfile-cached) → offline install → build → prune to /prod ---
FROM base AS build
# Fetch first so PUBLIC_API_URL changes below can't invalidate it.
COPY pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm fetch
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --offline --frozen-lockfile
# Client-facing API URL, baked into the browser bundle. Declared here — after
# install — so changing it re-runs only the build, not fetch/install.
ARG PUBLIC_API_URL=""
ENV PUBLIC_API_URL=$PUBLIC_API_URL
# core → db → web. SSR reads the store directly (imports @lg/db, whose exports
# point at dist/), so @lg/db must be built before vite resolves it; @lg/db imports
# @lg/core, hence core → db → web.
RUN pnpm --filter @lg/core build \
 && pnpm --filter @lg/db build \
 && pnpm --filter @lg/web build
# Prune to a prod-only tree: built dist + prod deps, no dev tooling (vitest,
# happy-dom, @vitejs/plugin-vue, @astrojs/check, typescript). Needs
# `files: ["dist"]` on the web package so the built dist is included.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    CI=1 pnpm --filter @lg/web --prod deploy --legacy /prod

# --- runtime: only the pruned prod tree ---
FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321
# The deploy root IS the web package, so the entry is dist/server/entry.mjs.
COPY --from=build --chown=node:node /prod .
USER node
EXPOSE 4321
CMD ["node", "dist/server/entry.mjs"]
