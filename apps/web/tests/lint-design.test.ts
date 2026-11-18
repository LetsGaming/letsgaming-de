import { describe, expect, it } from "vitest";
import { checkPublicFile, dashLines, fixComments } from "../scripts/design-rules";

const DASH = String.fromCharCode(0x2014);
const base = { path: "apps/web/src/x.vue", monoMax: 0, accentMax: 0, allowArrow: false };

describe("design rules", () => {
  it("flags a middle dot, an arrow, an uppercase label and positive letter-spacing", () => {
    const text = [
      "<template><p>3 commits · 2d ago</p><a>All activity →</a></template>",
      "<style>",
      ".k { text-transform: uppercase; letter-spacing: 0.05em; }",
      "</style>",
    ].join("\n");
    const rules = checkPublicFile({ ...base, text }).map((v) => v.rule);
    expect(rules).toEqual(expect.arrayContaining(["middle-dot", "arrow", "uppercase", "letter-spacing"]));
  });

  it("allows negative letter-spacing and comment lines", () => {
    const text = ["/* a · b and text-transform: uppercase */", ".h { letter-spacing: -0.01em; }"].join("\n");
    expect(checkPublicFile({ ...base, text })).toEqual([]);
  });

  it("holds mono and accent uses to the per-file allowance", () => {
    const text = [".a { font-family: var(--f-m); }", ".b { color: var(--live-ink); }"].join("\n");
    const rules = checkPublicFile({ ...base, text }).map((v) => v.rule);
    expect(rules).toEqual(["mono", "accent"]);
    expect(checkPublicFile({ ...base, text, monoMax: 1, accentMax: 1 })).toEqual([]);
  });

  it("allows an arrow in an allowlisted file", () => {
    const text = "<p>Settings → Privacy</p>";
    expect(checkPublicFile({ ...base, text, allowArrow: true })).toEqual([]);
  });
});

describe("comment dashes", () => {
  it("counts dashes in comments only", () => {
    const text = [`// one ${DASH} two`, `const s = "a ${DASH} b";`, `/* x ${DASH} y */`, `const t = 1; // p ${DASH} q`].join("\n");
    expect(dashLines(text)).toEqual([1, 3, 4]);
  });

  it("rewrites comments and leaves strings alone", () => {
    const text = [`// one ${DASH} two`, `const s = "a ${DASH} b";`, "// range 0" + String.fromCharCode(0x2013) + "4"].join("\n");
    const fixed = fixComments(text);
    expect(fixed.split("\n")[0]).toBe("// one, two");
    expect(fixed.split("\n")[1]).toBe(`const s = "a ${DASH} b";`);
    expect(fixed.split("\n")[2]).toBe("// range 0 to 4");
  });
});
