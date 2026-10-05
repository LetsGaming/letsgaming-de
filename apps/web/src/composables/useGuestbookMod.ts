import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from "vue";
import { AuthError, type CmsStatusResponse, type GuestbookCounts, type GuestbookTab } from "../lib/cms";
import type { GuestbookEntry, ModerationAction } from "@lg/core";
import { createDeferredDelete } from "./deferredDelete";
import { createPoller } from "./poller";

/** A moderation-queue entry, as the CMS returns it. */
type ModEntry = GuestbookEntry;

interface GuestbookList {
  entries: ModEntry[];
  pending: number;
  counts: GuestbookCounts;
}

/** How often the shared status poll runs while the CMS tab is visible. */
export const STATUS_POLL_MS = 30_000;
/** How long a deleted entry can be brought back before the server is told. */
export const UNDO_WINDOW_MS = 6000;

const ZERO: GuestbookCounts = { pending: 0, approved: 0, rejected: 0 };

/**
 * The guestbook-moderation slice of the CMS, plus the one status poll that feeds
 * the sidebar badge, the dashboard and the panel.
 *
 * Deletes are deferred: the entry leaves the list at once and the DELETE is sent
 * when the undo toast expires, when another delete starts, or when the page goes
 * away.
 */
export interface GuestbookDeps {
  cms: {
    guestbook: (status?: GuestbookTab) => Promise<{ entries: ModEntry[]; pending: number; counts?: GuestbookCounts }>;
    moderate: (id: number, action: ModerationAction) => Promise<unknown>;
    deleteGuestbook: (id: number) => Promise<unknown>;
    status: () => Promise<CmsStatusResponse>;
  };
  /** Set false when a call reveals the session has expired. */
  authed: Ref<boolean>;
  tab: Ref<string>;
  flash: (msg: string) => void;
  guarded: (fn: () => Promise<unknown>, ok?: string) => Promise<void>;
}

export function useGuestbookMod({ cms, authed, tab, flash, guarded }: GuestbookDeps) {
  const guestbook = ref<GuestbookList | null>(null);
  const gbTab = ref<GuestbookTab>("pending");
  const loadingG = ref(false);
  const cmsStatus = ref<CmsStatusResponse | null>(null);
  /** When the numbers on screen were last fetched; drives "updated Ns ago". */
  const statusAt = ref(0);

  /** An entry waiting out its undo window, and where it sat. */
  const deleted = ref<{ entry: ModEntry; index: number } | null>(null);

  const counts = computed<GuestbookCounts>(() => guestbook.value?.counts ?? cmsStatus.value?.guestbook ?? ZERO);

  function adopt(c: GuestbookCounts) {
    if (!guestbook.value) return;
    const next = { ...c };
    // The server still counts an entry that is only waiting out its undo window.
    const held = deleted.value?.entry.status;
    if (held) next[held] = Math.max(0, next[held] - 1);
    guestbook.value.counts = next;
    guestbook.value.pending = next.pending;
  }

  function onAuth(e: unknown, fallback: string, quiet: boolean) {
    if (e instanceof AuthError) authed.value = false;
    else if (!quiet) flash((e as Error).message || fallback);
  }

  async function loadGuestbook(opts: { quiet?: boolean } = {}) {
    if (!opts.quiet) loadingG.value = true;
    const want = gbTab.value;
    try {
      const res = await cms.guestbook(want);
      if (want !== gbTab.value) return;
      const hold = deleted.value?.entry.id;
      guestbook.value = {
        entries: hold === undefined ? res.entries : res.entries.filter((e) => e.id !== hold),
        pending: res.pending,
        counts: counts.value,
      };
      adopt(res.counts ?? { ...counts.value, pending: res.pending });
      statusAt.value = Date.now();
    } catch (e) {
      onAuth(e, "Couldn't load the guestbook.", !!opts.quiet);
    } finally {
      if (!opts.quiet) loadingG.value = false;
    }
  }

  async function loadStatus(opts: { quiet?: boolean } = {}) {
    try {
      const res = await cms.status();
      cmsStatus.value = res;
      adopt(res.guestbook);
      statusAt.value = Date.now();
    } catch (e) {
      onAuth(e, "Couldn't load the dashboard status.", !!opts.quiet);
    }
  }

  /** The poll tick: refresh the shared status, and the open list if it is showing. */
  async function refresh() {
    await Promise.all([
      loadStatus({ quiet: true }),
      tab.value === "guestbook" ? loadGuestbook({ quiet: true }) : Promise.resolve(),
    ]);
  }

  async function setGbTab(next: GuestbookTab) {
    if (gbTab.value === next) return;
    gbTab.value = next;
    await loadGuestbook();
  }

  function moderate(id: number, action: ModerationAction) {
    const label = { approve: "Approved", reject: "Rejected", unapprove: "Moved back to pending" }[action];
    void guarded(async () => {
      await cms.moderate(id, action);
      await Promise.all([loadGuestbook({ quiet: true }), loadStatus({ quiet: true })]);
    }, label);
  }

  const pendingDelete = createDeferredDelete<{ entry: ModEntry; index: number }>({
    delayMs: UNDO_WINDOW_MS,
    onChange: (h) => (deleted.value = h),
    commit: async ({ entry }) => {
      try {
        await cms.deleteGuestbook(entry.id);
      } catch (e) {
        onAuth(e, "Couldn't delete the entry.", false);
        await loadGuestbook({ quiet: true });
        return;
      }
      await loadStatus({ quiet: true });
    },
  });

  function removeEntry(id: number) {
    const g = guestbook.value;
    const index = g ? g.entries.findIndex((e) => e.id === id) : -1;
    const entry = g?.entries[index];
    if (!g || !entry) return;
    g.entries.splice(index, 1);
    g.counts = { ...g.counts, [entry.status]: Math.max(0, g.counts[entry.status] - 1) };
    g.pending = g.counts.pending;
    void pendingDelete.schedule({ entry, index });
  }

  function undoDelete() {
    const back = pendingDelete.undo();
    const g = guestbook.value;
    if (!back || !g) return;
    if (back.entry.status === gbTab.value) g.entries.splice(Math.min(back.index, g.entries.length), 0, back.entry);
    g.counts = { ...g.counts, [back.entry.status]: g.counts[back.entry.status] + 1 };
    g.pending = g.counts.pending;
  }

  const poller = createPoller(() => void refresh(), STATUS_POLL_MS);
  const flushDeletes = () => void pendingDelete.flush();

  // The poll only makes sense while signed in; the gate has nothing to count.
  watch(
    authed,
    (ok) => {
      if (ok) {
        void loadStatus({ quiet: true });
        poller.start();
      } else poller.stop();
    },
    { immediate: true },
  );
  onMounted(() => window.addEventListener("pagehide", flushDeletes));
  onBeforeUnmount(() => {
    window.removeEventListener("pagehide", flushDeletes);
    poller.stop();
    flushDeletes();
  });

  return {
    guestbook,
    gbTab,
    gbCounts: counts,
    gbDeleted: deleted,
    cmsStatus,
    statusAt,
    loadingG,
    loadGuestbook,
    loadStatus,
    setGbTab,
    moderate,
    removeEntry,
    undoDelete,
  };
}
