/**
 * Build-time design lint: the rules in DESIGN.md that a grep can decide.
 *
 *   pnpm --filter=@lg/web lint:design
 *
 * Why: the 2026-11-18 redesign critique found every rule here broken in the
 * shipped code (mono labels in 18 files, middle-dot chains in 9 places, the
 * accent on a chart ramp) while every other gate was green. Same idea as
 * `lint-tokens.ts`: a check the build runs, not discipline.
 *
 * Two of the rules are ratchets. Mono and accent uses are counted per file;
 * a file may stay at its allowance and may never exceed it. Raising an
 * allowance is a visible, reviewable edit to this file.
 *
 * Comment dashes are checked by `lint-dashes.ts`, which runs after this.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { checkPublicFile, type Violation } from "./design-rules.js";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const WEB_SRC = join(ROOT, "apps/web/src");
const EXT = /\.(css|vue|ts)$/;
const SKIP_DIRS = new Set(["node_modules", ".nuxt", ".output", "dist", "cms", "server", "data"]);
const SKIP_FILES = new Set(["styles/tokens.css", "styles/cms.css"]);
/** Strings that render on public pages but live outside apps/web/src. */
const EXTRA_FILES = ["packages/core/src/ui-messages.ts", "packages/core/src/resolve.ts"];

/**
 * Files allowed to use the mono face, and how many times. Mono marks a synced
 * number or a timestamp. A caption, a label or a sentence uses the body face.
 */
const MONO_MAX: Record<string, number> = {
  "apps/web/src/components/sections/ActivitySection.vue": 1, // relative age of an event
  "apps/web/src/components/sections/GlanceSection.vue": 1, // relative age
  "apps/web/src/components/sections/GuestbookSection.vue": 1, // entry age
  "apps/web/src/components/sections/HeroSection.vue": 1, // wave count
  "apps/web/src/components/sections/PlaytimeSection.vue": 1, // hour axis ticks
  "apps/web/src/components/sections/PostsSection.vue": 1, // post date
  "apps/web/src/components/ui/LanguageBars.vue": 1, // percentages
  "apps/web/src/components/ui/RankedRow.vue": 1, // row value
  "apps/web/src/pages/docs/api.vue": 6, // API reference: code, verbs, paths
  "apps/web/src/styles/app.css": 2, // code in prose and docs
  "apps/web/src/error.vue": 1, // the status code
};

/**
 * Files allowed to use the accent, and how many times. The accent means "now":
 * live data, the one primary action, the focus ring.
 */
const ACCENT_MAX: Record<string, number> = {
  "apps/web/src/components/presence/PresenceWidget.vue": 1, // live game activity
  "apps/web/src/components/sections/HeroSection.vue": 2, // live presence dot
  "apps/web/src/components/ui/CardHeader.vue": 1, // is-live note variant
  "apps/web/src/components/ui/HeatGrid.vue": 1, // keyboard focus ring
  "apps/web/src/styles/app.css": 2, // primary button, focus ring
  "apps/web/src/error.vue": 1, // the one primary button
};

/** The legal text writes a menu path with an arrow. It is the owner's wording. */
const ARROW_ALLOWED = new Set(["apps/web/src/pages/datenschutz.vue"]);

const walk = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (EXT.test(entry)) out.push(path);
  }
  return out;
};

const rel = (file: string): string => relative(ROOT, file).split(sep).join("/");

const files = [...walk(WEB_SRC), ...EXTRA_FILES.map((f) => join(ROOT, f))].filter(
  (f) => !SKIP_FILES.has(relative(WEB_SRC, f).split(sep).join("/")),
);

const failures: string[] = [];
for (const file of files) {
  const path = rel(file);
  const found: Violation[] = checkPublicFile({
    path,
    text: readFileSync(file, "utf8"),
    monoMax: MONO_MAX[path] ?? 0,
    accentMax: ACCENT_MAX[path] ?? 0,
    allowArrow: ARROW_ALLOWED.has(path),
  });
  for (const v of found) failures.push(`${path}${v.line ? `:${v.line}` : ""}  [${v.rule}] ${v.text}`);
}

if (failures.length) {
  console.error(`✗ design lint: ${failures.length} violation(s)\n`);
  for (const f of failures) console.error(`  ${f}`);
  console.error("\n  These are rules from apps/web/DESIGN.md. Fix the code, or change the rule there first.");
  process.exit(1);
}
console.log(`✓ design lint passed (${files.length} files).`);
