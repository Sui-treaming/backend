import Fastify, { FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { env } from './env.js';
import { connectMongo, closeMongo } from './db/mongo.js';
import { transactionRoutes } from './routes/transactions.js';
import { viewerRoutes } from './routes/viewers.js';
import { saltRoutes } from './routes/salts.js';
import { walrusRoutes } from './routes/walrus.js';
import { eventSubRoutes } from './routes/eventsub.js';
import { ensureUploadDir, uploadStaticPrefix } from './storage/localUploads.js';

export async function buildServer(options: FastifyServerOptions = {}) {
    const app = Fastify({
        logger: true,
        bodyLimit: 50 * 1024 * 1024,
        ...options,
    });

    await connectMongo();

    await app.register(cors, {
        origin: env.ALLOW_ORIGIN ?? true,
        credentials: true,
    });

    const uploadDir = await ensureUploadDir();
    await app.register(fastifyStatic, {
        root: uploadDir,
        prefix: `${uploadStaticPrefix}/`,
        decorateReply: false,
        list: false,
        index: false,
        setHeaders(res) {
            res.setHeader('Cache-Control', 'public, max-age=86400');
        },
    });

    app.get('/health', async () => ({ status: 'ok' }));
    app.get('/', async () => ({ status: '돈 벌자' }));


    await app.register(transactionRoutes, { prefix: '/api' });
    await app.register(viewerRoutes, { prefix: '/api' });
    await app.register(saltRoutes, { prefix: '/api' });
    await app.register(walrusRoutes, { prefix: '/api' });
    await app.register(eventSubRoutes, { prefix: '/eventsub' });

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
        console.info(`[server] Fastify listening on http://127.0.0.1:${env.PORT}`);
    } catch (error) {
        app.log.error(error);
        (globalThis as { process?: { exit(code?: number): never } }).process?.exit(1);
    }
}

const nodeEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.NODE_ENV;

if (nodeEnv !== 'test') {
    bootstrap();
}
