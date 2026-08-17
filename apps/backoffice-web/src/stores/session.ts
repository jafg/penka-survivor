import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { ErrorCodes } from '@penka/contracts';
import { ApiError, onTraffic, setAdminKey } from '../api/client';
import { listPools } from '../api/endpoints';

/**
 * `unknown` — nothing has been asked of the API yet, so nothing contradicts the
 * key the client already holds. `authorized` — a call came back 2xx.
 * `unauthorized` — a call came back 401.
 */
export type SessionStatus = 'unknown' | 'authorized' | 'unauthorized';

/** Shown when the operator submits nothing; every other message is the API's. */
const EMPTY_KEY_MESSAGE = 'Escribí la clave de administración';
const UNVERIFIABLE = 'No pudimos verificar la clave';

/**
 * Whether the console is allowed to talk to the admin API.
 *
 * There is no session to speak of — the admin key is one shared secret carried
 * in a header (see `apps/backoffice-api/src/plugins/admin-auth.ts` for why that
 * is an MVP decision, not a design). So "signed in" is not a state the server
 * keeps; it is only ever an answer to the last request, and this store is that
 * answer plus the screen it drives.
 *
 * It listens on the client's **traffic feed** rather than wrapping one endpoint:
 * every call in the app is announced there by construction, so a key that stops
 * working locks the console from whichever panel noticed first, and no future
 * endpoint can forget to report it.
 *
 * Only a 401 locks. A 500, an unreachable API or a proxy's HTML error page are
 * not auth problems, and prompting for a key on one would send an operator
 * hunting for the wrong thing.
 */
export const useSessionStore = defineStore('session', () => {
  const status = ref<SessionStatus>('unknown');
  const errorMessage = ref('');

  const isLocked = computed(() => status.value === 'unauthorized');

  onTraffic((entry) => {
    if (entry.code === ErrorCodes.unauthorized) {
      status.value = 'unauthorized';
    }
  });

  /**
   * Try `key` against the API and keep it only if it works.
   *
   * `listPools` is the probe because it is the console's own opening read: a
   * dedicated ping would be one more route the admin API does not have.
   */
  async function signIn(key: string): Promise<boolean> {
    // Trimmed because this key is pasted, and a trailing newline off a terminal
    // would fail `timingSafeEqual` for a reason nothing on screen could explain.
    const candidate = key.trim();
    if (candidate === '') {
      errorMessage.value = EMPTY_KEY_MESSAGE;
      return false;
    }

    setAdminKey(candidate);
    errorMessage.value = '';
    try {
      await listPools();
      status.value = 'authorized';
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.code === ErrorCodes.unauthorized) {
        // Never leave a rejected key stored: it would shadow the build-time
        // fallback forever, locking the operator out even after the deployment
        // is fixed.
        setAdminKey(null);
      }
      // The API's own words. Rewriting them here would put two vocabularies in
      // front of the operator for one failure.
      errorMessage.value = error instanceof ApiError ? error.message : UNVERIFIABLE;
      status.value = 'unauthorized';
      return false;
    }
  }

  function signOut(): void {
    setAdminKey(null);
    errorMessage.value = '';
    status.value = 'unauthorized';
  }

  return { status, errorMessage, isLocked, signIn, signOut };
});
