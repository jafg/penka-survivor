/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>;
  export default component;
}

interface ImportMetaEnv {
  /** Where `@penka/backoffice-api` listens. Defaults to the port map's 3001. */
  readonly VITE_ADMIN_API_BASE_URL?: string;
  /**
   * The shared admin secret, sent as `X-Admin-Key`. MVP: one key for the whole
   * console. A key stored in localStorage overrides it, so an operator can point
   * a built bundle at their own environment without a rebuild.
   */
  readonly VITE_ADMIN_API_KEY?: string;
  /**
   * Path of a dev-only endpoint that reseeds demo data, relative to the admin
   * API base. Empty or absent hides the "Reiniciar datos de prueba" button
   * entirely: no such route exists in `@penka/backoffice-api`, and a control
   * that always answers 404 is worse than no control.
   */
  readonly VITE_ADMIN_RESET_ENDPOINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * Absolute path to `docs/visual-parity-checklist.md`, injected by
 * `vite.config.ts`. Only the dev-only parity harness reads it.
 */
declare const __PARITY_CHECKLIST_PATH__: string;
