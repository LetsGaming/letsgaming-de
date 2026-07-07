/**
 * GitHub OAuth for the CMS — single user (PROJECT.md §3, §8). SCAFFOLD.
 *
 * The flow is wired end to end (redirect → code exchange → identity check), but
 * session issuance is intentionally left as the one remaining step: v1 ships with
 * the bearer-token guard (`guard.ts`), and this becomes the login path once a
 * signed-cookie/session plugin is added. Only `oauth.allowedLogin` may enter.
 *
 * To finish: add `@fastify/cookie` + `@fastify/session` (or sign your own JWT),
 * and on a verified callback set the session and have `requireAuth` accept it.
 */

import type { FastifyInstance } from "fastify";
import type { ServerEnv } from "../env.js";
import { SESSION_COOKIE } from "./guard.js";

export function registerOAuthRoutes(app: FastifyInstance, env: ServerEnv): void {
  const { clientId, clientSecret, allowedLogin } = env.oauth;

  app.get("/auth/github/login", async (_req, reply) => {
    if (!clientId) return reply.code(503).send({ error: "OAuth not configured." });
    const params = new URLSearchParams({
      client_id: clientId,
      scope: "read:user",
      allow_signup: "false",
    });
    return reply.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
  });

  app.get<{ Querystring: { code?: string } }>("/auth/github/callback", async (req, reply) => {
    if (!clientId || !clientSecret) return reply.code(503).send({ error: "OAuth not configured." });
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
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
    return reply.redirect(env.webOrigin.split(",")[0] ?? "/");
  });

  app.post("/auth/logout", async (_req, reply) => {
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });
}
