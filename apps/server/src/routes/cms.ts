/**
 * CMS API (PROJECT.md §8). Small and custom on purpose — CRUD over the
 * owner-edited content and nothing more. Every route is authed and every write
 * body is validated against a JSON schema before it can reach the store.
 *
 * Scope discipline is a feature: this stays a handful of endpoints. It never
 * grows an asset library, a plugin system, or a page builder.
 */

import type {
  GalleryItem,
  Headline,
  Hobby,
  Link,
  Localized,
  NavNode,
  NowItem,
  PresenceCategory,
  Project,
  SiteMeta,
  Status,
} from "@lg/core";
import {
  DEFAULT_GALLERY_ID,
  DEFAULT_LOCALE,
  isLocale,
  galleryUsageContext,
  galleryUsageLabel,
  lintNav,
  MODULE_KIND,
  parseAssetRef,
  statusForAction,
  type Locale,
} from "@lg/core";
import { randomUUID } from "node:crypto";
import type { Store } from "@lg/db";
import type { FastifyInstance } from "fastify";
import type { ServerEnv } from "../env.js";
import { requireAuth, sessionLogin } from "../auth/guard.js";
import { schemas } from "../schemas.js";
import { badRequest, notFound } from "../errors.js";
import { buildSiteView } from "../site-view.js";

/** A fresh gallery module id. Short random suffix: unique without a lookup, and
 *  short enough to read in the Layout screen. */
const newGalleryModuleId = (): string => `gallery-${randomUUID().slice(0, 8)}`;

export function registerCmsRoutes(app: FastifyInstance, store: Store, env: ServerEnv): void {
  /**
   * Validate a proposed module order and return the nav with it applied.
   *
   * Shared by the layout save and the editor preview, because they ask the same
   * question ("is this order legal, and what does the nav look like with it?") and
   * differ only in what they do with the answer. Copied, the preview would have
   * validated a little differently from the save — so the canvas would show you a
   * layout the Save button then refuses, with no way to tell which one is lying.
   *
   * Works on a fresh copy from the store, so nothing is mutated unless the caller
   * saves it.
   */
  const applyLayoutOrder = (order: { area: string; modules: string[] }[]): NavNode[] => {
    const nav = store.ia.getNav();
    const registry = new Set(store.ia.getModules().map((m) => m.id));
    const leaves = new Map<string, NavNode>();
    const collect = (nodes: NavNode[]) => {
      for (const n of nodes) {
        if (n.modules) leaves.set(n.id, n);
        if (n.children) collect(n.children);
      }
    };
    collect(nav);

    const seen = new Set<string>();
    for (const entry of order) {
      if (!leaves.has(entry.area)) throw badRequest(`Unknown area "${entry.area}".`);
      for (const mid of entry.modules) {
        if (!registry.has(mid)) throw badRequest(`Unknown module "${mid}".`);
        if (seen.has(mid)) throw badRequest(`Module "${mid}" placed in more than one area.`);
        seen.add(mid);
      }
    }
    for (const entry of order) leaves.get(entry.area)!.modules = [...entry.modules];
    return nav;
  };

  const preHandler = requireAuth(env);
  const guard = { preHandler };
  const write = (body: unknown) => ({ preHandler, schema: { body } });

  /**
   * Register the uniform CRUD pair shared by every sortable list entity:
   *   PUT  <path>  — validate + upsert (with an optional `sort`)
   *   DELETE <path> — remove by id
   * `after` runs an optional side effect on both (e.g. recomputing gallery usages).
   * Collapses what were five copy-pasted PUT+DELETE handlers.
   */
  const registerCrud = <T extends { id: string }>(opts: {
    path: string;
    schema: unknown;
    upsert: (entity: T, sort: number) => void;
    remove: (id: string) => void;
    after?: () => void;
  }) => {
    app.put<{ Body: T & { sort?: number } }>(opts.path, write(opts.schema), async (req) => {
      // Fastify wraps a generic Body in a mapped type; re-assert the shape once here.
      const body = req.body as T & { sort?: number };
      opts.upsert(body, body.sort ?? 0);
      opts.after?.();
      return { ok: true };
    });
    app.delete<{ Params: { id: string } }>(opts.path, guard, async (req) => {
      opts.remove(req.params.id);
      opts.after?.();
      return { ok: true };
    });
  };

  // Whoami — the CMS UI uses this to confirm the session.
  app.get("/api/cms/me", guard, async (req) => ({ login: sessionLogin(req, env) }));

  // Full content read-back for the editor.
  app.get("/api/cms/content", guard, async () => ({
    content: store.content.getContent(),
    nav: store.ia.getNav(),
    modules: store.ia.getModules(),
  }));

  // ── scalars ──────────────────────────────────────────────────────────────
  app.put<{ Body: SiteMeta }>("/api/cms/meta", write(schemas.meta), async (req) => {
    store.content.setMeta(req.body);
    return { ok: true };
  });
  app.put<{ Body: Headline }>("/api/cms/headline", write(schemas.headline), async (req) => {
    store.content.setHeadline(req.body);
    return { ok: true };
  });
  app.put<{ Body: Localized }>("/api/cms/lede", write(schemas.lede), async (req) => {
    store.content.setLede(req.body);
    return { ok: true };
  });
  app.put<{ Body: Status }>("/api/cms/status", write(schemas.status), async (req) => {
    store.content.setStatus(req.body);
    return { ok: true };
  });
  app.put<{ Body: Localized[] }>("/api/cms/bio", write(schemas.bio), async (req) => {
    store.content.setBio(req.body);
    return { ok: true };
  });
  app.put<{ Body: { show: PresenceCategory[] } }>(
    "/api/cms/presence",
    write(schemas.presence),
    async (req) => {
      store.content.setPresence({ show: req.body.show });
      return { ok: true };
    },
  );

  // ── gallery (images placed on the site, chosen from the asset library) ─────
  // Recompute which assets each gallery module references, so the library's
  // "used in" list + delete-warning stay accurate.
  const syncGalleryUsages = () => {
    const items = store.content.getGallery();
    for (const m of store.ia.getModules().filter((mm) => mm.kind === MODULE_KIND.gallery)) {
      const entries = items
        .filter((g) => g.module === m.id)
        .flatMap((g) => {
          const assetId = parseAssetRef(g.asset);
          return assetId ? [{ assetId, label: galleryUsageLabel(m.id) }] : [];
        });
      store.assets.recordUsage(galleryUsageContext(m.id), entries);
    }
  };

  registerCrud<GalleryItem>({
    path: "/api/cms/gallery/:id",
    schema: schemas.galleryItem,
    upsert: store.content.upsertGalleryItem,
    remove: store.content.deleteGalleryItem,
    after: syncGalleryUsages,
  });

  // Reorder a whole gallery in one write. The CMS sends the list as it shows it;
  // the server renumbers `sort` to match, inside one transaction.
  //
  // Dragging an image from the end to the front moves everything between it, so
  // the old two-PUT swap (all ±1 could ever need) doesn't describe the operation:
  // N PUTs can half-succeed and leave an order nobody chose. `PUT /api/cms/layout`
  // already sends the whole order for modules; this is the same shape for images.
  app.put<{ Body: { module: string; ids: string[] } }>(
    "/api/cms/gallery-order",
    write(schemas.galleryOrder),
    async (req) => {
      const { module: moduleId, ids } = req.body;
      const mod = store.ia.getModules().find((m) => m.id === moduleId);
      if (!mod || mod.kind !== MODULE_KIND.gallery) throw badRequest("Not a gallery module.");
      store.content.reorderGallery(moduleId, ids);
      return { ok: true };
    },
  );

  // Create a new gallery instance (a gallery-kind module). It starts unplaced
  // ("hidden"); the owner positions it via the Layout screen.
  app.post<{ Body: { heading: Localized; note?: Localized } }>(
    "/api/cms/gallery-module",
    write(schemas.galleryModule),
    async (req) => {
      const id = newGalleryModuleId();
      store.ia.addModule({
        id,
        kind: MODULE_KIND.gallery,
        heading: req.body.heading,
        ...(req.body.note ? { note: req.body.note } : {}),
      });
      return { ok: true, id };
    },
  );
  // Delete a gallery instance: only gallery-kind modules, and never the built-in
  // "gallery". Removes the module, its nav placement, and its images.
  app.delete<{ Params: { id: string } }>("/api/cms/gallery-module/:id", guard, async (req, reply) => {
    const id = req.params.id;
    const mod = store.ia.getModules().find((m) => m.id === id);
    if (!mod || mod.kind !== MODULE_KIND.gallery) {
      throw badRequest("Not a gallery module.");
    }
    if (id === DEFAULT_GALLERY_ID) {
      throw badRequest("The default gallery can't be deleted.");
    }
    store.content.deleteGalleryModule(id);
    store.ia.removeModule(id);
    store.assets.clearUsageContext(galleryUsageContext(id));
    return { ok: true };
  });

  // ── layout: place modules across areas (reorder, move, hide) ───────────────
  // Accepts the full desired placement. A module may sit in at most one area;
  // any registered module left out of every area is "hidden". Can't invent
  // modules, and the result must pass nav-lint (e.g. no empty area).
  app.put<{ Body: { order: { area: string; modules: string[] }[] } }>(
    "/api/cms/layout",
    write(schemas.layout),
    async (req, reply) => {
      const nav = applyLayoutOrder(req.body.order);
      // Lint on save, not on preview: mid-drag an area is legitimately empty, and
      // a preview that refuses to render the thing you're looking at is no help.
      // This is the gate; the canvas is a mirror.
      const result = lintNav(nav);
      if (!result.ok) {
        throw badRequest(result.violations.map((v) => v.message).join("; "));
      }
      store.ia.setNav(nav);
      return { ok: true };
    },
  );

  /**
   * What the site *would* look like with this order — resolved, not saved.
   *
   * The editor canvas renders real site components, so it needs a real `SiteView`,
   * which means the resolver, which means live source data and the asset lookup.
   * Both live on this side, so resolving here is the only way the canvas can show
   * your unsaved layout without the browser also holding a copy of everything the
   * resolver needs.
   *
   * Authed, and it writes nothing. That combination is the point: the canvas
   * document itself ships no data (see apps/web/src/pages/admin/canvas.astro), so
   * unpublished layout only ever exists behind this session.
   */
  app.post<{ Body: { order: { area: string; modules: string[] }[]; locale?: string } }>(
    "/api/cms/preview",
    write(schemas.preview),
    async (req) => {
      const nav = applyLayoutOrder(req.body.order);
      const requested = req.body.locale;
      const locale: Locale = requested && isLocale(requested) ? requested : DEFAULT_LOCALE;
      return buildSiteView(store, env, locale, nav);
    },
  );

  // ── list entities (uniform CRUD: upsert with sort, delete by id) ───────────
  registerCrud<Project>({
    path: "/api/cms/projects/:id",
    schema: schemas.project,
    upsert: store.content.upsertProject,
    remove: store.content.deleteProject,
  });
  registerCrud<Hobby>({
    path: "/api/cms/hobbies/:id",
    schema: schemas.hobby,
    upsert: store.content.upsertHobby,
    remove: store.content.deleteHobby,
  });
  registerCrud<Link>({
    path: "/api/cms/links/:id",
    schema: schemas.link,
    upsert: store.content.upsertLink,
    remove: store.content.deleteLink,
  });
  registerCrud<NowItem>({
    path: "/api/cms/now/:id",
    schema: schemas.now,
    upsert: store.content.upsertNow,
    remove: store.content.deleteNow,
  });

  // ── guestbook moderation ───────────────────────────────────────────────────
  // The queue: pending first (most-suspicious first), then approved/rejected.
  app.get("/api/cms/guestbook", guard, async () => ({
    entries: store.guestbook.listForModeration(),
    pending: store.guestbook.countPending(),
  }));

  // Approve or reject one entry. Only these two transitions are allowed.
  app.post<{ Params: { id: string; action: string } }>(
    "/api/cms/guestbook/:id/:action",
    guard,
    async (req, reply) => {
      const id = Number(req.params.id);
      // `statusForAction` owns both spellings ("approve" the verb, "approved" the
      // state) and the mapping between them, so the CMS client and this route
      // can't drift on either half.
      const status = statusForAction(req.params.action);
      if (!Number.isInteger(id) || !status) {
        throw badRequest("Invalid id or action.");
      }
      if (!store.guestbook.setStatus(id, status)) {
        throw notFound("Entry not found.");
      }
      return { ok: true };
    },
  );

  app.delete<{ Params: { id: string } }>("/api/cms/guestbook/:id", guard, async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || !store.guestbook.remove(id)) {
      throw notFound("Entry not found.");
    }
    return { ok: true };
  });
}
