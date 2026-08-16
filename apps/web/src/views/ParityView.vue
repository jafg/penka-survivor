<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { usePenkasStore } from '../stores/penkas';

/**
 * The visual parity harness: the prototype and the real app, side by side, at
 * the same screen.
 *
 * Dev only — the router appends this route under `import.meta.env.DEV` and Vite
 * drops `public/prototype.html` from the comparison the moment anyone builds
 * for production. It exists to be looked at, so it carries no tests; what it
 * compares is written down in `docs/visual-parity-checklist.md`.
 *
 * Both panels are iframes, including the app's own side. Rendering the app
 * inline instead would let the harness's own layout leak into the thing being
 * measured, and the whole point is to measure it untouched.
 */
type Screen = 'pick' | 'standings' | 'pools';

const SCREENS: { id: Screen; label: string }[] = [
  { id: 'pick', label: 'Mi pick' },
  { id: 'standings', label: 'Tabla' },
  { id: 'pools', label: 'Mis juegos' },
];

const route = useRoute();
const router = useRouter();
const penkas = usePenkasStore();

const screen = computed<Screen>(() => {
  const raw = route.query['screen'];
  return SCREENS.some((option) => option.id === raw) ? (raw as Screen) : 'pick';
});

/**
 * Which penka the app panel opens. `?penkaId=` wins so a specific game can be
 * compared; otherwise the first one the signed-in player is in.
 */
const penkaId = ref<string | null>(null);

onMounted(async () => {
  const requested = route.query['penkaId'];
  if (typeof requested === 'string' && requested.length > 0) {
    penkaId.value = requested;
    return;
  }
  await penkas.load();
  penkaId.value = penkas.items[0]?.penka.id ?? null;
});

const prototypeSrc = computed(() => `/prototype.html?screen=${screen.value}`);

/**
 * The checklist is a repo document, not something `public/` should ship, so it
 * is opened through Vite's `/@fs` route — dev only, like the harness itself.
 */
const checklistHref = `/@fs${__PARITY_CHECKLIST_PATH__}`;

const appSrc = computed(() => {
  if (screen.value === 'pools') {
    return '/penkas';
  }
  return penkaId.value === null ? null : `/penkas/${penkaId.value}/${screen.value}`;
});

function show(next: Screen): void {
  void router.replace({ name: 'parity', query: { ...route.query, screen: next } });
}

/** Reloading both frames together keeps a comparison from straddling an edit. */
const reloadKey = ref(0);
watch(screen, () => {
  reloadKey.value += 1;
});
</script>

<template>
  <div class="parity">
    <header class="parity-bar">
      <strong>Parity</strong>
      <nav class="parity-screens">
        <button
          v-for="option in SCREENS"
          :key="option.id"
          type="button"
          class="parity-tab"
          :class="{ 'is-active': option.id === screen }"
          @click="show(option.id)"
        >
          {{ option.label }}
        </button>
      </nav>
      <span class="parity-spacer"></span>
      <button type="button" class="parity-tab" @click="reloadKey += 1">Recargar</button>
      <a class="parity-link" :href="checklistHref" target="_blank">Checklist</a>
    </header>

    <div class="parity-panels">
      <section class="parity-panel">
        <h2>Prototipo</h2>
        <iframe :key="`proto-${reloadKey}`" :src="prototypeSrc" title="Prototipo"></iframe>
      </section>

      <section class="parity-panel">
        <h2>App</h2>
        <iframe v-if="appSrc !== null" :key="`app-${reloadKey}`" :src="appSrc" title="App"></iframe>
        <p v-else class="parity-note">
          Iniciá sesión y sumate a una penka para comparar esta pantalla, o pasá
          <code>?penkaId=…</code>.
        </p>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Harness chrome only. Nothing here may style the panels' contents: both sides
   are iframes precisely so this stylesheet cannot reach them. */
.parity {
  /* Fixed, so the harness escapes the shell's 430px phone frame. `.app` is the
     prototype's centred handset and every screen is meant to live inside it —
     but the harness is the thing holding two handsets, so it has to be the one
     element in the app that is wider than one. Fixed positioning leaves both
     `.app`'s max-width and its `overflow: hidden` behind, because a relatively
     positioned ancestor is not a containing block for fixed. */
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  color: var(--fg);
}

.parity-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  font-size: 13px;
}

.parity-screens {
  display: flex;
  gap: 6px;
}

.parity-spacer {
  flex: 1;
}

.parity-tab {
  padding: 5px 11px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: none;
  color: var(--fg-muted);
  font: inherit;
  cursor: pointer;
}

.parity-tab.is-active {
  border-color: var(--accent);
  color: var(--accent);
}

.parity-link {
  color: var(--accent);
}

.parity-panels {
  display: grid;
  /* Equal widths, always: a panel that grows with its content would make the
     two sides incomparable, which is the one thing this screen must not do. */
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  flex: 1;
  min-height: 0;
  padding: 12px;
}

.parity-panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.parity-panel h2 {
  margin: 0 0 8px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--fg-muted);
}

.parity-panel iframe {
  flex: 1;
  width: 100%;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg);
}

.parity-note {
  color: var(--fg-muted);
}
</style>
