/**
 * The sync worker (PROJECT.md §4 "Data flow").
 *
 * On a schedule it walks the registered sources, and for each: fetch → normalize
 * → persist (append a snapshot + upsert current). Nothing is fetched on page
 * load; the site only ever reads what a prior sync wrote. This is what keeps the
 * page fresh even if the owner never touches it for months.
 */

import type { Source } from "@lg/core";
import type { Store } from "@lg/db";
import { getSources, type SourcesEnv } from "@lg/sources";
import cron, { type ScheduledTask } from "node-cron";

export interface SyncResult {
  sourceId: string;
  ok: boolean;
  mock: boolean;
  syncedAt: string;
  error?: string;
}

export class SyncRunner {
  private readonly registered: ReturnType<typeof getSources>;
  private tasks: ScheduledTask[] = [];

  constructor(
    private readonly store: Store,
    env: SourcesEnv,
    private readonly log: (msg: string) => void = console.log,
    private readonly retainHourlyDays = 90,
  ) {
    this.registered = getSources(env);
  }

  /** Bundle old hourly analytics into daily rows and prune — keeps the volume flat. */
  runMaintenance(): void {
    try {
      const { rolledUp, pruned } = this.store.analytics.rollupAndPrune(this.retainHourlyDays);
      if (rolledUp || pruned) {
        this.log(`[maint] analytics rollup: ${rolledUp} daily rows, pruned ${pruned} hourly`);
      }
    } catch (err) {
      this.log(`[maint] analytics rollup FAILED: ${err instanceof Error ? err.message : err}`);
    }
  }

  /** Run one source now: fetch, normalize, persist. Never throws — reports. */
  async runSource(source: Source, mock: boolean): Promise<SyncResult> {
    const syncedAt = new Date().toISOString();

    // A failed fetch is expected (slow/down upstream): log it and keep the
    // last-good snapshot — don't record, don't throw.
    const fetched = await source.fetch();
    if (!fetched.ok) {
      this.log(`[sync] ${source.id} FAILED (${fetched.error.kind}): ${fetched.error.message}`);
      return { sourceId: source.id, ok: false, mock, syncedAt, error: fetched.error.message };
    }

    try {
      const normalized = source.normalize(fetched.value);
      this.store.source.record(source.id, syncedAt, normalized);
      this.log(`[sync] ${source.id} ok${mock ? " (mock)" : ""} @ ${syncedAt}`);
      return { sourceId: source.id, ok: true, mock, syncedAt };
    } catch (err) {
      // normalize/persist are local — a throw here is a real bug, but still
      // shouldn't crash the run.
      const message = err instanceof Error ? err.message : String(err);
      this.log(`[sync] ${source.id} FAILED (normalize/persist): ${message}`);
      return { sourceId: source.id, ok: false, mock, syncedAt, error: message };
    }
  }

  /** Run every registered source once. Used by the CLI and on boot. */
  async runAll(): Promise<SyncResult[]> {
    const results: SyncResult[] = [];
    for (const { source, mock } of this.registered) {
      results.push(await this.runSource(source, mock));
    }
    return results;
  }

  /**
   * Start the cron schedule for each source (per its `schedule` field) and run
   * once immediately so the store is never empty on a fresh boot.
   */
  start(): void {
    for (const { source, mock } of this.registered) {
      if (!cron.validate(source.schedule)) {
        this.log(`[sync] ${source.id}: invalid schedule "${source.schedule}", skipping cron`);
        continue;
      }
      const task = cron.schedule(source.schedule, () => void this.runSource(source, mock));
      this.tasks.push(task);
      this.log(`[sync] ${source.id} scheduled: ${source.schedule}${mock ? " (mock)" : ""}`);
    }
    // Nightly analytics rollup/prune (keeps the store from growing unbounded).
    const maint = cron.schedule("0 4 * * *", () => this.runMaintenance());
    this.tasks.push(maint);
    void this.runAll();
    this.runMaintenance();
  }

  stop(): void {
    for (const task of this.tasks) task.stop();
    this.tasks = [];
  }
}
