import { computed, shallowRef } from "vue";
import type { SavedEdit } from "./useAutosave";

/**
 * Session undo/redo over saves that already happened. Edits are live, so undo is
 * itself a save: it PUTs the previously confirmed value back. The stacks live in
 * memory only and vanish with the page.
 */

export const UNDO_CAP = 100;

export interface UndoOp {
  key: string;
  path: string;
  before: unknown;
  after: unknown;
}

export interface UndoEntry {
  label: string;
  group?: string;
  ops: UndoOp[];
}

export interface UndoDeps {
  /** Write one op's value back (`before` for undo, `after` for redo). */
  write: (op: UndoOp, value: unknown) => Promise<void>;
  /** Runs after an undo/redo landed, to reload the editor state from the server. */
  onApplied?: () => Promise<void> | void;
  onError?: (e: unknown) => void;
}

export function createUndo(deps: UndoDeps, onChange: () => void = () => {}) {
  let undoStack: UndoEntry[] = [];
  let redoStack: UndoEntry[] = [];
  let busy = false;

  const op = (e: SavedEdit): UndoOp => ({ key: e.key, path: e.path, before: e.before, after: e.after });

  async function apply(from: UndoEntry[], to: UndoEntry[], dir: "before" | "after") {
    const entry = from.pop();
    if (!entry || busy) {
      if (entry) from.push(entry);
      return;
    }
    busy = true;
    try {
      const ops = dir === "before" ? [...entry.ops].reverse() : entry.ops;
      for (const o of ops) await deps.write(o, o[dir]);
      to.push(entry);
      if (to.length > UNDO_CAP) to.shift();
      await deps.onApplied?.();
    } catch (e) {
      from.push(entry);
      deps.onError?.(e);
    } finally {
      busy = false;
      onChange();
    }
  }

  return {
    record(edit: SavedEdit) {
      const top = undoStack[undoStack.length - 1];
      if (edit.group && top?.group === edit.group) top.ops.push(op(edit));
      else {
        undoStack.push({ label: edit.label, group: edit.group, ops: [op(edit)] });
        if (undoStack.length > UNDO_CAP) undoStack.shift();
      }
      redoStack = [];
      onChange();
    },
    undo: () => apply(undoStack, redoStack, "before"),
    redo: () => apply(redoStack, undoStack, "after"),
    undoLabel: () => undoStack[undoStack.length - 1]?.label,
    redoLabel: () => redoStack[redoStack.length - 1]?.label,
    depth: () => ({ undo: undoStack.length, redo: redoStack.length }),
  };
}

/** Vue wrapper: reactive labels for the top-bar buttons. */
export function useUndo(deps: UndoDeps) {
  const tick = shallowRef(0);
  /** Bumps after every undo/redo lands, for panels that hold their own copy of a value. */
  const applied = shallowRef(0);
  const core = createUndo(
    {
      ...deps,
      onApplied: async () => {
        await deps.onApplied?.();
        applied.value++;
      },
    },
    () => tick.value++,
  );
  const undoLabel = computed(() => (tick.value, core.undoLabel()));
  const redoLabel = computed(() => (tick.value, core.redoLabel()));
  return { ...core, undoLabel, redoLabel, applied };
}
