/**
 * GitHub OAuth for the CMS — single user (PROJECT.md §3, §8).
 *
 * The full login path: redirect to GitHub → exchange the code → verify the
 * identity is `oauth.allowedLogin` → issue a signed, http-only session cookie
 * that `guard.ts` accepts. A signed, single-use `state` cookie protects the
 * round-trip against login CSRF. Only the one allowed login may enter.
 */

import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { ServerEnv } from "../env.js";
import { SESSION_COOKIE } from "./guard.js";

const STATE_COOKIE = "lg_oauth_state";

export function registerOAuthRoutes(app: FastifyInstance, env: ServerEnv): void {
  const { clientId, clientSecret, allowedLogin } = env.oauth;
  const secureCookie = process.env.NODE_ENV === "production";

  app.get("/auth/github/login", async (_req, reply) => {
    if (!clientId) return reply.code(503).send({ error: "OAuth not configured." });

    // CSRF: mint a random state, remember it in a short-lived signed cookie, and
    // require it back on the callback.
    const state = randomUUID();
    reply.setCookie(STATE_COOKIE, state, {
      signed: true,
      httpOnly: true,
      sameSite: "lax",
      secure: secureCookie,
      path: "/",
      maxAge: 600, // 10 minutes to complete the flow
    });

    const params = new URLSearchParams({
      client_id: clientId,
      scope: "read:user",
      allow_signup: "false",
      state,
    });
    return reply.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
  });

  app.get<{ Querystring: { code?: string; state?: string } }>(
    "/auth/github/callback",
    async (req, reply) => {
      if (!clientId || !clientSecret) return reply.code(503).send({ error: "OAuth not configured." });

      // Verify state against the signed cookie, then consume it.
      const raw = req.cookies?.[STATE_COOKIE];
      const unsigned = raw ? req.unsignCookie(raw) : { valid: false, value: null };
      reply.clearCookie(STATE_COOKIE, { path: "/" });
      if (!unsigned.valid || !unsigned.value || unsigned.value !== req.query.state) {
        return reply.code(400).send({ error: "Invalid OAuth state." });
      }

      const code = req.query.code;
      if (!code) return reply.code(400).send({ error: "Missing code." });

      // Exchange the code for an access token.
      const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
      });
      const token = (await tokenRes.json()) as { access_token?: string };
      if (!token.access_token) return reply.code(401).send({ error: "Token exchange failed." });

      // Verify identity — only the single allowed login may proceed.
      const userRes = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `bearer ${token.access_token}`,
          "User-Agent": "letsgaming.de-cms",
        },
      });
      const user = (await userRes.json()) as { login?: string };
      if (user.login?.toLowerCase() !== allowedLogin.toLowerCase()) {
        return reply.code(403).send({ error: "Not authorized for this CMS." });
      }

      // Issue a signed, http-only session cookie. The CMS UI sends it automatically.
      reply.setCookie(SESSION_COOKIE, user.login, {
        signed: true,
        httpOnly: true,
        sameSite: "lax",
        secure: secureCookie,
        path: "/",
        maxAge: 60 * 60 * 24 * 30, // 30 days
      });
      return reply.redirect(env.webOrigin.split(",")[0] ?? "/");
    },
  );

  app.post("/auth/logout", async (_req, reply) => {
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });
}
