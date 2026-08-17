import { createPinia, setActivePinia } from 'pinia';
import { render, screen } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MyPenkaItem } from '@penka/contracts';
import * as fixtures from '../test-support/fixtures';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';
import PenkaCard from './PenkaCard.vue';

function mount(item: MyPenkaItem, isCurrent = false) {
  return render(PenkaCard, { props: { item, isCurrent } });
}

describe('PenkaCard', () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    await useCatalogStore().loadLeagues();
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  it('names the penka and the competition it runs on', () => {
    mount(fixtures.myPenkaItem());

    expect(screen.getByText('Survivor de la oficina')).toBeInTheDocument();
    expect(screen.getByText('Copa Libertadores')).toBeInTheDocument();
  });

  it('reads the lives off the ENTRY, not off the penka settings', () => {
    // `penka.settings.lives` is how many the penka STARTS everyone with.
    // `entry.lives` is how many this player has left. A card that read the
    // first would tell someone on their last card that they have two.
    mount(
      fixtures.myPenkaItem({
        penka: fixtures.penka({ settings: { lives: 3, islandEnabled: true } }),
        entry: fixtures.entry({ lives: 1 }),
      }),
    );

    expect(screen.getByText('te queda 1 tarjeta')).toBeInTheDocument();
  });

  it('pluralises the tally', () => {
    mount(fixtures.myPenkaItem({ entry: fixtures.entry({ lives: 2 }) }));

    expect(screen.getByText('te quedan 2 tarjetas')).toBeInTheDocument();
  });

  it('reads the status off the ENTRY too', () => {
    mount(fixtures.myPenkaItem({ entry: fixtures.entry({ lives: 0, status: 'island' }) }));

    expect(screen.getByText('En La Isla')).toBeInTheDocument();
    expect(screen.getByText('jugás en La Isla')).toBeInTheDocument();
  });

  it('badges a player still in the race', () => {
    const { container } = mount(fixtures.myPenkaItem());

    expect(screen.getByText('En carrera')).toBeInTheDocument();
    expect(container.querySelector('.badge')).toHaveClass('badge--alive');
  });

  it('marks the penka currently on screen', () => {
    const { container } = mount(fixtures.myPenkaItem(), true);

    expect(container.querySelector('.pool-card')).toHaveClass('is-current');
  });

  it('hands its penka id up when picked', async () => {
    const { emitted } = mount(fixtures.myPenkaItem());

    await userEvent.click(screen.getByRole('button', { name: /Survivor de la oficina/ }));

    expect(emitted()['open']).toEqual([[fixtures.PENKA_ID]]);
  });

  describe('the invite code', () => {
    it('shows it, so a player can pass it on without creating the penka again', () => {
      // Before this, the code was announced once in a toast at creation and was
      // then unreachable: nothing in the app printed it again.
      mount(fixtures.myPenkaItem({ penka: fixtures.penka({ joinCode: '4821' }) }));

      expect(screen.getByText('4821')).toBeInTheDocument();
    });

    it('copies it to the clipboard when tapped', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      mount(fixtures.myPenkaItem({ penka: fixtures.penka({ joinCode: '4821' }) }));

      await userEvent.click(screen.getByRole('button', { name: /4821/ }));

      expect(writeText).toHaveBeenCalledWith('4821');
      expect(useToastStore().message).toContain('4821');
    });

    it('does not open the penka — copying and entering are different intents', async () => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: vi.fn().mockResolvedValue(undefined) },
        configurable: true,
      });
      const { emitted } = mount(fixtures.myPenkaItem({ penka: fixtures.penka({ joinCode: '4821' }) }));

      await userEvent.click(screen.getByRole('button', { name: /4821/ }));

      expect(emitted()['open']).toBeUndefined();
    });
  });
});
