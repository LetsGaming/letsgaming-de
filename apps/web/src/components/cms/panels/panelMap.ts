import type { Component } from "vue";
import type { View } from "../../../composables/useCmsNav";
import AboutPanel from "./AboutPanel.vue";
import GalleryPanel from "./GalleryPanel.vue";
import GuestbookPanel from "./GuestbookPanel.vue";
import HobbiesPanel from "./HobbiesPanel.vue";
import HomeIntroPanel from "./HomeIntroPanel.vue";
import LinksPanel from "./LinksPanel.vue";
import MusicPanel from "./MusicPanel.vue";
import NowPanel from "./NowPanel.vue";
import PlaytimePanel from "./PlaytimePanel.vue";
import PostsPanel from "./PostsPanel.vue";
import PresencePanel from "./PresencePanel.vue";
import SiteIdentityPanel from "./SiteIdentityPanel.vue";
import WrappedPanel from "./WrappedPanel.vue";

/**
 * The panel that edits each kind of module.
 *
 * The same components the CMS's own nav mounts: they take everything from
 * `cmsContext`, so rendering one beside the page it changes shares no state.
 * Every non-null value of `PANEL_FOR_KIND` must be a key here.
 */
export const PANEL: Partial<Record<View, Component>> = {
  site: SiteIdentityPanel,
  home: HomeIntroPanel,
  about: AboutPanel,
  hobbies: HobbiesPanel,
  links: LinksPanel,
  now: NowPanel,
  posts: PostsPanel,
  gallery: GalleryPanel,
  guestbook: GuestbookPanel,
  presence: PresencePanel,
  music: MusicPanel,
  playtime: PlaytimePanel,
  wrapped: WrappedPanel,
};
