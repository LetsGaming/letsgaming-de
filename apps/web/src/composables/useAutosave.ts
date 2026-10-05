import { shallowRef, watch } from "vue";

/**
 * Autosave for the CMS: every edit is live as soon as it is saved, so there are no
 * Save buttons, only one status the whole editor shows.
 *
 * The core (`createAutosave`) has no Vue and no timers of its own beyond the
 * injected `setTimer`, so the rules are testable with fake timers:
 *
 * - one slot per key (a document, a list row, one module's heading);
 * - text edits wait `TEXT_DELAY_MS`, structural ones (toggles, reorders) go at once;
 * - never two requests in flight for one key; edits made meanwhile coalesce to the
 *   latest value and go out when the first settles;
 * - a failed or rejected save keeps the value dirty and the error visible, and is
 *   retried by `retry()`, the next edit, or the next flush. Nothing is dropped.
 */

export const TEXT_DELAY_MS = 600;

export type SaveStatus =
  | { state: "idle" }
  | { state: "saving" }
  | { state: "saved"; at: number }
  | { state: "error"; message: string };

/** One confirmed write, as the undo stack wants to record it. */
export interface SavedEdit {
  key: string;
  label: string;
  path: string;
  before: unknown;
  after: unknown;
  group?: string;
}

export interface AutosaveDeps {
  put: (path: string, body: unknown, opts: { keepalive: boolean }) => Promise<unknown>;
  onStatus: (status: SaveStatus) => void;
  onSaved?: (edit: SavedEdit) => void;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  now?: () => number;
}

export interface EditOptions {
  path?: string;
  label?: string;
  /** Edits made in one gesture (a reorder) share a group so undo takes them together. */
  group?: string;
  /** Overrides the text/structural guess. 0 saves on the next tick. */
  delay?: number;
  /** Runs after this key's next confirmed save. */
  after?: () => void;
}

interface Slot {
  path: string;
  label: string;
  group?: string;
  after?: () => void;
  /** Last server-confirmed value; `undefined` for a row that was never saved. */
  baseline: unknown;
  hasBaseline: boolean;
  pending?: { value: unknown };
  timer?: unknown;
  inflight: boolean;
  error?: string;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** A detached copy, so a later mutation of live editor state can't change what was saved or is queued. */
const snap = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

/** True when every difference between the two is text or a number being typed. */
export function isTextEdit(before: unknown, after: unknown): boolean {
  if (typeof before === "string" && typeof after === "string") return true;
  if (typeof before === "number" && typeof after === "number") return true;
  if (Array.isArray(before) && Array.isArray(after)) {
    return before.length === after.length && before.every((b, i) => isTextEdit(b, after[i]) || same(b, after[i]));
  }
  if (before && after && typeof before === "object" && typeof after === "object") {
    const a = before as Record<string, unknown>;
    const b = after as Record<string, unknown>;
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      if (same(a[k], b[k])) continue;
      if (!(k in a) || !(k in b)) return false;
      if (!isTextEdit(a[k], b[k])) return false;
    }
    return true;
  }
  return same(before, after);
}

export function createAutosave(deps: AutosaveDeps) {
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const now = deps.now ?? (() => Date.now());
  const slots = new Map<string, Slot>();
  const running = new Map<string, Promise<void>>();
  let lastSavedAt: number | null = null;

  const publish = () => {
    let saving = false;
    let error: string | undefined;
    for (const s of slots.values()) {
      if (s.inflight || s.timer !== undefined) saving = true;
      if (s.error && !error) error = s.error;
    }
    if (error) deps.onStatus({ state: "error", message: error });
    else if (saving) deps.onStatus({ state: "saving" });
    else if (lastSavedAt !== null) deps.onStatus({ state: "saved", at: lastSavedAt });
    else deps.onStatus({ state: "idle" });
  };

  const slot = (key: string, path = ""): Slot => {
    let s = slots.get(key);
    if (!s) {
      s = { path, label: "Edit", baseline: undefined, hasBaseline: false, inflight: false };
      slots.set(key, s);
    }
    return s;
  };

  async function run(key: string, keepalive = false): Promise<void> {
    const s = slots.get(key);
    if (!s) return;
    if (s.timer !== undefined) {
      clearTimer(s.timer);
      s.timer = undefined;
    }
    const prior = running.get(key);
    if (prior) return prior; // the in-flight run picks the coalesced value up when it settles
    if (!s.pending) return publish();

    const job = (async () => {
      while (s.pending) {
        const { value } = s.pending;
        s.pending = undefined;
        if (s.hasBaseline && same(value, s.baseline)) continue;
        s.inflight = true;
        publish();
        try {
          await deps.put(s.path, value, { keepalive });
          const before = s.baseline;
          const had = s.hasBaseline;
          s.baseline = value;
          s.hasBaseline = true;
          s.error = undefined;
          lastSavedAt = now();
          s.after?.();
          if (had && !same(before, value)) {
            deps.onSaved?.({ key, label: s.label, path: s.path, before, after: value, group: s.group });
          }
          const next = (s as Slot).pending;
          if (next && same(next.value, s.baseline)) s.pending = undefined;
        } catch (e) {
          s.error = (e as Error).message || "Could not save.";
          // A newer edit supersedes the failed value; otherwise keep it dirty.
          const newer = s.pending;
          s.pending ??= { value };
          s.inflight = false;
          publish();
          if (newer) continue;
          return;
        } finally {
          s.inflight = false;
        }
      }
    })();
    running.set(key, job);
    try {
      await job;
    } finally {
      running.delete(key);
      publish();
    }
  }

  /** Send everything pending now. */
  async function flush(keepalive = false): Promise<void> {
    const jobs: Promise<void>[] = [];
    for (const [key, s] of slots) {
      if (s.pending || s.timer !== undefined || running.has(key)) jobs.push(run(key, keepalive));
    }
    await Promise.all(jobs);
  }

  return {
    /** Record the server-confirmed value for a key, dropping any unsent edit to it. */
    baseline(key: string, path: string, value: unknown) {
      value = snap(value);
      const s = slot(key, path);
      if (s.timer !== undefined) clearTimer(s.timer);
      s.timer = undefined;
      s.path = path;
      s.baseline = value;
      s.hasBaseline = true;
      s.pending = undefined;
      s.error = undefined;
      publish();
    },

    /**
     * Fold fields the server already holds into a key's confirmed value without
     * touching its pending edit. For when another request (a whole-list reorder)
     * has just persisted part of this key's document.
     */
    adopt(key: string, patch: Record<string, unknown>) {
      const s = slots.get(key);
      if (s?.hasBaseline && s.baseline && typeof s.baseline === "object") s.baseline = { ...s.baseline, ...patch };
    },

    /** Whether the server has a confirmed value for this key. */
    known: (key: string) => slots.get(key)?.hasBaseline === true,

    /** Forget a key (its row was deleted). */
    forget(key: string) {
      const s = slots.get(key);
      if (s?.timer !== undefined) clearTimer(s.timer);
      slots.delete(key);
      publish();
    },

    /** The latest value for a key changed. No-op when it equals what the server has. */
    edit(key: string, value: unknown, opts: EditOptions = {}) {
      value = snap(value);
      const s = slot(key, opts.path);
      if (opts.path) s.path = opts.path;
      if (opts.label) s.label = opts.label;
      s.group = opts.group;
      s.after = opts.after;
      if (s.hasBaseline && same(value, s.baseline)) {
        if (s.timer !== undefined) clearTimer(s.timer);
        s.timer = undefined;
        s.pending = undefined;
        s.error = undefined;
        publish();
        return;
      }
      if (!s.path) return;
      s.pending = { value };
      if (s.timer !== undefined) clearTimer(s.timer);
      const delay =
        opts.delay ?? (s.hasBaseline && !isTextEdit(s.baseline, value) ? 0 : TEXT_DELAY_MS);
      s.timer = setTimer(() => {
        s.timer = undefined;
        void run(key);
      }, delay);
      publish();
    },

    /** Send everything pending now. `keepalive` lets it outlive the page. */
    flush,

    /** Try every failed save again. */
    async retry(): Promise<void> {
      const jobs: Promise<void>[] = [];
      for (const [key, s] of slots) if (s.error) jobs.push(run(key));
      await Promise.all(jobs);
    },

    /**
     * Write a value straight to the server outside the dirty tracking (undo and
     * redo). Pending edits go first so the two can't interleave.
     */
    async write(key: string, path: string, value: unknown): Promise<void> {
      value = snap(value);
      await flush();
      const s = slot(key, path);
      s.path = path;
      s.inflight = true;
      publish();
      try {
        await deps.put(path, value, { keepalive: false });
        s.baseline = value;
        s.hasBaseline = true;
        s.error = undefined;
        lastSavedAt = now();
      } catch (e) {
        s.error = (e as Error).message || "Could not save.";
        throw e;
      } finally {
        s.inflight = false;
        publish();
      }
    },

    /** Any unsent or failed edit. */
    hasUnsaved(): boolean {
      for (const s of slots.values()) if (s.pending || s.timer !== undefined || s.inflight || s.error) return true;
      return false;
    },
  };
}

export type Autosave = ReturnType<typeof createAutosave>;

/**
 * Autosave one document: watch `source` and save it to `path` when it changes.
 * Returns the function that records the freshly loaded state as server-confirmed,
 * which the owner calls at the end of its hydrate so loading never counts as an edit.
 */
export function bindAutosave(
  autosave: Autosave,
  opts: { path: string; label: string; source: () => unknown; delay?: number; after?: () => void },
): () => void {
  watch(
    opts.source,
    (value) => autosave.edit(opts.path, value, { path: opts.path, label: opts.label, delay: opts.delay, after: opts.after }),
    { deep: true },
  );
  return () => autosave.baseline(opts.path, opts.path, opts.source());
}

/** Vue wrapper: the core plus a reactive status the top bar reads. */
export function useAutosave(deps: Omit<AutosaveDeps, "onStatus">) {
  const status = shallowRef<SaveStatus>({ state: "idle" });
  const core = createAutosave({ ...deps, onStatus: (s) => (status.value = s) });
  return { ...core, status };
}
