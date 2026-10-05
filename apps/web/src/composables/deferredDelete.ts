/**
 * A delete that only reaches the server once its undo window has passed.
 *
 * One item is held at a time: scheduling another commits the held one first, so
 * the server never lags more than a single entry behind the screen.
 */
export function createDeferredDelete<T>(opts: {
  commit: (item: T) => Promise<void> | void;
  delayMs?: number;
  /** Called whenever the held item changes (null once committed or undone). */
  onChange?: (held: T | null) => void;
}) {
  const delay = opts.delayMs ?? 6000;
  let held: T | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const set = (next: T | null) => {
    held = next;
    opts.onChange?.(next);
  };

  async function flush() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    if (held === null) return;
    const item = held;
    set(null);
    await opts.commit(item);
  }

  return {
    get held() {
      return held;
    },
    async schedule(item: T) {
      await flush();
      set(item);
      timer = setTimeout(() => void flush(), delay);
    },
    /** Returns the held item so the caller can put it back, or null if none. */
    undo(): T | null {
      if (held === null) return null;
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      const item = held;
      set(null);
      return item;
    },
    flush,
  };
}
