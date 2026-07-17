/**
 * Contact relay (PROJECT.md §9). Minimal fields, relays to email, stores NOTHING
 * in the DB — no message archive means little to no personal-data processing.
 * A honeypot field and a coarse in-memory rate limit keep casual spam down.
 */

import { FIELD_LIMITS } from "@lg/core";
import type { FastifyInstance } from "fastify";
import nodemailer from "nodemailer";
import type { ServerEnv } from "../env.js";
import { tooManyRequests, unavailable } from "../errors.js";
import { RATE_LIMIT, RateLimiter } from "../rate-limit.js";

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
    name: { type: "string", minLength: 1, maxLength: FIELD_LIMITS.contactName },
    email: { type: "string", format: "email", maxLength: FIELD_LIMITS.contactEmail },
    message: { type: "string", minLength: 1, maxLength: FIELD_LIMITS.contactMessage },
    website: { type: "string" },
  },
  additionalProperties: false,
} as const;

/** Strip CR/LF so a name/email can't inject extra email headers (DEP-01 defence). */
function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

export function registerContactRoutes(app: FastifyInstance, env: ServerEnv): void {
  const limiter = new RateLimiter({ max: RATE_LIMIT.contact });

  app.post<{ Body: ContactBody }>(
    "/api/contact",
    { schema: { body: bodySchema } },
    async (req, reply) => {
      if (!env.smtp) throw unavailable("Contact is not configured.");

      // Silently accept honeypot hits so bots don't learn.
      if (req.body.website) return { ok: true };

      if (!limiter.allow(req.ip)) {
        throw tooManyRequests("Too many messages — try again later.");
      }

      const transport = nodemailer.createTransport({
        host: env.smtp.host,
        port: env.smtp.port,
        secure: env.smtp.port === 465,
        ...(env.smtp.user ? { auth: { user: env.smtp.user, pass: env.smtp.pass } } : {}),
      });

      const name = oneLine(req.body.name);
      const email = oneLine(req.body.email);
      const { message } = req.body;
      await transport.sendMail({
        from: env.smtp.from,
        to: env.smtp.to,
        // Structured address (not an interpolated string) so nodemailer encodes it.
        replyTo: { name, address: email },
        subject: `letsgaming.de contact — ${name}`,
        text: `From: ${name} <${email}>\n\n${message}`,
      });

      // Nothing persisted. The message exists only in the relayed email.
      return { ok: true };
    },
  );
}
