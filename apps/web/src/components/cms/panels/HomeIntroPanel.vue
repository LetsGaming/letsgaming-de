<script setup lang="ts">
import { useCmsContext } from "../../../composables/cmsContext";

// View-only panel. All state and handlers come from the shared CMS context.
const {
	headline,
	lede,
	locale,
	lv,
	saveHeadline,
	saveLede,
	saveStatus,
	setLv,
	status,
	tab,
} = useCmsContext();
</script>

<template>
  <section class="pane">
          <div class="card note">The hero on the <b>Home</b> area: the big headline, the lede beneath it, and the status line. Projects &amp; activity come from GitHub automatically.</div>
          <div class="card">
            <h3>Headline</h3>
            <label>Before<input :value="lv(headline.before, locale)" @input="setLv(headline.before, locale, ($event.target as HTMLInputElement).value)" /></label>
            <label>Highlight<input :value="lv(headline.highlight, locale)" @input="setLv(headline.highlight, locale, ($event.target as HTMLInputElement).value)" /></label>
            <label>After<input :value="lv(headline.after, locale)" @input="setLv(headline.after, locale, ($event.target as HTMLInputElement).value)" /></label>
            <button class="btn" @click="saveHeadline">Save headline</button>
          </div>
          <div class="card">
            <h3>Lede <span class="muted">(**bold** supported)</span></h3>
            <textarea :value="lv(lede, locale)" @input="setLv(lede, locale, ($event.target as HTMLTextAreaElement).value)" rows="3" />
            <button class="btn" @click="saveLede">Save lede</button>
          </div>
          <div class="card">
            <h3>Status</h3>
            <label>Verb<input :value="lv(status.verb, locale)" @input="setLv(status.verb, locale, ($event.target as HTMLInputElement).value)" /></label>
            <label>Now<input :value="lv(status.now, locale)" @input="setLv(status.now, locale, ($event.target as HTMLInputElement).value)" /></label>
            <button class="btn" @click="saveStatus">Save status</button>
          </div>
        </section>
</template>
