import { computed, ref, watch, type Ref } from "vue";
import { AuthError, cms } from "../lib/cms";
import { statsPlacement, type SectionsResponse } from "../lib/sectionStats";

const STORAGE_KEY = "lg.cms.editor.stats";

export const STATS_RANGES = [
  { hours: 24, label: "Last 24 hours" },
  { hours: 168, label: "Last 7 days" },
  { hours: 720, label: "Last 30 days" },
  { hours: 2160, label: "Last 90 days" },
] as const;

function readOn(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** The editor's "Show stats" state: toggle, range, and the per-page numbers behind them. */
export function useSectionStats(area: Ref<string>) {
  const on = ref(readOn());
  const hours = ref<number>(168);
  const status = ref<"idle" | "loading" | "error" | "ready">("idle");
  const data = ref<SectionsResponse | null>(null);
  let reqId = 0;

  async function load() {
    const id = ++reqId;
    status.value = "loading";
    try {
      const res = await cms.sections(area.value, hours.value);
      if (id !== reqId) return;
      data.value = res;
      status.value = "ready";
    } catch (e) {
      if (id !== reqId) return;
      status.value = e instanceof AuthError ? "idle" : "error";
    }
  }

  watch(on, (v) => {
    try {
      localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
    } catch {
      /* the toggle just won't be remembered */
    }
  });
  watch([on, area, hours], () => (on.value ? void load() : void reqId++), { immediate: true });

  const placement = computed(() =>
    statsPlacement(status.value === "ready" ? data.value?.sections.find((s) => s.key === area.value) : undefined),
  );

  return { on, hours, status, data, placement, reload: load };
}
