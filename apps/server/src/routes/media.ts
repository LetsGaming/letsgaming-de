/**
 * Media (PROJECT.md §8). Minimal on purpose: accept an image, resize/optimize it
 * to web-friendly WebP, store it on local disk, hand back a URL. No asset library,
 * no DAM, no plugins. It uploads an image and stops there.
 */

import type { FastifyInstance } from "fastify";
import { createReadStream } from "node:fs";
import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { ServerEnv } from "../env.js";
import { requireAuth } from "../auth/guard.js";

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB in
const MAX_WIDTH = 1400; // downscale anything larger
const ACCEPTED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function registerMediaRoutes(
  app: FastifyInstance,
  env: ServerEnv,
): Promise<void> {
  const dir = resolve(env.mediaDir);
  await mkdir(dir, { recursive: true });

  // Upload (authed): multipart 'file'. Returns { url, filename }.
  app.post("/api/cms/media", { preHandler: requireAuth(env) }, async (req, reply) => {
    const file = await req.file({ limits: { fileSize: MAX_BYTES } });
    if (!file) return reply.code(400).send({ error: "No file uploaded." });
    if (!ACCEPTED.has(file.mimetype)) {
      return reply.code(415).send({ error: `Unsupported type ${file.mimetype}.` });
    }
    const buf = await file.toBuffer();
    if (file.file.truncated) return reply.code(413).send({ error: "File too large." });

    const name = `${randomUUID()}.webp`;
    await sharp(buf)
      .rotate() // honour EXIF orientation
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(join(dir, name));

    return { url: `/media/${name}`, filename: name };
  });

  // List (authed): filenames the owner has uploaded.
  app.get("/api/cms/media", { preHandler: requireAuth(env) }, async () => {
    const files = await readdir(dir).catch(() => []);
    return { files: files.filter((f) => extname(f) === ".webp").map((f) => `/media/${f}`) };
  });

  // Delete (authed). Same filename guard as serving — no traversal possible.
  app.delete<{ Params: { file: string } }>(
    "/api/cms/media/:file",
    { preHandler: requireAuth(env) },
    async (req, reply) => {
      const file = req.params.file;
      if (!/^[a-f0-9-]+\.webp$/i.test(file)) {
        return reply.code(400).send({ error: "Invalid filename." });
      }
      try {
        await unlink(join(dir, file));
      } catch {
        return reply.code(404).send({ error: "Not found." });
      }
      return { ok: true };
    },
  );

  // Serve (public, read-only). Path traversal is blocked by the filename regex.
  app.get<{ Params: { file: string } }>("/media/:file", async (req, reply) => {
    const file = req.params.file;
    if (!/^[a-f0-9-]+\.webp$/i.test(file)) return reply.code(404).send({ error: "Not found." });
    const full = join(dir, file);
    try {
      await stat(full);
    } catch {
      return reply.code(404).send({ error: "Not found." });
    }
    reply.header("Content-Type", "image/webp");
    reply.header("Cache-Control", "public, max-age=31536000, immutable");
    return reply.send(createReadStream(full));
  });
}
