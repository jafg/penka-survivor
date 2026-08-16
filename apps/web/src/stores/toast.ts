import { defineStore } from 'pinia';
import { ref } from 'vue';

/**
 * How long a toast stays up, in milliseconds. The prototype's value — long
 * enough to read a team name, short enough not to sit over the action bar.
 */
const VISIBLE_MS = 3600;

/**
 * The one-line notice at the bottom of the screen.
 *
 * It is a store rather than a prop chain because the things worth announcing —
 * a confirmed pick, a rejected one, a lost connection — happen in stores and
 * views that have no ancestor in common.
 *
 * The text is always the API's own message when there is one. Rewriting a
 * server error here would put two vocabularies in front of the player for the
 * same failure.
 */
export const useToastStore = defineStore('toast', () => {
  const message = ref('');
  const isError = ref(false);
  const isVisible = ref(false);

  let timer: ReturnType<typeof setTimeout> | null = null;

  function announce(text: string, failed: boolean): void {
    message.value = text;
    isError.value = failed;
    isVisible.value = true;
    // A replacement restarts the clock: the second message gets its full read,
    // not whatever the first one had left.
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(hide, VISIBLE_MS);
  }

  function show(text: string): void {
    announce(text, false);
  }

  function error(text: string): void {
    announce(text, true);
  }

  function hide(): void {
    isVisible.value = false;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  return { message, isError, isVisible, show, error, hide };
});
