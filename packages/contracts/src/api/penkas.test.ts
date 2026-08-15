import { Value } from '@sinclair/typebox/value';
import { describe, expect, it } from 'vitest';
import {
  CreatePenkaRequestSchema,
  CreatePenkaResponseSchema,
  JoinPenkaRequestSchema,
  JoinPenkaResponseSchema,
  MyPenkasResponseSchema,
} from './penkas';
import * as fx from '../test-support/fixtures';

const createRequest = {
  name: 'Oficina BA',
  leagueId: fx.league.id,
  settings: { lives: 2, islandEnabled: true },
};

describe('penkas request schemas', () => {
  it('accepts valid create/join payloads', () => {
    expect(Value.Check(CreatePenkaRequestSchema, createRequest)).toBe(true);
    expect(Value.Check(JoinPenkaRequestSchema, { joinCode: 'ABC123' })).toBe(true);
  });

  it('rejects invalid settings with a useful error path', () => {
    const bad = { ...createRequest, settings: { lives: 0, islandEnabled: true } };
    expect(Value.Check(CreatePenkaRequestSchema, bad)).toBe(false);
    expect(
      [...Value.Errors(CreatePenkaRequestSchema, bad)].some((e) => e.path === '/settings/lives'),
    ).toBe(true);

    expect(
      Value.Check(CreatePenkaRequestSchema, {
        ...createRequest,
        settings: { lives: 2, islandEnabled: 'yes' },
      }),
    ).toBe(false);
  });

  it('rejects missing fields', () => {
    const withoutSettings = fx.omit(createRequest, 'settings');
    expect(Value.Check(CreatePenkaRequestSchema, withoutSettings)).toBe(false);
    expect(Value.Check(JoinPenkaRequestSchema, {})).toBe(false);
  });

  it('rejects wrong types', () => {
    expect(Value.Check(CreatePenkaRequestSchema, { ...createRequest, name: 42 })).toBe(false);
    expect(Value.Check(JoinPenkaRequestSchema, { joinCode: 123456 })).toBe(false);
  });

  it('rejects extra fields', () => {
    expect(Value.Check(CreatePenkaRequestSchema, { ...createRequest, joinCode: 'HACK' })).toBe(
      false,
    );
    expect(Value.Check(JoinPenkaRequestSchema, { joinCode: 'ABC123', userId: 'user-9' })).toBe(
      false,
    );
  });
});

describe('penkas response schemas', () => {
  it('accepts valid responses', () => {
    expect(Value.Check(CreatePenkaResponseSchema, { penka: fx.penka })).toBe(true);
    expect(Value.Check(JoinPenkaResponseSchema, { penka: fx.penka, entry: fx.entry })).toBe(true);
    expect(
      Value.Check(MyPenkasResponseSchema, { penkas: [{ penka: fx.penka, entry: fx.entry }] }),
    ).toBe(true);
    expect(Value.Check(MyPenkasResponseSchema, { penkas: [] })).toBe(true);
  });

  it('rejects items missing the entry delta', () => {
    expect(Value.Check(MyPenkasResponseSchema, { penkas: [{ penka: fx.penka }] })).toBe(false);
  });
});
