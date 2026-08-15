import fp from 'fastify-plugin';
import { MongoClient, type Db } from 'mongodb';

declare module 'fastify' {
  interface FastifyInstance {
    mongo: MongoClient;
    db: Db;
  }
}

export interface MongoPluginOptions {
  url: string;
  dbName: string;
}

/** Connects at boot so a bad MONGO_URL fails fast; closes the client with the app. */
export const mongoPlugin = fp<MongoPluginOptions>(
  async (app, options) => {
    const client = new MongoClient(options.url);
    await client.connect();
    app.decorate('mongo', client);
    app.decorate('db', client.db(options.dbName));
    app.addHook('onClose', async () => {
      await client.close();
    });
  },
  { name: 'mongo' },
);
