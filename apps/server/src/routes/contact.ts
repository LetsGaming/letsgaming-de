/**
 * Contact relay (PROJECT.md §9). Minimal fields, relays to email, stores NOTHING
 * in the DB — no message archive means little to no personal-data processing.
 * A honeypot field and a coarse in-memory rate limit keep casual spam down.
 */

import type { FastifyInstance } from "fastify";
import nodemailer from "nodemailer";
import type { ServerEnv } from "../env.js";

interface ContactBody {
  name: string;
  email: string;
  message: string;
  /** Honeypot — real users leave this empty. */
  website?: string;
}

const bodySchema = {
  type: "object",
  required: ["name", "email", "message"],
  properties: {
    name: { type: "string", minLength: 1, maxLength: 120 },
    email: { type: "string", format: "email", maxLength: 200 },
    message: { type: "string", minLength: 1, maxLength: 5000 },
    website: { type: "string" },
  },
  additionalProperties: false,
} as const;

/** Naive per-IP limiter: max 5 messages / 10 min, in memory (single process). */
class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(
    private readonly max = 5,
    private readonly windowMs = 10 * 60 * 1000,
  ) {}
  allow(key: string): boolean {
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }
}

export function registerContactRoutes(app: FastifyInstance, env: ServerEnv): void {
  const limiter = new RateLimiter();

  app.post<{ Body: ContactBody }>(
    "/api/contact",
    { schema: { body: bodySchema } },
    async (req, reply) => {
      if (!env.smtp) return reply.code(503).send({ error: "Contact is not configured." });

      // Silently accept honeypot hits so bots don't learn.
      if (req.body.website) return { ok: true };

      if (!limiter.allow(req.ip)) {
        return reply.code(429).send({ error: "Too many messages — try again later." });
      }

      const transport = nodemailer.createTransport({
        host: env.smtp.host,
        port: env.smtp.port,
        secure: env.smtp.port === 465,
        ...(env.smtp.user ? { auth: { user: env.smtp.user, pass: env.smtp.pass } } : {}),
      });

      const { name, email, message } = req.body;
      await transport.sendMail({
        from: env.smtp.from,
        to: env.smtp.to,
        replyTo: `${name} <${email}>`,
        subject: `letsgaming.de contact — ${name}`,
        text: `From: ${name} <${email}>\n\n${message}`,
      });

      // Nothing persisted. The message exists only in the relayed email.
      return { ok: true };
    },
  );
}
