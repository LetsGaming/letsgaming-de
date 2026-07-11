<script setup lang="ts">
import type { ResolvedModule } from "@lg/core";
import { icons, langColor } from "../../lib/icons";

defineProps<{
  module: Extract<ResolvedModule, { kind: "activity" }>;
  go: (id: string) => void;
  goAnchor?: (target: string) => void;
}>();

const heatVar = (level: number) => `var(--heat-${level})`;
</script>

<template>
  <section class="sec">
    <div class="sec-head rise">
      <h2>{{ module.data.heading }}</h2>
      <span v-if="module.data.note">{{ module.data.note }}</span>
    </div>
    <div class="stats rise">
      <div v-for="(s, i) in module.data.stats" :key="i" class="stat">
        <div class="n">{{ s.value }}<small v-if="s.unit">{{ s.unit }}</small></div>
        <div class="l">{{ s.label }}</div>
      </div>
    </div>
    <div class="dash">
      <div class="box rise">
        <h3>Contributions</h3>
        <div class="sub">last 26 weeks · {{ module.data.contributions.total }} in the window</div>
        <div class="heat">
          <i
            v-for="(lvl, i) in module.data.contributions.levels"
            :key="i"
            :style="{ background: heatVar(lvl) }"
          />
        </div>
        <div class="heat-legend">
          less
          <i v-for="n in [0, 1, 2, 3, 4]" :key="n" :style="{ background: heatVar(n) }" />
          more
        </div>
      </div>
      <div class="box rise">
        <h3>Languages</h3>
        <div class="sub">across all public repos</div>
        <div class="lang">
          <div v-for="l in module.data.languages" :key="l.name" class="row">
            <span class="nm">{{ l.name }}</span>
            <div class="bar"><b :style="{ width: l.pct + '%', background: langColor(l.name) }" /></div>
            <span class="pc">{{ l.pct }}%</span>
          </div>
        </div>
      </div>
    </div>
    <div class="box rise" style="margin-top: 18px">
      <h3>Recent events</h3>
      <div class="sub">newest first</div>
      <div class="feed">
        <div v-for="(e, i) in module.data.events" :key="i" class="ev">
          <span class="ei" v-html="icons[e.type]" />
          <div>
            <div class="et">{{ e.text }}</div>
            <div v-if="e.meta" class="em">{{ e.meta }}</div>
          </div>
          <span class="tm">{{ e.relative }}</span>
        </div>
      </div>
    </div>
  </section>
</template>
