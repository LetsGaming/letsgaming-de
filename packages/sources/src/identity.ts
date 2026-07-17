/**
 * Who the site is about, when nothing says otherwise.
 *
 * A default identity is config, not data — but it was written twice: once in
 * `env.ts` (`GITHUB_USERNAME ?? "LetsGaming"`) and once in the registry, for the
 * caller that passes no username. Two literals, one meaning, in packages that
 * can't see each other. Whichever one you found first would look authoritative.
 *
 * It lives here rather than in `@lg/core` because it's a fact about the GitHub
 * integration, and core holds contracts, not upstream trivia. `env.ts` imports it
 * so the app's default and the library's default are the same string.
 */
export const DEFAULT_GITHUB_USERNAME = "LetsGaming";
