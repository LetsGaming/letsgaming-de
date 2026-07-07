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

export interface SourcesEnv {
  githubUsername?: string;
  githubToken?: string;
}

export interface RegisteredSource {
  source: Source;
  /** True when this is the dev stand-in rather than a live integration. */
  mock: boolean;
}

export function getSources(env: SourcesEnv): RegisteredSource[] {
  const username = env.githubUsername ?? "LetsGaming";
  const sources: RegisteredSource[] = [];

  if (env.githubToken) {
    sources.push({ source: githubSource({ username, token: env.githubToken }), mock: false });
  } else {
    sources.push({ source: githubMockSource(), mock: true });
  }

  // Future sources register here, e.g.:
  //   sources.push({ source: someSource(config), mock: false });

  return sources;
}
