/**
 * A one-click CMS login for local development — never for production.
 *
 * The real way in is GitHub OAuth (`github-oauth.ts`), which needs a registered
 * OAuth app and a round-trip to github.com. That's a lot of ceremony when the
 * thing you actually want is to look at the editor on localhost. This mints the
 * same signed session cookie directly.
 *
 * It is an authentication bypass, so it is written to be impossible to reach in a
 * deployed environment. Three independent guards, any one of which is sufficient:
 *
 *   1. The route is never registered when `NODE_ENV=production`. Not a check
 *      inside the handler — the endpoint does not exist, so there is nothing to
 *      probe, misconfigure past, or forget to check. Both Dockerfiles set
 *      `NODE_ENV=production`, so the deployed server never has this route.
 *   2. The handler serves loopback callers only. Even if a non-production build
 *      were somehow exposed, the bypass is unreachable from another machine.
 *   3. It mints an ordinary session cookie, signed with `SESSION_SECRET`. It
 *      grants nothing the cookie doesn't already grant, and `assertSecureConfig`
 *      still refuses to boot with a default or empty signing secret.
 *
 * It also logs a warning on registration: a bypass that enables itself quietly is
 * the kind that ends up somewhere it shouldn't.
 *
 * Note this does not weaken `requireAuth`, which still fails closed when the CMS
 * isn't configured — so a local `.env` needs `SESSION_SECRET` plus one of
 * `CMS_TOKEN` / the OAuth pair for the CMS API to answer at all.
 */

import type { FastifyInstance } from "fastify";
import type { ServerEnv } from "../env.js";
import { SESSION_COOKIE } from "./guard.js";

/** IPv4 loopback, IPv6 loopback, and IPv4-mapped-IPv6 loopback. */
const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

export function registerDevLoginRoutes(app: FastifyInstance, env: ServerEnv): void {
  // Guard 1 — the route simply does not exist in production.
  if (env.isProduction) return;

  app.get("/auth/dev/login", async (req, reply) => {
    // Guard 2 — loopback callers only.
    if (!LOOPBACK.has(req.ip)) {
      return reply.code(403).send({ error: "Dev login is available on loopback only." });
    }

    // The identity the guard would grant after a real OAuth round-trip. Falls back
    // to a placeholder when no allowed login is configured, so the button works on
    // a bare checkout.
    const login = env.oauth.allowedLogin || "dev";

    reply.setCookie(SESSION_COOKIE, login, {
      signed: true,
      httpOnly: true,
      sameSite: "lax",
      secure: false, // dev is plain http; a Secure cookie would never be sent
      path: "/",
      maxAge: 60 * 60 * 8, // a working day, not OAuth's 30 days
    });

    const origin = env.webOrigin.split(",")[0] ?? "/";
    return reply.redirect(`${origin}/admin`);
  });

  app.log.warn(
    "[auth] DEV LOGIN ENABLED at /auth/dev/login — non-production, loopback only. " +
      "This route is not registered when NODE_ENV=production.",
  );
}
