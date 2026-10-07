/**
 * Whether a repository preview is GitHub's generated card rather than an image the
 * owner uploaded. The generated card is a fixed white image with dark text, so the
 * dark theme adapts it; an uploaded preview is the owner's own design and is shown
 * exactly as it is.
 */
export function isGeneratedRepoCard(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url).hostname === "opengraph.githubassets.com";
  } catch {
    return false;
  }
}
