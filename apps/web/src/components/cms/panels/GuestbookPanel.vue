<script setup lang="ts">
import { useCmsContext } from "../../../composables/cmsContext";

// View-only panel. All state and handlers come from the shared CMS context.
const { guestbook, loadGuestbook, loadingG, meta, moderate, removeEntry, tab } =
	useCmsContext();
</script>

<template>
  <section class="pane">
        <div class="gb-head">
          <h2>
            Guestbook
            <span v-if="guestbook?.pending" class="pill pill-pending">{{ guestbook.pending }} pending</span>
          </h2>
          <button class="btn ghost" @click="loadGuestbook">Refresh</button>
        </div>
        <p class="muted">
          Nothing is public until you approve it. Auto-flags only sort the queue — you decide.
        </p>
        <div v-if="loadingG" class="muted">Loading…</div>
        <div v-else-if="!guestbook?.entries.length" class="muted">No entries yet.</div>
        <div v-else class="gb-mod">
          <div v-for="e in guestbook.entries" :key="e.id" class="gb-row">
            <div class="gb-body">
              <div class="gb-meta">
                <span class="pill" :class="'pill-' + e.status">{{ e.status }}</span>
                <b>{{ e.name }}</b>
                <span class="muted">{{ new Date(e.createdAt).toLocaleString() }}</span>
                <span v-if="e.flags.length" class="gb-flags" :title="`score ${e.score}`">
                  ⚑ {{ e.flags.join(", ") }}
                </span>
              </div>
              <p class="gb-text">{{ e.message }}</p>
            </div>
            <div class="gb-buttons">
              <button v-if="e.status !== 'approved'" class="btn" @click="moderate(e.id, 'approve')">
                Approve
              </button>
              <button v-if="e.status === 'pending'" class="btn ghost" @click="moderate(e.id, 'reject')">
                Reject
              </button>
              <button class="link danger" @click="removeEntry(e.id)">delete</button>
            </div>
          </div>
        </div>
      </section>
</template>
