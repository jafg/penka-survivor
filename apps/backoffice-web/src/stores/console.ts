import { defineStore } from 'pinia';
import { ref } from 'vue';
import { onTraffic, type TrafficEntry } from '../api/client';

/**
 * How many round trips the console keeps. The prototype's number: enough to
 * cover a whole close → results → resolve flow, few enough that a console left
 * open all afternoon cannot grow without bound.
 */
export const MAX_ENTRIES = 60;

/**
 * The API console's feed: every request this app makes, newest first.
 *
 * The store DISPLAYS traffic; it does not intercept it. The interception is in
 * the API client, so a call made from anywhere — a panel, another store, a
 * retry — is logged by construction and nobody can forget to log one. This store
 * only subscribes.
 */
export const useConsoleStore = defineStore('console', () => {
  const entries = ref<TrafficEntry[]>([]);

  let stop: (() => void) | null = null;

  /** Idempotent: mounting the panel twice must not double every line. */
  function listen(): void {
    if (stop === null) {
      stop = onTraffic(record);
    }
  }

  function stopListening(): void {
    stop?.();
    stop = null;
  }

  function record(entry: TrafficEntry): void {
    entries.value = [entry, ...entries.value].slice(0, MAX_ENTRIES);
  }

  /**
   * Status 0 is the client's own "never reached the API", and it must read as a
   * failure: a `>= 400` test alone would paint an unreachable server green.
   */
  function isFailure(entry: TrafficEntry): boolean {
    return entry.status >= 400 || entry.status === 0;
  }

  function clear(): void {
    entries.value = [];
  }

  return { entries, listen, stopListening, record, isFailure, clear };
});
