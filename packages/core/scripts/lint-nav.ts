#!/usr/bin/env tsx
/**
 * `pnpm lint:nav` — fails the build if the launch IA breaks any of the §5 rules.
 *
 * Wired into CI and the top-level `build` so the information architecture can't
 * rot silently. Point it at the canonical launch tree + module registry.
 */
import { LAUNCH_MODULE_IDS, LAUNCH_NAV, formatViolation, lintNav } from "../src/index.js";

const result = lintNav(LAUNCH_NAV, { knownModuleIds: LAUNCH_MODULE_IDS });

if (result.ok) {
  console.log("✓ nav lint passed — IA is within the §5 gates.");
  process.exit(0);
}

console.error(`✗ nav lint failed with ${result.violations.length} violation(s):`);
for (const v of result.violations) console.error(formatViolation(v));
process.exit(1);
