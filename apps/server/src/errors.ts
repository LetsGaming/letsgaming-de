/**
 * One place to turn failures into HTTP responses. Routes (and the auth guard)
 * throw a typed `AppError` instead of hand-building `reply.code(n).send(...)`
 * everywhere; the single error handler maps it to a status + safe body, and turns
 * anything unexpected into a 500 that never leaks internals or a stack trace.
 */

import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

export class AppError extends Error {
  /**
   * @param statusCode HTTP status to send.
   * @param expose     When false, the message is hidden behind a generic reply
   *                   (use for messages that might reveal internals).
   */
  constructor(
    readonly statusCode: number,
    message: string,
    readonly expose = true,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (message: string): AppError => new AppError(400, message);
export const unauthorized = (message = "Unauthorized."): AppError => new AppError(401, message);
export const notFound = (message = "Not found."): AppError => new AppError(404, message);
export const payloadTooLarge = (message = "File too large."): AppError => new AppError(413, message);
export const unsupportedMedia = (message: string): AppError => new AppError(415, message);
export const tooManyRequests = (message: string): AppError => new AppError(429, message);
export const unavailable = (message: string): AppError => new AppError(503, message);

/** Register the single error handler. Call once during app build. */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError, req: FastifyRequest, reply: FastifyReply) => {
    // Schema validation failures → 400 with a safe, generic message.
    if (err.validation) {
      return reply.code(400).send({ error: "Invalid request." });
    }

    if (err instanceof AppError) {
      return reply.code(err.statusCode).send({ error: err.expose ? err.message : "Request failed." });
    }

    const status = err.statusCode ?? 500;
    if (status >= 500) {
      // Log the real error server-side; never send internals to the client.
      req.log.error({ err }, "unhandled error");
      return reply.code(status).send({ error: "Internal server error." });
    }
    // Known 4xx from Fastify (e.g. body too large) — its message is safe to surface.
    return reply.code(status).send({ error: err.message });
  });
}
