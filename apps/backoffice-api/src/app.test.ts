import { describe, expect, it } from 'vitest';
import { buildApp } from './app';

describe('buildApp', () => {
  it('creates a Fastify instance without side effects', async () => {
    const app = buildApp();
    expect(app.inject).toBeTypeOf('function');
    await app.close();
  });
});
