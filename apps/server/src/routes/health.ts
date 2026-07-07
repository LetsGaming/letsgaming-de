import type { Store } from "@lg/db";
import type { FastifyInstance } from "fastify";

export function registerHealthRoutes(app: FastifyInstance, store: Store): void {
  app.get("/health", async () => ({
    status: "ok",
    lastSync: store.source.latestSyncedAt() ?? null,
    time: new Date().toISOString(),
  }));
}
