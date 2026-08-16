import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '../stores/auth';
import { createAppRouter } from './index';

async function signIn(): Promise<void> {
  await useAuthStore().login('ana@example.com', 'correct horse');
}

describe('router guards', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('sends a signed-out visitor to the login screen', async () => {
    const router = createAppRouter();

    await router.push('/penkas');

    expect(router.currentRoute.value.name).toBe('login');
  });

  it('remembers where they were going, so the sign-in lands them there', async () => {
    const router = createAppRouter();

    await router.push('/penkas/6a80b60ffda322125df55e5f/pick');

    expect(router.currentRoute.value.query['redirect']).toBe(
      '/penkas/6a80b60ffda322125df55e5f/pick',
    );
  });

  it('lets a signed-in player through', async () => {
    await signIn();
    const router = createAppRouter();

    await router.push('/penkas');

    expect(router.currentRoute.value.name).toBe('my-penkas');
  });

  it('keeps the login screen away from someone already signed in', async () => {
    // Otherwise the back button after signing in shows an empty login form to
    // a player who is already in.
    await signIn();
    const router = createAppRouter();

    await router.push('/login');

    expect(router.currentRoute.value.name).toBe('my-penkas');
  });

  it('opens on the penka list', async () => {
    await signIn();
    const router = createAppRouter();

    await router.push('/');

    expect(router.currentRoute.value.name).toBe('my-penkas');
  });

  it('sends an unknown path to the list rather than a blank screen', async () => {
    await signIn();
    const router = createAppRouter();

    await router.push('/nada-por-aca');

    expect(router.currentRoute.value.name).toBe('my-penkas');
  });

  it('leaves the register screen open to a signed-out visitor', async () => {
    const router = createAppRouter();

    await router.push('/register');

    expect(router.currentRoute.value.name).toBe('register');
  });

  it('does not publish the parity harness outside a dev build', async () => {
    // It frames the prototype, which is a development artefact. Shipping the
    // route would ship the contract it is measured against.
    const router = createAppRouter({ isDev: false });

    expect(router.hasRoute('parity')).toBe(false);
  });

  it('serves the parity harness in a dev build, signed in or not', async () => {
    const router = createAppRouter({ isDev: true });

    await router.push('/__parity?screen=pick');

    expect(router.currentRoute.value.name).toBe('parity');
  });
});
