import test from "node:test";
import assert from "node:assert/strict";
import { articleLd, buildSeoTags, personLd, plainExcerpt, websiteLd, type SeoInput } from "../src/seo.js";

const base: SeoInput = {
  origin: "https://letsgaming.de",
  path: "/",
  locale: "en",
  title: "Domenic — web dev & tinkerer",
  description: "Personal homepage.",
};

const prop = (tags: ReturnType<typeof buildSeoTags>, property: string) =>
  tags.meta.find((m) => m.property === property)?.content;
const name = (tags: ReturnType<typeof buildSeoTags>, n: string) =>
  tags.meta.find((m) => m.name === n)?.content;

test("canonical is the clean path on the primary origin — no trailing slash at root", () => {
  assert.equal(buildSeoTags(base).canonical, "https://letsgaming.de");
  assert.equal(buildSeoTags({ ...base, path: "/life" }).canonical, "https://letsgaming.de/life");
});

test("a trailing slash on origin doesn't double up", () => {
  const tags = buildSeoTags({ ...base, origin: "https://letsgaming.de/", path: "/work" });
  assert.equal(tags.canonical, "https://letsgaming.de/work");
});

test("hreflang lists every locale plus x-default; default is bare, others carry ?lang", () => {
  const { alternates } = buildSeoTags({ ...base, path: "/life", localized: true });
  const byLang = Object.fromEntries(alternates.map((a) => [a.hreflang, a.href]));
  assert.equal(byLang.en, "https://letsgaming.de/life");
  assert.equal(byLang.de, "https://letsgaming.de/life?lang=de");
  // x-default points at the locale-negotiated URL (the bare path).
  assert.equal(byLang["x-default"], "https://letsgaming.de/life");
});

test("canonical ignores the rendered locale — a page seen in de still canonicalizes to the clean path", () => {
  const en = buildSeoTags({ ...base, path: "/life", locale: "en" }).canonical;
  const de = buildSeoTags({ ...base, path: "/life", locale: "de" }).canonical;
  assert.equal(en, de);
});

test("og:url is the canonical, and core OG fields are present", () => {
  const tags = buildSeoTags({ ...base, path: "/work" });
  assert.equal(prop(tags, "og:url"), "https://letsgaming.de/work");
  assert.equal(prop(tags, "og:type"), "website");
  assert.equal(prop(tags, "og:title"), base.title);
});

test("a rooted image is made absolute for OG and Twitter; card upgrades to large", () => {
  const tags = buildSeoTags({ ...base, image: "/og-image.png" });
  assert.equal(prop(tags, "og:image"), "https://letsgaming.de/og-image.png");
  assert.equal(name(tags, "twitter:image"), "https://letsgaming.de/og-image.png");
  assert.equal(name(tags, "twitter:card"), "summary_large_image");
});

test("no image → summary card, and no image tags", () => {
  const tags = buildSeoTags(base);
  assert.equal(name(tags, "twitter:card"), "summary");
  assert.equal(prop(tags, "og:image"), undefined);
});

test("an already-absolute image is left untouched", () => {
  const tags = buildSeoTags({ ...base, image: "https://cdn.example/x.png" });
  assert.equal(prop(tags, "og:image"), "https://cdn.example/x.png");
});

test("twitter handle is normalized to a single leading @", () => {
  const withAt = buildSeoTags({ ...base, twitterHandle: "@LetsGaming" });
  const without = buildSeoTags({ ...base, twitterHandle: "LetsGaming" });
  assert.equal(name(withAt, "twitter:creator"), "@LetsGaming");
  assert.equal(name(without, "twitter:creator"), "@LetsGaming");
});

test("personLd carries sameAs only when there are profiles", () => {
  const withLinks = personLd({
    name: "Domenic",
    handle: "@LetsGaming",
    role: "web developer",
    origin: "https://letsgaming.de",
    sameAs: ["https://github.com/LetsGaming"],
  });
  assert.deepEqual(withLinks.sameAs, ["https://github.com/LetsGaming"]);

  const without = personLd({ name: "Domenic", handle: "@LetsGaming", role: "web developer", origin: "https://letsgaming.de" });
  assert.equal("sameAs" in without, false);
  assert.equal(without["@type"], "Person");
});

test("websiteLd names both locales as inLanguage", () => {
  const ld = websiteLd({ name: "Domenic", handle: "@LetsGaming", role: "web developer", origin: "https://letsgaming.de" });
  assert.deepEqual(ld.inLanguage, ["en", "de"]);
  assert.equal(ld["@type"], "WebSite");
});

test("a single-language page claims no alternates — an unlocalized page must not advertise hreflang", () => {
  const tags = buildSeoTags({ ...base, path: "/md/a-post" });
  assert.deepEqual(tags.alternates, []);
  assert.equal(
    tags.meta.some((m) => m.property === "og:locale:alternate"),
    false,
  );
});

test("a localized page advertises the other locale to Facebook too, but not its own", () => {
  const alts = buildSeoTags({ ...base, locale: "en", localized: true }).meta
    .filter((m) => m.property === "og:locale:alternate")
    .map((m) => m.content);
  assert.deepEqual(alts, ["de"]);
});

test("articleLd carries the page as mainEntityOfPage and omits empty optionals", () => {
  const ld = articleLd({
    headline: "A post",
    url: "https://letsgaming.de/md/a-post",
    datePublished: "2026-02-01T10:00:00.000Z",
    author: { name: "Domenic" },
    keywords: [],
  });
  assert.equal(ld["@type"], "BlogPosting");
  assert.equal(ld.mainEntityOfPage, "https://letsgaming.de/md/a-post");
  assert.equal("keywords" in ld, false);
  assert.equal("description" in ld, false);
  assert.deepEqual(ld.author, { "@type": "Person", name: "Domenic" });
});

test("plainExcerpt strips tags, markdown and code fences", () => {
  assert.equal(plainExcerpt("<p>Hello <strong>world</strong>.</p>"), "Hello world.");
  assert.equal(plainExcerpt("## Heading\n\nSome *emphasised* text."), "Heading Some emphasised text.");
  assert.equal(plainExcerpt("Intro.\n\n```ts\nconst x = 1;\n```"), "Intro.");
});

test("plainExcerpt keeps link text and drops the target", () => {
  assert.equal(plainExcerpt("See [the docs](https://example.com/x) for more."), "See the docs for more.");
});

test("plainExcerpt decodes entities and collapses whitespace", () => {
  assert.equal(plainExcerpt("a &amp; b &nbsp;  c"), "a & b c");
});

test("plainExcerpt cuts at a word boundary and marks the truncation", () => {
  const out = plainExcerpt("word ".repeat(60));
  assert.ok(out.length <= 156, `too long: ${out.length}`);
  assert.ok(out.endsWith("…"));
  assert.ok(!out.includes("wor…"), "should not cut mid-word");
});

test("plainExcerpt yields empty string for a body with no prose", () => {
  assert.equal(plainExcerpt("```\nconst x = 1;\n```"), "");
});
