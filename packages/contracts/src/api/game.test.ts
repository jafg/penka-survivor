import { Value } from '@sinclair/typebox/value';
import { describe, expect, it } from 'vitest';
import {
  BoardResponseSchema,
  CurrentMatchdayResponseSchema,
  MyEntryResponseSchema,
  PenkaParamsSchema,
  SubmitPickRequestSchema,
  SubmitPickResponseSchema,
} from './game';
import * as fx from '../test-support/fixtures';

describe('game schemas', () => {
  it('accepts valid payloads', () => {
    expect(Value.Check(PenkaParamsSchema, { penkaId: fx.penka.id })).toBe(true);
    expect(Value.Check(BoardResponseSchema, { board: fx.board })).toBe(true);
    expect(Value.Check(MyEntryResponseSchema, { myEntry: fx.myEntry })).toBe(true);
    expect(
      Value.Check(CurrentMatchdayResponseSchema, { matchday: fx.matchday, matches: [fx.match] }),
    ).toBe(true);
    expect(Value.Check(SubmitPickRequestSchema, { teamId: fx.team.id })).toBe(true);
    expect(Value.Check(SubmitPickResponseSchema, { myEntry: fx.myEntry })).toBe(true);
  });

  it('board response rejects personal fields', () => {
    expect(Value.Check(BoardResponseSchema, { board: { ...fx.board, myPick: 'team-1' } })).toBe(
      false,
    );
    expect(
      Value.Check(BoardResponseSchema, { board: { ...fx.board, usedTeams: ['team-1'] } }),
    ).toBe(false);
  });

  it('wraps single-resource responses in envelopes like the rest of the API', () => {
    expect(Object.keys(BoardResponseSchema.properties)).toEqual(['board']);
    expect(Object.keys(MyEntryResponseSchema.properties)).toEqual(['myEntry']);
  });

  it('rejects missing fields with useful error paths', () => {
    expect(Value.Check(SubmitPickRequestSchema, {})).toBe(false);
    expect([...Value.Errors(SubmitPickRequestSchema, {})].some((e) => e.path === '/teamId')).toBe(
      true,
    );

    const boardWithoutPoll = fx.omit(fx.board, 'nextPollInSec');
    expect(Value.Check(BoardResponseSchema, { board: boardWithoutPoll })).toBe(false);
  });

  it('rejects wrong types', () => {
    expect(Value.Check(SubmitPickRequestSchema, { teamId: 42 })).toBe(false);
    expect(
      Value.Check(BoardResponseSchema, { board: { ...fx.board, nextPollInSec: 'soon' } }),
    ).toBe(false);
  });

  it('rejects extra fields', () => {
    expect(Value.Check(SubmitPickRequestSchema, { teamId: fx.team.id, lives: 99 })).toBe(false);
    expect(Value.Check(PenkaParamsSchema, { penkaId: fx.penka.id, admin: true })).toBe(false);
  });
});
