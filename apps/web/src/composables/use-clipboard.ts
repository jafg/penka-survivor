import { useToastStore } from '../stores/toast';

export interface Clipboard {
  /**
   * Copy `text`, announcing `announcement` on success. Answers whether the write
   * landed, for a caller that wants to draw a "copiado" state.
   */
  copy: (text: string, announcement: string) => Promise<boolean>;
}

/**
 * Copying, with the failure the API actually has.
 *
 * `navigator.clipboard` is only defined in a **secure context** — HTTPS or
 * localhost — so on a stack served over plain HTTP it is `undefined` rather than
 * a method that rejects, and the browser can still refuse the write afterwards
 * (`NotAllowedError`) when the click is not treated as a user gesture. Both are
 * ordinary states, not bugs, which is why this returns a boolean instead of
 * throwing.
 *
 * There is no `document.execCommand('copy')` fallback: it is deprecated, needs a
 * throwaway node and a selection, and buys nothing here — every caller has the
 * text on screen already, so the honest failure is to say "it is right there"
 * and let the player read it.
 */
export function useClipboard(): Clipboard {
  const toast = useToastStore();

  async function copy(text: string, announcement: string): Promise<boolean> {
    try {
      // Reached through `navigator` on purpose: destructuring `writeText` would
      // drop its `this`, and a missing `clipboard` throws here into the catch.
      await navigator.clipboard.writeText(text);
      toast.show(announcement);
      return true;
    } catch {
      // The text goes in the message because the copy is what failed, not the
      // reading — the player can still take it off the screen.
      toast.error(`No pudimos copiar. Anotalo: ${text}`);
      return false;
    }
  }

  return { copy };
}
