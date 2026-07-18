import { ref } from "vue";
import { PRESENCE_CATEGORIES, RETENTION_OPTIONS, type PresenceCategory } from "@lg/core";

/**
 * The presence/playtime settings slice of the CMS.
 *
 * Pulled out of the 1200-line `useCms` monolith: it's a self-contained group —
 * four pieces of state and their toggles/save — that only needs the shared write
 * helpers passed in. `useCms` calls this and spreads the result into its return,
 * so the panels that `inject()` the context see the same members as before; this
 * is purely where the code lives, not how it's consumed.
 *
 * Copy lives here (it's UI); the *list* comes from `PRESENCE_CATEGORIES`, which is
 * what the resolver filters on and the write schema validates against. A seventh
 * category would appear here automatically; a renamed one can't render a toggle
 * that silently saves nothing.
 */
const PRESENCE_COPY: Record<PresenceCategory, { label: string; hint: string }> = {
  game: { label: "Games", hint: "Discord 'Playing …'" },
  streaming: { label: "Streaming", hint: "going live" },
  music: { label: "Music", hint: "Spotify" },
  watching: { label: "Watching", hint: "e.g. YouTube" },
  custom: { label: "Custom status", hint: "your set status + emoji" },
  steam: { label: "Steam", hint: "recently-played section" },
};

const PRESENCE_OPTIONS: { key: PresenceCategory; label: string; hint: string }[] =
  PRESENCE_CATEGORIES.map((key) => ({ key, ...PRESENCE_COPY[key] }));

/** Shared write helpers the settings slice needs from the parent CMS. */
export interface PresenceDeps {
  /** Run a mutation with the CMS's error/toast handling. */
  guarded: (fn: () => Promise<unknown>) => Promise<void>;
  /** The CMS API client (its `put` takes a resource + body). */
  cms: { put: (resource: string, body: unknown) => Promise<unknown> };
}

export function usePresenceSettings({ guarded, cms }: PresenceDeps) {
  // DISPLAY axis: what the live widget reveals.
  const presenceShow = ref<PresenceCategory[]>([]);
  function togglePresence(key: PresenceCategory) {
    const s = presenceShow.value;
    presenceShow.value = s.includes(key) ? s.filter((k) => k !== key) : [...s, key];
  }

  // RECORD axis — independent of display. A category can be sampled but hidden
  // (collect quietly) or shown but not sampled (live only, no history).
  const presenceSample = ref<PresenceCategory[]>([]);
  function toggleSample(key: PresenceCategory) {
    const s = presenceSample.value;
    presenceSample.value = s.includes(key) ? s.filter((k) => k !== key) : [...s, key];
  }

  // Retention: null = forever, else days. Constrained to RETENTION_OPTIONS.
  const presenceRetention = ref<number | null>(null);

  // Games recorded but never shown on the public chart. Edited as a textarea, one
  // per line — the panel splits/joins so the ref stays a clean string[].
  const presenceHidden = ref<string[]>([]);

  const savePresence = () =>
    guarded(() =>
      cms.put("presence", {
        show: presenceShow.value,
        sample: presenceSample.value,
        retentionDays: presenceRetention.value,
        hiddenGames: presenceHidden.value,
      }),
    );

  /** Load the four fields from the site content the CMS fetched. */
  function hydrate(p: {
    show?: PresenceCategory[];
    sample?: PresenceCategory[];
    retentionDays?: number | null;
    hiddenGames?: string[];
  } | undefined) {
    presenceShow.value = p?.show ?? [];
    presenceSample.value = p?.sample ?? p?.show ?? [];
    presenceRetention.value = p?.retentionDays ?? null;
    presenceHidden.value = p?.hiddenGames ?? [];
  }

  return {
    PRESENCE_OPTIONS,
    RETENTION_OPTIONS,
    presenceShow,
    presenceSample,
    presenceRetention,
    presenceHidden,
    togglePresence,
    toggleSample,
    savePresence,
    hydratePresence: hydrate,
  };
}
