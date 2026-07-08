/**
 * Discord presence (Lanyard) — the live half of the activity widget.
 *
 * Lanyard streams *everything* Discord sees. This module is the curation layer:
 * a pure `normalizePresence(raw, show)` maps Lanyard's raw activities into a small,
 * friendly shape and keeps only the categories the owner enabled — so "disable
 * music" or "only games" is a config choice, not a code change. The live socket
 * lives in the web island; the Steam "what I actually play" half is a separate,
 * server-synced source folded in alongside.
 */

/** Display categories the owner can toggle. `steam` gates the synced Steam section. */
export type PresenceCategory = "game" | "streaming" | "music" | "watching" | "custom" | "steam";

export const PRESENCE_CATEGORIES: readonly PresenceCategory[] = [
  "game",
  "streaming",
  "music",
  "watching",
  "custom",
  "steam",
];

/** CMS-owned presence config: which categories the widget may reveal. */
export interface PresenceSettings {
  show: PresenceCategory[];
}

/** Sensible starting allow-list; used to seed the store and as a fallback. */
export function defaultPresenceSettings(): PresenceSettings {
  return { show: ["game", "streaming", "music", "custom", "steam"] };
}

/** Keep only valid, de-duplicated categories (guards CMS input + stored rows). */
export function sanitizePresenceShow(input: unknown): PresenceCategory[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<PresenceCategory>();
  for (const v of input) {
    if (typeof v === "string" && (PRESENCE_CATEGORIES as readonly string[]).includes(v)) {
      seen.add(v as PresenceCategory);
    }
  }
  return [...seen];
}

export type DiscordStatus = "online" | "idle" | "dnd" | "offline";

/** The subset of Lanyard's payload we read. */
export interface LanyardActivity {
  type: number; // 0 Playing, 1 Streaming, 2 Listening, 3 Watching, 4 Custom, 5 Competing
  name: string;
  state?: string;
  details?: string;
  application_id?: string;
  emoji?: { name?: string };
  timestamps?: { start?: number; end?: number };
  assets?: { large_image?: string; large_text?: string };
}
export interface LanyardData {
  discord_status?: DiscordStatus;
  activities?: LanyardActivity[];
  listening_to_spotify?: boolean;
  spotify?: { song: string; artist: string; album?: string; album_art_url?: string };
}

/** One curated presence card, ready to render. */
export interface PresenceCard {
  category: Exclude<PresenceCategory, "steam">;
  title: string;
  subtitle?: string;
  image?: string;
  /** Start time (ms epoch) for an "elapsed" display, if known. */
  since?: number;
}

export interface PresenceView {
  status: DiscordStatus;
  cards: PresenceCard[];
}

const TYPE_TO_CATEGORY: Record<number, Exclude<PresenceCategory, "steam">> = {
  0: "game",
  1: "streaming",
  2: "music",
  3: "watching",
  4: "custom",
};

/** Best-effort resolve a Lanyard asset image ref to a URL (common cases only). */
function assetUrl(a: LanyardActivity): string | undefined {
  const img = a.assets?.large_image;
  if (!img) return undefined;
  if (img.startsWith("mp:external/")) return `https://media.discordapp.net/${img.slice(3)}`;
  if (/^https?:\/\//.test(img)) return img;
  if (a.application_id && /^[0-9]+$/.test(img)) {
    return `https://cdn.discordapp.com/app-assets/${a.application_id}/${img}.png`;
  }
  return undefined;
}

/**
 * Map Lanyard data to a filtered PresenceView. `show` is the owner's allow-list
 * of categories; anything not in it is dropped. Spotify is surfaced as a single
 * `music` card (Lanyard duplicates it as an activity, so we de-dupe). Pure.
 */
export function normalizePresence(
  data: LanyardData,
  show: readonly PresenceCategory[],
): PresenceView {
  const allow = new Set(show);
  const status: DiscordStatus = data.discord_status ?? "offline";
  const cards: PresenceCard[] = [];

  // Music: prefer the structured Spotify object (one clean card).
  if (allow.has("music") && data.listening_to_spotify && data.spotify) {
    cards.push({
      category: "music",
      title: data.spotify.song,
      subtitle: data.spotify.album
        ? `${data.spotify.artist} · ${data.spotify.album}`
        : data.spotify.artist,
      ...(data.spotify.album_art_url ? { image: data.spotify.album_art_url } : {}),
    });
  }

  for (const a of data.activities ?? []) {
    const category = TYPE_TO_CATEGORY[a.type];
    if (!category || !allow.has(category)) continue;
    if (category === "music") continue; // already handled via the Spotify object

    if (category === "custom") {
      const text = [a.emoji?.name, a.state].filter(Boolean).join(" ").trim();
      if (text) cards.push({ category, title: text });
      continue;
    }

    cards.push({
      category,
      title: a.name,
      ...(a.details || a.state ? { subtitle: [a.details, a.state].filter(Boolean).join(" — ") } : {}),
      ...(assetUrl(a) ? { image: assetUrl(a) } : {}),
      ...(a.timestamps?.start ? { since: a.timestamps.start } : {}),
    });
  }

  return { status, cards };
}
