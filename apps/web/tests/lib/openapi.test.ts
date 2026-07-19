import { describe, expect, it } from "vitest";
import { API_NAV_LINK, loadApiReference, withApiNav } from "../../src/lib/openapi";
import type { DocGroup } from "../../src/lib/docs";

describe("withApiNav", () => {
  it("prepends a Reference group with the API link, leaving the rest intact", () => {
    const tree: DocGroup[] = [{ label: "Overview", items: [{ slug: "readme", title: "Readme" }] }];
    const out = withApiNav(tree);
    expect(out[0]).toEqual({ label: "Reference", items: [API_NAV_LINK] });
    expect(out[1]).toBe(tree[0]);
    expect(API_NAV_LINK.slug).toBe("api");
  });

  it("does not mutate the input", () => {
    const tree: DocGroup[] = [];
    withApiNav(tree);
    expect(tree).toHaveLength(0);
  });
});

describe("loadApiReference", () => {
  // Reads the real repo-root openapi.yml (same ../../ resolution the build uses),
  // so this doubles as a smoke test that the spec parses and stays well-formed.
  const ref = loadApiReference();

  it("parses info and servers", () => {
    expect(ref.info.title).toMatch(/backend API/i);
    expect(ref.info.version).toMatch(/^\d+\.\d+/);
    expect(ref.servers.length).toBeGreaterThan(0);
  });

  it("groups every operation under a declared tag", () => {
    const ops = ref.groups.flatMap((g) => g.operations);
    expect(ops.length).toBeGreaterThan(20);
    // No operation lands in a synthetic "Other" bucket → every tag is declared.
    expect(ref.groups.some((g) => g.tag === "Other")).toBe(false);
  });

  it("marks public endpoints and resolves response schema refs by name", () => {
    const presence = ref.groups.flatMap((g) => g.operations).find((o) => o.path === "/api/presence");
    expect(presence?.public).toBe(true);
    expect(presence?.responses.find((r) => r.status === "200")?.schema).toBe("PresenceView");
  });

  it("marks CMS endpoints as authenticated", () => {
    const put = ref.groups
      .flatMap((g) => g.operations)
      .find((o) => o.path === "/api/cms/meta" && o.method === "PUT");
    expect(put?.public).toBe(false);
  });

  it("exposes named schemas with typed fields", () => {
    const health = ref.schemas.find((s) => s.name === "Health");
    expect(health).toBeDefined();
    expect(health?.fields.map((f) => f.name)).toEqual(expect.arrayContaining(["status", "time"]));
  });
});
