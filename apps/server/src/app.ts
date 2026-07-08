import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify, { type FastifyInstance } from "fastify";
import type { Store } from "@lg/db";
import type { ServerEnv } from "./env.js";
import { registerOAuthRoutes } from "./auth/github-oauth.js";
import { registerAnalyticsRoutes } from "./routes/analytics.js";
import { registerCmsRoutes } from "./routes/cms.js";
import { registerContactRoutes } from "./routes/contact.js";
import { registerGuestbookRoutes } from "./routes/guestbook.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerMediaRoutes } from "./routes/media.js";
import { registerPresenceRoutes } from "./routes/presence.js";
import { registerReadRoutes } from "./routes/read.js";
import { registerTrackRoutes } from "./routes/track.js";

/** Build the Fastify app with all routes registered. Pure — no listening. */
export async function buildApp(store: Store, env: ServerEnv): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? "info" },
    // Behind the homelab reverse proxy, honour X-Forwarded-* so `req.ip` is the
    // real client (the contact rate-limiter keys on it). Off by default so a
    // directly-exposed server can't be fooled by a spoofed header (BUG-01).
    trustProxy: env.trustProxy,
  });

  // Minimal security headers on every response. Kept hand-rolled rather than
  // pulling in helmet — the API serves JSON + images, so the surface is small.
  app.addHook("onSend", async (_req, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "no-referrer");
  });

  // Cookies are signed with the session secret (used for the CMS session).
  await app.register(cookie, { secret: env.sessionSecret });
  await app.register(multipart);

  // Never reflect an arbitrary origin *with credentials* (SEC-02). `*` is treated
  // as "public, no credentials"; the credentialed CMS path requires explicit origins.
  const allowAll = env.webOrigin.trim() === "*";
  if (allowAll) {
    app.log.warn(
      "WEB_ORIGIN=* — CORS credentials are disabled. Set explicit origin(s) for the CMS to work cross-origin.",
    );
  }
  await app.register(cors, {
    origin: allowAll ? true : env.webOrigin.split(",").map((o) => o.trim()),
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: !allowAll,
  });

  registerHealthRoutes(app, store);
  registerReadRoutes(app, store, env);
  registerTrackRoutes(app, store);
  registerContactRoutes(app, env);
  registerGuestbookRoutes(app, store);
  registerPresenceRoutes(app, env, store);
  registerCmsRoutes(app, store, env);
  registerAnalyticsRoutes(app, store, env);
  await registerMediaRoutes(app, env);
  registerOAuthRoutes(app, env);

  return app;
}
