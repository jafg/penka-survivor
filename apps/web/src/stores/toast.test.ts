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

    toast.show('Pick confirmado: River Plate');
    expect(toast.message).toBe('Pick confirmado: River Plate');
    expect(toast.isVisible).toBe(true);

    vi.advanceTimersByTime(3600);
    expect(toast.isVisible).toBe(false);
  });

  it('stays up for the full time when a second message replaces the first', () => {
    // Two picks in quick succession must not cut the second toast short.
    const toast = useToastStore();
    toast.show('Primero');

    vi.advanceTimersByTime(3000);
    toast.show('Segundo');
    vi.advanceTimersByTime(3000);

    expect(toast.message).toBe('Segundo');
    expect(toast.isVisible).toBe(true);

    vi.advanceTimersByTime(600);
    expect(toast.isVisible).toBe(false);
  });

  it('marks a failure so it can be styled apart from a confirmation', () => {
    const toast = useToastStore();

    toast.error('No pudimos guardar tu pick');

    expect(toast.isError).toBe(true);
    expect(toast.message).toBe('No pudimos guardar tu pick');
  });

  it('goes back to neutral for the next success', () => {
    const toast = useToastStore();
    toast.error('No pudimos guardar tu pick');

    toast.show('Pick confirmado: River Plate');

    expect(toast.isError).toBe(false);
  });

  it('can be dismissed before its time is up', () => {
    const toast = useToastStore();
    toast.show('Pick confirmado: River Plate');

    toast.hide();

    expect(toast.isVisible).toBe(false);
  });
});
