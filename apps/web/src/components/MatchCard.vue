<script setup lang="ts">
import { computed } from 'vue';
import type { Match } from '@penka/contracts';
import { formatKickoff, outcomeLabel } from '../format/match';
import { useCatalogStore } from '../stores/catalog';

/**
 * One fixture and its two choosable teams.
 *
 * `isDisabled` arrives as a function rather than a flag: whether a team can be
 * picked is `validatePick`'s answer, and that question belongs to the view that
 * holds the matchday, the settings and the clock. This component asks; it never
 * decides.
 */
const props = defineProps<{
  match: Match;
  selectedTeamCode: string | null;
  usedTeams: readonly string[];
  isDisabled: (teamCode: string) => boolean;
}>();

const emit = defineEmits<{ select: [teamCode: string] }>();

const catalog = useCatalogStore();

const teamCodes = computed(() => [props.match.homeTeamCode, props.match.awayTeamCode]);

const headline = computed(
  () =>
    `${catalog.teamName(props.match.homeTeamCode)} vs ${catalog.teamName(props.match.awayTeamCode)}`,
);

/** The result once there is one, the kickoff until then. */
const trailing = computed(() =>
  props.match.outcome === null
    ? formatKickoff(props.match.kickoffAt)
    : outcomeLabel(props.match.outcome),
);

function stateLabel(teamCode: string): string {
  if (props.usedTeams.includes(teamCode)) {
    return 'Ya usado';
  }
  return props.selectedTeamCode === teamCode ? 'Tu pick' : 'Elegir';
}
</script>

<template>
  <div class="match-card">
    <div class="match-header">
      <span>{{ headline }}</span>
      <span class="tnum">{{ trailing }}</span>
    </div>

    <div class="team-options">
      <button
        v-for="code in teamCodes"
        :key="code"
        type="button"
        class="team-option"
        :class="{
          'is-picked': props.selectedTeamCode === code,
          'is-used': props.usedTeams.includes(code),
        }"
        :disabled="props.isDisabled(code)"
        @click="emit('select', code)"
      >
        <span class="team-code display">{{ code }}</span>
        <span class="team-name">{{ catalog.teamName(code) }}</span>
        <span class="team-state">{{ stateLabel(code) }}</span>
      </button>
    </div>
  </div>
</template>
