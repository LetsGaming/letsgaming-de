/**
 * Incremental log ingest. Reads only the bytes appended since last run (tracked
 * by offset in the store), turns each new line into aggregate hits, and records
 * them. Idempotent across runs; safe to schedule.
 */

import type { Store } from "@lg/db";
import { openSync, readSync, statSync, closeSync } from "node:fs";
import { lineToHits } from "./parse.js";

export interface IngestResult {
  file: string;
  linesRead: number;
  hits: number;
  /**
   * First line the parser couldn't read, if any. The parser expects nginx/Apache
   * *combined* format; Caddy and Traefik default to JSON, in which case every
   * line fails and — because a missing log is meant to degrade quietly — the
   * whole feature looks identical to "not configured". A sample turns that into
   * a one-line diagnosis.
   */
  unparsedSample?: string;
  fromOffset: number;
  toOffset: number;
}

export function ingestLog(store: Store, file: string, ownHost?: string): IngestResult {
  const size = statSync(file).size;
  /**
   * Anything older than this was deleted on purpose and must not come back.
   *
   * The byte offset below normally prevents a re-read, but it resets whenever the
   * file shrinks — which is what a rotation looks like. Without this, one rotation
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
  let buffer = "";
  let linesRead = 0;
  let hitCount = 0;
  let unparsedSample: string | undefined;
  try {
    const chunk = Buffer.alloc(64 * 1024);
    while (offset < size) {
      const bytes = readSync(fd, chunk, 0, chunk.length, offset);
      if (bytes <= 0) break;
      offset += bytes;
      buffer += chunk.toString("utf8", 0, bytes);
      let nl: number;
      const batch = [];
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if (line.trim()) {
          linesRead++;
          const hits = lineToHits(line, ownHost);
          if (!hits.length && unparsedSample === undefined) unparsedSample = line.slice(0, 200);
          for (const hit of hits) {
            if (clearedThrough && hit.bucket < clearedThrough) continue;
            batch.push(hit);
          }
        }
      }
      if (batch.length) {
        store.analytics.recordHourly(batch);
        hitCount += batch.length;
      }
    }
  } finally {
    closeSync(fd);
  }

  // Persist the offset at the last complete line (drop a trailing partial line).
  const consumed = size - Buffer.byteLength(buffer, "utf8");
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
