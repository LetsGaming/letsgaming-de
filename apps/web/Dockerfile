# Public site: Astro SSR (Node standalone). Every request resolves the SiteView
# from the read API, so a sync or CMS edit shows up immediately — no rebuild.
#
# Two API URLs, by design:
#   API_URL        (runtime, server-side)  — how SSR reaches the API (internal).
#   PUBLIC_API_URL (build-time, client)    — how the browser reaches the API, and
#                                            is baked into the CMS/client bundle.

FROM node:24-slim AS build
WORKDIR /app
RUN corepack enable
ARG PUBLIC_API_URL=""
ENV PUBLIC_API_URL=$PUBLIC_API_URL
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @lg/core build && pnpm --filter @lg/web build
# Prune to a prod-only tree: built dist + prod deps, no dev tooling (vitest,
# happy-dom, @vitejs/plugin-vue, @astrojs/check, typescript). CI=1 keeps pnpm
# non-interactive; --legacy copies node_modules. Needs `files: ["dist"]` on the
# web package so the built dist is included in the deploy.
RUN CI=1 pnpm --filter @lg/web --prod deploy --legacy /prod

FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321
# Only the pruned prod tree. The deploy root IS the web package, so the entry is
# dist/server/entry.mjs (no longer apps/web/dist/server/entry.mjs).
COPY --from=build --chown=node:node /prod .
USER node
EXPOSE 4321
CMD ["node", "dist/server/entry.mjs"]
