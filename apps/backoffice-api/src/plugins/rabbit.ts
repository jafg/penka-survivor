import fp from 'fastify-plugin';
import { connect, type ChannelModel, type ConfirmChannel } from 'amqplib';
import { createResolutionPublisher, type ResolutionPublisher } from '../messaging/publisher';
import { declareTopology } from '../messaging/topology';

declare module 'fastify' {
  interface FastifyInstance {
    publisher: ResolutionPublisher;
  }
}

export interface RabbitPluginOptions {
  url: string;
}

/**
 * Connects at boot so a bad RABBITMQ_URL fails fast, declares the topology
 * (idempotently — see declareTopology), and decorates the publisher the resolve
 * route uses. Closes the channel and connection with the app.
 *
 * One long-lived confirm channel for the process: channels are cheap but not
 * free, and every publish here goes to the same exchange. Confirm mode is what
 * lets `publishResolutions` wait for the broker instead of guessing.
 */
export const rabbitPlugin = fp<RabbitPluginOptions>(
  async (app, options) => {
    const connection: ChannelModel = await connect(options.url);
    const channel: ConfirmChannel = await connection.createConfirmChannel();
    await declareTopology(channel);

    app.decorate('publisher', createResolutionPublisher(channel));
    app.addHook('onClose', async () => {
      try {
        await channel.close();
      } finally {
        await connection.close();
      }
    });
  },
  { name: 'rabbit' },
);
