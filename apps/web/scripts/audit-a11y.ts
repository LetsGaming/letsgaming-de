/**
 * Accessibility audit against a running site.
 *
 *   node scripts/dev-up.mjs --id audit          (prints the frontend URL)
 *   pnpm --filter=@lg/web audit:a11y http://localhost:PORT
 *   node scripts/dev-down.mjs --id audit
 *
 * Loads /, /code, /life and /about in English and German, light and dark, at 1280px
 * (mouse) and 390px (touch), and reports what a person with a keyboard, a screen reader or a
 * thumb would hit: touch targets, contrast, horizontal overflow, headings and the
 * first Tab stops. Exits 1 when anything fails. Not part of `pnpm build`: it needs
 * a running site and a browser.
 *
 * Targets: 24px for a pointer, 44px for touch (WCAG 2.5.8 and 2.5.5). A link set
 * inside running text is exempt and listed separately. The day cells of a heat strip
 * (`.hg-c`) are held to 24px on touch too: a 14 day strip of 44px cells would be
 * 616px wide, and 24px is the AA minimum. Contrast: 4.5:1, or 3:1 for
 * large text. Same browser rules as `gen-og.ts`: Edge, then Chrome, or
 * OG_BROWSER_PATH.
 */
import { chromium, type Browser } from "playwright-core";

const base = (process.argv[2] ?? "").replace(/\/$/, "");
if (!base) {
  console.error("usage: audit-a11y.ts http://localhost:PORT");
  process.exit(1);
}

const ROUTES = ["/", "/code", "/life", "/about"];
const LANGS = ["en", "de"];
const SCHEMES = ["light", "dark"] as const;
const MODES = [
  { name: "desktop", width: 1280, height: 900, touch: false, min: 24 },
  { name: "touch", width: 390, height: 844, touch: true, min: 44 },
];

const launch = async (): Promise<Browser> => {
  const executablePath = process.env.OG_BROWSER_PATH;
  if (executablePath) return chromium.launch({ executablePath });
  try {
    return await chromium.launch({ channel: "msedge" });
  } catch {
    return await chromium.launch({ channel: "chrome" });
  }
};

interface Finding {
  where: string;
  kind: string;
  detail: string;
}

/** Runs inside the page. Kept dependency free and string-safe. */
const measure = (min: number) => {
  const out = { small: [] as string[], inline: [] as string[], contrast: [] as string[], headings: [] as number[] };
  const visible = (e: Element): boolean => {
    const r = e.getBoundingClientRect();
    const s = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.opacity !== "0" && r.right > 0 && r.bottom > 0 && r.left < innerWidth + 1;
  };
  const label = (e: Element): string => `${e.tagName.toLowerCase()}.${String((e as HTMLElement).className).trim().split(/\s+/)[0] ?? ""} "${(e.textContent ?? "").trim().slice(0, 24)}"`;
  for (const e of document.querySelectorAll("a[href], button, input:not([type=hidden]), [role=button], [role=switch], select, textarea")) {
    if (!visible(e) || e.closest("[aria-hidden=true]")) continue;
    const r = e.getBoundingClientRect();
    const need = e.classList.contains("hg-c") ? Math.min(min, 24) : min;
    if (r.width >= need && r.height >= need) continue;
    const inText = e.tagName === "A" && getComputedStyle(e).display === "inline" && !!e.closest("p, li, dd, td");
    (inText ? out.inline : out.small).push(`${label(e)} ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  const bg = (e: Element | null): [number, number, number] => {
    for (let n: Element | null = e; n; n = n.parentElement) {
      const m = /rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/.exec(getComputedStyle(n).backgroundColor);
      if (m && (m[4] === undefined || Number(m[4]) > 0.99)) return [Number(m[1]), Number(m[2]), Number(m[3])];
    }
    return [255, 255, 255];
  };
  const lum = (c: number[]): number => {
    const [r = 0, g = 0, b = 0] = c.map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set<Element>();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!el || seen.has(el) || !(n.textContent ?? "").trim() || !visible(el)) continue;
    seen.add(el);
    const s = getComputedStyle(el);
    const m = /rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/.exec(s.color);
    if (!m) continue;
    const back = bg(el);
    const alpha = m[4] === undefined ? 1 : Number(m[4]);
    const fg = [1, 2, 3].map((i, k) => Math.round(Number(m[i]) * alpha + (back[k] ?? 0) * (1 - alpha)));
    const a = lum(fg);
    const b = lum(back);
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const size = parseFloat(s.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700);
    if (ratio < (large ? 3 : 4.5)) out.contrast.push(`${label(el)} ${ratio.toFixed(2)}:1`);
  }
  document.querySelectorAll("h1,h2,h3,h4,h5,h6").forEach((h) => out.headings.push(Number(h.tagName[1])));
  return out;
};

const browser = await launch();
const findings: Finding[] = [];
const exempt: string[] = [];

try {
  for (const mode of MODES) {
   for (const scheme of SCHEMES) {
    const context = await browser.newContext({
      viewport: { width: mode.width, height: mode.height },
      hasTouch: mode.touch,
      isMobile: mode.touch,
      deviceScaleFactor: 1,
      colorScheme: scheme,
    });
    // tsx wraps functions in a `__name` helper that the page does not have.
    await context.addInitScript("window.__name = (fn) => fn;");
    for (const lang of LANGS) {
      for (const route of ROUTES) {
        const where = `${mode.name} ${scheme} ${lang} ${route}`;
        const page = await context.newPage();
        await page.goto(`${base}${route}?lang=${lang}`, { waitUntil: "networkidle" });
        await page.evaluate(() => document.fonts.ready);
        const theme = await page.evaluate(() => document.documentElement.dataset.theme ?? "");
        if (theme && theme !== scheme) findings.push({ where, kind: "theme", detail: `asked for ${scheme}, got ${theme}` });
        const m = await page.evaluate(measure, mode.min);
        for (const d of m.small) findings.push({ where, kind: `target under ${mode.min}px`, detail: d });
        for (const d of m.inline) exempt.push(`${where}  ${d}`);
        for (const d of m.contrast) findings.push({ where, kind: "contrast", detail: d });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        if (overflow > 0) findings.push({ where, kind: "overflow", detail: `${overflow}px` });
        const h1 = m.headings.filter((l) => l === 1).length;
        if (h1 !== 1) findings.push({ where, kind: "headings", detail: `${h1} h1 elements` });
        m.headings.forEach((l, i) => {
          const prev = m.headings[i - 1];
          if (prev !== undefined && l - prev > 1) findings.push({ where, kind: "headings", detail: `h${prev} then h${l}` });
        });
        if (!mode.touch && lang === "en") {
          await page.keyboard.press("Tab");
          const first = await page.evaluate(() => {
            const e = document.activeElement as HTMLElement | null;
            const s = e ? getComputedStyle(e) : null;
            return { skip: !!e?.classList.contains("skip"), ring: !!s && s.outlineStyle !== "none" && parseFloat(s.outlineWidth) >= 2 };
          });
          if (!first.skip) findings.push({ where, kind: "skip link", detail: "the first Tab stop is not the skip link" });
          if (!first.ring) findings.push({ where, kind: "focus", detail: "the first Tab stop has no visible ring" });
        }
        await page.close();
      }
    }
    await context.close();
   }
  }
} finally {
  await browser.close();
}

if (exempt.length) console.log(`exempt (inline links in text): ${exempt.length}`);
if (findings.length) {
  console.error(`✗ a11y audit: ${findings.length} finding(s)\n`);
  const seen = new Set<string>();
  for (const f of findings) {
    const line = `  [${f.kind}] ${f.where}  ${f.detail}`;
    if (!seen.has(line)) console.error(line);
    seen.add(line);
  }
  process.exit(1);
}
console.log("✓ a11y audit passed (targets, contrast, overflow, headings, skip link, focus).");
