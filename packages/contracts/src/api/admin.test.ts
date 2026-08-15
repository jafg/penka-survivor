import { Value } from '@sinclair/typebox/value';
import { describe, expect, it } from 'vitest';
import {
  AdminMatchdayDetailResponseSchema,
  AdminPoolsResponseSchema,
  CloseMatchdayResponseSchema,
  MatchdayParamsSchema,
  ResolveMatchdayResponseSchema,
  SetPollingProfileRequestSchema,
  SetPollingProfileResponseSchema,
  SetResultRequestSchema,
  SetResultResponseSchema,
} from './admin';
import * as fx from '../test-support/fixtures';

const poolSummary = { penka: fx.penka, entryCount: 10, aliveCount: 6, islandCount: 2 };

describe('admin schemas', () => {
  it('accepts valid payloads', () => {
    expect(Value.Check(AdminPoolsResponseSchema, { pools: [poolSummary] })).toBe(true);
    expect(Value.Check(MatchdayParamsSchema, { matchdayId: fx.matchday.id })).toBe(true);
    expect(
      Value.Check(AdminMatchdayDetailResponseSchema, {
        matchday: fx.matchday,
        matches: [fx.match],
      }),
    ).toBe(true);
    expect(
      Value.Check(SetResultRequestSchema, { matchId: fx.match.id, outcome: 'home' }),
    ).toBe(true);
    expect(
      Value.Check(SetResultResponseSchema, { match: { ...fx.match, outcome: 'home' } }),
    ).toBe(true);
    expect(
      Value.Check(CloseMatchdayResponseSchema, { matchday: { ...fx.matchday, status: 'locked' } }),
    ).toBe(true);
    expect(
      Value.Check(ResolveMatchdayResponseSchema, { queued: true, matchdayId: fx.matchday.id }),
    ).toBe(true);
    expect(Value.Check(SetPollingProfileRequestSchema, { profile: 'live' })).toBe(true);
    expect(Value.Check(SetPollingProfileResponseSchema, { profile: 'slow' })).toBe(true);
  });

  it('only accepts canonical outcomes', () => {
    for (const outcome of ['home', 'draw', 'away']) {
      expect(Value.Check(SetResultRequestSchema, { matchId: fx.match.id, outcome })).toBe(true);
    }
    expect(Value.Check(SetResultRequestSchema, { matchId: fx.match.id, outcome: '1-0' })).toBe(
      false,
    );
    expect(Value.Check(SetResultRequestSchema, { matchId: fx.match.id, outcome: null })).toBe(
      false,
    );
  });

  it('only accepts canonical polling profiles', () => {
    for (const profile of ['live', 'normal', 'slow']) {
      expect(Value.Check(SetPollingProfileRequestSchema, { profile })).toBe(true);
    }
    expect(Value.Check(SetPollingProfileRequestSchema, { profile: 'turbo' })).toBe(false);
  });

  it('scopes the polling profile to the deployment, never to one penka', () => {
    // PUT /admin/v1/polling-profile writes a single Redis key for everyone, so a
    // penka rides in neither the path nor the body — an operator who thinks they
    // are slowing down one competition must be told, not silently obeyed.
    expect(
      Value.Check(SetPollingProfileRequestSchema, { profile: 'slow', penkaId: fx.penka.id }),
    ).toBe(false);
  });

  it('resolve response only acknowledges queued work', () => {
    expect(
      Value.Check(ResolveMatchdayResponseSchema, { queued: false, matchdayId: fx.matchday.id }),
    ).toBe(false);
  });

  it('rejects missing fields with useful error paths', () => {
    expect(Value.Check(SetResultRequestSchema, { outcome: 'home' })).toBe(false);
    expect(
      [...Value.Errors(SetResultRequestSchema, { outcome: 'home' })].some(
        (e) => e.path === '/matchId',
      ),
    ).toBe(true);
    expect(Value.Check(SetPollingProfileRequestSchema, {})).toBe(false);
  });

  it('rejects wrong types', () => {
    expect(Value.Check(SetResultRequestSchema, { matchId: 42, outcome: 'home' })).toBe(false);
    expect(
      Value.Check(AdminPoolsResponseSchema, { pools: [{ ...poolSummary, entryCount: 'ten' }] }),
    ).toBe(false);
    expect(Value.Check(MatchdayParamsSchema, { matchdayId: 7 })).toBe(false);
  });

  it('rejects extra fields', () => {
    expect(
      Value.Check(SetResultRequestSchema, {
        matchId: fx.match.id,
        outcome: 'home',
        force: true,
      }),
    ).toBe(false);
    expect(
      Value.Check(AdminPoolsResponseSchema, { pools: [{ ...poolSummary, ownerEmail: 'x@y.z' }] }),
    ).toBe(false);
  });
});
