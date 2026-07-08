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
import { lintNav } from "@lg/core";
import { randomUUID } from "node:crypto";
import type { Store } from "@lg/db";
import type { FastifyInstance } from "fastify";
import type { ServerEnv } from "../env.js";
import { requireAuth, sessionLogin } from "../auth/guard.js";
import { schemas } from "../schemas.js";

export function registerCmsRoutes(app: FastifyInstance, store: Store, env: ServerEnv): void {
  const preHandler = requireAuth(env);
  const guard = { preHandler };
  const write = (body: unknown) => ({ preHandler, schema: { body } });

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
    for (const m of store.ia.getModules().filter((mm) => mm.kind === "gallery")) {
      const entries = items
        .filter((g) => g.module === m.id)
        .map((g) => ({ assetId: g.asset.replace(/^asset:/, ""), label: `Gallery: ${m.id}` }));
      store.assets.recordUsage(`gallery:${m.id}`, entries);
    }
  };

  app.put<{ Body: GalleryItem & { sort?: number } }>(
    "/api/cms/gallery/:id",
    write(schemas.galleryItem),
    async (req) => {
      const { sort, ...item } = req.body;
      store.content.upsertGalleryItem(item, sort ?? 0);
      syncGalleryUsages();
      return { ok: true };
    },
  );
  app.delete<{ Params: { id: string } }>("/api/cms/gallery/:id", guard, async (req) => {
    store.content.deleteGalleryItem(req.params.id);
    syncGalleryUsages();
    return { ok: true };
  });

  // Create a new gallery instance (a gallery-kind module). It starts unplaced
  // ("hidden"); the owner positions it via the Layout screen.
  app.post<{ Body: { heading: Localized; note?: Localized } }>(
    "/api/cms/gallery-module",
    write(schemas.galleryModule),
    async (req) => {
      const id = `gallery-${randomUUID().slice(0, 8)}`;
      store.ia.addModule({ id, kind: "gallery", heading: req.body.heading, ...(req.body.note ? { note: req.body.note } : {}) });
      return { ok: true, id };
    },
  );
  // Delete a gallery instance: only gallery-kind modules, and never the built-in
  // "gallery". Removes the module, its nav placement, and its images.
  app.delete<{ Params: { id: string } }>("/api/cms/gallery-module/:id", guard, async (req, reply) => {
    const id = req.params.id;
    const mod = store.ia.getModules().find((m) => m.id === id);
    if (!mod || mod.kind !== "gallery") {
      return reply.code(400).send({ error: "Not a gallery module." });
    }
    if (id === "gallery") {
      return reply.code(400).send({ error: "The default gallery can't be deleted." });
    }
    store.content.deleteGalleryModule(id);
    store.ia.removeModule(id);
    store.assets.clearUsageContext(`gallery:${id}`);
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
      for (const entry of req.body.order) {
        if (!leaves.has(entry.area)) {
          return reply.code(400).send({ error: `Unknown area "${entry.area}".` });
        }
        for (const mid of entry.modules) {
          if (!registry.has(mid)) return reply.code(400).send({ error: `Unknown module "${mid}".` });
          if (seen.has(mid)) {
            return reply.code(400).send({ error: `Module "${mid}" placed in more than one area.` });
          }
          seen.add(mid);
        }
      }

      for (const entry of req.body.order) leaves.get(entry.area)!.modules = [...entry.modules];

      const result = lintNav(nav);
      if (!result.ok) {
        return reply.code(400).send({ error: result.violations.map((v) => v.message).join("; ") });
      }
      store.ia.setNav(nav);
      return { ok: true };
    },
  );

  // ── list entities ────────────────────────────────────────────────────────
  app.put<{ Body: Project & { sort?: number } }>(
    "/api/cms/projects/:id",
    write(schemas.project),
    async (req) => {
      const { sort, ...project } = req.body;
      store.content.upsertProject(project, sort ?? 0);
      return { ok: true };
    },
  );
  app.delete<{ Params: { id: string } }>("/api/cms/projects/:id", guard, async (req) => {
    store.content.deleteProject(req.params.id);
    return { ok: true };
  });

  app.put<{ Body: Hobby & { sort?: number } }>(
    "/api/cms/hobbies/:id",
    write(schemas.hobby),
    async (req) => {
      const { sort, ...hobby } = req.body;
      store.content.upsertHobby(hobby, sort ?? 0);
      return { ok: true };
    },
  );
  app.delete<{ Params: { id: string } }>("/api/cms/hobbies/:id", guard, async (req) => {
    store.content.deleteHobby(req.params.id);
    return { ok: true };
  });

  app.put<{ Body: Link & { sort?: number } }>(
    "/api/cms/links/:id",
    write(schemas.link),
    async (req) => {
      const { sort, ...link } = req.body;
      store.content.upsertLink(link, sort ?? 0);
      return { ok: true };
    },
  );
  app.delete<{ Params: { id: string } }>("/api/cms/links/:id", guard, async (req) => {
    store.content.deleteLink(req.params.id);
    return { ok: true };
  });

  app.put<{ Body: NowItem & { sort?: number } }>(
    "/api/cms/now/:id",
    write(schemas.now),
    async (req) => {
      const { sort, ...item } = req.body;
      store.content.upsertNow(item, sort ?? 0);
      return { ok: true };
    },
  );
  app.delete<{ Params: { id: string } }>("/api/cms/now/:id", guard, async (req) => {
    store.content.deleteNow(req.params.id);
    return { ok: true };
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
      const status =
        req.params.action === "approve"
          ? "approved"
          : req.params.action === "reject"
            ? "rejected"
            : null;
      if (!Number.isInteger(id) || !status) {
        return reply.code(400).send({ error: "Invalid id or action." });
      }
      if (!store.guestbook.setStatus(id, status)) {
        return reply.code(404).send({ error: "Entry not found." });
      }
      return { ok: true };
    },
  );

  app.delete<{ Params: { id: string } }>("/api/cms/guestbook/:id", guard, async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || !store.guestbook.remove(id)) {
      return reply.code(404).send({ error: "Entry not found." });
    }
    return { ok: true };
  });
}
