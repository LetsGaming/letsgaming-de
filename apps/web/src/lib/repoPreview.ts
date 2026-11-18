/**
 * Whether a repository preview is GitHub's generated card rather than an image the
 * owner uploaded. The generated card is a fixed white image with dark text.
 */
export function isGeneratedRepoCard(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url).hostname === "opengraph.githubassets.com";
  } catch {
    return false;
  }
}

/** The owner's own preview image, or undefined when there is none or only GitHub's generated card. */
export function ownPreview(url: string | undefined): string | undefined {
  return url && !isGeneratedRepoCard(url) ? url : undefined;
}
