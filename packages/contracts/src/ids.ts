/**
 * Deterministic document ids. Derived, never generated: the same league always
 * names its matchdays and matches the same way, which is what makes
 * materializing a league's calendar idempotent (the second penka on a league
 * re-derives the first one's ids instead of duplicating its fixtures).
 *
 * They live in the contract because they cross apps: the public API writes
 * them, the back office addresses them in its routes, and the workers resolve
 * them off a message. A shape only one app knows how to build is not derived —
 * it is a private convention that happens to be readable.
 *
 * The separator is a colon, so an id is legal in a URL path segment but must be
 * `encodeURIComponent`-ed by clients — see the back office's route notes.
 */

/** `copa-libertadores:md1` */
export function matchdayId(leagueId: string, number: number): string {
  return `${leagueId}:md${number}`;
}

/** `copa-libertadores:md1:RIV-BOC` — home team first, so the id is not symmetric. */
export function matchId(matchdayId: string, homeTeamCode: string, awayTeamCode: string): string {
  return `${matchdayId}:${homeTeamCode}-${awayTeamCode}`;
}
