<script setup lang="ts">
import EntityCards from "../EntityCards.vue";
import LocalizedField from "../LocalizedField.vue";
import { assetRef } from "@lg/core";
import { useCmsContext } from "../../../composables/cmsContext";

// View-only panel: its fields, and nothing else. The card frame, the reorder /
// delete / save row and the add button are EntityCards; state and handlers come
// from the shared CMS context.
const { linksList, openPicker } = useCmsContext();
</script>

<template>
  <section class="pane">
    <EntityCards :list="linksList" add-label="+ Add link">
      <template #default="{ item: l }">
        <div class="grid2">
          <label>ID<input v-model="l.id" /></label>
          <label>Icon
            <span class="iconfield">
              <input v-model="l.icon" placeholder="gh, mail, x, linkedin, … or pick an SVG" />
              <button class="link" type="button" @click="openPicker((id) => { l.icon = assetRef(id); linksList.save(l); }, 'svg')">pick SVG</button>
            </span>
          </label>
          <label>Label<LocalizedField :field="l.label" /></label>
          <label>Href<input v-model="l.href" /></label>
        </div>
        <label class="check"><input type="checkbox" v-model="l.primary" /> primary</label>
      </template>
    </EntityCards>
  </section>
</template>
