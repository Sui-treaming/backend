import { getSaltCollection, type ViewerSaltDocument } from '../db/mongo.js';
import { randomBytes } from 'crypto';

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

  if (!result || !result.value) {
    // Some driver versions may not return the document reliably; fetch explicitly as a fallback.
    const fallback = await collection.findOne({ twitchId });
    if (!fallback) {
      throw new Error('Failed to upsert salt');
    }
    return fallback as ViewerSaltDocument;
  }

  return result.value as ViewerSaltDocument;
}

export async function findSaltByTwitchId(twitchId: string) {
  return getSaltCollection().findOne({ twitchId });
}

// BN254 scalar field modulus (Fr)
const FIELD_MODULUS_BN254 = BigInt(
  '21888242871839275222246405745257275088548364400416034343698204186575808495617',
);

export function generateSaltDecimal(byteLength = 32): string {
  if (byteLength <= 0) throw new Error('byteLength must be > 0');
  const buf = randomBytes(byteLength);
  // Map random 256-bit value uniformly into the field [1, p-1]
  const r = BigInt('0x' + buf.toString('hex')) % FIELD_MODULUS_BN254;
  const n = r === 0n ? 1n : r; // avoid zero
  return n.toString(10);
}

export function isValidSaltInFieldDecimal(salt: string): boolean {
  try {
    const n = BigInt(salt);
    return n > 0n && n < FIELD_MODULUS_BN254;
  } catch {
    return false;
  }
}

export async function ensureSalt(twitchId: string): Promise<{ doc: ViewerSaltDocument; created: boolean }> {
  const existing = await findSaltByTwitchId(twitchId);
  if (existing && isValidSaltInFieldDecimal(existing.salt)) {
    return { doc: existing, created: false };
  }
  const salt = generateSaltDecimal(32);
  const created = await upsertSalt({ twitchId, salt });
  return { doc: created, created: !existing };
}

export async function verifySalt(twitchId: string, salt: string): Promise<boolean> {
  const record = await findSaltByTwitchId(twitchId);
  return !!record && record.salt === salt;
}
