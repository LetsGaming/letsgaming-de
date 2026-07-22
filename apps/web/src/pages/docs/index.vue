<script setup lang="ts">
// `/docs` has no page of its own — README is the entry point. A real redirect, so
// the canonical URL is the one the visitor ends up on.
await navigateTo("/docs/readme", { redirectCode: 302 });
</script>
