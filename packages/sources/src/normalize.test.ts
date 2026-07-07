import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeGitHub } from "./github/index.js";
import type { GitHubRaw } from "./github/fetch.js";

const raw: GitHubRaw = {
  login: "LetsGaming",
  repositoriesTotal: 17,
  repos: [
    {
      name: "a", stargazerCount: 3, isFork: false, pushedAt: "2026-01-01T00:00:00Z",
      primaryLanguage: { name: "TypeScript" },
      languages: { edges: [{ size: 800, node: { name: "TypeScript" } }, { size: 200, node: { name: "CSS" } }] },
    },
    {
      name: "fork", stargazerCount: 0, isFork: true, pushedAt: "2026-01-01T00:00:00Z",
      primaryLanguage: { name: "Go" },
      languages: { edges: [{ size: 100000, node: { name: "Go" } }] },
    },
  ],
  yearCommits: 428,
  allTimeCommits: 2100,
  calendarTotal: 500,
  days: [
    { contributionCount: 1, date: "2026-01-01" },
    { contributionCount: 2, date: "2026-01-02" },
    { contributionCount: 0, date: "2026-01-03" },
    { contributionCount: 5, date: "2026-01-04" },
    { contributionCount: 3, date: "2026-01-05" },
  ],
  events: [
    { type: "PushEvent", repo: "a", createdAt: "2026-01-05T00:00:00Z", detail: "fix bug" },
    { type: "MemberEvent", repo: "a", createdAt: "2026-01-05T00:00:00Z" },
  ],
};

test("languages aggregate and exclude forks", () => {
  const d = normalizeGitHub(raw);
  const names = d.languages.map((l) => l.name);
  assert.ok(names.includes("TypeScript"));
  assert.ok(!names.includes("Go"), "forked repo language is excluded");
  assert.equal(d.languages[0]?.name, "TypeScript");
});

test("longest streak is computed from the calendar", () => {
  const d = normalizeGitHub(raw);
  assert.equal(d.stats.longestStreakDays, 2); // days 1,2 then gap, then 4,5
});

test("only known event types survive, mapped to normalized types", () => {
  const d = normalizeGitHub(raw);
  assert.equal(d.events.length, 1);
  assert.equal(d.events[0]?.type, "commit");
  assert.equal(d.events[0]?.meta, "fix bug");
});

test("contributions pass through per-day", () => {
  const d = normalizeGitHub(raw);
  assert.deepEqual(d.contributions, [1, 2, 0, 5, 3]);
});

test("all-time commits and non-fork repos are surfaced", () => {
  const d = normalizeGitHub(raw);
  assert.equal(d.stats.commitsAllTime, 2100);
  assert.equal(d.repos?.length, 1);
  assert.equal(d.repos?.[0]?.name, "a");
  assert.equal(d.repos?.[0]?.stars, 3);
});
