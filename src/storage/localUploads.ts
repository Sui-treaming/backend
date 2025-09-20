import { promises as fs } from 'node:fs';
import { resolve, join } from 'node:path';
import { env } from '../env.js';

const STATIC_PREFIX = '/uploads';
let cachedAbsoluteDir: string | null = null;

export const uploadStaticPrefix = STATIC_PREFIX;

export async function ensureUploadDir(): Promise<string> {
    if (!cachedAbsoluteDir) {
        const configured = env.LOCAL_UPLOAD_DIR;
        const absolute = configured.startsWith('/') ? configured : resolve(process.cwd(), configured);
        await fs.mkdir(absolute, { recursive: true });
        cachedAbsoluteDir = absolute;
    }
    return cachedAbsoluteDir;
}

export async function resolveDiskPath(fileName: string): Promise<string> {
    const root = await ensureUploadDir();
    return join(root, fileName);
}

export function buildPublicPath(fileName: string): string {
    const cleaned = fileName.replace(/^\/+/, '');
    return `${STATIC_PREFIX}/${cleaned}`.replace(/\/+/g, '/');
}

export function buildPublicUrl(filePath: string, origin?: string): string {
    const sanitizedPath = filePath.startsWith('/') ? filePath : `/${filePath}`;
    const configuredBase = env.ASSET_PUBLIC_BASE_URL?.replace(/\/$/, '');
    if (configuredBase) {
        return `${configuredBase}${sanitizedPath}`;
    }
    if (origin) {
        const normalizedOrigin = origin.replace(/\/$/, '');
        return `${normalizedOrigin}${sanitizedPath}`;
    }
    return sanitizedPath;
}
