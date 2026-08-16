/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>;
  export default component;
}

interface ImportMetaEnv {
  /** Where `@penka/api` listens. Defaults to the port map's 3000 in development. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * Absolute path to `docs/visual-parity-checklist.md`, injected by
 * `vite.config.ts`. Only the dev-only parity harness reads it.
 */
declare const __PARITY_CHECKLIST_PATH__: string;
