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
 * on every boot of every process that touches the broker: whichever of this API
 * and @penka/workers starts first creates it, and neither depends on a
 * migration having been run.
 *
 * Everything is durable. A resolution command that vanished because the broker
 * bounced would leave players eliminated in some penkas and untouched in
 * others — the one inconsistency this game cannot explain to its players.
 *
 * A command the worker rejects goes to the dead-letter queue rather than back
 * on the queue: a message that fails once on a bad document fails forever, and
 * requeueing it would spin instead of leaving it somewhere an operator can look.
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
