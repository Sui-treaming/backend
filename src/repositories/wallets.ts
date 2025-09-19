import { getWalletCollection, type ZkLoginWalletDocument } from '../db/mongo.js';

export type WalletUpsertInput = {
    walletAddress: string;
    provider: string;
    twitchUserId: string;
    audience?: string;
    registeredAt?: Date;
};

export async function upsertZkLoginWallet(input: WalletUpsertInput): Promise<ZkLoginWalletDocument> {
    const collection = getWalletCollection();
    const now = new Date();
    const registeredAt = input.registeredAt ?? now;

    const result = await collection.findOneAndUpdate(
        { walletAddress: input.walletAddress },
        {
            $set: {
                provider: input.provider,
                twitchUserId: input.twitchUserId,
                audience: input.audience,
                registeredAt,
                updatedAt: now,
            },
            $setOnInsert: {
                createdAt: now,
            },
        },
        {
            upsert: true,
            returnDocument: 'after',
        },
    );

    if (!result || !result.value) {
        const fallback = await collection.findOne({ walletAddress: input.walletAddress });
        if (!fallback) {
            throw new Error('Failed to upsert zklogin wallet record');
        }
        return fallback;
    }

    return result.value;
}

export async function findWalletByTwitchUserId(twitchUserId: string) {
    return getWalletCollection().findOne({ twitchUserId });
}

export async function findWalletByAddress(walletAddress: string) {
    return getWalletCollection().findOne({ walletAddress });
}
