import { applicationIconUrl, assetUrl } from "@lg/core";
import type { Store } from "@lg/db";

/** A game whose image could not be found is looked up again after this long. */
export const GAME_IMAGE_RETRY_MS = 7 * 24 * 60 * 60 * 1000;

const FETCH_TIMEOUT_MS = 8_000;

/** Only Discord's own CDN hosts are fetched or stored, matching the media proxy's
 *  allow-list; an activity-supplied `https://` image elsewhere is ignored. */
const DISCORD_CDN_HOSTS = new Set(["cdn.discordapp.com", "media.discordapp.net"]);

function isDiscordCdn(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && DISCORD_CDN_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

type Probe = "yes" | "no" | "unknown";

/** A rate limit, server error or network failure says nothing about the image,
 *  so it must not be recorded as a miss. */
const transient = (status: number) => status === 429 || status >= 500;

/** Whether `url` serves an image right now. */
async function servesImage(url: string): Promise<Probe> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "image/*" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    void res.body?.cancel();
    if (transient(res.status)) return "unknown";
    return res.ok && (res.headers.get("content-type") ?? "").startsWith("image/") ? "yes" : "no";
  } catch {
    return "unknown";
  }
}

/** The icon URL Discord lists for an application (`null` when it has none, or
 *  `"unknown"` when the lookup itself failed). The `/rpc` endpoint answers
 *  without authentication; it is not part of the documented API. */
async function applicationIcon(applicationId: string): Promise<string | null | "unknown"> {
  try {
    const res = await fetch(
      `https://discord.com/api/v10/applications/${encodeURIComponent(applicationId)}/rpc`,
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
    );
    if (transient(res.status)) return "unknown";
    if (!res.ok) return null;
    const body = (await res.json()) as { icon?: unknown };
    return typeof body.icon === "string" && /^[\w-]+$/.test(body.icon)
      ? applicationIconUrl(applicationId, body.icon)
      : null;
  } catch {
    return "unknown";
  }
}

/**
 * Resolve and persist a Discord-hosted image for games that have none: the
 * activity's own large image first, then the application icon. The first URL
 * that really serves an image is stored; when all definitively do not, the attempt is stamped
 * so it is retried only after {@link GAME_IMAGE_RETRY_MS}.
 */
export async function resolveGameImages(
  store: Store,
  log: (m: string) => void = () => {},
  now = new Date(),
): Promise<number> {
  const nowIso = now.toISOString();
  const pending = store.gameMeta.pendingImages(new Date(now.getTime() - GAME_IMAGE_RETRY_MS).toISOString());

  let resolved = 0;
  for (const game of pending) {
    const candidates: string[] = [];
    const fromActivity = assetUrl({
      application_id: game.applicationId,
      ...(game.largeImage ? { assets: { large_image: game.largeImage } } : {}),
    });
    if (fromActivity && isDiscordCdn(fromActivity)) candidates.push(fromActivity);

    let found: string | null = null;
    let inconclusive = false;
    for (const url of candidates) {
      const probe = await servesImage(url);
      if (probe === "yes") {
        found = url;
        break;
      }
      if (probe === "unknown") inconclusive = true;
    }
    if (!found) {
      const icon = await applicationIcon(game.applicationId);
      if (icon === "unknown") inconclusive = true;
      else if (icon) {
        const probe = await servesImage(icon);
        if (probe === "yes") found = icon;
        else if (probe === "unknown") inconclusive = true;
      }
    }

    // Only a definitive "no image" is stamped; a transient failure leaves the
    // game pending for the next sweep.
    if (!found && inconclusive) continue;
    store.gameMeta.putImage(game.name, found, nowIso);
    if (found) resolved++;
  }
  if (resolved) log(`[game-images] resolved ${resolved} Discord image(s)`);
  return resolved;
}
