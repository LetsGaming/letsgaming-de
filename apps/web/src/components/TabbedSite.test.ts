import type { SiteView } from "@lg/core";
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import TabbedSite from "./TabbedSite.vue";

/** A minimal but structurally-real SiteView (two areas, a hero, a bio). */
const site = {
  meta: { name: "Domenic", handle: "LetsGaming", role: "web dev", location: "DE" },
  nav: [
    { id: "home", label: "Home", modules: ["hero"] },
    { id: "about", label: "About", modules: ["bio"] },
  ],
  modules: {
    hero: {
      id: "hero",
      kind: "hero",
      data: {
        eyebrow: "web dev",
        headline: { before: "Hi, I build ", highlight: "things", after: " on the web" },
        lede: "A small **tactile** site.",
        status: { verb: "open to", now: "work" },
        links: [{ id: "gh", label: "GitHub", href: "https://github.com/x", icon: "gh" }],
      },
    },
    bio: {
      id: "bio",
      kind: "bio",
      data: { heading: "About", paragraphs: ["I like building things."] },
    },
  },
} as unknown as SiteView;

describe("TabbedSite (public island) smoke", () => {
  it("mounts and renders the first section's content without throwing", () => {
    const wrapper = mount(TabbedSite, { props: { site } });
    // Nav is present for both areas…
    expect(wrapper.text()).toContain("Home");
    expect(wrapper.text()).toContain("About");
    // …and the initial (home) section's content is actually rendered — this is
    // the exact "content invisible after hydration" class of bug we want to catch.
    expect(wrapper.text()).toContain("Hi, I build");
    expect(wrapper.text()).toContain("things");
  });

  it("switches to another section on nav click", async () => {
    const wrapper = mount(TabbedSite, { props: { site } });
    const aboutBtn = wrapper.findAll("nav button").find((b) => b.text().includes("About"));
    expect(aboutBtn).toBeTruthy();
    await aboutBtn!.trigger("click");
    expect(wrapper.text()).toContain("I like building things.");
  });
});
