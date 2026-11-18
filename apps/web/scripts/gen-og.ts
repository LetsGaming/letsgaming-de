/**
 * Regenerate the social preview card, `src/public/og-image.png` (1200 x 630).
 *
 *   pnpm --filter=@lg/web gen:og
 *
 * Run it when the design tokens, the fonts, the favicon or the facts below
 * change, then commit the PNG. It is not part of `pnpm build`: a build image has
 * no browser, and the card changes about as often as the favicon does.
 *
 * Colours come from `tokens.css` and the mark from `favicon.svg`, so the card
 * cannot drift from the site. The fonts are the self-hosted Fontsource files,
 * inlined as data URIs so the page needs no server.
 *
 * It drives a browser that is already installed (Edge, then Chrome). Set
 * OG_BROWSER_PATH to use another executable.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const NAME = "Domenic";
const LINE = "Full-time web developer in Germany";
const DOMAIN = "letsgaming.de";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const target = resolve(root, "src/public/og-image.png");

const tokens = readFileSync(resolve(root, "src/styles/tokens.css"), "utf8");
const darkBlock = tokens.slice(tokens.indexOf(":root {"), tokens.indexOf('[data-theme="light"] {'));
const token = (name: string): string => {
  const hit = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})\\b`).exec(darkBlock);
  if (!hit?.[1]) throw new Error(`token --${name} not found in the dark block of tokens.css`);
  return hit[1];
};

const font = (pkg: string, file: string): string =>
  readFileSync(resolve(root, `node_modules/@fontsource-variable/${pkg}/files/${file}`)).toString("base64");

const display = font("archivo", "archivo-latin-wdth-normal.woff2");
const body = font("atkinson-hyperlegible-next", "atkinson-hyperlegible-next-latin-wght-normal.woff2");
const mono = font("atkinson-hyperlegible-mono", "atkinson-hyperlegible-mono-latin-wght-normal.woff2");
const mark = readFileSync(resolve(root, "src/public/favicon.svg"), "utf8").replace(
  /<svg [^>]*>/,
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="88" height="88">',
);

const html = `<!doctype html>
<meta charset="utf-8">
<style>
@font-face { font-family: "Archivo"; src: url(data:font/woff2;base64,${display}) format("woff2"); font-weight: 100 900; font-stretch: 62% 125%; }
@font-face { font-family: "Atkinson Hyperlegible Next"; src: url(data:font/woff2;base64,${body}) format("woff2"); font-weight: 200 800; }
@font-face { font-family: "Atkinson Hyperlegible Mono"; src: url(data:font/woff2;base64,${mono}) format("woff2"); font-weight: 200 800; }
* { margin: 0; box-sizing: border-box; }
html, body { width: 1200px; height: 630px; }
body { position: relative; overflow: hidden; background: ${token("surf-0")}; }
.mark { position: absolute; left: 80px; top: 72px; line-height: 0; }
.name { position: absolute; left: 70px; top: 196px; font-family: "Archivo"; font-weight: 700; font-stretch: 75%; font-size: 208px; line-height: 1; letter-spacing: -0.01em; color: ${token("ink-strong")}; }
.line { position: absolute; left: 78px; top: 424px; font-family: "Atkinson Hyperlegible Next"; font-weight: 400; font-size: 44px; line-height: 1.2; color: ${token("muted")}; }
.domain { position: absolute; left: 76px; bottom: 72px; font-family: "Atkinson Hyperlegible Mono"; font-weight: 400; font-size: 34px; line-height: 1; color: ${token("ink")}; }
</style>
<div class="mark">${mark}</div>
<div class="name">${NAME}</div>
<div class="line">${LINE}</div>
<div class="domain">${DOMAIN}</div>`;

const launch = async () => {
  const executablePath = process.env.OG_BROWSER_PATH;
  if (executablePath) return chromium.launch({ executablePath });
  try {
    return await chromium.launch({ channel: "msedge" });
  } catch {
    return await chromium.launch({ channel: "chrome" });
  }
};

const browser = await launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  const png = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 1200, height: 630 } });
  writeFileSync(target, png);
  console.log(`✓ wrote ${target} (${(png.length / 1024).toFixed(1)} KB)`);
} finally {
  await browser.close();
}
