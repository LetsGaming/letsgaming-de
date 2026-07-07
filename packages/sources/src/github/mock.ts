/**
 * A stand-in GitHub source for local dev when no token is set. It returns the
 * normalized shape directly (identity normalize), so the site renders end-to-end
 * offline. Data is deterministic — no randomness — so dev builds are stable.
 *
 * This is dev scaffolding, clearly labelled: production registers the real
 * `githubSource`, which requires a token for the contribution calendar.
 */

import type { GitHubData, Source } from "@lg/core";

/** A stable 182-day contribution ramp so the heatmap looks alive without RNG. */
function demoContributions(): number[] {
  const days: number[] = [];
  for (let i = 0; i < 182; i++) {
    // Deterministic pseudo-pattern: weekly rhythm + a slow upward drift.
    const weekday = i % 7;
    const base = weekday === 0 || weekday === 6 ? 0 : 1;
    const wave = Math.round(2 + 2 * Math.sin(i / 9));
    days.push(Math.max(0, base + (i % 5 === 0 ? wave : weekday === 3 ? wave - 1 : base)));
  }
  return days;
}

const DEMO: GitHubData = {
  stats: { repos: 17, commitsYear: 428, commitsAllTime: 2100, longestStreakDays: 19 },
  languages: [
    { name: "TypeScript", pct: 42 },
    { name: "Python", pct: 31 },
    { name: "JavaScript", pct: 14 },
    { name: "CSS", pct: 8 },
    { name: "Shell", pct: 5 },
  ],
  contributions: demoContributions(),
  repos: [
    { name: "plantcare-tracker", stars: 3, pushedAt: daysAgo(2) },
    { name: "LED-Controller-Websocket", stars: 1, pushedAt: daysAgo(6) },
    { name: "dotfiles", stars: 0, pushedAt: daysAgo(16) },
  ],
  events: [
    {
      type: "commit",
      text: "Pushed 3 commits to plantcare-tracker",
      meta: "refactor watering schedule",
      at: daysAgo(2),
    },
    {
      type: "pr",
      text: "Opened a PR in LED-Controller-Websocket",
      meta: "add effects API",
      at: daysAgo(6),
    },
    { type: "star", text: "Starred tsparticles", at: daysAgo(9) },
    { type: "repo", text: "Created dotfiles", meta: "initial commit", at: daysAgo(16) },
  ],
};

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString();
}

export function githubMockSource(): Source<GitHubData, GitHubData> {
  return {
    id: "github",
    targetArea: "work",
    schedule: "0 */6 * * *",
    fetch: async () => DEMO,
    normalize: (raw) => raw,
  };
}
