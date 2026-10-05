<script setup lang="ts">
import EntityCards from "../EntityCards.vue";
import LocalizedField from "../LocalizedField.vue";
import { useCmsContext } from "../../../composables/cmsContext";

// View-only panel: its fields, and nothing else. The card frame, the reorder /
// delete / save row and the add button are EntityCards; state and handlers come
// from the shared CMS context.
const { autosave, nowList } = useCmsContext();
</script>

<template>
  <section class="pane">
    <EntityCards :list="nowList" add-label="+ Add line">
      <template #default="{ item: n }">
        <div class="grid2">
          <label>ID<input v-model="n.id" :readonly="autosave.known('now/' + n.id)" title="The id is fixed once saved" /></label>
          <label>Key<LocalizedField :field="n.key" /></label>
        </div>
        <label>Value<LocalizedField :field="n.value" /></label>
      </template>
    </EntityCards>
  </section>
</template>
