/*
 * penka-api.js — the sibling script `prototype.html` loads before its own.
 *
 * The back-office prototype was handed over as a single HTML file whose script
 * opens with `PenkaAPI.TEAMS` and then drives every panel through
 * `PenkaAPI.admin*`. That sibling file was never part of the handover, so a
 * verbatim copy of the prototype throws on its first line and renders an empty
 * console — which would make the /__parity panel useless.
 *
 * So this file is reconstructed FROM the prototype's call sites, and exists
 * only to feed them. It is NOT a spec of anything:
 *
 *   - it is not the data contract. The real one is `@penka/contracts/api/admin`
 *     and it disagrees with this file in several places on purpose (results and
 *     resolve are league-scoped, resolve is asynchronous and answers
 *     `{queued:true}`, `resolvedMatchdays` is a count rather than a list). Those
 *     disagreements are recorded in the back-office section of
 *     `docs/visual-parity-checklist.md`;
 *   - it keeps the prototype's own vocabulary (`pools`, `tenantId`, `tournament`,
 *     a `degraded` polling profile) precisely because that vocabulary is what
 *     the prototype's code expects;
 *   - nothing under `src/` imports it. It is only ever loaded inside the parity
 *     iframe, and `pnpm build` never reaches it.
 *
 * The fixtures are chosen to exercise every state the checklist compares: a
 * closed matchday with some results loaded and some pending, so the outcome
 * selector shows both its states side by side; two pools, one of them with
 * resolved matchdays; and a request log that starts empty so the console's
 * empty state is visible on first paint.
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

  const POLL_SECONDS = { normal: 10, live: 2, degraded: 30 };

  function seed() {
    return {
      tournament: { id: 'copa-america', name: 'Copa Libertadores' },
      matchday: {
        number: 2,
        status: 'locked',
        isLocked: true,
        lockAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
      },
      pollingProfile: 'normal',
      matches: [
        { id: 'copa-america:md2:RIV-BOC', home: 'RIV', away: 'BOC', kickoff: '21:30', outcome: 'home' },
        { id: 'copa-america:md2:FLA-PAL', home: 'FLA', away: 'PAL', kickoff: '21:30', outcome: 'draw' },
        { id: 'copa-america:md2:PEN-NAC', home: 'PEN', away: 'NAC', kickoff: '23:00', outcome: null },
        { id: 'copa-america:md2:CCO-ATN', home: 'CCO', away: 'ATN', kickoff: '23:00', outcome: null },
      ],
      pools: [
        {
          id: 'pool-oficina',
          name: 'Survivor de la oficina',
          tenantId: 'penka-demo',
          players: 9,
          alive: 6,
          island: 3,
          picksReceived: 8,
          resolvedMatchdays: [1],
        },
        {
          id: 'pool-familia',
          name: 'Los primos',
          tenantId: 'penka-demo',
          players: 6,
          alive: 2,
          island: 4,
          picksReceived: 5,
          resolvedMatchdays: [1],
        },
      ],
    };
  }

  let state = seed();

  /** Subscribers of the API console. The prototype registers exactly one. */
  const listeners = [];

  function announce(method, path, status, code) {
    const entry = { method, path, status, ms: 40 + Math.round(Math.random() * 90), code };
    listeners.forEach((listener) => listener(entry));
  }

  /** Every call answers after a beat and logs itself, like a real round trip. */
  function respond(method, path, value, status) {
    return new Promise((resolve) => {
      setTimeout(() => {
        announce(method, path, status || 200);
        resolve(JSON.parse(JSON.stringify(value)));
      }, 120);
    });
  }

  function reject(method, path, status, code, message) {
    return new Promise((_resolve, rejectPromise) => {
      setTimeout(() => {
        announce(method, path, status, code);
        rejectPromise(new Error(message));
      }, 120);
    });
  }

  function pending() {
    return state.matches.filter((match) => !match.outcome).length;
  }

  return {
    TEAMS,
    OUTCOME,
    _isMock: true,

    onTraffic(listener) {
      listeners.push(listener);
    },

    adminGetMatchday(tournamentId, number) {
      return respond('GET', `/admin/tournaments/${tournamentId}/matchdays/${number}`, {
        tournament: state.tournament,
        matchday: state.matchday,
        matches: state.matches,
        pollingProfile: state.pollingProfile,
        nextPollInSec: POLL_SECONDS[state.pollingProfile],
      });
    },

    adminGetPools() {
      return respond('GET', '/admin/pools', state.pools);
    },

    adminSetResult(matchId, outcome) {
      if (state.matchday.status === 'resolved') {
        return reject(
          'POST',
          `/admin/matches/${matchId}/result`,
          409,
          'already_resolved',
          'La fecha ya fue resuelta',
        );
      }
      const match = state.matches.find((candidate) => candidate.id === matchId);
      if (match) {
        match.outcome = outcome;
      }
      return respond('POST', `/admin/matches/${matchId}/result`, {
        pendingMatches: pending(),
        readyToResolve: pending() === 0,
      });
    },

    adminCloseMatchday(tournamentId, number) {
      state.matchday.status = 'locked';
      state.matchday.isLocked = true;
      return respond(
        'POST',
        `/admin/tournaments/${tournamentId}/matchdays/${number}/close`,
        { matchday: state.matchday },
      );
    },

    adminResolve(tournamentId, number) {
      const path = `/admin/tournaments/${tournamentId}/matchdays/${number}/resolve`;
      if (state.matchday.status === 'resolved') {
        return respond('POST', path, { idempotent: true, pools: [] });
      }
      if (pending() > 0) {
        return reject('POST', path, 409, 'results_missing', 'Faltan resultados por cargar');
      }
      state.matchday.status = 'resolved';
      state.pools.forEach((pool) => pool.resolvedMatchdays.push(number));
      return respond('POST', path, {
        idempotent: false,
        pools: [{ eliminated: ['Bruno Ferreira', 'Carla Méndez'] }, { eliminated: ['Inés Vera'] }],
      });
    },

    adminSetPolling(profile) {
      state.pollingProfile = profile;
      return respond('PUT', '/admin/polling-profile', {
        profile,
        nextPollInSec: POLL_SECONDS[profile],
      });
    },

    _resetMockData() {
      state = seed();
    },
  };
})();
