<script setup lang="ts">
/**
 * A list of names edited as chips: Enter or comma adds, the x removes, Backspace on an
 * empty field removes the last. `suggestions` are names to offer, most relevant first.
 */
import { computed, ref } from "vue";
import { addTag, removeTag, suggestTags } from "../../lib/cmsInspector";

const props = defineProps<{
  suggestions?: { name: string; sessions?: number }[];
  placeholder?: string;
  label: string;
}>();
const tags = defineModel<string[]>({ required: true });
const draft = ref("");

const offered = computed(() => suggestTags(props.suggestions ?? [], tags.value, draft.value));

function commit(raw = draft.value) {
  tags.value = addTag(tags.value, raw);
  draft.value = "";
}

function onKey(e: KeyboardEvent) {
  if (e.key === "Enter" || e.key === ",") {
    e.preventDefault();
    commit();
  } else if (e.key === "Backspace" && !draft.value && tags.value.length) {
    tags.value = tags.value.slice(0, -1);
  }
}
</script>

<template>
  <div class="taginput">
    <ul class="chips" :aria-label="label">
      <li v-for="t in tags" :key="t" class="chip">
        <span>{{ t }}</span>
        <button type="button" class="chipx" :aria-label="`Remove ${t}`" @click="tags = removeTag(tags, t)">×</button>
      </li>
      <li class="chipfield">
        <input
          v-model="draft"
          type="text"
          autocomplete="off"
          spellcheck="false"
          :placeholder="tags.length ? '' : placeholder"
          :aria-label="`Add to ${label}`"
          @keydown="onKey"
          @blur="draft.trim() && commit()"
        />
      </li>
    </ul>
    <div v-if="offered.length" class="suggest" role="group" aria-label="Recorded names">
      <span class="help">Recorded:</span>
      <button v-for="n in offered" :key="n" type="button" class="sugg" @click="commit(n)">+ {{ n }}</button>
    </div>
  </div>
</template>

<style scoped>
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-6);
  align-items: center;
  margin: 0;
  padding: var(--sp-6) var(--sp-8);
  list-style: none;
  background: var(--card-2);
  border: 1px solid var(--line);
  border-radius: var(--r-s);
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-4);
  padding: 2px var(--sp-4) 2px var(--sp-8);
  background: var(--purple-wash);
  border: 1px solid var(--line);
  border-radius: 999px;
  font-size: 13px;
  color: var(--ink);
}
.chipx {
  border: 0;
  background: none;
  padding: 0 var(--sp-4);
  color: var(--muted);
  font: inherit;
  cursor: pointer;
}
.chipx:hover,
.chipx:focus-visible {
  color: var(--ink);
}
.chipfield {
  flex: 1 1 8rem;
}
.chipfield input {
  width: 100%;
  border: 0;
  background: none;
  padding: var(--sp-4) 0;
  outline: none;
}
.chips:focus-within {
  border-color: var(--muted);
}
.suggest {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-6);
  margin-top: var(--sp-8);
}
.sugg {
  border: 1px dashed var(--line);
  background: none;
  border-radius: 999px;
  padding: 2px var(--sp-8);
  font: inherit;
  font-size: 13px;
  color: var(--muted);
  cursor: pointer;
}
.sugg:hover,
.sugg:focus-visible {
  color: var(--ink);
  border-color: var(--muted);
}
</style>
