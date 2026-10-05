import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { cms } from "../../src/lib/cms";
import { createAutosave } from "../../src/composables/useAutosave";
import { useEntityList } from "../../src/composables/useEntityList";

interface Row {
  id: string;
  title: { en: string };
  sort?: number;
}

const row = (id: string, sort: number): Row => ({ id, title: { en: id }, sort });

let put: ReturnType<typeof vi.fn>;
let del: MockInstance<(path: string) => Promise<unknown>>;
let onSaved: ReturnType<typeof vi.fn>;

function list() {
  put = vi.fn(async () => ({ ok: true }));
  onSaved = vi.fn();
  const autosave = createAutosave({ put, onStatus: () => {}, onSaved });
  const l = useEntityList<Row>({
    kind: "hobbies",
    noun: "hobby",
    strip: (x) => x,
    guarded: async (fn) => void (await fn()),
    autosave,
    blank: (i) => ({ id: `new-${i}`, title: { en: "" }, sort: i }),
  });
  return { l, autosave };
}

beforeEach(() => {
  vi.useFakeTimers();
  del = vi.spyOn(cms, "del").mockResolvedValue({ ok: true });
});
afterEach(() => vi.useRealTimers());

const settle = async () => {
  await nextTick();
  await vi.advanceTimersByTimeAsync(700);
};

describe("the client's half of registerCrud", () => {
  it("moves an item, rather than swapping neighbours", () => {
    const { l } = list();
    l.set([row("a", 0), row("b", 1), row("c", 2), row("d", 3)]);
    l.moveTo(3, 0);
    expect(l.items.value.map((r) => r.id)).toEqual(["d", "a", "b", "c"]);
  });

  it("persists every row the move renumbered, as one undoable group", async () => {
    const { l } = list();
    l.set([row("a", 0), row("b", 1), row("c", 2), row("d", 3)]);

    l.moveTo(3, 0);
    await settle();

    expect(put.mock.calls.map((c) => c[0]).sort()).toEqual([
      "hobbies/a",
      "hobbies/b",
      "hobbies/c",
      "hobbies/d",
    ]);
    expect(l.items.value.map((r) => r.sort)).toEqual([0, 1, 2, 3]);
    const groups = new Set(onSaved.mock.calls.map((c) => c[0].group));
    expect(groups.size).toBe(1);
  });

  it("only touches rows whose position changed", async () => {
    const { l } = list();
    l.set([row("a", 0), row("b", 1), row("c", 2), row("d", 3)]);
    l.moveTo(2, 3);
    await settle();
    expect(put).toHaveBeenCalledTimes(2);
  });

  it("autosaves an edit to a saved row after a pause", async () => {
    const { l } = list();
    l.set([row("a", 0)]);
    l.items.value[0]!.title.en = "renamed";
    await nextTick();
    expect(put).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(700);
    expect(put).toHaveBeenCalledWith("hobbies/a", expect.objectContaining({ title: { en: "renamed" } }), expect.anything());
  });

  it("closes the gap after a delete, so sort can't drift from the list", async () => {
    const { l } = list();
    vi.spyOn(cms, "put").mockResolvedValue({ ok: true });
    l.set([row("a", 0), row("b", 1), row("c", 2)]);

    l.remove(0);
    await vi.advanceTimersByTimeAsync(0);
    await nextTick();

    expect(del).toHaveBeenCalledWith("hobbies/a");
    expect(l.items.value.map((r) => r.id)).toEqual(["b", "c"]);
    expect(l.items.value.map((r) => r.sort)).toEqual([0, 1]);
    // The renumbering is written directly, so it isn't an undoable edit.
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("does not re-create a deleted row when the list changes while the delete is in flight", async () => {
    const { l } = list();
    l.set([row("a", 0), row("b", 1)]);
    let release!: () => void;
    del.mockImplementation(() => new Promise((r) => (release = () => r({ ok: true }))));
    vi.spyOn(cms, "put").mockResolvedValue({ ok: true });

    l.remove(0);
    await nextTick();
    l.items.value[0]!.title.en = "edited meanwhile";
    await settle();
    release();
    await settle();

    expect(put.mock.calls.map((c) => c[0])).not.toContain("hobbies/a");
    expect(l.items.value.map((r) => r.id)).toEqual(["b"]);
  });

  it("puts the row back when the delete fails", async () => {
    const autosave = createAutosave({ put: vi.fn(async () => ({ ok: true })), onStatus: () => {} });
    const l = useEntityList<Row>({
      kind: "hobbies",
      noun: "hobby",
      strip: (x) => x,
      guarded: async (fn) => {
        try {
          await fn();
        } catch {
          /* surfaced as a toast in the app */
        }
      },
      autosave,
      blank: (i) => ({ id: `new-${i}`, title: { en: "" }, sort: i }),
    });
    l.set([row("a", 0), row("b", 1)]);
    del.mockRejectedValue(new Error("boom"));

    l.remove(0);
    await settle();

    expect(l.items.value.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("adds locally and saves once the row has content", async () => {
    const { l } = list();
    l.set([]);
    l.add();
    await settle();
    expect(l.items.value).toHaveLength(1);
    expect(put).not.toHaveBeenCalled();

    l.items.value[0]!.title.en = "Chess";
    await settle();
    expect(put).toHaveBeenCalledTimes(1);
  });

  it("refuses a move that isn't one", async () => {
    const { l } = list();
    l.set([row("a", 0)]);
    l.moveTo(0, 0);
    l.moveTo(0, 5);
    l.moveTo(-1, 0);
    await settle();
    expect(put).not.toHaveBeenCalled();
  });
});
