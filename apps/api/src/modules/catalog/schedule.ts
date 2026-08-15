import type { FixtureMatchup } from '@penka/contracts';

function at(codes: readonly string[], index: number): string {
  const code = codes[index];
  if (code === undefined) {
    throw new Error(`no team at index ${index}`);
  }
  return code;
}

/**
 * Circle-method round robin: the first team stays put while the rest rotate one
 * place per round. Every round therefore pairs each team exactly once, and no
 * pairing repeats until the teams have all played each other. Home and away
 * swap on odd rounds so the fixed team is not always the home side.
 */
export function buildRoundRobin(codes: readonly string[], rounds: number): FixtureMatchup[][] {
  if (codes.length < 2 || codes.length % 2 !== 0) {
    throw new Error(`a round robin needs an even number of teams, got ${codes.length}`);
  }
  if (rounds > codes.length - 1) {
    throw new Error(
      `${codes.length} teams play at most ${codes.length - 1} rounds without a rematch, asked for ${rounds}`,
    );
  }

  const rotation = [...codes];
  const half = rotation.length / 2;
  const schedule: FixtureMatchup[][] = [];

  for (let round = 0; round < rounds; round += 1) {
    const matchups: FixtureMatchup[] = [];
    for (let slot = 0; slot < half; slot += 1) {
      const first = at(rotation, slot);
      const second = at(rotation, rotation.length - 1 - slot);
      matchups.push(
        round % 2 === 0
          ? { homeTeamCode: first, awayTeamCode: second }
          : { homeTeamCode: second, awayTeamCode: first },
      );
    }
    schedule.push(matchups);

    const moved = at(rotation, rotation.length - 1);
    rotation.splice(rotation.length - 1, 1);
    rotation.splice(1, 0, moved);
  }

  return schedule;
}
