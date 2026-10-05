import { describe, expect, it, vi } from "vitest";
import { createUndo, UNDO_CAP } from "../../src/composables/useUndo";
import type { SavedEdit } from "../../src/composables/useAutosave";

const edit = (n: number, extra: Partial<SavedEdit> = {}): SavedEdit => ({
  key: "k",
  label: `Edit ${n}`,
  path: "k",
  before: n - 1,
  after: n,
  ...extra,
});

function setup() {
  const writes: unknown[] = [];
  const write = vi.fn(async (_op: unknown, value: unknown) => void writes.push(value));
  const u = createUndo({ write: write as never });
  return { u, writes, write };
}

describe("undo and redo", () => {
  it("writes the previous value back, then the new one again on redo", async () => {
    const { u, writes } = setup();
    u.record(edit(2));
    expect(u.undoLabel()).toBe("Edit 2");

    await u.undo();
    expect(writes).toEqual([1]);
    expect(u.undoLabel()).toBeUndefined();
    expect(u.redoLabel()).toBe("Edit 2");

    await u.redo();
    expect(writes).toEqual([1, 2]);
    expect(u.undoLabel()).toBe("Edit 2");
  });

  it("walks back through several steps in order", async () => {
    const { u, writes } = setup();
    u.record(edit(1));
    u.record(edit(2));
    u.record(edit(3));
    await u.undo();
    await u.undo();
    expect(writes).toEqual([2, 1]);
  });

  it("a new edit clears what could be redone", async () => {
    const { u } = setup();
    u.record(edit(1));
    await u.undo();
    expect(u.redoLabel()).toBe("Edit 1");
    u.record(edit(5));
    expect(u.redoLabel()).toBeUndefined();
  });

  it("caps the stack, dropping the oldest", () => {
    const { u } = setup();
    for (let i = 0; i < UNDO_CAP + 20; i++) u.record(edit(i));
    expect(u.depth().undo).toBe(UNDO_CAP);
  });

  it("takes a grouped gesture (a reorder) back in one step, last write first", async () => {
    const { u, write } = setup();
    u.record(edit(1, { key: "a", path: "a", group: "g" }));
    u.record(edit(2, { key: "b", path: "b", group: "g" }));
    expect(u.depth().undo).toBe(1);
    await u.undo();
    expect(write.mock.calls.map((c) => (c[0] as { key: string }).key)).toEqual(["b", "a"]);
  });

  it("leaves the entry on the stack when the write fails", async () => {
    const onError = vi.fn();
    const u = createUndo({ write: vi.fn().mockRejectedValue(new Error("nope")), onError });
    u.record(edit(2));
    await u.undo();
    expect(onError).toHaveBeenCalled();
    expect(u.undoLabel()).toBe("Edit 2");
    expect(u.redoLabel()).toBeUndefined();
  });

  it("reloads the editor after a successful undo", async () => {
    const onApplied = vi.fn();
    const u = createUndo({ write: vi.fn().mockResolvedValue(undefined), onApplied });
    u.record(edit(2));
    await u.undo();
    expect(onApplied).toHaveBeenCalledTimes(1);
  });
});
