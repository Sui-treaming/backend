import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { env } from '../env.js';
import { findWalletByTwitchUserId } from '../repositories/wallets.js';
import {
  extractEventSubHeaders,
  registerMessage,
  verifyEventSubSignature,
} from '../services/eventsubVerifier.js';

const challengeSchema = z.object({
  challenge: z.string(),
});

const notificationSchema = z.object({
  subscription: z.object({
    type: z.literal('channel.channel_points_custom_reward_redemption.add'),
  }),
  event: z.object({
    user_id: z.string(),
  }),
});

export const eventSubRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body, done) => {
    if (typeof body !== 'string') {
      done(null, body.toString());
      return;
    }
    done(null, body);
  });

  fastify.post('/callback', async (request, reply) => {
    if (typeof request.body !== 'string') {
      request.log.warn('EventSub request body was not a string');
      reply.status(400);
      return { error: 'invalid_body', message: 'Expected raw body string' };
    }

    const rawBody = request.body;

    let headers;
    try {
      headers = extractEventSubHeaders(request.headers);
    } catch (error) {
      request.log.warn({ err: error }, 'Missing EventSub headers');
      reply.status(400);
      return { error: 'missing_headers', message: 'Missing required Twitch EventSub headers' };
    }

    if (!verifyEventSubSignature(env.TWITCH_EVENTSUB_SECRET, headers, rawBody)) {
      request.log.warn({ headers }, 'EventSub signature verification failed');
      reply.status(403);
      return { error: 'invalid_signature' };
    }

    if (!registerMessage(headers)) {
      request.log.info({ messageId: headers.messageId }, 'Duplicate EventSub message ignored');
      reply.status(204);
      return null;
    }

    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch (error) {
      request.log.warn({ err: error }, 'Failed to parse EventSub payload');
      reply.status(400);
      return { error: 'invalid_json', message: 'Unable to parse EventSub payload' };
    }

    if (headers.messageType === 'webhook_callback_verification') {
      const parsed = challengeSchema.safeParse(parsedBody);
      if (!parsed.success) {
        reply.status(400);
        return { error: 'invalid_challenge', message: 'Invalid challenge payload' };
      }
      reply.type('text/plain');
      return parsed.data.challenge;
    }

    if (headers.messageType !== 'notification') {
      request.log.info({ messageType: headers.messageType }, 'Unhandled EventSub message type');
      reply.status(204);
      return null;
    }

    const parsed = notificationSchema.safeParse(parsedBody);
    if (!parsed.success) {
      request.log.warn({ errors: parsed.error.flatten() }, 'Unexpected EventSub notification shape');
      reply.status(204);
      return null;
    }

    const twitchUserId = parsed.data.event.user_id;

    try {
      const wallet = await findWalletByTwitchUserId(twitchUserId);
      if (!wallet) {
        reply.status(404);
        return {
          error: 'wallet_not_found',
          message: 'Wallet not found for Twitch user',
          twitchUserId,
        };
      }

      return {
        twitchUserId,
        walletAddress: wallet.walletAddress,
      };
    } catch (error) {
      request.log.error({ err: error }, 'Failed to resolve wallet for EventSub notification');
      reply.status(500);
      return { error: 'internal_error', message: 'Failed to resolve wallet address' };
    }
  });
};
