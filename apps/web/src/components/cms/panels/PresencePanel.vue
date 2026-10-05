<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useCmsContext } from "../../../composables/cmsContext";
import type { ActivityNameRow } from "../../../lib/cms";
import HelpTip from "../HelpTip.vue";
import TagInput from "../TagInput.vue";

// View-only panel. All state and handlers come from the shared CMS context.
const {
	PRESENCE_OPTIONS,
	RETENTION_OPTIONS,
	presenceShow,
	presenceSample,
	presenceRetention,
	presenceHidden,
	togglePresence,
	toggleSample,
	cms,
} = useCmsContext();

// Names the sampler has recorded, most-seen first. Suggestions only: a missing list
// leaves the field fully usable.
const recorded = ref<ActivityNameRow[]>([]);
onMounted(async () => {
	try {
		recorded.value = (await cms.activityNames()).names;
	} catch {
		recorded.value = [];
	}
});

// Recording a category the widget doesn't display is fine (collect quietly); the
// reverse loses no live function but keeps no history. Neither is wrong, so this
// is a hint, not a block.
const sampledButHidden = computed(() =>
	presenceSample.value.filter((k) => !presenceShow.value.includes(k)),
);

function setRetention(e: Event) {
	const v = (e.target as HTMLSelectElement).value;
	presenceRetention.value = v === "null" ? null : Number(v);
}

const retentionSummary = computed(() => {
	const days = presenceRetention.value;
	return days === null
		? "Recorded sessions are kept forever."
		: `Sessions older than ${days} days are deleted by a daily sweep.`;
});
</script>

<template>
  <section class="pane">
    <div class="card">
      <h3>Presence privacy</h3>

      <h4>Activity categories</h4>
      <p class="help">
        <b>Show</b> puts a category on the live widget. <b>Record</b> saves it for the playtime charts.
        <HelpTip text="The two switches are independent on purpose: a category can be recorded but not shown, or shown but not recorded. The server sends visitors only what is ticked under Show." />
      </p>
      <div class="catgrid" role="table">
        <div class="cathead" role="row">
          <span role="columnheader">Category</span>
          <span role="columnheader">Show</span>
          <span role="columnheader">Record</span>
        </div>
        <div v-for="o in PRESENCE_OPTIONS" :key="o.key" class="catrow" role="row">
          <span class="catname"><b>{{ o.label }}</b><span class="muted"> · {{ o.hint }}</span></span>
          <label class="catcell" :title="`Show ${o.label} on the live widget`">
            <input type="checkbox" :checked="presenceShow.includes(o.key)" @change="togglePresence(o.key)" />
          </label>
          <label class="catcell" :title="`Record ${o.label} for the playtime charts`">
            <input type="checkbox" :checked="presenceSample.includes(o.key)" @change="toggleSample(o.key)" />
          </label>
        </div>
      </div>
      <p v-if="sampledButHidden.length" class="help hint">
        Recording but not showing: {{ sampledButHidden.join(", ") }}.
      </p>

      <h4>Keep history for</h4>
      <select class="retention" :value="presenceRetention === null ? 'null' : presenceRetention" @change="setRetention">
        <option v-for="o in RETENTION_OPTIONS" :key="String(o.days)" :value="o.days === null ? 'null' : o.days">
          {{ o.label }}
        </option>
      </select>
      <p class="help hint">
        {{ retentionSummary }}
        <HelpTip text="This table is the only long memory of what was played, so the default keeps everything." />
      </p>

      <h4>Hidden activities</h4>
      <p class="help">
        Names that are never shown publicly, in any category. Matched case-insensitively.
        <HelpTip text="Hidden names are dropped from the live widget and the playtime charts. The all-time shape (when you play, hours) still counts them; only the named rows and the live card drop them." />
      </p>
      <TagInput
        v-model="presenceHidden"
        label="Hidden activities"
        placeholder="Type a name, press Enter"
        :suggestions="recorded"
      />

    </div>
  </section>
</template>

<style scoped>
.pane h4 {
	margin: var(--sp-16) 0 var(--sp-4);
	font-size: 13px;
	color: var(--muted);
	font-weight: 600;
}
.pane h4:first-of-type {
	margin-top: var(--sp-8);
}
.hint {
	margin-top: var(--sp-6);
}

/* One row per category, two switch columns: the two axes read at a glance instead
   of as two look-alike lists. */
.catgrid {
	margin-top: var(--sp-8);
	border: 1px solid var(--line);
	border-radius: var(--r-s);
	overflow: hidden;
}
.cathead,
.catrow {
	display: grid;
	grid-template-columns: 1fr 4rem 4rem;
	align-items: center;
	gap: var(--sp-8);
	padding: var(--sp-8) var(--sp-10);
}
.cathead {
	font-size: var(--fs-micro);
	color: var(--muted);
	background: var(--card-2);
	border-bottom: 1px solid var(--line);
}
.cathead span:not(:first-child) {
	text-align: center;
}
.catrow + .catrow {
	border-top: 1px solid var(--line);
}
.catname {
	font-size: 13px;
}
.catcell {
	display: flex;
	justify-content: center;
	cursor: pointer;
}
.retention {
	font: inherit;
	font-size: 13px;
	background: var(--card-2);
	color: var(--ink);
	border: 1px solid var(--line);
	border-radius: var(--r-s);
	padding: 6px var(--sp-10);
}
</style>
