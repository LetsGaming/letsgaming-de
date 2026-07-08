import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assetRef,
  resolveAsset,
  slugify,
  type ImageAssetView,
  type ResolvableAsset,
  type SvgAssetView,
} from "./assets.js";

const map = (list: ResolvableAsset[]) => new Map(list.map((a) => [a.id, a]));

test("resolveAsset: image → picture spec with capped srcset + alt fallback", () => {
  const assets = map([
    {
      id: "img1",
      kind: "image",
      width: 1000,
      height: 800,
      caption: "A sunset",
      variantWidths: [320, 640, 960, 1280, 1600], // wider ones must be dropped
    },
  ]);
  const v = resolveAsset(assetRef("img1"), assets) as ImageAssetView;
  assert.equal(v.kind, "image");
  assert.equal(v.src, "/assets/img1");
  assert.equal(v.alt, "A sunset"); // caption used when no alt
  assert.equal(v.width, 1000);
  // Only widths <= intrinsic 1000 survive (1280/1600 dropped).
  assert.equal(v.srcsetWebp, "/assets/img1/w320.webp 320w, /assets/img1/w640.webp 640w, /assets/img1/w960.webp 960w");
  assert.ok(v.srcsetAvif?.includes("w960.avif 960w"));
});

test("resolveAsset: an explicit alt override wins over stored metadata", () => {
  const assets = map([{ id: "i", kind: "image", alt: "stored", variantWidths: [320] }]);
  const v = resolveAsset("asset:i", assets, "override alt") as ImageAssetView;
  assert.equal(v.alt, "override alt");
});

test("resolveAsset: svg → inline sanitized markup", () => {
  const assets = map([{ id: "s", kind: "svg", svg: "<svg><path/></svg>", title: "Logo" }]);
  const v = resolveAsset("asset:s", assets) as SvgAssetView;
  assert.equal(v.kind, "svg");
  assert.equal(v.svg, "<svg><path/></svg>");
  assert.equal(v.alt, "Logo");
});

test("resolveAsset: pdf → download link, markdown → page link", () => {
  const assets = map([
    { id: "p", kind: "pdf", filename: "cv.pdf" },
    { id: "m", kind: "markdown", slug: "about", title: "About me" },
  ]);
  assert.deepEqual(resolveAsset("asset:p", assets), { kind: "pdf", href: "/assets/p", filename: "cv.pdf" });
  assert.deepEqual(resolveAsset("asset:m", assets), { kind: "markdown", href: "/md/about", title: "About me" });
});

test("resolveAsset: unknown ref or missing asset → null", () => {
  assert.equal(resolveAsset("not-a-ref!", new Map()), null);
  assert.equal(resolveAsset("asset:missing", new Map()), null);
  assert.equal(resolveAsset(null, new Map()), null);
});

test("slugify: safe, hyphenated, bounded", () => {
  assert.equal(slugify("My Notes!"), "my-notes");
  assert.equal(slugify("  Über Café  "), "uber-cafe");
  assert.equal(slugify(""), "untitled");
});
