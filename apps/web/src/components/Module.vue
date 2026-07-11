<script setup lang="ts">
import type { Component } from "vue";
import type { ResolvedModule } from "@lg/core";
import HeroSection from "./sections/HeroSection.vue";
import FeaturedSection from "./sections/FeaturedSection.vue";
import GlanceSection from "./sections/GlanceSection.vue";
import ActivitySection from "./sections/ActivitySection.vue";
import HighlightsSection from "./sections/HighlightsSection.vue";
import CodingSection from "./sections/CodingSection.vue";
import ProjectsSection from "./sections/ProjectsSection.vue";
import HobbiesSection from "./sections/HobbiesSection.vue";
import NowSection from "./sections/NowSection.vue";
import GuestbookSection from "./sections/GuestbookSection.vue";
import GallerySection from "./sections/GallerySection.vue";
import PresenceSection from "./sections/PresenceSection.vue";
import BioSection from "./sections/BioSection.vue";
import ContactSection from "./sections/ContactSection.vue";

defineProps<{
  module: ResolvedModule;
  go: (id: string) => void;
  goAnchor?: (target: string) => void;
}>();

// One component per module kind. Typing the map as Record<kind, …> makes it
// exhaustive: adding a module kind without a section here is a compile error.
const sections: Record<ResolvedModule["kind"], Component> = {
  hero: HeroSection,
  featured: FeaturedSection,
  glance: GlanceSection,
  activity: ActivitySection,
  highlights: HighlightsSection,
  coding: CodingSection,
  projects: ProjectsSection,
  hobbies: HobbiesSection,
  now: NowSection,
  guestbook: GuestbookSection,
  gallery: GallerySection,
  presence: PresenceSection,
  bio: BioSection,
  contact: ContactSection,
};
</script>

<template>
  <component :is="sections[module.kind]" :module="module" :go="go" :go-anchor="goAnchor" />
</template>
