<script setup lang="ts">
import type { FreshnessState, FreshnessView, MessageKey } from "@lg/core";
import { useT } from "~/composables/useT";

/**
 * A synced module's own age, said out loud, when it is not current.
 *
 * The site's claim is that it updates itself, so the worst available bug is
 * rendering old data as current. Fresh data says nothing here (the page-level
 * "synced" line already says it, once). This marker speaks only for stale, failed,
 * never and empty, so it is a signal and not a repeated label. Purple means now,
 * so none of these states uses the accent.
 *
 * The five states were a five-branch `v-if` ladder of hardcoded English, the
 * component sits in six modules, so it was the site's most-rendered untranslated
 * string. A `state → MessageKey` map is both the fix and the shape the branch
 * ladder wanted: typing it as `Record<FreshnessState, …>` makes a new state a
 * compile error here rather than a silently empty span.
 */
defineProps<{ freshness?: FreshnessView }>();

const { t } = useT();

const MESSAGE: Record<FreshnessState, MessageKey> = {
  fresh: "freshFresh",
  stale: "freshStale",
  failed: "freshFailed",
  never: "freshNever",
  empty: "freshEmpty",
};
</script>

<template>
  <span v-if="freshness && freshness.state !== 'fresh'" class="fresh" :class="'fr-' + freshness.state">
    {{ t(MESSAGE[freshness.state], { age: freshness.relative ?? "" }) }}
  </span>
</template>
