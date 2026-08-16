<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

/**
 * The visual parity harness: the prototype and the real console, side by side.
 *
 * Dev only — the router appends this route under `import.meta.env.DEV`, and Vite
 * drops `public/prototype.html` from any production build. It exists to be
 * looked at, so it carries no tests; what it compares is written down in
 * `docs/visual-parity-checklist.md`.
 *
 * Both panels are iframes, including the console's own side. Rendering the app
 * inline would let the harness's layout leak into the thing being measured.
 *
 * The back office is a DESKTOP screen: its layout collapses to one column below
 * 1080px, and two half-width panels on a laptop would put both sides into the
 * mobile stack — comparable to each other but not to anything anyone ships. So
 * each frame is rendered at a fixed desktop width and scaled down to fit, which
 * keeps the two-column grid, the 380px sidebar and every breakpoint on the
 * desktop side of the line.
 */
const FRAME_WIDTH = 1360;

const stage = ref<HTMLElement | null>(null);
const stageWidth = ref(FRAME_WIDTH);
const stageHeight = ref(900);

let observer: ResizeObserver | null = null;

onMounted(() => {
  const node = stage.value;
  if (node === null) {
    return;
  }
  observer = new ResizeObserver(([entry]) => {
    if (entry !== undefined) {
      stageWidth.value = entry.contentRect.width;
      stageHeight.value = entry.contentRect.height;
    }
  });
  observer.observe(node);
});

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
});

/** Half the stage, minus the gap, is what one frame gets. */
const scale = computed(() => Math.min(1, (stageWidth.value - 12) / 2 / FRAME_WIDTH));

/**
 * The frame is laid out at desktop size and then scaled, so its own height has
 * to grow by the inverse — otherwise the visible box would show only the top
 * `scale` fraction of the page.
 */
const frameStyle = computed(() => ({
  width: `${FRAME_WIDTH}px`,
  height: `${Math.round(stageHeight.value / scale.value)}px`,
  transform: `scale(${scale.value})`,
  transformOrigin: 'top left',
}));

/**
 * The checklist is a repo document, not something `public/` should ship, so it
 * is opened through Vite's `/@fs` route — dev only, like the harness itself.
 */
const checklistHref = `/@fs${__PARITY_CHECKLIST_PATH__}`;

/** Reloading both frames together keeps a comparison from straddling an edit. */
const reloadKey = ref(0);
</script>

<template>
  <div class="parity">
    <header class="parity-bar">
      <strong>Parity</strong>
      <span class="parity-note">Back office · {{ FRAME_WIDTH }}px @ {{ scale.toFixed(2) }}×</span>
      <span class="parity-spacer"></span>
      <button type="button" class="parity-tab" @click="reloadKey += 1">Recargar</button>
      <a class="parity-link" :href="checklistHref" target="_blank">Checklist</a>
    </header>

    <div ref="stage" class="parity-panels">
      <section class="parity-panel">
        <h2>Prototipo</h2>
        <div class="parity-viewport">
          <iframe
            :key="`proto-${reloadKey}`"
            src="/prototype.html"
            title="Prototipo"
            :style="frameStyle"
          ></iframe>
        </div>
      </section>

      <section class="parity-panel">
        <h2>App</h2>
        <div class="parity-viewport">
          <iframe :key="`app-${reloadKey}`" src="/" title="App" :style="frameStyle"></iframe>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Harness chrome only. Nothing here may style the panels' contents: both sides
   are iframes precisely so this stylesheet cannot reach them. */
.parity {
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

.parity-spacer {
  flex: 1;
}

.parity-note {
  color: var(--fg-muted);
  font-family: var(--mono);
  font-size: 11.5px;
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

.parity-viewport {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg);
}

.parity-viewport iframe {
  border: none;
  display: block;
}
</style>
