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

/**
 * Observed play sessions, accumulated from Discord presence polls.
 *
 * See `0003_presence_sessions.sql` for why this isn't a source: a sample is a
 * moment nobody can hand back, so the accumulation is the truth rather than the
 * newest row.
 */
export function sessionsRepo(db: DatabaseSync) {
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
    playtime(category: PresenceCategory, sinceIso: string): PlaytimeEntry[] {
      return mapRows(
        db.prepare(`
          SELECT
            name,
            SUM(strftime('%s', last_seen_at) - strftime('%s', started_at)) AS seconds,
            MIN(started_exact) AS exact,
            COUNT(*) AS sessions
          FROM presence_sessions
          WHERE category = ? AND last_seen_at >= ?
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
        PLAYTIME_MIN_SECONDS,
      );
    },

    /**
     * When a category is played, as a weekday × hour grid.
     *
     * The shape feature 03 draws: 7 rows (Mon–Sun) × 24 columns, each cell the
     * minutes played in that slot over the window. Pure SQL over `started_at` —
     * no new data, the sampler was already writing everything this needs.
     *
     * A session is attributed to the weekday/hour of its *start*. A four-hour
     * session that crosses midnight lands entirely in the hour it began, which is
     * a simplification — but splitting sessions across hour boundaries would need
     * per-minute rows, and "what hour do I usually start playing" is the question
     * the heatmap answers anyway.
     *
     * `%w` is 0=Sunday..6=Saturday (SQLite); the caller rotates to Mon-first.
     */
    heatmap(category: PresenceCategory, sinceIso: string): PlaytimeHeatCell[] {
      return mapRows(
        db.prepare(`
          SELECT
            CAST(strftime('%w', started_at) AS INTEGER) AS weekday,
            CAST(strftime('%H', started_at) AS INTEGER) AS hour,
            SUM(strftime('%s', last_seen_at) - strftime('%s', started_at)) AS seconds
          FROM presence_sessions
          WHERE category = ? AND started_at >= ?
          GROUP BY weekday, hour
        `),
        (r: Row): PlaytimeHeatCell => ({
          weekday: asNumber(r.weekday),
          hour: asNumber(r.hour),
          minutes: Math.round(asNumber(r.seconds) / 60),
        }),
        category,
        sinceIso,
      );
    },

    /**
     * Daily totals for a category over a window, one row per day that has any.
     *
     * The strip in feature 02. Days with no play are simply absent — the caller
     * fills the calendar, because a gap is a real answer ("didn't play") and the
     * query shouldn't invent rows to say nothing.
     */
    dailyTotals(category: PresenceCategory, sinceIso: string): PlaytimeDay[] {
      return mapRows(
        db.prepare(`
          SELECT
            date(started_at) AS day,
            SUM(strftime('%s', last_seen_at) - strftime('%s', started_at)) AS seconds,
            COUNT(*) AS sessions
          FROM presence_sessions
          WHERE category = ? AND started_at >= ?
          GROUP BY day
          ORDER BY day ASC
        `),
        (r: Row): PlaytimeDay => ({
          day: asText(r.day),
          minutes: Math.round(asNumber(r.seconds) / 60),
          sessions: asNumber(r.sessions),
        }),
        category,
        sinceIso,
      );
    },

    /**
     * What was played on one specific day — the drill-in behind a clicked column.
     *
     * The same `SUM(duration) GROUP BY name` the fortnight chart runs, scoped to a
     * single date. A day is a `YYYY-MM-DD` string in the same local frame
     * `dailyTotals` groups by, so a column and its breakdown always agree.
     */
    dayBreakdown(category: PresenceCategory, day: string): PlaytimeEntry[] {
      return mapRows(
        db.prepare(`
          SELECT
            name,
            SUM(strftime('%s', last_seen_at) - strftime('%s', started_at)) AS seconds,
            MIN(started_exact) AS exact,
            COUNT(*) AS sessions
          FROM presence_sessions
          WHERE category = ? AND date(started_at) = ?
          GROUP BY name
          ORDER BY seconds DESC, name ASC
        `),
        (r: Row): PlaytimeEntry => ({
          name: asText(r.name),
          minutes: Math.round(asNumber(r.seconds) / 60),
          sessions: asNumber(r.sessions),
          exact: asNumber(r.exact) === 1,
        }),
        category,
        day,
      );
    },

    /** Drop sessions older than a cutoff. Nothing calls this yet; the table is
     *  tiny (one row per session, not per poll) and the whole point is history. */
    prune(beforeIso: string): number {
      const info = db.prepare("DELETE FROM presence_sessions WHERE last_seen_at < ?").run(beforeIso);
      return Number(info.changes ?? 0);
    },
  };
}
