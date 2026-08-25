import { Server as SocketIOServer } from 'socket.io';
import fs from 'fs';
import path from 'path';
import { fetchVideoMeta } from './youtube';
import { downloadAudio } from './downloader';
import { LiquidsoapClient } from './liquidsoap';
import { config } from './config';

/** Strip path and audio extension from a filename to get a clean display title */
function cleanFilename(filename?: string): string {
  if (!filename) return '';
  // Get basename, strip extension
  return path.basename(filename).replace(/\.(mp3|wav|ogg|flac|m4a|opus)$/i, '');
}

export interface QueueItem {
  id: string;
  youtubeId: string;
  title: string;
  thumbnail: string;
  duration: number;
  requestedBy: string;
  donationTxid: string;
  donationAmount: number;
  addedAt: Date;
  isFallback: boolean;
  filePath?: string;
}

let queue: QueueItem[] = [];
let currentItem: QueueItem | null = null;
let io: SocketIOServer | null = null;
let liquidsoap: LiquidsoapClient | null = null;
let onTrackChangeCallback: ((item: QueueItem) => void) | null = null;
let paused = false;

export function initQueue(
  socketIo: SocketIOServer,
  lsClient: LiquidsoapClient,
  trackChangeCallback: (item: QueueItem) => void
) {
  io = socketIo;
  liquidsoap = lsClient;
  onTrackChangeCallback = trackChangeCallback;
}

export function getQueue(): QueueItem[] {
  return [...queue];
}

export function getCurrentItem(): QueueItem | null {
  return currentItem;
}

export function getQueueLength(): number {
  return queue.length;
}

export function pauseQueue(): void {
  paused = true;
  console.log('[Queue] Paused (live mode)');
}

export function resumeQueue(): void {
  paused = false;
  console.log('[Queue] Resumed (radio mode)');
}

export function isQueuePaused(): boolean {
  return paused;
}

/**
 * Download audio and push to Liquidsoap's queue.
 * Keeps an in-memory mirror for the UI.
 */
export async function enqueue(
  youtubeId: string,
  donationTxid: string,
  donationAmount: number,
  requestedBy: string = 'donation'
): Promise<QueueItem | null> {
  if (paused) {
    console.log(`[Queue] Skipping enqueue (paused for live mode): ${youtubeId}`);
    return null;
  }

  const meta = await fetchVideoMeta(youtubeId);
  if (!meta) {
    console.error(`[Queue] Could not fetch metadata for ${youtubeId}`);
    return null;
  }

  // Download the audio file
  let downloadResult;
  try {
    downloadResult = await downloadAudio(youtubeId);
  } catch (err) {
    console.error(`[Queue] Download failed for ${youtubeId}:`, err);
    return null;
  }

  const item: QueueItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    youtubeId: meta.videoId,
    title: meta.title,
    thumbnail: meta.thumbnail,
    duration: downloadResult.duration,
    requestedBy,
    donationTxid,
    donationAmount,
    addedAt: new Date(),
    isFallback: false,
    filePath: downloadResult.filePath,
  };

  // Auto-push a jingle before the queued track
  if (liquidsoap) {
    const jingle = getRandomJingle();
    if (jingle) {
      try {
        await liquidsoap.pushJingle(jingle);
        console.log(`[Queue] Auto-jingle: ${path.basename(jingle)}`);
      } catch (err) {
        console.warn('[Queue] Failed to push jingle:', err);
      }
    }
  }

  // Push the track to Liquidsoap
  if (liquidsoap) {
    try {
      await liquidsoap.pushTrack(downloadResult.filePath, {
        title: meta.title,
        youtubeId: meta.videoId,
      });
    } catch (err) {
      console.error('[Queue] Failed to push to Liquidsoap:', err);
      // Still add to UI mirror even if Liquidsoap push fails
    }
  }

  // Add to UI mirror
  queue.push(item);
  broadcastQueue();

  console.log(`[Queue] Enqueued: ${item.title} (${item.youtubeId})`);
  return item;
}

/**
 * Skip the current track via Liquidsoap.
 */
export async function skipCurrent(): Promise<void> {
  console.log(`[Queue] Skipping: ${currentItem?.title || 'nothing'}`);

  if (liquidsoap) {
    try {
      await liquidsoap.skip();
    } catch (err) {
      console.error('[Queue] Failed to skip in Liquidsoap:', err);
    }
  }

  // The actual track change will come via the Liquidsoap webhook
}

/**
 * Called when Liquidsoap's webhook reports a track change.
 * Updates the UI mirror.
 */
export function onLiquidsoapTrackChange(metadata: {
  title?: string;
  artist?: string;
  filename?: string;
  youtubeId?: string;
}): void {
  // Try to find the item in our queue mirror
  let matchedItem: QueueItem | null = null;

  if (metadata.youtubeId) {
    const idx = queue.findIndex((q) => q.youtubeId === metadata.youtubeId);
    if (idx !== -1) {
      matchedItem = queue.splice(idx, 1)[0];
    }
  } else if (metadata.filename) {
    const idx = queue.findIndex((q) => q.filePath && metadata.filename?.includes(q.youtubeId));
    if (idx !== -1) {
      matchedItem = queue.splice(idx, 1)[0];
    }
  }

  // If not in queue, it's a fallback/jingle track
  if (!matchedItem) {
    matchedItem = {
      id: `track-${Date.now()}`,
      youtubeId: metadata.youtubeId || '',
      title: metadata.title || cleanFilename(metadata.filename) || 'Unknown Track',
      thumbnail: metadata.youtubeId
        ? `https://img.youtube.com/vi/${metadata.youtubeId}/hqdefault.jpg`
        : '',
      duration: 0,
      requestedBy: 'RadioZec',
      donationTxid: '',
      donationAmount: 0,
      addedAt: new Date(),
      isFallback: true,
    };
  }

  currentItem = matchedItem;
  broadcastQueue();

  if (onTrackChangeCallback) {
    onTrackChangeCallback(matchedItem);
  }
}

/**
 * Remove a specific item from the queue by ID.
 */
export function removeFromQueue(itemId: string): boolean {
  const idx = queue.findIndex((q) => q.id === itemId);
  if (idx === -1) return false;
  queue.splice(idx, 1);
  broadcastQueue();
  return true;
}

function broadcastQueue(): void {
  io?.emit('queue:updated', { queue: getQueue(), current: currentItem });
}

/**
 * Pick a random jingle from the jingles directory.
 * Returns null if no jingles are available.
 */
function getRandomJingle(): string | null {
  const jinglesDir = path.resolve(config.mediaDir, 'jingles');
  if (!fs.existsSync(jinglesDir)) return null;

  const audioExtensions = ['.mp3', '.ogg', '.opus', '.wav', '.m4a', '.flac'];
  const files = fs.readdirSync(jinglesDir).filter((f) => {
    const ext = path.extname(f).toLowerCase();
    return audioExtensions.includes(ext) && !f.startsWith('.');
  });

  if (files.length === 0) return null;

  const pick = files[Math.floor(Math.random() * files.length)];
  return path.join(jinglesDir, pick);
}
