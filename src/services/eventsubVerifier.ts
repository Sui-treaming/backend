import crypto from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';

export interface EventSubHeaders {
  messageId: string;
  timestamp: string;
  signature: string;
  messageType: string;
}

function getHeaderValue(value: string | string[] | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  return Array.isArray(value) ? value[0] : value;
}

export function extractEventSubHeaders(headers: IncomingHttpHeaders): EventSubHeaders {
  const messageId = getHeaderValue(headers['twitch-eventsub-message-id']);
  const timestamp = getHeaderValue(headers['twitch-eventsub-message-timestamp']);
  const signature = getHeaderValue(headers['twitch-eventsub-message-signature']);
  const messageType = getHeaderValue(headers['twitch-eventsub-message-type']);

  if (!messageId || !timestamp || !signature || !messageType) {
    throw new Error('Missing required Twitch EventSub headers');
  }

  return {
    messageId,
    timestamp,
    signature,
    messageType,
  };
}

export function verifyEventSubSignature(secret: string, headers: EventSubHeaders, rawBody: string): boolean {
  const hmacMessage = `${headers.messageId}${headers.timestamp}${rawBody}`;
  const computed = crypto.createHmac('sha256', secret).update(hmacMessage).digest('hex');
  const expected = `sha256=${computed}`;

  const providedBuffer = Buffer.from(headers.signature);
  const expectedBuffer = Buffer.from(expected);

  return providedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

const REPLAY_WINDOW_MS = 10 * 60 * 1000;
const MAX_CACHE_SIZE = 2000;
const seenMessages = new Map<string, number>();

function pruneSeenMessages(now: number) {
  for (const [id, seenAt] of seenMessages) {
    if (now - seenAt > REPLAY_WINDOW_MS) {
      seenMessages.delete(id);
    }
  }

  if (seenMessages.size <= MAX_CACHE_SIZE) {
    return;
  }

  // Remove oldest entries to keep memory bounded.
  const sorted = [...seenMessages.entries()].sort((a, b) => a[1] - b[1]);
  for (const [id] of sorted.slice(0, sorted.length - MAX_CACHE_SIZE)) {
    seenMessages.delete(id);
  }
}

export function registerMessage(headers: EventSubHeaders, now: number = Date.now()): boolean {
  pruneSeenMessages(now);

  if (seenMessages.has(headers.messageId)) {
    return false;
  }

  seenMessages.set(headers.messageId, now);
  return true;
}
