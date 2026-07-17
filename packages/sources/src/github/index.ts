/**
 * The GitHub adapter — one implementation of `Source<GitHubRaw, GitHubData>`.
 *
 * `normalize` is pure: raw GitHub shapes in, the normalized common shape out.
 * That's the only thing anything downstream ever sees. `fetch` is the impure
 * half (network), kept in `fetch.ts` so this stays unit-testable.
 */

import { SOURCE_TTL, type GitHubData, type GitHubEvent, type GitHubEventType, type Source } from "@lg/core";
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
    // Newest-push first (the query orders by PUSHED_AT desc); forks are excluded
    // at the query, archived repos are dropped here.
    repos: raw.repos
      .filter((r) => !r.isFork && !r.isArchived)
      .map((r) => ({
        name: r.name,
        stars: r.stargazerCount,
        pushedAt: r.pushedAt,
        url: r.url ?? `https://github.com/${raw.login}/${r.name}`,
        ...(r.description ? { description: r.description } : {}),
        ...(r.primaryLanguage?.name ? { language: r.primaryLanguage.name } : {}),
      })),
    pinned: raw.pinned ?? [],
    // GitHub extras: drop incomplete rows, newest-first, capped for a tidy feed.
    releases: (raw.releases ?? [])
      .filter((r): r is typeof r & { publishedAt: string } => Boolean(r.publishedAt))
      .map((r) => ({
        repo: r.repo,
        name: r.name ?? r.tagName,
        tagName: r.tagName,
        url: r.url,
        publishedAt: r.publishedAt,
      }))
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
      .slice(0, 6),
    mergedPrs: (raw.mergedPrs ?? [])
      .filter((p): p is typeof p & { mergedAt: string } => Boolean(p.mergedAt))
      .map((p) => ({ repo: p.repo, title: p.title, url: p.url, mergedAt: p.mergedAt }))
      .sort((a, b) => b.mergedAt.localeCompare(a.mergedAt))
      .slice(0, 6),
    gists: (raw.gists ?? [])
      .map((g) => ({
        description: g.description ?? "",
        url: g.url,
        files: g.files,
        updatedAt: g.updatedAt,
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 6),
  };
}

/** Build the GitHub source. `schedule` is a cron-ish interval read by the runner. */
export function githubSource(config: GitHubConfig): Source<GitHubRaw, GitHubData> {
  return {
    id: "github",
    schedule: "0 */6 * * *", // every 6 hours
    ttl: SOURCE_TTL.github,
    fetch: () => fetchGitHub(config),
    normalize: normalizeGitHub,
  };
}
