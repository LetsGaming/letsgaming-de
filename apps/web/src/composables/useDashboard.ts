import { computed, ref, type Ref } from "vue";
import type { AnalyticsResponse } from "@lg/core";
import { AuthError, type SyncRunResponse } from "../lib/cms";
import { visitsSummary, type VisitsSummary } from "../lib/dashboardData";
import { readLastPage } from "./editorHelpers";

const WEEK_HOURS = 168;

export interface DashboardDeps {
  cms: {
    analytics: (opts: { hours?: number; tz?: string }) => Promise<AnalyticsResponse>;
    syncSource: (source: string) => Promise<SyncRunResponse>;
  };
  authed: Ref<boolean>;
  flash: (msg: string) => void;
  loadStatus: (opts?: { quiet?: boolean }) => Promise<void>;
  /** Pages the editor knows about, to validate the remembered one. */
  pages: Ref<{ id: string }[]>;
  areaLabel: (id: string) => string;
  /** Moves the editor to a page. */
  goPage: (id: string) => void;
  pick: (view: "editor") => void;
}

/** The dashboard's own data: last week's confirmed visits, sync-now, and "continue editing". */
export function useDashboard({ cms, authed, flash, loadStatus, pages, areaLabel, goPage, pick }: DashboardDeps) {
  const visits = ref<VisitsSummary | null>(null);
  const visitsError = ref(false);

  async function loadVisits() {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      visits.value = visitsSummary(await cms.analytics({ hours: WEEK_HOURS, tz }));
      visitsError.value = false;
    } catch (e) {
      if (e instanceof AuthError) authed.value = false;
      else visitsError.value = true;
    }
  }

  const syncing = ref<string[]>([]);
  async function syncNow(id: string) {
    if (syncing.value.includes(id)) return;
    syncing.value = [...syncing.value, id];
    try {
      const run = await cms.syncSource(id);
      if (!run.ok) flash(run.error ?? "Sync failed.");
      await loadStatus({ quiet: true });
    } catch (e) {
      if (e instanceof AuthError) authed.value = false;
      else flash((e as Error).message || "Sync failed.");
    } finally {
      syncing.value = syncing.value.filter((s) => s !== id);
    }
  }

  const continuePage = computed(() => {
    const last = readLastPage();
    const id = last && pages.value.some((p) => p.id === last) ? last : pages.value[0]?.id;
    return id ? { id, label: areaLabel(id) } : null;
  });

  function continueEditing() {
    if (continuePage.value) goPage(continuePage.value.id);
    pick("editor");
  }

  return { visits, visitsError, loadVisits, syncing, syncNow, continuePage, continueEditing };
}
