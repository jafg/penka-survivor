import { createPinia, setActivePinia } from 'pinia';
import { render, screen } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Match } from '@penka/contracts';
import * as fixtures from '../test-support/fixtures';
import { useCatalogStore } from '../stores/catalog';
import MatchCard from './MatchCard.vue';

interface Options {
  match?: Match;
  selectedTeamCode?: string | null;
  usedTeams?: string[];
  isDisabled?: (teamCode: string) => boolean;
}

function mount(options: Options = {}) {
  const [match] = fixtures.matches();
  return render(MatchCard, {
    props: {
      match: options.match ?? (match as Match),
      selectedTeamCode: options.selectedTeamCode ?? null,
      usedTeams: options.usedTeams ?? [],
      isDisabled: options.isDisabled ?? (() => false),
    },
  });
}

describe('MatchCard', () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    // Codes are all the game API sends; names come from the catalog.
    await useCatalogStore().loadLeague(fixtures.LEAGUE_ID);
  });

  it('names both teams the way a player knows them', () => {
    mount();

    expect(screen.getByText('River Plate vs Boca Juniors')).toBeInTheDocument();
  });

  it('shows the code on the option as well, because that is what the API speaks', () => {
    mount();

    expect(screen.getByText('RIV')).toBeInTheDocument();
    expect(screen.getByText('BOC')).toBeInTheDocument();
  });

  it('offers both teams as choices', () => {
    mount();

    expect(screen.getAllByText('Elegir')).toHaveLength(2);
  });

  it('reports the chosen code to its parent', async () => {
    const { emitted } = mount();

    await userEvent.click(screen.getByRole('button', { name: /River Plate/ }));

    expect(emitted()['select']).toEqual([['RIV']]);
  });

  it('marks the current pick and stops offering it', () => {
    mount({ selectedTeamCode: 'RIV' });

    expect(screen.getByText('Tu pick')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /River Plate/ })).toHaveClass('is-picked');
  });

  it('strikes a team the player already spent and refuses the click', async () => {
    const { emitted } = mount({ usedTeams: ['RIV'], isDisabled: (code) => code === 'RIV' });
    const spent = screen.getByRole('button', { name: /River Plate/ });

    expect(screen.getByText('Ya usado')).toBeInTheDocument();
    expect(spent).toHaveClass('is-used');
    expect(spent).toBeDisabled();

    await userEvent.click(spent);
    expect(emitted()['select']).toBeUndefined();
  });

  it('disables every option once the parent says picks are in', () => {
    mount({ isDisabled: () => true });

    for (const option of screen.getAllByRole('button')) {
      expect(option).toBeDisabled();
    }
  });

  it('shows the kickoff while the match is still ahead', () => {
    mount();

    // The exact string is the viewer's timezone; what matters is that it is a
    // time and not an ISO instant.
    expect(screen.getByText(/^\w+ \d{2}:\d{2}$/)).toBeInTheDocument();
  });

  it('replaces the kickoff with the result once the match is played', () => {
    const [played] = fixtures.matches([{ outcome: 'home' }]);
    mount({ match: played as Match });

    expect(screen.getByText('Ganó local')).toBeInTheDocument();
  });
});
