/**
 * GitHub fetch layer. Kept separate from normalization so `normalize()` stays a
 * pure, testable function over raw shapes (that's why the Source contract splits
 * the two). One GraphQL round-trip gets everything the launch dashboard needs.
 */

import { err, ok, sourceError, type Result } from "@lg/core";
import { fetchJson } from "../http.js";

export interface GitHubConfig {
  username: string;
  /** Personal access token. Required for the contribution calendar. */
  token: string;
  /** Override for tests. */
  endpoint?: string;
}

const graphqlHeaders = (config: GitHubConfig) => ({
  Authorization: `bearer ${config.token}`,
  "Content-Type": "application/json",
  "User-Agent": "letsgaming-de-sync",
});

// ── Raw GraphQL shapes (only the fields we ask for) ──────────────────────────

export interface RawRepo {
  name: string;
  stargazerCount: number;
  isFork: boolean;
  pushedAt: string;
  primaryLanguage: { name: string } | null;
  languages: { edges: { size: number; node: { name: string } }[] };
  description?: string | null;
  url?: string;
  isArchived?: boolean;
  /** Latest release for this repo, if any (§ GitHub extras). */
  releases?: { nodes: RawReleaseNode[] };
}

interface RawReleaseNode {
  name: string | null;
  tagName: string;
  url: string;
  publishedAt: string | null;
}

export interface RawContributionDay {
  contributionCount: number;
  date: string;
}

export interface GitHubRaw {
  login: string;
  /** The account's true non-fork public repo count (GraphQL `totalCount`). Can
   *  exceed `repos.length` — see the cap note on the `repositories(...)` query. */
  repositoriesTotal: number;
  /** The 100 most recently pushed non-fork public repos, not every repo. Used
   *  for the language mix and repo cards; `repositoriesTotal` is the displayed
   *  count and does not come from this array's length. */
  repos: RawRepo[];
  /** Repo names pinned on the profile, in pin order. */
  pinned?: string[];
  yearCommits: number;
  /** Sum of commit contributions across every year since the account was created. */
  allTimeCommits: number;
  calendarTotal: number;
  days: RawContributionDay[];
  /** Recent public events for the feed (from REST — GraphQL's feed is awkward). */
  events: RawEvent[];
  /** Latest release per repo, flattened (§ GitHub extras). */
  releases?: RawRelease[];
  /** Recently merged pull requests. */
  mergedPrs?: RawMergedPr[];
  /** Public gists. */
  gists?: RawGist[];
}

export interface RawRelease {
  repo: string;
  name: string | null;
  tagName: string;
  url: string;
  publishedAt: string | null;
}

export interface RawMergedPr {
  repo: string;
  title: string;
  url: string;
  mergedAt: string | null;
}

export interface RawGist {
  description: string | null;
  url: string;
  files: number;
  updatedAt: string;
}

export interface RawEvent {
  type: string;
  repo: string;
  createdAt: string;
  detail?: string;
}

const QUERY = /* GraphQL */ `
query($login: String!) {
  user(login: $login) {
    createdAt
    pinnedItems(first: 6, types: REPOSITORY) {
      nodes { ... on Repository { name } }
    }
    # Deliberate top-100-most-recently-pushed cap, same shape as pinnedItems/
    # pullRequests/gists below. Past 100 non-fork public repos, repositoriesTotal
    # (totalCount, used for the displayed repo count) and this list diverge:
    # totalCount still reports every repo, but the list — and everything derived
    # from it in normalize() (language mix, repo cards) — only reflects the 100
    # most recently pushed. No cursor pagination on purpose: recency ordering
    # means an account with more repos than this just shows its most-active
    # slice, which is what the dashboard wants anyway.
    repositories(first: 100, ownerAffiliations: OWNER, privacy: PUBLIC, isFork: false, orderBy: {field: PUSHED_AT, direction: DESC}) {
      totalCount
      nodes {
        name
        description
        url
        isFork
        isArchived
        stargazerCount
        pushedAt
        primaryLanguage { name }
        languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
          edges { size node { name } }
        }
        releases(first: 1, orderBy: {field: CREATED_AT, direction: DESC}) {
          nodes { name tagName url publishedAt }
        }
      }
    }
    pullRequests(first: 8, states: MERGED, orderBy: {field: UPDATED_AT, direction: DESC}) {
      nodes { title url mergedAt repository { name } }
    }
    gists(first: 8, privacy: PUBLIC, orderBy: {field: UPDATED_AT, direction: DESC}) {
      # Explicit cap: "files" with no "first" arg falls back to the schema's own
      # default, which would silently undercount g.files.length below for any
      # gist with more files than that default.
      nodes { description url updatedAt files(first: 20) { name } }
    }
    contributionsCollection {
      totalCommitContributions
      contributionCalendar {
        totalContributions
        weeks { contributionDays { contributionCount date } }
      }
    }
  }
}`;

/** Fetch everything from GitHub. Returns a typed Result (never throws). */
export async function fetchGitHub(config: GitHubConfig): Promise<Result<GitHubRaw>> {
  const endpoint = config.endpoint ?? "https://api.github.com/graphql";
  const res = await fetchJson<{ data?: { user: RawUser | null }; errors?: { message: string }[] }>(
    endpoint,
    {
      init: {
        method: "POST",
        headers: graphqlHeaders(config),
        body: JSON.stringify({ query: QUERY, variables: { login: config.username } }),
      },
    },
  );
  if (!res.ok) return err(res.error);
  const json = res.value;
  if (json.errors?.length) {
    return err(sourceError("upstream", `GitHub GraphQL: ${json.errors[0]!.message}`));
  }
  const user = json.data?.user;
  if (!user) return err(sourceError("upstream", `GitHub user "${config.username}" not found.`));

  // A failed all-time query keeps the last-good snapshot rather than zeroing the
  // headline number (BUG-03), so it fails the whole fetch.
  const allTime = await fetchAllTimeCommits(config, user.createdAt);
  if (!allTime.ok) return err(allTime.error);

  const days = user.contributionsCollection.contributionCalendar.weeks.flatMap(
    (w) => w.contributionDays,
  );

  return ok({
    login: config.username,
    repositoriesTotal: user.repositories.totalCount,
    repos: user.repositories.nodes,
    pinned: (user.pinnedItems?.nodes ?? []).map((n) => n.name).filter((n): n is string => !!n),
    yearCommits: user.contributionsCollection.totalCommitContributions,
    allTimeCommits: allTime.value,
    calendarTotal: user.contributionsCollection.contributionCalendar.totalContributions,
    days,
    events: await fetchEvents(config),
    // Latest release per repo, flattened (normalize sorts + caps).
    releases: user.repositories.nodes.flatMap((r) =>
      (r.releases?.nodes ?? []).map((rel) => ({
        repo: r.name,
        name: rel.name,
        tagName: rel.tagName,
        url: rel.url,
        publishedAt: rel.publishedAt,
      })),
    ),
    // A merged PR whose source repo was since deleted/renamed reports
    // `repository: null` — drop it rather than surface a card with a blank repo
    // name; a card that can't say what it was merged into isn't useful.
    mergedPrs: (user.pullRequests?.nodes ?? [])
      .filter((p): p is typeof p & { repository: { name: string } } => p.repository !== null)
      .map((p) => ({
        repo: p.repository.name,
        title: p.title,
        url: p.url,
        mergedAt: p.mergedAt,
      })),
    gists: (user.gists?.nodes ?? []).map((g) => ({
      description: g.description,
      url: g.url,
      files: g.files.length,
      updatedAt: g.updatedAt,
    })),
  });
}

/**
 * Sum commit contributions across every year since the account was created.
 * GitHub exposes no lifetime total, so we query one `contributionsCollection`
 * window per year (aliased into a single request) and add them up.
 */
async function fetchAllTimeCommits(config: GitHubConfig, createdAt: string): Promise<Result<number>> {
  const endpoint = config.endpoint ?? "https://api.github.com/graphql";
  const startYear = new Date(createdAt).getUTCFullYear();
  const nowYear = new Date().getUTCFullYear();
  const years: number[] = [];
  for (let y = startYear; y <= nowYear; y++) years.push(y);

  const fields = years
    .map(
      (y) =>
        `y${y}: contributionsCollection(from: "${y}-01-01T00:00:00Z", to: "${y}-12-31T23:59:59Z") { totalCommitContributions }`,
    )
    .join("\n");
  const query = `query($login: String!) { user(login: $login) { ${fields} } }`;

  const body = JSON.stringify({ query, variables: { login: config.username } });
  // No blind retry: a failure returns a typed error, the sync keeps its last-good
  // snapshot, and the next scheduled run tries again.
  const res = await fetchJson<{
    data?: { user: Record<string, { totalCommitContributions: number }> | null };
    errors?: { message: string }[];
  }>(endpoint, { init: { method: "POST", headers: graphqlHeaders(config), body } });
  if (!res.ok) return err(res.error);
  const json = res.value;
  if (json.errors?.length) {
    return err(sourceError("upstream", `GitHub all-time commits: ${json.errors[0]!.message}`));
  }
  const user = json.data?.user;
  if (!user) {
    return err(sourceError("upstream", `GitHub all-time commits: user "${config.username}" not found.`));
  }
  return ok(years.reduce((sum, y) => sum + (user[`y${y}`]?.totalCommitContributions ?? 0), 0));
}

interface RawUser {
  createdAt: string;
  pinnedItems?: { nodes: { name?: string }[] };
  repositories: { totalCount: number; nodes: RawRepo[] };
  pullRequests?: {
    nodes: { title: string; url: string; mergedAt: string | null; repository: { name: string } | null }[];
  };
  gists?: {
    nodes: { description: string | null; url: string; updatedAt: string; files: ({ name: string | null } | null)[] }[];
  };
  contributionsCollection: {
    totalCommitContributions: number;
    contributionCalendar: {
      totalContributions: number;
      weeks: { contributionDays: RawContributionDay[] }[];
    };
  };
}

/** Recent public events via REST, mapped to a compact raw shape. */
async function fetchEvents(config: GitHubConfig): Promise<RawEvent[]> {
  const url = `https://api.github.com/users/${encodeURIComponent(config.username)}/events/public?per_page=20`;
  const res = await fetchJson<GitHubRestEvent[]>(url, {
    init: {
      headers: {
        Authorization: `bearer ${config.token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "letsgaming-de-sync",
      },
    },
  });
  if (!res.ok) return []; // events are non-critical: a failure just means none shown
  const raw = res.value;
  // An event whose source repo was since deleted/renamed reports no `repo.name`
  // — drop it rather than surface a feed card with a blank repo name.
  return raw.flatMap((e) => {
    const repoName = e.repo?.name;
    if (!repoName) return [];
    return [{ type: e.type, repo: repoName.split("/").pop() ?? repoName, createdAt: e.created_at, detail: eventDetail(e) }];
  });
}

interface GitHubRestEvent {
  type: string;
  created_at: string;
  repo?: { name?: string };
  payload?: {
    commits?: { message: string }[];
    pull_request?: { title: string };
    action?: string;
    ref_type?: string;
  };
}

function eventDetail(e: GitHubRestEvent): string | undefined {
  if (e.type === "PushEvent") return e.payload?.commits?.[0]?.message;
  if (e.type === "PullRequestEvent") return e.payload?.pull_request?.title;
  if (e.type === "CreateEvent") return e.payload?.ref_type;
  return undefined;
}
