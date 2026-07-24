import test from "node:test";
import assert from "node:assert/strict";
import { classifyReferrer, groupReferrers, sanitizeReferrerRules, sanitizeUtmSource } from "../src/referrer.js";

test("subdomains of one source collapse to one label", () => {
  for (const h of ["reddit.com", "www.reddit.com", "old.reddit.com", "out.reddit.com"]) {
    assert.equal(classifyReferrer(h), "Reddit");
  }
});

test("the sources that prompted this are recognised", () => {
  assert.equal(classifyReferrer("chatgpt.com"), "ChatGPT");
  assert.equal(classifyReferrer("claude.ai"), "Claude");
  assert.equal(classifyReferrer("steamcommunity.com"), "Steam");
  assert.equal(classifyReferrer("store.steampowered.com"), "Steam");
  assert.equal(classifyReferrer("discord.com"), "Discord");
  assert.equal(classifyReferrer("t.co"), "X");
});

test("direct stays direct", () => {
  assert.equal(classifyReferrer("direct"), "direct");
  assert.equal(classifyReferrer(""), "direct");
});

test("custom rules override the built-in table", () => {
  const custom = [{ match: "reddit.com", label: "Reddit (my post)" }];
  assert.equal(classifyReferrer("www.reddit.com", custom), "Reddit (my post)");
});

test("a longer custom match beats a shorter one", () => {
  const custom = [
    { match: "example.com", label: "Example" },
    { match: "blog.example.com", label: "Example blog" },
  ];
  assert.equal(classifyReferrer("blog.example.com", custom), "Example blog");
  assert.equal(classifyReferrer("shop.example.com", custom), "Example");
});

test("an unknown host keeps its identity, minus noise subdomains", () => {
  // The long tail stays visible — an unrecognised source sending real traffic is
  // exactly what's worth noticing, not something to bury in "other".
  assert.equal(classifyReferrer("www.someblog.dev"), "someblog.dev");
  assert.equal(classifyReferrer("news.example.org"), "news.example.org");
});

test("a suffix match must be on a dot boundary, not a substring", () => {
  // notreddit.com is not Reddit.
  assert.equal(classifyReferrer("notreddit.com"), "notreddit.com");
});

test("grouping sums the hosts that share a label and sorts by size", () => {
  const rows = [
    { key: "www.reddit.com", count: 3 },
    { key: "old.reddit.com", count: 4 },
    { key: "chatgpt.com", count: 9 },
    { key: "direct", count: 1 },
  ];
  assert.deepEqual(groupReferrers(rows), [
    { key: "ChatGPT", count: 9 },
    { key: "Reddit", count: 7 },
    { key: "direct", count: 1 },
  ]);
});

test("grouping preserves the total", () => {
  const rows = [
    { key: "t.co", count: 2 },
    { key: "twitter.com", count: 5 },
    { key: "unknown.example", count: 1 },
  ];
  const before = rows.reduce((s, r) => s + r.count, 0);
  const after = groupReferrers(rows).reduce((s, r) => s + r.count, 0);
  assert.equal(after, before);
});

test("rules are sanitized: blanks, dupes and pasted URLs", () => {
  const out = sanitizeReferrerRules([
    { match: "  https://Steam.com/path  ", label: " Steam " },
    { match: "steam.com", label: "Duplicate" },
    { match: "", label: "No match" },
    { match: "x.example", label: "" },
    "not an object",
  ]);
  assert.deepEqual(out, [{ match: "steam.com", label: "Steam" }]);
});

test("non-array input yields no rules rather than throwing", () => {
  assert.deepEqual(sanitizeReferrerRules(undefined), []);
  assert.deepEqual(sanitizeReferrerRules({ match: "x" }), []);
});

test("a utm tag and a real referral from the same place merge into one source", () => {
  // The point of the prefix: `?utm_source=discord` on a link posted in the
  // Discord desktop app (which sends no Referer) has to land on the same line as
  // an actual referral from discord.com.
  assert.equal(classifyReferrer("utm:discord"), "Discord");
  assert.equal(classifyReferrer("discord.com"), "Discord");
  assert.equal(classifyReferrer("utm:steam"), "Steam");
  assert.equal(classifyReferrer("utm:chatgpt"), "ChatGPT");
});

test("utm tokens match a label regardless of spacing or case", () => {
  assert.equal(classifyReferrer("utm:hackernews"), "Hacker News");
  assert.equal(classifyReferrer("utm:hacker-news"), "Hacker News");
  assert.equal(classifyReferrer("utm:HACKER_NEWS".toLowerCase()), "Hacker News");
});

test("a custom rule can name a utm tag that has no host at all", () => {
  const custom = [{ match: "newsletter", label: "Newsletter" }];
  assert.equal(classifyReferrer("utm:newsletter", custom), "Newsletter");
});

test("an unknown utm tag is shown as written, not invented", () => {
  assert.equal(classifyReferrer("utm:some-flyer"), "some-flyer");
});

test("grouping merges a utm tag with its host equivalent", () => {
  const rows = [
    { key: "utm:discord", count: 5 },
    { key: "discord.com", count: 2 },
    { key: "direct", count: 1 },
  ];
  assert.deepEqual(groupReferrers(rows), [
    { key: "Discord", count: 7 },
    { key: "direct", count: 1 },
  ]);
});

test("utm_source is capped in length and alphabet — it is attacker-controlled", () => {
  assert.equal(sanitizeUtmSource("Discord"), "discord");
  assert.equal(sanitizeUtmSource("  steam  "), "steam");
  assert.equal(sanitizeUtmSource("<script>alert(1)</script>"), "scriptalert1script");
  assert.equal(sanitizeUtmSource("x".repeat(200))?.length, 32);
  assert.equal(sanitizeUtmSource("!!!"), null, "nothing usable left");
  assert.equal(sanitizeUtmSource(null), null);
  assert.equal(sanitizeUtmSource(undefined), null);
});
