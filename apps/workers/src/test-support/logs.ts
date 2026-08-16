import pino from 'pino';
import type { Logger } from '../logger';

/**
 * A real pino logger writing into an array a test can read — the same shape
 * @penka/backoffice-api's integration harness uses, kept here because this
 * process has no Fastify to hand a logger option to.
 *
 * It is a real logger on purpose: a hand-rolled stub would accept calls the
 * production logger rejects, and serialization (an `Error` in `err`, a `Date`
 * in a field) is exactly what these assertions read back.
 */
export interface LogCapture {
  lines: Record<string, unknown>[];
  logger: Logger;
}

export function captureLogs(level = 'info'): LogCapture {
  const lines: Record<string, unknown>[] = [];
  const logger = pino(
    { level },
    {
      write(line: string) {
        lines.push(JSON.parse(line) as Record<string, unknown>);
      },
    },
  );
  return { lines, logger };
}
