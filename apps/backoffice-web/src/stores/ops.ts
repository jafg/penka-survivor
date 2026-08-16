import { defineStore } from 'pinia';
import { ref } from 'vue';
import { nextPollInSec, type PollingProfile } from '@penka/contracts';
import { setPollingProfile } from '../api/endpoints';

/**
 * The deployment's board polling cadence — a load valve, not a per-penka
 * setting. One key, one value, every client.
 *
 * The console shows the interval that valve produces, which the admin API does
 * NOT return: `PUT /polling-profile` answers with the profile alone. So the
 * number is computed with `nextPollInSec` from `@penka/contracts` — the same
 * pure function `@penka/api` runs when it stamps a board — rather than
 * re-derived from a table of seconds here. Sharing the function is what keeps
 * the console honest when the rule changes; a local copy would drift silently.
 */
export const useOpsStore = defineStore('ops', () => {
  const profile = ref<PollingProfile>('normal');
  const isBusy = ref(false);

  /**
   * The instant the displayed cadence is "as of". Stamped on every matchday
   * read rather than ticking on its own: `normal` tightens near the lock, and a
   * number that changed between two reads with nothing else moving would look
   * like the server had changed its mind.
   */
  const clock = ref(new Date());

  function stamp(at: Date = new Date()): void {
    clock.value = at;
  }

  /** The profile the API says it is serving, from a matchday read. */
  function observe(next: PollingProfile): void {
    profile.value = next;
  }

  /**
   * Write the profile. The local value moves only once the API has confirmed
   * it: showing `live` as selected after a refusal would tell the operator the
   * deployment is polling twice a second when it is not.
   */
  async function setProfile(next: PollingProfile): Promise<void> {
    isBusy.value = true;
    try {
      const response = await setPollingProfile(next);
      profile.value = response.profile;
    } finally {
      isBusy.value = false;
    }
  }

  /** Seconds between board polls, or null before a matchday says when it locks. */
  function intervalSec(lockAt: string | null): number | null {
    if (lockAt === null) {
      return null;
    }
    return nextPollInSec({
      profile: profile.value,
      now: clock.value,
      lockAt: new Date(lockAt),
    });
  }

  return { profile, isBusy, clock, stamp, observe, setProfile, intervalSec };
});
