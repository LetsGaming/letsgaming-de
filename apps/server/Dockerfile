# Fastify server: read API + CMS API + OAuth + the in-process sync worker (§10).
# Multi-stage: build the whole workspace, prune to prod-only, then run the server.
#
# Uses node:sqlite (built into Node) — no native build, no node-gyp.

FROM node:24-slim AS build
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @lg/core build \
 && pnpm --filter @lg/db build \
 && pnpm --filter @lg/sources build \
 && pnpm --filter @lg/server build
# Prune to a self-contained, prod-only tree: built dist + prod deps (incl. the
# compiled sharp addon) + workspace packages resolved in, and NO dev deps (tsx,
# typescript, vitest, happy-dom). This shrinks the runtime image and keeps
# test-only tooling — and its advisories — out of the deployed container.
# CI=1 keeps pnpm non-interactive; --legacy copies node_modules (these packages
# aren't injected). Needs `files: ["dist"]` on each package so dist is included.
RUN CI=1 pnpm --filter @lg/server --prod deploy --legacy /prod

FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Only the pruned prod tree. The deploy root IS the server package, so the
# entrypoint is dist/index.js (no longer apps/server/dist/index.js).
COPY --from=build --chown=node:node /prod .
# /data is the mounted store+media volume; owning it here means a fresh named
# volume inherits node ownership.
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8787
# The store lives on a mounted volume (see docker-compose.yml).
CMD ["node", "dist/index.js"]
