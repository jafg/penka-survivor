import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from './app';

describe('app store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('exposes the app title', () => {
    expect(useAppStore().title).toBe('Penka Survivor');
  });
});
