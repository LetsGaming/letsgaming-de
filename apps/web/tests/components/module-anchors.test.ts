import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import type { SiteView } from "@lg/core";
import SitePanels from "../../src/components/SitePanels.vue";

/**
 * Every module is exactly one element, and it carries its own id.
 *
 * Two things depend on this and neither said so:
 *
 * - **Deep links.** `SitePanels` scrolls with `getElementById(moduleId)`, and the
 *   resolver now answers `#contact` with `/about#contact`. Only contact ever
 *   worked, because `ContactSection` had `id="contact"` typed by hand — a second
 *   spelling of the module id that happened to match.
 * - **The editor canvas.** It outlines each module by finding its element. The
 *   first version counted `.panel`'s children instead, which assumed one root per
 *   section. Thirteen obliged; `HeroSection` was a fragment of five, so from the
 *   hero down every handle sat on the wrong section.
 *
 * A section that renders a fragment, or forgets `:id="module.id"`, breaks both —
 * silently, in the browser, at the bottom of the page. So: here.
 */

const view = (): SiteView => ({
  locale: "en",
  meta: { name: "D", handle: "LetsGaming", location: "DE", role: "dev" },
  nav: [{ id: "home", label: "Home", modules: ["hero", "now", "guestbook"] }],
  modules: {
    hero: {
      id: "hero",
      kind: "hero",
      data: {
        eyebrow: "dev",
        headline: { before: "a", highlight: "b", after: "c" },
        lede: "l",
        status: { verb: "building", now: "x" },
        links: [{ id: "gh", label: "GitHub", href: "https://github.com/x", primary: false }],
      },
    },
    now: { id: "now", kind: "now", data: { heading: "Right now", items: [] } },
    guestbook: {
      id: "guestbook",
      kind: "guestbook",
      data: { heading: "Guestbook", entries: [] },
    },
  },
});

describe("every module is one element carrying its id", () => {
  it("renders an element per module, addressable by module id", () => {
    const w = mount(SitePanels, { props: { site: view(), area: "home" } });
    for (const id of ["hero", "now", "guestbook"]) {
      expect(w.find(`#${id}`).exists(), `no element with id="${id}"`).toBe(true);
    }
  });

  it("the panel has exactly one child per module — no fragments", () => {
    // This is the canvas's whole assumption. It used to be false and nothing said.
    const w = mount(SitePanels, { props: { site: view(), area: "home" } });
    const panel = w.find(".panel");
    expect(panel.element.children.length).toBe(3);
  });

  it("each child is the module the nav places, in order", () => {
    const w = mount(SitePanels, { props: { site: view(), area: "home" } });
    const ids = [...w.find(".panel").element.children].map((el) => el.id);
    expect(ids).toEqual(["hero", "now", "guestbook"]);
  });

  it("the hero is not a fragment", () => {
    // It was: avatar, h1, lede, status and links as siblings of `.panel`, which is
    // five children for one module and is why the wrong item got dragged.
    const w = mount(SitePanels, { props: { site: view(), area: "home" } });
    const hero = w.find("#hero");
    expect(hero.exists()).toBe(true);
    expect(hero.element.parentElement?.classList.contains("panel")).toBe(true);
  });
});
