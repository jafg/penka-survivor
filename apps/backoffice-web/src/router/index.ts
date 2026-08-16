import {
  createRouter,
  createWebHistory,
  createMemoryHistory,
  type RouteRecordRaw,
  type Router,
  type RouterHistory,
} from 'vue-router';

/**
 * One screen. The back office is a console, not a journey: everything an
 * operator does to a matchday happens on the same page, which is why there are
 * no tabs to route between.
 *
 * There is no auth guard either — the admin key is a header, not a session, and
 * an operator without one simply sees 401s in the API console.
 */
const routes: RouteRecordRaw[] = [
  { path: '/', name: 'console', component: () => import('../views/ConsoleView.vue') },
  { path: '/:pathMatch(.*)*', redirect: { name: 'console' } },
];

/**
 * The visual parity harness. Dev only — it frames `public/prototype.html`, and
 * that file is the design contract, not something to serve to operators.
 *
 * A function rather than a constant so the `import.meta.env.DEV` guard below
 * folds to `false` in a production build and Rollup drops both this route and
 * the chunk it imports.
 */
function parityRoute(): RouteRecordRaw {
  return {
    path: '/__parity',
    name: 'parity',
    component: () => import('../views/ParityView.vue'),
  };
}

export interface AppRouterOptions {
  isDev?: boolean;
  history?: RouterHistory;
}

export function createAppRouter(options: AppRouterOptions = {}): Router {
  const isDev = options.isDev ?? import.meta.env.DEV;
  return createRouter({
    // Tests and the parity harness run without a real address bar.
    history:
      options.history ??
      (typeof window === 'undefined' ? createMemoryHistory() : createWebHistory()),
    // `import.meta.env.DEV` first on purpose: it is a literal after Vite's
    // replacement, so a production build folds the whole condition away.
    routes: import.meta.env.DEV && isDev ? [...routes, parityRoute()] : routes,
  });
}
