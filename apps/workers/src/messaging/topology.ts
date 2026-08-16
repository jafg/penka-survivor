import type { Channel } from 'amqplib';
import {
  RESOLUTION_BINDING_KEY,
  RESOLUTION_DLQ,
  RESOLUTION_QUEUE,
  SURVIVOR_COMMANDS_EXCHANGE,
  SURVIVOR_DLX,
} from '@penka/contracts';

/**
 * Declare the resolution topology. Every `assert*` is idempotent, so this runs
 * on every boot of every process that touches the broker: whichever of this
 * worker and @penka/backoffice-api starts first creates it, and neither depends
 * on a migration having been run.
 *
 * It is a second copy of the back office's function on purpose — an app never
 * imports another app's `src/`. What keeps the two honest is that every *name*
 * comes from @penka/contracts; the only values not in the contract are the two
 * dead-letter options below, and declaring one queue twice with different
 * arguments is a PRECONDITION_FAILED that closes the channel, so a drift here
 * fails at boot rather than silently.
 *
 * Everything is durable. A resolution command that vanished because the broker
 * bounced would leave players eliminated in some penkas and untouched in
 * others — the one inconsistency this game cannot explain to its players.
 */
export async function declareTopology(channel: Channel): Promise<void> {
  await channel.assertExchange(SURVIVOR_COMMANDS_EXCHANGE, 'topic', { durable: true });
  await channel.assertExchange(SURVIVOR_DLX, 'topic', { durable: true });

  await channel.assertQueue(RESOLUTION_DLQ, { durable: true });
  await channel.bindQueue(RESOLUTION_DLQ, SURVIVOR_DLX, RESOLUTION_DLQ);

  await channel.assertQueue(RESOLUTION_QUEUE, {
    durable: true,
    deadLetterExchange: SURVIVOR_DLX,
    deadLetterRoutingKey: RESOLUTION_DLQ,
  });
  await channel.bindQueue(RESOLUTION_QUEUE, SURVIVOR_COMMANDS_EXCHANGE, RESOLUTION_BINDING_KEY);
}
