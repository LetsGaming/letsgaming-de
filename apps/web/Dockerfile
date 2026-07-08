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

FROM node:24-slim AS runtime
WORKDIR /app
RUN corepack enable
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321
COPY --from=build --chown=node:node /app .
USER node
EXPOSE 4321
CMD ["node", "apps/web/dist/server/entry.mjs"]
