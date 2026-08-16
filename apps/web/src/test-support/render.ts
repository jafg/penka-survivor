import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { render, type RenderResult } from '@testing-library/vue';
import { createMemoryHistory, type Router } from 'vue-router';
import App from '../App.vue';
import { createAppRouter } from '../router';
import { useAuthStore } from '../stores/auth';

/**
 * Mount the whole app at a route.
 *
 * The whole app on purpose, not a view in isolation: the poll loop, the header
 * indicator and the store wiring all live in `App.vue`, and a view rendered
 * without them would pass tests the real screen fails. Memory history keeps the
 * jsdom address bar out of it.
 */
export interface RenderAppResult extends RenderResult {
  pinia: Pinia;
  router: Router;
}

export interface RenderAppOptions {
  /** Sign in before the first navigation, so the guard lets the route through. */
  signedIn?: boolean;
}

export async function renderApp(
  path: string,
  options: RenderAppOptions = {},
): Promise<RenderAppResult> {
  const pinia = createPinia();
  setActivePinia(pinia);

  if (options.signedIn === true) {
    await useAuthStore().login('ana@example.com', 'correct horse');
  }

  const router = createAppRouter({ isDev: false, history: createMemoryHistory() });
  await router.push(path);
  await router.isReady();

  const result = render(App, { global: { plugins: [pinia, router] } });
  // Let the route's lazy component and the opening fetch settle.
  await flush();
  return { ...result, pinia, router };
}

/** Let every already-resolved promise, and the microtasks they queue, settle. */
export async function flush(times = 2): Promise<void> {
  for (let round = 0; round < times; round += 1) {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}
