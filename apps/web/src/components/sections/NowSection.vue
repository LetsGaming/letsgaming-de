<script setup lang="ts">
import type { ResolvedModule } from "@lg/core";
import { mdBold } from "../../lib/site";

defineProps<{
  module: Extract<ResolvedModule, { kind: "now" }>;
  go: (id: string) => void;
}>();
</script>

<template>
  <section class="sec">
    <div class="sec-head">
      <h2>{{ module.data.heading }}</h2>
      <span v-if="module.data.note">{{ module.data.note }}</span>
    </div>
    <div class="box">
      <p v-if="!module.data.items.length" class="sub">Nothing written here lately.</p>
      <div v-for="n in module.data.items" :key="n.id" class="nowrow">
        <span class="k">{{ n.key }}</span>
        <span class="v" v-html="mdBold(n.value)" />
      </div>
    </div>
  </section>
</template>
