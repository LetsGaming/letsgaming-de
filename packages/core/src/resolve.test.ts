import assert from "node:assert/strict";
import { test } from "node:test";
import { safeHref } from "./resolve.js";

test("safeHref passes through http(s), mailto, and site-relative URLs", () => {
  assert.equal(safeHref("https://example.com/x"), "https://example.com/x");
  assert.equal(safeHref("http://example.com"), "http://example.com");
  assert.equal(safeHref("mailto:me@example.com"), "mailto:me@example.com");
  assert.equal(safeHref("/work"), "/work");
});

test("safeHref neutralizes script-bearing and unknown schemes (SEC-04)", () => {
  assert.equal(safeHref("javascript:alert(1)"), "#");
  assert.equal(safeHref("JavaScript:alert(1)"), "#");
  assert.equal(safeHref("data:text/html,<script>alert(1)</script>"), "#");
  assert.equal(safeHref("  javascript:alert(1)  "), "#");
  assert.equal(safeHref(undefined), "#");
  assert.equal(safeHref(""), "#");
});
