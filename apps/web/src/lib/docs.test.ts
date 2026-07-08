import { describe, expect, it } from "vitest";
import { buildDocTree, docTitle, rewriteDocLink } from "./docs";

describe("docTitle", () => {
  it("uses the first heading when it's a real title", () => {
    expect(docTitle("# HTTP API\n\nbody", "API")).toBe("HTTP API");
    expect(docTitle("# 0005 — Source contract\n", "adr/0005-source-contract")).toBe(
      "0005 — Source contract",
    );
  });
  it("falls back to a humanized stem when the heading is just the filename", () => {
    expect(docTitle("# ARCHITECTURE.md\n\nx", "ARCHITECTURE")).toBe("Architecture");
    expect(docTitle("no heading here", "DATA-MODEL")).toBe("Data Model");
  });
});

describe("buildDocTree", () => {
  it("splits root docs from folders and puts README first", () => {
    const tree = buildDocTree([
      { slug: "API", title: "HTTP API" },
      { slug: "README", title: "Documentation" },
      { slug: "adr/0002-x", title: "0002" },
      { slug: "adr/README", title: "ADR index" },
      { slug: "adr/0001-x", title: "0001" },
    ]);
    expect(tree.map((g) => g.label)).toEqual(["Overview", "ADR"]);
    expect(tree[0]!.items.map((i) => i.slug)).toEqual(["README", "API"]); // README first
    expect(tree[1]!.items.map((i) => i.slug)).toEqual(["adr/README", "adr/0001-x", "adr/0002-x"]);
  });
});

describe("rewriteDocLink", () => {
  it("leaves external, mailto, anchor, and absolute links alone", () => {
    for (const h of ["https://x.com", "mailto:a@b.c", "#section", "/media/x.webp"]) {
      expect(rewriteDocLink(h, "API")).toBe(h);
    }
  });
  it("rewrites intra-docs .md links to /docs/<slug>, preserving the hash", () => {
    expect(rewriteDocLink("./DATA-MODEL.md#siteview", "api")).toBe("/docs/data-model#siteview");
    expect(rewriteDocLink("./0002-fastify-backend.md", "adr/0001-x")).toBe(
      "/docs/adr/0002-fastify-backend",
    );
  });
  it("rewrites out-of-docs .md links to a GitHub blob URL", () => {
    expect(rewriteDocLink("../README.md", "readme")).toBe(
      "https://github.com/LetsGaming/letsgaming.de/blob/main/README.md",
    );
    expect(rewriteDocLink("../packages/core/README.md", "api")).toBe(
      "https://github.com/LetsGaming/letsgaming.de/blob/main/packages/core/README.md",
    );
    // From within a subfolder, one `..` lands back at the docs root.
    expect(rewriteDocLink("../CONTRIBUTING.md", "adr/readme")).toBe("/docs/contributing");
  });
  it("ignores non-.md relative links", () => {
    expect(rewriteDocLink("./diagram.png", "api")).toBe("./diagram.png");
  });
});
