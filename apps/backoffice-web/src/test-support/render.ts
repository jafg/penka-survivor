import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { render, type RenderResult } from '@testing-library/vue';
import { createMemoryHistory, type Router } from 'vue-router';
import App from '../App.vue';
import { createAppRouter } from '../router';

/**
 * Mount the whole console at a route.
 *
 * The whole app rather than a panel in isolation: the panels share three stores
 * and read each other's effects — closing a matchday in one changes the pill in
 * another — and a panel mounted alone would pass tests the real screen fails.
 * Memory history keeps the jsdom address bar out of it.
 */
export interface RenderAppResult extends RenderResult {
  pinia: Pinia;
  router: Router;
}

export async function renderApp(path = '/'): Promise<RenderAppResult> {
  const pinia = createPinia();
  setActivePinia(pinia);

  const router = createAppRouter({ isDev: false, history: createMemoryHistory() });
  await router.push(path);
  await router.isReady();

  const result = render(App, { global: { plugins: [pinia, router] } });
  // Let the route's lazy component and the opening fetches settle.
  await flush();
  return { ...result, pinia, router };
}

/** Let every already-resolved promise, and the microtasks they queue, settle. */
export async function flush(times = 3): Promise<void> {
  for (let round = 0; round < times; round += 1) {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}
