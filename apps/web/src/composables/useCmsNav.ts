import { onMounted, onUnmounted, ref } from "vue";

/**
 * Which CMS panel is open, and keeping that in the URL.
 *
 * Lifted out of `useCms`, which had grown to own auth, content, saves, preview,
 * analytics *and* routing in one 682-line function. Routing is the most separable
 * of those: it needs no API client, no content model and no session — just the
 * list of panels and the address bar. Split out, it's also the only part of the
 * CMS that can be tested without mounting anything.
 *
 * The vocabulary (`VIEWS`, `NAV_GROUPS`, `VIEW_TITLES`) lives here too, since it's
 * the same fact stated three ways and nothing outside navigation reads it.
 *
 * ## Why the hash
 *
 * Reloading used to dump you back on Dashboard: the panel was a ref and nothing
 * else, so the one thing you were doing was the one thing the page didn't
 * remember. Sixteen panels deep in the Layout screen, F5 is a punishment.
 *
 * The hash, not localStorage. It survives a reload the same, and it also makes
 * `/admin#analytics` a link you can bookmark, back/forward step through the panels
 * you visited, and two open tabs stop fighting over one stored key — a storage key
 * would mean the tab you *last clicked in* decides where the other one reopens.
 *
 * This isn't a walk-back of ADR 0003. That's routes-over-hash for the *site*,
 * because hidden must be hidden and a shared link has to unfurl as what it points
 * at. Neither is true of an authed single-page admin that renders nothing server
 * side: here the hash is the whole address.
 */

/**
 * The panels, in nav order.
 *
 * A list rather than a bare union, because the URL now names one: a hash is a
 * string a stranger can type, so turning it back into a `View` needs a runtime
 * check, and `Object.keys(VIEW_TITLES) as View[]` would be a cast — a check that
 * cannot fail. The type derives from this, so the two can't disagree.
 */
const VIEWS = [
  "dashboard",
  "site",
  "home",
  "about",
  "hobbies",
  "links",
  "now",
  "editor",
  "posts",
  "gallery",
  "library",
  "presence",
  "music",
  "playtime",
  "wrapped",
  "guestbook",
  "analytics",
] as const;

export type View = (typeof VIEWS)[number];

/** Where the CMS opens when the URL doesn't say. */
const DEFAULT_VIEW: View = "dashboard";

// Grouped left-nav, so it's obvious what each screen edits (a small WP/Typo3 shape).
export const NAV_GROUPS: { label: string; items: { id: View; label: string }[] }[] = [
  { label: "", items: [{ id: "dashboard", label: "Dashboard" }] },
  { label: "", items: [{ id: "editor", label: "Editor" }] },
  {
    label: "Content",
    items: [
      { id: "site", label: "Site identity" },
      { id: "home", label: "Home intro" },
      { id: "about", label: "About / bio" },
      { id: "hobbies", label: "Hobbies" },
      { id: "links", label: "Links" },
      { id: "now", label: "Right now" },
    ],
  },
  {
    label: "Structure & media",
    items: [
      { id: "posts", label: "Blog" },
      { id: "library", label: "Asset library" },
      { id: "gallery", label: "Gallery" },
    ],
  },
  {
    label: "Widgets",
    items: [
      { id: "presence", label: "Presence" },
      { id: "music", label: "Listening" },
      { id: "playtime", label: "Played" },
      { id: "wrapped", label: "Wrapped" },
    ],
  },
  { label: "Community", items: [{ id: "guestbook", label: "Guestbook" }] },
  { label: "Insights", items: [{ id: "analytics", label: "Analytics" }] },
];

export const VIEW_TITLES: Record<View, string> = {
  dashboard: "Dashboard",
  wrapped: "Wrapped",
  site: "Site identity",
  home: "Home intro",
  about: "About / bio",
  hobbies: "Hobbies",
  links: "Links",
  now: "Right now",
  editor: "Editor — arrange and write",
  posts: "Blog",
  library: "Asset library",
  gallery: "Gallery",
  presence: "Presence widget",
  music: "Listening list",
  playtime: "Played list",
  guestbook: "Guestbook",
  analytics: "Analytics",
};

const isView = (value: unknown): value is View =>
  typeof value === "string" && VIEWS.includes(value as View);

/** The panel named by the current URL, or the default. Unknown hashes (a stale
 *  bookmark, a renamed panel) fall back rather than rendering nothing. */
function viewFromHash(): View {
  if (typeof window === "undefined") return DEFAULT_VIEW;
  const id = decodeURIComponent(window.location.hash.replace(/^#/, ""));
  return isView(id) ? id : DEFAULT_VIEW;
}

export function useCmsNav(opts: {
  /**
   * Run when a panel opens, including the restore on mount.
   *
   * Opening a panel has consequences elsewhere — the guestbook and analytics
   * panels lazy-load on first view, and the preview follows the area you're
   * editing. Those are the caller's business, not routing's: this module would
   * otherwise have to import the API client and the preview state to decide which
   * panel triggers what, which is how the god composable got that way.
   */
  onOpen?: (view: View) => void;
}) {
  const tab = ref<View>(DEFAULT_VIEW);

  /**
   * Open a panel.
   *
   * `push` distinguishes a click (a new history entry, so Back returns you) from
   * restoring what the URL already says (no entry — pushing there would trap Back
   * on the admin page).
   */
  function pick(view: View, push = true) {
    tab.value = view;
    opts.onOpen?.(view);
    if (push && typeof window !== "undefined" && viewFromHash() !== view) {
      window.location.hash = view;
    }
  }

  /** Back/forward, and someone editing the address bar. */
  function onHashChange() {
    const next = viewFromHash();
    if (next !== tab.value) pick(next, false);
  }

  onMounted(() => {
    // Restore before boot: the gate may render first, but the panel behind it is
    // already the one the URL names, so signing in lands where you left off.
    pick(viewFromHash(), false);
    window.addEventListener("hashchange", onHashChange);
  });
  onUnmounted(() => {
    window.removeEventListener("hashchange", onHashChange);
  });

  return { tab, pick, NAV_GROUPS, VIEW_TITLES };
}
