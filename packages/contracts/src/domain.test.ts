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
  type BoardPlayer,
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
    expect(Value.Check(BoardSchema, { ...fx.board, myPick: fx.teamCode })).toBe(false);
    expect(
      Value.Check(PenkaSchema, {
        ...fx.penka,
        settings: { ...fx.penkaSettings, maxEntries: 10 },
      }),
    ).toBe(false);
  });

  it('makes a team country optional (national teams are their own country)', () => {
    expect(Value.Check(TeamSchema, fx.omit(fx.team, 'country'))).toBe(true);
    expect(Value.Check(TeamSchema, { ...fx.team, country: '' })).toBe(false);
  });

  it('requires a stable short team code', () => {
    expect(Value.Check(TeamSchema, { ...fx.team, code: 'R' })).toBe(false);
    expect(Value.Check(TeamSchema, { ...fx.team, code: 'RIVERPLATE' })).toBe(false);
  });

  it('keeps team codes to characters that are safe inside a derived id', () => {
    // Storage derives document ids by joining parts with ':' and '-'
    // (`la-liga:md1:RIV-BOC`). A code carrying either separator would make those
    // ids ambiguous, so the code alphabet excludes them at the contract.
    for (const code of ['RI-V', 'RI:V', 'ri v', 'RÍV']) {
      expect(Value.Check(TeamSchema, { ...fx.team, code })).toBe(false);
    }
    for (const code of ['RIV', 'BOC', 'PSG', 'M1', 'ABCDE']) {
      expect(Value.Check(TeamSchema, { ...fx.team, code })).toBe(true);
    }
  });

  it('identifies the teams in a match by their catalog code', () => {
    expect(Object.keys(MatchSchema.properties).sort()).toEqual([
      'awayTeamCode',
      'homeTeamCode',
      'id',
      'kickoffAt',
      'matchdayId',
      'outcome',
    ]);
    // A generated id is not a code: a match points straight at the catalog, so
    // the shape of the value is what says which world it belongs to.
    expect(
      Value.Check(MatchSchema, { ...fx.match, homeTeamCode: '6a80b60ffda322125df55e5f' }),
    ).toBe(false);
  });

  it('records picks and used teams as catalog codes', () => {
    expect(Value.Check(PlayerPickSchema, { ...fx.pick, teamCode: 'R' })).toBe(false);
    expect(Value.Check(EntrySchema, { ...fx.entry, usedTeams: ['RIVERPLATE'] })).toBe(false);
    expect(Value.Check(MyEntrySchema, { ...fx.myEntry, usedTeams: ['RIVERPLATE'] })).toBe(false);
    expect(Value.Check(MyEntrySchema, { ...fx.myEntry, myPick: 'RIVERPLATE' })).toBe(false);
  });

  it('only allows league region america|europe|world', () => {
    for (const region of ['america', 'europe', 'world']) {
      expect(Value.Check(LeagueSchema, { ...fx.league, region })).toBe(true);
    }
    expect(Value.Check(LeagueSchema, { ...fx.league, region: 'asia' })).toBe(false);
  });

  it('only allows lock offsets that point forward from materialization', () => {
    const [first] = fx.fixtureTemplate.matchdays;
    expect(
      Value.Check(FixtureTemplateSchema, {
        ...fx.fixtureTemplate,
        matchdays: [{ ...first, lockAtOffsetMinutes: -15 }],
      }),
    ).toBe(false);
  });

  it('requires a fixture template to schedule at least one matchday of matchups', () => {
    expect(Value.Check(FixtureTemplateSchema, { ...fx.fixtureTemplate, matchdays: [] })).toBe(
      false,
    );
    const [first] = fx.fixtureTemplate.matchdays;
    expect(
      Value.Check(FixtureTemplateSchema, {
        ...fx.fixtureTemplate,
        matchdays: [{ ...first, matchups: [] }],
      }),
    ).toBe(false);
    expect(
      Value.Check(FixtureTemplateSchema, {
        ...fx.fixtureTemplate,
        matchdays: [{ ...first, matchups: [{ homeTeamCode: 'RIV' }] }],
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

  it('caps penka settings lives at 3', () => {
    for (const lives of [1, 2, 3]) {
      expect(
        Value.Check(PenkaSchema, { ...fx.penka, settings: { lives, islandEnabled: true } }),
      ).toBe(true);
    }
    expect(
      Value.Check(PenkaSchema, { ...fx.penka, settings: { lives: 4, islandEnabled: true } }),
    ).toBe(false);
  });
});

describe('Board is public: shared data only, never the viewer', () => {
  it('has no viewer-identifying fields in the schema (runtime)', () => {
    const boardKeys = Object.keys(BoardSchema.properties);
    for (const forbidden of ['myPick', 'usedTeams', 'email', 'userId', 'entryId', 'joinCode']) {
      expect(boardKeys).not.toContain(forbidden);
    }
  });

  it('board players expose displayName, lives, points and pick — nothing else', () => {
    expect(Object.keys(BoardPlayerSchema.properties).sort()).toEqual([
      'displayName',
      'lives',
      'pick',
      'points',
    ]);
  });

  it('keeps player-private state off the board even now that picks are on it', () => {
    // A pick becomes public at lock; a used-team list and any identifier never
    // do — they stay structurally impossible, not merely omitted.
    for (const forbidden of ['usedTeams', 'email', 'userId', 'entryId']) {
      expect(Object.keys(BoardPlayerSchema.properties)).not.toContain(forbidden);
    }
    expect(Value.Check(BoardPlayerSchema, { ...fx.boardPlayer, usedTeams: ['RIV'] })).toBe(false);
    expect(Value.Check(BoardPlayerSchema, { ...fx.boardPlayer, userId: 'user-1' })).toBe(false);
  });

  it('structurally cannot contain personal fields (compile time)', () => {
    expectTypeOf<Board>().not.toHaveProperty('myPick');
    expectTypeOf<Board>().not.toHaveProperty('usedTeams');
    expectTypeOf<Board>().not.toHaveProperty('email');
    expectTypeOf<Board>().not.toHaveProperty('userId');
    expectTypeOf<BoardPlayer>().not.toHaveProperty('usedTeams');
    expectTypeOf<BoardPlayer>().not.toHaveProperty('userId');
    expectTypeOf<BoardPlayer>().toHaveProperty('points');
    expectTypeOf<BoardPlayer>().toHaveProperty('pick');
  });

  it('carries a pick as a catalog code or null, with no pickHidden flag', () => {
    expect(Value.Check(BoardPlayerSchema, { ...fx.boardPlayer, pick: 'BOC' })).toBe(true);
    expect(Value.Check(BoardPlayerSchema, { ...fx.boardPlayer, pick: null })).toBe(true);
    expect(Value.Check(BoardPlayerSchema, { ...fx.boardPlayer, pick: 'RIVERPLATE' })).toBe(false);
    expect(Value.Check(BoardPlayerSchema, { ...fx.boardPlayer, pickHidden: true })).toBe(false);
  });

  it('leaves the lock gate to the builder: null means hidden or never picked', () => {
    // Before lock the board shows every pick as null; after lock a null means
    // the player never picked. The wire cannot separate the two — clients read
    // board.isLocked. The schema cannot express the gate either, so the pre-lock
    // null is enforced at runtime by the board builder (integration-tested in
    // the game module).
    expect(Value.Check(BoardSchema, fx.board)).toBe(true);
    expect(fx.board.isLocked).toBe(false);
    expect(fx.board.alive.map((player) => player.pick)).toEqual([null]);
    expect(fx.board.island.map((player) => player.pick)).toEqual([null]);

    expect(Value.Check(BoardSchema, fx.lockedBoard)).toBe(true);
    expect(fx.lockedBoard.isLocked).toBe(true);
    expect(fx.lockedBoard.alive.map((player) => player.pick)).toEqual(['RIV']);
    expect(fx.lockedBoard.island.map((player) => player.pick)).toEqual([null]);
  });

  it('shows points, so an island player has a public standing to play for', () => {
    expect(Value.Check(BoardPlayerSchema, { ...fx.boardPlayer, points: 0 })).toBe(true);
    expect(Value.Check(BoardPlayerSchema, { ...fx.boardPlayer, points: -1 })).toBe(false);
    expect(Value.Check(BoardPlayerSchema, { ...fx.boardPlayer, points: 1.5 })).toBe(false);
    expect(Value.Check(BoardPlayerSchema, fx.omit(fx.boardPlayer, 'points'))).toBe(false);
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
