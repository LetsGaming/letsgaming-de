import type { Component } from "vue";
import type { View } from "../../../composables/useCmsNav";
import AboutPanel from "./AboutPanel.vue";
import FeaturedPanel from "./FeaturedPanel.vue";
import GalleryPanel from "./GalleryPanel.vue";
import GuestbookPanel from "./GuestbookPanel.vue";
import HobbiesPanel from "./HobbiesPanel.vue";
import HomeIntroPanel from "./HomeIntroPanel.vue";
import LinksPanel from "./LinksPanel.vue";
import MusicPanel from "./MusicPanel.vue";
import NowPanel from "./NowPanel.vue";
import PlaytimePanel from "./PlaytimePanel.vue";
import PostsPanel from "./PostsPanel.vue";
import WrappedPanel from "./WrappedPanel.vue";

/**
 * The panel that edits each kind of module, mounted in the editor rail's Selected tab.
 *
 * The same components the CMS's own nav mounts: they take everything from
 * `cmsContext`, so rendering one beside the page it changes costs nothing and shares
 * no state. Every non-null value of `PANEL_FOR_KIND` must be a key here. Site identity
 * and presence privacy have no entry: they live in Settings.
 */
export const PANEL: Partial<Record<View, Component>> = {
  home: HomeIntroPanel,
  about: AboutPanel,
  hobbies: HobbiesPanel,
  links: LinksPanel,
  now: NowPanel,
  posts: PostsPanel,
  gallery: GalleryPanel,
  guestbook: GuestbookPanel,
  music: MusicPanel,
  playtime: PlaytimePanel,
  wrapped: WrappedPanel,
  featured: FeaturedPanel,
};
