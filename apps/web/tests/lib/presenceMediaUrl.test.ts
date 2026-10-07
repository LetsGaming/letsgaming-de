import { describe, expect, it } from "vitest";
import { presenceMediaUrl } from "../../src/lib/api";

const params = (url: string | undefined) => new URL(url ?? "", "http://x").searchParams;

describe("presenceMediaUrl", () => {
  it("carries the upstream url and the game name", () => {
    const p = params(presenceMediaUrl({ url: "https://cdn.example/a.png", game: "Minecraft" }));
    expect(p.get("u")).toBe("https://cdn.example/a.png");
    expect(p.get("game")).toBe("Minecraft");
    expect(p.has("theme")).toBe(false);
  });

  it("asks for the dark version only when told to", () => {
    expect(params(presenceMediaUrl({ url: "https://cdn.example/a.png", theme: "dark" })).get("theme")).toBe("dark");
    expect(params(presenceMediaUrl({ url: "https://cdn.example/a.png" })).has("theme")).toBe(false);
  });

  it("has nothing to show without a url or a game", () => {
    expect(presenceMediaUrl({})).toBeUndefined();
  });
});
