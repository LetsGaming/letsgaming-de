import { onBeforeUnmount, onMounted, shallowRef } from "vue";
import type { ResolvedModule } from "@lg/core";
import { fetchModule } from "../lib/module-api";

/**
 * Keeps a module's data fresh by polling `/api/module/:id`, so playtime and music
 * update in place the way presence does — no page reload.
 *
 * Mirrors `usePresence`: the component renders `data`, which starts as the
 * SSR-resolved value and is replaced on each successful poll; a failed poll keeps
 * the last good data (stale-but-real beats a flash of empty). Polling is tied to
 * the component lifecycle, so it stops when you navigate away and the island
 * unmounts — nothing runs for a module you're not looking at.
 *
 * `shallowRef`: the data is a whole resolved slice swapped wholesale, so deep
 * reactivity would be wasted work. The locale is read from `<html lang>` so a
 * refresh matches what the page was rendered in.
 *
 * `kind` guards the swap at runtime: a response whose kind doesn't match (a wrong
 * id landing on another module) is ignored rather than mis-rendered. That runtime
 * check is what justifies the single cast — the fetch returns the module union,
 * and we've just proven this one is the caller's kind, so its `data` is `T`.
 */
const POLL_MS = 60_000;

export function useLiveModule<T>(id: string, kind: ResolvedModule["kind"], initial: T) {
  const data = shallowRef<T>(initial);
  let timer: ReturnType<typeof setInterval> | null = null;

  async function refresh(): Promise<void> {
    const locale = document.documentElement.lang || "en";
    const next = await fetchModule(id, locale);
    if (next && next.kind === kind) {
      data.value = next.data as T;
    }
  }

  onMounted(() => {
    timer = setInterval(refresh, POLL_MS);
  });
  onBeforeUnmount(() => {
    if (timer) clearInterval(timer);
    timer = null;
  });

  return { data };
}
