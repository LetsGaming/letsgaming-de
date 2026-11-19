import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import type { ResolvedModule } from "@lg/core";
import WeekSection from "../../src/components/sections/WeekSection.vue";
import PlayingSection from "../../src/components/sections/PlayingSection.vue";
import RecentSection from "../../src/components/sections/RecentSection.vue";

type Mod<K extends ResolvedModule["kind"]> = Extract<ResolvedModule, { kind: K }>;

const week = (parts: Mod<"week">["data"]["parts"], extra = {}): Mod<"week"> => ({
	id: "week",
	kind: "week",
	data: { heading: "This week", parts, ...extra },
});

describe("WeekSection", () => {
	it("renders the parts in order as one paragraph, linking only parts with an href", () => {
		const wrapper = mount(WeekSection, {
			props: {
				module: week([
					{ text: "I coded " },
					{ text: "12.5 hours", href: "/code", role: "code" },
					{ text: " and played " },
					{ text: "6 hours", href: "/life", role: "games" },
					{ text: "." },
				]),
			},
		});
		expect(wrapper.find("h2").text()).toBe("This week");
		expect(wrapper.findAll("p")).toHaveLength(1);
		expect(wrapper.find("p").text()).toBe("I coded 12.5 hours and played 6 hours.");
		const links = wrapper.findAll("a");
		expect(links.map((a) => a.attributes("href"))).toEqual(["/code", "/life"]);
		expect(links.map((a) => a.text())).toEqual(["12.5 hours", "6 hours"]);
		expect(wrapper.find("ul, ol").exists()).toBe(false);
	});

	it("renders a text-only sentence without links", () => {
		const wrapper = mount(WeekSection, { props: { module: week([{ text: "A quiet week." }]) } });
		expect(wrapper.find("p").text()).toBe("A quiet week.");
		expect(wrapper.find("a").exists()).toBe(false);
	});

	it("shows the note beside the heading", () => {
		const wrapper = mount(WeekSection, { props: { module: week([{ text: "x" }], { note: "Last 7 days" }) } });
		expect(wrapper.find("header").text()).toContain("Last 7 days");
	});
});

const playing = (data: Partial<Mod<"playing">["data"]>): Mod<"playing"> => ({
	id: "playing",
	kind: "playing",
	data: { heading: "Playing", games: [], songs: [], moreHref: "/life", ...data },
});
const GAMES = [
	{ name: "Minecraft", minutes: 125, exact: true },
	{ name: "Rocket League", minutes: 40, exact: false },
];
const SONGS = [
	{ name: "Tek It", minutes: 30, plays: 7, by: "Cafune" },
	{ name: "No Art", minutes: 10, plays: 2 },
];

describe("PlayingSection", () => {
	it("renders games as tiles and songs as a typographic list, with h3 sub-headings", () => {
		const wrapper = mount(PlayingSection, { props: { module: playing({ games: GAMES, songs: SONGS }) } });
		expect(wrapper.find("h2").text()).toBe("Playing");
		expect(wrapper.findAll("h3")).toHaveLength(2);
		const tiles = wrapper.findAll("li.at");
		expect(tiles).toHaveLength(2);
		expect(tiles[0]!.text()).toContain("Minecraft");
		expect(tiles[0]!.text()).toContain("2h");
		expect(tiles[1]!.text()).toContain("+");
		const rows = wrapper.findAll(".rr");
		expect(rows).toHaveLength(2);
		expect(rows[0]!.text()).toContain("Tek It");
		expect(rows[0]!.text()).toContain("Cafune");
		expect(rows[0]!.text()).toContain("7×");
	});

	it("has one link, to the area that holds the rest", () => {
		const wrapper = mount(PlayingSection, { props: { module: playing({ games: GAMES, songs: SONGS }) } });
		const links = wrapper.findAll("a");
		expect(links.map((a) => a.attributes("href"))).toEqual(["/life"]);
		expect(links[0]!.text()).toBe("All games and music");
	});

	it("renders only the group that has data", () => {
		const gamesOnly = mount(PlayingSection, { props: { module: playing({ games: GAMES }) } });
		expect(gamesOnly.findAll("h3")).toHaveLength(1);
		expect(gamesOnly.find(".rr").exists()).toBe(false);
		const songsOnly = mount(PlayingSection, { props: { module: playing({ songs: SONGS }) } });
		expect(songsOnly.findAll("h3")).toHaveLength(1);
		expect(songsOnly.find("li.at").exists()).toBe(false);
	});

	it("leaves out the song art when there is none", () => {
		const wrapper = mount(PlayingSection, { props: { module: playing({ songs: [SONGS[1]!] }) } });
		expect(wrapper.find(".rr img").exists()).toBe(false);
	});
});

const EVENTS = [
	{ type: "release" as const, text: "Released v1.2", meta: "letsgaming-de", at: "2026-11-18T10:00:00Z", relative: "1d", href: "https://github.com/x/y/releases/v1.2" },
	{ type: "commit" as const, text: "Fix the feed", at: "2026-11-10T10:00:00Z", relative: "1w" },
];

describe("RecentSection", () => {
	it("renders a dated feed with the age, text, meta and links only where an event has a destination", () => {
		const wrapper = mount(RecentSection, {
			props: { module: { id: "recent", kind: "recent", data: { heading: "Recent", events: EVENTS, moreHref: "/code" } } },
		});
		expect(wrapper.find("h2").text()).toBe("Recent");
		const items = wrapper.findAll("li");
		expect(items).toHaveLength(2);
		expect(items[0]!.text()).toContain("1d");
		expect(items[0]!.text()).toContain("Released v1.2");
		expect(items[0]!.text()).toContain("letsgaming-de");
		expect(items[0]!.find("a").attributes("href")).toBe("https://github.com/x/y/releases/v1.2");
		expect(items[1]!.find("a").exists()).toBe(false);
	});

	it("renders only the heading when there are no events", () => {
		const wrapper = mount(RecentSection, {
			props: { module: { id: "recent", kind: "recent", data: { heading: "Recent", events: [], moreHref: "/code" } } },
		});
		expect(wrapper.find("ul").exists()).toBe(false);
	});

	it("says so when the data is stale", () => {
		const wrapper = mount(RecentSection, {
			props: {
				module: {
					id: "recent",
					kind: "recent",
					data: { heading: "Recent", events: EVENTS, moreHref: "/code", freshness: { state: "stale", source: "github", relative: "3d" } },
				},
			},
		});
		expect(wrapper.find(".fresh").exists()).toBe(true);
	});
});
