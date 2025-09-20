import { Transaction } from '@mysten/sui/transactions';
import { getServerKeypair, suiClient } from '../sui.js';

const UPSUIDER_PACKAGE_ID = '0x23ff897d65d1d6bb3b7ec5c428cd219514955c2939cdc0e6c022610c3e844da1';
const UPSUIDER_MODULE_NAME = 'upsuider_contract';
const UPSUIDER_MINT_FUNCTION = 'mint';

export type UpsuiderMintMetadata = {
  name: string;
  description: string;
  imageUrl: string;
};

export async function mintUpsuiderNft(
  recipientAddress: string,
  metadata: UpsuiderMintMetadata,
) {
  const tx = new Transaction();
  tx.moveCall({
    target: `${UPSUIDER_PACKAGE_ID}::${UPSUIDER_MODULE_NAME}::${UPSUIDER_MINT_FUNCTION}`,
    arguments: [
      tx.pure.string(metadata.name),
      tx.pure.string(metadata.description),
      tx.pure.string(metadata.imageUrl),
      tx.pure.address(recipientAddress),
    ],
  });

  const signer = getServerKeypair();

  return suiClient.signAndExecuteTransaction({
    signer,
    transaction: tx,
    options: {
      showEffects: true,
      showEvents: true,
    },
  });
}
