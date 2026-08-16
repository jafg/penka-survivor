import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { AuthTokens, User } from '@penka/contracts';
import { installSession } from '../api/client';
import { login as loginRequest, refreshTokens, register as registerRequest } from '../api/endpoints';

/**
 * Where the session survives a reload. Access tokens last fifteen minutes and
 * refresh tokens seven days, so a player who closes the tab and comes back at
 * half time should not have to sign in again.
 */
const STORAGE_KEY = 'penka.survivor.auth';

interface StoredSession {
  tokens: AuthTokens;
  user: User;
}

function readStored(): StoredSession | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) {
    return null;
  }
  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    // Someone else's key, or a half-written one. Signing the player out beats
    // booting the app around a value nobody can read.
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

/**
 * The session: tokens, the signed-in user, and the refresh flow.
 *
 * It installs itself into the API client rather than being imported by it. The
 * client is what performs the refresh call, so the dependency has to point one
 * way, and this is the end that knows about Pinia.
 */
export const useAuthStore = defineStore('auth', () => {
  const stored = readStored();
  const accessToken = ref<string | null>(stored?.tokens.accessToken ?? null);
  const refreshToken = ref<string | null>(stored?.tokens.refreshToken ?? null);
  const user = ref<User | null>(stored?.user ?? null);

  const isAuthenticated = computed(() => accessToken.value !== null);

  function persist(): void {
    if (accessToken.value === null || refreshToken.value === null || user.value === null) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    const session: StoredSession = {
      tokens: { accessToken: accessToken.value, refreshToken: refreshToken.value },
      user: user.value,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }

  function adopt(tokens: AuthTokens, nextUser: User): void {
    accessToken.value = tokens.accessToken;
    refreshToken.value = tokens.refreshToken;
    user.value = nextUser;
    persist();
  }

  function clear(): void {
    accessToken.value = null;
    refreshToken.value = null;
    user.value = null;
    persist();
  }

  /**
   * Only ever one refresh in flight. Two requests that 401 together would
   * otherwise each spend the refresh token, and rotation makes the second one
   * fail — signing out a player whose session was perfectly good.
   */
  let inFlight: Promise<boolean> | null = null;

  async function refresh(): Promise<boolean> {
    if (inFlight !== null) {
      return inFlight;
    }
    const token = refreshToken.value;
    if (token === null) {
      return false;
    }
    inFlight = refreshTokens(token)
      .then((response) => {
        accessToken.value = response.tokens.accessToken;
        refreshToken.value = response.tokens.refreshToken;
        persist();
        return true;
      })
      .catch(() => false)
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  }

  async function login(email: string, password: string): Promise<void> {
    const response = await loginRequest({ email, password });
    adopt(response.tokens, response.user);
  }

  async function register(email: string, password: string, displayName: string): Promise<void> {
    const response = await registerRequest({ email, password, displayName });
    adopt(response.tokens, response.user);
  }

  function logout(): void {
    clear();
  }

  installSession({
    accessToken: () => accessToken.value,
    refresh,
    expire: clear,
  });

  return { accessToken, refreshToken, user, isAuthenticated, login, register, logout, refresh };
});
