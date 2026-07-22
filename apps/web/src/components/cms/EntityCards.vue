<script setup lang="ts" generic="T extends ListEntity">
/**
 * An editable CMS list, rendered as a stack of cards with an add button.
 *
 * `useEntityList` made the CRUD shared and `ListItemActions` made the row of
 * buttons shared, but the frame between them stayed copied three times: the same
 * `v-for` over `items.value`, the same `.card` wrapper, the same `.actions` row,
 * the same `+ Add …` button. Three copies is where the Rule of Three lands, and
 * the frame is the part with no per-entity meaning at all.
 *
 * The fields *are* per-entity, so they come through a scoped slot with the item
 * and its index. A panel is now its fields and nothing else.
 */
import type { ListEntity } from "../../composables/useEntityList";
import ListItemActions from "./ListItemActions.vue";

interface EditableList<I extends ListEntity> {
  items: { value: I[] };
  add: () => void;
  moveTo: (from: number, to: number) => void;
  remove: (index: number) => void;
  save: (item: I) => void;
}

defineProps<{
  list: EditableList<T>;
  /** Label for the add button, e.g. "+ Add hobby". */
  addLabel: string;
}>();

defineSlots<{
  /** The entity's own fields. */
  default: (props: { item: T; index: number }) => unknown;
}>();
</script>

<template>
  <div v-for="(item, i) in list.items.value" :key="item.id" class="card">
    <slot :item="item" :index="i" />
    <div class="actions">
      <ListItemActions :list="list" :index="i" :item="item" />
    </div>
  </div>
  <button class="btn ghost" type="button" @click="list.add()">{{ addLabel }}</button>
</template>
