import { getSaltCollection, type ViewerSaltDocument } from '../db/mongo.js';

export type SaltUpsertInput = {
  twitchId: string;
  salt: string;
};

export async function upsertSalt({ twitchId, salt }: SaltUpsertInput): Promise<ViewerSaltDocument> {
  const collection = getSaltCollection();
  const now = new Date();

  const result = await collection.findOneAndUpdate(
    { twitchId },
    {
      $set: {
        salt,
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

  if (!result.value) {
    throw new Error('Failed to upsert salt');
  }

  return result.value;
}

export async function findSaltByTwitchId(twitchId: string) {
  return getSaltCollection().findOne({ twitchId });
}
