<script setup lang="ts">
/**
 * The per-row controls of an editable CMS list: move up, move down, delete, save.
 *
 * Three panels (Now, Links, Hobbies) carried this same four-button row, identical
 * down to the arrow glyphs and the `:disabled` bounds arithmetic — the classic
 * shape where a fix lands in one copy and not the other two. They all drive the
 * same list helper, so the row takes that helper and the row index and does the
 * rest itself.
 *
 * `list` is deliberately typed structurally rather than importing the list
 * composable's return type: what this needs is "something that can move, remove
 * and save", and stating exactly that keeps the component usable by any future
 * list without widening an import.
 */
interface EditableList<T> {
  items: { value: T[] };
  moveTo: (from: number, to: number) => void;
  remove: (index: number) => void;
  save: (item: T) => void;
}

const props = defineProps<{
  /** The list helper backing this row (`nowList`, `linksList`, …). */
  list: EditableList<unknown>;
  /** This row's index within the list. */
  index: number;
  /** The item itself, passed back to `save`. */
  item: unknown;
}>();
</script>

<template>
  <button class="link" title="Move up" :disabled="index === 0" @click="props.list.moveTo(index, index - 1)">↑</button>
  <button
    class="link"
    title="Move down"
    :disabled="index === props.list.items.value.length - 1"
    @click="props.list.moveTo(index, index + 1)"
  >↓</button>
  <button class="link danger" @click="props.list.remove(index)">delete</button>
  <button class="btn" @click="props.list.save(props.item)">Save</button>
</template>
