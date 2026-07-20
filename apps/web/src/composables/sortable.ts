/**
 * Drag-to-reorder, as a directive.
 *
 * SortableJS does the pointer work (grab, autoscroll, touch, the drop indicator);
 * this is the seam between it and Vue. A directive rather than a wrapper
 * component, because the lists that need it already exist and are already
 * rendered by `v-for` — a component would mean restructuring the markup around
 * the library, and the markup is the part that's right.
 *
 * `sortablejs` (MIT, no dependencies of its own) rather than a hand-rolled
 * pointer implementation: the overlay's light-dependency rule is about not buying
 * a framework to solve a problem you don't have, and this is the other case —
 * drag is a genuinely hard problem (touch, autoscroll, nested scroll containers,
 * a11y-safe hit testing) with a small, stable, well-worn answer. It also loads
 * only on /admin, so the public site pays nothing for it.
 */

import Sortable from "sortablejs";
import type { Directive } from "vue";

export interface SortableMove {
  /** `id` of the list the item came from. */
  from: string;
  /** `id` of the list it was dropped into (the same one, for a reorder). */
  to: string;
  oldIndex: number;
  newIndex: number;
}

export interface SortableBinding {
  /** Lists sharing a group name can exchange items. */
  group: string;
  /** This list's id, reported back in the move. */
  id: string;
  /** Called with the move. Update state here; the DOM is already back as it was. */
  onMove: (move: SortableMove) => void;
  /** Selector for the drag handle. Omit and the whole row is draggable — wrong
   *  wherever a row contains an input, since selecting text would start a drag. */
  handle?: string;
  /** Selector for the draggable children, so non-items (an empty-state line) can't
   *  be picked up or counted in an index. */
  draggable?: string;
}

/** Reduced motion is an a11y floor, not a preference to weigh: the drop animation
 *  is decoration, so it goes to zero rather than being made subtler. */
const animationMs = (): number =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ? 0
    : 150;

interface Attached {
  sortable: Sortable;
  binding: SortableBinding;
}
const instances = new WeakMap<HTMLElement, Attached>();

/**
 * Index of `el` among its siblings that match `selector` (or all element
 * siblings if none is given).
 *
 * We compute this ourselves because SortableJS's own `oldIndex`/`newIndex` call
 * its internal `index()` *without* the `draggable` selector — so they count every
 * element sibling, including a list header (`.railhead`) or an empty-state row.
 * Wherever a sortable list isn't purely draggable rows, that's an off-by-one:
 * dragging the first module reports index 1, and the caller splices out the
 * second. Counting only `draggable` matches makes the index line up with the
 * backing array regardless of what else is in the list.
 */
export function indexAmong(el: Element, selector?: string): number {
  let i = 0;
  for (let sib = el.previousElementSibling; sib; sib = sib.previousElementSibling) {
    if (!selector || sib.matches(selector)) i++;
  }
  return i;
}

export const vSortable: Directive<HTMLElement, SortableBinding> = {
  mounted(el, { value }) {
    /**
     * Where the dragged row sat before the drag, so it can be put back.
     *
     * Sortable moves real DOM nodes; Vue believes it owns them. If the node is
     * left where Sortable put it and state is then updated, Vue patches from a
     * vdom describing the *old* order onto a DOM already in the *new* one, and
     * applies the move twice. So: restore the DOM, then change state, and let the
     * re-render be the only thing that moves anything.
     */
    let origin: Element | null = null;
    // The source index among draggable rows, captured at drag start (before
    // Sortable moves anything), so it's counted the same way as the target index.
    let startIndex = 0;

    const sortable = Sortable.create(el, {
      group: value.group,
      animation: animationMs(),
      ...(value.handle ? { handle: value.handle } : {}),
      ...(value.draggable ? { draggable: value.draggable } : {}),
      ghostClass: "sort-ghost",
      chosenClass: "sort-chosen",
      dragClass: "sort-drag",
      // Sortable's own fallback for touch/older browsers; harmless elsewhere.
      forceFallback: false,
      onStart(evt) {
        origin = evt.item.nextElementSibling;
        startIndex = indexAmong(evt.item, instances.get(el)?.binding.draggable);
        document.body.classList.add("is-dragging");
      },
      onEnd(evt) {
        document.body.classList.remove("is-dragging");
        const { from, to, item } = evt;

        // Compute the drop index while the item is still where Sortable put it —
        // among draggable rows, so a list header can't offset it.
        const draggable = instances.get(el)?.binding.draggable;
        const newIndex = indexAmong(item, draggable);
        const oldIndex = startIndex;

        // Undo Sortable's DOM edit before touching state (see `origin` above).
        from.insertBefore(item, origin);
        origin = null;

        const fromId = from.dataset.sortId;
        const toId = to.dataset.sortId;
        if (fromId === undefined || toId === undefined) return;
        if (fromId === toId && oldIndex === newIndex) return; // picked up, put back

        // `binding` is re-read from the map, not captured: a `v-for` over areas
        // reuses elements, so the id this list reports must be the current one.
        instances.get(el)?.binding.onMove({ from: fromId, to: toId, oldIndex, newIndex });
      },
    });

    el.dataset.sortId = value.id;
    instances.set(el, { sortable, binding: value });
  },

  updated(el, { value }) {
    el.dataset.sortId = value.id;
    const attached = instances.get(el);
    if (attached) attached.binding = value;
  },

  unmounted(el) {
    instances.get(el)?.sortable.destroy();
    instances.delete(el);
  },
};
