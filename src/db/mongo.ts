import { MongoClient, Db, type Collection, type Document } from 'mongodb';
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
        console.info('[mongo] 연결 시도 중...');
        client = new MongoClient(env.MONGODB_URI);
        await client.connect();

        viewerDb = client.db(env.MONGODB_DB_NAME);
        saltDb = client.db(env.MONGODB_SALT_DB_NAME ?? env.MONGODB_DB_NAME);
        console.info('[mongo] MongoDB 접속 완료.');
    }

    if (!indexesEnsured) {
        console.info('[mongo] 인덱스 초기화 진행...');
        const viewers = getViewerCollection();
        const salts = getSaltCollection();
        const wallets = getWalletCollection();

        await Promise.all([
            viewers.createIndex({ twitchId: 1 }, { unique: true, name: 'uniq_twitch_id' }),
            viewers.createIndex({ walletAddress: 1 }, { unique: true, name: 'uniq_wallet_address' }),
            salts.createIndex({ twitchId: 1 }, { unique: true, name: 'uniq_salt_twitch_id' }),
            wallets.createIndex({ walletAddress: 1 }, { unique: true, name: 'uniq_wallet_walletAddress' }),
            wallets.createIndex({ twitchUserId: 1 }, { unique: false, name: 'idx_wallet_twitchUserId' }),
        ]);

        indexesEnsured = true;
        console.info('[mongo] 인덱스 준비 완료.');
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

export function getViewerCollection<T extends Document = ViewerDocument>(): Collection<T> {
    return getViewerDb().collection<T>('viewers');
}

export function getSaltCollection<T extends Document = ViewerSaltDocument>(): Collection<T> {
    return getSaltDb().collection<T>('viewerSalts');
}

export function getWalletCollection<T extends Document = ZkLoginWalletDocument>(): Collection<T> {
    return getViewerDb().collection<T>('zklogin_wallet');
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

export interface ViewerDocument extends Document {
    twitchId: string;
    walletAddress: string;
    provider?: string;
    audience?: string;
    registeredAt?: Date;
    displayName?: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface ViewerSaltDocument extends Document {
    twitchId: string;
    salt: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface ZkLoginWalletDocument extends Document {
    walletAddress: string;
    provider: string;
    twitchUserId: string;
    audience?: string;
    registeredAt: Date;
    createdAt: Date;
    updatedAt: Date;
}
