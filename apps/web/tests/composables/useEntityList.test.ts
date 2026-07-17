import { flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { cms } from "../../src/lib/cms";
import { useEntityList } from "../../src/composables/useEntityList";

interface Row {
  id: string;
  label: string;
  sort?: number;
}

function list() {
  return useEntityList<Row>({
    kind: "hobbies",
    strip: (x) => x,
    guarded: async (fn) => void (await fn()),
    blank: (i) => ({ id: `new-${i}`, label: "", sort: i }),
  });
}

let put: MockInstance<(path: string, body: unknown) => Promise<unknown>>;
let del: MockInstance<(path: string) => Promise<unknown>>;
beforeEach(() => {
  put = vi.spyOn(cms, "put").mockResolvedValue({ ok: true });
  del = vi.spyOn(cms, "del").mockResolvedValue({ ok: true });
});

describe("the client's half of registerCrud", () => {
  it("moves an item, rather than swapping neighbours", async () => {
    const l = list();
    l.set([
      { id: "a", label: "a", sort: 0 },
      { id: "b", label: "b", sort: 1 },
      { id: "c", label: "c", sort: 2 },
      { id: "d", label: "d", sort: 3 },
    ]);

    // Last to first, in one go. The old `move(arr, i, dir)` could only swap
    // neighbours, so drag could never use it — the bug that had to be fixed
    // twice already, in moveModule and moveGallery.
    l.moveTo(3, 0);
    expect(l.items.value.map((r) => r.id)).toEqual(["d", "a", "b", "c"]);
  });

  it("renumbers everything the move disturbed, not just the two rows it swapped", async () => {
    const l = list();
    l.set([
      { id: "a", label: "a", sort: 0 },
      { id: "b", label: "b", sort: 1 },
      { id: "c", label: "c", sort: 2 },
      { id: "d", label: "d", sort: 3 },
    ]);

    l.moveTo(3, 0);
    await flushPromises();

    // Four positions changed, so four rows are persisted. The old version PUT
    // exactly two and left the rest with stale `sort` — which `ORDER BY sort, id`
    // then quietly settles by id.
    expect(put).toHaveBeenCalledTimes(4);
    expect(l.items.value.map((r) => r.sort)).toEqual([0, 1, 2, 3]);
    expect(put.mock.calls.map((c) => c[0])).toEqual([
      "hobbies/d",
      "hobbies/a",
      "hobbies/b",
      "hobbies/c",
    ]);
  });

  it("only touches rows from the move point on", async () => {
    const l = list();
    l.set([
      { id: "a", label: "a", sort: 0 },
      { id: "b", label: "b", sort: 1 },
      { id: "c", label: "c", sort: 2 },
      { id: "d", label: "d", sort: 3 },
    ]);

    l.moveTo(2, 3); // only c and d shift
    await flushPromises();
    expect(put).toHaveBeenCalledTimes(2);
  });

  it("closes the gap after a delete, so sort can't drift from the list", async () => {
    const l = list();
    l.set([
      { id: "a", label: "a", sort: 0 },
      { id: "b", label: "b", sort: 1 },
      { id: "c", label: "c", sort: 2 },
    ]);

    l.remove(0);
    await flushPromises();

    expect(del).toHaveBeenCalledWith("hobbies/a");
    expect(l.items.value.map((r) => r.id)).toEqual(["b", "c"]);
    expect(l.items.value.map((r) => r.sort)).toEqual([0, 1]);
  });

  it("adds locally — an empty row shouldn't reach the live site on '+'", async () => {
    const l = list();
    l.set([]);
    l.add();
    await flushPromises();
    expect(l.items.value).toHaveLength(1);
    expect(put).not.toHaveBeenCalled();

    l.save(l.items.value[0]!);
    await flushPromises();
    expect(put).toHaveBeenCalledTimes(1);
  });

  it("refuses a move that isn't one", () => {
    const l = list();
    l.set([{ id: "a", label: "a", sort: 0 }]);
    l.moveTo(0, 0);
    l.moveTo(0, 5);
    l.moveTo(-1, 0);
    expect(put).not.toHaveBeenCalled();
  });
});
