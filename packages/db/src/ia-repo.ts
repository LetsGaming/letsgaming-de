import type { ModuleDescriptor, NavNode } from "@lg/core";
import type { DB } from "./database.js";
import { asNumber, asText, json, mapRow, mapRows, SINGLETON_ID, transact } from "./row-mapper.js";

/** How many IA revisions to keep; older ones are pruned on write. */
const IA_REVISION_CAP = 500;

/** Repository for the information architecture (nav tree + module registry). */
export function iaRepo(db: DB) {
  const read = (): { nav: string; modules: string } => {
    const row = mapRow(
      db.prepare("SELECT nav, modules FROM site_ia WHERE id = ?"),
      (r) => ({ nav: asText(r.nav), modules: asText(r.modules) }),
      SINGLETON_ID,
    );
    if (!row) throw new Error("site_ia is empty — run the seed first.");
    return row;
  };

  /**
   * Snapshot the IA as it stands before a write, inside the caller's transaction,
   * so a rolled-back write leaves no revision. Rows beyond the cap are pruned.
   * An empty `site_ia` (pre-seed) has nothing to archive.
   */
  const archive = (reason: string): void => {
    const row = mapRow(
      db.prepare("SELECT nav, modules FROM site_ia WHERE id = ?"),
      (r) => ({ nav: asText(r.nav), modules: asText(r.modules) }),
      SINGLETON_ID,
    );
    if (!row) return;
    db.prepare("INSERT INTO site_ia_revisions (saved_at, reason, nav, modules) VALUES (?, ?, ?, ?)").run(
      new Date().toISOString(),
      reason,
      row.nav,
      row.modules,
    );
    db.prepare(
      "DELETE FROM site_ia_revisions WHERE id <= (SELECT id FROM site_ia_revisions ORDER BY id DESC LIMIT 1 OFFSET ?)",
    ).run(IA_REVISION_CAP);
  };

  const writeIa = (reason: string, nav: string | null, modules: string | null) =>
    transact(db, () => {
      archive(reason);
      if (nav !== null) db.prepare("UPDATE site_ia SET nav = ? WHERE id = ?").run(nav, SINGLETON_ID);
      if (modules !== null)
        db.prepare("UPDATE site_ia SET modules = ? WHERE id = ?").run(modules, SINGLETON_ID);
    });

  return {
    getNav(): NavNode[] {
      return json<NavNode[]>(read().nav);
    },
    getModules(): ModuleDescriptor[] {
      return json<ModuleDescriptor[]>(read().modules);
    },
    setNav(nav: NavNode[]) {
      writeIa("nav", JSON.stringify(nav), null);
    },
    setModules(modules: ModuleDescriptor[]) {
      writeIa("modules", null, JSON.stringify(modules));
    },
    /** Newest first. Each revision is the IA as it stood before that write. */
    listRevisions(limit = 50): { id: number; savedAt: string; reason: string }[] {
      return mapRows(
        db.prepare("SELECT id, saved_at, reason FROM site_ia_revisions ORDER BY id DESC LIMIT ?"),
        (r) => ({ id: asNumber(r.id), savedAt: asText(r.saved_at), reason: asText(r.reason) }),
        limit,
      );
    },
    /** Register a new module descriptor (e.g. a new gallery instance). No-op if id exists. */
    addModule(descriptor: ModuleDescriptor) {
      const modules = json<ModuleDescriptor[]>(read().modules);
      if (modules.some((m) => m.id === descriptor.id)) return;
      modules.push(descriptor);
      writeIa("module-added", null, JSON.stringify(modules));
    },
    /** Remove a module descriptor and any nav leaf reference to it. */
    removeModule(id: string) {
      const current = read();
      const modules = json<ModuleDescriptor[]>(current.modules).filter((m) => m.id !== id);
      const nav = json<NavNode[]>(current.nav);
      const strip = (nodes: NavNode[]) => {
        for (const n of nodes) {
          if (n.modules) n.modules = n.modules.filter((m) => m !== id);
          if (n.children) strip(n.children);
        }
      };
      strip(nav);
      writeIa("module-removed", JSON.stringify(nav), JSON.stringify(modules));
    },
  };
}

export type IaRepo = ReturnType<typeof iaRepo>;
