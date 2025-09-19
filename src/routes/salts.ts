import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { findSaltByTwitchId, upsertSalt } from '../repositories/salts.js';
import type { ViewerSaltDocument } from '../db/mongo.js';

const upsertSaltSchema = z.object({
  twitchId: z.string().min(1, 'twitchId is required'),
  salt: z.string().min(1, 'salt is required'),
});

const getSaltParamsSchema = z.object({
  twitchId: z.string().min(1),
});

function serializeSalt(doc: ViewerSaltDocument) {
  return {
    twitchId: doc.twitchId,
    salt: doc.salt,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export const saltRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/salts', async (request, reply) => {
    const parsed = upsertSaltSchema.safeParse(request.body);

    if (!parsed.success) {
      reply.status(400);
      return { errors: parsed.error.flatten() };
    }

    const record = await upsertSalt(parsed.data);
    return serializeSalt(record);
  });

  fastify.get('/salts/:twitchId', async (request, reply) => {
    const parsed = getSaltParamsSchema.safeParse(request.params);

    if (!parsed.success) {
      reply.status(400);
      return { errors: parsed.error.flatten() };
    }

    const record = await findSaltByTwitchId(parsed.data.twitchId);
    if (!record) {
      reply.status(404);
      return { error: 'not_found', message: 'Salt not found' };
    }

    return serializeSalt(record);
  });
};
