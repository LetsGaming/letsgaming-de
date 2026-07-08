/**
 * CMS API (PROJECT.md §8). Small and custom on purpose — CRUD over the
 * owner-edited content and nothing more. Every route is authed and every write
 * body is validated against a JSON schema before it can reach the store.
 *
 * Scope discipline is a feature: this stays a handful of endpoints. It never
 * grows an asset library, a plugin system, or a page builder.
 */

import type {
  Headline,
  Hobby,
  Link,
  Localized,
  NowItem,
  Project,
  SiteMeta,
  Status,
} from "@lg/core";
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
