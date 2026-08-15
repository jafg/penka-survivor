import { defineConfig } from 'vitest/config';
import { unitTestConfig } from '@penka/config/vitest';

export default defineConfig({
  ...unitTestConfig,
  test: {
    ...unitTestConfig.test,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/test-support/**'],
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
});
