<script setup lang="ts">
/**
 * The generated API reference, rendered from `openapi.yml`.
 *
 * The sidebar, mobile topbar and drawer are `DocsShell` — the same component the
 * markdown docs use. Under Astro that markup was duplicated between the two docs
 * routes; the only genuinely page-specific part is the in-page jump list, which
 * goes in the shell's `nav-extra` slot.
 */
import DocsShell from "~/components/docs/DocsShell.vue";
import SmartLink from "~/components/ui/SmartLink.vue";

const { data } = await useFetch("/api/openapi");

useHead(() => ({ title: `API reference — ${data.value?.ref.info.title ?? "API"}` }));

/**
 * Minimal, safe inline markdown for the spec's authored descriptions (our own
 * file, not user input). Escapes first, then applies bold/code/link/`##` — enough
 * for the prose in openapi.yml without pulling in a markdown renderer.
 */
function renderProse(md: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s: string) =>
    esc(s)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  return md
    .trim()
    .split(/\n{2,}/)
    .map((block) => {
      const h = block.match(/^##\s+(.+)$/);
      if (h) return `<h4>${inline(h[1]!)}</h4>`;
      return `<p>${inline(block.replace(/\n/g, " "))}</p>`;
    })
    .join("");
}

/** Anchor-safe id for a tag/operation. */
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const opId = (method: string, path: string) => `op-${method.toLowerCase()}-${slugify(path)}`;
</script>

<template>
  <DocsShell v-if="data" :tree="data.tree" active="api">
    <!-- In-page jump list for the API groups. -->
    <template #nav-extra>
      <div class="doc-group api-toc">
        <h4>On this page</h4>
        <ul>
          <li v-for="g in data.ref.groups" :key="g.tag">
            <SmartLink :href="`#${slugify(g.tag)}`">{{ g.tag }}</SmartLink>
          </li>
          <li><SmartLink href="#schemas">Schemas</SmartLink></li>
        </ul>
      </div>
    </template>

    <article class="doc-body prose api">
      <header class="api-head">
        <div class="api-title-row">
          <h1>{{ data.ref.info.title }}</h1>
          <span class="api-ver">v{{ data.ref.info.version }}</span>
        </div>
        <div class="api-intro" v-html="renderProse(data.ref.info.description)" />
        <div v-if="data.ref.servers.length" class="api-servers">
          <div v-for="s in data.ref.servers" :key="s.url" class="api-server">
            <code>{{ s.url }}</code>
            <span>{{ s.description }}</span>
          </div>
        </div>
      </header>

      <section v-for="group in data.ref.groups" :key="group.tag" class="api-group" :id="slugify(group.tag)">
        <h2>{{ group.tag }}</h2>
        <p v-if="group.description" class="api-group-desc">{{ group.description }}</p>

        <div v-for="op in group.operations" :key="opId(op.method, op.path)" class="api-op" :id="opId(op.method, op.path)">
          <div class="api-op-head">
            <span class="api-verb" :data-method="op.method">{{ op.method }}</span>
            <code class="api-path">{{ op.path }}</code>
            <span :class="op.public ? 'api-auth pub' : 'api-auth'">{{ op.public ? "public" : "CMS auth" }}</span>
          </div>
          <p v-if="op.summary" class="api-summary">{{ op.summary }}</p>
          <div v-if="op.description" class="api-desc" v-html="renderProse(op.description)" />

          <div v-if="op.parameters.length" class="api-block">
            <h5>Parameters</h5>
            <table class="api-table">
              <thead><tr><th>Name</th><th>In</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
              <tbody>
                <tr v-for="p in op.parameters" :key="`${p.location}-${p.name}`">
                  <td><code>{{ p.name }}</code></td>
                  <td>{{ p.location }}</td>
                  <td><code>{{ p.type }}</code></td>
                  <td>{{ p.required ? "yes" : "no" }}</td>
                  <td>{{ p.description }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div v-if="op.requestContentTypes.length" class="api-block">
            <h5>Request body</h5>
            <p class="api-mini"><code v-for="c in op.requestContentTypes" :key="c">{{ c }}</code></p>
          </div>

          <div class="api-block">
            <h5>Responses</h5>
            <table class="api-table">
              <thead><tr><th>Status</th><th>Body</th><th>Description</th></tr></thead>
              <tbody>
                <tr v-for="r in op.responses" :key="r.status">
                  <td><span class="api-status" :data-ok="r.status.startsWith('2') ? '' : null">{{ r.status }}</span></td>
                  <td>
                    <SmartLink v-if="r.schema" :href="`#schema-${r.schema}`"><code>{{ r.schema }}</code></SmartLink>
                    <span v-else class="api-dim">—</span>
                  </td>
                  <td>{{ r.description }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section class="api-group" id="schemas">
        <h2>Schemas</h2>
        <p class="api-group-desc">
          Response and request shapes referenced above. Larger CMS shapes are defined once in
          TypeScript (<code>@lg/core</code>) and referenced by name.
        </p>
        <div v-for="s in data.ref.schemas" :key="s.name" class="api-op api-schema" :id="`schema-${s.name}`">
          <div class="api-op-head"><code class="api-path">{{ s.name }}</code></div>
          <p v-if="s.description" class="api-summary">{{ s.description }}</p>
          <table v-if="s.fields.length" class="api-table">
            <thead><tr><th>Field</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
            <tbody>
              <tr v-for="f in s.fields" :key="f.name">
                <td><code>{{ f.name }}</code></td>
                <td><code>{{ f.type }}</code></td>
                <td>{{ f.required ? "yes" : "no" }}</td>
                <td>{{ f.description }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </article>
  </DocsShell>
</template>

<style scoped>
/* Scoped API-reference styling. Colours come from tokens; the per-verb badge
   hues are the one set of named locals (there are no method tokens site-wide).
   Chosen medium-dark so white badge text stays legible on both themes.
   Astro's `:global()` becomes Vue's `:deep()` — needed for the v-html prose,
   which carries no scope attribute. */
.api {
  --m-get: #2e9e6b;
  --m-post: #6544c4;
  --m-put: #b9822a;
  --m-patch: #2c8d9c;
  --m-delete: #c0483f;
}
.api :deep(h1) {
  margin: 0;
}
.api-head {
  padding-bottom: var(--sp-16);
  border-bottom: 1px solid var(--line-1);
  margin-bottom: var(--sp-24);
}
.api-title-row {
  display: flex;
  align-items: baseline;
  gap: var(--sp-10);
  flex-wrap: wrap;
}
.api-ver {
  font-family: var(--f-m);
  font-size: var(--fs-meta);
  color: var(--live-ink);
  background: color-mix(in srgb, var(--live-ink) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--live-ink) 30%, transparent);
  border-radius: var(--r-chip);
  padding: 2px var(--sp-8);
}
.api-intro :deep(p) {
  color: var(--ink);
}
.api-intro :deep(h4) {
  font-family: var(--f-d);
  font-size: var(--fs-h3);
  color: var(--ink-strong);
  margin: var(--sp-18) 0 var(--sp-6);
}
.api-servers {
  display: flex;
  flex-direction: column;
  gap: var(--sp-6);
  margin-top: var(--sp-16);
}
.api-server {
  display: flex;
  align-items: baseline;
  gap: var(--sp-10);
  flex-wrap: wrap;
}
.api-server code {
  background: var(--surf-2);
  border: 1px solid var(--line-1);
  border-radius: var(--r-chip);
  padding: 2px var(--sp-8);
  font-size: var(--fs-meta);
}
.api-server span {
  color: var(--muted);
  font-size: var(--fs-meta);
}

.api-group {
  margin-top: var(--sp-24);
  scroll-margin-top: var(--sp-16);
}
.api-group > :deep(h2) {
  font-family: var(--f-d);
  font-size: var(--fs-h2);
  color: var(--ink-strong);
  padding-bottom: var(--sp-6);
  border-bottom: 2px solid var(--line-2);
}
.api-group-desc {
  color: var(--muted);
}

.api-op {
  border: 1px solid var(--line-1);
  border-radius: var(--r-card);
  background: var(--surf-1);
  padding: var(--sp-16) var(--sp-18);
  margin: var(--sp-16) 0;
  scroll-margin-top: var(--sp-16);
}
.api-op-head {
  display: flex;
  align-items: center;
  gap: var(--sp-10);
  flex-wrap: wrap;
}
.api-verb {
  font-family: var(--f-m);
  font-weight: 700;
  font-size: var(--fs-micro);
  letter-spacing: 0.04em;
  color: #fff;
  border-radius: var(--r-chip);
  padding: 3px var(--sp-8);
  background: var(--m-get);
}
.api-verb[data-method="POST"] { background: var(--m-post); }
.api-verb[data-method="PUT"] { background: var(--m-put); }
.api-verb[data-method="PATCH"] { background: var(--m-patch); }
.api-verb[data-method="DELETE"] { background: var(--m-delete); }
.api-path {
  font-family: var(--f-m);
  font-size: var(--fs-body);
  color: var(--ink-strong);
  word-break: break-all;
}
.api-auth {
  margin-left: auto;
  font-family: var(--f-m);
  font-size: var(--fs-micro);
  color: var(--muted);
  border: 1px solid var(--line-2);
  border-radius: var(--r-chip);
  padding: 1px var(--sp-6);
}
.api-auth.pub {
  color: var(--m-get);
  border-color: color-mix(in srgb, var(--m-get) 40%, transparent);
}
.api-summary {
  margin: var(--sp-10) 0 0;
  color: var(--ink-strong);
  font-weight: 600;
}
.api-desc :deep(p) {
  margin: var(--sp-8) 0 0;
  color: var(--ink);
  font-size: var(--fs-meta);
}
.api-desc :deep(code),
.api-server code,
.api-path,
.api-table code {
  font-family: var(--f-m);
}

.api-block {
  margin-top: var(--sp-14);
}
.api-block h5 {
  font-family: var(--f-m);
  font-size: var(--fs-micro);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
  margin: 0 0 var(--sp-6);
}
.api-mini code {
  background: var(--surf-2);
  border: 1px solid var(--line-1);
  border-radius: var(--r-chip);
  padding: 1px var(--sp-6);
  font-size: var(--fs-micro);
  margin-right: var(--sp-6);
}

.api-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--fs-meta);
}
.api-table th {
  text-align: left;
  font-family: var(--f-m);
  font-size: var(--fs-micro);
  color: var(--muted);
  font-weight: 600;
  padding: var(--sp-4) var(--sp-8);
  border-bottom: 1px solid var(--line-2);
}
.api-table td {
  padding: var(--sp-6) var(--sp-8);
  border-bottom: 1px solid var(--line-1);
  vertical-align: top;
  color: var(--ink);
}
.api-table tr:last-child td {
  border-bottom: none;
}
.api-table code {
  font-size: var(--fs-micro);
  color: var(--ink-strong);
}
.api-status {
  font-family: var(--f-m);
  font-weight: 700;
  color: var(--muted);
}
.api-status[data-ok] {
  color: var(--m-get);
}
.api-dim {
  color: var(--muted);
}
.api-toc :deep(a) {
  font-size: var(--fs-micro);
}
</style>
