<script setup lang="ts">
import ListItemActions from "../ListItemActions.vue";
import LocalizedField from "../LocalizedField.vue";
import { useCmsContext } from "../../../composables/cmsContext";

// View-only panel. State and handlers come from the shared CMS context.
const {
	nowList,
} = useCmsContext();
</script>

<template>
  <section class="pane">
    <div v-for="(n, i) in nowList.items.value" :key="n.id" class="card">
      <div class="grid2">
        <label>ID<input v-model="n.id" /></label>
        <label>Key<LocalizedField :field="n.key" /></label>
      </div>
      <label>Value<LocalizedField :field="n.value" /></label>
      <div class="actions">
        <ListItemActions :list="nowList" :index="i" :item="n" />
      </div>
    </div>
    <button class="btn ghost" @click="nowList.add()">+ Add line</button>
  </section>
</template>
