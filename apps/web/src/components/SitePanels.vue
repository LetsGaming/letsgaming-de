<script setup lang="ts">
import type { NavView, SiteView } from "@lg/core";
import { useStore } from "@nanostores/vue";
import { computed, nextTick, onMounted, watch } from "vue";
import { $activeTab, areaForTarget, initSite, setTab } from "../stores/site";
import Module from "./Module.vue";

const props = defineProps<{ site: SiteView }>();

const activeTab = useStore($activeTab);
// SSR fallback (see SiteChrome): show the first area until hydration seeds the atom.
const current = computed(() => activeTab.value || props.site.nav[0]?.id);

const prefersReduced = () =>
	typeof matchMedia !== "undefined" &&
	matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Modules a leaf area places, in order (skips missing ids defensively). */
function areaModules(area: NavView) {
	return (area.modules ?? [])
		.map((id) => props.site.modules[id])
		.filter(Boolean);
}

/** Tab switch from an in-page button (Module → section). Mirrors the old `go`. */
function go(id: string) {
	setTab(id);
	if (typeof window !== "undefined")
		window.scrollTo({ top: 0, behavior: "smooth" });
}

/** Jump to a section by module id: switch to the tab that holds it, then scroll
 *  it into view. Powers internal `#anchor` links like "Get in touch". */
function goToAnchor(target: string) {
	const area = areaForTarget(target);
	if (!area) return;
	setTab(area.id);
	void nextTick(() => {
		if (typeof document === "undefined") return;
		document
			.getElementById(target)
			?.scrollIntoView({ behavior: "smooth", block: "start" });
	});
}

/** Re-trigger the staggered entrance and (re)attach tilt within a panel. Queries
 *  the document by the unique data-panel id, so it works from either island. */
function animate(id: string) {
	if (typeof document === "undefined") return;
	const panel = document.querySelector<HTMLElement>(`[data-panel="${id}"]`);
	if (!panel) return;
	const reduced = prefersReduced();
	panel.querySelectorAll<HTMLElement>(".rise").forEach((el, i) => {
		el.classList.remove("in");
		void el.offsetWidth; // restart the animation
		if (reduced) el.classList.add("in");
		else window.setTimeout(() => el.classList.add("in"), 70 * i);
	});
	if (!reduced)
		panel.querySelectorAll<HTMLElement>(".card, .tile").forEach(tilt);
}

function tilt(el: HTMLElement) {
	if (el.dataset.tilt) return;
	el.dataset.tilt = "1";
	el.addEventListener("pointermove", (e) => {
		const r = el.getBoundingClientRect();
		const px = (e.clientX - r.left) / r.width - 0.5;
		const py = (e.clientY - r.top) / r.height - 0.5;
		el.style.transform = `perspective(720px) rotateY(${px * 6}deg) rotateX(${-py * 6}deg) translateY(-4px)`;
	});
	el.addEventListener("pointerleave", () => {
		el.style.transform = "";
	});
}

// Any tab change — whether from this island's buttons or the nav bar in
// SiteChrome — re-runs the entrance. The scroll is done by the initiator (go /
// goToAnchor / the nav bar), so this only owns the animation.
watch(activeTab, (id) => void nextTick(() => animate(id)));

onMounted(() => {
	initSite(props.site.nav);
	// Deep link: #<area> or #<moduleId> opens that section (used by the CMS preview
	// and shared links).
	const target = decodeURIComponent(window.location.hash.replace(/^#/, ""));
	if (target) {
		const area = areaForTarget(target);
		if (area) {
			setTab(area.id);
			void nextTick(() =>
				document
					.getElementById(target)
					?.scrollIntoView({ behavior: "smooth", block: "start" }),
			);
		}
	}
	// Initial entrance (the watch above won't fire if the atom was already seeded).
	void nextTick(() => animate(current.value));
});
</script>

<template>
  <section
    v-for="area in site.nav"
    :key="area.id"
    class="panel"
    :data-panel="area.id"
    :hidden="area.id !== current"
  >
    <Module v-for="m in areaModules(area)" :key="m!.id" :module="m!" :go="go" :go-anchor="goToAnchor" />
  </section>
</template>
