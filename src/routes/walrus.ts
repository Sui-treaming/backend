import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { env } from '../env.js';
import { writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { ensureUploadDir, buildPublicPath, buildPublicUrl } from '../storage/localUploads.js';
import { createStreamerAsset } from '../repositories/streamerAssets.js';

async function savePngToLocalUploads(bytes: Buffer) {
  const uploadDir = await ensureUploadDir();
  const filename = `${Date.now()}-${randomUUID()}.png`;
  const storagePath = join(uploadDir, filename);
  await writeFile(storagePath, bytes);
  const filePath = buildPublicPath(filename);
  return { filename, storagePath, filePath } as { filename: string; storagePath: string; filePath: string };
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function resolveRequestOrigin(request: FastifyRequest): string | undefined {
  const forwardedProto = firstHeaderValue(request.headers['x-forwarded-proto']);
  const forwardedHost = firstHeaderValue(request.headers['x-forwarded-host']);
  const host = forwardedHost ?? firstHeaderValue(request.headers['host']);
  if (!host) {
    return undefined;
  }
  const protocol = forwardedProto ?? request.protocol ?? 'http';
  return `${protocol}://${host}`;
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
    const rawContentTypeHeader = request.headers['content-type'];
    const contentType = Array.isArray(rawContentTypeHeader)
      ? rawContentTypeHeader[0] ?? ''
      : (rawContentTypeHeader ?? '');
    const normalizedContentType = contentType.toLowerCase();
    const rawBody = request.body as Buffer | undefined;
    const streamerIdHeader = request.headers['streamid'];
    const streamerIdValue = Array.isArray(streamerIdHeader) ? streamerIdHeader[0] : streamerIdHeader;
    const streamerId = streamerIdValue ? String(streamerIdValue).trim() : '';

    if (!rawBody || rawBody.length === 0) {
      reply.status(400);
      return { error: 'empty_body' };
    }

    if (!streamerId) {
      reply.status(400);
      return { error: 'missing_stream_id', message: 'Include streamid header to associate the upload.' };
    }

    if (rawBody.length > env.WALRUS_MAX_UPLOAD_BYTES) {
      reply.status(413);
      return { error: 'payload_too_large', limit: env.WALRUS_MAX_UPLOAD_BYTES };
    }

    let pngBytes: Buffer | null = null;
    let uploadContentType: string | undefined;
    let originalFilename: string | undefined;
    if (normalizedContentType.includes('image/png') || normalizedContentType === 'application/octet-stream') {
      pngBytes = rawBody;
      uploadContentType = contentType || 'image/png';
    } else if (normalizedContentType.includes('multipart/form-data')) {
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
          uploadContentType = filePart.headers['content-type'] || uploadContentType;
          originalFilename = filePart.disposition?.filename ?? originalFilename;
        }
      } catch (_e) {
        try {
          const parts2 = parseMultipartRobust(rawBody, boundary);
          const fp2 = parts2.find(p => (p.headers['content-type'] || '').includes('image/png'))
            || parts2.find(p => /filename=\"?.+\.(png)\"?/i.test(p.headers['content-disposition'] || ''))
            || parts2[0];
          if (fp2 && fp2.data && fp2.data.length > 0) {
            pngBytes = fp2.data;
            uploadContentType = fp2.headers['content-type'] || uploadContentType;
            originalFilename = fp2.disposition?.filename ?? originalFilename;
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

    uploadContentType = uploadContentType ?? 'image/png';

    try {
      const savedFile = await savePngToLocalUploads(pngBytes);
      const asset = await createStreamerAsset({
        streamerId,
        filePath: savedFile.filePath,
        storagePath: savedFile.storagePath,
        originalFilename,
        contentType: uploadContentType,
        fileSize: pngBytes.length,
      });
      const origin = resolveRequestOrigin(request);
      const publicUrl = buildPublicUrl(savedFile.filePath, origin);
      reply.header('Cache-Control', 'no-store');
      return {
        ok: true,
        assetId: asset._id?.toString?.(),
        streamerId,
        filename: savedFile.filename,
        filePath: asset.filePath,
        publicUrl,
        originalFilename,
        contentType: uploadContentType,
        fileSize: pngBytes.length,
      };
    } catch (err) {
      request.log.error({ err, streamerId }, 'Streamer asset persistence failed');
      reply.status(500);
      return { ok: false, error: 'asset_persistence_failed' };
    }
  });
};
