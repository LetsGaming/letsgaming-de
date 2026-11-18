/**
 * The checks behind `lint:design`, as pure functions so a test can feed them
 * a bad file. DESIGN.md states these rules; the redesign critique found that
 * each one had drifted unnoticed, so each is now a check the build runs.
 */

export interface Violation {
  line: number;
  rule: string;
  text: string;
}

/** The comment part of a line, or null when the line has no comment. */
export const commentPart = (line: string): string | null => {
  const trimmed = line.trimStart();
  if (/^(\/\/|\*|\/\*|<!--)/.test(trimmed)) return line;
  const found = [/(?<!:)\/\//, /\/\*/, /<!--/]
    .map((re) => re.exec(line)?.index)
    .filter((i): i is number => i !== undefined);
  return found.length ? line.slice(Math.min(...found)) : null;
};

const isCommentLine = (line: string): boolean => /^\s*(\/\/|\*|\/\*|<!--)/.test(line);

// En dash and em dash, built from char codes so this file contains neither.
const DASHES = String.fromCharCode(0x2013, 0x2014);
const DASH = new RegExp("[" + DASHES + "]");
const DASH_RANGE = new RegExp("([0-9]) *[" + DASHES + "] *([0-9])", "g");
const DASH_SPACED = new RegExp(" *[" + DASHES + "] *", "g");

export const hasDash = (text: string): boolean => DASH.test(text);

/** Comment lines that carry an em or en dash. */
export const dashLines = (text: string): number[] => {
  const out: number[] = [];
  text.split("\n").forEach((line, i) => {
    const part = commentPart(line);
    if (part && hasDash(part)) out.push(i + 1);
  });
  return out;
};

/** Rewrite the dashes inside comments only. Strings and markup are untouched. */
export const fixComments = (text: string): string =>
  text
    .split("\n")
    .map((line) => {
      const part = commentPart(line);
      if (!part || !hasDash(part)) return line;
      const fixed = part.replace(DASH_RANGE, "$1 to $2").replace(DASH_SPACED, ", ");
      return line.slice(0, line.length - part.length) + fixed;
    })
    .join("\n");

export interface PublicFileCheck {
  /** Path relative to the repo root, forward slashes. */
  path: string;
  text: string;
  monoMax: number;
  accentMax: number;
  allowArrow: boolean;
}

/** The ratchet allowlists live in `lint-design.ts`; a count above the allowance is a violation. */
export const checkPublicFile = ({ path, text, monoMax, accentMax, allowArrow }: PublicFileCheck): Violation[] => {
  const out: Violation[] = [];
  const lines = text.split("\n");
  const isStyleHost = /\.(css|vue)$/.test(path);

  lines.forEach((line, i) => {
    const n = i + 1;
    const tail = commentPart(line);
    const code = tail ? line.slice(0, line.length - tail.length) : line;
    if (!code.trim()) return;
    if (/ · /.test(code)) {
      out.push({ line: n, rule: "middle-dot", text: "a middle-dot separator; use a comma, a colon, or separate cells" });
    }
    if (!allowArrow && /→/.test(code)) {
      out.push({ line: n, rule: "arrow", text: "an arrow glyph on link text; name the destination instead" });
    }
    if (isStyleHost && /text-transform:\s*uppercase/.test(code)) {
      out.push({ line: n, rule: "uppercase", text: "uppercase labels are a template tell; use sentence case" });
    }
    const spacing = /letter-spacing:\s*(-?[0-9.]+)/.exec(code);
    if (isStyleHost && spacing && Number(spacing[1]) > 0) {
      out.push({ line: n, rule: "letter-spacing", text: "positive letter-spacing is for uppercase labels, which are not used" });
    }
  });

  const mono = lines.filter((l) => !isCommentLine(l) && /var\(--f-m\)/.test(l)).length;
  if (mono > monoMax) {
    out.push({
      line: 0,
      rule: "mono",
      text: `${mono} uses of the mono face, allowance ${monoMax}. Mono is for synced numbers and timestamps; add the file to MONO_MAX in lint-design.ts only for a number.`,
    });
  }
  const accent = lines.filter((l) => !isCommentLine(l) && /var\(--live(-ink|-solid)?\)/.test(l)).length;
  if (accent > accentMax) {
    out.push({
      line: 0,
      rule: "accent",
      text: `${accent} uses of the accent, allowance ${accentMax}. The accent is for live data, the one primary action and the focus ring; add the file to ACCENT_MAX in lint-design.ts only for one of those.`,
    });
  }
  return out;
};
