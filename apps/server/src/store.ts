import { openStore, type Store } from "@lg/db";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

let store: Store | undefined;

/** Open (once) and return the shared store, ensuring its directory exists. */
export function getStore(dbPath: string): Store {
  if (!store) {
    if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });
    store = openStore(dbPath);
  }
  return store;
}
