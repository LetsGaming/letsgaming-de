import assert from "node:assert/strict";
import { test } from "node:test";
import {
  en,
  firstParagraph,
  parsePost,
  resolveSiteView,
  slugify,
  type ResolvableAsset,
} from "../src/index.js";

test("parsePost: reads the frontmatter and strips it from the body", () => {
  const { frontmatter: fm, body } = parsePost(
    `---
title: "Rebuilding my site"
date: 2026-07-16
draft: true
excerpt: A short blurb.
tags: [astro, design]
---
# Rebuilding my site

The opening paragraph.
`,
    "rebuilding",
  );
  assert.equal(fm.title, "Rebuilding my site");
  assert.equal(fm.date, new Date("2026-07-16").toISOString());
  assert.equal(fm.draft, true);
  assert.equal(fm.excerpt, "A short blurb.");
  assert.deepEqual(fm.tags, ["astro", "design"]);
  assert.ok(!body.includes("---"));
  assert.ok(body.startsWith("# Rebuilding"));
});

test("parsePost: a malformed or bare post is content, not a crash", () => {
  // No frontmatter at all — still readable, title lifted from the H1.
  const bare = parsePost("# Just a heading\n\nBody.", "bare");
  assert.equal(bare.frontmatter.title, "Just a heading");
  assert.equal(bare.frontmatter.draft, false);
  assert.deepEqual(bare.frontmatter.tags, []);

  // Garbage date degrades rather than throwing; epoch sorts it last.
  const bad = parsePost("---\ntitle: X\ndate: not-a-date\n---\nBody.", "bad");
  assert.equal(bad.frontmatter.date, new Date(0).toISOString());

  // Nothing at all: the slug is the last fallback, so a post always has a name.
  assert.equal(parsePost("", "my-slug").frontmatter.title, "my-slug");
});

test("parsePost: tags parse bare or bracketed, quoted or not", () => {
  assert.deepEqual(parsePost('---\ntags: [a, "b c"]\n---\n', "s").frontmatter.tags, ["a", "b c"]);
  assert.deepEqual(parsePost("---\ntags: a, b\n---\n", "s").frontmatter.tags, ["a", "b"]);
  assert.deepEqual(parsePost("---\ntags:\n---\n", "s").frontmatter.tags, []);
});

test("firstParagraph: skips headings and images, strips markup, truncates", () => {
  const body = "# Title\n\n![alt](x.png)\n\nA **bold** [link](https://x) and `code`.\n";
  assert.equal(firstParagraph(body), "A bold link and code.");
  assert.ok(firstParagraph("x".repeat(400)).endsWith("…"));
});

test("slugify: keeps path separators so a post can be namespaced", () => {
  assert.equal(slugify("My First Post"), "my-first-post");
  assert.equal(slugify("blog/My First Post"), "blog/my-first-post");
  // Each segment is slugified independently; empties collapse rather than
  // producing "//" or a trailing slash.
  assert.equal(slugify("blog//My  Post/"), "blog/my-post");
  assert.equal(slugify("Blog/Ünicode Ärger"), "blog/unicode-arger");
});

test("posts index: only blog/-namespaced markdown, drafts excluded, newest first", () => {
  const md = (title: string, date: string, draft = false) =>
    `---\ntitle: ${title}\ndate: ${date}\ndraft: ${draft}\n---\nBody of ${title}.`;
  const assets = new Map<string, ResolvableAsset>([
    ["1", { id: "1", kind: "markdown", slug: "blog/second", filename: "b.md", markdown: md("Second", "2026-02-01") }],
    ["2", { id: "2", kind: "markdown", slug: "blog/first", filename: "a.md", markdown: md("First", "2026-01-01") }],
    ["3", { id: "3", kind: "markdown", slug: "blog/hidden", filename: "d.md", markdown: md("Draft", "2026-03-01", true) }],
    // A markdown asset outside the namespace is a page, not a post.
    ["4", { id: "4", kind: "markdown", slug: "impressum", filename: "i.md", markdown: md("Impressum", "2026-01-15") }],
  ]);
  const view = resolveSiteView({
    content: {
      meta: { name: "D", handle: "h", location: en("DE"), role: en("dev") },
      headline: { before: en("a"), highlight: en("b"), after: en("c") },
      lede: en("l"),
      status: { verb: en("v"), now: en("n") },
      bio: [en("p")],
      links: [],
      projects: [],
      hobbies: [],
      now: [],
    },
    source: {},
    nav: [{ id: "blog", label: en("Blog"), modules: ["posts"] }],
    modules: [{ id: "posts", kind: "posts", heading: en("Blog") }],
    assets,
    now: new Date("2026-03-02T00:00:00Z"),
  });
  const mod = view.modules["posts"];
  if (!mod || mod.kind !== "posts") throw new Error("expected posts");
  assert.deepEqual(
    mod.data.posts.map((p) => p.slug),
    ["blog/second", "blog/first"],
    "namespaced only, newest first, no drafts",
  );
  // No excerpt given -> the opening paragraph, so OG always has something.
  assert.equal(mod.data.posts[0]?.excerpt, "Body of Second.");
});
