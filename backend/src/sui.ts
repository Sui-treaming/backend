import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { env } from './env.js';

const suiClient = new SuiClient({ url: env.SUI_FULLNODE_URL });

let cachedKeypair: Ed25519Keypair | null = null;

function getServerKeypair(): Ed25519Keypair {
  if (!env.SUI_KEYPAIR) {
    throw new Error('SUI_KEYPAIR env var required for server-side signing');
  }

  if (!cachedKeypair) {
    const { secretKey } = decodeSuiPrivateKey(env.SUI_KEYPAIR);
    cachedKeypair = Ed25519Keypair.fromSecretKey(secretKey);
  }

  return cachedKeypair;
}

export { suiClient, getServerKeypair };
