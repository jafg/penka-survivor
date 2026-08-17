import { HttpResponse, http } from 'msw';
import { screen, within } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiUrl } from '../api/client';
import { RESOLVE_POLL_ATTEMPTS, RESOLVE_POLL_MS } from '../stores/matchday';
import { apiError, server } from '../test-support/server';
import { flush, renderApp } from '../test-support/render';
import * as fixtures from '../test-support/fixtures';

/** The URLs the API actually received, in order. */
function recordUrls(): string[] {
  const urls: string[] = [];
  server.events.on('request:start', ({ request }) => urls.push(request.url));
  return urls;
}

/** Serves the matchday in a given shape for every read the console makes. */
function serveMatchday(detail = fixtures.matchdayDetail()): void {
  server.use(
    http.get(apiUrl('/leagues/:leagueId/matchdays/:number'), () => HttpResponse.json(detail)),
  );
}

function resolveButton(): HTMLElement {
  return screen.getByRole('button', { name: /Resolver fecha|Fecha resuelta|Resolviendo/ });
}

describe('the console at rest', () => {
  it('opens on the matchday after the last resolved one', async () => {
    // No route answers "which matchday am I on?", so the console derives it from
    // the penka listing: one resolved matchday means number 2 is the live one.
    const urls = recordUrls();

    await renderApp();

    expect(urls).toEqual([apiUrl('/penkas'), apiUrl('/leagues/copa-libertadores/matchdays/2')]);
    expect(screen.getByText('copa-libertadores · Fecha 2')).toBeInTheDocument();
  });

  it('honours an explicit ?leagueId= and ?matchday=', async () => {
    const urls = recordUrls();

    await renderApp('/?leagueId=premier-league&matchday=7');

    expect(urls).toContain(apiUrl('/leagues/premier-league/matchdays/7'));
  });

  it('summarises the matchday the way the prototype does', async () => {
    serveMatchday(fixtures.matchdayDetail({ matches: fixtures.matches(1) }));

    await renderApp();

    expect(screen.getByText('Abierta')).toBeInTheDocument();
    expect(screen.getByText('1/4')).toBeInTheDocument();
    // Deployment-wide, summed across every penka: 8 + 5.
    expect(screen.getByText('13')).toBeInTheDocument();
  });

  it('lists the penkas with their operational counters', async () => {
    await renderApp();

    const row = screen.getByText('Survivor de la oficina').closest('tr') as HTMLElement;
    expect(within(row).getByText('OFI123')).toBeInTheDocument();
    expect(within(row).getByText('9')).toBeInTheDocument();
    expect(within(row).getByText('6')).toBeInTheDocument();
  });
});

describe('closing a matchday', () => {
  it('posts to the league-scoped close route and shows the locked pill', async () => {
    const urls = recordUrls();
    await renderApp();

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar fecha' }));
    await flush();

    expect(urls).toContain(apiUrl('/leagues/copa-libertadores/matchdays/2/close'));
    expect(screen.getByText('Cerrada')).toBeInTheDocument();
    expect(screen.getByText('Fecha cerrada · no se aceptan más picks')).toBeInTheDocument();
  });
});

describe('loading results', () => {
  it('posts the outcome to the percent-encoded match id and moves the counter', async () => {
    const urls = recordUrls();
    await renderApp();
    const row = screen.getByText('RIV vs BOC').closest('tr') as HTMLElement;

    await userEvent.click(within(row).getByRole('button', { name: 'RIV' }));
    await flush();

    expect(urls).toContain(apiUrl('/matches/copa-libertadores%3Amd2%3ARIV-BOC/result'));
    expect(within(row).getByRole('button', { name: 'RIV' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('1/4')).toBeInTheDocument();
    // The pending count is the API's, not this client's arithmetic.
    expect(screen.getByText('Resultado cargado · faltan 3')).toBeInTheDocument();
  });

  it('renders the API’s refusal to overwrite a resolved matchday', async () => {
    server.use(
      http.post(apiUrl('/matches/:matchId/result'), () =>
        apiError(409, 'already_resolved', 'This matchday has already been resolved'),
      ),
    );
    await renderApp();
    const row = screen.getByText('RIV vs BOC').closest('tr') as HTMLElement;

    await userEvent.click(within(row).getByRole('button', { name: 'Empate' }));
    await flush();

    expect(screen.getByText('This matchday has already been resolved')).toBeInTheDocument();
  });

  it('takes the outcome selectors out of service once the matchday is resolved', async () => {
    serveMatchday(
      fixtures.matchdayDetail({
        matchday: fixtures.matchday('resolved'),
        matches: fixtures.matches(4),
      }),
    );

    await renderApp();

    const row = screen.getByText('RIV vs BOC').closest('tr') as HTMLElement;
    expect(within(row).getByRole('button', { name: 'Empate' })).toBeDisabled();
    expect(resolveButton()).toHaveTextContent('Fecha resuelta');
  });
});

describe('resolving a matchday', () => {
  beforeEach(() => {
    // The resolve flow runs on timers: the console re-reads the matchday a few
    // times while the workers do the work. `shouldAdvanceTime` keeps the
    // library's own awaits working while the test drives those ticks.
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stays disabled on an OPEN matchday even with every result in', async () => {
    // The prototype enabled it on the results alone and would have earned a 409.
    serveMatchday(
      fixtures.matchdayDetail({ matchday: fixtures.matchday('open'), matches: fixtures.matches(4) }),
    );

    await renderApp();

    expect(resolveButton()).toBeDisabled();
    expect(screen.getByText('Cerrá la fecha antes de resolverla.')).toBeInTheDocument();
  });

  it('stays disabled on a locked matchday while a result is missing', async () => {
    serveMatchday(
      fixtures.matchdayDetail({
        matchday: fixtures.matchday('locked'),
        matches: fixtures.matches(3),
      }),
    );

    await renderApp();

    expect(resolveButton()).toBeDisabled();
    expect(screen.getByText('Cargá todos los resultados antes de resolver.')).toBeInTheDocument();
  });

  it('enables only when the matchday is locked AND complete, and reports it as QUEUED', async () => {
    const urls = recordUrls();
    serveMatchday(
      fixtures.matchdayDetail({
        matchday: fixtures.matchday('locked'),
        matches: fixtures.matches(4),
      }),
    );
    await renderApp();
    expect(resolveButton()).toBeEnabled();

    await userEvent.click(resolveButton());
    await flush();

    expect(urls).toContain(apiUrl('/leagues/copa-libertadores/matchdays/2/resolve'));
    // The endpoint publishes one message per penka and returns. Nothing is
    // resolved yet, so the console must not say "fecha resuelta".
    expect(
      screen.getByText('Resolución encolada · un job por Penka; el estado se actualiza al terminar'),
    ).toBeInTheDocument();
    expect(screen.getByText('Cerrada')).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(RESOLVE_POLL_MS * (RESOLVE_POLL_ATTEMPTS + 1));
  });

  it('reflects the real state on a later read, once the workers have run', async () => {
    let reads = 0;
    server.use(
      http.get(apiUrl('/leagues/:leagueId/matchdays/:number'), () => {
        reads += 1;
        return HttpResponse.json(
          fixtures.matchdayDetail({
            matchday: fixtures.matchday(reads > 1 ? 'resolved' : 'locked'),
            matches: fixtures.matches(4),
          }),
        );
      }),
    );
    await renderApp();

    await userEvent.click(resolveButton());
    await vi.advanceTimersByTimeAsync(RESOLVE_POLL_MS);
    await flush();

    expect(screen.getByText('Resuelta')).toBeInTheDocument();
    expect(resolveButton()).toHaveTextContent('Fecha resuelta');
  });

  it('renders a 409 matchday_not_locked in the API’s own words', async () => {
    serveMatchday(
      fixtures.matchdayDetail({
        matchday: fixtures.matchday('locked'),
        matches: fixtures.matches(4),
      }),
    );
    server.use(
      http.post(apiUrl('/leagues/:leagueId/matchdays/:number/resolve'), () =>
        apiError(409, 'matchday_not_locked', 'Close this matchday before resolving it'),
      ),
    );
    await renderApp();

    await userEvent.click(resolveButton());
    await flush();

    expect(screen.getByText('Close this matchday before resolving it')).toBeInTheDocument();
  });

  it('renders a 409 results_missing in the API’s own words', async () => {
    serveMatchday(
      fixtures.matchdayDetail({
        matchday: fixtures.matchday('locked'),
        matches: fixtures.matches(4),
      }),
    );
    server.use(
      http.post(apiUrl('/leagues/:leagueId/matchdays/:number/resolve'), () =>
        apiError(409, 'results_missing', 'Some matches still have no result'),
      ),
    );
    await renderApp();

    await userEvent.click(resolveButton());
    await flush();

    expect(screen.getByText('Some matches still have no result')).toBeInTheDocument();
  });
});

describe('the ops panel', () => {
  it('sends the contract value behind the prototype’s Spanish label', async () => {
    let sent: unknown = null;
    server.use(
      http.put(apiUrl('/polling-profile'), async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ profile: 'slow' });
      }),
    );
    await renderApp();

    // "Degradado" is the operator's word; `degraded` is not a PollingProfile.
    await userEvent.click(screen.getByRole('button', { name: 'Degradado' }));
    await flush();

    expect(sent).toEqual({ profile: 'slow' });
    expect(screen.getByRole('button', { name: 'Degradado' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // The API answers with the profile alone; the seconds come from the
    // contract's own `nextPollInSec`.
    expect(screen.getByText('30 s')).toBeInTheDocument();
  });

  it('shows the cadence the API says it is already serving', async () => {
    serveMatchday(fixtures.matchdayDetail({ pollingProfile: 'live' }));

    await renderApp();

    expect(screen.getByRole('button', { name: 'En vivo' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('2 s')).toBeInTheDocument();
  });
});

describe('the API console', () => {
  it('lists every round trip, newest first', async () => {
    const { container } = await renderApp();

    const paths = [...container.querySelectorAll('.log-path')].map((node) =>
      node.textContent?.trim(),
    );
    expect(paths).toEqual([
      '/admin/v1/leagues/copa-libertadores/matchdays/2',
      '/admin/v1/penkas',
    ]);
  });

  it('marks a failed round trip and names the code the API sent', async () => {
    // `internal`, not `unauthorized`: a 401 no longer leaves the console
    // mounted — it puts up the admin key gate instead (see
    // `components/AdminKeyGate.test.ts`), so this panel would not be on screen
    // to assert against. Every other failure still lands here, which is what
    // the panel is for.
    server.use(http.get(apiUrl('/penkas'), () => apiError(500, 'internal', 'boom')));

    const { container } = await renderApp();

    const failed = container.querySelector('.log-entry.is-error');
    expect(failed?.textContent).toContain('internal');
    expect(failed?.textContent).toContain('500');
  });
});
