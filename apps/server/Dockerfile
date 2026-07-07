# Fastify server: read API + CMS API + OAuth + the in-process sync worker (§10).
# Multi-stage: build the whole workspace, then run just the server.
#
# Note on better-sqlite3: with normal internet at build time, pnpm fetches a
# prebuilt binary (no compiler needed). If your registry can't reach the
# prebuilt, add build tools to the build stage:
#   RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++

FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @lg/core build \
 && pnpm --filter @lg/db build \
 && pnpm --filter @lg/sources build \
 && pnpm --filter @lg/server build

FROM node:22-slim AS runtime
WORKDIR /app
RUN corepack enable
ENV NODE_ENV=production
# Copy the built workspace (includes node_modules with the compiled native addon).
COPY --from=build /app .
EXPOSE 8787
# The store lives on a mounted volume (see docker-compose.yml).
CMD ["node", "apps/server/dist/index.js"]
