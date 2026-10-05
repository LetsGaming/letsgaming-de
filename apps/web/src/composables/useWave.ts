import { onMounted, ref, type Ref } from "vue";
import { STORAGE_KEY } from "@lg/core";
import { postWave } from "../lib/reactions-api";

const WAVED = "1";

/**
 * The hero's one-click wave. The count updates optimistically and is rolled back
 * if the server refuses (network error or rate limit). Whether this browser
 * already waved is remembered locally only to disable the button; it never
 * reaches the server.
 */
export function useWave(initial: number) {
  const count: Ref<number> = ref(initial);
  const waved = ref(false);

  onMounted(() => {
    try {
      waved.value = localStorage.getItem(STORAGE_KEY.waved) === WAVED;
    } catch {
      /* storage blocked: the button simply stays enabled */
    }
  });

  async function wave() {
    if (waved.value) return;
    waved.value = true;
    count.value += 1;
    const total = await postWave();
    if (total === null) {
      waved.value = false;
      count.value -= 1;
      return;
    }
    count.value = total;
    try {
      localStorage.setItem(STORAGE_KEY.waved, WAVED);
    } catch {
      /* private mode */
    }
  }

  return { count, waved, wave };
}
