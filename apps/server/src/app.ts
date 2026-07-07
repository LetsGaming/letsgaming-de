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
import { registerHealthRoutes } from "./routes/health.js";
import { registerMediaRoutes } from "./routes/media.js";
import { registerReadRoutes } from "./routes/read.js";

/** Build the Fastify app with all routes registered. Pure — no listening. */
export async function buildApp(store: Store, env: ServerEnv): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" } });

  // Cookies are signed with the session secret (used for the CMS session).
  await app.register(cookie, { secret: env.sessionSecret });
  await app.register(multipart);
  await app.register(cors, {
    origin: env.webOrigin === "*" ? true : env.webOrigin.split(","),
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true, // the CMS UI sends the session cookie cross-origin
  });

  registerHealthRoutes(app, store);
  registerReadRoutes(app, store);
  registerContactRoutes(app, env);
  registerCmsRoutes(app, store, env);
  registerAnalyticsRoutes(app, store, env);
  await registerMediaRoutes(app, env);
  registerOAuthRoutes(app, env);

  return app;
}
