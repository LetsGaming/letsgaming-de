/**
 * Dominant colour of a Steam game's icon, sampled at sync.
 *
 * Rule: colour is imported, never invented. A game's bar should be the colour of
 * that game — Steam already ships the art, so a house palette slot would be
 * inventing an answer that already exists.
 *
 * Cheap by construction: at most six 32×32 icons per sync, downscaled to a single
 * pixel, which is an average rather than a clustering pass. A failure returns
 * undefined and the bar falls back to neutral — a missing icon shouldn't cost a
 * sync, and a guessed colour is worse than no colour.
 */
import sharp from "sharp";

const TIMEOUT_MS = 3_000;
/** Below this, a colour is mud and won't read on --surf-1 or against its
 *  neighbours; let the neutral fallback take it instead of shipping sludge. */
const MIN_SATURATION = 0.12;

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;
}

function saturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  if (max === min) return 0;
  return l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
}

export async function sampleAccent(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return undefined;
    const buf = Buffer.from(await res.arrayBuffer());
    // Resize to 1×1: sharp's area average, which for game icons tracks the
    // dominant colour closely enough and costs a fraction of a k-means pass.
    const { data } = await sharp(buf).resize(1, 1, { fit: "fill" }).raw().toBuffer({
      resolveWithObject: true,
    });
    const [r, g, b] = [data[0] ?? 0, data[1] ?? 0, data[2] ?? 0];
    if (saturation(r, g, b) < MIN_SATURATION) return undefined;
    return toHex(r, g, b);
  } catch {
    return undefined;
  }
}
