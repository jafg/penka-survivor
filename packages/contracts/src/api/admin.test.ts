import { Value } from '@sinclair/typebox/value';
import { describe, expect, it } from 'vitest';
import {
  AdminMatchdayDetailResponseSchema,
  AdminPoolsResponseSchema,
  CloseMatchdayResponseSchema,
  LeagueMatchdayParamsSchema,
  MatchParamsSchema,
  ResolveMatchdayResponseSchema,
  SetPollingProfileRequestSchema,
  SetPollingProfileResponseSchema,
  SetResultRequestSchema,
  SetResultResponseSchema,
} from './admin';
import { matchId, matchdayId } from '../ids';
import * as fx from '../test-support/fixtures';

const poolSummary = {
  penka: fx.penka,
  entryCount: 10,
  aliveCount: 6,
  islandCount: 2,
  picksReceived: 7,
  resolvedMatchdays: 1,
};

/** A real derived id: colons and all, exactly what an operator's client sends. */
const REAL_MATCH_ID = matchId(matchdayId('copa-libertadores', 1), 'RIV', 'BOC');

describe('admin schemas', () => {
  it('accepts valid payloads', () => {
    expect(Value.Check(AdminPoolsResponseSchema, { pools: [poolSummary] })).toBe(true);
    expect(
      Value.Check(LeagueMatchdayParamsSchema, { leagueId: 'copa-libertadores', number: 1 }),
    ).toBe(true);
    expect(Value.Check(MatchParamsSchema, { matchId: REAL_MATCH_ID })).toBe(true);
    expect(
      Value.Check(AdminMatchdayDetailResponseSchema, {
        matchday: fx.matchday,
        matches: [fx.match],
        pollingProfile: 'normal',
      }),
    ).toBe(true);
    expect(Value.Check(SetResultRequestSchema, { outcome: 'home' })).toBe(true);
    expect(
      Value.Check(SetResultResponseSchema, {
        match: { ...fx.match, outcome: 'home' },
        pendingMatches: 3,
        readyToResolve: false,
      }),
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

  it('addresses a matchday by its league and number, never by a caller-supplied id', () => {
    // The routes are league-scoped: `/admin/v1/leagues/:leagueId/matchdays/:number`.
    // A matchday id is DERIVED from these two (matchdayId), so accepting one from
    // the caller would let an operator address a document that does not belong to
    // the league they think they are working on.
    expect(Value.Check(LeagueMatchdayParamsSchema, { matchdayId: fx.matchday.id })).toBe(false);
    expect(
      Value.Check(LeagueMatchdayParamsSchema, {
        leagueId: 'copa-libertadores',
        number: 1,
        matchdayId: fx.matchday.id,
      }),
    ).toBe(false);
  });

  it('counts matchdays from one, as a human numbers them', () => {
    expect(Value.Check(LeagueMatchdayParamsSchema, { leagueId: 'la-liga', number: 0 })).toBe(false);
    expect(Value.Check(LeagueMatchdayParamsSchema, { leagueId: 'la-liga', number: -1 })).toBe(
      false,
    );
    expect(Value.Check(LeagueMatchdayParamsSchema, { leagueId: 'la-liga', number: 1.5 })).toBe(
      false,
    );
    // AJV coerces the path string before this schema ever sees it; the contract
    // itself only ever describes a number.
    expect(Value.Check(LeagueMatchdayParamsSchema, { leagueId: 'la-liga', number: '2' })).toBe(
      false,
    );
  });

  it('takes a match id with the separators a derived id really carries', () => {
    // `copa-libertadores:md1:RIV-BOC` — colons are nothing to a schema, and the
    // route reads the id from the path (clients encodeURIComponent it).
    expect(REAL_MATCH_ID).toContain(':');
    expect(Value.Check(MatchParamsSchema, { matchId: REAL_MATCH_ID })).toBe(true);
    expect(Value.Check(MatchParamsSchema, { matchId: '' })).toBe(false);
  });

  it('only accepts canonical outcomes', () => {
    for (const outcome of ['home', 'draw', 'away']) {
      expect(Value.Check(SetResultRequestSchema, { outcome })).toBe(true);
    }
    expect(Value.Check(SetResultRequestSchema, { outcome: '1-0' })).toBe(false);
    // A result is being SET here: null is how a match says "not played yet", and
    // clearing a result is not an operation this route offers.
    expect(Value.Check(SetResultRequestSchema, { outcome: null })).toBe(false);
  });

  it('names the match once, in the path, so the body cannot disagree with it', () => {
    expect(Value.Check(SetResultRequestSchema, { matchId: REAL_MATCH_ID, outcome: 'home' })).toBe(
      false,
    );
  });

  it('answers a result with what the operator needs to decide their next step', () => {
    // pendingMatches is what is left to load on that matchday; readyToResolve is
    // the whole precondition (locked AND complete), so the back office never has
    // to re-derive the rule to grey out its own button.
    expect(
      Value.Check(SetResultResponseSchema, {
        match: { ...fx.match, outcome: 'away' },
        pendingMatches: 0,
        readyToResolve: true,
      }),
    ).toBe(true);
    expect(
      Value.Check(SetResultResponseSchema, {
        match: { ...fx.match, outcome: 'away' },
        pendingMatches: -1,
        readyToResolve: true,
      }),
    ).toBe(false);
    expect(Value.Check(SetResultResponseSchema, { match: { ...fx.match, outcome: 'away' } })).toBe(
      false,
    );
  });

  it('reports the live polling profile alongside a matchday', () => {
    // The operator sees the cadence they are serving while they work a matchday,
    // on the same closed set they can write back.
    expect(
      Value.Check(AdminMatchdayDetailResponseSchema, {
        matchday: fx.matchday,
        matches: [fx.match],
        pollingProfile: 'turbo',
      }),
    ).toBe(false);
    expect(
      Value.Check(AdminMatchdayDetailResponseSchema, {
        matchday: fx.matchday,
        matches: [fx.match],
      }),
    ).toBe(false);
  });

  it('summarizes a penka with the numbers an operator acts on', () => {
    // picksReceived says whether the current matchday is ready for the players;
    // resolvedMatchdays says how far the competition has actually run.
    expect(
      Value.Check(AdminPoolsResponseSchema, { pools: [fx.omit(poolSummary, 'picksReceived')] }),
    ).toBe(false);
    expect(
      Value.Check(AdminPoolsResponseSchema, { pools: [fx.omit(poolSummary, 'resolvedMatchdays')] }),
    ).toBe(false);
    expect(
      Value.Check(AdminPoolsResponseSchema, { pools: [{ ...poolSummary, picksReceived: -1 }] }),
    ).toBe(false);
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
    expect(Value.Check(SetResultRequestSchema, {})).toBe(false);
    expect([...Value.Errors(SetResultRequestSchema, {})].some((e) => e.path === '/outcome')).toBe(
      true,
    );
    expect(Value.Check(SetPollingProfileRequestSchema, {})).toBe(false);
  });

  it('rejects wrong types', () => {
    expect(Value.Check(SetResultRequestSchema, { outcome: 42 })).toBe(false);
    expect(
      Value.Check(AdminPoolsResponseSchema, { pools: [{ ...poolSummary, entryCount: 'ten' }] }),
    ).toBe(false);
    expect(Value.Check(MatchParamsSchema, { matchId: 7 })).toBe(false);
    expect(Value.Check(LeagueMatchdayParamsSchema, { leagueId: 7, number: 1 })).toBe(false);
  });

  it('rejects extra fields', () => {
    expect(Value.Check(SetResultRequestSchema, { outcome: 'home', force: true })).toBe(false);
    expect(
      Value.Check(AdminPoolsResponseSchema, { pools: [{ ...poolSummary, ownerEmail: 'x@y.z' }] }),
    ).toBe(false);
  });
});
