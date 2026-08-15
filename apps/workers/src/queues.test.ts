import { describe, expect, it } from 'vitest';
import { MATCHDAY_RESOLUTION_QUEUE } from './queues';

describe('@penka/workers queues', () => {
  it('names the matchday resolution queue under the penka namespace', () => {
    expect(MATCHDAY_RESOLUTION_QUEUE).toBe('penka.matchday.resolution');
  });
});
