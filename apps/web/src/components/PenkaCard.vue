<script setup lang="ts">
import { computed } from 'vue';
import type { MyPenkaItem } from '@penka/contracts';
import { useClipboard } from '../composables/use-clipboard';
import { useCatalogStore } from '../stores/catalog';

/**
 * One penka in "Mis Survivors".
 *
 * Every number on this card comes off `entry`, never off `penka`. The penka
 * says how many lives the competition hands out; the entry says how many THIS
 * player has left. Reading the wrong one shows two cards to someone down to
 * their last.
 */
const props = defineProps<{
  item: MyPenkaItem;
  isCurrent: boolean;
}>();

const emit = defineEmits<{ open: [penkaId: string] }>();

const catalog = useCatalogStore();
const clipboard = useClipboard();

const onIsland = computed(() => props.item.entry.status === 'island');

const livesLabel = computed(() => {
  const lives = props.item.entry.lives;
  const verb = lives === 1 ? 'queda' : 'quedan';
  const noun = lives === 1 ? 'tarjeta' : 'tarjetas';
  return `te ${verb} ${lives} ${noun}`;
});

const joinCode = computed(() => props.item.penka.joinCode);

async function copyCode(): Promise<void> {
  await clipboard.copy(joinCode.value, `Código ${joinCode.value} copiado`);
}
</script>

<template>
  <!--
    A div, not a button. The card holds two independent actions — enter the
    penka, copy its code — and a button inside a button is invalid HTML that
    browsers and screen readers each recover from differently. The card is the
    frame; the two buttons inside it are the controls.
  -->
  <div class="pool-card" :class="{ 'is-current': props.isCurrent }">
    <button type="button" class="pool-open" @click="emit('open', props.item.penka.id)">
      <span class="pool-name">{{ props.item.penka.name }}</span>
      <span class="pool-meta">
        <span class="badge" :class="`badge--${props.item.entry.status}`">
          {{ onIsland ? 'En La Isla' : 'En carrera' }}
        </span>
        <!--
          The prototype also printed a player count and the current matchday here.
          Neither is on `MyPenkaItem`, and the listing route is not going to grow a
          per-penka board read just to fill a subtitle. The line keeps its rhythm
          with what the contract does carry.
        -->
        <span>{{ catalog.leagueName(props.item.penka.leagueId) }}</span>
      </span>
      <span class="pool-meta" style="margin-top: 7px">
        {{ onIsland ? 'jugás en La Isla' : livesLabel }}
      </span>
    </button>

    <!--
      The invite code is on `MyPenkaItem.penka` already, and until now the app
      showed it exactly once — in the toast fired at creation — which left a
      player who wanted to add someone a week later with nowhere to read it.
    -->
    <button type="button" class="join-code" @click="copyCode">
      <span class="join-code-label">Código</span>
      <span class="join-code-value">{{ joinCode }}</span>
      <span class="join-code-hint">tocá para copiar</span>
    </button>
  </div>
</template>
