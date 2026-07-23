export { zonedParts, zonedDay } from "./tz.js";
import { openDatabase, DatabaseSync } from "./database.js";
export { buildSiteView, buildAssetLookup, type BuildSiteViewOptions } from "./site-view.js";
import { analyticsRepo, type AnalyticsRepo } from "./analytics-repo.js";
import { assetsRepo, type AssetsRepo } from "./assets-repo.js";
import { contentRepo, type ContentRepo } from "./content-repo.js";
import { guestbookRepo, type GuestbookRepo } from "./guestbook-repo.js";
import { musicRepo } from "./music-repo.js";
import { wrappedRepo, type WrappedRepo } from "./wrapped-repo.js";
import { sessionsRepo } from "./sessions-repo.js";
import { gameMetaRepo } from "./game-meta-repo.js";
import { iaRepo, type IaRepo } from "./ia-repo.js";
import { sourceRepo, type SourceRepo } from "./source-repo.js";
import { seedIfEmpty, reconcileIa } from "./seed.js";

export * from "./database.js";
export * from "./migrate.js";
export * from "./row-mapper.js";
export * from "./content-repo.js";
export * from "./source-repo.js";
export * from "./ia-repo.js";
export * from "./analytics-repo.js";
export * from "./assets-repo.js";
export * from "./guestbook-repo.js";
export * from "./seed.js";

export type SessionsRepo = ReturnType<typeof sessionsRepo>;
export type MusicRepo = ReturnType<typeof musicRepo>;
export type GameMetaRepo = ReturnType<typeof gameMetaRepo>;

export interface Store {
  content: ContentRepo;
  source: SourceRepo;
  ia: IaRepo;
  analytics: AnalyticsRepo;
  assets: AssetsRepo;
  guestbook: GuestbookRepo;
  sessions: SessionsRepo;
  music: MusicRepo;
  wrapped: WrappedRepo;
  gameMeta: GameMetaRepo;
  close(): void;
}

/**
 * Open the store, ensure schema + seed, and expose the repositories.
 * One call the server and the sync worker both use.
 */
export function openStore(path: string): Store {
  const db = openDatabase(path);
  seedIfEmpty(db);
  reconcileIa(db);
  return storeFrom(db);
}

/**
 * Open the store read-only, for a process that must not write.
 *
 * The web app reads the store directly to build each SSR page — no HTTP hop to
 * the API. But the API is the writer: it runs migrations, seeds, and takes the
 * sync/CMS writes. If web also ran migrations or seeded, two processes would race
 * the same file on boot. Opening read-only makes that impossible at the SQLite
 * level: this handle can only read, so there's nothing to race. It also skips
 * `seedIfEmpty`/`reconcileIa` (writes the API already did) and doesn't run the
 * migration runner — the schema is whatever the writer brought it to.
 *
 * WAL matters here: a read-only connection sees committed writes from the writer
 * without blocking it, so SSR reads stay live as the sync worker updates the
 * store.
 */
export function openStoreReadonly(path: string): Store {
  const db = new DatabaseSync(path, { readOnly: true });
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  return storeFrom(db);
}

/** Wire the repos over an already-open handle. Shared by both open modes so the
 *  read surface is identical whether the caller can write or not. */
function storeFrom(db: ReturnType<typeof openDatabase>): Store {
  return {
    content: contentRepo(db),
    source: sourceRepo(db),
    ia: iaRepo(db),
    analytics: analyticsRepo(db),
    assets: assetsRepo(db),
    guestbook: guestbookRepo(db),
    sessions: sessionsRepo(db),
    music: musicRepo(db),
    wrapped: wrappedRepo(db),
    gameMeta: gameMetaRepo(db),
    close: () => db.close(),
  };
}
