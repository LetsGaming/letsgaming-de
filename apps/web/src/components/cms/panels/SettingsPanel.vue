<script setup lang="ts">
import { CLEAR_RANGES, type ClearRangeId } from "@lg/core";
import { computed, ref } from "vue";
import { CLEAR_ALL_WORD, isClearConfirmed, needsTypedWord } from "../../../composables/clearConfirm";
import { useCmsContext } from "../../../composables/cmsContext";

const { clearRange, clearing } = useCmsContext();

const pending = ref<ClearRangeId | null>(null);
const typed = ref("");

const pendingRange = computed(() => CLEAR_RANGES.find((r) => r.id === pending.value) ?? null);
const confirmed = computed(() => pending.value !== null && isClearConfirmed(pending.value, typed.value));

function ask(id: ClearRangeId) {
  pending.value = id;
  typed.value = "";
}

function cancel() {
  pending.value = null;
  typed.value = "";
}

async function run() {
  const range = pendingRange.value;
  if (!range || !confirmed.value) return;
  await clearRange(range.id, range.label);
  cancel();
}
</script>

<template>
  <section class="pane">
    <div class="card dangerzone">
      <h3>Data</h3>
      <p class="help">
        Delete recorded analytics. Deleting cannot be undone. Content, guestbook entries and media are
        not affected.
      </p>
      <div class="clearrow" role="group" aria-label="Delete analytics for">
        <span class="help">Delete analytics from the</span>
        <button
          v-for="c in CLEAR_RANGES"
          :key="c.id"
          type="button"
          class="clearbtn"
          :class="{ danger: c.hours === null, sel: pending === c.id }"
          :disabled="clearing"
          :aria-pressed="pending === c.id"
          @click="ask(c.id)"
        >
          {{ c.label }}
        </button>
      </div>

      <form v-if="pendingRange" class="clearconfirm" @submit.prevent="run">
        <p class="help">
          <template v-if="needsTypedWord(pendingRange.id)">
            This deletes <b>all</b> recorded analytics, including daily history. Type
            <code>{{ CLEAR_ALL_WORD }}</code> to confirm.
          </template>
          <template v-else>Delete analytics from the {{ pendingRange.label }}? This cannot be undone.</template>
        </p>
        <input
          v-if="needsTypedWord(pendingRange.id)"
          v-model="typed"
          type="text"
          autocomplete="off"
          :aria-label="`Type ${CLEAR_ALL_WORD} to confirm`"
          :placeholder="CLEAR_ALL_WORD"
        />
        <div class="clearactions">
          <button type="submit" class="btn dangerbtn" :disabled="!confirmed || clearing">
            {{ clearing ? "Deleting…" : "Delete" }}
          </button>
          <button type="button" class="btn ghost" :disabled="clearing" @click="cancel">Cancel</button>
        </div>
      </form>
    </div>
  </section>
</template>
