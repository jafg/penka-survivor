import type { EntryEffect, PickResult } from './types';

/**
 * What a matchday did to one player's pick, read off the effect the engine
 * already produced. It is a *label* on a resolution, never a second opinion
 * about it: no match is inspected here and no rule is re-applied, so the pick a
 * player sees marked `won` is the same one that earned them the point.
 *
 * - `won` — it scored. Only a correct pick ever earns a point.
 * - `lost` — it counted and did not score: either it cost a life, or the team
 *   was consumed and the point was not earned (an island player, who has no
 *   life left to lose).
 * - `void` — the resolution never counted it. The one way to get here is a
 *   penka with the island disabled, which voids its island players' picks.
 */
export function pickResultOf(effect: EntryEffect): PickResult {
  if (effect.pointsDelta === 1) {
    return 'won';
  }
  return effect.livesDelta === -1 || effect.teamConsumed !== null ? 'lost' : 'void';
}
