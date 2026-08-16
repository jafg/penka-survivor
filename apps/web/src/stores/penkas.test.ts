import { createPinia, setActivePinia } from 'pinia';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import type { CreatePenkaRequest } from '@penka/contracts';
import { apiUrl } from '../api/client';
import * as fixtures from '../test-support/fixtures';
import { apiError, server } from '../test-support/server';
import { usePenkasStore } from './penkas';

describe('penkasStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('keeps the server order of the listing', async () => {
    // The route answers newest-first. Re-sorting here would put a client
    // opinion on top of a server decision, and the two would drift.
    server.use(
      http.get(apiUrl('/me/penkas'), () =>
        HttpResponse.json({
          penkas: [
            fixtures.myPenkaItem({ penka: fixtures.penka({ name: 'La nueva' }) }),
            fixtures.myPenkaItem({
              penka: fixtures.penka({ id: fixtures.OTHER_PENKA_ID, name: 'La vieja' }),
            }),
          ],
        }),
      ),
    );
    const penkas = usePenkasStore();

    await penkas.load();

    expect(penkas.items.map((item) => item.penka.name)).toEqual(['La nueva', 'La vieja']);
  });

  it('exposes the entry alongside its penka, because lives live on the entry', async () => {
    // `penka.settings.lives` is the rule the penka was created with; a player's
    // remaining lives are on their own entry. A card that read the first would
    // show two hearts to someone who has one left.
    server.use(
      http.get(apiUrl('/me/penkas'), () =>
        HttpResponse.json({
          penkas: [
            fixtures.myPenkaItem({
              penka: fixtures.penka({ settings: { lives: 2, islandEnabled: true } }),
              entry: fixtures.entry({ lives: 1, status: 'island' }),
            }),
          ],
        }),
      ),
    );
    const penkas = usePenkasStore();

    await penkas.load();

    const item = penkas.items[0];
    expect(item?.entry.lives).toBe(1);
    expect(item?.entry.status).toBe('island');
    expect(item?.penka.settings.lives).toBe(2);
  });

  it('flags the load while it is in flight and clears it afterwards', async () => {
    const penkas = usePenkasStore();

    const pending = penkas.load();
    expect(penkas.isLoading).toBe(true);

    await pending;
    expect(penkas.isLoading).toBe(false);
  });

  it('keeps a failed load out of the list and reports the API message', async () => {
    server.use(
      http.get(apiUrl('/me/penkas'), () =>
        apiError(503, 'internal', 'El servicio no está disponible'),
      ),
    );
    const penkas = usePenkasStore();

    await penkas.load();

    expect(penkas.items).toEqual([]);
    expect(penkas.error?.message).toBe('El servicio no está disponible');
  });

  it('always sends a settings object so the server applies its own defaults', async () => {
    // `settings` is required even though both of its fields are optional. The
    // client must not decide that a penka has two lives — that default belongs
    // to the API, and it can change there without a frontend release.
    let body: CreatePenkaRequest | null = null;
    server.use(
      http.post(apiUrl('/penkas'), async ({ request }) => {
        body = (await request.json()) as CreatePenkaRequest;
        return HttpResponse.json({ penka: fixtures.penka() });
      }),
    );
    const penkas = usePenkasStore();

    await penkas.create({ name: 'Survivor de la oficina', leagueId: fixtures.LEAGUE_ID });

    expect(body).toEqual({
      name: 'Survivor de la oficina',
      leagueId: fixtures.LEAGUE_ID,
      settings: {},
    });
  });

  it('answers the created penka so the caller can navigate straight into it', async () => {
    const penkas = usePenkasStore();

    const created = await penkas.create({
      name: 'Survivor de la oficina',
      leagueId: fixtures.LEAGUE_ID,
    });

    expect(created.id).toBe(fixtures.PENKA_ID);
  });

  it('treats a repeated join as the success it is', async () => {
    // The route is idempotent: joining twice answers 200 with the same entry.
    // Rendering that as an error would strand a player outside a penka they
    // are already in.
    const penkas = usePenkasStore();

    const first = await penkas.join('4821');
    const again = await penkas.join('4821');

    expect(again.penka.id).toBe(first.penka.id);
    expect(penkas.error).toBeNull();
  });

  it('adds the joined penka to the list without a second round trip', async () => {
    let listCalls = 0;
    server.use(
      http.get(apiUrl('/me/penkas'), () => {
        listCalls += 1;
        return HttpResponse.json({ penkas: [] });
      }),
    );
    const penkas = usePenkasStore();
    await penkas.load();

    await penkas.join('4821');

    expect(penkas.items.map((item) => item.penka.id)).toEqual([fixtures.PENKA_ID]);
    expect(listCalls).toBe(1);
  });

  it('does not duplicate a penka that is already in the list', async () => {
    const penkas = usePenkasStore();
    await penkas.load();

    await penkas.join('4821');

    expect(penkas.items).toHaveLength(1);
  });

  it('surfaces an unknown join code with the API message and rejects', async () => {
    server.use(
      http.post(apiUrl('/penkas/join'), () =>
        apiError(404, 'invalid_join_code', 'El código no corresponde a ninguna penka'),
      ),
    );
    const penkas = usePenkasStore();

    await expect(penkas.join('9999')).rejects.toMatchObject({ code: 'invalid_join_code' });
    expect(penkas.error?.message).toBe('El código no corresponde a ninguna penka');
  });

  it('says nothing different about a malformed code than about an unknown one', async () => {
    // Both are 404 invalid_join_code on purpose, so a guesser cannot tell
    // "wrong shape" from "wrong code". The client must not undo that by
    // validating the format itself.
    const seen: string[] = [];
    server.use(
      http.post(apiUrl('/penkas/join'), async ({ request }) => {
        const body = (await request.json()) as { joinCode: string };
        seen.push(body.joinCode);
        return apiError(404, 'invalid_join_code', 'El código no corresponde a ninguna penka');
      }),
    );
    const penkas = usePenkasStore();

    await expect(penkas.join('abc')).rejects.toMatchObject({ code: 'invalid_join_code' });
    const malformed = penkas.error?.message;
    await expect(penkas.join('9999')).rejects.toMatchObject({ code: 'invalid_join_code' });

    expect(seen).toEqual(['abc', '9999']);
    expect(penkas.error?.message).toBe(malformed);
  });

  it('carries the rate limiter message through untouched', async () => {
    server.use(
      http.post(apiUrl('/penkas/join'), () =>
        apiError(429, 'rate_limited', 'Demasiados intentos. Probá de nuevo en un minuto.'),
      ),
    );
    const penkas = usePenkasStore();

    await expect(penkas.join('4821')).rejects.toMatchObject({ code: 'rate_limited' });
    expect(penkas.error?.message).toBe('Demasiados intentos. Probá de nuevo en un minuto.');
  });
});
