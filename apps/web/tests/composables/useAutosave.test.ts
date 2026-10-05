import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAutosave, isTextEdit, TEXT_DELAY_MS, type SaveStatus } from "../../src/composables/useAutosave";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(put = vi.fn(async (_p: string, _b: unknown, _o: { keepalive: boolean }) => ({ ok: true }))) {
  const statuses: SaveStatus[] = [];
  const saved: unknown[] = [];
  const a = createAutosave({
    put,
    onStatus: (s) => statuses.push(s),
    onSaved: (e) => saved.push(e),
  });
  return { a, put, statuses, saved, last: () => statuses[statuses.length - 1] };
}

describe("debounce", () => {
  it("waits for a pause in typing, then sends only the last value", async () => {
    const { a, put } = setup();
    a.baseline("meta", "meta", { name: "" });
    a.edit("meta", { name: "D" });
    await vi.advanceTimersByTimeAsync(300);
    a.edit("meta", { name: "Do" });
    await vi.advanceTimersByTimeAsync(TEXT_DELAY_MS - 1);
    expect(put).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(put).toHaveBeenCalledTimes(1);
    expect(put.mock.calls[0]?.[1]).toEqual({ name: "Do" });
  });

  it("saves a structural change (a toggle) straight away", async () => {
    const { a, put } = setup();
    a.baseline("p", "presence", { show: ["game"] });
    a.edit("p", { show: ["game", "music"] });
    await vi.advanceTimersByTimeAsync(0);
    expect(put).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the value goes back to what the server has", async () => {
    const { a, put } = setup();
    a.baseline("meta", "meta", { name: "x" });
    a.edit("meta", { name: "xy" });
    a.edit("meta", { name: "x" });
    await vi.advanceTimersByTimeAsync(2000);
    expect(put).not.toHaveBeenCalled();
  });
});

describe("one request in flight per key", () => {
  it("coalesces edits made while a save is running into one follow-up", async () => {
    let release!: () => void;
    const put = vi.fn(
      () =>
        new Promise<{ ok: boolean }>((resolve) => {
          release = () => resolve({ ok: true });
        }),
    );
    const { a } = setup(put as never);
    a.baseline("k", "k", { t: "" });
    a.edit("k", { t: "a" }, { delay: 0 });
    await vi.advanceTimersByTimeAsync(0);
    expect(put).toHaveBeenCalledTimes(1);

    a.edit("k", { t: "ab" }, { delay: 0 });
    a.edit("k", { t: "abc" }, { delay: 0 });
    await vi.advanceTimersByTimeAsync(0);
    expect(put).toHaveBeenCalledTimes(1);

    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(put).toHaveBeenCalledTimes(2);
    expect(put.mock.calls[1]).toBeDefined();
    release();
    await vi.advanceTimersByTimeAsync(0);
  });

  it("lets different keys run side by side", async () => {
    const { a, put } = setup();
    a.baseline("a", "a", { v: 1 });
    a.baseline("b", "b", { v: 1 });
    a.edit("a", { v: 2 }, { delay: 0 });
    a.edit("b", { v: 2 }, { delay: 0 });
    await vi.advanceTimersByTimeAsync(0);
    expect(put).toHaveBeenCalledTimes(2);
  });
});

describe("flush", () => {
  it("sends everything pending now, with keepalive when asked", async () => {
    const { a, put } = setup();
    a.baseline("a", "a", { v: "" });
    a.edit("a", { v: "x" });
    await a.flush(true);
    expect(put).toHaveBeenCalledWith("a", { v: "x" }, { keepalive: true });
  });

  it("waits for a save already in flight", async () => {
    const { a, put, last } = setup();
    a.baseline("a", "a", { v: "" });
    a.edit("a", { v: "x" }, { delay: 0 });
    await vi.advanceTimersByTimeAsync(0);
    await a.flush();
    expect(put).toHaveBeenCalledTimes(1);
    expect(last()?.state).toBe("saved");
  });
});

describe("failures", () => {
  it("keeps the value dirty and shows the error, then retries", async () => {
    const put = vi
      .fn<(p: string, b: unknown, o: { keepalive: boolean }) => Promise<unknown>>()
      .mockRejectedValueOnce(new Error("Headline needs English text."))
      .mockResolvedValue({ ok: true });
    const { a, last, saved } = setup(put);
    a.baseline("h", "headline", { en: "ok" });
    a.edit("h", { en: "" }, { delay: 0 });
    await vi.advanceTimersByTimeAsync(0);

    expect(last()).toEqual({ state: "error", message: "Headline needs English text." });
    expect(a.hasUnsaved()).toBe(true);
    expect(saved).toHaveLength(0);

    await a.retry();
    expect(put).toHaveBeenCalledTimes(2);
    expect(last()?.state).toBe("saved");
    expect(a.hasUnsaved()).toBe(false);
  });

  it("never marks a rejected value as confirmed, so undo can't restore it", async () => {
    const put = vi.fn().mockRejectedValue(new Error("400"));
    const { a, saved } = setup(put as never);
    a.baseline("h", "headline", { en: "ok" });
    a.edit("h", { en: "" }, { delay: 0 });
    await vi.advanceTimersByTimeAsync(0);
    a.edit("h", { en: "ok" });
    await vi.advanceTimersByTimeAsync(2000);
    expect(saved).toHaveLength(0);
    expect(a.hasUnsaved()).toBe(false);
  });

  it("a newer edit after a failure goes out on its own", async () => {
    const put = vi
      .fn<(p: string, b: unknown, o: { keepalive: boolean }) => Promise<unknown>>()
      .mockRejectedValueOnce(new Error("400"))
      .mockResolvedValue({ ok: true });
    const { a, last } = setup(put);
    a.baseline("h", "headline", { en: "ok" });
    a.edit("h", { en: "" }, { delay: 0 });
    await vi.advanceTimersByTimeAsync(0);
    a.edit("h", { en: "fixed" }, { delay: 0 });
    await vi.advanceTimersByTimeAsync(0);
    expect(put.mock.calls[1]?.[1]).toEqual({ en: "fixed" });
    expect(last()?.state).toBe("saved");
  });
});

describe("undo support", () => {
  it("reports the last confirmed value as `before`", async () => {
    const { a, saved } = setup();
    a.baseline("k", "k", { v: "one" });
    a.edit("k", { v: "two" }, { delay: 0, label: "Edit thing" });
    await vi.advanceTimersByTimeAsync(0);
    a.edit("k", { v: "three" }, { delay: 0 });
    await vi.advanceTimersByTimeAsync(0);
    expect(saved).toMatchObject([
      { label: "Edit thing", before: { v: "one" }, after: { v: "two" } },
      { before: { v: "two" }, after: { v: "three" } },
    ]);
  });

  it("does not record the first save of a row the server never had", async () => {
    const { a, saved } = setup();
    a.edit("new", { v: "x" }, { path: "hobbies/new", delay: 0 });
    await vi.advanceTimersByTimeAsync(0);
    expect(saved).toHaveLength(0);
    expect(a.known("new")).toBe(true);
  });

  it("write() sends pending edits first and does not record itself", async () => {
    const { a, put, saved } = setup();
    a.baseline("k", "k", { v: 1 });
    a.edit("k", { v: 2 });
    await a.write("k", "k", { v: 1 });
    expect(put.mock.calls.map((c) => c[1])).toEqual([{ v: 2 }, { v: 1 }]);
    expect(saved).toHaveLength(1);
  });
});

describe("isTextEdit", () => {
  it("treats typing as text and toggles and reorders as structural", () => {
    expect(isTextEdit({ a: "x" }, { a: "xy" })).toBe(true);
    expect(isTextEdit({ n: 1 }, { n: 12 })).toBe(true);
    expect(isTextEdit({ on: false }, { on: true })).toBe(false);
    expect(isTextEdit(["a"], ["a", "b"])).toBe(false);
    expect(isTextEdit({ r: null }, { r: 30 })).toBe(false);
  });
});
