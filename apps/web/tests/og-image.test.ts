import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { OG_IMAGE_PATH } from "../src/lib/site-meta";

const png = readFileSync(resolve(process.cwd(), "src/public/og-image.png"));

describe("social preview card", () => {
  it("is a 1200 x 630 PNG", () => {
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
  });

  it("stays small enough for every platform (under 300 KB)", () => {
    expect(png.length).toBeLessThan(300 * 1024);
  });

  it("is served from the committed file, with a cache-busting query", () => {
    expect(OG_IMAGE_PATH).toMatch(/^\/og-image\.png\?v=\d+$/);
  });
});
