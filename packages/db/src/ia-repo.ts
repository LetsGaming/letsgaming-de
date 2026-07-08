import type { ModuleDescriptor, NavNode } from "@lg/core";
import type { DB } from "./database.js";

/** Repository for the information architecture (nav tree + module registry). */
export function iaRepo(db: DB) {
  const read = () => {
    const row = db.prepare("SELECT nav, modules FROM site_ia WHERE id = 1").get() as
      | { nav: string; modules: string }
      | undefined;
    if (!row) throw new Error("site_ia is empty — run the seed first.");
    return row;
  };

  return {
    getNav(): NavNode[] {
      return JSON.parse(read().nav) as NavNode[];
    },
    getModules(): ModuleDescriptor[] {
      return JSON.parse(read().modules) as ModuleDescriptor[];
    },
    setNav(nav: NavNode[]) {
      db.prepare("UPDATE site_ia SET nav = ? WHERE id = 1").run(JSON.stringify(nav));
    },
    setModules(modules: ModuleDescriptor[]) {
      db.prepare("UPDATE site_ia SET modules = ? WHERE id = 1").run(JSON.stringify(modules));
    },
    /** Register a new module descriptor (e.g. a new gallery instance). No-op if id exists. */
    addModule(descriptor: ModuleDescriptor) {
      const modules = JSON.parse(read().modules) as ModuleDescriptor[];
      if (modules.some((m) => m.id === descriptor.id)) return;
      modules.push(descriptor);
      db.prepare("UPDATE site_ia SET modules = ? WHERE id = 1").run(JSON.stringify(modules));
    },
    /** Remove a module descriptor and any nav leaf reference to it. */
    removeModule(id: string) {
      const modules = (JSON.parse(read().modules) as ModuleDescriptor[]).filter((m) => m.id !== id);
      const nav = JSON.parse(read().nav) as NavNode[];
      const strip = (nodes: NavNode[]) => {
        for (const n of nodes) {
          if (n.modules) n.modules = n.modules.filter((m) => m !== id);
          if (n.children) strip(n.children);
        }
      };
      strip(nav);
      db.exec("BEGIN");
      try {
        db.prepare("UPDATE site_ia SET modules = ?, nav = ? WHERE id = 1").run(
          JSON.stringify(modules),
          JSON.stringify(nav),
        );
        db.exec("COMMIT");
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },
  };
}

export type IaRepo = ReturnType<typeof iaRepo>;
