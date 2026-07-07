/**
 * CMS auth.
 *
 * Two ways in, both landing on the single allowed identity:
 *   1. A signed session cookie set by the GitHub OAuth flow (the CMS UI uses this).
 *   2. A bearer token (CMS_TOKEN) — handy for scripts and first setup.
 *
 * If neither a token nor OAuth is configured, the CMS API fails closed.
 */

import type { FastifyReply, FastifyRequest } from "fastify";
import type { ServerEnv } from "../env.js";

export const SESSION_COOKIE = "lg_session";

/** Timing-safe-ish string compare (length then value). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** The login the current request is authenticated as, or null. */
export function sessionLogin(req: FastifyRequest, env: ServerEnv): string | null {
  // 1. Signed session cookie.
  const raw = req.cookies?.[SESSION_COOKIE];
  if (raw) {
    const unsigned = req.unsignCookie(raw);
    if (unsigned.valid && unsigned.value) return unsigned.value;
  }
  // 2. Bearer token.
  if (env.cmsToken) {
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (token && safeEqual(token, env.cmsToken)) return env.oauth.allowedLogin;
  }
  return null;
}

export function requireAuth(env: ServerEnv) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!env.cmsToken && !env.oauth.clientId) {
      await reply.code(503).send({ error: "CMS is not configured." });
      return;
    }
    if (!sessionLogin(req, env)) {
      await reply.code(401).send({ error: "Unauthorized." });
      return;
    }
  };
}
