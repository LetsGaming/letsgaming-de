import cron, { type ScheduledTask } from "node-cron";
import {
  LANYARD_ACTIVITY_TYPE,
  isPresenceCategory,
  type LanyardActivity,
  type LanyardData,
  type PresenceCategory,
} from "@lg/core";
import type { Store } from "@lg/db";
import type { ServerEnv } from "../env.js";

/**
 * Poll Discord presence and accumulate what was played.
 *
 * **Not a `Source`, deliberately.** The source contract fetches a complete current
 * state that the adapter can fetch again tomorrow, snapshots it, and treats the
 * newest snapshot as the truth — `Source.ttl`'s own comment rules presence out of
 * that in one line: "Discord presence is worthless after a minute". A source's
 * missed sync costs nothing. A missed *sample* is playtime that never existed,
 * because nobody can hand a moment back.
 *
 * **Why it can't live in the request path.** `/api/presence` already fetches
 * Lanyard, so accumulating there looks free. It would make playtime a measure of
 * the site's traffic: nobody visits at 3am, so nothing was played at 3am. A number
 * whose meaning depends on who was looking is worse than no number.
 *
 * **Why the poll interval isn't the resolution.** Discord dates the activity
 * (`timestamps.start`), so a poll doesn't say "playing X now", it says "playing X,
 * since S". The session's identity is `(category, name, started_at)` and the poll
 * only moves `last_seen_at`, which makes this idempotent: polling twice, or
 * replaying a poll, can't inflate a total. A faster poll doesn't buy accuracy on a
 * session it can see — only a better chance of seeing a short one at all.
 */
export class PresenceSampler {
  private task: ScheduledTask | null = null;
  private pruneTask: ScheduledTask | null = null;

  constructor(
    private readonly env: ServerEnv,
    private readonly store: Store,
    private readonly schedule: string,
    private readonly log: (msg: string) => void = console.log,
  ) {}

  /** One poll. Exposed for the CLI and for tests. */
  async sample(now = new Date()): Promise<number> {
    if (!this.env.discordUserId) return 0;

    let data: LanyardData;
    try {
      const res = await fetch(
        `https://api.lanyard.rest/v1/users/${encodeURIComponent(this.env.discordUserId)}`,
        { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) },
      );
      if (!res.ok) return 0;
      const body = (await res.json()) as { success?: boolean; data?: LanyardData };
      if (!body.success || !body.data) return 0;
      data = body.data;
    } catch {
      // A poll that fails is a poll that didn't happen. There's nothing to write
      // and nothing to correct later — an outage is a gap in the record, and the
      // record says so by being a floor.
      return 0;
    }

    const seenAt = now.toISOString();
    let recorded = 0;

    // The record axis — independent of what the live widget displays. A category
    // the owner turned off here is never written, even if it's shown live.
    const sample = new Set(this.store.content.getPresence().sample);

    for (const activity of data.activities ?? []) {
      const category = CATEGORY_FOR_TYPE[activity.type];
      // Custom status is a sentence, not an activity — there's no duration in
      // "brb". Everything else is something with a start and an end.
      if (!category || !isPresenceCategory(category) || category === "custom") continue;
      if (!sample.has(category)) continue; // not on the record list

      // Discord's own start when it has one. Otherwise this poll — which makes the
      // record a floor that grows from first sight, and `startedExact` (for
      // sessions) says which the chart is holding.
      const exact = typeof activity.timestamps?.start === "number";
      const startedAt = exact ? new Date(activity.timestamps!.start!).toISOString() : seenAt;

      // Music goes to its own table: a track is song + artist(s) + album, three
      // subjects a single `name` column can't hold. Everything else is one
      // subject and stays a session. A track with no id can't be de-duplicated
      // idempotently, so it's dropped rather than risk double-scrobbling.
      if (category === "music") {
        if (!activity.sync_id || !activity.details) continue;
        this.store.music.observe({
          trackId: activity.sync_id,
          song: activity.details,
          artist: activity.state?.trim() ?? "",
          ...(activity.assets?.large_text ? { album: activity.assets.large_text } : {}),
          startedAt,
          seenAt,
        });
        recorded++;
        continue;
      }

      const name = sessionSubject(category, activity);
      if (!name) continue;
      this.store.sessions.observe({ category, name, startedAt, seenAt, startedExact: exact });
      recorded++;
    }

    return recorded;
  }

  /**
   * Drop sessions past the retention window. A no-op when retention is "forever".
   *
   * Reads `retentionDays` per run rather than at construction, so changing it in
   * the CMS takes effect on the next prune without a restart — the same reason the
   * sample list is read per poll.
   */
  prune(now = new Date()): number {
    const days = this.store.content.getPresence().retentionDays;
    if (days === null) return 0; // keep forever
    const before = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
    const removed = this.store.sessions.prune(before) + this.store.music.prune(before);
    if (removed > 0) this.log(`[presence] pruned ${removed} record(s) older than ${days}d`);
    return removed;
  }

  start(): void {
    if (!this.env.discordUserId) {
      this.log("[presence] no DISCORD_USER_ID — playtime sampling off");
      return;
    }
    if (!cron.validate(this.schedule)) {
      this.log(`[presence] invalid schedule "${this.schedule}", sampling off`);
      return;
    }
    this.task = cron.schedule(this.schedule, () => void this.sample());
    // Retention runs daily — the window is in days, so finer would just re-check
    // the same rows. Independent of the sampler cron so neither blocks the other.
    if (cron.validate(PRUNE_SCHEDULE)) {
      this.pruneTask = cron.schedule(PRUNE_SCHEDULE, () => this.prune());
    }
    this.log(`[presence] playtime sampling: ${this.schedule}`);
  }

  stop(): void {
    this.task?.stop();
    this.task = null;
    this.pruneTask?.stop();
    this.pruneTask = null;
  }
}

/** Retention is a day-scale window, so a daily sweep (03:17, off the hour to
 *  avoid the top-of-hour cron crowd) is as fine as it needs to be. */
const PRUNE_SCHEDULE = "17 3 * * *";

/**
 * What a session for this activity is *about* — the string the chart groups by.
 *
 * For a game, the activity's name is the subject: "Factorio" is what you played.
 * For music it isn't — Discord names every Spotify listen "Spotify", and the
 * thing a human wants to see is the artist, which rides in `state` (the song is
 * in `details`). So a music session is keyed on the artist, and "top artists"
 * falls straight out of the same `SUM(duration) GROUP BY name` the games use —
 * no separate query, no separate table.
 *
 * Streaming and watching keep the raw name for now: streaming's is usually the
 * game and watching's is the app, and neither has a clean structured subject the
 * way Spotify's `state` does. Nothing reads them yet, so recording the name loses
 * nothing that a later, better subject couldn't recover.
 */
export function sessionSubject(
  category: PresenceCategory,
  activity: LanyardActivity,
): string | null {
  // Music no longer routes through here — it has its own table (music_plays),
  // because a track is song + artist + album, not one name. Games use their name.
  // Streaming/watching keep the raw name for now (nothing reads them, and neither
  // has a clean structured subject the way Spotify's fields do).
  return activity.name?.trim() || null;
}

/** Lanyard's activity type → the vocabulary the rest of the app speaks. */
const CATEGORY_FOR_TYPE: Record<number, string | undefined> = {
  [LANYARD_ACTIVITY_TYPE.Playing]: "game",
  [LANYARD_ACTIVITY_TYPE.Streaming]: "streaming",
  [LANYARD_ACTIVITY_TYPE.Listening]: "music",
  [LANYARD_ACTIVITY_TYPE.Watching]: "watching",
};
