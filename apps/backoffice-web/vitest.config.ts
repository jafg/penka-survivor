import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';
import { unitTestConfig } from '@penka/config/vitest';

export default defineConfig({
  plugins: [vue()],
  // Mirrors `vite.config.ts`: the parity harness reads this constant, and a
  // test that renders it must not trip over an undeclared global.
  define: {
    __PARITY_CHECKLIST_PATH__: JSON.stringify('/docs/visual-parity-checklist.md'),
  },
  test: {
    ...unitTestConfig.test,
    // Panels and stores are the units here, and the panels need a document.
    environment: 'jsdom',
    setupFiles: ['./src/test-support/setup.ts'],
  },
});
