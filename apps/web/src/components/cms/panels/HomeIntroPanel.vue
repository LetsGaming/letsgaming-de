<script setup lang="ts">
import LocalizedField from "../LocalizedField.vue";
import { useCmsContext } from "../../../composables/cmsContext";

// View-only panel. All state and handlers come from the shared CMS context.
const {
	headline,
	lede,
	saveHeadline,
	saveLede,
	saveStatus,
	status,
} = useCmsContext();
</script>

<template>
  <section class="pane">
          <div class="card note">The hero on the <b>Home</b> area: the big headline, the lede beneath it, and the status line. Projects &amp; activity come from GitHub automatically.</div>
          <div class="card">
            <h3>Headline</h3>
            <label>Before<LocalizedField :field="headline.before" /></label>
            <label>Highlight<LocalizedField :field="headline.highlight" /></label>
            <label>After<LocalizedField :field="headline.after" /></label>
            <button class="btn" @click="saveHeadline">Save headline</button>
          </div>
          <div class="card">
            <h3>Lede <span class="muted">(**bold** supported)</span></h3>
            <LocalizedField textarea :rows="3" :field="lede" />
            <button class="btn" @click="saveLede">Save lede</button>
          </div>
          <div class="card">
            <h3>Status</h3>
            <label>Verb<LocalizedField :field="status.verb" /></label>
            <label>Now<LocalizedField :field="status.now" /></label>
            <button class="btn" @click="saveStatus">Save status</button>
          </div>
        </section>
</template>
