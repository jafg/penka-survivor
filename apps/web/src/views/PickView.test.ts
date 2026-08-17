import { HttpResponse, http } from 'msw';
import { screen, waitFor } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiUrl } from '../api/client';
import * as fixtures from '../test-support/fixtures';
import { flush, renderApp } from '../test-support/render';
import { apiError, server } from '../test-support/server';

const PICK_PATH = `/penkas/${fixtures.PENKA_ID}/pick`;

/** The board's lock instant, far enough out that nothing locks mid-test. */
function openMatchday(lockAt = '2099-01-01T00:00:00.000Z'): void {
  server.use(
    http.get(apiUrl('/penkas/:penkaId/board'), () =>
      HttpResponse.json({ board: fixtures.board({ lockAt }) }),
    ),
    http.get(apiUrl('/penkas/:penkaId/matchday/current'), () =>
      HttpResponse.json(fixtures.currentMatchday({ matchday: fixtures.matchday({ lockAt }) })),
    ),
  );
}

async function open(): Promise<Awaited<ReturnType<typeof renderApp>>> {
  const result = await renderApp(PICK_PATH, { signedIn: true });
  await screen.findByText('River Plate vs Boca Juniors');
  return result;
}

describe('PickView', () => {
  it('names the penka and the matchday', async () => {
    openMatchday();
    await open();

    expect(screen.getByText('Survivor de la oficina · Copa Libertadores')).toBeInTheDocument();
    expect(screen.getByText('Fecha 1')).toBeInTheDocument();
  });

  it('asks for a team before it will let anything be confirmed', async () => {
    openMatchday();
    await open();

    expect(screen.getByRole('button', { name: 'Elegí un equipo' })).toBeDisabled();
  });

  it('offers to confirm the team the player touched', async () => {
    openMatchday();
    await open();

    await userEvent.click(screen.getByRole('button', { name: /River Plate/ }));

    expect(screen.getByRole('button', { name: 'Confirmar River Plate' })).toBeEnabled();
  });

  it('submits the CODE, not the name', async () => {
    openMatchday();
    let sent: { teamCode: string } | null = null;
    server.use(
      http.post(apiUrl('/penkas/:penkaId/picks'), async ({ request }) => {
        sent = (await request.json()) as { teamCode: string };
        return HttpResponse.json({ myEntry: fixtures.myEntry({ myPick: 'RIV' }) });
      }),
    );
    await open();

    await userEvent.click(screen.getByRole('button', { name: /River Plate/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar River Plate' }));

    await waitFor(() => {
      expect(sent).toEqual({ teamCode: 'RIV' });
    });
  });

  it('updates from the pick response instead of re-reading the personal route', async () => {
    // The POST answers the updated `myEntry`. Asking `/penkas/:id/me` for it
    // again would be a round trip for something already in hand, and would show
    // the pre-pick state for its duration.
    openMatchday();
    let personalReads = 0;
    server.use(
      http.get(apiUrl('/penkas/:penkaId/me'), () => {
        personalReads += 1;
        return HttpResponse.json({ myEntry: fixtures.myEntry() });
      }),
    );
    const { router } = await open();
    const readsBeforePick = personalReads;

    await userEvent.click(screen.getByRole('button', { name: /River Plate/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar River Plate' }));
    await waitFor(() => {
      expect(router.currentRoute.value.name).toBe('standings');
    });

    expect(personalReads).toBe(readsBeforePick);
  });

  it('confirms out loud and moves the player to the table', async () => {
    openMatchday();
    const { router } = await open();

    await userEvent.click(screen.getByRole('button', { name: /River Plate/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar River Plate' }));

    expect(await screen.findByText('Pick confirmado: River Plate')).toBeInTheDocument();
    await waitFor(() => {
      expect(router.currentRoute.value.name).toBe('standings');
    });
  });

  it('repeats the API wording when the matchday closed first', async () => {
    // The player was mid-tap when the deadline passed. The server is the one
    // that knows, and it says so in its own words.
    openMatchday();
    server.use(
      http.post(apiUrl('/penkas/:penkaId/picks'), () =>
        apiError(409, 'matchday_locked', 'La fecha ya está cerrada'),
      ),
    );
    const { router } = await open();

    await userEvent.click(screen.getByRole('button', { name: /River Plate/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar River Plate' }));

    expect(await screen.findByText('La fecha ya está cerrada')).toBeInTheDocument();
    expect(router.currentRoute.value.name).toBe('pick');
  });

  it('repeats the API wording when the team was already spent', async () => {
    openMatchday();
    server.use(
      http.post(apiUrl('/penkas/:penkaId/picks'), () =>
        apiError(422, 'team_already_used', 'Ya usaste River Plate en esta penka'),
      ),
    );
    await open();

    await userEvent.click(screen.getByRole('button', { name: /River Plate/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar River Plate' }));

    expect(await screen.findByText('Ya usaste River Plate en esta penka')).toBeInTheDocument();
  });

  it('will not offer a team the player already used', async () => {
    openMatchday();
    server.use(
      http.get(apiUrl('/penkas/:penkaId/me'), () =>
        HttpResponse.json({ myEntry: fixtures.myEntry({ usedTeams: ['RIV'] }) }),
      ),
    );
    await open();

    const spent = screen.getByRole('button', { name: /River Plate/ });
    expect(spent).toBeDisabled();
    expect(spent).toHaveClass('is-used');
    expect(screen.getByText('Ya usado')).toBeInTheDocument();
  });

  it('says the pick is ONE team for the whole matchday, not one per match', async () => {
    // Six fixtures, each with two tappable teams, read as a form to fill in —
    // and tapping a second team looks like the first was lost rather than
    // replaced. The rule is one team per matchday (`SubmitPickRequest` carries a
    // single `teamCode`), so the screen has to say so before the cards.
    openMatchday();
    await open();

    expect(screen.getByText(/Elegí un solo equipo de toda la fecha/)).toBeInTheDocument();
  });

  it('offers to CHANGE a pick rather than confirm a second one', async () => {
    // The same tap means two different things depending on whether a pick is
    // already in: with one confirmed, touching another team is a swap. Calling
    // it "Confirmar" is what makes the swap read as an accident.
    openMatchday();
    server.use(
      http.get(apiUrl('/penkas/:penkaId/me'), () =>
        HttpResponse.json({ myEntry: fixtures.myEntry({ myPick: 'RIV' }) }),
      ),
    );
    await open();

    await userEvent.click(screen.getByRole('button', { name: /Boca Juniors/ }));

    expect(screen.getByRole('button', { name: 'Cambiar a Boca Juniors' })).toBeEnabled();
  });

  it('shows what the player already confirmed instead of asking again', async () => {
    openMatchday();
    server.use(
      http.get(apiUrl('/penkas/:penkaId/me'), () =>
        HttpResponse.json({ myEntry: fixtures.myEntry({ myPick: 'RIV' }) }),
      ),
    );
    await open();

    expect(screen.getByRole('button', { name: 'Elegiste River Plate' })).toBeDisabled();
    expect(screen.getByText('Tu pick')).toBeInTheDocument();
  });

  describe('the island', () => {
    it('lets an island player keep picking while the penka has the island on', async () => {
      // Their hits are worth a point each. The engine says so, and the API
      // accepts the pick — the prototype's greyed-out buttons predate the rule.
      openMatchday();
      server.use(
        http.get(apiUrl('/penkas/:penkaId/me'), () =>
          HttpResponse.json({ myEntry: fixtures.myEntry({ lives: 0, status: 'island' }) }),
        ),
      );
      await open();

      await userEvent.click(screen.getByRole('button', { name: /River Plate/ }));
      expect(screen.getByRole('button', { name: 'Confirmar River Plate' })).toBeEnabled();
    });

    it('tells them where they stand either way', async () => {
      openMatchday();
      server.use(
        http.get(apiUrl('/penkas/:penkaId/me'), () =>
          HttpResponse.json({ myEntry: fixtures.myEntry({ lives: 0, status: 'island' }) }),
        ),
      );
      await open();

      expect(screen.getByText('Te quedaste sin tarjetas')).toBeInTheDocument();
    });

    it('stops them when the penka has the island off', async () => {
      openMatchday();
      server.use(
        http.get(apiUrl('/me/penkas'), () =>
          HttpResponse.json({
            penkas: [
              fixtures.myPenkaItem({
                penka: fixtures.penka({ settings: { lives: 2, islandEnabled: false } }),
                entry: fixtures.entry({ lives: 0, status: 'island' }),
              }),
            ],
          }),
        ),
        http.get(apiUrl('/penkas/:penkaId/me'), () =>
          HttpResponse.json({ myEntry: fixtures.myEntry({ lives: 0, status: 'island' }) }),
        ),
      );
      await open();

      expect(screen.getByRole('button', { name: 'Jugás en La Isla' })).toBeDisabled();
      expect(screen.getByRole('button', { name: /River Plate/ })).toBeDisabled();
    });
  });

  describe('the lock', () => {
    it('counts down to the deadline', async () => {
      openMatchday();
      await open();

      expect(screen.getByText('Cierra en')).toBeInTheDocument();
    });

    it('closes the screen the moment the countdown runs out, without a reload', async () => {
      // The next poll may be ten seconds away, and the one after that longer.
      // Waiting for it would keep taking picks the server is already refusing,
      // so the countdown's own clock closes the screen.
      //
      // Real timers on purpose: the countdown's interval is started during
      // render, and swapping in fake ones afterwards leaves it ticking on the
      // real clock where `advanceTimersByTime` can never reach it.
      const lockAt = new Date(Date.now() + 1200).toISOString();
      openMatchday(lockAt);
      await open();

      await screen.findByText('Fecha cerrada', {}, { timeout: 4000 });
      expect(screen.getByText('Sin cambios')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Fecha cerrada sin pick' })).toBeDisabled();
      expect(screen.getByRole('button', { name: /River Plate/ })).toBeDisabled();
    });
  });

  it('shows placeholders until the first board lands', async () => {
    server.use(
      http.get(apiUrl('/penkas/:penkaId/board'), async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return HttpResponse.json({ board: fixtures.board() });
      }),
    );
    const { container } = await renderApp(PICK_PATH, { signedIn: true });
    await flush(1);

    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
  });
});
