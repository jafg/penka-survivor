import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

/**
 * Where the parity checklist lives, as an absolute path.
 *
 * The dev-only `/__parity` harness links to it through Vite's `/@fs` route,
 * because the file is a repo document rather than something `public/` should
 * ship. Injected here so the view holds no path of its own; in a production
 * build the harness is tree-shaken away and this constant goes unused.
 */
const checklistPath = fileURLToPath(new URL('../../docs/visual-parity-checklist.md', import.meta.url));

export default defineConfig({
  plugins: [vue()],
  define: {
    __PARITY_CHECKLIST_PATH__: JSON.stringify(checklistPath),
  },
  server: {
    port: 5173,
    strictPort: true,
    /**
     * `@penka/api` registers no CORS plugin, so a browser on 5173 cannot call
     * 3000 directly — every request fails before it is sent. Proxying keeps the
     * dev server same-origin with the API instead, which is also how the app is
     * served in an environment that puts both behind one host.
     *
     * `.env.development` empties `VITE_API_BASE_URL` so the client builds
     * relative URLs that land here. A deployment that does split the origins
     * sets that variable and the proxy is simply never used.
     */
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
});
