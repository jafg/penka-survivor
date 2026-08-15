import { describe, expect, it, vi } from 'vitest';
import type { ConfirmChannel } from 'amqplib';
import type { ResolveMatchdayCommand } from '@penka/contracts';
import { createResolutionPublisher } from './publisher';

function fakeChannel() {
  const channel = {
    publish: vi.fn().mockReturnValue(true),
    waitForConfirms: vi.fn().mockResolvedValue(undefined),
  };
  return channel as unknown as ConfirmChannel & typeof channel;
}

function command(penkaId: string): ResolveMatchdayCommand {
  return {
    penkaId,
    leagueId: 'copa-libertadores',
    matchday: 1,
    requestedAt: '2026-08-15T14:00:00.000Z',
  };
}

describe('createResolutionPublisher', () => {
  it('publishes one command per penka on the command exchange', async () => {
    const channel = fakeChannel();

    await createResolutionPublisher(channel).publishResolutions([command('p1'), command('p2')]);

    expect(channel.publish).toHaveBeenCalledTimes(2);
    expect(channel.publish.mock.calls.map((call) => [call[0], call[1]])).toEqual([
      ['survivor.commands', 'matchday.resolve.p1'],
      ['survivor.commands', 'matchday.resolve.p2'],
    ]);
  });

  it('sends the command as JSON the worker can parse without knowing our types', async () => {
    const channel = fakeChannel();

    await createResolutionPublisher(channel).publishResolutions([command('p1')]);

    const [, , body, options] = channel.publish.mock.calls[0] as [
      string,
      string,
      Buffer,
      { contentType?: string },
    ];
    expect(JSON.parse(body.toString())).toEqual(command('p1'));
    expect(options.contentType).toBe('application/json');
  });

  it('stamps the deterministic message id a duplicate is recognized by', async () => {
    const channel = fakeChannel();

    await createResolutionPublisher(channel).publishResolutions([
      { ...command('p1'), matchday: 2 },
    ]);

    expect(channel.publish.mock.calls[0]?.[3]).toMatchObject({ messageId: 'resolve:p1:2' });
  });

  it('marks every message persistent, so a broker restart keeps the fan-out', async () => {
    const channel = fakeChannel();

    await createResolutionPublisher(channel).publishResolutions([command('p1'), command('p2')]);

    for (const call of channel.publish.mock.calls) {
      expect(call[3]).toMatchObject({ persistent: true });
    }
  });

  it('does not return until the broker has confirmed the batch', async () => {
    // publish() only says the bytes reached the client's buffer. Returning on
    // that would make a broker that died mid-batch look like success, and the
    // route would mark a matchday requested with nothing in the queue.
    const channel = fakeChannel();
    let confirmed = false;
    channel.waitForConfirms.mockImplementation(async () => {
      confirmed = true;
    });

    await createResolutionPublisher(channel).publishResolutions([command('p1')]);

    expect(confirmed).toBe(true);
  });

  it('fails when the broker refuses the batch', async () => {
    const channel = fakeChannel();
    channel.waitForConfirms.mockRejectedValue(new Error('channel closed'));

    await expect(
      createResolutionPublisher(channel).publishResolutions([command('p1')]),
    ).rejects.toThrow('channel closed');
  });

  it('publishes nothing for an empty fan-out', async () => {
    // A league with no penkas is not an error: there is simply nobody to resolve.
    const channel = fakeChannel();

    await createResolutionPublisher(channel).publishResolutions([]);

    expect(channel.publish).not.toHaveBeenCalled();
  });
});
