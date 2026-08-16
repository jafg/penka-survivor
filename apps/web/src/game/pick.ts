import type { Entry, Match, Matchday, MyEntry, PenkaSettings } from '@penka/contracts';
import { validatePick, type PickValidation } from '@penka/game-engine';

/**
 * Everything the rule needs, in the shapes this app actually holds.
 *
 * `myEntry` rather than `entry`: the personal route answers a delta, not the
 * stored row.
 */
export interface MyPickContext {
  myEntry: MyEntry;
  settings: PenkaSettings;
  matchday: Matchday;
  matches: readonly Match[];
  now: Date;
}

/**
 * Can this player pick this team right now?
 *
 * An ADAPTER, not a rule. The decision belongs to `validatePick` in
 * `@penka/game-engine` — the same function the API runs before it accepts a
 * pick — and all this does is line up the arguments. Deciding here instead would
 * put a second, quietly diverging copy of the rules in the browser: the moment
 * the two disagree, the UI either offers a pick the server will reject or hides
 * one it would have taken.
 *
 * Note what that means for the island. The prototype greyed out every button
 * for an island player; the engine lets them keep picking whenever the penka has
 * `islandEnabled`, because each hit is worth a point on the island table. The
 * rule wins.
 */
export function validateMyPick(context: MyPickContext, teamCode: string): PickValidation {
  return validatePick({
    entry: toEntry(context.myEntry),
    matchday: context.matchday,
    matches: context.matches,
    teamCode,
    now: context.now.toISOString(),
    settings: context.settings,
  });
}

/**
 * `MyEntry` widened to the `Entry` the engine takes.
 *
 * The identifiers are placeholders on purpose: `validatePick` reads `status` and
 * `usedTeams` and nothing else, and the personal route does not send the rest —
 * it is a delta about the signed-in player, who by definition is the one asking.
 * Inventing an id here is safe precisely because no rule can see it.
 */
function toEntry(myEntry: MyEntry): Entry {
  return {
    id: 'me',
    penkaId: 'me',
    userId: 'me',
    lives: myEntry.lives,
    status: myEntry.status,
    usedTeams: myEntry.usedTeams,
    points: 0,
  };
}
