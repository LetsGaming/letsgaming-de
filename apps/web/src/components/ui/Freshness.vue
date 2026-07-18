<script setup lang="ts">
import type { FreshnessView } from "@lg/core";

/**
 * A synced module's own age, said out loud.
 *
 * The site's claim is that it updates itself, so the worst available bug is
 * rendering old data as current — that's the failure mode ("it goes stale")
 * wearing the success state. Only `fresh` gets the accent and the pulse: purple
 * means now, and stale isn't now.
 */
defineProps<{ freshness?: FreshnessView }>();
</script>

<template>
  <span v-if="freshness" class="fresh" :class="'fr-' + freshness.state">
    <span v-if="freshness.state === 'fresh'" class="dot" />
    <template v-if="freshness.state === 'fresh'">synced {{ freshness.relative }} ago</template>
    <template v-else-if="freshness.state === 'stale'">{{ freshness.relative }} old</template>
    <template v-else-if="freshness.state === 'failed'">
      sync failed · showing {{ freshness.relative }} old
    </template>
    <template v-else-if="freshness.state === 'never'">not synced yet</template>
    <template v-else>nothing synced</template>
  </span>
</template>
