import { Value } from '@sinclair/typebox/value';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  BoardPlayerSchema,
  BoardSchema,
  EntrySchema,
  FixtureTemplateSchema,
  LeagueSchema,
  MatchSchema,
  MatchdaySchema,
  MyEntrySchema,
  PenkaSchema,
  PlayerPickSchema,
  ResolutionSchema,
  TeamSchema,
  UserSchema,
  type Board,
  type MyEntry,
  type User,
} from './domain';
import * as fx from './test-support/fixtures';

describe('domain schemas accept valid payloads', () => {
  it.each([
    ['Team', TeamSchema, fx.team],
    ['League', LeagueSchema, fx.league],
    ['FixtureTemplate', FixtureTemplateSchema, fx.fixtureTemplate],
    ['Match', MatchSchema, fx.match],
    ['Matchday', MatchdaySchema, fx.matchday],
    ['User', UserSchema, fx.user],
    ['Penka', PenkaSchema, fx.penka],
    ['Entry', EntrySchema, fx.entry],
    ['PlayerPick', PlayerPickSchema, fx.pick],
    ['Resolution', ResolutionSchema, fx.resolution],
    ['Board', BoardSchema, fx.board],
    ['MyEntry', MyEntrySchema, fx.myEntry],
  ] as const)('%s', (_name, schema, payload) => {
    expect(Value.Check(schema, payload)).toBe(true);
  });
});

describe('domain schemas reject invalid payloads', () => {
  it('rejects wrong types with a useful error path', () => {
    const badEntry = { ...fx.entry, lives: 'two' };
    expect(Value.Check(EntrySchema, badEntry)).toBe(false);

    const errors = [...Value.Errors(EntrySchema, badEntry)];
    expect(errors.some((e) => e.path === '/lives')).toBe(true);
    for (const e of errors) expect(e.message).toBeTruthy();
  });

  it('rejects missing fields', () => {
    const penkaWithoutJoinCode = fx.omit(fx.penka, 'joinCode');
    expect(Value.Check(PenkaSchema, penkaWithoutJoinCode)).toBe(false);
    expect(
      [...Value.Errors(PenkaSchema, penkaWithoutJoinCode)].some((e) => e.path === '/joinCode'),
    ).toBe(true);
  });

  it('rejects extra fields (additionalProperties: false)', () => {
    expect(Value.Check(TeamSchema, { ...fx.team, stadium: 'Monumental' })).toBe(false);
    expect(Value.Check(EntrySchema, { ...fx.entry, isAdmin: true })).toBe(false);
    expect(Value.Check(BoardSchema, { ...fx.board, myPick: 'team-1' })).toBe(false);
    expect(
      Value.Check(PenkaSchema, {
        ...fx.penka,
        settings: { ...fx.penkaSettings, maxEntries: 10 },
      }),
    ).toBe(false);
  });

  it('only allows matchday status open|locked|resolved', () => {
    for (const status of ['open', 'locked', 'resolved']) {
      expect(Value.Check(MatchdaySchema, { ...fx.matchday, status })).toBe(true);
    }
    expect(Value.Check(MatchdaySchema, { ...fx.matchday, status: 'cancelled' })).toBe(false);
  });

  it('only allows entry status alive|island', () => {
    for (const status of ['alive', 'island']) {
      expect(Value.Check(EntrySchema, { ...fx.entry, status })).toBe(true);
    }
    expect(Value.Check(EntrySchema, { ...fx.entry, status: 'eliminated' })).toBe(false);
  });

  it('only allows match outcome home|draw|away|null', () => {
    for (const outcome of ['home', 'draw', 'away', null]) {
      expect(Value.Check(MatchSchema, { ...fx.match, outcome })).toBe(true);
    }
    expect(Value.Check(MatchSchema, { ...fx.match, outcome: '2-1' })).toBe(false);
  });

  it('rejects invalid emails on User', () => {
    expect(Value.Check(UserSchema, { ...fx.user, email: 'not-an-email' })).toBe(false);
  });

  it('only accepts ISO-8601 timestamps', () => {
    for (const lockAt of [
      '2026-08-21T18:45:00.000Z',
      '2026-08-21T18:45:00Z',
      '2026-08-21T18:45:00+03:00',
    ]) {
      expect(Value.Check(MatchdaySchema, { ...fx.matchday, lockAt })).toBe(true);
    }
    for (const lockAt of ['tomorrow', '21/08/2026', '2026-08-21', '']) {
      expect(Value.Check(MatchdaySchema, { ...fx.matchday, lockAt })).toBe(false);
    }
  });

  it('requires penka settings lives >= 1', () => {
    expect(
      Value.Check(PenkaSchema, { ...fx.penka, settings: { lives: 0, islandEnabled: true } }),
    ).toBe(false);
  });
});

describe('Board is public and carries no personal data', () => {
  it('has no personal fields in the schema (runtime)', () => {
    const boardKeys = Object.keys(BoardSchema.properties);
    for (const forbidden of ['myPick', 'usedTeams', 'email', 'userId', 'entryId', 'joinCode']) {
      expect(boardKeys).not.toContain(forbidden);
    }
  });

  it('board players expose only displayName and lives', () => {
    expect(Object.keys(BoardPlayerSchema.properties).sort()).toEqual(['displayName', 'lives']);
  });

  it('structurally cannot contain personal fields (compile time)', () => {
    expectTypeOf<Board>().not.toHaveProperty('myPick');
    expectTypeOf<Board>().not.toHaveProperty('usedTeams');
    expectTypeOf<Board>().not.toHaveProperty('email');
    expectTypeOf<Board>().not.toHaveProperty('userId');
  });
});

describe('User never exposes passwordHash', () => {
  it('runtime schema has no passwordHash', () => {
    expect(Object.keys(UserSchema.properties)).not.toContain('passwordHash');
  });

  it('compile-time type has no passwordHash', () => {
    expectTypeOf<User>().not.toHaveProperty('passwordHash');
  });
});

describe('MyEntry is the personal delta', () => {
  it('has exactly the personal fields', () => {
    expect(Object.keys(MyEntrySchema.properties).sort()).toEqual([
      'lives',
      'myPick',
      'status',
      'usedTeams',
    ]);
    expectTypeOf<MyEntry>().toHaveProperty('myPick');
    expectTypeOf<MyEntry>().toHaveProperty('usedTeams');
  });

  it('allows myPick to be null before picking', () => {
    expect(Value.Check(MyEntrySchema, { ...fx.myEntry, myPick: null })).toBe(true);
    expect(Value.Check(MyEntrySchema, { ...fx.myEntry, myPick: 123 })).toBe(false);
  });
});
