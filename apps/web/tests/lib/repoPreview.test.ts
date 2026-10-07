import { describe, expect, it } from "vitest";
import { isGeneratedRepoCard } from "../../src/lib/repoPreview";

describe("isGeneratedRepoCard", () => {
  it("recognises GitHub's generated social card", () => {
    expect(isGeneratedRepoCard("https://opengraph.githubassets.com/1/LetsGaming/letsgaming-de")).toBe(true);
  });

  it("leaves an uploaded preview alone", () => {
    expect(isGeneratedRepoCard("https://repository-images.githubusercontent.com/123/abc-def")).toBe(false);
  });

  it("does not trust a look-alike host", () => {
    expect(isGeneratedRepoCard("https://opengraph.githubassets.com.evil.example/x")).toBe(false);
    expect(isGeneratedRepoCard("https://evil.example/opengraph.githubassets.com/x")).toBe(false);
  });

  it("is false for nothing or for garbage", () => {
    expect(isGeneratedRepoCard(undefined)).toBe(false);
    expect(isGeneratedRepoCard("")).toBe(false);
    expect(isGeneratedRepoCard("not a url")).toBe(false);
  });
});
