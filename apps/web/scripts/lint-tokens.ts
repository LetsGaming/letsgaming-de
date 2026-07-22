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
 *
 * The second rule is the mirror image: a raw value that *equals* a token is a
 * token nobody will find. `12px` and `var(--sp-12)` render identically today, so
 * nothing catches the difference — until the scale moves and half the site moves
 * with it. Only exact matches on spacing and font-size are flagged, which keeps
 * this free of judgement calls: a `34px` avatar or a `9px` label has no token to
 * miss and is left alone.
 *
 * Existing but *out of scope* counts as missing. tokens.css keeps a block of
 * legacy aliases scoped to `.cms`, marked "nothing outside cms.css may use
 * these" — and the playtime timezone toggle used four of them anyway. On the
 * public site they resolved to nothing, so the control rendered with no surface,
 * no radius and no fill, and this linter passed it every time because the names
 * do exist. A rule that only asks "is it defined somewhere" can't see that, so
 * the CMS aliases are collected separately and only cms.css and the CMS
 * components may reference them.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

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

const tokensCss = readFileSync(TOKENS, "utf8");

/** Every `.cms { … }` block. There are two, and they do different jobs: one
 *  re-scales shared tokens for the denser admin UI, the other holds legacy
 *  aliases. Only the second defines names that exist nowhere else — so a token is
 *  CMS-only when it appears in a `.cms` block and *not* outside one. Matching
 *  just the first block would misfile every re-scaled global as CMS-only. */
const CMS_BLOCK = /^\.cms\s*\{[\s\S]*?^\}/gm;
const cmsBlocks = tokensCss.match(CMS_BLOCK)?.join("\n") ?? "";
/** Defined at `:root` (or any non-CMS selector) — available site-wide. */
const global = namesIn(tokensCss.replace(CMS_BLOCK, ""), DEF);
const cmsOnly = new Set([...namesIn(cmsBlocks, DEF)].filter((name) => !global.has(name)));

/** Files that actually render inside `.cms`, and so may use those aliases. */
const inCmsScope = (path: string): boolean =>
  path.includes("styles/cms.css") || path.includes(`components${sep}cms${sep}`);

const violations: string[] = [];

/**
 * The public spacing/type scale, value → token, for the raw-literal check.
 *
 * Built from `:root` only. `--sp-18` is 18px on the site and 12px in the CMS, so
 * a table built from the whole file would tell a component to "use --sp-18" for a
 * value that token doesn't have where it renders.
 *
 * `--fs-h3` (16px) is deliberately absent: it's the only token at that value, and
 * a heading token borrowed for avatar initials or body prose is a worse lie than
 * the literal.
 */
const rootCss = tokensCss.replace(CMS_BLOCK, "").replace(/^@media[\s\S]*?^\}/gm, "");
const scaleFor = (prefix: string): Map<string, string> => {
  const out = new Map<string, string>();
  for (const [, name, value] of rootCss.matchAll(
    new RegExp(`(--${prefix}-[a-z0-9]+)\\s*:\\s*([0-9]+px)\\s*;`, "g"),
  )) {
    if (!out.has(value as string)) out.set(value as string, name as string);
  }
  return out;
};
const SPACING_SCALE = scaleFor("sp");
const TYPE_SCALE = new Map([...scaleFor("fs")].filter(([, name]) => name !== "--fs-h3"));

const SPACING_PROPS = /^(padding|margin|gap|row-gap|column-gap)(-top|-bottom|-left|-right)?$/;
/** `padding: 4px 0;` → each part checked separately. */
const DECL = /(?<![\w-])([a-z-]+)\s*:\s*([^;{}]+);/g;

/** Files whose scale is the CMS's, not the site's — skipped by the raw check. */
const usesCmsScale = (path: string): boolean => inCmsScope(path);

for (const file of walk(SRC)) {
  const text = readFileSync(file, "utf8");
  const local = namesIn(text, DEF);
  for (const [, name, dynamic] of text.matchAll(REF)) {
    // `var(--heat-${level})` is assembled at runtime; the literal prefix is all
    // that's readable. Check the prefix names a real family rather than claiming
    // a token called "--heat-" is missing.
    if (dynamic) {
      const reachable = inCmsScope(file) ? [...global, ...local, ...cmsOnly] : [...global, ...local];
      const family = reachable.some((t) => t.startsWith(name as string));
      if (!family) violations.push(`${relative(SRC, file)}  var(${name}\${...}) — no token starts with "${name}"`);
      continue;
    }
    const known = global.has(name as string) || local.has(name as string);
    const cmsAlias = cmsOnly.has(name as string) && inCmsScope(file);
    if (!known && !cmsAlias) {
      const line = text.slice(0, text.indexOf(`var(${name}`)).split("\n").length;
      const why = cmsOnly.has(name as string)
        ? `defined only inside \`.cms\` — out of scope here`
        : "defined nowhere";
      violations.push(`${relative(SRC, file)}:${line}  var(${name}) — ${why}`);
    }
  }
}

// Second pass: raw literals that duplicate a token.
for (const file of walk(SRC)) {
  if (file === TOKENS || usesCmsScale(file)) continue;
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(DECL)) {
    const [, prop, value] = match;
    const scale = SPACING_PROPS.test(prop as string)
      ? SPACING_SCALE
      : prop === "font-size"
        ? TYPE_SCALE
        : null;
    if (!scale || (value as string).includes("var(") || (value as string).includes("clamp(")) continue;
    for (const part of (value as string).trim().split(/\s+/)) {
      const token = scale.get(part);
      if (!token) continue;
      const line = text.slice(0, match.index).split("\n").length;
      violations.push(`${relative(SRC, file)}:${line}  ${prop}: ${part} — that is var(${token})`);
    }
  }
}

if (violations.length) {
  console.error(`✗ token lint: ${violations.length} reference(s) to undefined tokens\n`);
  for (const v of new Set(violations)) console.error(`  ${v}`);
  console.error(
    "\n  A token that resolves to nothing renders as nothing, silently — and a raw" +
      "\n  value that equals a token is a token the next scale change will miss.",
  );
  process.exit(1);
}
console.log(
  `✓ token lint passed — every var(--x) resolves (${global.size} site-wide, ${cmsOnly.size} CMS-only).`,
);
