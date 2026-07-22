# syntax=docker/dockerfile:1
# Public site: Nuxt 3 SSR (Nitro node-server). Every request resolves the SiteView
# from the read-only store, so a sync or CMS edit shows up immediately — no rebuild.
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

# --- build: fetch (lockfile-cached) → offline install → build ---
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
#
# The web build also prerenders /docs/** and /datenschutz. Those read repo-root
# files (docs/, openapi.yml) relative to the app dir, which is why the build runs
# with the full workspace present rather than a pruned tree.
RUN pnpm --filter @lg/core build \
 && pnpm --filter @lg/db build \
 && pnpm --filter @lg/web build

# --- runtime: Nitro's self-contained output ---
FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
# Kept at 4321 so docker-compose and any reverse proxy stay unchanged.
ENV PORT=4321
# Nitro traces its own dependencies into .output, so there is no pnpm deploy step
# and no node_modules to prune — the output *is* the deployable.
COPY --from=build --chown=node:node /app/apps/web/.output ./
# Source files the SSR fallback reads when a prerendered page is missed. Paths are
# explicit rather than cwd-relative, because the server starts from this dir.
COPY --from=build --chown=node:node /app/docs /docs
COPY --from=build --chown=node:node /app/openapi.yml /openapi.yml
ENV DOCS_DIR=/docs
ENV OPENAPI_PATH=/openapi.yml
USER node
EXPOSE 4321
CMD ["node", "server/index.mjs"]
