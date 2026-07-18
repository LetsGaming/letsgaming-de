import { onBeforeUnmount, onMounted, ref, toValue, watch, type MaybeRefOrGetter } from "vue";
import type { PresenceView } from "@lg/core";
import { fetchPresence } from "../lib/presence-api";

/**
 * Polls the server-filtered Discord presence while the widget is enabled.
 *
 * Pulls the fetch + poll loop out of the component (a component doesn't fetch —
 * see the frontend standards). The widget just renders `view`. Whether Discord is
 * configured or online is the server's concern: this polls regardless and the
 * server answers with a filtered snapshot or an offline view. `enabled` is the
 * CMS display toggle; polling starts/stops with it.
 *
 * `unreachable` is the honest "we couldn't reach the relay and have never had a
 * snapshot" state — distinct from a successful *offline* response, which is a real
 * fact about the account and renders as such. A hiccup keeps the last snapshot.
 */
const POLL_MS = 25_000;

export function usePresence(enabled: MaybeRefOrGetter<boolean>) {
  const view = ref<PresenceView | null>(null);
  const loaded = ref(false);
  const unreachable = ref(false);
  let timer: ReturnType<typeof setInterval> | null = null;

  async function refresh() {
    const next = await fetchPresence();
    if (next) {
      view.value = next;
      unreachable.value = false;
    } else {
      // Keep the last snapshot on a hiccup — old-and-labelled beats blank. Only
      // claim "unreachable" when there's never been a snapshot to fall back to.
      unreachable.value = view.value === null;
    }
    loaded.value = true;
  }

  function start() {
    if (timer) return;
    void refresh();
    timer = setInterval(refresh, POLL_MS);
  }
  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  onMounted(() => {
    if (toValue(enabled)) start();
  });
  watch(
    () => toValue(enabled),
    (on) => (on ? start() : stop()),
  );
  onBeforeUnmount(stop);

  return { view, loaded, unreachable };
}
