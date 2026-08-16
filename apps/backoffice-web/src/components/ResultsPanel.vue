<script setup lang="ts">
import type { Match, MatchOutcome } from '@penka/contracts';
import { formatTime } from '../format/time';
import { useMatchdayStore } from '../stores/matchday';

const matchday = useMatchdayStore();

/**
 * The three outcomes, in the prototype's order. Home and away are labelled with
 * the team CODES: the admin API sends `homeTeamCode`/`awayTeamCode` and no names,
 * and the operator console reads the same codes the API speaks.
 */
function options(match: Match): { outcome: MatchOutcome; label: string }[] {
  return [
    { outcome: 'home', label: match.homeTeamCode },
    { outcome: 'draw', label: 'Empate' },
    { outcome: 'away', label: match.awayTeamCode },
  ];
}

function kickoff(match: Match): string {
  return formatTime(match.kickoffAt);
}
</script>

<template>
  <section class="panel">
    <div class="panel-head">
      <h2>Resultados</h2>
      <span class="hint">POST /admin/v1/matches/:id/result</span>
    </div>
    <table>
      <thead>
        <tr>
          <th>Partido</th>
          <th>Hora</th>
          <th>Resultado</th>
          <th>Estado</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="match in matchday.matches" :key="match.id">
          <td class="cell-strong">{{ match.homeTeamCode }} vs {{ match.awayTeamCode }}</td>
          <td class="cell-muted tnum">{{ kickoff(match) }}</td>
          <td>
            <div class="outcome-group">
              <button
                v-for="option in options(match)"
                :key="option.outcome"
                class="outcome-btn"
                :class="{ 'is-selected': match.outcome === option.outcome }"
                :disabled="!matchday.canLoadResults"
                :aria-pressed="match.outcome === option.outcome"
                @click="matchday.loadResult(match.id, option.outcome)"
              >
                {{ option.label }}
              </button>
            </div>
          </td>
          <td class="cell-muted">{{ match.outcome ? 'Cargado' : 'Pendiente' }}</td>
        </tr>
      </tbody>
    </table>
    <div v-if="matchday.matches.length === 0" class="table-empty">
      Esta fecha todavía no tiene partidos.
    </div>
  </section>
</template>
