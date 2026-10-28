<script setup lang="ts">
import { computed } from "vue";
import type { AnalyticsSections } from "@lg/core";
import { areaScrollFunnels, bucketBars, flowRows, moduleRows, sectionsEmpty } from "../../lib/analytics-view";

const props = defineProps<{
  sections: AnalyticsSections;
  note?: string;
  noteTitle?: string;
}>();

const empty = computed(() => sectionsEmpty(props.sections));
const modules = computed(() => moduleRows(props.sections.modules));
const flows = computed(() => flowRows(props.sections.flow));
const perVisit = computed(() => bucketBars(props.sections.sessionModules));
const scroll = computed(() => areaScrollFunnels(props.sections.scrollDepth));
const pct = (share: number) => `${Math.round(share * 100)}%`;
const histoLabel = (id: string, buckets: { bucket: string; count: number }[]) =>
  `${id} dwell: ${buckets.map((b) => `${b.bucket} ${b.count}`).join(", ")}`;
</script>

<template>
  <div class="card sectionflow">
    <h3>
      Section flow
      <span class="muted">{{ sections.loads.toLocaleString("en-US") }} script loads</span>
      <span v-if="note" class="muted" :title="noteTitle">{{ note }}</span>
    </h3>
    <p v-if="empty" class="muted">
      No section activity recorded in this range. Module tracking starts after the next deploy and
      fills in as visitors scroll the page.
    </p>
    <template v-else>
      <ul class="sf-modules" aria-label="Sections in page order, share of script loads that saw each">
        <li v-for="m in modules" :key="m.id" class="sf-module">
          <div class="sf-head">
            <span class="rowkey">{{ m.label }}</span>
            <span class="muted">{{ m.areaLabel }}</span>
          </div>
          <div class="sf-seen">
            <span class="funnelrow">
              <span class="bar" aria-hidden="true"><i :style="{ width: pct(m.width) }" /></span>
              <b>{{ m.rateText }}</b>
            </span>
            <span class="muted">seen by {{ m.seen.toLocaleString("en-US") }}</span>
          </div>
          <dl class="sf-cols">
            <div>
              <dt>Entries</dt>
              <dd>
                <span class="bar" aria-hidden="true"><i :style="{ width: pct(m.entryWidth) }" /></span>
                <b>{{ m.entries }}</b>
              </dd>
            </div>
            <div>
              <dt>Exits</dt>
              <dd>
                <span class="bar" aria-hidden="true"><i :style="{ width: pct(m.exitWidth) }" /></span>
                <b>{{ m.exits }}</b>
              </dd>
            </div>
          </dl>
          <div class="sf-dwell">
            <div class="histo" role="img" :aria-label="histoLabel(m.label, m.dwell.buckets)">
              <span v-for="b in m.dwell.buckets" :key="b.bucket" class="col" :title="`${b.bucket}: ${b.count}`">
                <i :style="{ height: pct(b.share) }" />
                <small>{{ b.bucket }}</small>
              </span>
            </div>
            <span class="muted">
              <template v-if="m.medianDwellText">median {{ m.medianDwellText }}</template>
              <template v-else>no dwell yet</template>
            </span>
          </div>
        </li>
      </ul>

      <div class="cols sf-extra">
        <div>
          <h4>Top transitions</h4>
          <ul v-if="flows.length" class="sf-flows">
            <li v-for="f in flows" :key="f.label">
              <span class="rowkey">{{ f.label }}</span>
              <b>{{ f.count }}</b>
            </li>
          </ul>
          <p v-else class="muted">Recorded when a visitor moves from one section to the next.</p>
        </div>
        <div>
          <h4>Sections per visit</h4>
          <div
            class="histo"
            role="img"
            :aria-label="`Sections per visit: ${perVisit.map((b) => `${b.bucket} ${b.count}`).join(', ')}`"
          >
            <span v-for="b in perVisit" :key="b.bucket" class="col" :title="`${b.bucket}: ${b.count}`">
              <i :style="{ height: pct(b.share) }" />
              <small>{{ b.bucket }}</small>
            </span>
          </div>
        </div>
        <div>
          <h4>Scroll depth by page</h4>
          <ul v-if="scroll.length" class="funnels">
            <li v-for="fn in scroll" :key="fn.section">
              <div class="funnelhead">
                <span class="rowkey">{{ fn.section }}</span>
                <span class="muted">{{ fn.entered }} views</span>
              </div>
              <div v-for="s in fn.steps" :key="s.depth" class="funnelrow">
                <span class="muted">{{ s.depth }}%</span>
                <span class="bar" aria-hidden="true"><i :style="{ width: pct(s.share) }" /></span>
                <b>{{ s.count }}</b>
              </div>
            </li>
          </ul>
          <p v-else class="muted">Recorded when a visitor scrolls a page to 25, 50, 75 or 100 percent.</p>
        </div>
      </div>
    </template>
  </div>
</template>
