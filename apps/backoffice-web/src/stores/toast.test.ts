import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToastStore } from './toast';

describe('toastStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a message and hides it again on its own', () => {
    const toast = useToastStore();

    toast.show('Fecha cerrada · no se aceptan más picks');
    expect(toast.message).toBe('Fecha cerrada · no se aceptan más picks');
    expect(toast.isVisible).toBe(true);

    vi.advanceTimersByTime(4200);
    expect(toast.isVisible).toBe(false);
  });

  it('stays up for the full time when a second message replaces the first', () => {
    // Loading four results in a row must not cut the last toast short.
    const toast = useToastStore();
    toast.show('Primero');

    vi.advanceTimersByTime(3000);
    toast.show('Segundo');
    vi.advanceTimersByTime(3000);

    expect(toast.message).toBe('Segundo');
    expect(toast.isVisible).toBe(true);

    vi.advanceTimersByTime(1200);
    expect(toast.isVisible).toBe(false);
  });

  it('marks a failure so it can be styled apart from a confirmation', () => {
    const toast = useToastStore();

    toast.error('Close this matchday before resolving it');

    expect(toast.isError).toBe(true);
    expect(toast.message).toBe('Close this matchday before resolving it');
  });

  it('goes back to neutral for the next success', () => {
    const toast = useToastStore();
    toast.error('Some matches still have no result');

    toast.show('Resultado cargado');

    expect(toast.isError).toBe(false);
  });

  it('can be dismissed before its time is up', () => {
    const toast = useToastStore();
    toast.show('Resultado cargado');

    toast.hide();

    expect(toast.isVisible).toBe(false);
  });
});
