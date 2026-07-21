import {
  PLAYTIME_MIN_SECONDS,
  PRESENCE_SESSION_GAP_MS,
  type PlaytimeDay,
  type PlaytimeEntry,
  type PlaytimeHeatCell,
  type PresenceCategory,
} from "@lg/core";
import type { DatabaseSync } from "node:sqlite";
import { asNumber, asText, mapRow, mapRows, type Row } from "./row-mapper.js";
import { eachHourSlot, zonedDay } from "./tz.js";

/**
 * Observed play sessions, accumulated from Discord presence polls.
 *
 * See `0003_presence_sessions.sql` for why this isn't a source: a sample is a
 * moment nobody can hand back, so the accumulation is the truth rather than the
 * newest row.
 */
export function sessionsRepo(db: DatabaseSync) {
  // Default upper bound for period-scoped reads (Wrapped). ISO strings sort
  // chronologically, so `< FAR_FUTURE` is always true — callers passing no
  // `untilIso` keep the original "since a cutoff, up to now" behaviour.
  const FAR_FUTURE = "9999-12-31T23:59:59.999Z";
  /**
   * Record that an activity was seen running.
   *
   * Idempotent by construction. `(category, name, started_at)` is the session's
   * identity — Discord dates the start, so two polls of the same session are the
   * same row and only `last_seen_at` moves. Polling twice, replaying a poll, or
   * running two samplers cannot inflate a total; the worst they can do is agree.
   *
   * `last_seen_at` only ever moves forward (`MAX`), so an out-of-order or retried
   * poll can't shorten a session it already saw.
   */
  const observe = db.prepare(`
    INSERT INTO presence_sessions (category, name, started_at, last_seen_at, started_exact)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (category, name, started_at) DO UPDATE SET
      last_seen_at = MAX(last_seen_at, excluded.last_seen_at)
  `);

  /**
   * The newest still-open undated session for a name, if any.
   *
   * Only undated ones: a dated session is keyed by its start and never needs
   * finding. This is the lookup that makes the undated path work at all.
   */
  const openUndated = db.prepare(`
    SELECT started_at FROM presence_sessions
    WHERE category = ? AND name = ? AND started_exact = 0 AND last_seen_at >= ?
    ORDER BY last_seen_at DESC
    LIMIT 1
  `);

  const extend = db.prepare(`
    UPDATE presence_sessions
    SET last_seen_at = MAX(last_seen_at, ?)
    WHERE category = ? AND name = ? AND started_at = ?
  `);

  return {
    /**
     * Record that an activity was seen running.
     *
     * Two paths, because Discord gives two different things:
     *
     * - **Dated** (`timestamps.start`): the session has a real identity, so this is
     *   a plain upsert and idempotence is the primary key's job. Polling twice
     *   cannot inflate it.
     * - **Undated**: there's no key. `started_at = now` would make every poll its
     *   own zero-length session, so the game would accumulate nothing *forever* —
     *   silently, since `PLAYTIME_MIN_SECONDS` drops each one. So the poll extends
     *   whatever undated session is still open (`PRESENCE_SESSION_GAP_MS`), and
     *   only opens a new one when nothing is.
     */
    observe(input: {
      category: PresenceCategory;
      name: string;
      startedAt: string;
      seenAt: string;
      startedExact: boolean;
    }): void {
      if (input.startedExact) {
        observe.run(input.category, input.name, input.startedAt, input.seenAt, 1);
        return;
      }

      const cutoff = new Date(Date.parse(input.seenAt) - PRESENCE_SESSION_GAP_MS).toISOString();
      const open = mapRow(openUndated, (r: Row) => asText(r.started_at), input.category, input.name, cutoff);
      if (open) {
        extend.run(input.seenAt, input.category, input.name, open);
        return;
      }
      observe.run(input.category, input.name, input.startedAt, input.seenAt, 0);
    },

    /**
     * Minutes per activity since a cutoff, most-played first.
     *
     * Sums `last_seen_at - started_at` per session. Sessions are keyed by their
     * start, so overlapping rows for one game can't exist — Discord reports one
     * activity of a kind at a time, and a restart is a new `started_at`, which is a
     * new session and is correct.
     *
     * `PLAYTIME_MIN_SECONDS` drops sessions we only ever saw once and can't date:
     * a game glimpsed by a single poll with no `timestamps.start` has
     * `last_seen == started`, which is a zero-length session and a row rather than
     * a fact.
     */
    playtime(category: PresenceCategory, sinceIso: string, untilIso: string = FAR_FUTURE): PlaytimeEntry[] {
      return mapRows(
        db.prepare(`
          SELECT
            name,
            SUM(strftime('%s', last_seen_at) - strftime('%s', started_at)) AS seconds,
            MIN(started_exact) AS exact,
            COUNT(*) AS sessions
          FROM presence_sessions
          WHERE category = ? AND last_seen_at >= ? AND last_seen_at < ?
          GROUP BY name
          HAVING seconds >= ?
          ORDER BY seconds DESC, name ASC
        `),
        (r: Row): PlaytimeEntry => ({
          name: asText(r.name),
          minutes: Math.round(asNumber(r.seconds) / 60),
          sessions: asNumber(r.sessions),
          // One inexact session makes the whole total a floor, so the flag is a
          // MIN, not an OR — the chart is holding a lower bound either way and
          // should say the weaker thing.
          exact: asNumber(r.exact) === 1,
        }),
        category,
        sinceIso,
        untilIso,
        PLAYTIME_MIN_SECONDS,
      );
    },

    /**
     * When a category is played, as a weekday × hour grid, in `timeZone`.
     *
     * 7 rows (Sun–Sat) × 24 columns, each cell the minutes played in that slot over
     * the window. A session's minutes are **spread across every hour it spans** (see
     * `eachHourSlot`), so the grid answers "when am I actually playing", not "when
     * do I start". The zone is a parameter, bucketed from the raw UTC rows via
     * `Intl` — so the owner's zone and any visitor's zone come off the same code,
     * each session credited by its own DST offset.
     */
    heatmap(category: PresenceCategory, sinceIso: string, timeZone: string): PlaytimeHeatCell[] {
      const rows = mapRows(
        db.prepare(`SELECT started_at AS s, last_seen_at AS e FROM presence_sessions WHERE category = ? AND started_at >= ?`),
        (r: Row) => ({ s: asText(r.s), e: asText(r.e) }),
        category,
        sinceIso,
      );
      const acc = new Map<number, number>(); // weekday*24 + hour → ms
      for (const { s, e } of rows) {
        eachHourSlot(s, e, timeZone, (weekday, hour, ms) => {
          const k = weekday * 24 + hour;
          acc.set(k, (acc.get(k) ?? 0) + ms);
        });
      }
      return [...acc].map(([k, ms]) => ({ weekday: Math.floor(k / 24), hour: k % 24, minutes: Math.round(ms / 60000) }));
    },

    /**
     * Daily totals for a category over a window, one row per local day (in
     * `timeZone`) that has any play, oldest first. A session counts on the day it
     * started — the same attribution `dayBreakdown` uses, so a column and its
     * drill-in always agree. Days with no play are absent; the caller fills the
     * calendar, because a gap is a real answer.
     */
    dailyTotals(category: PresenceCategory, sinceIso: string, timeZone: string): PlaytimeDay[] {
      const rows = mapRows(
        db.prepare(`SELECT started_at AS s, last_seen_at AS e FROM presence_sessions WHERE category = ? AND started_at >= ?`),
        (r: Row) => ({ s: asText(r.s), e: asText(r.e) }),
        category,
        sinceIso,
      );
      const acc = new Map<string, { ms: number; sessions: number }>();
      for (const { s, e } of rows) {
        const ms = new Date(e).getTime() - new Date(s).getTime();
        if (!(ms > 0)) continue;
        const day = zonedDay(s, timeZone);
        const cur = acc.get(day) ?? { ms: 0, sessions: 0 };
        cur.ms += ms;
        cur.sessions += 1;
        acc.set(day, cur);
      }
      return [...acc.entries()]
        .map(([day, v]) => ({ day, minutes: Math.round(v.ms / 60000), sessions: v.sessions }))
        .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
    },

    /**
     * What was played on one local day (in `timeZone`) — the drill-in behind a
     * clicked column. A session belongs to the day it started in that zone. Fetches
     * a UTC window bracketing the day (any zone offset is < 24h) and filters to the
     * exact local day, so it agrees with `dailyTotals`.
     */
    dayBreakdown(category: PresenceCategory, day: string, timeZone: string): PlaytimeEntry[] {
      const dayStartUtc = new Date(`${day}T00:00:00Z`).getTime();
      const lo = new Date(dayStartUtc - 24 * 3_600_000).toISOString();
      const hi = new Date(dayStartUtc + 48 * 3_600_000).toISOString();
      const rows = mapRows(
        db.prepare(
          `SELECT name, started_at AS s, last_seen_at AS e, started_exact AS ex FROM presence_sessions WHERE category = ? AND started_at >= ? AND started_at < ?`,
        ),
        (r: Row) => ({ name: asText(r.name), s: asText(r.s), e: asText(r.e), exact: asNumber(r.ex) === 1 }),
        category,
        lo,
        hi,
      );
      const acc = new Map<string, { ms: number; sessions: number; exact: boolean }>();
      for (const row of rows) {
        if (zonedDay(row.s, timeZone) !== day) continue;
        const ms = Math.max(0, new Date(row.e).getTime() - new Date(row.s).getTime());
        const cur = acc.get(row.name) ?? { ms: 0, sessions: 0, exact: true };
        cur.ms += ms;
        cur.sessions += 1;
        cur.exact = cur.exact && row.exact; // one inexact session makes the total a floor
        acc.set(row.name, cur);
      }
      return [...acc.entries()]
        .map(([name, v]) => ({ name, minutes: Math.round(v.ms / 60000), sessions: v.sessions, exact: v.exact }))
        .sort((a, b) => b.minutes - a.minutes || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    },

    /** Drop sessions older than a cutoff. Nothing calls this yet; the table is
     *  tiny (one row per session, not per poll) and the whole point is history. */
    prune(beforeIso: string): number {
      const info = db.prepare("DELETE FROM presence_sessions WHERE last_seen_at < ?").run(beforeIso);
      return Number(info.changes ?? 0);
    },
  };
}
