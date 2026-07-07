/**
 * The GitHub adapter — one implementation of `Source<GitHubRaw, GitHubData>`.
 *
 * `normalize` is pure: raw GitHub shapes in, the normalized common shape out.
 * That's the only thing anything downstream ever sees. `fetch` is the impure
 * half (network), kept in `fetch.ts` so this stays unit-testable.
 */

import type { GitHubData, GitHubEvent, GitHubEventType, Source } from "@lg/core";
import { fetchGitHub, type GitHubConfig, type GitHubRaw, type RawEvent } from "./fetch.js";

/** Aggregate language bytes across repos into percentages, top languages first. */
function normalizeLanguages(raw: GitHubRaw): GitHubData["languages"] {
  const bytes = new Map<string, number>();
  for (const repo of raw.repos) {
    if (repo.isFork) continue; // don't let forks skew the language mix
    for (const edge of repo.languages.edges) {
      bytes.set(edge.node.name, (bytes.get(edge.node.name) ?? 0) + edge.size);
    }
  }
  const total = [...bytes.values()].reduce((a, b) => a + b, 0);
  if (total === 0) return [];
  return [...bytes.entries()]
    .map(([name, size]) => ({ name, pct: Math.round((size / total) * 100) }))
    .filter((l) => l.pct > 0)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 6);
}

/** Longest run of consecutive days with at least one contribution. */
function longestStreak(days: { contributionCount: number }[]): number {
  let best = 0;
  let run = 0;
  for (const day of days) {
    if (day.contributionCount > 0) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  return best;
}

const EVENT_TYPE: Record<string, GitHubEventType> = {
  PushEvent: "commit",
  PullRequestEvent: "pr",
  WatchEvent: "star",
  CreateEvent: "repo",
};

function normalizeEvent(e: RawEvent): GitHubEvent | null {
  const type = EVENT_TYPE[e.type];
  if (!type) return null;
  const text =
    type === "commit"
      ? `Pushed to ${e.repo}`
      : type === "pr"
        ? `Opened a PR in ${e.repo}`
        : type === "star"
          ? `Starred ${e.repo}`
          : `Created ${e.repo}`;
  return { type, text, ...(e.detail ? { meta: e.detail } : {}), at: e.createdAt };
}

export function normalizeGitHub(raw: GitHubRaw): GitHubData {
  return {
    stats: {
      repos: raw.repositoriesTotal,
      commitsYear: raw.yearCommits,
      commitsAllTime: raw.allTimeCommits,
      longestStreakDays: longestStreak(raw.days),
    },
    languages: normalizeLanguages(raw),
    contributions: raw.days.map((d) => d.contributionCount),
    events: raw.events
      .map(normalizeEvent)
      .filter((e): e is GitHubEvent => e !== null)
      .slice(0, 8),
    repos: raw.repos
      .filter((r) => !r.isFork)
      .map((r) => ({ name: r.name, stars: r.stargazerCount, pushedAt: r.pushedAt })),
  };
}

/** Build the GitHub source. `schedule` is a cron-ish interval read by the runner. */
export function githubSource(config: GitHubConfig): Source<GitHubRaw, GitHubData> {
  return {
    id: "github",
    targetArea: "work",
    schedule: "0 */6 * * *", // every 6 hours
    fetch: () => fetchGitHub(config),
    normalize: normalizeGitHub,
  };
}
