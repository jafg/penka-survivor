import { HttpResponse, http } from 'msw';
import { screen } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ErrorCodes } from '@penka/contracts';
import { apiUrl } from '../api/client';
import { apiError, server } from '../test-support/server';
import { flush, renderApp } from '../test-support/render';
import * as fixtures from '../test-support/fixtures';

const GOOD_KEY = 'the-real-admin-key-0123456789abcdef';

/** A deployment that knows exactly one key, like the real one. */
function acceptOnly(good: string): void {
  server.use(
    http.get(apiUrl('/penkas'), ({ request }) =>
      request.headers.get('x-admin-key') === good
        ? HttpResponse.json({ pools: fixtures.pools() })
        : apiError(401, ErrorCodes.unauthorized, 'Invalid admin key'),
    ),
  );
}

function keyField(): HTMLElement {
  return screen.getByLabelText(/clave/i);
}

describe('the admin key gate', () => {
  it('stays out of the way while the key works', async () => {
    await renderApp();

    expect(screen.queryByRole('button', { name: 'Entrar' })).not.toBeInTheDocument();
    expect(screen.getByText('copa-libertadores · Fecha 2')).toBeInTheDocument();
  });

  it('replaces the dashboard when the API refuses the key', async () => {
    // Before this, a wrong key left the operator on an empty console with a 401
    // buried in the API log and nothing to do about it.
    acceptOnly(GOOD_KEY);

    await renderApp();

    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
    expect(screen.queryByText('copa-libertadores · Fecha 2')).not.toBeInTheDocument();
  });

  it('opens the console once a key the API accepts is entered', async () => {
    acceptOnly(GOOD_KEY);
    await renderApp();

    await userEvent.type(keyField(), GOOD_KEY);
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await flush();

    expect(screen.queryByRole('button', { name: 'Entrar' })).not.toBeInTheDocument();
    expect(screen.getByText('copa-libertadores · Fecha 2')).toBeInTheDocument();
  });

  it('stays put and says why when the key is wrong', async () => {
    acceptOnly(GOOD_KEY);
    await renderApp();

    await userEvent.type(keyField(), 'nope');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await flush();

    expect(screen.getByRole('alert')).toHaveTextContent('Invalid admin key');
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
  });

  it('keeps the key out of the page as text', async () => {
    // It is a deployment-wide shared secret; a console left open on a projector
    // should not be reading it out.
    acceptOnly(GOOD_KEY);
    await renderApp();

    expect(keyField()).toHaveAttribute('type', 'password');
  });

  it('lets an operator hand the key back and re-enter it', async () => {
    await renderApp();

    await userEvent.click(screen.getByRole('button', { name: 'Cambiar clave' }));
    await flush();

    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
  });
});
