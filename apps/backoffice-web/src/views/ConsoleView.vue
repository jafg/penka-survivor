<script setup lang="ts">
import { onMounted } from 'vue';
import { useRoute } from 'vue-router';
import ApiConsolePanel from '../components/ApiConsolePanel.vue';
import MatchdayStatusPanel from '../components/MatchdayStatusPanel.vue';
import OpsPanel from '../components/OpsPanel.vue';
import PenkasPanel from '../components/PenkasPanel.vue';
import ResultsPanel from '../components/ResultsPanel.vue';
import { useMatchdayStore } from '../stores/matchday';
import { usePoolsStore } from '../stores/pools';

/**
 * The whole back office: one screen, the prototype's two columns.
 *
 * Which matchday it opens on is the one thing the admin API cannot answer — it
 * registers no "current matchday" route — so the console reads the penka listing
 * and takes the matchday after the last resolved one. `?leagueId=&matchday=`
 * overrides it, which is also how a second league is reached.
 */
const route = useRoute();
const pools = usePoolsStore();
const matchday = useMatchdayStore();

onMounted(async () => {
  await pools.load();
  const selection = requestedSelection() ?? pools.suggestedSelection;
  if (selection === null) {
    return;
  }
  matchday.select(selection.leagueId, selection.number);
  await matchday.load();
});

function requestedSelection(): { leagueId: string; number: number } | null {
  const leagueId = route.query['leagueId'];
  const number = Number(route.query['matchday']);
  if (typeof leagueId !== 'string' || leagueId.length === 0 || !Number.isInteger(number)) {
    return null;
  }
  return { leagueId, number };
}
</script>

<template>
  <div class="layout">
    <div>
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
