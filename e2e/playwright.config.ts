import { defineConfig, devices } from '@playwright/test';
import { env } from './support/env';

/**
 * End-to-end suite against the full local stack (`pnpm demo`).
 *
 * `workers: 1` and `fullyParallel: false` are not caution, they are the
 * architecture: the two specs share ONE MongoDB, and matchdays are league-scoped
 * documents rather than per-penka ones. The specs use different leagues so they
 * cannot fight over a calendar, and running them one at a time keeps the
 * resolution queue — which the worker consumes with `prefetch = 1` — from
 * interleaving two admin actions in a way no operator ever would.
 *
 * There is deliberately no `webServer`: see `support/global-setup.ts`.
 */
export default defineConfig({
  testDir: './tests',
  globalSetup: './support/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: process.env['CI'] !== undefined,
  retries: 0,
  // The demo spec walks two full matchdays through RabbitMQ and then waits out
  // a 60-second board cache to see the new polling profile.
  timeout: 5 * 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env['CI'] !== undefined ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: env.webUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
