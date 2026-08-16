import type { Static, TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { ApiErrorSchema, ErrorCodes, type ErrorCode } from '@penka/contracts';

/**
 * Where `@penka/backoffice-api` listens. The default matches the repo's port map
 * so a developer who exports nothing still gets a working `pnpm dev`.
 *
 * `??` and not `||`: `.env.development` sets this to the EMPTY STRING on purpose,
 * which is not nullish, so the empty value wins and the client builds relative
 * URLs for the dev server's `/admin` proxy to forward.
 */
export const ADMIN_API_BASE_URL =
  import.meta.env.VITE_ADMIN_API_BASE_URL ?? 'http://localhost:3001';

/** The prefix every admin route sits behind (`/health` excepted). */
const ADMIN_PREFIX = '/admin/v1';

/** The path as the API sees it — also what the API console displays. */
export function apiPath(path: string): string {
  return `${ADMIN_PREFIX}${path}`;
}

export function apiUrl(path: string): string {
  return `${ADMIN_API_BASE_URL}${apiPath(path)}`;
}

/**
 * The header `@penka/backoffice-api` authenticates on.
 *
 * Spelled here rather than imported: the API owns the name, but a Vue app must
 * not import from another app, and `@penka/contracts` does not carry it yet.
 * Worth promoting into the contract alongside `POLLING_PROFILE_KEY` — it is the
 * same kind of cross-app constant — but that is an API-side change.
 */
export const ADMIN_KEY_HEADER = 'x-admin-key';

/** Where an operator-supplied key is remembered between visits. */
export const ADMIN_KEY_STORAGE_KEY = 'penka.survivor.adminKey';

/**
 * The shared admin secret. MVP: the console holds one key for the deployment
 * rather than a per-operator session, and the API answers 401 `unauthorized` to
 * a missing, malformed or wrong one alike.
 *
 * A stored key beats the build-time one so a bundle can be pointed at another
 * stack without a rebuild; the build-time one exists so a fresh clone talks to
 * the local API with no setup at all.
 */
export function adminKey(): string {
  return localStorage.getItem(ADMIN_KEY_STORAGE_KEY) ?? import.meta.env.VITE_ADMIN_API_KEY ?? '';
}

export function setAdminKey(key: string | null): void {
  if (key === null || key === '') {
    // Removed, not stored empty: an empty string is a key the API would reject,
    // and it would shadow the build-time fallback forever.
    localStorage.removeItem(ADMIN_KEY_STORAGE_KEY);
    return;
  }
  localStorage.setItem(ADMIN_KEY_STORAGE_KEY, key);
}

/**
 * The canonical error envelope, carried as an exception. `code` is an
 * `ErrorCode` from `@penka/contracts` — the client never invents one, it only
 * relays what the API answered, and views render `message` verbatim so the
 * server stays the single author of what an operator reads.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;

  constructor(status: number, code: ErrorCode, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

// ── The API console's feed ─────────────────────────────────────────────────

/** One round trip, as the console renders it. */
export interface TrafficEntry {
  method: string;
  /** Prefixed and already percent-encoded — what actually went on the wire. */
  path: string;
  /** HTTP status, or 0 when the request never reached the API. */
  status: number;
  /** Round-trip time in whole milliseconds. */
  ms: number;
  /** The API's error code, on a failure that carried the envelope. */
  code?: ErrorCode;
}

export type TrafficListener = (entry: TrafficEntry) => void;

let listeners: TrafficListener[] = [];

/**
 * Watch every request this client makes. Returns its own unsubscribe, so a
 * component can stop listening when it unmounts without the client keeping a
 * registry of who is who.
 *
 * The interception lives here rather than in a store because the store is the
 * console's *display*: putting it here means a call made from anywhere — a
 * store, a view, a retry — is logged by construction, and nobody can forget to.
 */
export function onTraffic(listener: TrafficListener): () => void {
  listeners = [...listeners, listener];
  return () => {
    listeners = listeners.filter((candidate) => candidate !== listener);
  };
}

/** Test seam: drop every listener, since they are module state. */
export function resetTraffic(): void {
  listeners = [];
}

function announce(entry: TrafficEntry): void {
  // A copy of the list, so a listener that unsubscribes mid-notify does not
  // shorten the array being walked.
  [...listeners].forEach((listener) => listener(entry));
}

// ── Requests ───────────────────────────────────────────────────────────────

export interface RequestOptions<S extends TSchema> {
  method?: 'GET' | 'POST' | 'PUT';
  body?: unknown;
  /** The response schema from `@penka/contracts`; the body is checked against it. */
  schema: S;
}

const NETWORK_ERROR = 'No pudimos conectarnos con el servidor';
const UNREADABLE_ERROR = 'El servidor respondió algo que no entendemos';

async function readBody(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

/**
 * Everything non-2xx becomes an `ApiError`. A body that matches
 * `ApiErrorSchema` is relayed field for field; anything else (a proxy's HTML
 * error page, a truncated response) is reported as `internal` rather than
 * guessed at, so a panel never renders a fragment of someone else's error.
 */
function toApiError(response: Response, body: unknown): ApiError {
  if (Value.Check(ApiErrorSchema, body)) {
    return new ApiError(body.status, body.code, body.message);
  }
  return new ApiError(response.status, ErrorCodes.internal, UNREADABLE_ERROR);
}

/**
 * One request, one typed answer, one console entry.
 *
 * The response is validated against its contract schema rather than cast: the
 * schemas are the only description of the wire format either side agrees on,
 * and a silent cast turns a deployed API change into an undefined-property
 * crash three panels deep.
 *
 * No refresh-and-retry, unlike the player app: there is no session to renew. A
 * 401 here means the admin key is wrong, and repeating the call with the same
 * key would only ask the API the same question twice.
 */
export async function apiRequest<S extends TSchema>(
  path: string,
  options: RequestOptions<S>,
): Promise<Static<S>> {
  const method = options.method ?? 'GET';
  const logged = apiPath(path);
  const startedAt = performance.now();
  const elapsed = (): number => Math.round(performance.now() - startedAt);

  const headers: Record<string, string> = {
    accept: 'application/json',
    [ADMIN_KEY_HEADER]: adminKey(),
  };
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
  }

  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    // A DNS failure, an offline machine, a CORS refusal — indistinguishable from
    // here, and all of them mean the same thing to an operator. Logged all the
    // same: the console's job is to show the attempt, not only the answer.
    announce({ method, path: logged, status: 0, ms: elapsed(), code: ErrorCodes.internal });
    throw new ApiError(0, ErrorCodes.internal, NETWORK_ERROR);
  }

  const body = await readBody(response);

  if (!response.ok) {
    const error = toApiError(response, body);
    announce({
      method,
      path: logged,
      status: response.status,
      ms: elapsed(),
      code: error.code,
    });
    throw error;
  }

  announce({ method, path: logged, status: response.status, ms: elapsed() });

  if (!Value.Check(options.schema, body)) {
    throw new ApiError(response.status, ErrorCodes.internal, UNREADABLE_ERROR);
  }
  return body;
}
