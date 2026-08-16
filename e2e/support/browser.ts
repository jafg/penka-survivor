import type { Page } from '@playwright/test';
import type { PlayerSession } from './api';

/**
 * The key `apps/web` keeps its session under, and the shape it stores:
 * `{ tokens, user }`. Duplicated here on purpose — the store's constant is not
 * exported, and reaching into the app's internals from the suite would couple
 * the two more tightly than copying one string does.
 */
const STORAGE_KEY = 'penka.survivor.auth';

/**
 * Sign a player in by planting the session the app would have written itself.
 *
 * The suite seeds through the API, so the browser never types credentials into
 * the login form: the tokens already exist by the time the page opens, and
 * re-typing them would only be re-testing the two auth forms that their own
 * component tests already cover.
 */
export async function signInBrowser(page: Page, session: PlayerSession): Promise<void> {
  const payload = JSON.stringify({ tokens: session.tokens, user: session.user });
  await page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key as string, value as string);
    },
    [STORAGE_KEY, payload],
  );
}
