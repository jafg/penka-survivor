import type { ConfirmChannel } from 'amqplib';
import {
  SURVIVOR_COMMANDS_EXCHANGE,
  resolveMessageId,
  resolveRoutingKey,
  type ResolveMatchdayCommand,
} from '@penka/contracts';

/**
 * What the resolve route needs from the broker, and nothing else. Narrow on
 * purpose: it is the seam tests inject a broken channel through, and the only
 * outbound dependency the route has.
 */
export interface ResolutionPublisher {
  publishResolutions(commands: readonly ResolveMatchdayCommand[]): Promise<void>;
}

/**
 * Publishes one command per penka and waits for the broker to confirm all of
 * them. The wait is the point: `publish()` only says the bytes reached the
 * client's buffer, so without confirms a broker that died mid-batch would look
 * exactly like a successful resolution, and the route's compensation would
 * never run.
 *
 * Each message carries a deterministic `messageId` (`resolve:{penkaId}:{n}`),
 * which is what makes a duplicate recognizable downstream, and `persistent`
 * delivery so a broker restart does not eat a matchday.
 */
export function createResolutionPublisher(channel: ConfirmChannel): ResolutionPublisher {
  return {
    async publishResolutions(commands) {
      for (const command of commands) {
        channel.publish(
          SURVIVOR_COMMANDS_EXCHANGE,
          resolveRoutingKey(command.penkaId),
          Buffer.from(JSON.stringify(command)),
          {
            messageId: resolveMessageId(command.penkaId, command.matchday),
            persistent: true,
            contentType: 'application/json',
          },
        );
      }
      // One wait for the whole batch rather than one per message: a league has
      // a handful of penkas, and the route treats the fan-out as one operation
      // that either reached the broker or did not.
      await channel.waitForConfirms();
    },
  };
}
