import Fastify, { FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import { env } from './env.js';
import { connectMongo, closeMongo } from './db/mongo.js';
import { transactionRoutes } from './routes/transactions.js';
import { viewerRoutes } from './routes/viewers.js';
import { saltRoutes } from './routes/salts.js';

export async function buildServer(options: FastifyServerOptions = {}) {
  const app = Fastify({
    logger: true,
    ...options,
  });

  await connectMongo();

  await app.register(cors, {
    origin: env.ALLOW_ORIGIN ?? true,
    credentials: true,
  });

  app.get('/health', async () => ({ status: 'ok' }));

  await app.register(transactionRoutes, { prefix: '/api' });
  await app.register(viewerRoutes, { prefix: '/api' });
  await app.register(saltRoutes, { prefix: '/api' });

  app.addHook('onClose', async () => {
    await closeMongo();
  });

  return app;
}

async function bootstrap() {
  const app = await buildServer();

  try {
    await app.listen({
      port: env.PORT,
      host: '0.0.0.0',
    });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test') {
  bootstrap();
}
