/**
 * GitHub fetch layer. Kept separate from normalization so `normalize()` stays a
 * pure, testable function over raw shapes (that's why the Source contract splits
 * the two). One GraphQL round-trip gets everything the launch dashboard needs.
 */

export interface GitHubConfig {
  username: string;
  /** Personal access token. Required for the contribution calendar. */
  token: string;
  /** Override for tests. */
  endpoint?: string;
}

// ── Raw GraphQL shapes (only the fields we ask for) ──────────────────────────

export interface RawRepo {
  name: string;
  stargazerCount: number;
  isFork: boolean;
  pushedAt: string;
  primaryLanguage: { name: string } | null;
  languages: { edges: { size: number; node: { name: string } }[] };
}

export interface RawContributionDay {
  contributionCount: number;
  date: string;
}

export interface GitHubRaw {
  login: string;
  repositoriesTotal: number;
  repos: RawRepo[];
  yearCommits: number;
  /** Sum of commit contributions across every year since the account was created. */
  allTimeCommits: number;
  calendarTotal: number;
  days: RawContributionDay[];
  /** Recent public events for the feed (from REST — GraphQL's feed is awkward). */
  events: RawEvent[];
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
    repositories(first: 100, ownerAffiliations: OWNER, privacy: PUBLIC, orderBy: {field: PUSHED_AT, direction: DESC}) {
      totalCount
      nodes {
        name
        stargazerCount
        isFork
        pushedAt
        primaryLanguage { name }
        languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
          edges { size node { name } }
        }
      }
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

/** Fetch everything from GitHub. Throws on HTTP or GraphQL errors. */
export async function fetchGitHub(config: GitHubConfig): Promise<GitHubRaw> {
  const endpoint = config.endpoint ?? "https://api.github.com/graphql";
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `bearer ${config.token}`,
      "Content-Type": "application/json",
      "User-Agent": "letsgaming.de-sync",
    },
    body: JSON.stringify({ query: QUERY, variables: { login: config.username } }),
  });
  if (!res.ok) throw new Error(`GitHub GraphQL HTTP ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    data?: { user: RawUser | null };
    errors?: { message: string }[];
  };
  if (json.errors?.length) throw new Error(`GitHub GraphQL: ${json.errors[0]!.message}`);
  const user = json.data?.user;
  if (!user) throw new Error(`GitHub user "${config.username}" not found.`);

  const days = user.contributionsCollection.contributionCalendar.weeks.flatMap(
    (w) => w.contributionDays,
  );

  return {
    login: config.username,
    repositoriesTotal: user.repositories.totalCount,
    repos: user.repositories.nodes,
    yearCommits: user.contributionsCollection.totalCommitContributions,
    allTimeCommits: await fetchAllTimeCommits(config, user.createdAt),
    calendarTotal: user.contributionsCollection.contributionCalendar.totalContributions,
    days,
    events: await fetchEvents(config),
  };
}

/**
 * Sum commit contributions across every year since the account was created.
 * GitHub exposes no lifetime total, so we query one `contributionsCollection`
 * window per year (aliased into a single request) and add them up.
 */
async function fetchAllTimeCommits(config: GitHubConfig, createdAt: string): Promise<number> {
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
  const headers = {
    Authorization: `bearer ${config.token}`,
    "Content-Type": "application/json",
    "User-Agent": "letsgaming.de-sync",
  };

  // Retry once on a transient failure, then throw rather than return a misleading
  // 0 — a failed sync keeps the last-good snapshot instead of zeroing the headline
  // "commits all-time" number (BUG-03).
  let res = await fetch(endpoint, { method: "POST", headers, body });
  if (!res.ok) res = await fetch(endpoint, { method: "POST", headers, body });
  if (!res.ok) {
    throw new Error(`GitHub all-time commits HTTP ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as {
    data?: { user: Record<string, { totalCommitContributions: number }> | null };
    errors?: { message: string }[];
  };
  if (json.errors?.length) throw new Error(`GitHub all-time commits: ${json.errors[0]!.message}`);
  const user = json.data?.user;
  if (!user) throw new Error(`GitHub all-time commits: user "${config.username}" not found.`);
  return years.reduce((sum, y) => sum + (user[`y${y}`]?.totalCommitContributions ?? 0), 0);
}

interface RawUser {
  createdAt: string;
  repositories: { totalCount: number; nodes: RawRepo[] };
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
  const res = await fetch(url, {
    headers: {
      Authorization: `bearer ${config.token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "letsgaming.de-sync",
    },
  });
  if (!res.ok) return [];
  const raw = (await res.json()) as GitHubRestEvent[];
  return raw.map((e) => ({
    type: e.type,
    repo: e.repo?.name?.split("/").pop() ?? e.repo?.name ?? "",
    createdAt: e.created_at,
    detail: eventDetail(e),
  }));
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
