import { Transaction } from '@mysten/sui/transactions';
import { env } from '../env.js';
import { getServerKeypair, suiClient } from '../sui.js';

const DEFAULT_PACKAGE_ID = '0x3b7f9f57d3aed790dda61608800ab973699a27fdc45086226267cf335cca4a14';
const DEFAULT_MODULE = 'my_coin';
const DEFAULT_FUNCTION = 'mint';
const DEFAULT_AIRDROP_AMOUNT = 1_000n;

export async function mintUpsuiderCoin(recipientAddress: string) {
  const packageId = env.UPSUIDER_COIN_PACKAGE_ID ?? DEFAULT_PACKAGE_ID;
  const moduleName = env.UPSUIDER_COIN_MODULE ?? DEFAULT_MODULE;
  const functionName = env.UPSUIDER_COIN_MINT_FUNCTION ?? DEFAULT_FUNCTION;
  const treasuryCapId = env.UPSUIDER_COIN_TREASURY_CAP_ID;

  if (!treasuryCapId) {
    throw new Error('UPSUIDER_COIN_TREASURY_CAP_ID is required for coin minting');
  }

  const amount = env.UPSUIDER_COIN_AIRDROP_AMOUNT
    ? BigInt(env.UPSUIDER_COIN_AIRDROP_AMOUNT)
    : DEFAULT_AIRDROP_AMOUNT;

  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::${moduleName}::${functionName}`,
    arguments: [
      tx.object(treasuryCapId),
      tx.pure.u64(amount),
      tx.pure.address(recipientAddress),
    ],
  });

  const signer = getServerKeypair();

  const response = await suiClient.signAndExecuteTransaction({
    signer,
    transaction: tx,
    options: {
      showEffects: true,
      showEvents: true,
    },
  });

  return { response, amount };
}
