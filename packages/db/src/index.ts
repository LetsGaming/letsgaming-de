import { openDatabase } from "./database.js";
import { analyticsRepo, type AnalyticsRepo } from "./analytics-repo.js";
import { contentRepo, type ContentRepo } from "./content-repo.js";
import { guestbookRepo, type GuestbookRepo } from "./guestbook-repo.js";
import { iaRepo, type IaRepo } from "./ia-repo.js";
import { sourceRepo, type SourceRepo } from "./source-repo.js";
import { seedIfEmpty, reconcileIa } from "./seed.js";

export * from "./database.js";
export * from "./content-repo.js";
export * from "./source-repo.js";
export * from "./ia-repo.js";
export * from "./analytics-repo.js";
export * from "./guestbook-repo.js";
export * from "./seed.js";

export interface Store {
  content: ContentRepo;
  source: SourceRepo;
  ia: IaRepo;
  analytics: AnalyticsRepo;
  guestbook: GuestbookRepo;
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
  return {
    content: contentRepo(db),
    source: sourceRepo(db),
    ia: iaRepo(db),
    analytics: analyticsRepo(db),
    guestbook: guestbookRepo(db),
    close: () => db.close(),
  };
}
