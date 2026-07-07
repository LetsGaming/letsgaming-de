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
import { collectModuleIds, type NavNode } from "./nav.js";
import type { GitHubData, SourceData } from "./source.js";
import type {
  LinkView,
  NavView,
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
  /** Injectable clock for deterministic relative times (tests). */
  now?: Date;
}

const SOURCE_LABELS: Record<string, string> = { github: "GitHub" };

export function resolveSiteView(input: ResolveInput): SiteView {
  const locale = input.locale ?? DEFAULT_LOCALE;
  const now = input.now ?? new Date();
  const L = (v: Parameters<typeof localize>[0]) => localize(v, locale);
  const { content, source } = input;

  const descriptorById = new Map(input.modules.map((m) => [m.id, m]));
  const gh = source.github;
  const repoByName = new Map((gh?.repos ?? []).map((r) => [r.name.toLowerCase(), r]));

  const resolveLink = (link: Link): LinkView => ({
    id: link.id,
    label: L(link.label),
    href: link.href,
    icon: link.icon,
    primary: Boolean(link.primary),
  });

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
      href: p.href,
      featured: Boolean(p.featured),
    };
  };

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

  const activeSources = (): string[] =>
    (Object.keys(source) as (keyof SourceData)[])
      .filter((id) => source[id])
      .map((id) => SOURCE_LABELS[id] ?? id);

  function resolveModule(descriptor: ModuleDescriptor): ResolvedModule {
    const heading = descriptor.heading ? L(descriptor.heading) : "";
    const note = descriptor.note ? L(descriptor.note) : undefined;

    switch (descriptor.kind) {
      case "hero": {
        const eyebrow = `${content.meta.name} · ${L(content.meta.role)} · ${L(
          content.meta.location,
        )}`.toUpperCase();
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
          },
        };
      }
      case "featured": {
        const featured = content.projects.find((p) => p.featured) ?? content.projects[0];
        return {
          id: descriptor.id,
          kind: "featured",
          data: { heading, note, project: featured ? resolveProject(featured) : null },
        };
      }
      case "glance":
        return { id: descriptor.id, kind: "glance", data: { heading, note, stats: statViews() } };
      case "activity": {
        const heat = gh ? bucketHeat(gh.contributions) : { levels: [], total: 0 };
        return {
          id: descriptor.id,
          kind: "activity",
          data: {
            heading,
            note,
            stats: statViews(),
            contributions: heat,
            languages: gh ? gh.languages.map((l) => ({ name: l.name, pct: l.pct })) : [],
            events: gh
              ? gh.events.map((e) => ({
                  type: e.type,
                  text: e.text,
                  meta: e.meta,
                  at: e.at,
                  relative: relativeTime(e.at, now),
                }))
              : [],
            sources: activeSources(),
          },
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
            projects: content.projects.map(resolveProject),
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
      case "bio":
        return {
          id: descriptor.id,
          kind: "bio",
          data: { heading, note, paragraphs: content.bio.map(L) },
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

  const localizeNav = (nodes: NavNode[]): NavView[] =>
    nodes.map((n) => ({
      id: n.id,
      label: L(n.label),
      icon: n.icon,
      ...(n.children ? { children: localizeNav(n.children) } : {}),
      ...(n.modules ? { modules: n.modules } : {}),
    }));

  return {
    locale,
    meta: {
      name: content.meta.name,
      handle: content.meta.handle,
      location: L(content.meta.location),
      role: L(content.meta.role),
    },
    nav: localizeNav(input.nav),
    modules,
    syncedAt: input.syncedAt,
  };
}
