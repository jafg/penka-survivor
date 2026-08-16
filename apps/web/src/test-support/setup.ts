import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/vue';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { installSession } from '../api/client';
import { server } from './server';

/**
 * `error` rather than `warn`: an un-stubbed request means the test is talking
 * to an endpoint nobody wrote a handler for, which is exactly the drift between
 * app and contract these tests exist to catch.
 */
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
  cleanup();
  localStorage.clear();
  // The session is module state in the API client, so it outlives a component.
  installSession(null);
});

afterAll(() => {
  server.close();
});
