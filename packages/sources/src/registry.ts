/**
 * The source registry. This is the one place the app learns which sources exist.
 * Adding a source at launch+1 is: write the adapter, add one line here.
 *
 * Selection is by config: with a GitHub token we register the real adapter; in
 * dev without one we fall back to the deterministic mock so the site still
 * renders. The rest of the system can't tell the difference — both emit the same
 * normalized `GitHubData`.
 */

import type { Source } from "@lg/core";
import { githubSource } from "./github/index.js";
import { githubMockSource } from "./github/mock.js";
import { wakapiSource } from "./wakapi/index.js";
import { wakapiMockSource } from "./wakapi/mock.js";
import { steamSource } from "./steam/index.js";
import { steamMockSource } from "./steam/mock.js";

export interface SourcesEnv {
  githubUsername?: string;
  githubToken?: string;
  /** Wakapi (LAN-only) coding-time tracker. Both required to activate. */
  wakapiUrl?: string;
  wakapiKey?: string;
  /** Steam Web API. Both required to activate. */
  steamApiKey?: string;
  steamId?: string;
  /** In dev, register deterministic mocks for unconfigured sources so the site
   *  still renders end-to-end. Off in production (an unconfigured source is simply
   *  absent). */
  useMocks?: boolean;
}

export interface RegisteredSource {
  source: Source;
  /** True when this is the dev stand-in rather than a live integration. */
  mock: boolean;
}

export function getSources(env: SourcesEnv): RegisteredSource[] {
  const username = env.githubUsername ?? "LetsGaming";
  const sources: RegisteredSource[] = [];
  const mocks = env.useMocks ?? false;

  // GitHub — real with a token, else the dev mock (keeps the site alive offline).
  if (env.githubToken) {
    sources.push({ source: githubSource({ username, token: env.githubToken }), mock: false });
  } else {
    sources.push({ source: githubMockSource(), mock: true });
  }

  // Wakapi — LAN-only; register only when configured (else mock in dev).
  if (env.wakapiUrl && env.wakapiKey) {
    sources.push({ source: wakapiSource({ url: env.wakapiUrl, key: env.wakapiKey }), mock: false });
  } else if (mocks) {
    sources.push({ source: wakapiMockSource(), mock: true });
  }

  // Steam — public Web API; register only when configured (else mock in dev).
  if (env.steamApiKey && env.steamId) {
    sources.push({
      source: steamSource({ apiKey: env.steamApiKey, steamId: env.steamId }),
      mock: false,
    });
  } else if (mocks) {
    sources.push({ source: steamMockSource(), mock: true });
  }

  return sources;
}
