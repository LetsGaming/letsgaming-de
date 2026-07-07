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
  fromOffset: number;
  toOffset: number;
}

export function ingestLog(store: Store, file: string, ownHost?: string): IngestResult {
  const size = statSync(file).size;
  let offset = store.analytics.getOffset(file);
  // If the file shrank (rotated), start over from the top.
  if (offset > size) offset = 0;

  const fromOffset = offset;
  const fd = openSync(file, "r");
  let buffer = "";
  let linesRead = 0;
  let hitCount = 0;
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
          batch.push(...lineToHits(line, ownHost));
        }
      }
      if (batch.length) {
        store.analytics.record(batch);
        hitCount += batch.length;
      }
    }
  } finally {
    closeSync(fd);
  }

  // Persist the offset at the last complete line (drop a trailing partial line).
  const consumed = size - Buffer.byteLength(buffer, "utf8");
  store.analytics.setOffset(file, consumed);

  return { file, linesRead, hits: hitCount, fromOffset, toOffset: consumed };
}
