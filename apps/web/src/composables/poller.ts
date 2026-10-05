/** The slice of `document` the poller needs, so tests can fake it. */
export interface VisibilityDoc {
  hidden: boolean;
  addEventListener(type: "visibilitychange", cb: () => void): void;
  removeEventListener(type: "visibilitychange", cb: () => void): void;
}

/**
 * One shared interval that runs only while the tab is visible. Coming back to
 * the tab fires `fn` immediately rather than waiting out the period.
 */
export function createPoller(fn: () => void, ms: number, docArg?: VisibilityDoc) {
  // Resolved on start, so building one during SSR (no `document`) is harmless.
  let doc!: VisibilityDoc;
  let timer: ReturnType<typeof setInterval> | undefined;
  let running = false;

  const stopTimer = () => {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
  };
  const sync = () => {
    if (!running || doc.hidden) return stopTimer();
    if (timer === undefined) timer = setInterval(fn, ms);
  };
  const onVisibility = () => {
    if (running && !doc.hidden) fn();
    sync();
  };

  return {
    start() {
      if (running) return;
      running = true;
      doc = docArg ?? document;
      doc.addEventListener("visibilitychange", onVisibility);
      sync();
    },
    stop() {
      if (running) doc.removeEventListener("visibilitychange", onVisibility);
      running = false;
      stopTimer();
    },
  };
}
