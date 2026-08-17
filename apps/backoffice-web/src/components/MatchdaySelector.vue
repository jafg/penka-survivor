<script setup lang="ts">
import { computed } from 'vue';
import { matchdayStatusLabel } from '../format/status';
import { useMatchdayStore } from '../stores/matchday';
import { usePoolsStore } from '../stores/pools';

/**
 * Which competition and which fecha the console is working on.
 *
 * Not in the prototype, which showed a single hard-coded matchday. It exists
 * because the console used to GUESS both: the league from the first penka in the
 * listing, the number as "one after the last resolved". Guessing left penkas on a
 * second league unreachable, and walked off the end of a finished league into a
 * `matchday_not_found` the operator could neither cause nor clear. Both values
 * now come from data the API actually sent — the penka listing and the league's
 * own calendar — so neither can name something that does not exist.
 */
const pools = usePoolsStore();
const matchday = useMatchdayStore();

/**
 * League IDS, not names: the admin API sends no league name anywhere, and the
 * back office is not allowed to read the public catalog. The id is what the
 * operator already sees in the top bar and in every URL the console logs.
 */
const leagues = computed(() => pools.leaguesInPlay);

const hint = computed(() => {
  if (!matchday.hasCalendar) {
    return 'Sin fechas';
  }
  // A finished competition is a state, not a failure — say so, because the
  // controls below it are all legitimately dead.
  return matchday.isLeagueFinished ? 'Competencia finalizada' : `${matchday.calendar.length} fechas`;
});

async function chooseLeague(event: Event): Promise<void> {
  await matchday.openLeague((event.target as HTMLSelectElement).value);
}
</script>

<template>
  <section class="panel">
    <div class="panel-head">
      <h2>Competencia</h2>
      <span class="spacer"></span>
      <span class="hint">{{ hint }}</span>
    </div>
    <div class="panel-body selector">
      <label class="selector-field">
        <span class="selector-label">Liga</span>
        <select
          class="selector-select"
          :value="matchday.leagueId ?? ''"
          :disabled="matchday.isBusy || leagues.length === 0"
          @change="chooseLeague"
        >
          <option v-for="leagueId in leagues" :key="leagueId" :value="leagueId">
            {{ leagueId }}
          </option>
        </select>
      </label>
      <div class="selector-field">
        <span class="selector-label">Fecha</span>
        <div v-if="matchday.hasCalendar" class="segmented">
          <button
            v-for="entry in matchday.calendar"
            :key="entry.id"
            type="button"
            :class="{ 'is-selected': entry.number === matchday.number }"
            :disabled="matchday.isBusy"
            :aria-pressed="entry.number === matchday.number"
            :aria-label="`Fecha ${entry.number} · ${matchdayStatusLabel(entry.status)}`"
            @click="matchday.goTo(entry.number)"
          >
            {{ entry.number }}
          </button>
        </div>
        <!-- Creating a penka materializes its league's calendar, so an empty one
             means the league is not in play at all. Saying so beats an empty row
             the operator has to interpret. -->
        <span v-else class="selector-empty">La liga todavía no tiene fechas</span>
      </div>
    </div>
  </section>
</template>
