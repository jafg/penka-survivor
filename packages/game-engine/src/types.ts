import type { EntryStatus, ErrorCode } from '@penka/contracts';

/**
 * Rejection codes are typed as subsets of the canonical `ErrorCode` set from
 * @penka/contracts (type-only import — the engine has zero runtime deps).
 */
export type PickRejectionCode = Extract<
  ErrorCode,
  'matchday_locked' | 'on_island' | 'team_not_playing' | 'team_already_used' | 'validation_failed'
>;

export type ResolveRejectionCode = Extract<
  ErrorCode,
  'results_missing' | 'already_resolved' | 'matchday_not_locked'
>;

export type PickValidation = { ok: true } | { ok: false; code: PickRejectionCode };

/** What resolution does to one entry. Deltas only — persistence applies them. */
export interface EntryEffect {
  entryId: string;
  /** -1 on a lost matchday for an alive entry, otherwise 0. Never drives lives negative. */
  livesDelta: 0 | -1;
  /** 1 for a correct pick (any status — points count total correct picks), otherwise 0. */
  pointsDelta: 0 | 1;
  newLives: number;
  newStatus: EntryStatus;
  /** Team code to append to the entry's usedTeams, or null when no valid pick was played. */
  teamConsumed: string | null;
}

export interface ResolutionSummary {
  totalEntries: number;
  aliveBefore: number;
  aliveAfter: number;
  islandBefore: number;
  islandAfter: number;
  eliminated: number;
}

/**
 * Deterministic result of resolving one matchday. Carries the matchday's id and
 * number so the persistence layer can enforce idempotency (refuse to apply the
 * same matchday's effects twice).
 */
export interface ResolutionOutcome {
  matchdayId: string;
  matchdayNumber: number;
  /** One effect per input entry, in input order. */
  effects: EntryEffect[];
  /** Entries that went from alive to island this matchday. */
  eliminatedEntryIds: string[];
  summary: ResolutionSummary;
}

export type ResolveMatchdayResult =
  | { ok: true; outcome: ResolutionOutcome }
  | { ok: false; code: ResolveRejectionCode };
