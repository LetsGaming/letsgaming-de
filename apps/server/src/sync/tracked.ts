import type { Store } from "@lg/db";

/** Persist a job outcome; a bookkeeping failure must never take the job down. */
export function recordOutcome(store: Store, job: string, error?: string, at = new Date().toISOString()): void {
  try {
    if (error === undefined) store.syncStatus.recordSuccess(job, at);
    else store.syncStatus.recordFailure(job, at, error);
  } catch {
    /* status is advisory */
  }
}

/** Run a background job and record success or failure; the error still propagates to the caller's own logging. */
export async function tracked<T>(store: Store, job: string, run: () => Promise<T>): Promise<T> {
  try {
    const value = await run();
    recordOutcome(store, job);
    return value;
  } catch (err) {
    recordOutcome(store, job, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

/** Wrap a job so a tick that fires while the previous run is still going is skipped. */
export function skipWhileRunning<T>(run: () => Promise<T>): () => Promise<T | undefined> {
  let running = false;
  return async () => {
    if (running) return undefined;
    running = true;
    try {
      return await run();
    } finally {
      running = false;
    }
  };
}
