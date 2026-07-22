import type { SiteView } from "@lg/core";
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import { useTheme } from "../../src/composables/useSiteState";
import SiteChrome from "../../src/components/shell/SiteChrome.vue";
import SitePanels from "../../src/components/shell/SitePanels.vue";

/** A minimal but structurally-real SiteView (four areas, a hero, a bio, …). */
const site = {
	meta: {
		name: "Domenic",
		handle: "LetsGaming",
		role: "web dev",
		location: "DE",
	},
	locale: "en",
	nav: [
		{ id: "home", label: "Home", modules: ["hero"] },
		{ id: "code", label: "Code", modules: ["activity", "coding"] },
		{ id: "life", label: "Life", modules: ["guestbook", "gallery"] },
		{ id: "about", label: "About", modules: ["bio"] },
	],
	modules: {
		hero: {
			id: "hero",
			kind: "hero",
			data: {
				eyebrow: "web dev",
				headline: {
					before: "Hi, I build ",
					highlight: "things",
					after: " on the web",
				},
				lede: "A small **tactile** site.",
				status: { verb: "open to", now: "work" },
				links: [
					{
						id: "gh",
						label: "GitHub",
						href: "https://github.com/x",
						icon: "gh",
					},
				],
			},
		},
		activity: {
			id: "activity",
			kind: "activity",
			data: {
				heading: "Recent",
				sources: ["GitHub"],
				stats: [],
				contributions: { levels: [], total: 0 },
				languages: [],
				events: [
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
			data: {
				heading: "About",
				blocks: [{ kind: "text", text: "I like building things." }],
			},
		},
		guestbook: {
			id: "guestbook",
			kind: "guestbook",
			data: {
				heading: "Guestbook",
				note: "leave a note",
				entries: [
					{
						id: 1,
						name: "Casey",
						message: "Great little site!",
						at: "2026-01-05T00:00:00Z",
						relative: "3d",
					},
				],
			},
		},
		coding: {
			id: "coding",
			kind: "coding",
			data: {
				heading: "This week",
				note: "last 7 days",
				coding: {
					range: "last 7 days",
					totalHours: 28.2,
					languages: [{ name: "TypeScript", pct: 46, hours: 13 }],
				},
			},
		},
		gallery: {
			id: "gallery",
			kind: "gallery",
			data: {
				heading: "Snapshots",
				note: "a few pictures",
				images: [
					{
						id: "i1",
						image: {
							kind: "image",
							src: "/assets/i1",
							srcsetWebp: "/assets/i1/w320.webp 320w",
							alt: "Sunset over hills",
						},
						caption: "A sunset",
					},
				],
			},
		},
	},
} as unknown as SiteView;

// Areas are routes, so the harness takes the area the server resolved — exactly
// as AreaPage.vue passes it. There's no shared tab atom to reset any more: the
// URL is the state, and both islands are told what it is.
const Shell = {
	components: { SiteChrome, SitePanels },
	props: ["site", "area"],
	template: `<div><SiteChrome :nav="site.nav" :locale="site.locale" :current="area" /><SitePanels :site="site" :area="area" /></div>`,
};

beforeEach(() => {
	// `useState` is keyed per Nuxt app instance, which the nuxt test environment
	// recreates per test file, so this just sets the starting theme.
	useTheme().value = "dark";
});

describe("public site islands (SiteChrome + SitePanels)", () => {
	it("mounts and renders the first section's content without throwing", () => {
		const wrapper = mount(Shell, { props: { site, area: "home" } });
		expect(wrapper.text()).toContain("Home");
		expect(wrapper.text()).toContain("About");
		// The initial (home) section's content is actually rendered — the exact
		// "content invisible after hydration" class of bug we want to catch.
		expect(wrapper.text()).toContain("Hi, I build");
		expect(wrapper.text()).toContain("things");
	});

	it("the nav is real links, one per area, pointing at real URLs", () => {
		const wrapper = mount(Shell, { props: { site, area: "home" } });
		const links = wrapper.findAll("nav a");
		expect(links.length).toBe(site.nav.length);
		// The first area is the root, not /home — one canonical URL for the landing
		// page instead of two that render the same thing.
		expect(links[0]?.attributes("href")).toBe("/");
		const about = links.find((a) => a.text().includes("About"));
		expect(about?.attributes("href")).toBe("/about");
		expect(about?.attributes("aria-current")).toBeUndefined();
	});

	it("renders only the current area — the others aren't in the HTML at all", () => {
		const wrapper = mount(Shell, { props: { site, area: "home" } });
		expect(wrapper.text()).toContain("Hi, I build");
		// Previously every area was SSR'd and the inactive ones hidden with
		// [hidden], so the whole site shipped in every page's source. Now it doesn't.
		expect(wrapper.text()).not.toContain("I like building things.");

		const about = mount(Shell, { props: { site, area: "about" } });
		expect(about.text()).toContain("I like building things.");
		expect(about.text()).not.toContain("Hi, I build");
		expect(
			about.findAll("nav a").find((a) => a.text().includes("About"))?.attributes("aria-current"),
		).toBe("page");
	});

	it("renders releases in the merged activity stream as external links", () => {
		const wrapper = mount(Shell, { props: { site, area: "code" } });
		expect(wrapper.text()).toContain("Released plantcare-tracker v1.2.0");
		const link = wrapper
			.findAll("a")
			.find((a) => a.text().includes("Released"));
		expect(link?.attributes("href")).toBe(
			"https://github.com/x/releases/tag/v1.2.0",
		);
		expect(link?.attributes("rel")).toContain("noopener");
		expect(wrapper.text()).toContain("This week");
		expect(wrapper.text()).toContain("TypeScript");
	});

	it("renders approved guestbook entries and the signing form", async () => {
		const wrapper = mount(Shell, { props: { site, area: "life" } });
		const lifeBtn = wrapper
			.findAll("nav button")
			.find((b) => b.text().includes("Life"));
		await lifeBtn?.trigger("click");
		expect(wrapper.text()).toContain("Great little site!");
		expect(wrapper.text()).toContain("Casey");
		expect(wrapper.find(".gform-wrap form").exists()).toBe(true);
		expect(wrapper.text()).toContain("A sunset");
		const gimg = wrapper
			.findAll("img")
			.find((im) => im.attributes("src")?.includes("/assets/i1"));
		expect(gimg).toBeTruthy();
	});
});
