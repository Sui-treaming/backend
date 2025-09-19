import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { env } from '../env.js';

// Defaults are kept for parity with test_walrus version, but you should use env.SUI_KEYPAIR in production.
export const RPC = env.SUI_FULLNODE_URL;
export const PACKAGE_ID = (globalThis as any).process?.env?.SUI_PACKAGE_ID ?? '0x14963dc8cad863a2c8f5a9b864feb3b9655302a608a591921b5023b564b96ec6';
export const MODULE = (globalThis as any).process?.env?.SUI_MODULE_NAME ?? 'upsuider_contract';

function getKeypair(): Ed25519Keypair {
  const raw = String(env.SUI_KEYPAIR || (globalThis as any).process?.env?.SUI_SECRET_KEY || '').trim();
  if (!raw) throw new Error('Missing SUI secret key');
  const { schema, secretKey } = decodeSuiPrivateKey(raw);
  if ((schema as unknown as string) !== 'ed25519') throw new Error(`Unsupported key schema: ${String(schema)}`);
  return Ed25519Keypair.fromSecretKey(secretKey);
}

function getClient(): SuiClient {
  return new SuiClient({ url: RPC });
}

type ArgSpec = { object?: string; pure?: unknown } | unknown;

function toPure(v: unknown): unknown {
  if (typeof v === 'string' && /^-?\d+$/.test(v)) return BigInt(v);
  if (typeof v === 'number') return BigInt(v);
  return v;
}

function buildInputs(txb: Transaction, spec: ArgSpec[]) {
  return spec.map((a) => {
    if (a && typeof a === 'object' && 'object' in (a as any)) return txb.object(String((a as any).object));
    if (a && typeof a === 'object' && 'pure' in (a as any)) return (txb.pure as any)(toPure((a as any).pure as unknown));
    return (txb.pure as any)(toPure(a));
  });
}

export async function callMove(func: string, typeArgs: string[] = [], argsSpec: ArgSpec[] = [], gasBudget = 20_000_000) {
  const signer = getKeypair();
  const client = getClient();
  const tx = new Transaction();
  const target = `${PACKAGE_ID}::${MODULE}::${func}`;
  const inputs = buildInputs(tx, argsSpec);
  tx.moveCall({ target, typeArguments: typeArgs, arguments: inputs });
  tx.setGasBudget(gasBudget);

  const signAndExecute = (client as any).signAndExecuteTransaction ?? (client as any).signAndExecuteTransactionBlock;
  if (!signAndExecute) throw new Error('SuiClient does not support signAndExecuteTransaction');
  const result = await signAndExecute.call(client, {
    signer,
    transaction: tx,
    options: { showEffects: true },
    requestType: 'WaitForLocalExecution',
  });
  return result;
}

// register_templates(names, descriptions, image_urls, walrus_cids)
export async function registerTemplates(
  names: string[],
  descriptions: string[],
  imageUrls: string[],
  walrusCids: string[],
  gasBudget?: number,
) {
  return callMove('register_templates', [], [
    { pure: names },
    { pure: descriptions },
    { pure: imageUrls },
    { pure: walrusCids },
  ], gasBudget);
}

// mint(collection_id, template_id, provided_name, provided_description, provided_image_url, provided_walrus_cid, recipient)
export async function mint(
  collectionId: string,
  templateId: string | number,
  name: string,
  description: string,
  imageUrl: string,
  walrusCid: string,
  recipient: string,
  gasBudget?: number,
) {
  return callMove('mint', [], [
    { object: collectionId },
    { pure: String(templateId) },
    { pure: String(name) },
    { pure: String(description) },
    { pure: String(imageUrl) },
    { pure: String(walrusCid) },
    { pure: String(recipient) },
  ], gasBudget);
}

// transfer_nft(nft_object_id, recipient)
export async function transferNft(nftObjectId: string, recipient: string, gasBudget?: number) {
  return callMove('transfer_nft', [], [
    { object: nftObjectId },
    { pure: String(recipient) },
  ], gasBudget);
}
