<script setup lang="ts">
import { useCmsContext } from "../../../composables/cmsContext";

// View-only panel. All state and handlers come from the shared CMS context.
const { dashStats, guestbook, moderate, now, pick, tab } = useCmsContext();
</script>

<template>
  <section class="pane">
          <div class="card note">
            Welcome back. This is your site's control room — pick a section on the left. Edits go live
            immediately (no rebuild); use <b>Preview</b> or <b>View site</b> to see them.
          </div>
          <div class="statgrid">
            <button v-for="s in dashStats" :key="s.label" class="stat" @click="pick(s.to)">
              <span class="statn">{{ s.n }}</span>
              <span class="statl">{{ s.label }}</span>
            </button>
          </div>
          <div v-if="guestbook?.pending" class="card">
            <h3>Needs attention</h3>
            <p><b>{{ guestbook.pending }}</b> guestbook {{ guestbook.pending === 1 ? "entry" : "entries" }} awaiting review — <button class="link" @click="pick('guestbook')">moderate now</button>.</p>
          </div>
        </section>
</template>
