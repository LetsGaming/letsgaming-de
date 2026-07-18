/**
 * The read API (PROJECT.md §4). One endpoint: the whole resolved site as
 * normalized JSON. The site reads whatever the last sync wrote — nothing is
 * fetched from an external API here.
 */

import { DEFAULT_LOCALE, isLocale, type Locale } from "@lg/core";
import type { Store } from "@lg/db";
import type { FastifyInstance } from "fastify";
import type { ServerEnv } from "../env.js";
import { buildSiteView } from "@lg/db";

export function registerReadRoutes(app: FastifyInstance, store: Store, env: ServerEnv): void {
  app.get<{ Querystring: { locale?: string } }>("/api/site", async (req) => {
    const requested = req.query.locale;
    const locale: Locale = requested && isLocale(requested) ? requested : DEFAULT_LOCALE;
    return buildSiteView(store, {
      locale,
      mediaDir: env.mediaDir,
    });
  });
}
