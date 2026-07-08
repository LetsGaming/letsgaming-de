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

const parse = <T>(s: string): T => JSON.parse(s) as T;
const str = (s: string): string => s; // readability marker for non-JSON columns

interface ContentRow {
  meta: string;
  headline: string;
  lede: string;
  status: string;
  bio: string;
}
interface ProjectRow {
  id: string;
  name: string;
  tag: string;
  description: string;
  meta: string;
  href: string;
  featured: number;
  repo: string | null;
  sort: number;
}
interface HobbyRow {
  id: string;
  title: string;
  blurb: string;
  icon: string | null;
  tone: string;
  sort: number;
}
interface LinkRow {
  id: string;
  label: string;
  href: string;
  icon: string | null;
  is_primary: number;
  sort: number;
}
interface NowRow {
  id: string;
  key: string;
  value: string;
  sort: number;
}

/** Repository for CMS-owned content: the read path plus CRUD for the CMS. */
export function contentRepo(db: DB) {
  const readProjects = (): Project[] =>
    (db.prepare("SELECT * FROM projects ORDER BY sort, id").all() as unknown as ProjectRow[]).map((r) => ({
      id: r.id,
      name: r.name,
      tag: parse<Localized>(r.tag),
      description: parse<Localized>(r.description),
      meta: parse<Localized[]>(r.meta),
      href: r.href,
      featured: r.featured === 1,
      ...(r.repo ? { repo: r.repo } : {}),
    }));

  const readHobbies = (): Hobby[] =>
    (db.prepare("SELECT * FROM hobbies ORDER BY sort, id").all() as unknown as HobbyRow[]).map((r) => ({
      id: r.id,
      title: parse<Localized>(r.title),
      blurb: parse<Localized>(r.blurb),
      ...(r.icon ? { icon: r.icon } : {}),
      tone: r.tone as Hobby["tone"],
    }));

  const readLinks = (): Link[] =>
    (db.prepare("SELECT * FROM links ORDER BY sort, id").all() as unknown as LinkRow[]).map((r) => ({
      id: r.id,
      label: parse<Localized>(r.label),
      href: r.href,
      ...(r.icon ? { icon: r.icon } : {}),
      primary: r.is_primary === 1,
    }));

  const readNow = (): NowItem[] =>
    (db.prepare("SELECT * FROM now_items ORDER BY sort, id").all() as unknown as NowRow[]).map((r) => ({
      id: r.id,
      key: parse<Localized>(r.key),
      value: parse<Localized>(r.value),
    }));

  /** Presence config (single row); falls back to the default if unseeded. */
  const readPresence = (): PresenceSettings => {
    const row = db.prepare("SELECT show FROM site_presence WHERE id = 1").get() as
      | { show: string }
      | undefined;
    if (!row) return defaultPresenceSettings();
    return { show: sanitizePresenceShow(parse<unknown>(row.show)) };
  };

  const readGallery = (): GalleryItem[] =>
    (db.prepare("SELECT * FROM gallery ORDER BY sort, id").all() as unknown as {
      id: string;
      module: string;
      src: string;
      caption: string;
      alt: string | null;
    }[]).map((r) => ({
      id: r.id,
      module: r.module ?? "gallery",
      src: r.src,
      caption: parse<Localized>(r.caption),
      ...(r.alt ? { alt: r.alt } : {}),
    }));

  return {
    /** Assemble the whole CMS-owned document (used by the resolver on read). */
    getContent(): SiteContent {
      const row = db.prepare("SELECT * FROM site_content WHERE id = 1").get() as unknown as
        | ContentRow
        | undefined;
      if (!row) throw new Error("site_content is empty — run the seed first.");
      return {
        meta: parse<SiteMeta>(row.meta),
        headline: parse<Headline>(row.headline),
        lede: parse<Localized>(str(row.lede)),
        status: parse<Status>(row.status),
        bio: parse<Localized[]>(row.bio),
        projects: readProjects(),
        hobbies: readHobbies(),
        links: readLinks(),
        now: readNow(),
        presence: readPresence(),
        gallery: readGallery(),
      };
    },

    // ── scalar updates (CMS) ────────────────────────────────────────────────
    setMeta(meta: SiteMeta) {
      db.prepare("UPDATE site_content SET meta = ? WHERE id = 1").run(JSON.stringify(meta));
    },
    setHeadline(headline: Headline) {
      db.prepare("UPDATE site_content SET headline = ? WHERE id = 1").run(JSON.stringify(headline));
    },
    setLede(lede: Localized) {
      db.prepare("UPDATE site_content SET lede = ? WHERE id = 1").run(JSON.stringify(lede));
    },
    setStatus(status: Status) {
      db.prepare("UPDATE site_content SET status = ? WHERE id = 1").run(JSON.stringify(status));
    },
    setBio(bio: Localized[]) {
      db.prepare("UPDATE site_content SET bio = ? WHERE id = 1").run(JSON.stringify(bio));
    },

    /** Presence category allow-list (CMS-owned). */
    getPresence: readPresence,
    setPresence(settings: PresenceSettings) {
      const show = sanitizePresenceShow(settings.show);
      db.prepare(
        `INSERT INTO site_presence (id, show) VALUES (1, ?)
         ON CONFLICT(id) DO UPDATE SET show = excluded.show`,
      ).run(JSON.stringify(show));
    },

    /** Gallery images (CMS-owned; chosen from the media library). */
    getGallery: readGallery,
    upsertGalleryItem(item: GalleryItem, sort = 0) {
      db.prepare(
        `INSERT INTO gallery (id, module, src, caption, alt, sort) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET module = excluded.module, src = excluded.src,
           caption = excluded.caption, alt = excluded.alt, sort = excluded.sort`,
      ).run(item.id, item.module, item.src, JSON.stringify(item.caption), item.alt ?? null, sort);
    },
    deleteGalleryItem(id: string) {
      db.prepare("DELETE FROM gallery WHERE id = ?").run(id);
    },
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
        p.featured ? 1 : 0,
        p.repo ?? null,
        sort,
      );
    },
    deleteProject(id: string) {
      db.prepare("DELETE FROM projects WHERE id = ?").run(id);
    },

    upsertHobby(h: Hobby, sort = 0) {
      db.prepare(
        `INSERT INTO hobbies (id, title, blurb, icon, tone, sort)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title, blurb = excluded.blurb, icon = excluded.icon,
           tone = excluded.tone, sort = excluded.sort`,
      ).run(h.id, JSON.stringify(h.title), JSON.stringify(h.blurb), h.icon ?? null, h.tone, sort);
    },
    deleteHobby(id: string) {
      db.prepare("DELETE FROM hobbies WHERE id = ?").run(id);
    },

    upsertLink(l: Link, sort = 0) {
      db.prepare(
        `INSERT INTO links (id, label, href, icon, is_primary, sort)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           label = excluded.label, href = excluded.href, icon = excluded.icon,
           is_primary = excluded.is_primary, sort = excluded.sort`,
      ).run(l.id, JSON.stringify(l.label), l.href, l.icon ?? null, l.primary ? 1 : 0, sort);
    },
    deleteLink(id: string) {
      db.prepare("DELETE FROM links WHERE id = ?").run(id);
    },

    upsertNow(n: NowItem, sort = 0) {
      db.prepare(
        `INSERT INTO now_items (id, key, value, sort)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           key = excluded.key, value = excluded.value, sort = excluded.sort`,
      ).run(n.id, JSON.stringify(n.key), JSON.stringify(n.value), sort);
    },
    deleteNow(id: string) {
      db.prepare("DELETE FROM now_items WHERE id = ?").run(id);
    },
  };
}

export type ContentRepo = ReturnType<typeof contentRepo>;
