import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { upsertZkLoginWallet, findWalletByTwitchUserId } from '../repositories/wallets.js';
import type { ZkLoginWalletDocument } from '../db/mongo.js';

const createViewerSchema = z.object({
    twitchUserId: z.string().min(1, 'twitchUserId is required'),
    walletAddress: z.string().min(3, 'walletAddress is required'),
    provider: z.string().min(1, 'provider is required').optional(),
    audience: z.string().min(1, 'audience is required').optional(),
    registeredAt: z.string().datetime().optional(),
    displayName: z.string().min(1).optional(),
}).transform(data => ({
    twitchId: data.twitchUserId,
    walletAddress: data.walletAddress,
    provider: data.provider,
    audience: data.audience,
    registeredAt: data.registeredAt,
    displayName: data.displayName,
}));

const getViewerParamsSchema = z.object({
    twitchId: z.string().min(1),
});

function serializeWallet(doc: ZkLoginWalletDocument) {
    return {
        twitchUserId: doc.twitchUserId,
        walletAddress: doc.walletAddress,
        provider: doc.provider,
        audience: doc.audience ?? null,
        registeredAt: doc.registeredAt?.toISOString() ?? null,
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
    };
}

export const viewerRoutes: FastifyPluginAsync = async (fastify) => {
    fastify.post('/viewers', async (request, reply) => {
        const parsed = createViewerSchema.safeParse(request.body);

        if (!parsed.success) {
            reply.status(400);
            return { errors: parsed.error.flatten() };
        }

        request.log.info({ payload: parsed.data }, '[wallet] registration payload received');

        try {
            const { registeredAt, provider, audience, ...rest } = parsed.data;
            const registeredAtDate = registeredAt ? new Date(registeredAt) : undefined;
            const providerValue = provider ?? 'twitch';

            const wallet = await upsertZkLoginWallet({
                walletAddress: rest.walletAddress,
                provider: providerValue,
                twitchUserId: rest.twitchId,
                audience,
                registeredAt: registeredAtDate,
            });
            request.log.info({ wallet }, '[wallet] zklogin wallet upserted');

            return serializeWallet(wallet);
        } catch (error) {
            request.log.error({ err: error }, 'Failed to upsert zklogin wallet');
            reply.status(500);
            return {
                error: 'internal_error',
                message: 'Failed to process wallet registration request',
            };
        }
    });

    fastify.get('/viewers/:twitchId', async (request, reply) => {
        const parsed = getViewerParamsSchema.safeParse(request.params);

        if (!parsed.success) {
            reply.status(400);
            return { errors: parsed.error.flatten() };
        }

        const wallet = await findWalletByTwitchUserId(parsed.data.twitchId);
        if (!wallet) {
            reply.status(404);
            return { error: 'not_found', message: 'Wallet not found' };
        }

        return serializeWallet(wallet);
    });
};
