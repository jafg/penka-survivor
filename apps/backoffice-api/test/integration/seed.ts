import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp as buildPlayerApp } from '@penka/api/src/app';
import type { TestInfra } from './harness';

/**
 * The back office reads and writes documents that @penka/api creates, so these
 * tests seed through the player API itself rather than inserting documents by
 * hand: a fixture that drifted from what the other app actually writes would
 * make this suite pass while production disagreed. It is also how the calendar
 * gets materialized — the back office never creates one.
 *
 * @penka/api is a devDependency of this package for exactly this, and nothing
 * in `src/` may import it.
 */
export function buildPlayerApi(infra: TestInfra, mongoDbName: string): FastifyInstance {
  return buildPlayerApp({
    config: {
      port: 0,
      mongoUrl: infra.mongoUrl,
      // The same database as the admin app under test: sharing one Mongo is the
      // whole premise of the two apps.
      mongoDbName,
      redisUrl: infra.redisUrl,
      jwtSecret: 'integration-test-secret-0123456789abcdef',
      accessTokenTtlSeconds: 900,
      refreshTokenTtlSeconds: 604_800,
      rateLimitMax: 1000,
      trustProxy: false,
    },
  });
}

export interface TestUser {
  token: string;
  userId: string;
  displayName: string;
}

const PASSWORD = 'penka-password-1';

export async function registerUser(app: FastifyInstance, label: string): Promise<TestUser> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {
      email: `${label}-${randomUUID().slice(0, 8)}@test.penka.dev`,
      displayName: label,
      password: PASSWORD,
    },
  });
  expect(response.statusCode).toBe(201);
  const body = response.json<{ user: { id: string }; tokens: { accessToken: string } }>();
  return { token: body.tokens.accessToken, userId: body.user.id, displayName: label };
}

function bearer(user: TestUser): Record<string, string> {
  return { authorization: `Bearer ${user.token}` };
}

export interface TestPenka {
  id: string;
  joinCode: string;
}

export async function createPenka(
  app: FastifyInstance,
  user: TestUser,
  leagueId: string,
): Promise<TestPenka> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/penkas',
    headers: bearer(user),
    payload: { name: `Penka ${leagueId}`, leagueId, settings: {} },
  });
  expect(response.statusCode).toBe(201);
  return response.json<{ penka: TestPenka }>().penka;
}

export async function joinPenka(
  app: FastifyInstance,
  user: TestUser,
  joinCode: string,
): Promise<void> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/penkas/join',
    headers: bearer(user),
    payload: { joinCode },
  });
  expect(response.statusCode).toBe(200);
}

export async function submitPick(
  app: FastifyInstance,
  user: TestUser,
  penkaId: string,
  teamCode: string,
): Promise<void> {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/penkas/${penkaId}/picks`,
    headers: bearer(user),
    payload: { teamCode },
  });
  expect(response.statusCode).toBe(200);
}

/** What the players' board says right now — the read half of the polling profile. */
export async function nextPollInSec(app: FastifyInstance, penkaId: string): Promise<number> {
  const response = await app.inject({ method: 'GET', url: `/api/v1/penkas/${penkaId}/board` });
  expect(response.statusCode).toBe(200);
  return response.json<{ board: { nextPollInSec: number } }>().board.nextPollInSec;
}
