import type {
  Headline,
  Hobby,
  Link,
  Localized,
  MusicSettings,
  NowItem,
  PlaytimeSettings,
  PresenceSettings,
  Project,
  SiteContent,
  SiteMeta,
  Status,
} from "@lg/core";
import type { GalleryItem } from "@lg/core";
import {
  defaultWrappedSettings,
  sanitizeWrappedSettings,
  type WrappedSettings,
  defaultPresenceSettings,
  defaultMusicSettings,
  defaultPlaytimeSettings,
  sanitizeHidden,
  sanitizeMusicSettings,
  sanitizePlaytimeSettings,
  sanitizePresenceSettings,
  sanitizePresenceShow,
  sanitizeRetentionDays,
  sanitizeReferrerRules,
  type ReferrerRule,
} from "@lg/core";
import type { DB } from "./database.js";
import {
  asBool,
  asNullableText,
  asNumber,
  asText,
  boolToInt,
  deleteById,
  json,
  mapRow,
  mapRows,
  SINGLETON_ID,
  transact,
  type Row,
} from "./row-mapper.js";

/** Revisions per history page. Enough to find last week's wording, small enough
 *  that the panel doesn't become a scroll. */
const REVISION_PAGE = 50;

// ── row readers: the only place a raw column becomes a domain value ──────────
const toProject = (r: Row): Project => ({
  id: asText(r.id),
  name: asText(r.name),
  tag: json<Localized>(r.tag),
  description: json<Localized>(r.description),
  meta: json<Localized[]>(r.meta),
  href: asText(r.href),
  featured: asBool(r.featured),
  ...(r.repo ? { repo: asText(r.repo) } : {}),
});

const toHobby = (r: Row): Hobby => ({
  id: asText(r.id),
  title: json<Localized>(r.title),
  blurb: json<Localized>(r.blurb),
  ...(r.icon ? { icon: asText(r.icon) } : {}),
  tone: asText(r.tone) as Hobby["tone"],
});

const toLink = (r: Row): Link => ({
  id: asText(r.id),
  label: json<Localized>(r.label),
  href: asText(r.href),
  ...(r.icon ? { icon: asText(r.icon) } : {}),
  primary: asBool(r.is_primary),
});

const toNow = (r: Row): NowItem => ({
  id: asText(r.id),
  key: json<Localized>(r.key),
  value: json<Localized>(r.value),
});

const toGalleryItem = (r: Row): GalleryItem => ({
  id: asText(r.id),
  module: asNullableText(r.module) ?? "gallery",
  asset: asText(r.asset),
  caption: json<Localized>(r.caption),
});

/** Repository for CMS-owned content: the read path plus CRUD for the CMS. */
export function contentRepo(db: DB) {
  const readProjects = (): Project[] =>
    mapRows(db.prepare("SELECT * FROM projects ORDER BY sort, id"), toProject);
  const readHobbies = (): Hobby[] =>
    mapRows(db.prepare("SELECT * FROM hobbies ORDER BY sort, id"), toHobby);
  const readLinks = (): Link[] =>
    mapRows(db.prepare("SELECT * FROM links ORDER BY sort, id"), toLink);
  const readNow = (): NowItem[] =>
    mapRows(db.prepare("SELECT * FROM now_items ORDER BY sort, id"), toNow);
  const readGallery = (): GalleryItem[] =>
    mapRows(db.prepare("SELECT * FROM gallery ORDER BY sort, id"), toGalleryItem);

  /** Presence config (single row); every field falls back to its default if
   *  unseeded or NULL, so a fresh install and the pre-0004 row both read cleanly. */
  const readPresence = (): PresenceSettings => {
    const row = db
      .prepare("SELECT show, sample, retention_days, hidden_games FROM site_presence WHERE id = ?")
      .get(SINGLETON_ID) as
      | { show: string; sample: string | null; retention_days: number | null; hidden_games: string | null }
      | undefined;
    if (!row) return defaultPresenceSettings();
    const d = defaultPresenceSettings();
    const show = sanitizePresenceShow(json<unknown>(row.show));
    return {
      show,
      // NULL sample predates 0004 — fall back to "record what you show", which is
      // the behaviour that row was created under (the sampler ignored the list).
      sample: row.sample === null ? show : sanitizePresenceShow(json<unknown>(row.sample)),
      retentionDays: sanitizeRetentionDays(row.retention_days),
      hidden: row.hidden_games === null ? d.hidden : sanitizeHidden(json<unknown>(row.hidden_games)),
    };
  };

  /** Listening list-display config, one JSON column on the singleton content row;
   *  a NULL — a fresh install or the pre-0007 row — reads back as the default. */
  const readMusic = (): MusicSettings => {
    const row = db
      .prepare("SELECT music FROM site_content WHERE id = ?")
      .get(SINGLETON_ID) as { music: string | null } | undefined;
    if (!row || row.music === null) return defaultMusicSettings();
    return sanitizeMusicSettings(json<unknown>(row.music));
  };

  /** Wrapped schedule + list size, one JSON column on the singleton row; a NULL
   *  — a fresh install or the pre-0010 row — reads back as the default (disabled). */
  const readWrapped = (): WrappedSettings => {
    const row = db
      .prepare("SELECT wrapped FROM site_content WHERE id = ?")
      .get(SINGLETON_ID) as { wrapped: string | null } | undefined;
    if (!row || row.wrapped === null) return defaultWrappedSettings();
    return sanitizeWrappedSettings(json<unknown>(row.wrapped));
  };

  /** Custom referrer rules (CMS-owned), applied when the dashboard is read so a
   *  new rule relabels history. NULL — a fresh install or a pre-0011 row — reads
   *  back as no rules, which is what the dashboard did before they existed. */
  const readReferrerRules = (): ReferrerRule[] => {
    const row = db
      .prepare("SELECT analytics FROM site_content WHERE id = ?")
      .get(SINGLETON_ID) as { analytics: string | null } | undefined;
    if (!row || row.analytics === null) return [];
    const parsed = json<{ referrerRules?: unknown }>(row.analytics);
    return sanitizeReferrerRules(parsed?.referrerRules);
  };

  const readPlaytime = (): PlaytimeSettings => {
    const row = db
      .prepare("SELECT playtime FROM site_content WHERE id = ?")
      .get(SINGLETON_ID) as { playtime: string | null } | undefined;
    if (!row || row.playtime === null) return defaultPlaytimeSettings();
    return sanitizePlaytimeSettings(json<unknown>(row.playtime));
  };

  /**
   * Snapshot the whole document into the revision archive.
   *
   * Runs inside the caller's transaction, so a save either lands with its history
   * or doesn't land. Archiving afterwards would lose exactly the revisions where
   * something went wrong — the ones you'd want.
   *
   * Reads `getContent()` *after* the write, so the newest revision is the current
   * state. Restore is then a write, not a replay — the same relationship
   * `source_current` has with `source_snapshots`.
   */
  const archive = (reason: string): void => {
    db.prepare(
      "INSERT INTO site_content_revisions (saved_at, reason, content) VALUES (?, ?, ?)",
    ).run(new Date().toISOString(), reason, JSON.stringify(repo.getContent()));
  };

  /**
   * Update one scalar column on the single site_content row, keeping the old one.
   *
   * 0001 archives every GitHub sync forever because "history can't be re-fetched",
   * and UPDATEs your bio in place. GitHub would hand its data back tomorrow; the
   * paragraph you just replaced existed nowhere else. The CMS saves on blur, so
   * that was every edit, silently.
   */
  /**
   * Every CMS-owned write goes through here: do it, archive it, atomically.
   *
   * A seam rather than `transact(db, () => { …; archive("x") })` at seventeen call
   * sites, because seventeen hand-copied pairs is sixteen chances to forget the
   * second half — and the one that forgets doesn't fail, it quietly stops keeping
   * history for that field. Same shape as the seven TTLs. Here it's structural:
   * there is no path that writes content without archiving it, because this is the
   * only path that writes.
   */
  const write = <T>(reason: string, fn: () => T): T =>
    transact(db, () => {
      const result = fn();
      archive(reason);
      return result;
    });

  const setScalar = (col: "meta" | "headline" | "lede" | "status" | "bio" | "music" | "playtime" | "wrapped" | "analytics", value: unknown): void =>
    write(col, () => {
      db.prepare(`UPDATE site_content SET ${col} = ? WHERE id = ?`).run(
        JSON.stringify(value),
        SINGLETON_ID,
      );
    });

  const repo = {
    /** Assemble the whole CMS-owned document (used by the resolver on read). */
    getContent(): SiteContent {
      const content = mapRow(
        db.prepare("SELECT * FROM site_content WHERE id = ?"),
        (r): SiteContent => ({
          meta: json<SiteMeta>(r.meta),
          headline: json<Headline>(r.headline),
          lede: json<Localized>(r.lede),
          status: json<Status>(r.status),
          bio: json<Localized[]>(r.bio),
          projects: readProjects(),
          hobbies: readHobbies(),
          links: readLinks(),
          now: readNow(),
          presence: readPresence(),
          music: readMusic(),
          playtime: readPlaytime(),
            wrapped: readWrapped(),
          gallery: readGallery(),
        }),
        SINGLETON_ID,
      );
      if (!content) throw new Error("site_content is empty — run the seed first.");
      return content;
    },

    // ── scalar updates (CMS) ────────────────────────────────────────────────
    setMeta: (meta: SiteMeta) => setScalar("meta", meta),
    setHeadline: (headline: Headline) => setScalar("headline", headline),
    setLede: (lede: Localized) => setScalar("lede", lede),
    setStatus: (status: Status) => setScalar("status", status),
    setBio: (bio: Localized[]) => setScalar("bio", bio),

    /** Listening list-display config (CMS-owned). */
    getMusic: readMusic,
    setMusic(settings: MusicSettings) {
      setScalar("music", sanitizeMusicSettings(settings));
    },

    /** Playtime list-display config (CMS-owned). */
    /** Wrapped schedule config (CMS-owned). */
    getWrapped: readWrapped,
    setWrapped(settings: WrappedSettings) {
      setScalar("wrapped", sanitizeWrappedSettings(settings));
    },

    /** Custom referrer → source-name rules (CMS-owned). */
    getReferrerRules: readReferrerRules,
    setReferrerRules(rules: ReferrerRule[]) {
      setScalar("analytics", { referrerRules: sanitizeReferrerRules(rules) });
    },

    getPlaytime: readPlaytime,
    setPlaytime(settings: PlaytimeSettings) {
      setScalar("playtime", sanitizePlaytimeSettings(settings));
    },

    /** Presence category allow-list (CMS-owned). */
    getPresence: readPresence,
    setPresence(settings: PresenceSettings) {
      const clean = sanitizePresenceSettings(settings);
      write("presence", () =>
        db
          .prepare(
            `INSERT INTO site_presence (id, show, sample, retention_days, hidden_games)
               VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               show = excluded.show,
               sample = excluded.sample,
               retention_days = excluded.retention_days,
               hidden_games = excluded.hidden_games`,
          )
          .run(
            SINGLETON_ID,
            JSON.stringify(clean.show),
            JSON.stringify(clean.sample),
            clean.retentionDays,
            JSON.stringify(clean.hidden),
          ),
      );
    },

    /** Gallery images (CMS-owned; chosen from the media library). */
    getGallery: readGallery,
    upsertGalleryItem(item: GalleryItem, sort = 0) {
      write("gallery", () =>
        db.prepare(
          `INSERT INTO gallery (id, module, asset, caption, sort) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET module = excluded.module, asset = excluded.asset,
             caption = excluded.caption, sort = excluded.sort`,
        ).run(item.id, item.module, item.asset, JSON.stringify(item.caption), sort),
      );
    },
    deleteGalleryItem: (id: string) => write("gallery", () => deleteById(db, "gallery", id)),
    /**
     * Write a whole gallery's order in one transaction.
     *
     * `sort` is rewritten to the position in `ids`, which also *normalizes* it:
     * items are created with `sort = <list length at the time>`, so a delete
     * followed by an add produces duplicates, and `ORDER BY sort, id` then breaks
     * the tie by id — an order nobody chose. Renumbering the list on every reorder
     * means the column can't drift away from what the CMS shows.
     *
     * The whole list, not the moved items: dragging the last image to the front
     * changes every position between, and one request that can't half-succeed
     * beats N that can. This is what `PUT /api/cms/layout` already does for
     * modules; galleries were the surface still saving two rows at a time, which
     * is why they could only move an image one step.
     *
     * `AND module = ?` so a stale id from another gallery can't be renumbered into
     * this one.
     */
    reorderGallery(moduleId: string, ids: string[]) {
      const stmt = db.prepare("UPDATE gallery SET sort = ? WHERE id = ? AND module = ?");
      write("gallery", () => {
        ids.forEach((id, i) => stmt.run(i, id, moduleId));
      });
    },
    /** Remove every image belonging to a gallery module (used when deleting one). */
    deleteGalleryModule(moduleId: string) {
      write("gallery", () => db.prepare("DELETE FROM gallery WHERE module = ?").run(moduleId));
    },

    // ── list CRUD (CMS) ─────────────────────────────────────────────────────
    upsertProject(p: Project, sort = 0) {
      write("projects", () =>
        db.prepare(
          `INSERT INTO projects (id, name, tag, description, meta, href, featured, repo, sort)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name, tag = excluded.tag, description = excluded.description,
             meta = excluded.meta, href = excluded.href, featured = excluded.featured,
             repo = excluded.repo, sort = excluded.sort`,
        ).run(
          p.id,
          p.name,
          JSON.stringify(p.tag),
          JSON.stringify(p.description),
          JSON.stringify(p.meta),
          p.href,
          boolToInt(p.featured),
          p.repo ?? null,
          sort,
        ),
      );
    },
    deleteProject: (id: string) => write("projects", () => deleteById(db, "projects", id)),

      upsertHobby(h: Hobby, sort = 0) {
        write("hobbies", () =>
          db.prepare(
          `INSERT INTO hobbies (id, title, blurb, icon, tone, sort)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             title = excluded.title, blurb = excluded.blurb, icon = excluded.icon,
             tone = excluded.tone, sort = excluded.sort`,
        ).run(h.id, JSON.stringify(h.title), JSON.stringify(h.blurb), h.icon ?? null, h.tone, sort),
      );
    },
    deleteHobby: (id: string) => write("hobbies", () => deleteById(db, "hobbies", id)),

    upsertLink(l: Link, sort = 0) {
      write("links", () =>
        db.prepare(
          `INSERT INTO links (id, label, href, icon, is_primary, sort)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             label = excluded.label, href = excluded.href, icon = excluded.icon,
             is_primary = excluded.is_primary, sort = excluded.sort`,
        ).run(l.id, JSON.stringify(l.label), l.href, l.icon ?? null, boolToInt(l.primary), sort),
      );
    },
    deleteLink: (id: string) => write("links", () => deleteById(db, "links", id)),

    upsertNow(n: NowItem, sort = 0) {
      write("now_items", () =>
        db.prepare(
          `INSERT INTO now_items (id, key, value, sort)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             key = excluded.key, value = excluded.value, sort = excluded.sort`,
        ).run(n.id, JSON.stringify(n.key), JSON.stringify(n.value), sort),
      );
    },
    deleteNow: (id: string) => write("now_items", () => deleteById(db, "now_items", id)),

    // ── history ─────────────────────────────────────────────────────────────
    /** Newest first. `content` is the whole document at that moment. */
    listRevisions(limit = REVISION_PAGE): { id: number; savedAt: string; reason: string }[] {
      return mapRows(
        db.prepare(
          "SELECT id, saved_at, reason FROM site_content_revisions ORDER BY saved_at DESC, id DESC LIMIT ?",
        ),
        (r) => ({ id: asNumber(r.id), savedAt: asText(r.saved_at), reason: asText(r.reason) }),
        limit,
      );
    },

    getRevision(id: number): SiteContent | undefined {
      return mapRow(
        db.prepare("SELECT content FROM site_content_revisions WHERE id = ?"),
        (r) => json<SiteContent>(r.content),
        id,
      );
    },

    /**
     * Put a past revision back.
     *
     * Writes forward rather than deleting anything: the restore is itself
     * archived, so undoing a restore is another restore. An archive you can
     * rewrite isn't one.
     *
     * Scalars only, deliberately. The lists are real tables with their own ids
     * and foreign keys, and replaying them means reconciling deletes — a
     * different job with a different failure mode, and doing half of it silently
     * would be worse than not offering it. `listsDiffer` tells the caller when
     * that limit is actually being hit rather than leaving them to find out.
     */
    restoreRevision(id: number): { ok: boolean; listsDiffer: boolean } {
      const past = repo.getRevision(id);
      if (!past) return { ok: false, listsDiffer: false };
      return transact(db, () => {
        const before = repo.getContent();
        db.prepare(
          "UPDATE site_content SET meta = ?, headline = ?, lede = ?, status = ?, bio = ? WHERE id = ?",
        ).run(
          JSON.stringify(past.meta),
          JSON.stringify(past.headline),
          JSON.stringify(past.lede),
          JSON.stringify(past.status),
          JSON.stringify(past.bio),
          SINGLETON_ID,
        );
        archive(`restore:${id}`);
        const listsDiffer =
          JSON.stringify([past.hobbies, past.links, past.now, past.gallery, past.projects]) !==
          JSON.stringify([before.hobbies, before.links, before.now, before.gallery, before.projects]);
        return { ok: true, listsDiffer };
      });
    },
  };

  return repo;
}

export type ContentRepo = ReturnType<typeof contentRepo>;
