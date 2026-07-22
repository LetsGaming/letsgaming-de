/**
 * Build-time token lint.
 *
 * CSS never errors. A `var(--gone)` referencing a token nobody defines resolves
 * to nothing, the stylesheet stays valid, and typecheck, tests and build all
 * pass while the page renders wrong. That's how twelve dead references across
 * six files survived a token rename: every gate was green the whole time, and
 * the only thing that caught it was reading a file for an unrelated reason.
 *
 * So: every `var(--x)` must resolve to a `--x:` defined either in tokens.css or
 * in the same file. Same shape as `lint:nav` — a pure check the build runs, not
 * discipline.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Nuxt has no `src/` dir — components, pages, layouts and styles sit at the app
// root, so the scan starts there. Build output and deps are skipped below.
const SRC = new URL("..", import.meta.url).pathname;
const TOKENS = join(SRC, "src/styles/tokens.css");
const EXT = /\.(css|vue|ts)$/;

/** `--name:` — a definition. Excludes `var(--name)`, which is a reference.
 *  The optional quote catches custom properties set from an inline style object
 *  (`:style="{ '--bar': x }"`), which is a real way to pass a value into CSS and
 *  not something the stylesheet can be expected to declare. */
const DEF = /(?<!var\(\s*)(--[a-z0-9-]+)['"]?\s*:/gi;
/** `var(--name)` or `var(--name, fallback)` — a reference. */
const REF = /var\(\s*(--[a-z0-9-]+)(\$\{)?/gi;

const namesIn = (text: string, re: RegExp): Set<string> =>
  new Set(Array.from(text.matchAll(re), (m) => m[1] as string));

// Scanning from the app root means the walk would otherwise descend into
// dependencies and build output, which define thousands of unrelated custom
// properties (and are not ours to lint).
// `scripts` is Node tooling that never ships CSS — and this linter's own
// docstring contains an example `var()` that would otherwise flag itself.
const SKIP = new Set(["node_modules", ".nuxt", ".output", "dist", ".git", "scripts"]);

const walk = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (EXT.test(entry)) out.push(path);
  }
  return out;
};

const global = namesIn(readFileSync(TOKENS, "utf8"), DEF);
const violations: string[] = [];

for (const file of walk(SRC)) {
  const text = readFileSync(file, "utf8");
  const local = namesIn(text, DEF);
  for (const [, name, dynamic] of text.matchAll(REF)) {
    // `var(--heat-${level})` is assembled at runtime; the literal prefix is all
    // that's readable. Check the prefix names a real family rather than claiming
    // a token called "--heat-" is missing.
    if (dynamic) {
      const family = [...global, ...local].some((t) => t.startsWith(name as string));
      if (!family) violations.push(`${relative(SRC, file)}  var(${name}\${...}) — no token starts with "${name}"`);
      continue;
    }
    if (!global.has(name as string) && !local.has(name as string)) {
      const line = text.slice(0, text.indexOf(`var(${name}`)).split("\n").length;
      violations.push(`${relative(SRC, file)}:${line}  var(${name}) — defined nowhere`);
    }
  }
}

if (violations.length) {
  console.error(`✗ token lint: ${violations.length} reference(s) to undefined tokens\n`);
  for (const v of new Set(violations)) console.error(`  ${v}`);
  console.error("\n  A token that resolves to nothing renders as nothing, silently.");
  process.exit(1);
}
console.log(`✓ token lint passed — every var(--x) resolves (${global.size} tokens defined).`);
