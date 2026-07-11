/**
 * CMS auth.
 *
 * Two ways in, both landing on the single allowed identity:
 *   1. A signed session cookie set by the GitHub OAuth flow (the CMS UI uses this).
 *   2. A bearer token (CMS_TOKEN) — handy for scripts and first setup.
 *
 * If neither a token nor OAuth is configured, the CMS API fails closed.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { ServerEnv } from "../env.js";
import { unauthorized, unavailable } from "../errors.js";

export const SESSION_COOKIE = "lg_session";

/**
 * Constant-time secret compare. Both sides are hashed to a fixed-length digest
 * first, so the compare never short-circuits on length (no length/prefix leak),
 * and `timingSafeEqual` requires equal-length buffers (guaranteed by hashing).
 */
function secretEquals(a: string, b: string): boolean {
  const ah = createHash("sha256").update(a, "utf8").digest();
  const bh = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ah, bh);
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
    if (token && secretEquals(token, env.cmsToken)) return env.oauth.allowedLogin;
  }
  return null;
}

export function requireAuth(env: ServerEnv) {
  return async (req: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (!env.cmsToken && !env.oauth.clientId) {
      throw unavailable("CMS is not configured.");
    }
    if (!sessionLogin(req, env)) {
      throw unauthorized();
    }
  };
}
