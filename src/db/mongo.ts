import { MongoClient, Db } from 'mongodb';
import { env } from '../env.js';

let client: MongoClient | null = null;
let viewerDb: Db | null = null;
let saltDb: Db | null = null;
let indexesEnsured = false;

function ensureInitialized<T>(value: T | null, message: string): T {
  if (!value) {
    throw new Error(message);
  }
  return value;
}

export async function connectMongo() {
  if (!client) {
    client = new MongoClient(env.MONGODB_URI);
    await client.connect();

    viewerDb = client.db(env.MONGODB_DB_NAME);
    saltDb = client.db(env.MONGODB_SALT_DB_NAME ?? env.MONGODB_DB_NAME);
  }

  if (!indexesEnsured) {
    const viewers = getViewerCollection();
    const salts = getSaltCollection();

    await Promise.all([
      viewers.createIndex({ twitchId: 1 }, { unique: true, name: 'uniq_twitch_id' }),
      viewers.createIndex({ walletAddress: 1 }, { unique: true, name: 'uniq_wallet_address' }),
      salts.createIndex({ twitchId: 1 }, { unique: true, name: 'uniq_salt_twitch_id' }),
    ]);

    indexesEnsured = true;
  }

  return {
    client: ensureInitialized(client, 'Mongo client not initialized'),
    viewerDb: getViewerDb(),
    saltDb: getSaltDb(),
  };
}

export function getViewerDb(): Db {
  return ensureInitialized(viewerDb, 'MongoDB connection not initialized. Call connectMongo() first.');
}

export function getSaltDb(): Db {
  return ensureInitialized(saltDb, 'MongoDB connection not initialized. Call connectMongo() first.');
}

export function getViewerCollection<T = ViewerDocument>() {
  return getViewerDb().collection<T>('viewers');
}

export function getSaltCollection<T = ViewerSaltDocument>() {
  return getSaltDb().collection<T>('viewerSalts');
}

export async function closeMongo() {
  if (client) {
    await client.close();
  }
  client = null;
  viewerDb = null;
  saltDb = null;
  indexesEnsured = false;
}

export type ViewerDocument = {
  twitchId: string;
  walletAddress: string;
  displayName?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type ViewerSaltDocument = {
  twitchId: string;
  salt: string;
  createdAt: Date;
  updatedAt: Date;
};
