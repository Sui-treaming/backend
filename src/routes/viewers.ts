import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { upsertViewer, findViewerByTwitchId, ViewerConflictError } from '../repositories/viewers.js';
import type { ViewerDocument } from '../db/mongo.js';

const createViewerSchema = z.object({
  twitchId: z.string().min(1, 'twitchId is required'),
  walletAddress: z.string().min(3, 'walletAddress is required'),
  displayName: z.string().min(1).optional(),
});

const getViewerParamsSchema = z.object({
  twitchId: z.string().min(1),
});

function serializeViewer(viewer: ViewerDocument) {
  return {
    twitchId: viewer.twitchId,
    walletAddress: viewer.walletAddress,
    displayName: viewer.displayName ?? null,
    createdAt: viewer.createdAt.toISOString(),
    updatedAt: viewer.updatedAt.toISOString(),
  };
}

export const viewerRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/viewers', async (request, reply) => {
    const parsed = createViewerSchema.safeParse(request.body);

    if (!parsed.success) {
      reply.status(400);
      return { errors: parsed.error.flatten() };
    }

    try {
      const viewer = await upsertViewer(parsed.data);
      return serializeViewer(viewer);
    } catch (error) {
      if (error instanceof ViewerConflictError) {
        reply.status(409);
        return {
          error: 'conflict',
          message: error.message,
        };
      }

      request.log.error({ err: error }, 'Failed to upsert viewer');
      reply.status(500);
      return {
        error: 'internal_error',
        message: 'Failed to process viewer link request',
      };
    }
  });

  fastify.get('/viewers/:twitchId', async (request, reply) => {
    const parsed = getViewerParamsSchema.safeParse(request.params);

    if (!parsed.success) {
      reply.status(400);
      return { errors: parsed.error.flatten() };
    }

    const viewer = await findViewerByTwitchId(parsed.data.twitchId);
    if (!viewer) {
      reply.status(404);
      return { error: 'not_found', message: 'Viewer not found' };
    }

    return serializeViewer(viewer);
  });
};
