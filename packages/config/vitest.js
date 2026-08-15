/**
 * Shared Vitest presets. Spread into `defineConfig()` in each package:
 *
 *   import { defineConfig } from 'vitest/config';
 *   import { unitTestConfig } from '@penka/config/vitest';
 *   export default defineConfig(unitTestConfig);
 */
export const unitTestConfig = {
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['**/*.int.test.ts', '**/node_modules/**'],
  },
};

export const integrationTestConfig = {
  test: {
    include: ['test/**/*.int.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
};
