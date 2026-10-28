/**
 * Incremental log ingest. Reads only the bytes appended since last run (tracked
 * by offset in the store), turns each new line into aggregate hits, and records
 * them. Idempotent across runs; safe to schedule.
 *
 * One rule looks across lines: a page view inside a scan burst (burst.ts) is
 * reclassified, and its verdict depends on lines up to BURST_WINDOW_SECONDS
 * *after* it. So lines are recorded strictly in order and recording stops at the
 * first page view whose window isn't complete yet. That line and everything after
 * it stay unrecorded, and the persisted offset points at the start of that line so
 * the next run reads it again exactly once. Lines before the offset that fall in
 * the window are re-read as context only and never recorded twice.
 */

import type { HourlyHit, Store } from "@lg/db";
import { openSync, readSync, statSync, closeSync } from "node:fs";
import { BURST_WINDOW_SECONDS, markBursts } from "./burst.js";
import { burstHitsOf, parseLine, pairHitsOf, type ParsedLine } from "./parse.js";

export interface IngestResult {
  file: string;
  /** Lines recorded this run; held-back lines are counted by the run that records them. */
  linesRead: number;
  hits: number;
  /**
   * First line the parser couldn't read, if any. The parser expects nginx/Apache
   * *combined* format; Caddy and Traefik default to JSON, in which case every
   * line fails and, because a missing log is meant to degrade quietly, the
   * whole feature looks identical to "not configured". A sample turns that into
   * a one-line diagnosis.
   */
  unparsedSample?: string;
  fromOffset: number;
  toOffset: number;
}

/**
 * How far before the saved offset to read, so a held-back page view still sees
 * the probes that preceded it. A window holds seconds of log, which is far less
 * than this even in a heavy scan.
 */
const LOOKBACK_BYTES = 256 * 1024;

/** Wall-clock margin after which a quiet log is treated as complete. */
const SETTLE_SLACK_SECONDS = 2;

const NEWLINE = 0x0a;

interface Entry {
  /** Byte offset of the line's first byte. */
  start: number;
  text: string;
  parsed: ParsedLine | null;
  /** Read only so its neighbours can see it; already recorded by an earlier run. */
  context: boolean;
}

function toEntry(text: string, start: number, ownHost: string | undefined, context: boolean): Entry {
  return { start, text, parsed: parseLine(text, ownHost), context };
}

function readContext(fd: number, offset: number, ownHost: string | undefined): Entry[] {
  const from = Math.max(0, offset - LOOKBACK_BYTES);
  const buf = Buffer.alloc(offset - from);
  const got = readSync(fd, buf, 0, buf.length, from);
  let begin = 0;
  if (from > 0) {
    const first = buf.indexOf(NEWLINE);
    if (first === -1) return [];
    begin = first + 1;
  }
  const entries: Entry[] = [];
  let s = begin;
  let nl: number;
  while ((nl = buf.indexOf(NEWLINE, s)) !== -1 && nl < got) {
    const text = buf.toString("utf8", s, nl);
    if (text.trim()) entries.push(toEntry(text, from + s, ownHost, true));
    s = nl + 1;
  }
  return entries;
}

export function ingestLog(store: Store, file: string, ownHost?: string, nowMs: number = Date.now()): IngestResult {
  const size = statSync(file).size;
  /**
   * Anything older than this was deleted on purpose and must not come back.
   *
   * The byte offset below normally prevents a re-read, but it resets whenever the
   * file shrinks, which is what a rotation looks like. Without this, one rotation
   * after a "clear everything" re-ingests the entire current log and undoes it.
   *
   * Compared strictly, so the hour the clear happened in stays ingestible: traffic
   * logged seconds after the click is newer than the deletion, and dropping it
   * would be its own small lie.
   */
  const clearedThrough = store.analytics.getClearedThrough();
  let offset = store.analytics.getOffset(file);
  // If the file shrank (rotated), start over from the top.
  if (offset > size) offset = 0;

  const fromOffset = offset;
  const fd = openSync(file, "r");
  let linesRead = 0;
  let hitCount = 0;
  let unparsedSample: string | undefined;
  let consumed = offset;
  try {
    const entries: Entry[] = offset > 0 ? readContext(fd, offset, ownHost) : [];
    let next = entries.length;
    let latest = entries.reduce((m, e) => Math.max(m, e.parsed?.second ?? 0), 0);

    const settled = (second: number): boolean =>
      second + BURST_WINDOW_SECONDS < latest ||
      nowMs / 1000 - second > BURST_WINDOW_SECONDS + SETTLE_SLACK_SECONDS;

    /** Record every entry up to the first page view that may still change verdict. */
    const flush = (): void => {
      const flags = markBursts(
        entries.map((e) => ({ second: e.parsed?.second ?? latest, class: e.parsed?.verdict.class ?? "ignored" })),
      );
      const batch: HourlyHit[] = [];
      while (next < entries.length) {
        const e = entries[next]!;
        if (e.parsed?.verdict.class === "pageview" && !settled(e.parsed.second)) break;
        linesRead++;
        if (!e.parsed) {
          unparsedSample ??= e.text.slice(0, 200);
        } else {
          const hits = flags[next] ? burstHitsOf(e.parsed) : e.parsed.hits;
          for (const hit of hits) {
            if (clearedThrough && hit.bucket < clearedThrough) continue;
            batch.push(hit);
          }
          batch.push(...pairHitsOf(hits).filter((p) => !clearedThrough || p.bucket >= clearedThrough));
        }
        next++;
      }
      if (batch.length) {
        store.analytics.recordHourly(batch);
        hitCount += batch.filter((h) => !h.dimension.startsWith("x:")).length;
      }
      // Keep only what a later page view can still count: the window before the
      // first unrecorded line.
      const keepFrom = entries[next]?.parsed?.second ?? latest;
      let drop = 0;
      while (drop < next && (entries[drop]!.parsed?.second ?? 0) < keepFrom - BURST_WINDOW_SECONDS - 1) drop++;
      if (drop) {
        entries.splice(0, drop);
        next -= drop;
      }
    };

    const chunk = Buffer.alloc(64 * 1024);
    let rest: Buffer = Buffer.alloc(0);
    let pos = offset;
    while (pos < size) {
      const bytes = readSync(fd, chunk, 0, chunk.length, pos);
      if (bytes <= 0) break;
      const data = Buffer.concat([rest, chunk.subarray(0, bytes)]);
      const dataStart = pos - rest.length;
      pos += bytes;
      let s = 0;
      let nl: number;
      while ((nl = data.indexOf(NEWLINE, s)) !== -1) {
        const text = data.toString("utf8", s, nl);
        if (text.trim()) {
          const entry = toEntry(text, dataStart + s, ownHost, false);
          if (entry.parsed) latest = Math.max(latest, entry.parsed.second);
          entries.push(entry);
        }
        s = nl + 1;
      }
      rest = data.subarray(s);
      consumed = pos - rest.length;
      flush();
    }
    flush();

    // Resume at the first unrecorded line (or after the last complete one).
    const held = entries[next];
    if (held) consumed = held.start;
  } finally {
    closeSync(fd);
  }

  store.analytics.setOffset(file, consumed);

  return {
    file,
    linesRead,
    hits: hitCount,
    fromOffset,
    toOffset: consumed,
    ...(unparsedSample !== undefined ? { unparsedSample } : {}),
  };
}
