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
      <h3>Presence &amp; playtime <span class="muted">(Life → “Right now”, and the playtime module)</span></h3>

      <h4>Show live</h4>
      <p class="muted">
        Which Discord/Steam categories the widget may reveal. The server filters to exactly these
        before anything reaches a visitor — unchecked categories never leave the backend.
      </p>
      <div class="pgrid">
        <label v-for="o in PRESENCE_OPTIONS" :key="`show-${o.key}`" class="ptoggle">
          <input type="checkbox" :checked="presenceShow.includes(o.key)" @change="togglePresence(o.key)" />
          <span><b>{{ o.label }}</b><span class="muted"> — {{ o.hint }}</span></span>
        </label>
      </div>

      <h4>Record to history</h4>
      <p class="muted">
        Which categories the sampler accumulates for the playtime charts — separate from what's shown
        live. A category can be recorded but hidden, or shown but not recorded. Steam isn't here: its
        history comes from its own sync, not the sampler.
      </p>
      <div class="pgrid">
        <label
          v-for="o in PRESENCE_OPTIONS.filter((x) => x.key !== 'steam')"
          :key="`sample-${o.key}`"
          class="ptoggle"
        >
          <input type="checkbox" :checked="presenceSample.includes(o.key)" @change="toggleSample(o.key)" />
          <span><b>{{ o.label }}</b><span class="muted"> — {{ o.hint }}</span></span>
        </label>
      </div>
      <p v-if="sampledButHidden.length" class="muted note">
        Recording but not showing: {{ sampledButHidden.join(", ") }} — accumulating quietly.
      </p>

      <h4>Keep history for</h4>
      <p class="muted">
        Steam forgets after two weeks; this table is the only long memory, so the default keeps it.
        Older sessions are pruned on a daily sweep.
      </p>
      <select class="retention" :value="presenceRetention === null ? 'null' : presenceRetention" @change="setRetention">
        <option v-for="o in RETENTION_OPTIONS" :key="String(o.days)" :value="o.days === null ? 'null' : o.days">
          {{ o.label }}
        </option>
      </select>

      <h4>Hidden games</h4>
      <p class="muted">
        Recorded like everything else, but never named on the public page — one per line, matched
        case-insensitively. The all-time shape (when you play, hours) still counts them; only the
        named lists drop them.
      </p>
      <textarea
        v-model="hiddenText"
        class="hidden-games"
        rows="4"
        placeholder="e.g. a game you'd rather not list"
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
.retention {
	font: inherit;
	font-size: 13px;
	background: var(--card-2);
	color: var(--ink);
	border: 1px solid var(--line);
	border-radius: var(--r-s);
	padding: 6px var(--sp-10);
}
.hidden-games {
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
