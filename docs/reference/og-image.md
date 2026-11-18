# Social preview card

`apps/web/src/public/og-image.png` is the picture platforms show when someone shares a link to the site. Every page uses it as `og:image` and `twitter:image`, and the blog template also uses it as the Article image in its structured data. The path in code is `OG_IMAGE_PATH` in `apps/web/src/lib/site-meta.ts`.

The file is committed and self-hosted, like the fonts. It is generated, not drawn.

## Regenerate

```bash
pnpm --filter=@lg/web gen:og
```

Run it when the tokens, the fonts, the favicon, or the three facts at the top of `apps/web/scripts/gen-og.ts` change. Then commit the PNG and raise the `?v=` number in `OG_IMAGE_PATH`, so platforms fetch the new picture instead of their cached copy.

The script needs Edge or Chrome on the machine. It uses `playwright-core`, which does not download a browser. Set `OG_BROWSER_PATH` to use another executable. It is not part of `pnpm build`, because a build image has no browser.

## Spec

- Size: 1200 x 630, PNG, under 300 KB (a test checks size and dimensions). The current file is about 36 KB.
- Ground: `--surf-0` (dark). No glow and no gradient.
- Name: Archivo 700, width 75, 208px, `--ink-strong`.
- Role line: Atkinson Hyperlegible Next 44px, `--muted`. It states only facts that are on the site: "Full-time web developer in Germany".
- Domain: Atkinson Hyperlegible Mono 34px, `--ink`.
- Mark: the favicon (`apps/web/src/public/favicon.svg`), top left, 88px. It is brand identity, not a live signal, so it is the only violet on the card.
- Safe area: keep text inside the centre 1200 x 600 with at least 70px margins, because X crops the card to 2:1.

Colours are read from `tokens.css` and the mark from `favicon.svg` when the script runs, so the card follows the site.

## After a change

Platforms cache the old picture. Raising `?v=` helps with most. X, LinkedIn and Facebook also have debugger tools where a URL can be re-scraped. (This caching behaviour is from general knowledge, not measured here.)
