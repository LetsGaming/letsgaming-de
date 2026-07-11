<script setup lang="ts">
import { useCmsContext } from "../../../composables/cmsContext";

// View-only panel. All state and handlers come from the shared CMS context.
const {
	PRESENCE_OPTIONS,
	now,
	presenceShow,
	savePresence,
	tab,
	togglePresence,
} = useCmsContext();
</script>

<template>
  <section class="pane">
          <div class="card">
            <h3>Presence widget <span class="muted">(Life → “Right now-ish”)</span></h3>
            <p class="muted">
              Which Discord/Steam categories the widget may reveal. The server filters to exactly
              these before anything reaches a visitor — unchecked categories never leave the backend.
            </p>
            <div class="pgrid">
              <label v-for="o in PRESENCE_OPTIONS" :key="o.key" class="ptoggle">
                <input type="checkbox" :checked="presenceShow.includes(o.key)" @change="togglePresence(o.key)" />
                <span><b>{{ o.label }}</b><span class="muted"> — {{ o.hint }}</span></span>
              </label>
            </div>
            <div class="actions"><button class="btn" @click="savePresence">Save presence</button></div>
          </div>
        </section>
</template>
