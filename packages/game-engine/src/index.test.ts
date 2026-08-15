import { describe, expect, it } from 'vitest';
import { ENGINE_NAME, engineReady } from './index';

describe('@penka/game-engine', () => {
  it('is wired into the workspace', () => {
    expect(ENGINE_NAME).toBe('@penka/game-engine');
    expect(engineReady()).toBe(true);
  });
});
