import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { MongoServerError, ObjectId } from 'mongodb';
import {
  LoginRequestSchema,
  LoginResponseSchema,
  MeResponseSchema,
  RefreshRequestSchema,
  RefreshResponseSchema,
  RegisterRequestSchema,
  RegisterResponseSchema,
  type AuthTokens,
} from '@penka/contracts';
import type { AppConfig } from '../../config';
import { ApiError } from '../../errors';
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from '../../services/password';
import {
  ensureAuthIndexes,
  refreshTokensCollection,
  toPublicUser,
  usersCollection,
} from './store';

export interface AuthRoutesOptions {
  config: AppConfig;
}

/** Sign an access token and persist the hash of a fresh refresh token. */
async function issueTokens(
  app: FastifyInstance,
  config: AppConfig,
  userId: string,
): Promise<AuthTokens> {
  const accessToken = await app.tokens.signAccessToken(userId);
  const refreshToken = app.tokens.generateRefreshToken();
  const now = new Date();
  await refreshTokensCollection(app.db).insertOne({
    tokenHash: app.tokens.hashRefreshToken(refreshToken),
    userId,
    expiresAt: new Date(now.getTime() + config.refreshTokenTtlSeconds * 1000),
    createdAt: now,
  });
  return { accessToken, refreshToken };
}

/**
 * Decorators this module reads. It is a plain (non fastify-plugin) plugin, so
 * Fastify cannot check plugin dependencies for it: assert them explicitly so a
 * registration-order mistake fails at boot with a clear message instead of
 * crashing cryptically — or, for `rateLimit`, leaving login silently
 * unthrottled because @fastify/rate-limit only sees routes registered after it.
 */
const REQUIRED_DECORATORS = ['db', 'tokens', 'authenticate', 'rateLimit'] as const;

export const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = async (instance, options) => {
  const { config } = options;
  for (const decorator of REQUIRED_DECORATORS) {
    if (!instance.hasDecorator(decorator)) {
      throw new Error(
        `authRoutes requires the "${decorator}" decorator: register the mongo, redis, ` +
          'rate-limit, and auth plugins before it',
      );
    }
  }
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  await ensureAuthIndexes(app.db);

  const rateLimited = { rateLimit: { max: config.rateLimitMax, timeWindow: '1 minute' } };

  app.post(
    '/auth/register',
    {
      config: rateLimited,
      schema: { body: RegisterRequestSchema, response: { 201: RegisterResponseSchema } },
    },
    async (request, reply) => {
      // Emails are case-insensitive: normalize before storing and querying.
      const email = request.body.email.toLowerCase();
      const doc = {
        email,
        displayName: request.body.displayName,
        passwordHash: await hashPassword(request.body.password),
        createdAt: new Date(),
      };
      let insertedId: ObjectId;
      try {
        ({ insertedId } = await usersCollection(app.db).insertOne(doc));
      } catch (error) {
        // The unique index is the race-safe duplicate check.
        if (error instanceof MongoServerError && error.code === 11000) {
          throw new ApiError(409, 'email_taken', 'Email is already registered');
        }
        throw error;
      }
      const user = toPublicUser({ _id: insertedId, ...doc });
      let tokens;
      try {
        tokens = await issueTokens(app, config, user.id);
      } catch (error) {
        // Roll the account back: a half-created user would make the client's
        // retry fail with email_taken for an account it never received.
        await usersCollection(app.db)
          .deleteOne({ _id: insertedId })
          .catch(() => undefined);
        throw error;
      }
      return reply.code(201).send({ user, tokens });
    },
  );

  app.post(
    '/auth/login',
    {
      config: rateLimited,
      schema: { body: LoginRequestSchema, response: { 200: LoginResponseSchema } },
    },
    async (request) => {
      const email = request.body.email.toLowerCase();
      const user = await usersCollection(app.db).findOne({ email });
      // Verify against a dummy hash when the email is unknown so both failure
      // modes cost one argon2 verification and share one response body.
      const valid = await verifyPassword(
        user?.passwordHash ?? DUMMY_PASSWORD_HASH,
        request.body.password,
      );
      if (user === null || !valid) {
        throw new ApiError(401, 'invalid_credentials', 'Invalid email or password');
      }
      const tokens = await issueTokens(app, config, user._id.toHexString());
      return { user: toPublicUser(user), tokens };
    },
  );

  app.post(
    '/auth/refresh',
    { schema: { body: RefreshRequestSchema, response: { 200: RefreshResponseSchema } } },
    async (request) => {
      const tokenHash = app.tokens.hashRefreshToken(request.body.refreshToken);
      const stored = await refreshTokensCollection(app.db).findOne({ tokenHash });
      if (stored === null || stored.expiresAt.getTime() <= Date.now()) {
        throw new ApiError(401, 'unauthorized', 'Refresh token is invalid or expired');
      }
      // Issue before revoking, so a failed write leaves the presented token
      // usable instead of stranding the client with no way back in.
      const tokens = await issueTokens(app, config, stored.userId);
      // findOneAndDelete is the atomic single-use gate: exactly one concurrent
      // refresh can consume the old token.
      const consumed = await refreshTokensCollection(app.db).findOneAndDelete({ tokenHash });
      if (consumed === null) {
        // Lost the race — revoke the pair just issued so it grants nothing.
        await refreshTokensCollection(app.db)
          .deleteOne({ tokenHash: app.tokens.hashRefreshToken(tokens.refreshToken) })
          .catch(() => undefined);
        throw new ApiError(401, 'unauthorized', 'Refresh token is invalid or expired');
      }
      return { tokens };
    },
  );

  app.get(
    '/me',
    { preHandler: app.authenticate, schema: { response: { 200: MeResponseSchema } } },
    async (request) => {
      const userId = request.userId;
      if (userId === undefined || !ObjectId.isValid(userId)) {
        throw new ApiError(401, 'unauthorized', 'Invalid access token subject');
      }
      const user = await usersCollection(app.db).findOne({ _id: new ObjectId(userId) });
      if (user === null) {
        throw new ApiError(401, 'unauthorized', 'User no longer exists');
      }
      return { user: toPublicUser(user) };
    },
  );
};
