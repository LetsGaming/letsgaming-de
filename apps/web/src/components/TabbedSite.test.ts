import type { SiteView } from "@lg/core";
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import TabbedSite from "./TabbedSite.vue";

/** A minimal but structurally-real SiteView (two areas, a hero, a bio). */
const site = {
  meta: { name: "Domenic", handle: "LetsGaming", role: "web dev", location: "DE" },
  locale: "en",
  nav: [
    { id: "home", label: "Home", modules: ["hero"] },
    { id: "work", label: "Work", modules: ["highlights", "coding"] },
    { id: "life", label: "Life", modules: ["guestbook"] },
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
    highlights: {
      id: "highlights",
      kind: "highlights",
      data: {
        heading: "Recently shipped",
        note: "releases, merged PRs & gists",
        sources: ["GitHub"],
        items: [
          {
            type: "release",
            text: "Released plantcare-tracker v1.2.0",
            meta: "v1.2.0",
            href: "https://github.com/x/releases/tag/v1.2.0",
            at: "2026-01-05T00:00:00Z",
            relative: "3d",
          },
        ],
      },
    },
    bio: {
      id: "bio",
      kind: "bio",
      data: { heading: "About", paragraphs: ["I like building things."] },
    },
    guestbook: {
      id: "guestbook",
      kind: "guestbook",
      data: {
        heading: "Guestbook",
        note: "leave a note",
        entries: [
          { id: 1, name: "Casey", message: "Great little site!", at: "2026-01-05T00:00:00Z", relative: "3d" },
        ],
      },
    },
    coding: {
      id: "coding",
      kind: "coding",
      data: {
        heading: "What I actually work in",
        note: "last 7 days",
        coding: { range: "last 7 days", totalHours: 28.2, languages: [{ name: "TypeScript", pct: 46, hours: 13 }] },
      },
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

  it("renders the highlights feed (releases/PRs/gists) as external links", async () => {
    const wrapper = mount(TabbedSite, { props: { site } });
    const workBtn = wrapper.findAll("nav button").find((b) => b.text().includes("Work"));
    expect(workBtn).toBeTruthy();
    await workBtn!.trigger("click");
    expect(wrapper.text()).toContain("Released plantcare-tracker v1.2.0");
    const link = wrapper.findAll("a").find((a) => a.text().includes("Released"));
    expect(link?.attributes("href")).toBe("https://github.com/x/releases/tag/v1.2.0");
    expect(link?.attributes("rel")).toContain("noopener");
    // The Wakapi coding module renders in the same area.
    expect(wrapper.text()).toContain("What I actually work in");
    expect(wrapper.text()).toContain("TypeScript");
  });

  it("renders approved guestbook entries and the signing form", async () => {
    const wrapper = mount(TabbedSite, { props: { site } });
    const lifeBtn = wrapper.findAll("nav button").find((b) => b.text().includes("Life"));
    expect(lifeBtn).toBeTruthy();
    await lifeBtn!.trigger("click");
    expect(wrapper.text()).toContain("Great little site!"); // approved entry
    expect(wrapper.text()).toContain("Casey");
    // The submit form is present.
    expect(wrapper.find("form.gform").exists()).toBe(true);
  });
});
