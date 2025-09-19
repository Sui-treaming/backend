import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { findSaltByTwitchId, upsertSalt, ensureSalt, verifySalt, isValidSaltInFieldDecimal, generateSaltDecimal } from '../repositories/salts.js';
import type { ViewerSaltDocument } from '../db/mongo.js';

const upsertSaltSchema = z.object({
  twitchId: z.string().min(1, 'twitchId is required'),
  salt: z.string().min(1, 'salt is required'),
});

const getSaltParamsSchema = z.object({
  twitchId: z.string().min(1),
});

const ensureSaltBodySchema = z.object({
  jwt: z.string().min(10, 'jwt is required'),
});

function decodeJwtSub(jwt: string): string | null {
  const parts = jwt.split('.');
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) as { sub?: string };
    return typeof payload.sub === 'string' && payload.sub.length > 0 ? payload.sub : null;
  } catch {
    return null;
  }
}

function serializeSalt(doc: ViewerSaltDocument) {
  return {
    twitchId: doc.twitchId,
    salt: doc.salt,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export const saltRoutes: FastifyPluginAsync = async (fastify) => {
  // Create or update explicitly with provided salt (legacy behavior)
  fastify.post('/salts', async (request, reply) => {
    const parsed = upsertSaltSchema.safeParse(request.body);

    if (!parsed.success) {
      reply.status(400);
      return { errors: parsed.error.flatten() };
    }

    if (!isValidSaltInFieldDecimal(parsed.data.salt)) {
      reply.status(400);
      return { error: 'invalid_salt', message: 'Salt must be in BN254 field range' };
    }

    // Upsert without returning salt to the client (avoid leakage)
    const exists = await findSaltByTwitchId(parsed.data.twitchId);
    await upsertSalt(parsed.data);
    reply.status(exists ? 200 : 201);
    return { ok: true };
  });

  // Ensure a salt exists for the subject contained in a Twitch JWT.
  // Returns only the salt value (no metadata) to avoid leaking.
  fastify.post('/salts/ensure', async (request, reply) => {
    const parsed = ensureSaltBodySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400);
      return { errors: parsed.error.flatten() };
    }
    const sub = decodeJwtSub(parsed.data.jwt);
    if (!sub) {
      reply.status(400);
      return { error: 'invalid_jwt', message: 'Unable to extract subject from JWT' };
    }

    const { doc, created } = await ensureSalt(sub);
    reply.status(created ? 201 : 200);
    return { salt: doc.salt };
  });

  // Do not leak salts via GET. Only indicate existence.
  fastify.get('/salts/:twitchId', async (request, reply) => {
    const parsed = getSaltParamsSchema.safeParse(request.params);

    if (!parsed.success) {
      reply.status(400);
      return { errors: parsed.error.flatten() };
    }

    const record = await findSaltByTwitchId(parsed.data.twitchId);
    if (!record) {
      reply.status(404);
      return { error: 'not_found' };
    }
    return { exists: true };
  });

  // Verify if provided salt matches stored value
  fastify.post('/salts/verify', async (request, reply) => {
    const schema = z.object({ twitchId: z.string().min(1), salt: z.string().min(1) });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400);
      return { errors: parsed.error.flatten() };
    }
    const ok = await verifySalt(parsed.data.twitchId, parsed.data.salt);
    return { valid: ok };
  });
};
