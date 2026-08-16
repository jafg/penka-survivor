import { defineStore } from 'pinia';
import { ref } from 'vue';

/**
 * How long a toast stays up, in milliseconds. The prototype's value — longer
 * than the player app's, because an operator's notices carry counts and error
 * codes rather than a team name.
 */
const VISIBLE_MS = 4200;

/**
 * The one-line notice in the bottom-right corner.
 *
 * A store rather than a prop chain because the things worth announcing — a
 * result written, a matchday closed, a resolve refused — happen in stores and
 * panels that have no ancestor in common.
 *
 * The text is always the API's own message when there is one. Rewriting a server
 * error here would put two vocabularies in front of the operator for the same
 * failure, and the operator is the person most likely to be reading the API's
 * wording elsewhere.
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
