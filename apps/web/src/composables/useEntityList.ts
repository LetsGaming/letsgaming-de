import { ref, type Ref } from "vue";
import { cms } from "../lib/cms";

/**
 * A CMS-owned list, with its CRUD.
 *
 * The server already had this. `registerCrud<T extends { id: string }>({ path,
 * schema, upsert, remove })` — one helper, and every list entity is four lines.
 * The client, for the same three entities, hand-wrote three panels and forty-odd
 * bindings inside a 1,263-line composable, and its generic halves (`move`,
 * `delItem`) took `any[]`. So the abstraction existed on one side of the boundary
 * and the other side paid for it twice: once in volume, once in types.
 *
 * Two things this fixes beyond the duplication:
 *
 * **It's typed.** `move(arr: any[], …)` meant `arr[i].sort = i` and
 * `cms.put(\`${kind}/${arr[i].id}\`)` were unchecked — a list with no `sort`, or a
 * typo'd kind, compiled fine and failed at runtime against a live API.
 *
 * **It's shaped like the operation, not the button.** `move(arr, i, dir)` is a
 * ±1 button's signature: it swaps neighbours and PUTs both. Drag can't use it,
 * which is exactly how `moveModule` and `moveGallery` ended up with the same
 * problem and had to be rewritten. `moveTo(from, to)` is what actually happens;
 * ↑/↓ is a caller that passes `i, i±1`.
 */

/** The shape every CMS list entity shares — the client's half of the contract
 *  the server states as `T extends { id: string }`. */
export interface ListEntity {
  id: string;
  sort?: number;
}

export interface EntityList<T extends ListEntity> {
  items: Ref<T[]>;
  /** Replace the whole list (on load). */
  set: (next: T[]) => void;
  add: () => void;
  save: (item: T) => void;
  remove: (index: number) => void;
  /** Move the item at `from` to `to`. The operation; ↑/↓ and drag both call it. */
  moveTo: (from: number, to: number) => void;
}

export interface EntityListOptions<T extends ListEntity> {
  /** API path segment — also the reason string in the content archive. */
  kind: string;
  /** A blank entity, for `add`. */
  blank: (index: number) => T;
  /** Strip client-only fields before the wire (the composable's `strip`). */
  strip: (item: T) => unknown;
  /** Run a write with the CMS's error/toast handling. */
  guarded: (fn: () => Promise<void>, ok?: string) => Promise<void>;
}

export function useEntityList<T extends ListEntity>(opts: EntityListOptions<T>): EntityList<T> {
  const items = ref<T[]>([]) as Ref<T[]>;
  const put = (item: T) => cms.put(`${opts.kind}/${item.id}`, opts.strip(item));

  /** Persist only what moved. A reorder used to PUT both swapped neighbours;
   *  moving item 0 to the end would PUT two rows and leave the other eight with
   *  stale `sort`, which `ORDER BY sort, id` then resolves by id — silently. */
  const persistFrom = (start: number) =>
    opts.guarded(async () => {
      for (let i = start; i < items.value.length; i++) {
        const item = items.value[i];
        if (!item) continue;
        item.sort = i;
        await put(item);
      }
    }, "Reordered");

  return {
    items,
    set: (next) => (items.value = next),

    /** Add a blank row locally. Not persisted until Save — an entity is only real
     *  once it has content, and PUTting an empty one would put an empty row on
     *  the live site the moment you clicked "+". */
    add() {
      items.value.push(opts.blank(items.value.length));
    },

    save: (item) => void opts.guarded(async () => void (await put(item))),

    remove(index) {
      void opts.guarded(async () => {
        const item = items.value[index];
        if (item?.id) await cms.del(`${opts.kind}/${item.id}`);
        items.value.splice(index, 1);
        // Everything after the hole shifted up; its stored `sort` is now wrong.
        for (let i = index; i < items.value.length; i++) {
          const it = items.value[i];
          if (!it) continue;
          it.sort = i;
          await put(it);
        }
      }, "Deleted");
    },

    moveTo(from, to) {
      const list = items.value;
      if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return;
      const [moved] = list.splice(from, 1);
      if (!moved) return;
      list.splice(to, 0, moved);
      void persistFrom(Math.min(from, to));
    },
  };
}
