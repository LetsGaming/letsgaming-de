/**
 * Preview tokens for draft posts.
 *
 * A draft is 404 to the public and readable with a secret link. The obvious
 * implementation puts the token in the post's frontmatter — and that writes a
 * secret into a content file, which gets committed the moment the blog moves to
 * a repo subdir. The portability the frontmatter decision buys would leak the
 * thing that guards the drafts.
 *
 * So the token is derived, not stored: HMAC(slug, secret) with a server-side
 * secret. Nothing to leak, nothing to migrate, and rotating the env var revokes
 * every outstanding link at once. Comparison is constant-time — a preview token
 * is a bearer credential, and leaking it a byte at a time via response timing is
 * a real (if unglamorous) way to lose one.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** Short enough to paste, long enough that guessing is hopeless (96 bits). */
const TOKEN_BYTES = 12;

export function previewToken(slug: string, secret: string): string {
  return createHmac("sha256", secret).update(slug).digest("hex").slice(0, TOKEN_BYTES * 2);
}

export function isValidPreviewToken(
  slug: string,
  secret: string | undefined,
  candidate: string | undefined,
): boolean {
  if (!secret || !candidate) return false;
  const expected = Buffer.from(previewToken(slug, secret));
  const given = Buffer.from(candidate);
  // timingSafeEqual throws on length mismatch, which would itself be a timing
  // signal; check length first and bail identically.
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}
