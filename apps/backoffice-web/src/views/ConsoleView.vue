<script setup lang="ts">
import { onMounted } from 'vue';
import { useRoute } from 'vue-router';
import ApiConsolePanel from '../components/ApiConsolePanel.vue';
import MatchdaySelector from '../components/MatchdaySelector.vue';
import MatchdayStatusPanel from '../components/MatchdayStatusPanel.vue';
import OpsPanel from '../components/OpsPanel.vue';
import PenkasPanel from '../components/PenkasPanel.vue';
import ResultsPanel from '../components/ResultsPanel.vue';
import { useMatchdayStore } from '../stores/matchday';
import { usePoolsStore } from '../stores/pools';

/**
 * The whole back office: one screen, the prototype's two columns.
 *
 * The opening league comes from the penka listing — a league matters when a penka
 * is being played on it — and the opening MATCHDAY comes from that league's
 * calendar, never from arithmetic on the listing. `?leagueId=&matchday=` still
 * deep-links, but it is no longer the only way to reach a second league:
 * `MatchdaySelector` is.
 */
const route = useRoute();
const pools = usePoolsStore();
const matchday = useMatchdayStore();

onMounted(async () => {
  await pools.load();
  const leagueId = requestedLeagueId() ?? pools.suggestedLeagueId;
  if (leagueId === null) {
    return;
  }
  // Reads the calendar and lands on the live matchday by itself.
  await matchday.openLeague(leagueId);

  // A requested matchday is honoured only if the league really has it — `goTo`
  // ignores anything else, which is what keeps a hand-typed URL from putting the
  // console back on the 404 it was built to make unreachable.
  const number = requestedNumber();
  if (number !== null) {
    await matchday.goTo(number);
  }
});

function requestedLeagueId(): string | null {
  const leagueId = route.query['leagueId'];
  return typeof leagueId === 'string' && leagueId.length > 0 ? leagueId : null;
}

function requestedNumber(): number | null {
  const number = Number(route.query['matchday']);
  return Number.isInteger(number) && number > 0 ? number : null;
}
</script>

<template>
  <div class="layout">
    <div>
      <MatchdaySelector />
      <MatchdayStatusPanel />
      <ResultsPanel />
      <PenkasPanel />
    </div>
    <div>
      <OpsPanel />
      <ApiConsolePanel />
    </div>
  </div>
</template>
