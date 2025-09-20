import { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { env } from '../env.js';
import { findWalletByTwitchUserId } from '../repositories/wallets.js';
import { findLatestStreamerAsset } from '../repositories/streamerAssets.js';
import { buildPublicUrl } from '../storage/localUploads.js';
import {
    extractEventSubHeaders,
    registerMessage,
    verifyEventSubSignature,
} from '../services/eventsubVerifier.js';
import { mintUpsuiderNft } from '../services/upsuiderNft.js';

const challengeSchema = z.object({
    challenge: z.string(),
});

const notificationSchema = z.object({
    subscription: z.object({
        type: z.literal('channel.channel_points_custom_reward_redemption.add'),
    }),
    event: z.object({
        user_id: z.string(),
        broadcaster_user_id: z.string(),
    }),
});

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
}

function resolveRequestOrigin(request: FastifyRequest): string | undefined {
    const forwardedProto = firstHeaderValue(request.headers['x-forwarded-proto']);
    const forwardedHost = firstHeaderValue(request.headers['x-forwarded-host']);
    const host = forwardedHost ?? firstHeaderValue(request.headers['host']);
    if (!host) {
        return undefined;
    }
    const protocol = forwardedProto ?? request.protocol ?? 'http';
    return `${protocol}://${host}`;
}

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
        const streamerId = parsed.data.event.broadcaster_user_id
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

            const latestAsset = await findLatestStreamerAsset(streamerId);
            if (!latestAsset) {
                reply.status(404);
                return {
                    error: 'Sender Address Not Found',
                    message: 'Sender Must Make NFT',
                    streamerId,
                };
            }
            const origin = resolveRequestOrigin(request);
            const assetUrl = latestAsset?.filePath ? buildPublicUrl(latestAsset.filePath, origin) : undefined;

            const metadata = {
                name: env.UPSUIDER_NFT_NAME ?? `Upsuider NFT for ${twitchUserId}`,
                description:
                    env.UPSUIDER_NFT_DESCRIPTION ??
                    `Minted for Twitch user ${twitchUserId} via Upsuider integration`,
                imageUrl: assetUrl ?? env.UPSUIDER_NFT_IMAGE_URL ?? '',
            };

            const mintResult = await mintUpsuiderNft(wallet.walletAddress, metadata);

            return {
                twitchUserId,
                walletAddress: wallet.walletAddress,
                transactionDigest: mintResult.digest,
                metadata,
            };
        } catch (error) {
            request.log.error({ err: error }, 'Failed to process EventSub notification');
            reply.status(500);
            return { error: 'internal_error', message: 'Failed to process reward redemption' };
        }
    });
};
