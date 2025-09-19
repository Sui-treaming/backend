import type { FastifyPluginAsync } from 'fastify';
import { env } from '../env.js';
import { request as httpRequestNode } from 'node:http';
import { request as httpsRequestNode } from 'node:https';
import { URL } from 'node:url';

const DEFAULT_POLL_ATTEMPTS = 20;
const DEFAULT_POLL_DELAY_MS = 2000;

function extractIdentifiers(response: any) {
  const blobIdFromNew = response?.newlyCreated?.blobObject?.blobId;
  const blobIdFromAlready = response?.alreadyCertified?.blobId;
  const objectIdFromNew = response?.newlyCreated?.blobObject?.id;
  const objectIdFromAlready = response?.alreadyCertified?.blobObjectId || response?.alreadyCertified?.objectId;
  return {
    blobId: blobIdFromNew || blobIdFromAlready || undefined,
    objectId: objectIdFromNew || objectIdFromAlready || undefined,
  } as { blobId?: string; objectId?: string };
}

function httpRequest(method: string, targetUrl: string | URL, body?: Buffer, headers: Record<string, string> = {}) {
  const url = typeof targetUrl === 'string' ? new URL(targetUrl) : targetUrl;
  const isHttps = url.protocol === 'https:';
  const transport = isHttps ? httpsRequestNode : httpRequestNode;
  const options = {
    method,
    hostname: url.hostname,
    port: url.port ? Number(url.port) : (isHttps ? 443 : 80),
    path: `${url.pathname}${url.search}`,
    headers,
  };
  return new Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: Buffer }>((resolve, reject) => {
    const req = transport(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        resolve({ status: res.statusCode || 0, headers: res.headers as any, body: Buffer.concat(chunks) });
      });
    });
    req.on('error', reject);
    if (body && body.length > 0) req.write(body);
    req.end();
  });
}

async function storeBufferPng(bytes: Buffer) {
  const url = new URL('/v1/blobs', env.WALRUS_PUBLISHER_URL);
  const res = await httpRequest('PUT', url, bytes, {
    'content-type': 'image/png',
    'content-length': String(bytes.length),
  });
  if (res.status < 200 || res.status >= 300) {
    const text = res.body.toString('utf-8');
    throw new Error(`Walrus publisher error HTTP ${res.status}: ${text}`);
  }
  const json = JSON.parse(res.body.toString('utf-8')) as any;
  const { blobId, objectId } = extractIdentifiers(json);
  return { responseJson: json, blobId, objectId } as { responseJson: any; blobId?: string; objectId?: string };
}

async function fetchBlobById(blobId: string) {
  const url = new URL(`/v1/blobs/${encodeURIComponent(blobId)}`, env.WALRUS_AGGREGATOR_URL);
  return httpRequest('GET', url);
}

async function fetchBlobByObjectId(objectId: string) {
  const url = new URL(`/v1/blobs/by-object-id/${encodeURIComponent(objectId)}`, env.WALRUS_AGGREGATOR_URL);
  return httpRequest('GET', url);
}

async function pollForBlob(blobId?: string, objectId?: string, attempts = DEFAULT_POLL_ATTEMPTS, delayMs = DEFAULT_POLL_DELAY_MS) {
  for (let i = 1; i <= attempts; i++) {
    if (blobId) {
      const res = await fetchBlobById(blobId);
      if (res.status === 200) return;
    }
    if (objectId) {
      const res = await fetchBlobByObjectId(objectId);
      if (res.status === 200) return;
    }
    if (i < attempts) await new Promise(r => setTimeout(r, delayMs));
  }
  throw new Error(`Timed out waiting for blob availability after ${attempts} attempts.`);
}

// Minimal multipart/form-data parsing (derived from test_walrus)
function parseMultipart(buffer: Buffer, boundary: string) {
  const s = buffer.toString('latin1');
  const B = `--${boundary}`;
  const CRLF = '\r\n';

  let idx = s.indexOf(B);
  if (idx === -1) {
    idx = s.indexOf(CRLF + B);
    if (idx === -1) throw new Error('Boundary not found');
    idx += CRLF.length;
  }

  const parts: Array<{ headers: Record<string, string>; data: Buffer; disposition?: { name?: string; filename?: string } }> = [];
  let pos = idx + B.length + CRLF.length;
  while (pos < s.length) {
    if (s.substr(pos - CRLF.length, CRLF.length + B.length + 2) === CRLF + B + '--') break;
    const headerEnd = s.indexOf(CRLF + CRLF, pos);
    if (headerEnd === -1) break;
    const headerText = s.substring(pos, headerEnd);
    const headers: Record<string, string> = {};
    for (const line of headerText.split(CRLF)) {
      const i = line.indexOf(':');
      if (i > -1) {
        const k = line.substring(0, i).trim().toLowerCase();
        const v = line.substring(i + 1).trim();
        headers[k] = v;
      }
    }
    let disposition: { name?: string; filename?: string } = {};
    const cd = headers['content-disposition'] || '';
    if (cd) {
      const nameMatch = /name="?([^";]+)"?/i.exec(cd);
      const fileMatch = /filename="?([^";]+)"?/i.exec(cd);
      disposition = { name: nameMatch?.[1], filename: fileMatch?.[1] };
    }
    const contentStart = headerEnd + (CRLF + CRLF).length;
    const nextNormal = s.indexOf(CRLF + B + CRLF, contentStart);
    const nextClosing = s.indexOf(CRLF + B + '--', contentStart);
    let partEnd: number; let nextBoundaryStart: number;
    if (nextNormal === -1 && nextClosing === -1) {
      partEnd = s.length; nextBoundaryStart = -1;
    } else if (nextClosing !== -1 && (nextNormal === -1 || nextClosing < nextNormal)) {
      partEnd = nextClosing; nextBoundaryStart = nextClosing + CRLF.length + B.length + 2;
    } else {
      partEnd = nextNormal; nextBoundaryStart = nextNormal + CRLF.length + B.length + CRLF.length;
    }
    const data = buffer.slice(contentStart, partEnd);
    parts.push({ headers, data, disposition });
    if (nextBoundaryStart === -1) break;
    if (s.substr(nextBoundaryStart - 2, 2) === '--') break;
    pos = nextBoundaryStart;
  }
  return parts;
}

function parseMultipartRobust(buffer: Buffer, boundary: string) {
  const cleanBoundary = String(boundary || '').trim().replace(/^"|"$/g, '');
  const dashBoundary = Buffer.from(`--${cleanBoundary}`, 'latin1');
  const CRLF = Buffer.from('\r\n', 'latin1');
  const LF = Buffer.from('\n', 'latin1');
  const hasCRLF = buffer.indexOf(CRLF) !== -1;
  const EOL = hasCRLF ? CRLF : LF;

  let start = buffer.indexOf(dashBoundary);
  if (start === -1) {
    const prefixed = Buffer.concat([EOL, dashBoundary]);
    start = buffer.indexOf(prefixed);
    if (start !== -1) start += EOL.length;
  }
  if (start === -1) throw new Error('Boundary not found');
  const firstLineEnd = buffer.indexOf(EOL, start + dashBoundary.length);
  if (firstLineEnd === -1) throw new Error('Malformed multipart: no line end after boundary');
  let pos = firstLineEnd + EOL.length;

  const parts: Array<{ headers: Record<string, string>; data: Buffer; disposition?: { name?: string; filename?: string } }> = [];
  while (pos < buffer.length) {
    const headerEnd = buffer.indexOf(Buffer.concat([EOL, EOL]), pos);
    if (headerEnd === -1) break;
    const headerBuf = buffer.slice(pos, headerEnd);
    const headerStr = headerBuf.toString('utf8');
    const headerLines = headerStr.split(hasCRLF ? '\r\n' : '\n');
    const headers: Record<string, string> = {};
    for (const line of headerLines) {
      const i = line.indexOf(':');
      if (i > -1) {
        const k = line.slice(0, i).trim().toLowerCase();
        const v = line.slice(i + 1).trim();
        headers[k] = v;
      }
    }
    let disposition: { name?: string; filename?: string } = {};
    const cd = headers['content-disposition'] || '';
    if (cd) {
      const nameMatch = /name="?([^";]+)"?/i.exec(cd);
      const fileMatch = /filename="?([^";]+)"?/i.exec(cd);
      disposition = { name: nameMatch?.[1], filename: fileMatch?.[1] };
    }
    const contentStart = headerEnd + EOL.length * 2;
    const boundaryMarker = Buffer.concat([EOL, dashBoundary]);
    const nextBoundary = buffer.indexOf(boundaryMarker, contentStart);
    const partEnd = nextBoundary === -1 ? buffer.length : nextBoundary;
    const data = buffer.slice(contentStart, partEnd);
    parts.push({ headers, data, disposition });
    if (nextBoundary === -1) break;
    const after = nextBoundary + boundaryMarker.length;
    const isFinal = buffer.slice(after, after + 2).equals(Buffer.from('--', 'latin1'));
    const lineEnd = buffer.indexOf(EOL, isFinal ? after + 2 : after);
    if (lineEnd === -1) break;
    pos = lineEnd + EOL.length;
    if (isFinal) break;
  }
  return parts;
}

export const walrusRoutes: FastifyPluginAsync = async (fastify) => {
  // Parsers to get raw Buffer for these content-types
  fastify.addContentTypeParser(['image/png', 'application/octet-stream'], { parseAs: 'buffer' }, (_req, body, done) => {
    done(null, body);
  });
  fastify.addContentTypeParser('multipart/form-data', { parseAs: 'buffer' }, (_req, body, done) => {
    done(null, body);
  });

  fastify.post('/walrus/upload', async (request, reply) => {
    const contentType = String(request.headers['content-type'] || '').toLowerCase();
    const rawBody = request.body as Buffer | undefined;

    if (!rawBody || rawBody.length === 0) {
      reply.status(400);
      return { error: 'empty_body' };
    }

    if (rawBody.length > env.WALRUS_MAX_UPLOAD_BYTES) {
      reply.status(413);
      return { error: 'payload_too_large', limit: env.WALRUS_MAX_UPLOAD_BYTES };
    }

    let pngBytes: Buffer | null = null;
    if (contentType.includes('image/png') || contentType === 'application/octet-stream') {
      pngBytes = rawBody;
    } else if (contentType.includes('multipart/form-data')) {
      const match = /boundary=([^;]+)(;|$)/i.exec(contentType);
      if (!match) {
        reply.status(400);
        return { error: 'boundary_not_found' };
      }
      const boundary = match[1].replace(/^"|"$/g, '');
      try {
        const parts = parseMultipart(rawBody, boundary);
        const filePart = parts.find(p => (p.headers['content-type'] || '').includes('image/png'))
          || parts.find(p => /filename=\"?.+\.(png)\"?/i.test(p.headers['content-disposition'] || ''))
          || parts[0];
        if (filePart && filePart.data && filePart.data.length > 0) {
          pngBytes = filePart.data;
        }
      } catch (_e) {
        try {
          const parts2 = parseMultipartRobust(rawBody, boundary);
          const fp2 = parts2.find(p => (p.headers['content-type'] || '').includes('image/png'))
            || parts2.find(p => /filename=\"?.+\.(png)\"?/i.test(p.headers['content-disposition'] || ''))
            || parts2[0];
          if (fp2 && fp2.data && fp2.data.length > 0) {
            pngBytes = fp2.data;
          }
        } catch {
          // fallthrough
        }
      }
    }

    if (!pngBytes) {
      reply.status(415);
      return { error: 'unsupported_media', message: 'Send image/png or multipart/form-data with a PNG file' };
    }

    try {
      const { blobId, objectId } = await storeBufferPng(pngBytes);
      // Optional polling: true by default; disable with ?poll=false
      const pollParam = String((request.query as any)?.poll ?? 'true').toLowerCase();
      const doPoll = pollParam !== 'false' && pollParam !== '0';
      if (doPoll) {
        try { await pollForBlob(blobId, objectId); } catch (e) { request.log.warn({ err: e }, 'Aggregator poll timed out'); }
      }
      reply.header('Cache-Control', 'no-store');
      return { ok: true, blobId, objectId, publisherUrl: env.WALRUS_PUBLISHER_URL, aggregatorUrl: env.WALRUS_AGGREGATOR_URL };
    } catch (err) {
      request.log.error({ err }, 'Walrus upload failed');
      reply.status(502);
      return { ok: false, error: 'walrus_upload_failed' };
    }
  });
};
