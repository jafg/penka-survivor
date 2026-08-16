import { createPinia, setActivePinia } from 'pinia';
import { render, screen } from '@testing-library/vue';
import { beforeEach, describe, expect, it } from 'vitest';
import type { BoardPlayer } from '@penka/contracts';
import * as fixtures from '../test-support/fixtures';
import { useCatalogStore } from '../stores/catalog';
import StandingRow from './StandingRow.vue';

interface Options {
  player?: BoardPlayer;
  rank?: number;
  isLocked?: boolean;
  isMe?: boolean;
  onIsland?: boolean;
  livesTotal?: number;
}

function mount(options: Options = {}) {
  return render(StandingRow, {
    props: {
      player: options.player ?? fixtures.boardPlayer(),
      rank: options.rank ?? 1,
      isLocked: options.isLocked ?? false,
      isMe: options.isMe ?? false,
      onIsland: options.onIsland ?? false,
      livesTotal: options.livesTotal ?? 2,
    },
  });
}

describe('StandingRow', () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    await useCatalogStore().loadLeague(fixtures.LEAGUE_ID);
  });

  it('shows the position and the player', () => {
    mount({ rank: 3 });

    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Ana Suárez')).toBeInTheDocument();
  });

  describe('the pick column', () => {
    it('says the pick is hidden while the matchday is still open', () => {
      // Before lock the board carries `pick: null` for everyone — the server
      // withholds it. That is a secret, not an absence.
      mount({ player: fixtures.boardPlayer({ pick: null }), isLocked: false });

      expect(screen.getByText('Pick oculto')).toBeInTheDocument();
    });

    it('says there is no pick once the matchday has locked', () => {
      // After lock the same null means something else entirely: this player
      // never picked, and is about to lose a life for it.
      mount({ player: fixtures.boardPlayer({ pick: null }), isLocked: true });

      expect(screen.getByText('Sin pick')).toBeInTheDocument();
    });

    it('names the team once the pick is public', () => {
      mount({ player: fixtures.boardPlayer({ pick: 'RIV' }), isLocked: true });

      expect(screen.getByText('River Plate')).toBeInTheDocument();
    });
  });

  it('draws the life cards for a player still in the race', () => {
    const { container } = mount({ player: fixtures.boardPlayer({ lives: 1 }), livesTotal: 2 });

    expect(container.querySelectorAll('.life--kept')).toHaveLength(1);
    expect(container.querySelectorAll('.life--lost')).toHaveLength(1);
  });

  it('draws three cards in a penka that was created with three lives', () => {
    // The prototype hard-coded two. A penka can be set up with one to three.
    const { container } = mount({ player: fixtures.boardPlayer({ lives: 3 }), livesTotal: 3 });

    expect(container.querySelectorAll('.life')).toHaveLength(3);
  });

  it('shows points instead of cards on the island, which is what is played for there', () => {
    const { container } = mount({
      player: fixtures.boardPlayer({ lives: 0, points: 4 }),
      onIsland: true,
    });

    expect(screen.getByText('4')).toBeInTheDocument();
    expect(container.querySelectorAll('.life')).toHaveLength(0);
    expect(container.querySelector('.standing-row')).toHaveClass('is-island');
  });

  it('marks the viewer own row', () => {
    const { container } = mount({ isMe: true });

    expect(container.querySelector('.standing-row')).toHaveClass('is-me');
  });
});
