import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cms } from "../../../src/lib/cms";
import CmsApp from "../../../src/components/cms/CmsApp.vue";

// Mounting the CMS runs boot() → cms.me(); stub it to reject so we land on the
// sign-in gate without any network. This is a smoke test for the panel-split
// refactor: it proves CmsApp still compiles, registers its 14 panel components,
// runs provide(CMS_KEY, …), and mounts without throwing.
describe("CmsApp", () => {
	afterEach(() => vi.restoreAllMocks());

	it("mounts and shows the sign-in gate when unauthenticated", async () => {
		vi.spyOn(cms, "me").mockRejectedValue(new Error("unauthenticated"));

		const wrapper = mount(CmsApp);
		await flushPromises();

		expect(wrapper.find(".gate").exists()).toBe(true);
		expect(wrapper.text()).toContain("Sign in");
		const signIn = wrapper.find("a.btn.primary");
		expect(signIn.exists()).toBe(true);
		expect(signIn.attributes("href")).toBe(cms.loginUrl());
	});
});
