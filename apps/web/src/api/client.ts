import type { Static, TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { ApiErrorSchema, ErrorCodes, type ErrorCode } from '@penka/contracts';

/**
 * Where `@penka/api` listens. The default matches the repo's port map so a
 * developer who exports nothing still gets a working `pnpm dev`.
 */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

/** The prefix every route in `@penka/api` sits behind (`/health` excepted). */
const API_PREFIX = '/api/v1';

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${API_PREFIX}${path}`;
}

/**
 * The canonical error envelope, carried as an exception. `code` is an
 * `ErrorCode` from `@penka/contracts` — the client never invents one, it only
 * relays what the API answered, and views render `message` verbatim so the
 * server stays the single author of what a player reads.
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

/**
 * What the client needs from the signed-in session, without importing the store
 * that owns it — the store calls the API, so the dependency has to point this
 * way to stay acyclic.
 */
export interface Session {
  /** Bearer token for authenticated calls, or null when signed out. */
  accessToken: () => string | null;
  /** Mint a new access token. Resolves false when the refresh token is spent. */
  refresh: () => Promise<boolean>;
  /** The refresh failed: nothing this session holds is usable any more. */
  expire: () => void;
}

let session: Session | null = null;

/** Installed once by `authStore`; tests install their own. */
export function installSession(next: Session | null): void {
  session = next;
}

export interface RequestOptions<S extends TSchema> {
  method?: 'GET' | 'POST';
  body?: unknown;
  /** Send the bearer token, and refresh it once on a 401. */
  auth?: boolean;
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
 * guessed at, so a view never renders a fragment of someone else's error.
 */
function toApiError(response: Response, body: unknown): ApiError {
  if (Value.Check(ApiErrorSchema, body)) {
    return new ApiError(body.status, body.code, body.message);
  }
  return new ApiError(response.status, ErrorCodes.internal, UNREADABLE_ERROR);
}

async function send(path: string, options: RequestOptions<TSchema>): Promise<Response> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
  }
  const token = options.auth === true ? session?.accessToken() : null;
  if (token !== null && token !== undefined) {
    headers.authorization = `Bearer ${token}`;
  }
  try {
    return await fetch(apiUrl(path), {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    // A DNS failure, an offline device, a CORS refusal — indistinguishable from
    // here, and all of them mean the same thing to a player.
    throw new ApiError(0, ErrorCodes.internal, NETWORK_ERROR);
  }
}

/**
 * One request, one typed answer.
 *
 * The response is validated against its contract schema rather than cast: the
 * schemas are the only description of the wire format either side agrees on,
 * and a silent cast turns a deployed API change into an undefined-property
 * crash three components deep.
 *
 * An authenticated 401 is retried EXACTLY once, behind a token refresh. Twice
 * would be a loop against an API that has already said no, and not at all would
 * sign a player out every fifteen minutes.
 */
export async function apiRequest<S extends TSchema>(
  path: string,
  options: RequestOptions<S>,
): Promise<Static<S>> {
  let response = await send(path, options);

  if (response.status === 401 && options.auth === true && session !== null) {
    const refreshed = await session.refresh();
    if (!refreshed) {
      session.expire();
      throw toApiError(response, await readBody(response));
    }
    response = await send(path, options);
    if (response.status === 401) {
      session.expire();
    }
  }

  const body = await readBody(response);
  if (!response.ok) {
    throw toApiError(response, body);
  }
  if (!Value.Check(options.schema, body)) {
    throw new ApiError(response.status, ErrorCodes.internal, UNREADABLE_ERROR);
  }
  return body;
}
