import { HttpResponse, http } from 'msw';
import { screen, waitFor } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiUrl } from '../api/client';
import * as fixtures from '../test-support/fixtures';
import { renderApp } from '../test-support/render';
import { apiError, server } from '../test-support/server';

async function typeCode(code: string): Promise<void> {
  await userEvent.type(screen.getByLabelText('Código de la penka'), code);
  await userEvent.click(screen.getByRole('button', { name: 'Sumarme' }));
}

describe('JoinPenkaView', () => {
  it('takes a code and lands the player in the penka', async () => {
    const { router } = await renderApp('/penkas/join', { signedIn: true });

    await typeCode('4821');

    await waitFor(() => {
      expect(router.currentRoute.value.name).toBe('pick');
    });
    expect(router.currentRoute.value.params['penkaId']).toBe(fixtures.PENKA_ID);
  });

  it('sends the code exactly as typed', async () => {
    let sent: { joinCode: string } | null = null;
    server.use(
      http.post(apiUrl('/penkas/join'), async ({ request }) => {
        sent = (await request.json()) as { joinCode: string };
        return HttpResponse.json({ penka: fixtures.penka(), entry: fixtures.entry() });
      }),
    );
    await renderApp('/penkas/join', { signedIn: true });

    await typeCode('4821');

    await waitFor(() => {
      expect(sent).toEqual({ joinCode: '4821' });
    });
  });

  it('treats a code the player already used as a success, not an error', async () => {
    // Joining twice answers 200 with the same entry. Showing an error would
    // strand a player outside a penka they are already in.
    server.use(
      http.post(apiUrl('/penkas/join'), () =>
        HttpResponse.json({ penka: fixtures.penka(), entry: fixtures.entry({ lives: 1 }) }),
      ),
    );
    const { router } = await renderApp('/penkas/join', { signedIn: true });

    await typeCode('4821');

    await waitFor(() => {
      expect(router.currentRoute.value.name).toBe('pick');
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('lets a code that is not four digits reach the server', async () => {
    // The route answers 404 for malformed AND unknown codes so a guesser cannot
    // tell them apart. A client-side format check would hand that distinction
    // straight back.
    let reached = false;
    server.use(
      http.post(apiUrl('/penkas/join'), () => {
        reached = true;
        return apiError(404, 'invalid_join_code', 'Ese código no existe');
      }),
    );
    await renderApp('/penkas/join', { signedIn: true });

    await typeCode('abc');

    await waitFor(() => {
      expect(reached).toBe(true);
    });
  });

  it('says the same thing about a malformed code as about an unknown one', async () => {
    server.use(
      http.post(apiUrl('/penkas/join'), () =>
        apiError(404, 'invalid_join_code', 'Ese código no existe'),
      ),
    );
    await renderApp('/penkas/join', { signedIn: true });

    await typeCode('abc');
    const malformed = (await screen.findByRole('alert')).textContent;

    await userEvent.clear(screen.getByLabelText('Código de la penka'));
    await typeCode('9999');

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe(malformed);
    });
    expect(malformed).toContain('Ese código no existe');
  });

  it('shows the rate limiter own words', async () => {
    // Sign-in and join share one 10/min bucket. The API knows how long the wait
    // is; this screen does not, so it repeats what it was told.
    server.use(
      http.post(apiUrl('/penkas/join'), () =>
        apiError(429, 'rate_limited', 'Demasiados intentos. Probá de nuevo en un minuto.'),
      ),
    );
    await renderApp('/penkas/join', { signedIn: true });

    await typeCode('4821');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Demasiados intentos. Probá de nuevo en un minuto.',
    );
  });

  it('keeps the player on the form when the code is refused', async () => {
    server.use(
      http.post(apiUrl('/penkas/join'), () =>
        apiError(404, 'invalid_join_code', 'Ese código no existe'),
      ),
    );
    const { router } = await renderApp('/penkas/join', { signedIn: true });

    await typeCode('9999');

    await screen.findByRole('alert');
    expect(router.currentRoute.value.name).toBe('join-penka');
  });

  it('will not submit an empty code', async () => {
    await renderApp('/penkas/join', { signedIn: true });

    expect(screen.getByRole('button', { name: 'Sumarme' })).toBeDisabled();
  });
});
