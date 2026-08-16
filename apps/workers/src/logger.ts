import pino from 'pino';

/**
 * The worker's logger. It is passed explicitly to every module that needs one
 * rather than imported as a singleton, so a test can hand a module a stream it
 * owns and assert on the lines it produced.
 *
 * This is the process's only observability surface: a worker has no HTTP, so
 * "did it do the thing?" is answered by these lines and by the queue depth.
 */
export type Logger = pino.Logger;

export function createLogger(level: string): Logger {
  return pino({ level, base: { service: 'workers' } });
}
