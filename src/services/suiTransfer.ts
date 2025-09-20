import { Transaction } from '@mysten/sui/transactions';
import { getServerKeypair, suiClient } from '../sui.js';

const MICRO_TRANSFER_AMOUNT_MIST = 100n; // 0.0000001 SUI

export async function sendMicroTransfer(recipientAddress: string) {
  const tx = new Transaction();
  const [microCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(MICRO_TRANSFER_AMOUNT_MIST)]);
  tx.transferObjects([microCoin], tx.pure.address(recipientAddress));

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
