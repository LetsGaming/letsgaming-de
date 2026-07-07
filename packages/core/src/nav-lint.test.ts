import assert from "node:assert/strict";
import { test } from "node:test";
import { en } from "./i18n.js";
import { LAUNCH_MODULE_IDS, LAUNCH_NAV } from "./ia.js";
import { lintNav } from "./nav-lint.js";
import type { NavNode } from "./nav.js";

test("the launch IA passes clean", () => {
  const r = lintNav(LAUNCH_NAV, { knownModuleIds: LAUNCH_MODULE_IDS });
  assert.equal(r.ok, true, JSON.stringify(r.violations, null, 2));
});

test("flags a branch with more than 5 children", () => {
  const wide: NavNode[] = [
    {
      id: "root",
      label: en("Root"),
      children: Array.from({ length: 6 }, (_, i) => ({
        id: `c${i}`,
        label: en(`C${i}`),
        modules: ["m"],
      })),
    },
  ];
  const r = lintNav(wide);
  assert.ok(r.violations.some((v) => v.code === "MAX_CHILDREN"));
});

test("flags a single-child branch (thin branch)", () => {
  const thin: NavNode[] = [
    { id: "root", label: en("Root"), children: [{ id: "only", label: en("Only"), modules: ["m"] }] },
  ];
  const r = lintNav(thin);
  assert.ok(r.violations.some((v) => v.code === "THIN_BRANCH"));
});

test("flags an empty leaf", () => {
  const r = lintNav([{ id: "empty", label: en("Empty"), modules: [] }]);
  assert.ok(r.violations.some((v) => v.code === "EMPTY_LEAF"));
});

test("flags a node that is both leaf and branch", () => {
  const both: NavNode[] = [
    {
      id: "x",
      label: en("X"),
      modules: ["m"],
      children: [
        { id: "a", label: en("A"), modules: ["m"] },
        { id: "b", label: en("B"), modules: ["m"] },
      ],
    },
  ];
  const r = lintNav(both);
  assert.ok(r.violations.some((v) => v.code === "LEAF_AND_BRANCH"));
});

test("flags depth beyond 3", () => {
  const deep: NavNode[] = [
    {
      id: "l1",
      label: en("1"),
      children: [
        {
          id: "l2",
          label: en("2"),
          children: [
            {
              id: "l3",
              label: en("3"),
              children: [
                { id: "l4a", label: en("4a"), modules: ["m"] },
                { id: "l4b", label: en("4b"), modules: ["m"] },
              ],
            },
            { id: "l3b", label: en("3b"), modules: ["m"] },
          ],
        },
        { id: "l2b", label: en("2b"), modules: ["m"] },
      ],
    },
  ];
  const r = lintNav(deep);
  assert.ok(r.violations.some((v) => v.code === "MAX_DEPTH"));
});

test("flags dangling and orphan modules against a registry", () => {
  const nav: NavNode[] = [{ id: "home", label: en("Home"), modules: ["ghost"] }];
  const r = lintNav(nav, { knownModuleIds: ["real"] });
  assert.ok(r.violations.some((v) => v.code === "DANGLING_MODULE" && v.at === "ghost"));
  assert.ok(r.violations.some((v) => v.code === "ORPHAN_MODULE" && v.at === "real"));
});

test("flags duplicate ids", () => {
  const dup: NavNode[] = [
    { id: "dup", label: en("A"), modules: ["m"] },
    { id: "dup", label: en("B"), modules: ["m"] },
  ];
  const r = lintNav(dup);
  assert.ok(r.violations.some((v) => v.code === "DUPLICATE_ID"));
});
