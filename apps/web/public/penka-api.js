/*
 * penka-api.js — the module `prototype.html` loads on its first line.
 *
 * The prototype was handed over as a single HTML file that opens with
 * `<script src="penka-api.js">` and then reads `PenkaAPI.TEAMS` at the top of
 * its own script. That sibling file was never part of the handover, so a
 * verbatim copy of the prototype throws on boot and renders nothing but
 * skeletons — which would make the /__parity panel useless.
 *
 * So this file is reconstructed FROM the prototype's call sites, and it exists
 * only to feed them. It is NOT a spec of anything:
 *
 *   - it is not the data contract (the real API is — see docs/… and the notes
 *     in `src/api/`), and it deliberately keeps the prototype's own vocabulary
 *     (`pools`, `pickHidden`, pre-composed history strings) precisely because
 *     that vocabulary is what the prototype's code expects;
 *   - it is not shipped anywhere the app can reach it: nothing under `src/`
 *     imports it, and it is only ever loaded inside the parity iframe.
 *
 * The fixtures are chosen to exercise every state the checklist compares:
 * an open matchday with a used team and a pick, a populated island, resolved
 * history rows, and a second pool that is on the island.
 */
'use strict';

window.PenkaAPI = (function () {
  /** Codes → display names, from the real catalog's `copa-libertadores` league. */
  const TEAMS = {
    RIV: 'River Plate',
    BOC: 'Boca Juniors',
    FLA: 'Flamengo',
    PAL: 'Palmeiras',
    PEN: 'Peñarol',
    NAC: 'Nacional',
    CCO: 'Colo-Colo',
    ATN: 'Atlético Nacional',
  };

  const OUTCOME = { HOME: 'home', DRAW: 'draw', AWAY: 'away' };

  const POOLS = [
    {
      id: 'pool-oficina',
      name: 'Survivor de la oficina',
      tournament: 'Copa Libertadores',
      myStatus: 'alive',
      myLives: 1,
      players: 9,
      matchday: 2,
    },
    {
      id: 'pool-familia',
      name: 'Los primos',
      tournament: 'Copa Libertadores',
      myStatus: 'island',
      myLives: 0,
      players: 6,
      matchday: 2,
    },
  ];

  /** Two hours out, so the countdown renders a full HH:MM:SS on every load. */
  const lockAt = new Date(Date.now() + 2 * 60 * 60 * 1000 + 34 * 60 * 1000).toISOString();

  const MATCHDAY = {
    'pool-oficina': {
      poolName: 'Survivor de la oficina',
      tournament: 'Copa Libertadores',
      matchday: 2,
      lockAt,
      isLocked: false,
      isResolved: false,
      myPick: null,
      myLives: 1,
      myStatus: 'alive',
      usedTeams: ['RIV'],
      matches: [
        { home: 'RIV', away: 'BOC', kickoff: '21:30', outcome: null },
        { home: 'FLA', away: 'PAL', kickoff: '21:30', outcome: null },
        { home: 'PEN', away: 'NAC', kickoff: '23:00', outcome: null },
        { home: 'CCO', away: 'ATN', kickoff: '23:00', outcome: null },
      ],
    },
    'pool-familia': {
      poolName: 'Los primos',
      tournament: 'Copa Libertadores',
      matchday: 2,
      lockAt,
      isLocked: false,
      isResolved: false,
      myPick: null,
      myLives: 0,
      myStatus: 'island',
      usedTeams: ['BOC', 'FLA'],
      matches: [
        { home: 'RIV', away: 'BOC', kickoff: '21:30', outcome: null },
        { home: 'FLA', away: 'PAL', kickoff: '21:30', outcome: null },
        { home: 'PEN', away: 'NAC', kickoff: '23:00', outcome: null },
        { home: 'CCO', away: 'ATN', kickoff: '23:00', outcome: null },
      ],
    },
  };

  const BOARD = {
    'pool-oficina': {
      poolId: 'pool-oficina',
      matchday: 2,
      isResolved: false,
      totalPlayers: 9,
      nextPollInSec: 10,
      alive: [
        { name: 'Ana Suárez', isMe: false, lives: 2, pick: null, pickHidden: true },
        { name: 'Vos', isMe: true, lives: 1, pick: null, pickHidden: true },
        { name: 'Bruno Ferreira', isMe: false, lives: 1, pick: null, pickHidden: true },
        { name: 'Carla Méndez', isMe: false, lives: 1, pick: null, pickHidden: true },
        { name: 'Diego Rojas', isMe: false, lives: 1, pick: null, pickHidden: true },
        { name: 'Eugenia Paz', isMe: false, lives: 1, pick: null, pickHidden: true },
      ],
      island: [
        { name: 'Facundo Gil', isMe: false, points: 3, pick: null, pickHidden: true },
        { name: 'Gabriela Ruiz', isMe: false, points: 2, pick: null, pickHidden: true },
        { name: 'Hernán Costa', isMe: false, points: 1, pick: null, pickHidden: true },
      ],
      history: [
        {
          matchday: 1,
          headline: 'Cayeron 3 jugadores',
          detail: 'Facundo Gil, Gabriela Ruiz, Hernán Costa',
        },
      ],
    },
    'pool-familia': {
      poolId: 'pool-familia',
      matchday: 2,
      isResolved: false,
      totalPlayers: 6,
      nextPollInSec: 10,
      alive: [
        { name: 'Inés Vera', isMe: false, lives: 2, pick: null, pickHidden: true },
        { name: 'Joaquín Silva', isMe: false, lives: 1, pick: null, pickHidden: true },
      ],
      island: [{ name: 'Vos', isMe: true, points: 1, pick: null, pickHidden: true }],
      history: [
        { matchday: 1, headline: 'Cayeron 4 jugadores', detail: 'Vos, Karina Lema, Luis Ortiz, Mora Díaz' },
      ],
    },
  };

  const delay = (value) => new Promise((resolve) => setTimeout(() => resolve(value), 120));

  const clone = (value) => JSON.parse(JSON.stringify(value));

  return {
    TEAMS,
    OUTCOME,
    getMyPools: () => delay(clone(POOLS)),
    getBoard: (poolId) => delay(clone(BOARD[poolId] ?? BOARD['pool-oficina'])),
    getCurrentMatchday: (poolId) => delay(clone(MATCHDAY[poolId] ?? MATCHDAY['pool-oficina'])),
    submitPick: (poolId, teamCode) => {
      const matchday = MATCHDAY[poolId] ?? MATCHDAY['pool-oficina'];
      matchday.myPick = teamCode;
      return delay({ ok: true });
    },
  };
})();
