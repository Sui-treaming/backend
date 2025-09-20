import { ObjectId } from 'mongodb';
import { getStreamerAssetCollection, type StreamerAssetDocument } from '../db/mongo.js';

export type StreamerAssetCreateInput = {
    streamerId: string;
    filePath: string;
    storagePath: string;
    originalFilename?: string;
    contentType?: string;
    fileSize?: number;
};

export async function createStreamerAsset(input: StreamerAssetCreateInput): Promise<StreamerAssetDocument> {
    const collection = getStreamerAssetCollection();
    const now = new Date();
    const doc: Omit<StreamerAssetDocument, '_id'> = {
        streamerId: input.streamerId,
        filePath: input.filePath,
        storagePath: input.storagePath,
        originalFilename: input.originalFilename,
        contentType: input.contentType,
        fileSize: input.fileSize,
        createdAt: now,
        updatedAt: now,
    };
    const result = await collection.insertOne(doc as StreamerAssetDocument);
    return {
        ...(doc as StreamerAssetDocument),
        _id: result.insertedId,
    } as StreamerAssetDocument;
}

export async function findStreamerAssetById(id: string) {
    const collection = getStreamerAssetCollection();
    return collection.findOne({ _id: new ObjectId(id) });
}

export async function listStreamerAssetsByStreamer(streamerId: string) {
    return getStreamerAssetCollection().find({ streamerId }).sort({ createdAt: -1 }).toArray();
}

export async function findLatestStreamerAsset(streamerId: string) {
    return getStreamerAssetCollection().find({ streamerId }).sort({ createdAt: -1 }).limit(1).next();
}
