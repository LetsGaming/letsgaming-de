/**
 * Who sent them here.
 *
 * The log gives a bare hostname, which is both too specific and too vague to read:
 * `out.reddit.com`, `www.reddit.com` and `old.reddit.com` are three lines in the
 * dashboard and one answer to the question. And a raw host doesn't say what it
 * *is* — `t.co` is not obviously X, and `lm.facebook.com` is not obviously
 * Facebook.
 *
 * So hosts are stored raw and grouped at read time. That ordering is the
 * important part: classifying at ingest would bake today's rules into history, so
 * adding a source next month would only label next month's traffic. Grouping on
 * read means a new rule relabels everything that ever arrived.
 *
 * Custom rules come first, so the owner can always override or extend the
 * built-in table without a release.
 */

/** A user-defined mapping from a host suffix to a display label. */
export interface ReferrerRule {
  /** Host or host suffix, e.g. `steamcommunity.com` or `t.co`. Case-insensitive. */
  match: string;
  /** What to show, e.g. `Steam`. */
  label: string;
}

/** What the log records when there was no referrer at all. */
export const DIRECT_REFERRER = "direct";

/**
 * Marks a source that came from the URL rather than the `Referer` header.
 *
 * A tag beats a header because the header is frequently absent: native apps
 * (Discord's desktop client, the Steam client, most messengers) hand a URL to
 * the browser as a fresh navigation with no previous page, and plenty of sites
 * set `Referrer-Policy: no-referrer`. Those visits are indistinguishable from
 * someone typing the address — unless the link itself carries the answer.
 *
 * Stored with a prefix so the two kinds stay distinguishable in the raw rows;
 * `classifyReferrer` resolves both to the same display label, so tagging a
 * Discord link `?utm_source=discord` lands in the same bucket as an actual
 * referral from `discord.com`.
 */
export const UTM_PREFIX = "utm:";

/**
 * Built-in sources, as suffix → label.
 *
 * Suffixes rather than exact hosts because every one of these has subdomains that
 * matter: `store.steampowered.com` and `steamcommunity.com` are both Steam,
 * `l.messenger.com` is Messenger. Ordered longest-first at match time so a more
 * specific rule can sit alongside a broader one.
 */
const BUILT_IN: ReferrerRule[] = [
  // AI assistants — increasingly the way a personal site gets found, and the
  // reason this table exists at all.
  { match: "chatgpt.com", label: "ChatGPT" },
  { match: "chat.openai.com", label: "ChatGPT" },
  { match: "openai.com", label: "OpenAI" },
  { match: "claude.ai", label: "Claude" },
  { match: "perplexity.ai", label: "Perplexity" },
  { match: "gemini.google.com", label: "Gemini" },
  { match: "copilot.microsoft.com", label: "Copilot" },

  // Chat and social.
  { match: "discord.com", label: "Discord" },
  { match: "discordapp.com", label: "Discord" },
  { match: "t.co", label: "X" },
  { match: "twitter.com", label: "X" },
  { match: "x.com", label: "X" },
  { match: "reddit.com", label: "Reddit" },
  { match: "news.ycombinator.com", label: "Hacker News" },
  { match: "linkedin.com", label: "LinkedIn" },
  { match: "lnkd.in", label: "LinkedIn" },
  { match: "facebook.com", label: "Facebook" },
  { match: "messenger.com", label: "Messenger" },
  { match: "instagram.com", label: "Instagram" },
  { match: "mastodon.social", label: "Mastodon" },
  { match: "bsky.app", label: "Bluesky" },
  { match: "telegram.org", label: "Telegram" },
  { match: "t.me", label: "Telegram" },
  { match: "whatsapp.com", label: "WhatsApp" },
  { match: "youtube.com", label: "YouTube" },
  { match: "twitch.tv", label: "Twitch" },

  // Gaming.
  { match: "steamcommunity.com", label: "Steam" },
  { match: "steampowered.com", label: "Steam" },

  // Dev.
  { match: "github.com", label: "GitHub" },
  { match: "gitlab.com", label: "GitLab" },
  { match: "stackoverflow.com", label: "Stack Overflow" },
  { match: "dev.to", label: "DEV" },

  // Search.
  { match: "google.com", label: "Google" },
  { match: "google.de", label: "Google" },
  { match: "bing.com", label: "Bing" },
  { match: "duckduckgo.com", label: "DuckDuckGo" },
  { match: "ecosia.org", label: "Ecosia" },
  { match: "startpage.com", label: "Startpage" },
  { match: "search.brave.com", label: "Brave Search" },
  { match: "yandex.ru", label: "Yandex" },
];

/** Compare labels and tags on letters and digits only, so "Hacker News",
 *  "hacker-news" and "hackernews" are one source. */
const normalizeToken = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** `www.` and other pure-noise prefixes, for the unmatched fallback. */
const NOISE_PREFIX = /^(www|m|mobile|out|l|lm|old|new)\./i;

const matches = (host: string, match: string): boolean => {
  const h = host.toLowerCase();
  const m = match.toLowerCase().replace(/^\.+/, "");
  return h === m || h.endsWith(`.${m}`);
};

/**
 * A referrer host as a readable source name.
 *
 * Unmatched hosts fall through to themselves with the noise subdomain stripped,
 * which keeps the long tail visible rather than dumping it into "other" — an
 * unrecognised referrer sending real traffic is exactly the thing worth
 * noticing, and it's the prompt to add a rule for it.
 */
export function classifyReferrer(key: string, custom: readonly ReferrerRule[] = []): string {
  if (!key || key === DIRECT_REFERRER) return DIRECT_REFERRER;

  // A `?utm_source=` tag: resolve the token against the same vocabulary as a
  // hostname, so a tagged link and a real referral from the same place end up on
  // one line instead of two.
  if (key.startsWith(UTM_PREFIX)) {
    const token = normalizeToken(key.slice(UTM_PREFIX.length));
    if (!token) return DIRECT_REFERRER;
    for (const set of [custom, BUILT_IN]) {
      const hit = [...set].find(
        (r) => normalizeToken(r.label) === token || normalizeToken(r.match) === token,
      );
      if (hit) return hit.label;
    }
    // Unknown tag: show it as written rather than inventing a name for it.
    return key.slice(UTM_PREFIX.length);
  }

  // Custom first: the owner's rules override the built-ins, and longest match
  // wins within each set so a specific subdomain beats its parent domain.
  for (const set of [custom, BUILT_IN]) {
    const hit = [...set]
      .filter((r) => r.match && r.label && matches(key, r.match))
      .sort((a, b) => b.match.length - a.match.length)[0];
    if (hit) return hit.label;
  }
  return key.replace(NOISE_PREFIX, "");
}

/**
 * A `utm_source` value, reduced to something safe to store as an aggregate key.
 *
 * The value is attacker-controlled — anyone can request `/?utm_source=<10kB>` —
 * and it becomes a row in the store, so it's capped in both length and alphabet
 * rather than trusted. Anything left empty after cleaning is dropped, and the
 * caller falls back to the `Referer` header.
 */
export function sanitizeUtmSource(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, 32);
  return cleaned || null;
}

/**
 * Group counted referrer rows into sources, largest first.
 *
 * Aggregation belongs with the classification: several hosts collapse into one
 * label, so the counts have to be summed after mapping rather than before, and
 * doing it in two places is how the total stops matching the list.
 */
export function groupReferrers(
  rows: readonly { key: string; count: number }[],
  custom: readonly ReferrerRule[] = [],
): { key: string; count: number }[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const label = classifyReferrer(row.key, custom);
    totals.set(label, (totals.get(label) ?? 0) + row.count);
  }
  return [...totals.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}

/** Drop blank/duplicate rules and trim, so a half-filled CMS row can't shadow a
 *  built-in with an empty label. */
export function sanitizeReferrerRules(input: unknown): ReferrerRule[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: ReferrerRule[] = [];
  for (const raw of input) {
    const r = raw as { match?: unknown; label?: unknown };
    const match = typeof r.match === "string" ? r.match.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "") : "";
    const label = typeof r.label === "string" ? r.label.trim() : "";
    if (!match || !label || seen.has(match)) continue;
    seen.add(match);
    out.push({ match, label });
  }
  return out.slice(0, 100);
}
