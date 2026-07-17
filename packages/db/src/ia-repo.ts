import type { ModuleDescriptor, NavNode } from "@lg/core";
import type { DB } from "./database.js";
import { asText, json, mapRow, SINGLETON_ID, transact } from "./row-mapper.js";

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

  const writeIa = (nav: string, modules: string) =>
    db.prepare("UPDATE site_ia SET nav = ?, modules = ? WHERE id = ?").run(nav, modules, SINGLETON_ID);

  return {
    getNav(): NavNode[] {
      return json<NavNode[]>(read().nav);
    },
    getModules(): ModuleDescriptor[] {
      return json<ModuleDescriptor[]>(read().modules);
    },
    setNav(nav: NavNode[]) {
      db.prepare("UPDATE site_ia SET nav = ? WHERE id = ?").run(JSON.stringify(nav), SINGLETON_ID);
    },
    setModules(modules: ModuleDescriptor[]) {
      db.prepare("UPDATE site_ia SET modules = ? WHERE id = ?").run(
        JSON.stringify(modules),
        SINGLETON_ID,
      );
    },
    /** Register a new module descriptor (e.g. a new gallery instance). No-op if id exists. */
    addModule(descriptor: ModuleDescriptor) {
      const modules = json<ModuleDescriptor[]>(read().modules);
      if (modules.some((m) => m.id === descriptor.id)) return;
      modules.push(descriptor);
      db.prepare("UPDATE site_ia SET modules = ? WHERE id = ?").run(
        JSON.stringify(modules),
        SINGLETON_ID,
      );
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
      transact(db, () => writeIa(JSON.stringify(nav), JSON.stringify(modules)));
    },
  };
}

export type IaRepo = ReturnType<typeof iaRepo>;
