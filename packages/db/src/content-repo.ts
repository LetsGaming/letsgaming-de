import type {
  Headline,
  Hobby,
  Link,
  Localized,
  NowItem,
  PresenceSettings,
  Project,
  SiteContent,
  SiteMeta,
  Status,
} from "@lg/core";
import type { GalleryItem } from "@lg/core";
import { defaultPresenceSettings, sanitizePresenceShow } from "@lg/core";
import type { DB } from "./database.js";
import {
  asBool,
  asNullableText,
  asText,
  boolToInt,
  deleteById,
  json,
  mapRow,
  mapRows,
  SINGLETON_ID,
  type Row,
} from "./row-mapper.js";

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

  /** Presence config (single row); falls back to the default if unseeded. */
  const readPresence = (): PresenceSettings => {
    const show = mapRow(
      db.prepare("SELECT show FROM site_presence WHERE id = ?"),
      (r) => sanitizePresenceShow(json<unknown>(r.show)),
      SINGLETON_ID,
    );
    return show ? { show } : defaultPresenceSettings();
  };

  /** Update one scalar column on the single site_content row. */
  const setScalar = (col: "meta" | "headline" | "lede" | "status" | "bio", value: unknown): void => {
    db.prepare(`UPDATE site_content SET ${col} = ? WHERE id = ?`).run(JSON.stringify(value), SINGLETON_ID);
  };

  return {
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

    /** Presence category allow-list (CMS-owned). */
    getPresence: readPresence,
    setPresence(settings: PresenceSettings) {
      const show = sanitizePresenceShow(settings.show);
      db.prepare(
        `INSERT INTO site_presence (id, show) VALUES (?, ?)
         ON CONFLICT(id) DO UPDATE SET show = excluded.show`,
      ).run(SINGLETON_ID, JSON.stringify(show));
    },

    /** Gallery images (CMS-owned; chosen from the media library). */
    getGallery: readGallery,
    upsertGalleryItem(item: GalleryItem, sort = 0) {
      db.prepare(
        `INSERT INTO gallery (id, module, asset, caption, sort) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET module = excluded.module, asset = excluded.asset,
           caption = excluded.caption, sort = excluded.sort`,
      ).run(item.id, item.module, item.asset, JSON.stringify(item.caption), sort);
    },
    deleteGalleryItem: (id: string) => deleteById(db, "gallery", id),
    /** Remove every image belonging to a gallery module (used when deleting one). */
    deleteGalleryModule(moduleId: string) {
      db.prepare("DELETE FROM gallery WHERE module = ?").run(moduleId);
    },

    // ── list CRUD (CMS) ─────────────────────────────────────────────────────
    upsertProject(p: Project, sort = 0) {
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
      );
    },
    deleteProject: (id: string) => deleteById(db, "projects", id),

    upsertHobby(h: Hobby, sort = 0) {
      db.prepare(
        `INSERT INTO hobbies (id, title, blurb, icon, tone, sort)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title, blurb = excluded.blurb, icon = excluded.icon,
           tone = excluded.tone, sort = excluded.sort`,
      ).run(h.id, JSON.stringify(h.title), JSON.stringify(h.blurb), h.icon ?? null, h.tone, sort);
    },
    deleteHobby: (id: string) => deleteById(db, "hobbies", id),

    upsertLink(l: Link, sort = 0) {
      db.prepare(
        `INSERT INTO links (id, label, href, icon, is_primary, sort)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           label = excluded.label, href = excluded.href, icon = excluded.icon,
           is_primary = excluded.is_primary, sort = excluded.sort`,
      ).run(l.id, JSON.stringify(l.label), l.href, l.icon ?? null, boolToInt(l.primary), sort);
    },
    deleteLink: (id: string) => deleteById(db, "links", id),

    upsertNow(n: NowItem, sort = 0) {
      db.prepare(
        `INSERT INTO now_items (id, key, value, sort)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           key = excluded.key, value = excluded.value, sort = excluded.sort`,
      ).run(n.id, JSON.stringify(n.key), JSON.stringify(n.value), sort);
    },
    deleteNow: (id: string) => deleteById(db, "now_items", id),
  };
}

export type ContentRepo = ReturnType<typeof contentRepo>;
