import crypto from 'crypto';
import { YouTubeVideoMeta } from './youtube';

export interface PendingRequest {
  id: string;
  youtubeId: string;
  videoMeta: YouTubeVideoMeta;
  createdAt: number;
  expiresAt: number;
}

// Default TTL: 30 minutes
const DEFAULT_TTL_MS = 30 * 60 * 1000;
const ttlMs = parseInt(process.env.PENDING_REQUEST_TTL_MS || '', 10) || DEFAULT_TTL_MS;

const pendingRequests = new Map<string, PendingRequest>();

/**
 * Create a new pending request for a validated video.
 * Returns the pending request with a unique 8-char hex ID.
 */
export function createPendingRequest(youtubeId: string, videoMeta: YouTubeVideoMeta): PendingRequest {
  const id = crypto.randomBytes(4).toString('hex'); // 8-char hex
  const now = Date.now();

  const request: PendingRequest = {
    id,
    youtubeId,
    videoMeta,
    createdAt: now,
    expiresAt: now + ttlMs,
  };

  pendingRequests.set(id, request);
  console.log(`[PendingRequests] Created: ${id} → ${youtubeId} (expires in ${ttlMs / 1000}s)`);
  return request;
}

/**
 * Look up a pending request by ID.
 * Returns null if not found or expired.
 */
export function getPendingRequest(id: string): PendingRequest | null {
  const request = pendingRequests.get(id);
  if (!request) return null;

  if (Date.now() > request.expiresAt) {
    pendingRequests.delete(id);
    return null;
  }

  return request;
}

/**
 * Consume (remove and return) a pending request.
 * This is a one-time use — the request is deleted after retrieval.
 * Returns null if not found or expired.
 */
export function consumePendingRequest(id: string): PendingRequest | null {
  const request = getPendingRequest(id);
  if (!request) return null;

  pendingRequests.delete(id);
  console.log(`[PendingRequests] Consumed: ${id} → ${request.youtubeId}`);
  return request;
}

/**
 * Remove all expired pending requests.
 */
export function cleanupExpired(): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [id, request] of pendingRequests) {
    if (now > request.expiresAt) {
      pendingRequests.delete(id);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`[PendingRequests] Cleaned up ${cleaned} expired request(s). Active: ${pendingRequests.size}`);
  }

  return cleaned;
}

/**
 * Get the number of active (non-expired) pending requests.
 */
export function getPendingCount(): number {
  return pendingRequests.size;
}
