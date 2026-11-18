/**
 * Comment dash ratchet.
 *
 *   pnpm --filter=@lg/web lint:design                  check (runs after lint-design)
 *   tsx scripts/lint-dashes.ts --write-baseline        record the current counts
 *   tsx scripts/lint-dashes.ts --fix <path> [<path>]   rewrite comment dashes in those files
 *
 * The house rule is no em or en dashes anywhere, comments included. About 970
 * comment lines in 184 files predate the rule, so this does not fail on them. It
 * fails when a file has more of them than `dash-baseline.json` allows, so none
 * can be added. A file a change touches gets cleaned with `--fix` in the same
 * commit, which lowers its allowance to zero. When the baseline is empty, delete
 * it: the check then allows nothing.
 *
 * `--fix` rewrites comments only, never strings or markup. A spaced dash becomes a
 * comma, a digit range becomes "to". Read the diff: a comma is not always the
 * right word.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { dashLines, fixComments } from "./design-rules.js";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const BASELINE = join(ROOT, "apps/web/scripts/dash-baseline.json");
const DIRS = [
  "apps/web/src",
  "apps/web/scripts",
  "apps/web/tests",
  "packages/core/src",
  "packages/db/src",
  "packages/sources/src",
  "apps/server/src",
  "apps/server/scripts",
];
const EXT = /\.(ts|vue|css|mjs)$/;
const SKIP = new Set(["node_modules", ".nuxt", ".output", "dist", "data"]);

const walk = (dir: string, out: string[] = []): string[] => {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (EXT.test(entry)) out.push(path);
  }
  return out;
};

const rel = (file: string): string => relative(ROOT, file).split(sep).join("/");
const counts = (): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const dir of DIRS) {
    for (const file of walk(join(ROOT, dir))) {
      const n = dashLines(readFileSync(file, "utf8")).length;
      if (n) out[rel(file)] = n;
    }
  }
  return out;
};
const readBaseline = (): Record<string, number> =>
  existsSync(BASELINE) ? (JSON.parse(readFileSync(BASELINE, "utf8")) as Record<string, number>) : {};
const writeBaseline = (data: Record<string, number>): void => {
  const sorted = Object.fromEntries(Object.entries(data).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(BASELINE, JSON.stringify(sorted, null, 2) + "\n");
};

const args = process.argv.slice(2);

if (args[0] === "--write-baseline") {
  const now = counts();
  writeBaseline(now);
  const total = Object.values(now).reduce((a, b) => a + b, 0);
  console.log(`✓ wrote baseline: ${total} comment lines in ${Object.keys(now).length} files.`);
  process.exit(0);
}

if (args[0] === "--fix") {
  const targets = args.slice(1);
  if (!targets.length) {
    console.error("usage: lint-dashes.ts --fix <path> [<path>...]");
    process.exit(1);
  }
  const baseline = readBaseline();
  for (const target of targets) {
    const file = isAbsolute(target) ? target : resolve(ROOT, target);
    const before = readFileSync(file, "utf8");
    const after = fixComments(before);
    if (after !== before) writeFileSync(file, after);
    delete baseline[rel(file)];
    console.log(`fixed ${rel(file)} (${dashLines(before).length} comment lines)`);
  }
  writeBaseline(baseline);
  process.exit(0);
}

const baseline = readBaseline();
const now = counts();
const failures = Object.entries(now)
  .filter(([file, n]) => n > (baseline[file] ?? 0))
  .map(([file, n]) => `${file}  ${n} comment line(s) with a dash, allowance ${baseline[file] ?? 0}`);

if (failures.length) {
  console.error(`✗ dash lint: ${failures.length} file(s) over their allowance\n`);
  for (const f of failures) console.error(`  ${f}`);
  console.error("\n  No em or en dashes in comments. Rewrite them, or run: tsx scripts/lint-dashes.ts --fix <file>");
  process.exit(1);
}
const left = Object.values(now).reduce((a, b) => a + b, 0);
console.log(`✓ dash lint passed (${left} legacy comment lines remain in ${Object.keys(now).length} files).`);
