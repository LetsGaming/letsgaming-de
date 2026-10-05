import { ref, watch, type Ref } from "vue";
import { cms } from "../lib/cms";
import type { Autosave } from "./useAutosave";

/**
 * A CMS-owned list, with its CRUD.
 *
 * The server already had this. `registerCrud<T extends { id: string }>({ path,
 * schema, upsert, remove })` is one helper and every list entity is four lines.
 * This is the client's half: one typed list helper instead of three panels with
 * their own copies of the same handlers.
 *
 * It's shaped like the operation, not the button. `moveTo(from, to)` is what
 * actually happens; the up and down arrows are callers that pass `i, i±1`, and
 * drag passes whatever it likes.
 *
 * Edits are never saved by a button. A deep watcher hands every row to the
 * autosave, which saves what changed and skips what didn't.
 */

/** The shape every CMS list entity shares: the client's half of the contract
 *  the server states as `T extends { id: string }`. */
export interface ListEntity {
  id: string;
  sort?: number;
}

export interface EntityList<T extends ListEntity> {
  items: Ref<T[]>;
  /** Replace the whole list (on load) and record each row as server-confirmed. */
  set: (next: T[]) => void;
  add: () => void;
  remove: (index: number) => void;
  /** Move the item at `from` to `to`. The operation; arrows and drag both call it. */
  moveTo: (from: number, to: number) => void;
}

export interface EntityListOptions<T extends ListEntity> {
  /** API path segment, also the reason string in the content archive. */
  kind: string;
  /** Singular name for the undo label, e.g. "hobby". */
  noun: string;
  /** A blank entity, for `add`. */
  blank: (index: number) => T;
  /** Strip client-only fields before the wire (the composable's `strip`). */
  strip: (item: T) => unknown;
  /** Run a write with the CMS's error/toast handling. */
  guarded: (fn: () => Promise<void>, ok?: string) => Promise<void>;
  autosave: Autosave;
}

/** A row with nothing typed yet. Autosaving it would put an empty row on the live site. */
function hasText(node: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  return Object.entries(node as Record<string, unknown>).some(([k, v]) => {
    if (k === "en" || k === "href") return typeof v === "string" && v.trim() !== "";
    return hasText(v);
  });
}

export function useEntityList<T extends ListEntity>(opts: EntityListOptions<T>): EntityList<T> {
  const items = ref<T[]>([]) as Ref<T[]>;
  const pathOf = (item: T) => `${opts.kind}/${item.id}`;
  let gesture = 0;

  // A reorder's renumbered rows share one group, so undo takes them back together.
  watch(
    items,
    () => {
      const group = `${opts.kind}:${++gesture}`;
      for (const item of items.value) {
        const path = pathOf(item);
        const wire = opts.strip(item);
        if (!opts.autosave.known(path) && !hasText(wire)) continue;
        opts.autosave.edit(path, wire, { path, label: `Edit ${opts.noun}`, group });
      }
    },
    { deep: true },
  );

  return {
    items,

    set(next) {
      // Rows with an unsaved or failed edit keep their local value, including rows the server doesn't have yet.
      const local = items.value.filter((it) => opts.autosave.isDirty(pathOf(it)));
      const merged = next.map((it) => local.find((l) => l.id === it.id) ?? it);
      for (const l of local) if (!merged.some((it) => it.id === l.id)) merged.push(l);
      items.value = merged;
      for (const item of next) opts.autosave.baseline(pathOf(item), pathOf(item), opts.strip(item));
    },

    /** Add a blank row locally. It is saved once it has content: an entity is only
     *  real then, and PUTting an empty one would publish an empty row at the click. */
    add() {
      items.value.push(opts.blank(items.value.length));
    },

    remove(index) {
      const item = items.value[index];
      if (!item) return;
      // The row leaves the reactive list before any await so the deep watcher can't
      // re-create it while the delete is in flight.
      items.value.splice(index, 1);
      void opts.guarded(async () => {
        try {
          if (opts.autosave.known(pathOf(item))) {
            await opts.autosave.flush();
            await cms.del(pathOf(item));
          }
        } catch (e) {
          if (!items.value.some((it) => it.id === item.id)) items.value.splice(Math.min(index, items.value.length), 0, item);
          throw e;
        }
        opts.autosave.forget(pathOf(item));
        // Everything after the hole shifts up. Its new `sort` is written directly
        // so it isn't recorded as an undoable edit of its own.
        const shifted = items.value.slice(index).map((it, i) => ({ ...it, sort: index + i }));
        for (const it of shifted) {
          const wire = opts.strip(it);
          await cms.put(pathOf(it), wire);
          opts.autosave.baseline(pathOf(it), pathOf(it), wire);
        }
        items.value.forEach((it, i) => (it.sort = i));
      }, "Deleted");
    },

    moveTo(from, to) {
      const list = items.value;
      if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return;
      const [moved] = list.splice(from, 1);
      if (!moved) return;
      list.splice(to, 0, moved);
      list.forEach((it, i) => (it.sort = i));
    },
  };
}
