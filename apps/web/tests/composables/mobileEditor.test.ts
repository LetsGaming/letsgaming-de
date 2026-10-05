import { describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import { moduleRows } from "../../src/composables/editorHelpers";
import { MOBILE_QUERY, useIsMobile } from "../../src/composables/useIsMobile";

describe("moduleRows", () => {
  const mods = [
    { id: "a", heading: { en: "Alpha", de: "Alfa" } },
    { id: "b", heading: { en: "Beta" } },
    { id: "c", heading: { en: "Gamma" } },
  ];
  const rows = (locale: string, ids = ["a", "b", "c"]) => moduleRows(ids, mods, locale, (id) => id.toUpperCase());

  it("keeps order and flags the ends", () => {
    const r = rows("en");
    expect(r.map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(r[0]).toMatchObject({ canUp: false, canDown: true });
    expect(r[2]).toMatchObject({ canUp: true, canDown: false });
  });

  it("flags only modules lacking the content locale", () => {
    expect(rows("en").some((x) => x.missing)).toBe(false);
    expect(rows("de").map((x) => x.missing)).toEqual([false, true, true]);
  });

  it("a single module can move nowhere", () => {
    expect(rows("en", ["b"])[0]).toMatchObject({ canUp: false, canDown: false });
  });
});

describe("useIsMobile", () => {
  function mount(matches: boolean) {
    const listeners: (() => void)[] = [];
    const mq = {
      matches,
      addEventListener: (_: string, fn: () => void) => listeners.push(fn),
      removeEventListener: () => {},
    };
    let queried = "";
    (globalThis as { matchMedia?: unknown }).matchMedia = (q: string) => ((queried = q), mq);
    (window as { matchMedia?: unknown }).matchMedia = (globalThis as { matchMedia?: unknown }).matchMedia;
    let flag!: ReturnType<typeof useIsMobile>;
    const seen: boolean[] = [];
    const C = defineComponent({
      setup() {
        flag = useIsMobile();
        seen.push(flag.value);
        return () => h("div");
      },
    });
    const app = createApp(C);
    app.mount(document.createElement("div"));
    return { flag, seen, mq, listeners, queried: () => queried, app };
  }

  it("is false during setup and reflects the query once mounted", () => {
    const m = mount(true);
    expect(m.seen).toEqual([false]);
    expect(m.flag.value).toBe(true);
    expect(m.queried()).toBe(MOBILE_QUERY);
    m.app.unmount();
  });

  it("follows later changes", async () => {
    const m = mount(false);
    expect(m.flag.value).toBe(false);
    m.mq.matches = true;
    m.listeners.forEach((fn) => fn());
    await nextTick();
    expect(m.flag.value).toBe(true);
    m.app.unmount();
  });
});
