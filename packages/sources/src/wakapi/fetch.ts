/**
 * Wakapi fetch layer. Wakapi is a self-hosted, WakaTime-compatible coding-time
 * tracker; we hit its WakaTime-compat stats endpoint over the LAN (never public
 * — the sync worker calls it server-side; the browser only ever reads the store).
 *
 * Kept separate from normalize() so the mapping stays a pure, testable function.
 */

export interface WakapiConfig {
  /** Base URL of the Wakapi instance, e.g. http://192.168.2.20:3000 (LAN only). */
  url: string;
  /** Wakapi API key (read access). Sent as WakaTime-style Basic auth. */
  key: string;
  /** Range slug; WakaTime supports last_7_days, last_30_days, etc. */
  range?: string;
  /** Override for tests. */
  fetchImpl?: typeof fetch;
}

// ── Raw WakaTime-compat shapes (only the fields we ask for) ──────────────────

export interface RawWakaLanguage {
  name: string;
  total_seconds: number;
  percent: number;
}

export interface WakapiRaw {
  data: {
    range?: { range?: string } | string;
    human_readable_range?: string;
    total_seconds?: number;
    languages: RawWakaLanguage[];
  };
}

/** Fetch coding-time stats from Wakapi. Throws on HTTP errors. */
export async function fetchWakapi(config: WakapiConfig): Promise<WakapiRaw> {
  const doFetch = config.fetchImpl ?? fetch;
  const range = config.range ?? "last_7_days";
  const base = config.url.replace(/\/$/, "");
  const url = `${base}/api/compat/wakatime/v1/users/current/stats/${encodeURIComponent(range)}`;
  // WakaTime auth: Basic <base64(api_key)>.
  const auth = Buffer.from(config.key).toString("base64");
  const res = await doFetch(url, {
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Wakapi HTTP ${res.status}: ${await res.text()}`);
  return (await res.json()) as WakapiRaw;
}
