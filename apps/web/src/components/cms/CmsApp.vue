<script setup lang="ts">
import { useCms } from "../../composables/useCms";
import AssetLibrary from "./AssetLibrary.vue";
// Global (un-scoped) admin styles, namespaced under `.cms`. Global rather than
// scoped so the per-panel child components below are styled by the same rules —
// see styles/cms.css.
import "../../styles/cms.css";
import { provide } from "vue";
import { CMS_KEY } from "../../composables/cmsContext";
import AboutPanel from "./panels/AboutPanel.vue";
import AnalyticsPanel from "./panels/AnalyticsPanel.vue";
import DashboardPanel from "./panels/DashboardPanel.vue";
import GalleryPanel from "./panels/GalleryPanel.vue";
import GuestbookPanel from "./panels/GuestbookPanel.vue";
import HobbiesPanel from "./panels/HobbiesPanel.vue";
import HomeIntroPanel from "./panels/HomeIntroPanel.vue";
import LayoutPanel from "./panels/LayoutPanel.vue";
import LibraryPanel from "./panels/LibraryPanel.vue";
import LinksPanel from "./panels/LinksPanel.vue";
import NowPanel from "./panels/NowPanel.vue";
import PresencePanel from "./panels/PresencePanel.vue";
import PreviewPanel from "./panels/PreviewPanel.vue";
import SiteIdentityPanel from "./panels/SiteIdentityPanel.vue";

const context = useCms();
provide(CMS_KEY, context);

// Only the app chrome (gate, sidebar, topbar, dock, toast, picker) reads from
// the context here; each panel injects what it needs via useCmsContext().
const {
	NAV_GROUPS,
	VIEW_TITLES,
	authed,
	login,
	loading,
	tab,
	locale,
	tokenInput,
	toast,
	hobbies,
	links,
	now,
	analytics,
	layoutAreas,
	gallery,
	guestbook,
	pickerOpen,
	pickerOnly,
	onPick,
	closePicker,
	signIn,
	signOut,
	pick,
	previewArea,
	previewKey,
	showDock,
	previewSrc,
	areaLabel,
	viewSite,
	cms,
} = context;
</script>

<template>
  <div class="cms" :class="{ wide: showDock && authed && tab !== 'preview' }">
    <div v-if="loading" class="center muted">Loading…</div>

    <!-- LOGIN GATE -->
    <div v-else-if="!authed" class="gate">
      <h1>CMS</h1>
      <p class="muted">Sign in to edit letsgaming.de.</p>
      <a class="btn primary" :href="cms.loginUrl()">Sign in with GitHub</a>
      <div class="or">or paste a CMS token</div>
      <input v-model="tokenInput" type="password" placeholder="CMS_TOKEN" @keyup.enter="signIn" />
      <button class="btn" @click="signIn">Use token</button>
    </div>

    <!-- APP -->
    <div v-else class="shell">
      <aside class="side">
        <div class="brand">CMS</div>
        <nav class="nav">
          <div v-for="(g, gi) in NAV_GROUPS" :key="gi" class="navgroup">
            <div v-if="g.label" class="navlabel">{{ g.label }}</div>
            <button
              v-for="item in g.items"
              :key="item.id"
              :class="{ on: tab === item.id }"
              @click="pick(item.id)"
            >
              {{ item.label }}
              <span v-if="item.id === 'guestbook' && guestbook?.pending" class="ndot">{{ guestbook.pending }}</span>
            </button>
          </div>
        </nav>
        <div class="sidefoot">
          <select v-model="locale" title="Editing locale">
            <option value="en">EN</option>
            <option value="de">DE</option>
          </select>
          <span class="muted">{{ login }}</span>
          <button class="link" @click="signOut">sign out</button>
        </div>
      </aside>

      <main class="main">
        <div class="topbar">
          <h2>{{ VIEW_TITLES[tab] }}</h2>
          <div class="topact">
            <button v-if="tab !== 'preview'" class="link" @click="showDock = !showDock">
              {{ showDock ? "Hide preview" : "Show preview" }}
            </button>
            <button class="btn ghost" @click="viewSite">View site ↗</button>
          </div>
        </div>

        <div class="worksplit">
          <div class="editor">

        <!-- DASHBOARD -->
        <DashboardPanel v-show="tab === 'dashboard'" />

        <!-- SITE IDENTITY -->
        <SiteIdentityPanel v-show="tab === 'site'" />

        <!-- HOME INTRO -->
        <HomeIntroPanel v-show="tab === 'home'" />

        <!-- ABOUT / BIO -->
        <AboutPanel v-show="tab === 'about'" />

        <!-- PRESENCE -->
        <PresencePanel v-show="tab === 'presence'" />

      <!-- ASSET LIBRARY -->
      <LibraryPanel v-show="tab === 'library'" />

      <!-- LAYOUT (module order per area) -->
      <LayoutPanel v-show="tab === 'layout'" />

      <!-- HOBBIES -->
      <HobbiesPanel v-show="tab === 'hobbies'" />

      <!-- LINKS -->
      <LinksPanel v-show="tab === 'links'" />

      <!-- NOW -->
      <NowPanel v-show="tab === 'now'" />

      <!-- GALLERY (images placed on the site, chosen from the library) -->
      <GalleryPanel v-show="tab === 'gallery'" />

      <!-- GUESTBOOK MODERATION -->
      <GuestbookPanel v-show="tab === 'guestbook'" />

      <!-- ANALYTICS -->
      <AnalyticsPanel v-show="tab === 'analytics'" />

        <!-- PREVIEW -->
        <PreviewPanel v-show="tab === 'preview'" />
          </div><!-- /.editor -->

          <!-- DOCKED LIVE PREVIEW (side-by-side while editing) -->
          <aside v-if="showDock && tab !== 'preview'" class="dock">
            <div class="dockbar">
              <span class="muted">Live preview · <b>{{ areaLabel(previewArea) }}</b></span>
              <span class="dockact">
                <select v-model="previewArea" title="Area to preview">
                  <option v-for="a in layoutAreas" :key="a.id" :value="a.id">{{ a.label }}</option>
                </select>
                <button class="link" title="Reload" @click="previewKey++">⟳</button>
                <button class="link" title="Open in new tab" @click="viewSite">↗</button>
              </span>
            </div>
            <iframe
              :key="'dock-' + previewKey + '-' + previewArea"
              class="dockframe"
              :src="previewSrc"
              title="Live preview"
            />
          </aside>
        </div><!-- /.worksplit -->
      </main>

      <div v-if="toast" class="toast">{{ toast }}</div>

      <!-- Asset picker (reused across fields): the library in pick mode -->
      <div v-if="pickerOpen" class="pickmask" @click.self="closePicker">
        <div class="pickbox">
          <div class="pickhead">
            <b>Choose an asset</b>
            <button class="link" @click="closePicker">close</button>
          </div>
          <AssetLibrary pick :only="pickerOnly" @select="onPick" />
        </div>
      </div>
    </div>
  </div>
</template>
