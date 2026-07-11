import { ref } from "vue";
import type { ClickAction } from "@lg/core";
import { apiUrl } from "../lib/api";
import { trackClick } from "../lib/track";

export type SubmitState = "idle" | "sending" | "sent" | "error";

export interface UseSubmitOptions<T> {
  /** Root-relative API path, e.g. "/api/contact". */
  path: string;
  /** Build the JSON payload from the current field values. */
  body: () => T;
  /** Named, allow-listed analytics action to record on success. */
  track: ClickAction;
  /** Clear the form after a successful submit. */
  onSuccess?: () => void;
  /**
   * Map a non-OK status to a user-facing message. Return undefined to fall back
   * to the server's `error` field, then a generic message.
   */
  message?: (status: number, body: { error?: string }) => string | undefined;
}

/**
 * The submit lifecycle shared by every simple POST form (contact, guestbook, …):
 * guard against double-submit, POST JSON, map failures to a friendly message,
 * track success. The form component owns only its fields and copy.
 */
export function useSubmit<T>(opts: UseSubmitOptions<T>) {
  const state = ref<SubmitState>("idle");
  const error = ref("");

  async function submit(): Promise<void> {
    if (state.value === "sending") return;
    state.value = "sending";
    error.value = "";
    try {
      const res = await fetch(apiUrl(opts.path), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(opts.body()),
      });
      if (res.ok) {
        state.value = "sent";
        trackClick(opts.track);
        opts.onSuccess?.();
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      error.value =
        opts.message?.(res.status, body) ?? body.error ?? `Something went wrong (${res.status}).`;
      state.value = "error";
    } catch {
      error.value = "Couldn't reach the server. Please try again.";
      state.value = "error";
    }
  }

  return { state, error, submit };
}
