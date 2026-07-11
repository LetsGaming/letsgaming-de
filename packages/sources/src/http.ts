/**
 * The one resilient HTTP client every source adapter uses. Adds what raw `fetch`
 * lacks for a background sync worker talking to third-party APIs:
 *
 *   - a hard timeout, so a hung upstream can't stall a sync run indefinitely;
 *   - a typed Result instead of a throw (a slow/down upstream is expected);
 *   - JSON parsing folded in, with parse failures surfaced as a typed error.
 *
 * Deliberately no retry loop: the sync runs on a schedule and the store keeps the
 * last-good snapshot on failure, so the fix for a blip is the next scheduled run,
 * not a blind re-request (which only doubles load on an already-struggling API).
 */

import { err, ok, sourceError, type Result } from "@lg/core";

export interface FetchJsonOptions {
  /** Abort (and fail with kind:"timeout") after this many ms. Default 10s. */
  timeoutMs?: number;
  /** Passed through to fetch (method, headers, body). */
  init?: RequestInit;
  /** Injectable fetch for tests. */
  fetchImpl?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 10_000;

/** GET/POST JSON with a timeout, returning a typed Result (never throws). */
export async function fetchJson<T>(url: string, opts: FetchJsonOptions = {}): Promise<Result<T>> {
  const doFetch = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let res: Response;
  try {
    res = await doFetch(url, { ...opts.init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") {
      return err(sourceError("timeout", `request to ${host(url)} timed out after ${timeoutMs}ms`));
    }
    return err(sourceError("network", `request to ${host(url)} failed: ${message(e)}`));
  }

  if (!res.ok) {
    return err(sourceError("http", `${host(url)} responded ${res.status}`, res.status));
  }

  try {
    return ok((await res.json()) as T);
  } catch (e) {
    return err(sourceError("parse", `invalid JSON from ${host(url)}: ${message(e)}`));
  }
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const host = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};
