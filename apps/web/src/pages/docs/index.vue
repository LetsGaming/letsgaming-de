<script setup lang="ts">
// `/docs` has no page of its own — README is the entry point. A real redirect, so
// the canonical URL is the one the visitor ends up on.
//
// 308, not 302: this will always resolve to README, and a temporary code tells a
// crawler to keep `/docs` in the index and re-check it forever instead of
// consolidating onto the target. Same reasoning (and same code) as the canonical
// area redirect in `[area].vue`.
await navigateTo("/docs/readme", { redirectCode: 308 });
</script>
