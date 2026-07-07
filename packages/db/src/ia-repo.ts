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
  };
}

export type IaRepo = ReturnType<typeof iaRepo>;
