<script setup lang="ts">
/** A left-aligned on/off switch with its label inline (the default slot). */
const on = defineModel<boolean>({ required: true });
</script>

<template>
  <label class="tswitch">
    <input v-model="on" type="checkbox" role="switch" class="tsinput" />
    <span class="tstrack" aria-hidden="true"><span class="tsknob"></span></span>
    <span class="tslabel"><slot /></span>
  </label>
</template>

<style scoped>
.tswitch {
  display: inline-flex;
  flex-direction: row;
  align-items: center;
  gap: var(--sp-10);
  cursor: pointer;
  font-family: var(--f-b);
  font-size: 14px;
  color: var(--ink);
}
.tsinput {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
}
.tstrack {
  position: relative;
  flex: none;
  width: 36px;
  height: 20px;
  border-radius: 999px;
  background: var(--card-2);
  border: 1px solid var(--line);
  transition: background var(--dur-fast) var(--ease-out);
}
.tsknob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--muted);
  transition:
    transform var(--dur-fast) var(--ease-out),
    background var(--dur-fast) var(--ease-out);
}
.tsinput:checked + .tstrack {
  background: var(--purple);
  border-color: var(--purple);
}
.tsinput:checked + .tstrack .tsknob {
  transform: translateX(16px);
  background: var(--ink-strong);
}
.tsinput:focus-visible + .tstrack {
  outline: 2px solid var(--purple);
  outline-offset: 2px;
}
</style>
