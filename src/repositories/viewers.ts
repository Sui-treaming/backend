import { Filter, FindOneAndUpdateOptions } from 'mongodb';
import { getViewerCollection, type ViewerDocument } from '../db/mongo.js';

export type ViewerUpsertInput = {
  twitchId: string;
  walletAddress: string;
  displayName?: string;
};

export class ViewerConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ViewerConflictError';
  }
}

export async function upsertViewer(input: ViewerUpsertInput): Promise<ViewerDocument> {
  const collection = getViewerCollection();
  const now = new Date();

  const filter: Filter<ViewerDocument> = { twitchId: input.twitchId };

  const update: Partial<ViewerDocument> & {
    $setOnInsert?: Partial<ViewerDocument>;
  } = {
    walletAddress: input.walletAddress,
    displayName: input.displayName,
    updatedAt: now,
  };

  const options: FindOneAndUpdateOptions = {
    upsert: true,
    returnDocument: 'after',
    ignoreUndefined: true,
  };

  try {
    const result = await collection.findOneAndUpdate(
      filter,
      {
        $set: update,
        $setOnInsert: {
          createdAt: now,
        },
      },
      options,
    );

    if (!result.value) {
      throw new Error('Failed to upsert viewer record');
    }

    return result.value;
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new ViewerConflictError('Wallet address already linked to another viewer');
    }
    throw error;
  }
}

export async function findViewerByTwitchId(twitchId: string) {
  return getViewerCollection().findOne({ twitchId });
}

export async function findViewerByWallet(walletAddress: string) {
  return getViewerCollection().findOne({ walletAddress });
}

function isDuplicateKeyError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  // MongoServerError codes 11000/11001 signal duplicate key
  return 'code' in error && (error as { code: number }).code === 11000;
}
