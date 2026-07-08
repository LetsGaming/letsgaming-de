<script setup lang="ts">
import type { ResolvedModule } from "@lg/core";
import { icons, langColor } from "../lib/icons";
import { mdBold } from "../lib/site";
import { trackClick } from "../lib/track";
import ContactForm from "./ContactForm.vue";

const props = defineProps<{
  module: ResolvedModule;
  go: (id: string) => void;
  goAnchor?: (target: string) => void;
}>();

const heatVar = (level: number) => `var(--heat-${level})`;

/** Intercept internal `#anchor` links (e.g. "Get in touch") so they switch to
 *  the tab that holds the target section and scroll to it, instead of no-oping. */
function onLink(e: MouseEvent, href: string) {
  if (href.startsWith("#")) {
    e.preventDefault();
    props.goAnchor?.(href.slice(1));
    trackClick("contact-cta");
  } else {
    trackClick("social");
  }
}
</script>

<template>
  <!-- HERO -->
  <template v-if="module.kind === 'hero'">
    <span class="eyebrow rise">{{ module.data.eyebrow }}</span>
    <h1 class="rise">
      {{ module.data.headline.before
      }}<span class="pop">{{ module.data.headline.highlight }}</span
      >{{ module.data.headline.after }}
    </h1>
    <p class="lede rise" v-html="mdBold(module.data.lede)" />
    <div class="status rise">
      <span class="dot" /> {{ module.data.status.verb }} <b>{{ module.data.status.now }}</b>
    </div>
    <div class="links rise">
      <a
        v-for="l in module.data.links"
        :key="l.id"
        class="btn"
        :class="l.primary ? 'btn-primary' : 'btn-ghost'"
        :href="l.href"
        @click="onLink($event, l.href)"
      >
        <span v-if="l.icon" v-html="icons[l.icon]" />{{ l.label }}
      </a>
    </div>
  </template>

  <!-- FEATURED -->
  <section v-else-if="module.kind === 'featured'" class="sec rise">
    <div class="sec-head">
      <h2>{{ module.data.heading }}</h2>
      <button class="more" @click="() => { trackClick('more'); go('work'); }">see all my work →</button>
    </div>
    <div class="grid">
      <a
        v-if="module.data.project"
        class="card feature"
        :href="module.data.project.href"
        @click="trackClick('featured')"
      >
        <div class="ptitle">
          {{ module.data.project.name }}<span class="arrow" v-html="icons.arrow" />
        </div>
        <span class="tag">{{ module.data.project.tag }}</span>
        <p class="desc">{{ module.data.project.description }}</p>
        <div class="meta">
          <span v-for="(m, i) in module.data.project.meta" :key="i">{{ m }}</span>
        </div>
      </a>
    </div>
  </section>

  <!-- GLANCE -->
  <section v-else-if="module.kind === 'glance'" class="sec rise">
    <div class="sec-head">
      <h2>{{ module.data.heading }}</h2>
      <button class="more" @click="() => { trackClick('more'); go('work'); }">full activity →</button>
    </div>
    <div class="stats">
      <div v-for="(s, i) in module.data.stats" :key="i" class="stat">
        <div class="n">{{ s.value }}<small v-if="s.unit">{{ s.unit }}</small></div>
        <div class="l">{{ s.label }}</div>
      </div>
    </div>
  </section>

  <!-- ACTIVITY -->
  <section v-else-if="module.kind === 'activity'" class="sec">
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

  <!-- PROJECTS -->
  <section v-else-if="module.kind === 'projects'" class="sec">
    <div class="sec-head rise">
      <h2>{{ module.data.heading }}</h2>
      <a
        v-if="module.data.githubUrl"
        class="more"
        :href="module.data.githubUrl"
        target="_blank"
        rel="noreferrer noopener"
        @click="trackClick('github-profile')"
      >all repos on GitHub →</a>
    </div>
    <div class="grid">
      <a
        v-for="p in module.data.projects"
        :key="p.id"
        class="card"
        :class="{ feature: p.featured }"
        :href="p.href"
        @click="trackClick('project')"
      >
        <div class="ptitle">{{ p.name }}<span class="arrow" v-html="icons.arrow" /></div>
        <span class="tag">{{ p.tag }}</span>
        <p class="desc">{{ p.description }}</p>
        <div class="meta"><span v-for="(m, i) in p.meta" :key="i">{{ m }}</span></div>
      </a>
    </div>
  </section>

  <!-- HOBBIES -->
  <section v-else-if="module.kind === 'hobbies'" class="sec">
    <div class="sec-head rise">
      <h2>{{ module.data.heading }}</h2>
      <span v-if="module.data.note">{{ module.data.note }}</span>
    </div>
    <div class="hobbies">
      <div v-for="h in module.data.hobbies" :key="h.id" class="tile" :class="'t-' + h.tone">
        <div>
          <div class="ic" v-html="h.icon ? icons[h.icon] : ''" />
          <h3>{{ h.title }}</h3>
          <p>{{ h.blurb }}</p>
        </div>
      </div>
    </div>
  </section>

  <!-- NOW -->
  <section v-else-if="module.kind === 'now'" class="sec">
    <div class="sec-head rise">
      <h2>{{ module.data.heading }}</h2>
      <span v-if="module.data.note">{{ module.data.note }}</span>
    </div>
    <div class="box rise">
      <div v-for="n in module.data.items" :key="n.id" class="nowrow">
        <span class="k">{{ n.key }}</span>
        <span class="v" v-html="mdBold(n.value)" />
      </div>
    </div>
  </section>

  <!-- BIO -->
  <section v-else-if="module.kind === 'bio'" class="sec">
    <div class="sec-head rise">
      <h2>{{ module.data.heading }}</h2>
      <span v-if="module.data.note">{{ module.data.note }}</span>
    </div>
    <div class="prose rise">
      <p v-for="(p, i) in module.data.paragraphs" :key="i" v-html="mdBold(p)" />
    </div>
  </section>

  <!-- CONTACT -->
  <section v-else-if="module.kind === 'contact'" id="contact" class="sec">
    <div class="sec-head rise"><h2>{{ module.data.heading }}</h2></div>
    <div
      v-if="module.data.links.filter((l) => !l.href.startsWith('#')).length"
      class="links rise"
    >
      <a
        v-for="l in module.data.links.filter((l) => !l.href.startsWith('#'))"
        :key="l.id"
        class="btn"
        :class="l.primary ? 'btn-primary' : 'btn-ghost'"
        :href="l.href"
        target="_blank"
        rel="noreferrer noopener"
        @click="trackClick('social')"
      >
        <span v-if="l.icon" v-html="icons[l.icon]" />{{ l.label }}
      </a>
    </div>
    <div class="rise" style="margin-top: 20px"><ContactForm /></div>
  </section>
</template>
