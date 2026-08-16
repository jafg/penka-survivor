import { describe, expect, it } from 'vitest';
import { countPending, whyNotResolvable } from './resolve';
import * as fixtures from '../test-support/fixtures';

describe('whyNotResolvable', () => {
  it('refuses an open matchday, however complete its results are', () => {
    // The trap the prototype falls into: it enables "Resolver fecha" on results
    // alone. Lock is a PRECONDITION of resolve, so a full set of results on an
    // open matchday is still a 409 from the API.
    expect(whyNotResolvable(fixtures.matchday('open'), fixtures.matches(4))).toBe(
      'matchday_not_locked',
    );
  });

  it('refuses a locked matchday that still has a match without a result', () => {
    expect(whyNotResolvable(fixtures.matchday('locked'), fixtures.matches(3))).toBe(
      'results_missing',
    );
  });

  it('accepts a locked matchday whose every match has an outcome', () => {
    expect(whyNotResolvable(fixtures.matchday('locked'), fixtures.matches(4))).toBeNull();
  });

  it('refuses a resolved matchday before it looks at anything else', () => {
    expect(whyNotResolvable(fixtures.matchday('resolved'), fixtures.matches(4))).toBe(
      'already_resolved',
    );
  });

  it('ignores matches belonging to another matchday', () => {
    const foreign = fixtures.match({ id: 'other:md9:XXX-YYY', matchdayId: 'other:md9' });

    expect(
      whyNotResolvable(fixtures.matchday('locked'), [...fixtures.matches(4), foreign]),
    ).toBeNull();
  });
});

describe('countPending', () => {
  it('counts the matches that still have no outcome', () => {
    expect(countPending(fixtures.matches(1))).toBe(3);
    expect(countPending(fixtures.matches(4))).toBe(0);
  });
});
