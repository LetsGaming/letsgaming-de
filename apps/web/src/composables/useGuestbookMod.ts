import { ref } from "vue";
import { AuthError } from "../lib/cms";
import type { GuestbookEntry } from "@lg/core";

/** A moderation-queue entry, as the CMS returns it. */
type ModEntry = GuestbookEntry;

/**
 * The guestbook-moderation slice of the CMS.
 *
 * Extracted from `useCms` — a small self-contained group (the queue, its loading
 * flag, and the approve/reject/delete actions) that only needs the shared write
 * helpers and auth flag passed in. Consumption is unchanged: `useCms` spreads this
 * into its return, so the moderation panel sees the same members.
 */
export interface GuestbookDeps {
  cms: {
    guestbook: () => Promise<{ entries: ModEntry[]; pending: number }>;
    moderate: (id: number, action: "approve" | "reject") => Promise<unknown>;
    del: (path: string) => Promise<unknown>;
  };
  /** Set false when a call reveals the session has expired. */
  authed: { value: boolean };
  flash: (msg: string) => void;
  guarded: (fn: () => Promise<unknown>, ok?: string) => Promise<void>;
}

export function useGuestbookMod({ cms, authed, flash, guarded }: GuestbookDeps) {
  const guestbook = ref<{ entries: ModEntry[]; pending: number } | null>(null);
  const loadingG = ref(false);

  async function loadGuestbook() {
    loadingG.value = true;
    try {
      guestbook.value = await cms.guestbook();
    } catch (e) {
      if (e instanceof AuthError) authed.value = false;
      else flash((e as Error).message || "Couldn't load the guestbook.");
    } finally {
      loadingG.value = false;
    }
  }

  function moderate(id: number, action: "approve" | "reject") {
    void guarded(async () => {
      await cms.moderate(id, action);
      await loadGuestbook();
    }, action === "approve" ? "Approved" : "Rejected");
  }

  function removeEntry(id: number) {
    if (!confirm("Delete this entry permanently?")) return;
    void guarded(async () => {
      await cms.del(`guestbook/${id}`);
      await loadGuestbook();
    }, "Deleted");
  }

  return { guestbook, loadingG, loadGuestbook, moderate, removeEntry };
}
