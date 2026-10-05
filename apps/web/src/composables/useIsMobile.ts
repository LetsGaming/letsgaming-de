import { onBeforeUnmount, onMounted, ref } from "vue";

/** Below this width the CMS offers the compact editing mode instead of the builder. */
export const MOBILE_QUERY = "(max-width: 719.98px)";

/**
 * Whether the viewport is in mobile mode. False until mounted so the server and
 * the first client render agree; the real value lands right after hydration.
 */
export function useIsMobile() {
  const isMobile = ref(false);
  let mq: MediaQueryList | undefined;
  const sync = () => (isMobile.value = !!mq?.matches);
  onMounted(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    mq = window.matchMedia(MOBILE_QUERY);
    sync();
    mq.addEventListener("change", sync);
  });
  onBeforeUnmount(() => mq?.removeEventListener("change", sync));
  return isMobile;
}
