import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { Transaction } from '@mysten/sui/transactions';
import { getServerKeypair, suiClient } from '../sui.js';

const requestSchema = z.object({
  recipient: z.string().min(3, 'recipient address required'),
  amount: z.union([
    z.string(),
    z.number(),
    z.bigint(),
  ]),
});

export const transactionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/transactions/transfer', async (request, reply) => {
    const parsed = requestSchema.safeParse(request.body);

    if (!parsed.success) {
      reply.status(400);
      return { errors: parsed.error.flatten() };
    }

    const { recipient, amount } = parsed.data;

    const amountAsBigInt = typeof amount === 'bigint' ? amount : BigInt(amount);

    const tx = new Transaction();
    const splitCoin = tx.splitCoins(tx.gas, [tx.pure.u64(amountAsBigInt)]);
    tx.transferObjects([splitCoin], tx.pure.address(recipient));

    const signer = getServerKeypair();
    const executionResult = await suiClient.signAndExecuteTransactionBlock({
      signer,
      transaction: tx,
      options: { showEffects: true, showEvents: true },
      requestType: 'WaitForLocalExecution',
    });

    return {
      digest: executionResult.digest,
      confirmedLocalExecution: executionResult.confirmedLocalExecution,
      effects: executionResult.effects,
      events: executionResult.events,
    };
  });
};
