import assert from "node:assert/strict";
import { test } from "node:test";
import { scoreEntry } from "../src/guestbook.js";

test("a clean, friendly message scores zero and flags nothing", () => {
  const r = scoreEntry("Alex", "Love the site — the plant tracker is a neat idea!");
  assert.equal(r.score, 0);
  assert.deepEqual(r.flags, []);
});

test("links raise the score and flag", () => {
  const one = scoreEntry("Bot", "check http://spam.example");
  assert.ok(one.flags.includes("links"));
  const many = scoreEntry("Bot", "http://a.com and www.b.net and c.xyz");
  assert.ok(many.score > one.score); // 2+ links weighs more
});

test("shouting is flagged as caps", () => {
  assert.ok(scoreEntry("X", "BUY CHEAP FOLLOWERS NOW ONLINE").flags.includes("caps"));
  assert.ok(!scoreEntry("X", "Normal sentence casing here").flags.includes("caps"));
});

test("profanity is flagged and weighs heavily", () => {
  const r = scoreEntry("X", "this is shit");
  assert.ok(r.flags.includes("profanity"));
  assert.ok(r.score >= 3);
});

test("too-short, too-long, and repeated-char messages are flagged", () => {
  assert.ok(scoreEntry("X", "hi").flags.includes("short"));
  assert.ok(scoreEntry("X", "a".repeat(900)).flags.includes("long"));
  assert.ok(scoreEntry("X", "soooooooo good").flags.includes("repeat"));
});
