import { render, screen } from '@testing-library/vue';
import { describe, expect, it } from 'vitest';
import type { BoardHistoryItem } from '@penka/contracts';
import HistoryRow from './HistoryRow.vue';

function item(overrides: Partial<BoardHistoryItem> = {}): BoardHistoryItem {
  return {
    matchday: 1,
    eliminated: [],
    resolvedAt: '2026-08-21T23:30:00.000Z',
    ...overrides,
  };
}

function mount(historyItem: BoardHistoryItem) {
  return render(HistoryRow, { props: { item: historyItem } });
}

describe('HistoryRow', () => {
  it('labels the matchday it summarises', () => {
    mount(item({ matchday: 3 }));

    expect(screen.getByText('Fecha 3')).toBeInTheDocument();
  });

  it('says plainly when a matchday cost nobody', () => {
    mount(item({ eliminated: [] }));

    expect(screen.getByText('No cayó nadie')).toBeInTheDocument();
    expect(screen.getByText('Todos pasaron de fecha.')).toBeInTheDocument();
  });

  it('keeps the count singular for one casualty', () => {
    mount(item({ eliminated: ['Ana Suárez'] }));

    expect(screen.getByText('Cayó 1 jugador')).toBeInTheDocument();
    expect(screen.getByText('Ana Suárez')).toBeInTheDocument();
  });

  it('counts and names everyone who went out', () => {
    mount(item({ eliminated: ['Ana Suárez', 'Bruno Ferreira', 'Caro Giménez'] }));

    expect(screen.getByText('Cayeron 3 jugadores')).toBeInTheDocument();
    expect(screen.getByText('Ana Suárez, Bruno Ferreira y Caro Giménez')).toBeInTheDocument();
  });

  it('joins two names with "y", not a comma', () => {
    mount(item({ eliminated: ['Ana Suárez', 'Bruno Ferreira'] }));

    expect(screen.getByText('Ana Suárez y Bruno Ferreira')).toBeInTheDocument();
  });
});
