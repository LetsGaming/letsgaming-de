/**
 * The resolver (PROJECT.md §2.1).
 *
 * One pure function: `(content, sourceData, nav, modules, locale) -> SiteView`.
 * It localizes every string, folds normalized source data into the modules that
 * need it, pre-computes relative times and heatmap buckets, and emits the exact
 * JSON the frontend renders. Downstream code never sees `Localized` or a raw API
 * shape again — this is the single seam that buys both north stars.
 *
 * It is deliberately pure and store-agnostic: the read API calls it, and a
 * static build could call it too, with identical output.
 */

import type { SiteContent, Project, Link } from "./content.js";
import { bucketHeat, compactNumber, relativeTime } from "./format.js";
import { DEFAULT_LOCALE, localize, type Locale } from "./i18n.js";
import type { ModuleDescriptor } from "./modules.js";
import { defaultMusicSettings } from "./music.js";
import { AREA } from "./ia.js";
import { collectModuleIds, targetHref, type NavNode, visibleNav } from "./nav.js";
import { SOURCE_LABEL, type GitHubData, type SourceData, type SourceId } from "./source.js";
import type { FreshnessView, PostView } from "./view.js";
import { firstParagraph, parsePost, POST_PREFIX } from "./frontmatter.js";
import type { PublicGuestbookEntry } from "./guestbook.js";
import {
  defaultPresenceSettings,
  isHiddenGame,
  playtimeRows,
  type GameMeta,
  type PlaytimeEntry,
  type MusicRankEntry,
} from "./presence.js";
import {
  resolveAsset,
  type ImageAssetView,
  type GifAssetView,
  type ResolvableAsset,
} from "./assets.js";
import type {
  CodingView,
  GalleryImageView,
  GuestbookEntryView,
  HighlightView,
  LinkView,
  MusicRankView,
  NavView,
  PresenceModuleView,
  ProjectView,
  ResolvedModule,
  SiteView,
  StatView,
} from "./view.js";

export interface ResolveInput {
  content: SiteContent;
  source: SourceData;
  nav: NavNode[];
  modules: ModuleDescriptor[];
  locale?: Locale;
  /** ISO timestamp of the last sync, surfaced to the client. */
  syncedAt?: string;
  /** Last successful sync per source id, and each source's TTL. A missing
   *  `syncedAt` resolves to `never` — no sync has landed yet, which is a real
   *  state and not an error. `ttl` is `SOURCE_TTL`, which is total over SourceId
   *  by construction, so a synced source always has an age to judge. */
  freshness?: { syncedAt: Partial<Record<SourceId, string>>; ttl: Record<SourceId, number> };
  /** Approved guestbook entries, newest first (the store filters + orders). */
  guestbook?: PublicGuestbookEntry[];
  /** Observed playtime, accumulated from presence polls (see PresenceSampler).
   *  Not a source: it's the store's own accumulation, so it arrives here already
   *  summed rather than as a snapshot to normalize. */
  playtime?: PlaytimeEntry[];
  /** Cached game metadata (cover art, genre) keyed by `gameMetaKey`, resolved from
   *  RAWG by the server. The resolver attaches it to the recently-played rows so a
   *  Discord-observed name gets a cover and a genre it never carried itself. */
  gameMeta?: ReadonlyMap<string, GameMeta>;
  /** The historical playtime module's data (feature 02): the all-time day strip,
   *  built server-side from observed sessions (per-day totals) so the resolver
   *  stays pure. */
  playHistory?: { ledger: { day: string; minutes: number }[]; since?: string };
  /** The music module's data: top songs/artists/albums plus a per-day listening
   *  strip, over the window. Pre-computed by the server from `music_plays` (the
   *  resolver stays pure), same as `playHistory`. Absent → an empty module. */
  musicHistory?: {
    topSongs: MusicRankEntry[];
    topArtists: MusicRankEntry[];
    topAlbums: MusicRankEntry[];
    ledger: { day: string; minutes: number }[];
    trackCount: number;
    artistCount: number;
    since?: string;
  };
  /** Library assets referenced by content, keyed by id (built by the read route). */
  assets?: Map<string, ResolvableAsset>;
  /** Injectable clock for deterministic relative times (tests). */
  now?: Date;
}

/**
 * What an href is allowed to be: http(s), mailto, a site-relative path, or an
 * in-page target — and nothing else, so a `javascript:`/`data:` URL from stored
 * content or a future source can't become a clickable script sink (SEC-04).
 *
 * `#` belongs here and was excluded by accident, not by design. A fragment has no
 * scheme, so it can't execute anything — it was never the threat this pattern
 * exists for. Meanwhile the CMS's own seed ships `href: "#contact"` on the hero's
 * primary CTA, so `safeHref` rewrote it to `"#"`, and the button did nothing. Not
 * visibly: `HeroSection` intercepted the click and handed the *stripped* target to
 * `goAnchor`, which asked the nav for `""` and got `"#"` back. A rule too narrow in
 * the file that also holds the click handler papering over it.
 *
 * One pattern, two gates. The CMS write schema uses this string to refuse a bad
 * href at the boundary; `safeHref` below applies it again at read time, because
 * content predates schemas and a source isn't the CMS. They were two hand-written
 * copies of one rule and had already drifted apart on case-sensitivity — which is
 * what two copies of a rule do, and why the *security* one is a bad place for it.
 */
export const HREF_PATTERN = "^(https?://|mailto:|/|#)[^\\s]*$";

/** The read-time gate. Case-insensitive on purpose: `HTTPS://` is a real URL and
 *  a scheme is case-insensitive per RFC 3986, so refusing one would be pedantry
 *  rather than defence. The write schema stays exact — Ajv compiles patterns
 *  without flags, and the CMS has a keyboard. */
const SAFE_HREF_RE = new RegExp(HREF_PATTERN, "i");

export function safeHref(href: string | undefined): string {
  const value = (href ?? "").trim();
  return SAFE_HREF_RE.test(value) ? value : "#";
}

/**
 * How much of each list reaches the page.
 *
 * Editorial, not technical — the adapters already cap what they *fetch*; these
 * cap what a section *shows*. Named because `slice(-182)` in a switch case is a
 * number whose meaning lives in a comment.
 */
const FEED = {
  /**
   * 26 weeks of contribution days. A full GitHub year crams ~53 columns into the
   * card. Must stay a multiple of DAYS_PER_WEEK: `.heat` in app.css is
   * `grid-auto-flow: column` over `repeat(7, 1fr)` rows, so a remainder leaves
   * the last column half-height — which renders wrong without erroring anywhere.
   */
  heatDays: 26 * 7,
  /** Repo cards on Projects. */
  projects: 12,
  /** Merged commit/release/PR/gist events on Recent. */
  events: 12,
  /** Games in the playtime chart. Editorial, like the rest: a bar chart of twenty
   *  is a list, and the tail of a fortnight is a game you opened once. */
  playtime: 6,
} as const;

export function resolveSiteView(input: ResolveInput): SiteView {
  const locale = input.locale ?? DEFAULT_LOCALE;
  const now = input.now ?? new Date();
  const L = (v: Parameters<typeof localize>[0]) => localize(v, locale);
  const { content, source } = input;
  const assets = input.assets ?? new Map<string, ResolvableAsset>();

  const descriptorById = new Map(input.modules.map((m) => [m.id, m]));
  const gh = source.github;
  const repoByName = new Map((gh?.repos ?? []).map((r) => [r.name.toLowerCase(), r]));

  const localizeNav = (nodes: NavNode[]): NavView[] =>
    nodes.map((n) => ({
      id: n.id,
      label: L(n.label),
      icon: n.icon,
      ...(n.children ? { children: localizeNav(n.children) } : {}),
      ...(n.modules ? { modules: n.modules } : {}),
    }));

  /**
   * The nav a visitor can actually reach, used for two things: the view's own
   * `nav`, and turning `#target` links into URLs. Computed once, up here, because
   * `resolveLink` needs it — links used to resolve without it, which is why an
   * in-page target had nowhere to go and got flattened to `"#"`.
   *
   * `visibleNav` first: a link into a draft area shouldn't resolve to a URL that
   * 404s. It falls through to `#target` instead, which is inert and honest.
   */
  const navView = localizeNav(visibleNav(input.nav));

  const resolveLink = (link: Link): LinkView => {
    const raw = safeHref(link.href);
    const view: LinkView = {
      id: link.id,
      label: L(link.label),
      // `#contact` is a module id, not a URL. The resolver knows where that module
      // lives, so it answers with `/about#contact` — a real link, which the browser
      // can follow with no JavaScript at all, and which middle-click, ctrl-click and
      // "copy link address" all work on. The site used to answer this with a click
      // handler, which is an <a href> with the useful parts taken out.
      href: raw.startsWith("#") && raw.length > 1 ? targetHref(navView, raw.slice(1)) : raw,
      icon: link.icon,
      primary: Boolean(link.primary),
    };
    // An icon may be an uploaded SVG asset (asset:<id>) instead of a built-in name.
    const asset = resolveAsset(link.icon, assets);
    if (asset && asset.kind === "svg") {
      view.iconSvg = asset.svg;
      delete view.icon;
    }
    return view;
  };

  const resolveProject = (p: Project): ProjectView => {
    // Enrich meta from synced repo data when a repo link resolves; otherwise use
    // the authored meta verbatim. Keeps stars/freshness honest without a rebuild.
    const repo = p.repo ? repoByName.get(p.repo.toLowerCase()) : undefined;
    const meta = repo
      ? [`★ ${repo.stars}`, `updated ${relativeTime(repo.pushedAt, now)} ago`]
      : p.meta.map(L);
    return {
      id: p.id,
      name: p.name,
      tag: L(p.tag),
      description: L(p.description),
      meta,
      href: safeHref(p.href),
      featured: Boolean(p.featured),
    };
  };

  /** Projects straight from GitHub: pinned first, then most-recently-updated. */
  const githubProjectViews = (): ProjectView[] => {
    const repos = gh?.repos ?? [];
    if (repos.length === 0) return [];
    const byName = new Map(repos.map((r) => [r.name.toLowerCase(), r]));
    const pinned = (gh?.pinned ?? [])
      .map((n) => byName.get(n.toLowerCase()))
      .filter((r): r is NonNullable<typeof r> => Boolean(r));
    const pinnedNames = new Set(pinned.map((r) => r.name));
    const recent = repos.filter((r) => !pinnedNames.has(r.name)); // already push-desc
    return [...pinned, ...recent].slice(0, FEED.projects).map((r) => ({
      id: r.name,
      name: r.name,
      tag: r.language ?? "",
      description: r.description ?? "",
      meta: [`★ ${r.stars}`, `updated ${relativeTime(r.pushedAt, now)} ago`],
      href: r.url,
      featured: pinnedNames.has(r.name),
    }));
  };

  // GitHub is the source of truth for projects; fall back to any CMS-authored
  // projects only when there's no synced GitHub data yet.
  const projectList: ProjectView[] = (() => {
    const fromGitHub = githubProjectViews();
    return fromGitHub.length > 0 ? fromGitHub : content.projects.map(resolveProject);
  })();
  const githubUrl = `https://github.com/${content.meta.handle}`;

  const statViews = (): StatView[] => {
    if (!gh) return [];
    const s = gh.stats;
    return [
      { value: compactNumber(s.repos), label: "public repos" },
      { value: compactNumber(s.commitsYear), label: "commits this year" },
      { value: compactNumber(s.commitsAllTime), label: "commits all-time" },
      { value: compactNumber(s.longestStreakDays), unit: "d", label: "longest streak" },
    ];
  };

  /** Merge GitHub releases, merged PRs, and gists into one newest-first feed. */
  const highlightViews = (data: GitHubData): HighlightView[] => {
    const rel = (iso: string) => relativeTime(iso, now);
    const releases: HighlightView[] = (data.releases ?? []).map((r) => ({
      type: "release",
      text: `Released ${r.repo} ${r.name || r.tagName}`,
      meta: r.tagName,
      href: safeHref(r.url),
      at: r.publishedAt,
      relative: rel(r.publishedAt),
    }));
    const prs: HighlightView[] = (data.mergedPrs ?? []).map((p) => ({
      type: "pr",
      text: `Merged “${p.title}” in ${p.repo}`,
      href: safeHref(p.url),
      at: p.mergedAt,
      relative: rel(p.mergedAt),
    }));
    const gists: HighlightView[] = (data.gists ?? []).map((g) => ({
      type: "gist",
      text: g.description ? `Shared a gist: ${g.description}` : "Shared a gist",
      meta: `${g.files} file${g.files === 1 ? "" : "s"}`,
      href: safeHref(g.url),
      at: g.updatedAt,
      relative: rel(g.updatedAt),
    }));
    // ISO timestamps sort lexicographically == chronologically; newest first.
    return [...releases, ...prs, ...gists];
  };

  /**
   * A module's own age, per source. `stale` exists because the brief's failure
   * mode is going stale: a module that can't tell fresh from old renders old
   * data as current, which makes the site lie about the one thing it promises.
   */
  const freshnessOf = (sourceId: SourceId, hasData: boolean): FreshnessView => {
    const at = input.freshness?.syncedAt[sourceId];
    if (!at) return { state: "never", source: sourceId };
    const ttl = input.freshness?.ttl[sourceId];
    const age = now.getTime() - new Date(at).getTime();
    const relative = relativeTime(at, now);
    if (!hasData) return { state: "empty", syncedAt: at, relative, source: sourceId };
    const state = ttl !== undefined && age > ttl ? "stale" : "fresh";
    return { state, syncedAt: at, relative, source: sourceId };
  };

  const activeSources = (): string[] =>
    (Object.keys(source) as SourceId[]).filter((id) => source[id]).map((id) => SOURCE_LABEL[id]);

  function resolveModule(descriptor: ModuleDescriptor): ResolvedModule {
    const heading = descriptor.heading ? L(descriptor.heading) : "";
    const note = descriptor.note ? L(descriptor.note) : undefined;

    switch (descriptor.kind) {
      case "hero": {
        const eyebrow = `${content.meta.name} · ${L(content.meta.role)} · ${L(
          content.meta.location,
        )}`.toUpperCase();
        const avatar = resolveAsset(content.meta.avatar, assets);
        return {
          id: descriptor.id,
          kind: "hero",
          data: {
            eyebrow,
            headline: {
              before: L(content.headline.before),
              highlight: L(content.headline.highlight),
              after: L(content.headline.after),
            },
            lede: L(content.lede),
            status: { verb: L(content.status.verb), now: L(content.status.now) },
            links: content.links.map(resolveLink),
            ...(avatar && (avatar.kind === "image" || avatar.kind === "gif")
              ? { avatar }
              : {}),
          },
        };
      }
      case "featured": {
        const featured = projectList.find((p) => p.featured) ?? projectList[0] ?? null;
        return {
          id: descriptor.id,
          kind: "featured",
          // A real URL the resolver already knows, so the "see all" affordance is
          // an <a href> — middle-clickable, crawlable — not a JS-only button that
          // calls window.location. Same `targetHref` the hero's links use.
          data: { heading, note, project: featured, moreHref: targetHref(navView, AREA.code) },
        };
      }
      case "glance": {
        const latest = gh?.events[0];
        return {
          id: descriptor.id,
          kind: "glance",
          data: {
            heading,
            note,
            freshness: freshnessOf("github", Boolean(gh)),
            stats: statViews(),
            moreHref: targetHref(navView, AREA.code),
            ...(latest
              ? {
                  latest: {
                    type: latest.type,
                    text: latest.text,
                    at: latest.at,
                    relative: relativeTime(latest.at, now),
                  },
                }
              : {}),
          },
        };
      }
      case "activity": {
        // The last 26 weeks, so the calendar stays readable (see FEED.heatDays —
        // .heat in app.css sizes its grid to the same number).
        const windowed = gh ? gh.contributions.slice(-FEED.heatDays) : [];
        const heat = gh ? bucketHeat(windowed) : { levels: [], total: 0 };
        return {
          id: descriptor.id,
          kind: "activity",
          data: {
            heading,
            note,
            freshness: freshnessOf("github", Boolean(gh)),
            stats: statViews(),
            contributions: heat,
            languages: gh ? gh.languages.map((l) => ({ name: l.name, pct: l.pct })) : [],
            events: gh
              ? [
                  ...gh.events.map((e) => ({
                    type: e.type,
                    text: e.text,
                    meta: e.meta,
                    at: e.at,
                    relative: relativeTime(e.at, now),
                  })),
                  ...highlightViews(gh),
                ]
                  // ISO timestamps sort lexicographically == chronologically.
                  .sort((a, b) => b.at.localeCompare(a.at))
                  .slice(0, FEED.events)
              : [],
            sources: activeSources(),
          },
        };
      }
      case "posts": {
        // Posts are markdown assets with a public slug. Their metadata lives in
        // the file, so building the index is: parse each one, drop the drafts,
        // newest first. Drafts are absent here *and* 404 at the route — the index
        // is not the access control.
        const posts: PostView[] = [...assets.values()]
          .filter((a) => a.kind === "markdown" && a.slug?.startsWith(POST_PREFIX) && a.markdown)
          .map((a) => {
            const { frontmatter: fm, body } = parsePost(a.markdown!, a.slug!);
            return { fm, body, slug: a.slug! };
          })
          .filter(({ fm }) => !fm.draft)
          .map(({ fm, body, slug }) => ({
            slug,
            title: fm.title,
            at: fm.date,
            relative: relativeTime(fm.date, now),
            // Always give OG something to quote: an explicit excerpt, else the
            // opening paragraph.
            excerpt: fm.excerpt ?? firstParagraph(body),
            tags: fm.tags,
          }))
          .sort((a, b) => b.at.localeCompare(a.at));
        return { id: descriptor.id, kind: "posts", data: { heading, note, posts } };
      }
      case "coding": {
        const w = source.wakapi;
        const coding: CodingView | null = w
          ? {
              range: w.range,
              totalHours: Math.round((w.totalSeconds / 3600) * 10) / 10,
              languages: w.languages.map((l) => ({
                name: l.name,
                pct: l.pct,
                hours: Math.round((l.seconds / 3600) * 10) / 10,
              })),
            }
          : null;
        return {
          id: descriptor.id,
          kind: "coding",
          data: { heading, note, freshness: freshnessOf("wakapi", Boolean(w)), coding },
        };
      }
      case "projects": {
        const repoCount = gh?.stats.repos;
        return {
          id: descriptor.id,
          kind: "projects",
          data: {
            heading,
            note: note ?? (repoCount != null ? `${compactNumber(repoCount)} public repos` : undefined),
            freshness: freshnessOf("github", projectList.length > 0),
            projects: projectList,
            githubUrl,
          },
        };
      }
      case "hobbies":
        return {
          id: descriptor.id,
          kind: "hobbies",
          data: {
            heading,
            note,
            hobbies: content.hobbies.map((h) => ({
              id: h.id,
              title: L(h.title),
              blurb: L(h.blurb),
              icon: h.icon,
              tone: h.tone,
            })),
          },
        };
      case "now":
        return {
          id: descriptor.id,
          kind: "now",
          data: {
            heading,
            note,
            items: content.now.map((n) => ({ id: n.id, key: L(n.key), value: L(n.value) })),
          },
        };
      case "guestbook": {
        const entries: GuestbookEntryView[] = (input.guestbook ?? []).map((e) => ({
          id: e.id,
          name: e.name,
          message: e.message,
          at: e.createdAt,
          relative: relativeTime(e.createdAt, now),
        }));
        return { id: descriptor.id, kind: "guestbook", data: { heading, note, entries } };
      }
      case "presence": {
        // Enablement is purely the owner's CMS allow-list: is any category still
        // shown? No env, no Discord id here — the widget polls the server-filtered
        // /api/presence and the *server* owns whether Discord is configured and
        // online. Keeping this env-free is the point: the SSR process resolves this
        // flag without any presence secret.
        const show = content.presence?.show ?? defaultPresenceSettings().show;
        const enabled = show.length > 0;
        const avatar = resolveAsset(content.meta.avatar, assets);

        // "Right now" is present-tense only, and entirely live: the Discord socket
        // fills it client-side. History (recently played, the ledger) lives in the
        // playtime module, where it belongs.
        const data: PresenceModuleView = {
          enabled,
          name: content.meta.name,
          handle: content.meta.handle,
          ...(avatar && (avatar.kind === "image" || avatar.kind === "gif") ? { avatar } : {}),
        };
        return {
          id: descriptor.id,
          kind: "presence",
          // `enabled` is a display toggle (a category is shown) — it says nothing
          // about whether Discord answered; the widget reports its own live state.
          data: { heading, note, ...data },
        };
      }
      case "playtime": {
        // Shaped from the server's pre-computed observed history; the resolver
        // stays pure. Absent history is an empty module, not an error — a fresh
        // install has recorded no sessions yet.
        const hist = input.playHistory ?? { ledger: [] };
        const totalMinutes = hist.ledger.reduce((sum, d) => sum + d.minutes, 0);

        // "Recently played" — every game Discord observed over the window,
        // most-played first. Gated on the same `game` allow-list and hidden-games
        // filter as the presence card, so nothing the owner hid surfaces here.
        const pShow = content.presence?.show ?? defaultPresenceSettings().show;
        const recent = pShow.includes("game")
          ? playtimeRows(input.playtime ?? [], input.gameMeta)
              .filter((g) => !isHiddenGame(g.name, content.presence?.hiddenGames ?? []))
              .slice(0, FEED.playtime)
          : [];

        return {
          id: descriptor.id,
          kind: "playtime",
          data: {
            heading,
            note,
            totalHours: Math.round(totalMinutes / 60),
            recent,
            ledger: hist.ledger,
            ...(hist.since ? { since: hist.since } : {}),
          },
        };
      }
      case "music": {
        // Same shape as playtime: pre-computed by the server, shaped here. Absent
        // history is an empty module — a fresh install has recorded no plays yet.
        const m = input.musicHistory;
        const ledger = m?.ledger ?? [];
        const totalMinutes = ledger.reduce((sum, d) => sum + d.minutes, 0);
        // Display counts are CMS-owned; the lists themselves are already capped to
        // maxCount server-side (the query LIMIT), so this only carries the numbers
        // the frontend needs to collapse/expand — never uncapped data.
        const musicSettings = content.music ?? defaultMusicSettings();
        const rank = (e: MusicRankEntry): MusicRankView => ({
          name: e.name,
          minutes: e.minutes,
          plays: e.plays,
          ...(e.by ? { by: e.by } : {}),
          ...(e.artUrl ? { artUrl: e.artUrl } : {}),
        });
        return {
          id: descriptor.id,
          kind: "music",
          data: {
            heading,
            note,
            totalHours: Math.round(totalMinutes / 60),
            trackCount: m?.trackCount ?? 0,
            artistCount: m?.artistCount ?? 0,
            topSongs: (m?.topSongs ?? []).map(rank),
            topArtists: (m?.topArtists ?? []).map(rank),
            topAlbums: (m?.topAlbums ?? []).map(rank),
            ledger,
            ...(m?.since ? { since: m.since } : {}),
            initialCount: musicSettings.initialCount,
            maxCount: musicSettings.maxCount,
          },
        };
      }
      case "gallery": {
        const images: GalleryImageView[] = (content.gallery ?? [])
          .filter((g) => g.module === descriptor.id)
          .map((g) => {
            const caption = L(g.caption);
            const view = resolveAsset(g.asset, assets, caption);
            if (!view || (view.kind !== "image" && view.kind !== "gif")) return null;
            return { id: g.id, image: view as ImageAssetView | GifAssetView, caption };
          })
          .filter((x): x is GalleryImageView => x !== null);
        return { id: descriptor.id, kind: "gallery", data: { heading, note, images } };
      }
      case "bio":
        return {
          id: descriptor.id,
          kind: "bio",
          data: {
            heading,
            note,
            blocks: content.bio.map((p) => {
              const text = L(p);
              const view = resolveAsset(text, assets);
              return view && (view.kind === "image" || view.kind === "gif")
                ? ({ kind: "image", image: view } as const)
                : ({ kind: "text", text } as const);
            }),
          },
        };
      case "contact":
        return {
          id: descriptor.id,
          kind: "contact",
          data: { heading, note, links: content.links.map(resolveLink) },
        };
    }
  }

  // Resolve exactly the modules the nav actually places (lint guarantees they exist).
  const modules: Record<string, ResolvedModule> = {};
  for (const id of collectModuleIds(input.nav)) {
    const descriptor = descriptorById.get(id);
    if (descriptor) modules[id] = resolveModule(descriptor);
  }

  return {
    locale,
    meta: {
      name: content.meta.name,
      handle: content.meta.handle,
      location: L(content.meta.location),
      role: L(content.meta.role),
    },
    // Drafts never reach the public view: not rendered, not routable, not in
    // the SSR'd HTML. `hidden` is only a guarantee if the resolver enforces it.
    nav: localizeNav(visibleNav(input.nav)),
    modules,
    syncedAt: input.syncedAt,
  };
}
