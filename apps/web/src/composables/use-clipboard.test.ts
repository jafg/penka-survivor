import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToastStore } from '../stores/toast';
import { useClipboard } from './use-clipboard';

/**
 * jsdom ships no `navigator.clipboard`, which is convenient: it is exactly the
 * state a browser is in on a page served over plain HTTP, and the shape this
 * composable exists to survive.
 */
function installClipboard(writeText: (text: string) => Promise<void>): void {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
}

describe('useClipboard', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  it('writes the text to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    installClipboard(writeText);

    await useClipboard().copy('4821', 'Código copiado');

    expect(writeText).toHaveBeenCalledWith('4821');
  });

  it('announces the copy so the tap is not silent', async () => {
    installClipboard(vi.fn().mockResolvedValue(undefined));
    const toast = useToastStore();

    const copied = await useClipboard().copy('4821', 'Código copiado');

    expect(copied).toBe(true);
    expect(toast.message).toBe('Código copiado');
    expect(toast.isError).toBe(false);
  });

  it('says so when the clipboard is unavailable, instead of failing silently', async () => {
    // No `installClipboard`: `navigator.clipboard` is undefined, as it is on any
    // page that is not a secure context.
    const toast = useToastStore();

    const copied = await useClipboard().copy('4821', 'Código copiado');

    expect(copied).toBe(false);
    expect(toast.isError).toBe(true);
    expect(toast.message).toContain('4821');
  });

  it('says so when the browser refuses the write', async () => {
    installClipboard(vi.fn().mockRejectedValue(new Error('NotAllowedError')));
    const toast = useToastStore();

    const copied = await useClipboard().copy('4821', 'Código copiado');

    expect(copied).toBe(false);
    expect(toast.isError).toBe(true);
    expect(toast.message).toContain('4821');
  });
});
