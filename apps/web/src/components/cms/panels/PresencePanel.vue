<script setup lang="ts">
import { computed } from "vue";
import { useCmsContext } from "../../../composables/cmsContext";

// View-only panel. All state and handlers come from the shared CMS context.
const {
	PRESENCE_OPTIONS,
	RETENTION_OPTIONS,
	presenceShow,
	presenceSample,
	presenceRetention,
	presenceHidden,
	savePresence,
	togglePresence,
	toggleSample,
} = useCmsContext();

// The hidden list is a string[] in state; the textarea edits it one-per-line.
const hiddenText = computed({
	get: () => presenceHidden.value.join("\n"),
	set: (v: string) => {
		presenceHidden.value = v
			.split("\n")
			.map((s) => s.trim())
			.filter(Boolean);
	},
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
</script>

<template>
  <section class="pane">
    <div class="card">
      <h3>Presence <span class="muted">(Life → “Right now”, and what the playtime charts record)</span></h3>

      <h4>Activity categories</h4>
      <p class="muted">
        Two independent switches per category. <b>Show</b> puts it on the live widget — the server
        sends visitors only what's ticked. <b>Record</b> saves it to build the playtime charts. They're
        separate on purpose: a category can be recorded but not shown, or shown but not recorded.
      </p>
      <div class="catgrid" role="table">
        <div class="cathead" role="row">
          <span role="columnheader">Category</span>
          <span role="columnheader">Show</span>
          <span role="columnheader">Record</span>
        </div>
        <div v-for="o in PRESENCE_OPTIONS" :key="o.key" class="catrow" role="row">
          <span class="catname"><b>{{ o.label }}</b><span class="muted"> — {{ o.hint }}</span></span>
          <label class="catcell" :title="`Show ${o.label} on the live widget`">
            <input type="checkbox" :checked="presenceShow.includes(o.key)" @change="togglePresence(o.key)" />
          </label>
          <label class="catcell" :title="`Record ${o.label} for the playtime charts`">
            <input type="checkbox" :checked="presenceSample.includes(o.key)" @change="toggleSample(o.key)" />
          </label>
        </div>
      </div>
      <p v-if="sampledButHidden.length" class="muted note">
        Recording but not showing: {{ sampledButHidden.join(", ") }} — accumulating quietly.
      </p>

      <h4>Keep history for</h4>
      <p class="muted">
        How long recorded sessions are kept before a daily sweep prunes the rest. This table is the
        only long memory of what was played, so the default keeps everything.
      </p>
      <select class="retention" :value="presenceRetention === null ? 'null' : presenceRetention" @change="setRetention">
        <option v-for="o in RETENTION_OPTIONS" :key="String(o.days)" :value="o.days === null ? 'null' : o.days">
          {{ o.label }}
        </option>
      </select>

      <h4>Hidden activities</h4>
      <p class="muted">
        Names that are recorded but never shown publicly — dropped from the live widget <em>and</em>
        the playtime charts, whatever the category (a game, a stream, a show). One per line, matched
        case-insensitively. The all-time shape (when you play, hours) still counts them; only the named
        rows and the live card drop them.
      </p>
      <textarea
        v-model="hiddenText"
        class="hidden-list"
        rows="4"
        placeholder="e.g. R6"
        spellcheck="false"
      ></textarea>

      <div class="actions"><button class="btn" @click="savePresence">Save presence</button></div>
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
.note {
	font-size: var(--fs-micro);
	margin-top: var(--sp-6);
}

/* One row per category, two switch columns — the two axes read at a glance instead
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
.hidden-list {
	width: 100%;
	font: inherit;
	font-size: 13px;
	background: var(--card-2);
	color: var(--ink);
	border: 1px solid var(--line);
	border-radius: var(--r-s);
	padding: var(--sp-8) var(--sp-10);
	resize: vertical;
}
</style>
