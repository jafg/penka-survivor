import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** The monorepo root, two levels up from `e2e/support`. */
export const repoRoot = resolve(here, '../..');

/**
 * Read the repo `.env` into `process.env` without overwriting anything already
 * exported.
 *
 * `pnpm demo` writes that file from `.env.example` on a clean clone, and it is
 * where the dev-only `ADMIN_API_KEY` lives. The suite reads the SAME file the
 * running stack was booted with — an admin key that disagrees with the one the
 * back-office API loaded would fail every admin call with a 401 that looks
 * nothing like the real problem.
 *
 * Hand-parsed on purpose: this is a five-line format and the e2e package has no
 * business pulling in a dotenv dependency for it.
 */
export function loadRepoEnv(): void {
  const envPath = resolve(repoRoot, '.env');
  if (!existsSync(envPath)) {
    return;
  }
  for (const rawLine of readFileSync(envPath, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }
    const separator = line.indexOf('=');
    if (separator === -1) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key !== '' && process.env[key] === undefined) {
      process.env[key] = value.replace(/^["']|["']$/g, '');
    }
  }
}

loadRepoEnv();

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(
      `${name} is not set. Run \`pnpm demo\` once (it writes .env from .env.example), or export it before \`pnpm e2e\`.`,
    );
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

/**
 * Where the suite expects the stack.
 *
 * The defaults are the ports in the root CLAUDE.md, and they are not really
 * negotiable for the browser half: neither API registers CORS, so the Vue apps
 * reach them through their Vite dev-server proxy (`/api` → 3000, `/admin` →
 * 3001) with `strictPort: true`. Pointing the suite at a second stack on other
 * ports would make the browser call an origin the proxy does not forward.
 */
export const env = {
  /** Public API, as the suite calls it directly (the browser goes through the proxy). */
  apiUrl: optional('E2E_API_URL', 'http://localhost:3000'),
  adminApiUrl: optional('E2E_ADMIN_API_URL', 'http://localhost:3001'),
  webUrl: optional('E2E_WEB_URL', 'http://localhost:5173'),
  backofficeWebUrl: optional('E2E_BACKOFFICE_WEB_URL', 'http://localhost:5174'),
  mongoUrl: optional('MONGO_URL', 'mongodb://127.0.0.1:27017'),
  mongoDb: optional('MONGO_DB', 'penka'),
  redisUrl: optional('REDIS_URL', 'redis://127.0.0.1:6379'),
  get adminApiKey(): string {
    return required('ADMIN_API_KEY');
  },
} as const;

export const API_PREFIX = '/api/v1';
export const ADMIN_PREFIX = '/admin/v1';
