import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import type { ResolvedModule } from "@lg/core";
import ActivitySection from "../../src/components/sections/ActivitySection.vue";

type Mod = Extract<ResolvedModule, { kind: "activity" }>;

const events = (n: number): Mod["data"]["events"] =>
	Array.from({ length: n }, (_, i) => ({
		type: "commit" as const,
		text: `Pushed to repo-${i}`,
		at: `2026-11-1${i}T10:00:00Z`,
		relative: `${i + 1}d`,
	}));

const activity = (n: number): Mod => ({
	id: "activity",
	kind: "activity",
	data: {
		heading: "Recent",
		stats: [],
		contributions: { levels: [], dates: [], counts: [], total: 0 },
		languages: [],
		events: events(n),
		sources: ["GitHub"],
	},
});

describe("ActivitySection feed", () => {
	it("shows five events and a working show-more control for the rest", async () => {
		const wrapper = mount(ActivitySection, { props: { module: activity(7) } });
		expect(wrapper.findAll(".activity-events li")).toHaveLength(5);
		const more = wrapper.find("button.list-footer__more");
		expect(more.exists()).toBe(true);
		expect(more.text()).toContain("2");
		await more.trigger("click");
		expect(wrapper.findAll(".activity-events li")).toHaveLength(7);
	});

	it("has no show-more control when everything fits", () => {
		const wrapper = mount(ActivitySection, { props: { module: activity(3) } });
		expect(wrapper.find("button.list-footer__more").exists()).toBe(false);
	});
});
