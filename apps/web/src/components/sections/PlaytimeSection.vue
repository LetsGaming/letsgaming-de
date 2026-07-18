<script setup lang="ts">
/**
 * The historical playtime module (features 02 + 03).
 *
 * Two views of the past, which is why this is its own module and not more of
 * `presence`: that card is "Right now" — the live dot, the fortnight. This is
 * accumulated history, drawn from data the present-tense card deliberately never
 * reads. Same split the sampler-vs-source distinction drew in the backend.
 *
 * - **The ledger** — exact minutes per day, differenced server-side from Steam's
 *   lifetime counters. Clicking a column fetches that day's breakdown and pins it
 *   against the all-time figures, so a day is always read against the whole.
 * - **The heatmap** — weekday×hour, the same `.heat` component as the contribution
 *   graph, so "when do I play" reads the way "did he commit today" does.
 */
import { computed, ref } from "vue";
import type { PlaytimeDayResponse, ResolvedModule } from "@lg/core";
import { apiUrl } from "../../lib/api";

const props = defineProps<{ module: Extract<ResolvedModule, { kind: "playtime" }> }>();
const d = computed(() => props.module.data);

// ── the ledger strip ─────────────────────────────────────────────────────────

const maxDay = computed(() => Math.max(1, ...d.value.ledger.map((x) => x.minutes)));
const fmtHrs = (min: number) => (min % 60 === 0 ? `${min / 60}h` : `${(min / 60).toFixed(1)}h`);
const fmtDay = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

const todayIso = new Date().toISOString().slice(0, 10);

// The selected day: null = all-time. When set, the drill panel splits and pins
// all-time beside the day.
const selected = ref<string | null>(null);
const dayGames = ref<PlaytimeDayResponse["games"] | null>(null);
const dayLoading = ref(false);
const dayError = ref(false);

async function selectDay(iso: string, minutes: number) {
  if (selected.value === iso) return clear();
  if (minutes === 0) {
    // A day with no play is a real answer; show it without a fetch.
    selected.value = iso;
    dayGames.value = [];
    dayError.value = false;
    return;
  }
  selected.value = iso;
  dayGames.value = null;
  dayError.value = false;
  dayLoading.value = true;
  try {
    const res = await fetch(apiUrl(`/api/playtime/day?day=${iso}`), { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(String(res.status));
    dayGames.value = ((await res.json()) as PlaytimeDayResponse).games;
  } catch {
    dayError.value = true;
  } finally {
    dayLoading.value = false;
  }
}

function clear() {
  selected.value = null;
  dayGames.value = null;
  dayError.value = false;
}

// ── the heatmap ──────────────────────────────────────────────────────────────

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sun"]; // 6 shown; Sat folds visually
// Build a 7×24 grid (Mon-first) from the sparse cells. SQLite %w is Sun=0, so
// rotate to Mon=0.
const HEAT = computed(() => {
  const grid: number[][] = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const c of d.value.heat) {
    const monFirst = (c.weekday + 6) % 7; // Sun=0 → 6, Mon=1 → 0
    grid[monFirst]![c.hour] = c.minutes;
  }
  return grid;
});
const heatMax = computed(() => Math.max(1, ...d.value.heat.map((c) => c.minutes)));
const heatLevel = (min: number) => (min === 0 ? 0 : Math.min(4, Math.ceil((min / heatMax.value) * 4)));

const now = new Date();
const nowHour = now.getHours();
const nowMonFirst = (now.getDay() + 6) % 7;

const hasData = computed(() => d.value.ledger.length > 0 || d.value.heat.length > 0);
</script>

<template>
  <section :id="module.id" class="pt">
    <header class="pt-head">
      <h2 class="pt-title">{{ d.heading }}</h2>
      <span v-if="d.note" class="pt-note">{{ d.note }}</span>
    </header>

    <!-- Empty state: a fresh install has no snapshots to difference and no
         sessions yet. Say so plainly rather than drawing an empty grid. -->
    <p v-if="!hasData" class="pt-empty">
      No playtime recorded yet. Games get tracked as they're played; this fills in
      over the coming days.
    </p>

    <template v-else>
      <!-- ── the ledger ── -->
      <div v-if="d.ledger.length" class="pt-card">
        <div class="pt-card-h">
          <span class="pt-t">Played</span>
          <span class="pt-scope">
            {{ selected ? fmtDay(selected) : `all-time${d.since ? ` · since ${fmtDay(d.since)}` : ""}` }}
          </span>
        </div>

        <div class="pt-ledger" :class="{ sel: selected }">
          <button
            v-for="row in d.ledger"
            :key="row.day"
            class="pt-col"
            :class="{ on: selected === row.day, today: row.day === todayIso }"
            :style="{ height: Math.max(2, (row.minutes / maxDay) * 100) + '%' }"
            :title="`${fmtDay(row.day)} · ${row.minutes ? fmtHrs(row.minutes) : 'nothing'}`"
            @click="selectDay(row.day, row.minutes)"
          />
        </div>
        <div class="pt-axis">
          <span class="pt-m">{{ d.ledger[0] ? fmtDay(d.ledger[0].day) : "" }}</span>
          <span class="pt-m">today</span>
        </div>

        <!-- drill: the day (or all-time) on the left, all-time pinned when a day is up -->
        <div class="pt-drill" :class="{ split: selected }">
          <div class="pt-dcol">
            <div class="pt-dh">{{ selected ? fmtDay(selected) : "All time" }}</div>
            <div class="pt-stats">
              <div class="pt-stat"><b>{{ d.totalHours }} h</b><span>all-time, tracked</span></div>
            </div>
            <div v-if="selected">
              <p v-if="dayLoading" class="pt-dim">Loading…</p>
              <p v-else-if="dayError" class="pt-dim">Couldn't load that day.</p>
              <p v-else-if="dayGames && !dayGames.length" class="pt-dim">Nothing recorded this day.</p>
              <div v-else-if="dayGames" class="pt-dgames">
                <div v-for="g in dayGames" :key="g.name" class="pt-dg">
                  <span class="pt-dg-name">{{ g.name }}</span>
                  <span class="pt-dg-hrs">{{ fmtHrs(g.minutes) }}</span>
                </div>
              </div>
            </div>
          </div>
          <div v-if="selected" class="pt-dcol pt-pin">
            <div class="pt-dh">All time <span class="pt-m">(for comparison)</span></div>
            <div class="pt-stats">
              <div class="pt-stat"><b>{{ d.totalHours }} h</b><span>tracked</span></div>
            </div>
            <button class="pt-clear" @click="clear">← back to all-time</button>
          </div>
        </div>
      </div>

      <!-- ── the heatmap ── -->
      <div v-if="d.heat.length" class="pt-card">
        <div class="pt-card-h">
          <span class="pt-t">When I play</span>
          <span class="pt-scope">local time</span>
        </div>
        <div class="pt-heatwrap">
          <div class="pt-days">
            <span v-for="lbl in DAY_LABELS" :key="lbl" class="pt-m">{{ lbl }}</span>
          </div>
          <div class="pt-heat">
            <template v-for="(row, day) in HEAT" :key="day">
              <i
                v-for="hour in 24"
                :key="`${day}-${hour}`"
                :data-l="heatLevel(row[hour - 1]!) || null"
                :data-now="day === nowMonFirst && hour - 1 === nowHour ? '' : null"
                :title="`${DAY_LABELS[day] ?? ''} ${String(hour - 1).padStart(2, '0')}:00 · ${row[hour - 1] ? fmtHrs(row[hour - 1]!) : 'nothing'}`"
              />
            </template>
          </div>
        </div>
        <div class="pt-axis">
          <span class="pt-m">00:00</span><span class="pt-m">12:00</span><span class="pt-m">23:00</span>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.pt {
  display: flex;
  flex-direction: column;
  gap: var(--sp-16);
}
.pt-head {
  display: flex;
  align-items: baseline;
  gap: var(--sp-10);
}
.pt-title {
  font-family: var(--f-d);
  font-weight: 600;
  font-size: var(--fs-h2);
  color: var(--ink-strong);
}
.pt-note {
  font-size: var(--fs-meta);
  color: var(--muted);
}
.pt-empty {
  color: var(--muted);
  font-size: var(--fs-body);
  padding: var(--sp-16);
  border: 1px dashed var(--line-2);
  border-radius: var(--r-card);
}
.pt-card {
  background: var(--surf-1);
  border: 1px solid var(--line-1);
  border-radius: var(--r-card);
  padding: var(--sp-18);
}
.pt-card-h {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: var(--sp-12);
}
.pt-t {
  font-family: var(--f-m);
  font-size: 11px;
  letter-spacing: 0.11em;
  text-transform: uppercase;
  color: var(--muted);
}
.pt-scope {
  font-family: var(--f-m);
  font-size: var(--fs-micro);
  color: var(--muted);
}
.pt-m {
  font-family: var(--f-m);
  font-size: var(--fs-micro);
  color: var(--muted);
}

/* ledger strip */
.pt-ledger {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  gap: 2px;
  align-items: end;
  height: 72px;
}
.pt-col {
  background: var(--surf-3);
  border: 0;
  border-radius: 2px 2px 0 0;
  padding: 0;
  min-height: 2px;
  cursor: pointer;
  transition: opacity var(--dur-fast) var(--ease-out);
}
.pt-col.today {
  background: var(--live);
}
.pt-ledger.sel .pt-col:not(.on) {
  opacity: 0.4;
}
.pt-col.on {
  outline: 1px solid var(--live);
  outline-offset: 1px;
}
.pt-axis {
  display: flex;
  justify-content: space-between;
  margin-top: var(--sp-6);
}

/* the drill panel */
.pt-drill {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--sp-14);
  margin-top: var(--sp-14);
}
.pt-drill.split {
  grid-template-columns: 1fr 1fr;
}
.pt-dh {
  font-family: var(--f-d);
  font-weight: 600;
  font-size: var(--fs-h3);
  color: var(--ink-strong);
  margin-bottom: var(--sp-8);
}
.pt-pin {
  border-left: 1px solid var(--line-1);
  padding-left: var(--sp-14);
}
.pt-stats {
  display: grid;
  grid-auto-flow: column;
  gap: var(--sp-10);
  justify-content: start;
}
.pt-stat {
  background: var(--surf-2);
  border: 1px solid var(--line-1);
  border-radius: var(--r-control);
  padding: var(--sp-8) var(--sp-12);
}
.pt-stat b {
  font-family: var(--f-m);
  font-size: 19px;
  font-weight: 700;
  color: var(--ink-strong);
  display: block;
}
.pt-stat span {
  font-size: var(--fs-micro);
  color: var(--muted);
}
.pt-dgames {
  margin-top: var(--sp-10);
}
.pt-dg {
  display: flex;
  justify-content: space-between;
  gap: var(--sp-8);
  padding: var(--sp-4) 0;
  font-size: var(--fs-meta);
}
.pt-dg-hrs {
  font-family: var(--f-m);
  font-size: var(--fs-micro);
  color: var(--muted);
}
.pt-dim {
  font-family: var(--f-m);
  font-size: var(--fs-micro);
  color: var(--muted);
  margin-top: var(--sp-10);
}
.pt-clear {
  margin-top: var(--sp-12);
  font: inherit;
  font-size: var(--fs-meta);
  background: none;
  border: 0;
  color: var(--live-ink);
  cursor: pointer;
  padding: 0;
}

/* heatmap — the .heat component's shape */
.pt-heatwrap {
  display: flex;
  gap: var(--sp-8);
}
.pt-days {
  display: grid;
  grid-template-rows: repeat(6, 1fr);
  gap: 3px;
  flex: none;
  padding-top: 1px;
}
.pt-days span {
  line-height: 1;
}
.pt-heat {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(8px, 1fr);
  grid-template-rows: repeat(7, 1fr);
  gap: 3px;
  flex: 1;
  overflow-x: auto;
}
.pt-heat i {
  aspect-ratio: 1;
  border-radius: 3px;
  background: var(--heat-0);
  display: block;
}
.pt-heat i[data-l="1"] { background: var(--heat-1); }
.pt-heat i[data-l="2"] { background: var(--heat-2); }
.pt-heat i[data-l="3"] { background: var(--heat-3); }
.pt-heat i[data-l="4"] { background: var(--heat-4); }
.pt-heat i[data-now] { background: var(--heat-today); }

@media (max-width: 560px) {
  .pt-drill.split {
    grid-template-columns: 1fr;
  }
  .pt-pin {
    border-left: 0;
    border-top: 1px solid var(--line-1);
    padding-left: 0;
    padding-top: var(--sp-12);
  }
}
@media (prefers-reduced-motion: reduce) {
  .pt-col {
    transition: none;
  }
}
</style>
