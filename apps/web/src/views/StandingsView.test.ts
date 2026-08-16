import { HttpResponse, http } from 'msw';
import { screen } from '@testing-library/vue';
import { describe, expect, it } from 'vitest';
import type { Board } from '@penka/contracts';
import { apiUrl } from '../api/client';
import * as fixtures from '../test-support/fixtures';
import { renderApp } from '../test-support/render';
import { server } from '../test-support/server';

const STANDINGS_PATH = `/penkas/${fixtures.PENKA_ID}/standings`;

function withBoard(overrides: Partial<Board>): void {
  server.use(
    http.get(apiUrl('/penkas/:penkaId/board'), () =>
      HttpResponse.json({ board: fixtures.board(overrides) }),
    ),
  );
}

async function open(): Promise<Awaited<ReturnType<typeof renderApp>>> {
  const result = await renderApp(STANDINGS_PATH, { signedIn: true });
  await screen.findByText('En carrera');
  return result;
}

describe('StandingsView', () => {
  it('names the penka and says where the matchday stands', async () => {
    withBoard({ isResolved: false });
    await open();

    expect(screen.getByText('Survivor de la oficina')).toBeInTheDocument();
    expect(screen.getByText('2 jugadores · Fecha 1 en juego')).toBeInTheDocument();
  });

  it('says "resuelta" once the matchday is resolved', async () => {
    withBoard({ isResolved: true });
    await open();

    expect(screen.getByText('2 jugadores · Fecha 1 resuelta')).toBeInTheDocument();
  });

  it('counts the survivors against everyone who started', async () => {
    withBoard({
      alive: [fixtures.boardPlayer()],
      island: [fixtures.boardPlayer({ displayName: 'Bruno Ferreira', lives: 0, points: 3 })],
    });
    await open();

    expect(screen.getByText('1 de 2')).toBeInTheDocument();
  });

  describe('picks either side of the lock', () => {
    it('hides everyone picks while the matchday is open', async () => {
      // The board withholds picks until the lock, and a null there means
      // "withheld" — announcing "Sin pick" would tell the room this player is
      // still deciding.
      withBoard({ isLocked: false, alive: [fixtures.boardPlayer({ pick: null })] });
      await open();

      expect(screen.getByText('Pick oculto')).toBeInTheDocument();
    });

    it('calls a missing pick what it is once the matchday locked', async () => {
      withBoard({ isLocked: true, alive: [fixtures.boardPlayer({ pick: null })] });
      server.use(
        http.get(apiUrl('/penkas/:penkaId/matchday/current'), () =>
          HttpResponse.json(fixtures.currentMatchday({ matchday: fixtures.matchday({ status: 'locked' }) })),
        ),
      );
      await open();

      expect(screen.getByText('Sin pick')).toBeInTheDocument();
    });

    it('names the team once picks are public', async () => {
      withBoard({ isLocked: true, alive: [fixtures.boardPlayer({ pick: 'RIV' })] });
      await open();

      expect(await screen.findByText('River Plate')).toBeInTheDocument();
    });
  });

  describe('the island', () => {
    it('keeps the order the server sent', async () => {
      // `computeStandings` already ranks the island by points. Re-sorting here
      // would be a second opinion about who is winning.
      withBoard({
        island: [
          fixtures.boardPlayer({ displayName: 'Bruno Ferreira', lives: 0, points: 5 }),
          fixtures.boardPlayer({ displayName: 'Carla Gómez', lives: 0, points: 2 }),
        ],
      });
      const { container } = await open();

      const names = [...container.querySelectorAll('.is-island .player-name')].map(
        (node) => node.textContent,
      );
      expect(names).toEqual(['Bruno Ferreira', 'Carla Gómez']);
    });

    it('shows points instead of cards', async () => {
      withBoard({
        island: [fixtures.boardPlayer({ displayName: 'Bruno Ferreira', lives: 0, points: 5 })],
      });
      const { container } = await open();

      expect(container.querySelector('.is-island .points')?.textContent).toBe('5');
    });

    it('says so when nobody has fallen yet', async () => {
      withBoard({ island: [] });
      await open();

      expect(screen.getByText('La Isla está vacía')).toBeInTheDocument();
      expect(screen.getByText('Todavía nadie perdió sus 2 tarjetas.')).toBeInTheDocument();
    });

    it('counts the cards the penka was created with, not two', async () => {
      server.use(
        http.get(apiUrl('/me/penkas'), () =>
          HttpResponse.json({
            penkas: [
              fixtures.myPenkaItem({
                penka: fixtures.penka({ settings: { lives: 3, islandEnabled: true } }),
              }),
            ],
          }),
        ),
      );
      withBoard({ island: [] });
      await open();

      expect(await screen.findByText('Todavía nadie perdió sus 3 tarjetas.')).toBeInTheDocument();
    });
  });

  describe('previous matchdays', () => {
    it('says who fell', async () => {
      withBoard({
        history: [
          {
            matchday: 1,
            eliminated: ['Bruno Ferreira', 'Carla Gómez'],
            resolvedAt: '2026-08-14T22:00:00.000Z',
          },
        ],
      });
      await open();

      expect(screen.getByText('Cayeron 2 jugadores')).toBeInTheDocument();
      expect(screen.getByText('Bruno Ferreira y Carla Gómez')).toBeInTheDocument();
    });

    it('says so when no matchday has been resolved yet', async () => {
      withBoard({ history: [] });
      await open();

      expect(screen.getByText('Todavía no hay fechas resueltas')).toBeInTheDocument();
      expect(screen.getByText('Acá vas a ver quién cayó en cada fecha.')).toBeInTheDocument();
    });
  });

  it('marks the signed-in player own row', async () => {
    withBoard({
      alive: [
        fixtures.boardPlayer({ displayName: 'Bruno Ferreira' }),
        fixtures.boardPlayer({ displayName: 'Ana Suárez' }),
      ],
    });
    const { container } = await open();

    const mine = container.querySelectorAll('.standing-row.is-me');
    expect(mine).toHaveLength(1);
    expect(mine[0]?.querySelector('.player-name')?.textContent).toBe('Ana Suárez');
  });

  it('shows placeholders until the first board lands', async () => {
    server.use(
      http.get(apiUrl('/penkas/:penkaId/board'), async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return HttpResponse.json({ board: fixtures.board() });
      }),
    );
    const { container } = await renderApp(STANDINGS_PATH, { signedIn: true });

    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
  });
});
