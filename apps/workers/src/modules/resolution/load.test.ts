import { describe, expect, it, vi } from 'vitest';
import { ObjectId, type Db } from 'mongodb';
import { Value } from '@sinclair/typebox/value';
import { EntrySchema, MatchSchema, MatchdaySchema, PlayerPickSchema } from '@penka/contracts';
import { loadResolutionState } from './load';
import type { EntryDoc, MatchDoc, MatchdayDoc, PenkaDoc, PickDoc } from './store';

const PENKA_ID = new ObjectId('6a80b60ffda322125df55e5f');
const ANA_ENTRY = new ObjectId('6a80b60ffda322125df55e60');
const LUIS_ENTRY = new ObjectId('6a80b60ffda322125df55e61');
const MATCHDAY_ID = 'copa-libertadores:md1';

const COMMAND = {
  penkaId: PENKA_ID.toHexString(),
  leagueId: 'copa-libertadores',
  matchday: 1,
  requestedAt: '2026-08-21T21:00:00.000Z',
};

const PENKA: PenkaDoc = {
  name: 'Oficina',
  leagueId: 'copa-libertadores',
  joinCode: 'ABC123',
  settings: { lives: 2, islandEnabled: true },
  createdBy: '6a80b60ffda322125df55e70',
  createdAt: new Date('2026-08-01T10:00:00.000Z'),
};

const MATCHDAY: MatchdayDoc = {
  _id: MATCHDAY_ID,
  leagueId: 'copa-libertadores',
  number: 1,
  status: 'locked',
  lockAt: new Date('2026-08-21T18:45:00.000Z'),
  resolveRequestedAt: new Date('2026-08-21T21:00:00.000Z'),
};

const MATCHES: MatchDoc[] = [
  {
    _id: 'copa-libertadores:md1:RIV-ATN',
    matchdayId: MATCHDAY_ID,
    leagueId: 'copa-libertadores',
    homeTeamCode: 'RIV',
    awayTeamCode: 'ATN',
    kickoffAt: new Date('2026-08-21T18:45:00.000Z'),
    outcome: 'home',
  },
];

const ENTRIES: (EntryDoc & { _id: ObjectId })[] = [
  {
    _id: ANA_ENTRY,
    penkaId: PENKA_ID.toHexString(),
    userId: '6a80b60ffda322125df55e70',
    lives: 2,
    status: 'alive',
    usedTeams: [],
    points: 0,
    createdAt: new Date('2026-08-01T10:00:00.000Z'),
  },
  {
    _id: LUIS_ENTRY,
    penkaId: PENKA_ID.toHexString(),
    userId: '6a80b60ffda322125df55e71',
    lives: 1,
    status: 'alive',
    usedTeams: ['BOC'],
    points: 1,
    createdAt: new Date('2026-08-01T11:00:00.000Z'),
  },
];

const PICKS: (PickDoc & { _id: ObjectId })[] = [
  {
    _id: new ObjectId(),
    entryId: ANA_ENTRY.toHexString(),
    matchdayId: MATCHDAY_ID,
    teamCode: 'RIV',
    createdAt: new Date('2026-08-20T10:00:00.000Z'),
    result: undefined,
  },
];

function fakeDb(
  overrides: {
    penka?: PenkaDoc | null;
    matchday?: MatchdayDoc | null;
    matches?: MatchDoc[];
    entries?: (EntryDoc & { _id: ObjectId })[];
    picks?: (PickDoc & { _id: ObjectId })[];
  } = {},
) {
  const findOnePenka = vi
    .fn()
    .mockResolvedValue(
      overrides.penka === undefined ? { _id: PENKA_ID, ...PENKA } : overrides.penka,
    );
  const findOneMatchday = vi
    .fn()
    .mockResolvedValue(overrides.matchday === undefined ? MATCHDAY : overrides.matchday);
  const findMatches = vi.fn(() => ({ toArray: async () => overrides.matches ?? MATCHES }));
  const findEntries = vi.fn(() => ({ toArray: async () => overrides.entries ?? ENTRIES }));
  const findPicks = vi.fn(() => ({ toArray: async () => overrides.picks ?? PICKS }));
  const byName: Record<string, unknown> = {
    penkas: { findOne: findOnePenka },
    matchdays: { findOne: findOneMatchday },
    matches: { find: findMatches },
    entries: { find: findEntries },
    picks: { find: findPicks },
  };
  const db = { collection: vi.fn((name: string) => byName[name]) } as unknown as Db;
  return { db, findOnePenka, findOneMatchday, findMatches, findEntries, findPicks };
}

describe('loadResolutionState', () => {
  it('reaches the matchday through the derived id, never through the message', async () => {
    // The command carries a league and a number; the document id is built from
    // exactly those two by the shared builder, so a worker cannot be pointed at
    // another league's matchday by a hand-written message.
    const { db, findOneMatchday, findMatches } = fakeDb();

    await loadResolutionState(db, COMMAND);

    expect(findOneMatchday).toHaveBeenCalledWith({ _id: MATCHDAY_ID });
    expect(findMatches).toHaveBeenCalledWith({ matchdayId: MATCHDAY_ID });
  });

  it('loads the picks of this penka only, through its own entries', async () => {
    // Penkas on one league share a calendar and therefore share matchday ids: a
    // pick belongs to a penka only through its entry, so filtering by matchday
    // alone would resolve one penka with another penka's picks.
    const { db, findEntries, findPicks } = fakeDb();

    await loadResolutionState(db, COMMAND);

    expect(findEntries).toHaveBeenCalledWith({ penkaId: PENKA_ID.toHexString() });
    expect(findPicks).toHaveBeenCalledWith({
      entryId: { $in: [ANA_ENTRY.toHexString(), LUIS_ENTRY.toHexString()] },
      matchdayId: MATCHDAY_ID,
    });
  });

  it('hands the engine contract types, not documents', async () => {
    const { db } = fakeDb();

    const state = await loadResolutionState(db, COMMAND);

    expect(state).not.toBeNull();
    expect(Value.Check(MatchdaySchema, state?.matchday)).toBe(true);
    expect(state?.matches.every((match) => Value.Check(MatchSchema, match))).toBe(true);
    expect(state?.entries.every((entry) => Value.Check(EntrySchema, entry))).toBe(true);
    expect(state?.picks.every((pick) => Value.Check(PlayerPickSchema, pick))).toBe(true);
  });

  it('carries the penka settings the engine resolves against', async () => {
    const { db } = fakeDb();

    const state = await loadResolutionState(db, COMMAND);

    expect(state?.settings).toEqual({ lives: 2, islandEnabled: true });
  });

  it('reports a penka that no longer exists instead of inventing an empty one', async () => {
    // Resolving nothing and marking it done would look like success.
    const { db } = fakeDb({ penka: null });

    expect(await loadResolutionState(db, COMMAND)).toBeNull();
  });

  it('reports a matchday the calendar does not have', async () => {
    const { db } = fakeDb({ matchday: null });

    expect(await loadResolutionState(db, COMMAND)).toBeNull();
  });

  it('refuses a penka that plays a different league than the message claims', async () => {
    // The penka id and the league id arrive in the same message and are trusted
    // separately; if they disagree, the matchday being resolved is not this
    // penka's and every effect would land on the wrong players.
    const { db } = fakeDb({ penka: { ...PENKA, leagueId: 'premier-league' } });

    expect(await loadResolutionState(db, COMMAND)).toBeNull();
  });

  it('reports a penka id that could never address a document', async () => {
    // `IdSchema` in @penka/contracts is any non-empty string — storage is free to
    // change — so the command schema cannot reject this and the driver throws on
    // it. A throw here reads as "retry", and three redeliveries later the same
    // string is still not an ObjectId: it belongs on the same ack-and-log path as
    // a penka that no longer exists.
    const { db, findOnePenka } = fakeDb();

    expect(await loadResolutionState(db, { ...COMMAND, penkaId: 'not-an-object-id' })).toBeNull();
    expect(findOnePenka).not.toHaveBeenCalled();
  });

  it('does not ask for picks when the penka has no entries yet', async () => {
    // `$in: []` matches nothing, so the query is not wrong — it is just a round
    // trip for a result already known.
    const { db, findPicks } = fakeDb({ entries: [] });

    const state = await loadResolutionState(db, COMMAND);

    expect(findPicks).not.toHaveBeenCalled();
    expect(state?.picks).toEqual([]);
    expect(state?.entries).toEqual([]);
  });
});
