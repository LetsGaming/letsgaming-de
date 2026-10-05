<script setup lang="ts">
import { useCms } from "../../composables/useCms";
import SmartLink from "../ui/SmartLink.vue";

// Compile-time constant: false in a production build, so the dev sign-in button
// below is tree-shaken out rather than merely hidden.
const isDev = import.meta.dev;
import AssetLibrary from "./AssetLibrary.vue";
// Global (un-scoped) admin styles, namespaced under `.cms`. Global rather than
// scoped so the per-panel child components below are styled by the same rules —
// see styles/cms.css.
import "../../styles/cms.css";
import { computed, provide } from "vue";
import { CMS_KEY } from "../../composables/cmsContext";
import AnalyticsPanel from "./panels/AnalyticsPanel.vue";
import DashboardPanel from "./panels/DashboardPanel.vue";
import EditorPanel from "./panels/EditorPanel.vue";
import GuestbookPanel from "./panels/GuestbookPanel.vue";
import PostsPanel from "./panels/PostsPanel.vue";
import LibraryPanel from "./panels/LibraryPanel.vue";
import SettingsPanel from "./panels/SettingsPanel.vue";

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
	areaLabel,
	viewSite,
	cms,
} = context;

/** Pending-count badges by nav id. Add an entry here to badge another sidebar item. */
const navBadges = computed<Record<string, number>>(() => ({
	guestbook: guestbook.value?.pending ?? 0,
}));
</script>

<template>
  <div class="cms">
    <div v-if="loading" class="center muted">Loading…</div>

    <!-- LOGIN GATE -->
    <div v-else-if="!authed" class="gate">
      <h1>CMS</h1>
      <p class="muted">Sign in to edit letsgaming.de.</p>
      <SmartLink class="btn primary" :href="cms.loginUrl()" target="_self">Sign in with GitHub</SmartLink>
      <!-- Local development only. `import.meta.dev` is a compile-time constant, so
           this block is removed from the production bundle rather than hidden in
           it — and the route behind it isn't registered in production either. -->
      <SmartLink v-if="isDev" class="btn dev-login" :href="cms.devLoginUrl()" target="_self">
        Dev sign-in (localhost)
      </SmartLink>
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
              <span v-if="navBadges[item.id]" class="ndot">{{ navBadges[item.id] }}</span>
            </button>
          </div>
        </nav>
        <div class="sidefoot">
          <select v-model="locale" title="The language you are writing content in" aria-label="Content language">
            <option value="en">Content: EN</option>
            <option value="de">Content: DE</option>
          </select>
          <span class="muted">{{ login }}</span>
          <button class="link" @click="signOut">sign out</button>
        </div>
      </aside>

      <main class="main">
        <div class="topbar">
          <h2>{{ VIEW_TITLES[tab] }}</h2>
          <div class="topact">
            <button class="btn ghost" @click="viewSite">View site ↗</button>
          </div>
        </div>


        <!-- DASHBOARD -->
        <DashboardPanel v-show="tab === 'dashboard'" />

      <!-- ASSET LIBRARY -->
      <LibraryPanel v-show="tab === 'library'" />

      <EditorPanel v-if="tab === 'editor'" />
      <PostsPanel v-if="tab === 'posts'" />

      <!-- GUESTBOOK MODERATION -->
      <GuestbookPanel v-show="tab === 'guestbook'" />

      <!-- ANALYTICS -->
      <AnalyticsPanel v-show="tab === 'analytics'" />

      <!-- SETTINGS -->
      <SettingsPanel v-if="tab === 'settings'" />


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
