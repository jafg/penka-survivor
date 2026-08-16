import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/vue';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { resetTraffic } from '../api/client';
import { server } from './server';

/**
 * `error` rather than `warn`: an un-stubbed request means the console is talking
 * to an endpoint nobody wrote a handler for, which is exactly the drift between
 * app and contract these tests exist to catch.
 */
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
  cleanup();
  // The admin key lives in localStorage and the traffic listeners are module
  // state in the client, so both outlive a component.
  localStorage.clear();
  resetTraffic();
});

afterAll(() => {
  server.close();
});
