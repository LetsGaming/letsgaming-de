import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import RankedRow from "../../src/components/ui/RankedRow.vue";

describe("RankedRow", () => {
	it("takes its monogram from the first letter after any leading symbols", () => {
		const wrapper = mount(RankedRow, { props: { rank: 1, name: "[ ! ] Game" } });
		expect(wrapper.find(".rr-mono").text()).toBe("G");
	});

	it("shows the image, and falls back to the monogram when it fails to load", async () => {
		const wrapper = mount(RankedRow, { props: { rank: 1, name: "Minecraft", art: "/broken.png" } });
		expect(wrapper.find("img.rr-art").exists()).toBe(true);
		await wrapper.find("img.rr-art").trigger("error");
		expect(wrapper.find("img").exists()).toBe(false);
		expect(wrapper.find(".rr-mono").text()).toBe("M");
	});

	it("tries a new image after the art changes", async () => {
		const wrapper = mount(RankedRow, { props: { rank: 1, name: "Minecraft", art: "/a.png" } });
		await wrapper.find("img").trigger("error");
		await wrapper.setProps({ art: "/b.png" });
		expect(wrapper.find("img").attributes("src")).toBe("/b.png");
	});
});
