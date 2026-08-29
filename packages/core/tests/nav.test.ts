import assert from "node:assert/strict";
import { test } from "node:test";
import { en } from "../src/i18n.js";
import { areaHref, targetHref, type NavNode } from "../src/nav.js";

const FLAT: NavNode[] = [
  { id: "home", label: en("Home"), modules: ["hero", "contact"] },
  { id: "about", label: en("About"), modules: ["bio"] },
];

const NESTED: NavNode[] = [
  { id: "home", label: en("Home"), modules: ["hero"] },
  {
    id: "life",
    label: en("Life"),
    children: [
      { id: "hobbies", label: en("Hobbies"), modules: ["hobbies-list"] },
      { id: "gallery", label: en("Gallery"), modules: ["gallery-grid"] },
    ],
  },
];

test("targetHref resolves a module on a flat (top-level) leaf", () => {
  // "home" is nav[0], the site root — areaHref maps it to "/", not "/home".
  assert.equal(targetHref(FLAT, "contact"), "/#contact");
});

test("areaHref: the first nav entry is the site root", () => {
  assert.equal(areaHref(FLAT, "home"), "/");
  assert.equal(areaHref(FLAT, "about"), "/about");
});

test("targetHref resolves a module nested inside a branch's child leaf", () => {
  // Before the fix this fell through to the inert `#gallery-grid` fallback:
  // the flat `.find()` only ever looked at the top-level array.
  assert.equal(targetHref(NESTED, "gallery-grid"), "/life#gallery-grid");
  assert.equal(targetHref(NESTED, "hobbies-list"), "/life#hobbies-list");
});

test("targetHref resolves a nested branch's own id to its top-level ancestor's href", () => {
  // "hobbies" isn't a route itself (only the top-level "life" is) — the
  // resolved href must be the top-level area, not `/hobbies`.
  assert.equal(targetHref(NESTED, "hobbies"), "/life");
});

test("targetHref resolves a top-level area id unaffected by nesting elsewhere", () => {
  assert.equal(targetHref(NESTED, "life"), "/life");
});

test("targetHref falls back to an inert anchor for an unknown target", () => {
  assert.equal(targetHref(NESTED, "nowhere"), "#nowhere");
});
