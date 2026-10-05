import { describe, expect, it } from "vitest";
import type { Asset } from "@lg/core";
import {
  MAX_UPLOAD_BYTES,
  allowedFor,
  hasFiles,
  resolveDropTarget,
  runUploads,
  validateUpload,
  type UploadItem,
} from "../../src/lib/upload";

const file = (name: string, type: string, size = 10) => {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
};
const asset = (id: string) => ({ id }) as Asset;

describe("validateUpload", () => {
  it("accepts supported types and rejects unknown or oversized files", () => {
    expect(validateUpload(file("a.png", "image/png"))).toBeNull();
    expect(validateUpload(file("a.exe", "application/x-msdownload"))).toMatch(/not a supported/);
    expect(validateUpload(file("big.png", "image/png", MAX_UPLOAD_BYTES + 1))).toMatch(/over 20 MB/);
  });
  it("honours a locked kind, with gifs counting as images", () => {
    expect(validateUpload(file("a.pdf", "application/pdf"), allowedFor("image"))).toMatch(/wrong type/);
    expect(validateUpload(file("a.gif", "image/gif"), allowedFor("image"))).toBeNull();
    expect(validateUpload(file("a.svg", "image/svg+xml"), allowedFor("svg"))).toBeNull();
    expect(allowedFor("")).toBeUndefined();
  });
});

describe("runUploads", () => {
  it("reports progress, keeps going after a failure, and returns the successes", async () => {
    const seen: UploadItem[][] = [];
    const done = await runUploads(
      [file("a.png", "image/png"), file("bad.png", "image/png"), file("c.exe", "x/y"), file("d.png", "image/png")],
      {
        send: async (f, onProgress) => {
          onProgress(0.5);
          if (f.name === "bad.png") throw new Error("boom");
          return asset(f.name);
        },
        onChange: (items) => seen.push(items),
      },
    );
    expect(done.map((a) => a.id)).toEqual(["a.png", "d.png"]);
    const last = seen.at(-1)!;
    expect(last.map((i) => i.status)).toEqual(["done", "error", "error", "done"]);
    expect(last[1]!.error).toBe("boom");
    expect(last[2]!.error).toMatch(/not a supported/);
    expect(seen.some((s) => s[0]!.status === "uploading" && s[0]!.progress === 0.5)).toBe(true);
  });
});

describe("drop targets", () => {
  it("only galleries take images", () => {
    expect(resolveDropTarget("gallery")).toEqual({ accepts: true });
    expect(resolveDropTarget("hero")).toMatchObject({ accepts: false });
    expect(resolveDropTarget(undefined)).toMatchObject({ accepts: false });
  });
  it("tells external file drags from in-page ones", () => {
    expect(hasFiles({ types: ["Files"] } as unknown as DataTransfer)).toBe(true);
    expect(hasFiles({ types: ["text/plain"] } as unknown as DataTransfer)).toBe(false);
    expect(hasFiles(null)).toBe(false);
  });
});
