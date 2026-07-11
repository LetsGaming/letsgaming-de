import type { SiteView } from "@lg/core";
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import { $activeTab, $theme } from "../../src/stores/site";
import SiteChrome from "../../src/components/SiteChrome.vue";
import SitePanels from "../../src/components/SitePanels.vue";

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
		{ id: "work", label: "Work", modules: ["highlights", "coding"] },
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
				heading: "What I actually work in",
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

// The two islands coordinate through the shared store; a harness renders both,
// exactly as the page does. Reset the shared atoms between tests for isolation.
const Shell = {
	components: { SiteChrome, SitePanels },
	props: ["site"],
	template: `<div><SiteChrome :nav="site.nav" :locale="site.locale" /><SitePanels :site="site" /></div>`,
};

beforeEach(() => {
	$activeTab.set("");
	$theme.set("dark");
});

describe("public site islands (SiteChrome + SitePanels)", () => {
	it("mounts and renders the first section's content without throwing", () => {
		const wrapper = mount(Shell, { props: { site } });
		expect(wrapper.text()).toContain("Home");
		expect(wrapper.text()).toContain("About");
		// The initial (home) section's content is actually rendered — the exact
		// "content invisible after hydration" class of bug we want to catch.
		expect(wrapper.text()).toContain("Hi, I build");
		expect(wrapper.text()).toContain("things");
	});

	it("a nav click in SiteChrome switches the visible panel in SitePanels (cross-island store)", async () => {
		const wrapper = mount(Shell, { props: { site } });
		// Before: home is the shown panel, about is hidden.
		expect(
			wrapper.find('[data-panel="home"]').attributes("hidden"),
		).toBeUndefined();
		expect(
			wrapper.find('[data-panel="about"]').attributes("hidden"),
		).toBeDefined();

		const aboutBtn = wrapper
			.findAll("nav button")
			.find((b) => b.text().includes("About"));
		expect(aboutBtn).toBeTruthy();
		await aboutBtn?.trigger("click");

		// After: the store update flowed from the chrome island to the panels island.
		expect(
			wrapper.find('[data-panel="about"]').attributes("hidden"),
		).toBeUndefined();
		expect(
			wrapper.find('[data-panel="home"]').attributes("hidden"),
		).toBeDefined();
		expect(wrapper.text()).toContain("I like building things.");
	});

	it("renders the highlights feed (releases/PRs/gists) as external links", async () => {
		const wrapper = mount(Shell, { props: { site } });
		const workBtn = wrapper
			.findAll("nav button")
			.find((b) => b.text().includes("Work"));
		await workBtn?.trigger("click");
		expect(wrapper.text()).toContain("Released plantcare-tracker v1.2.0");
		const link = wrapper
			.findAll("a")
			.find((a) => a.text().includes("Released"));
		expect(link?.attributes("href")).toBe(
			"https://github.com/x/releases/tag/v1.2.0",
		);
		expect(link?.attributes("rel")).toContain("noopener");
		expect(wrapper.text()).toContain("What I actually work in");
		expect(wrapper.text()).toContain("TypeScript");
	});

	it("renders approved guestbook entries and the signing form", async () => {
		const wrapper = mount(Shell, { props: { site } });
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
