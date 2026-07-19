/**
 * One resolved module by id — the live-refresh endpoint behind the modules that
 * poll (playtime, music).
 *
 * It resolves the same SiteView the SSR page builds and returns just the requested
 * module, so a widget can refresh its own slice in place — the way `/api/presence`
 * lets the presence card update without a reload — without re-fetching or
 * re-rendering the whole site. Read-only, off the same local snapshot SSR reads;
 * nothing is fetched from an upstream on this path.
 *
 * Resolving the full view to hand back one module is deliberate: the alternative
 * is a second, parallel resolver for "just this module", and the day the two
 * disagree is a bug that only shows up live. One resolver, one shape.
 */

import { DEFAULT_LOCALE, isLocale, type Locale } from "@lg/core";
import { buildSiteView, type Store } from "@lg/db";
import type { FastifyInstance } from "fastify";
import type { ServerEnv } from "../env.js";

export function registerModuleRoutes(app: FastifyInstance, store: Store, env: ServerEnv): void {
  app.get<{ Params: { id: string }; Querystring: { locale?: string } }>(
    "/api/module/:id",
    async (req, reply) => {
      const requested = req.query.locale;
      const locale: Locale = requested && isLocale(requested) ? requested : DEFAULT_LOCALE;
      const view = await buildSiteView(store, { locale, mediaDir: env.mediaDir });
      const module = view.modules[req.params.id];
      if (!module) return reply.code(404).send({ error: "no such module" });
      return module;
    },
  );
}
