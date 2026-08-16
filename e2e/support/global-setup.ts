import { env } from './env';
import { resetGameData } from './reset';

interface StackService {
  name: string;
  url: string;
}

const SERVICES: readonly StackService[] = [
  { name: '@penka/api', url: `${env.apiUrl}/health` },
  { name: '@penka/backoffice-api', url: `${env.adminApiUrl}/health` },
  { name: '@penka/web', url: env.webUrl },
  { name: '@penka/backoffice-web', url: env.backofficeWebUrl },
];

const READY_TIMEOUT_MS = 90_000;
const READY_INTERVAL_MS = 1_000;

async function isUp(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Wait for the whole stack, and say exactly what is missing when it never
 * arrives. The suite deliberately does NOT boot the stack itself (no Playwright
 * `webServer`): `pnpm demo` runs five processes plus Docker, and a suite that
 * owned them would tear the operator's stack down at the end of a run.
 *
 * `@penka/workers` has no port to poll. It is covered indirectly and much more
 * honestly: if it is not running, the resolve step never lands and the spec
 * fails on the wait for `status: 'resolved'`.
 */
async function waitForStack(): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let missing: StackService[] = [...SERVICES];
  while (Date.now() < deadline) {
    const reachable = await Promise.all(missing.map((service) => isUp(service.url)));
    missing = missing.filter((_, index) => reachable[index] !== true);
    if (missing.length === 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, READY_INTERVAL_MS));
  }
  const list = missing.map((service) => `  - ${service.name} (${service.url})`).join('\n');
  throw new Error(
    `The local stack is not reachable after ${READY_TIMEOUT_MS / 1000}s:\n${list}\n\n` +
      'Start it in another terminal with `pnpm demo`, then run `pnpm e2e` again.\n' +
      'Resolution also needs @penka/workers, which `pnpm demo` boots along with the rest.',
  );
}

/**
 * Runs once before the whole suite: wait for the stack, then clear the game
 * data so both specs start from an empty board and a fresh league calendar.
 *
 * This WIPES the local development data — every user, penka and matchday in the
 * `penka` database. That is the price of a repeatable demo script, and it is
 * called out in the README next to `pnpm e2e`.
 */
export default async function globalSetup(): Promise<void> {
  await waitForStack();
  await resetGameData();
  console.log('[e2e] stack ready, game data reset');
}
