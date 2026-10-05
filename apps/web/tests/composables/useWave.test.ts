import { flushPromises } from "@vue/test-utils";
import { STORAGE_KEY } from "@lg/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../src/lib/reactions-api";
import { useWave } from "../../src/composables/useWave";

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => vi.restoreAllMocks());

describe("useWave", () => {
  it("counts optimistically, then takes the server's total and remembers the wave", async () => {
    let resolve!: (n: number | null) => void;
    vi.spyOn(api, "postWave").mockReturnValue(new Promise((r) => (resolve = r)));
    const w = useWave(4);

    const pending = w.wave();
    expect(w.count.value).toBe(5);
    expect(w.waved.value).toBe(true);

    resolve(9);
    await pending;
    await flushPromises();
    expect(w.count.value).toBe(9);
    expect(localStorage.getItem(STORAGE_KEY.waved)).toBe("1");
  });

  it("rolls back when the server refuses (rate limit or network)", async () => {
    vi.spyOn(api, "postWave").mockResolvedValue(null);
    const w = useWave(4);
    await w.wave();
    expect(w.count.value).toBe(4);
    expect(w.waved.value).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY.waved)).toBeNull();
  });

  it("does not post twice once waved", async () => {
    const post = vi.spyOn(api, "postWave").mockResolvedValue(1);
    const w = useWave(0);
    await w.wave();
    await w.wave();
    expect(post).toHaveBeenCalledTimes(1);
  });
});
