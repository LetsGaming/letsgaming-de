#!/usr/bin/env -S node --import tsx
/**
 * Seeds an already-migrated store (see `scripts/dev-up.mjs` at the repo root)
 * with realistic mock data for everything the server itself doesn't already
 * populate on boot.
 *
 * `openStore()` (called from `apps/server/src/index.ts` on every boot) already
 * handles the baseline: schema migrations, the launch `site_content`/`site_ia`
 * seed (`seedIfEmpty`), and — since `NODE_ENV` isn't `production` in dev — the
 * sync worker's deterministic GitHub/Wakapi mocks (`useMocks: !isProduction` in
 * `sync/runner.ts`), which populate repos, languages, the contribution graph,
 * and coding-time. None of that needs redoing here.
 *
 * What's left is the data that only ever arrives from a live Discord/Lanyard
 * connection (`PresenceSampler`) or a real visitor (the guestbook form) — both
 * unreachable in an offline dev session:
 *   - `presence_sessions` (game/streaming/custom activity) — the Played module,
 *     its heatmap, and Wrapped's game rankings.
 *   - `music_plays` (Spotify listening) — the Listening module and Wrapped's
 *     music rankings.
 *   - `guestbook` — a mix of approved (public pagination) and pending
 *     (moderation queue) entries.
 *
 * Meant to run once against a freshly created dev database — dev-up.mjs always
 * starts from an empty file — so it doesn't check for existing rows first.
 *
 * Usage: DB_PATH=<path> tsx scripts/seed-mock-data.ts
 */
import { openStore, type Store } from "@lg/db";
import { GuestbookStatus, type MusicPlay, type PresenceCategory } from "@lg/core";

const dbPath = process.env.DB_PATH;
if (!dbPath) {
  console.error("seed-mock-data: DB_PATH is not set.");
  process.exit(1);
}

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** Deterministic-ish PRNG (mulberry32) so re-running produces the same-shaped
 *  data — makes a seeded session reproducible for screenshots/bug reports. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20260908);
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!;
const int = (min: number, max: number): number => min + Math.floor(rand() * (max - min + 1));

function seedGuestbook(store: Store): void {
  const entries: { name: string; message: string; approve: boolean }[] = [
    { name: "Mara K.", message: "Love the new site — the code section is so clean!", approve: true },
    { name: "Jonas", message: "Zufällig hier gelandet, aber richtig schön gemacht. Weiter so!", approve: true },
    { name: "Priya", message: "The presence widget is such a fun little detail.", approve: true },
    { name: "Tobi", message: "Grüße aus Köln 👋 schönes Home-Lab-Setup!", approve: true },
    { name: "Sam R.", message: "Found your plantcare-tracker repo, exactly what I needed as a reference.", approve: true },
    { name: "Lena", message: "Die Gästebuch-Funktion ist ein netter Retro-Touch.", approve: true },
    { name: "Devon", message: "Clean interfaces indeed — the whole site loads instantly.", approve: true },
    { name: "Nina B.", message: "Bin auch Fachinformatikerin, cool das hier zu sehen!", approve: true },
    { name: "Chris", message: "The LED shelf project sounds awesome, got any writeups?", approve: true },
    { name: "Yuki", message: "Stumbled in from GitHub — great use of a self-hosted CMS.", approve: true },
    { name: "Benjamin", message: "Schönen guten Tag! Netter Blog.", approve: true },
    { name: "Aisha", message: "This is exactly the kind of personal site the web needs more of.", approve: true },
    { name: "spam-bot9000", message: "CHEAP WATCHES CLICK HERE http://example.invalid", approve: false },
    { name: "Marcel", message: "Hey, gerade erst entdeckt — bin gespannt was als nächstes kommt.", approve: false },
    { name: "Olive", message: "Testing the guestbook, hope this shows up in moderation!", approve: false },
  ];

  entries.forEach((entry, i) => {
    const createdAt = new Date(Date.now() - (entries.length - i) * HOUR_MS * int(3, 9)).toISOString();
    const id = store.guestbook.add({ name: entry.name, message: entry.message, createdAt, flags: [], score: 0 });
    if (entry.approve) store.guestbook.setStatus(id, GuestbookStatus.Approved);
  });
  const approved = entries.filter((e) => e.approve).length;
  console.log(`[seed] guestbook: ${entries.length} entries (${approved} approved, ${entries.length - approved} pending)`);
}

function seedPlaySessions(store: Store): void {
  const games = ["Balatro", "Hollow Knight", "Baldur's Gate 3", "Stardew Valley", "Slay the Spire", "plantcare-tracker (dev build)"];
  const customStatuses = ["☕ debugging", "🌱 watering the monstera", "🔧 soldering something"];
  const streamingApps = ["OBS Studio"];

  const windowDays = 21;
  let sessions = 0;
  for (let d = 0; d < windowDays; d++) {
    const dayStart = Date.now() - d * DAY_MS;
    // Most days have some activity, a few are quiet — a real playtime ledger
    // never has a perfectly full strip.
    if (rand() < 0.2) continue;

    const gameCount = int(1, 2);
    for (let g = 0; g < gameCount; g++) {
      const startedAt = new Date(dayStart - int(1, 20) * HOUR_MS);
      const minutes = int(20, 150);
      const seenAt = new Date(startedAt.getTime() + minutes * 60_000);
      store.sessions.observe({
        category: "game" as PresenceCategory,
        name: pick(games),
        startedAt: startedAt.toISOString(),
        seenAt: seenAt.toISOString(),
        startedExact: true,
      });
      sessions++;
    }

    if (rand() < 0.15) {
      const startedAt = new Date(dayStart - int(1, 20) * HOUR_MS);
      const seenAt = new Date(startedAt.getTime() + int(15, 90) * 60_000);
      store.sessions.observe({
        category: "streaming" as PresenceCategory,
        name: pick(streamingApps),
        startedAt: startedAt.toISOString(),
        seenAt: seenAt.toISOString(),
        startedExact: true,
      });
      sessions++;
    }

    if (rand() < 0.3) {
      const startedAt = new Date(dayStart - int(1, 20) * HOUR_MS);
      const seenAt = new Date(startedAt.getTime() + int(10, 60) * 60_000);
      store.sessions.observe({
        category: "custom" as PresenceCategory,
        name: pick(customStatuses),
        startedAt: startedAt.toISOString(),
        seenAt: seenAt.toISOString(),
        startedExact: true,
      });
      sessions++;
    }
  }
  console.log(`[seed] presence_sessions: ${sessions} sessions across ${windowDays} days`);
}

function seedMusicPlays(store: Store): void {
  const tracks: Omit<MusicPlay, "startedAt" | "seenAt">[] = [
    { trackId: "t1", song: "Bloom", artist: "Odesza", album: "In Return" },
    { trackId: "t2", song: "Redbone", artist: "Childish Gambino", album: "Awaken, My Love!" },
    { trackId: "t3", song: "Midnight City", artist: "M83", album: "Hurry Up, We're Dreaming" },
    { trackId: "t4", song: "Instant Crush", artist: "Daft Punk, Julian Casablancas", album: "Random Access Memories" },
    { trackId: "t5", song: "Silver Springs", artist: "Fleetwood Mac", album: "Rumours" },
    { trackId: "t6", song: "Feel Good Inc.", artist: "Gorillaz", album: "Demon Days" },
    { trackId: "t7", song: "Are You Bored Yet?", artist: "Wallows, Clairo" },
    { trackId: "t8", song: "Loom", artist: "Bonobo, WhoMadeWho", album: "Fragments" },
  ];

  const windowDays = 18;
  let plays = 0;
  for (let d = 0; d < windowDays; d++) {
    if (rand() < 0.25) continue;
    const dayStart = Date.now() - d * DAY_MS;
    const playCount = int(1, 4);
    for (let p = 0; p < playCount; p++) {
      const track = pick(tracks);
      const startedAt = new Date(dayStart - int(1, 22) * HOUR_MS);
      const minutes = int(2, 5);
      const seenAt = new Date(startedAt.getTime() + minutes * 60_000);
      store.music.observe({
        ...track,
        startedAt: startedAt.toISOString(),
        seenAt: seenAt.toISOString(),
      });
      plays++;
    }
  }
  console.log(`[seed] music_plays: ${plays} plays across ${windowDays} days`);
}

const store = openStore(dbPath);
try {
  seedGuestbook(store);
  seedPlaySessions(store);
  seedMusicPlays(store);
  console.log("[seed] done.");
} finally {
  store.close();
}
