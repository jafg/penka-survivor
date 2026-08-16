import {
  createRouter,
  createWebHistory,
  createMemoryHistory,
  type RouteRecordRaw,
  type Router,
  type RouterHistory,
} from 'vue-router';
import { useAuthStore } from '../stores/auth';

/**
 * Routes that do not need a session. Everything else does — the default is
 * "guarded", so a new screen is private until someone says otherwise.
 */
declare module 'vue-router' {
  interface RouteMeta {
    isPublic?: boolean;
  }
}

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: { name: 'my-penkas' } },
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/LoginView.vue'),
    meta: { isPublic: true },
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('../views/RegisterView.vue'),
    meta: { isPublic: true },
  },
  { path: '/penkas', name: 'my-penkas', component: () => import('../views/MyPenkasView.vue') },
  { path: '/penkas/join', name: 'join-penka', component: () => import('../views/JoinPenkaView.vue') },
  {
    path: '/penkas/new',
    name: 'create-penka',
    component: () => import('../views/CreatePenkaView.vue'),
  },
  {
    path: '/penkas/:penkaId/pick',
    name: 'pick',
    component: () => import('../views/PickView.vue'),
    props: true,
  },
  {
    path: '/penkas/:penkaId/standings',
    name: 'standings',
    component: () => import('../views/StandingsView.vue'),
    props: true,
  },
  // A mistyped URL lands somewhere useful instead of on nothing.
  { path: '/:pathMatch(.*)*', redirect: { name: 'my-penkas' } },
];

/**
 * The visual parity harness. Dev only — it frames `public/prototype.html`, and
 * that file is the design contract, not something to serve to players.
 *
 * A function rather than a constant so the `import.meta.env.DEV` guard below
 * folds to `false` in a production build and Rollup drops both this route and
 * the chunk it imports. A constant would keep the dynamic import reachable and
 * the harness would ship, unrouted but downloadable.
 */
function parityRoute(): RouteRecordRaw {
  return {
    path: '/__parity',
    name: 'parity',
    component: () => import('../views/ParityView.vue'),
    meta: { isPublic: true },
  };
}

export interface AppRouterOptions {
  isDev?: boolean;
  history?: RouterHistory;
}

export function createAppRouter(options: AppRouterOptions = {}): Router {
  const isDev = options.isDev ?? import.meta.env.DEV;
  const router = createRouter({
    // Tests and the parity harness run without a real address bar.
    history: options.history ?? (typeof window === 'undefined' ? createMemoryHistory() : createWebHistory()),
    // `import.meta.env.DEV` first on purpose: it is a literal after Vite's
    // replacement, so a production build folds the whole condition away.
    routes: import.meta.env.DEV && isDev ? [...routes, parityRoute()] : routes,
  });

  router.beforeEach((to) => {
    const auth = useAuthStore();
    if (to.meta.isPublic !== true && !auth.isAuthenticated) {
      // Carry the destination so signing in finishes the journey the player
      // started, instead of dumping them on the list.
      return { name: 'login', query: { redirect: to.fullPath } };
    }
    if (auth.isAuthenticated && (to.name === 'login' || to.name === 'register')) {
      return { name: 'my-penkas' };
    }
    return true;
  });

  return router;
}
