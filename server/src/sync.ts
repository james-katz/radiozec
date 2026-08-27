import { Server as SocketIOServer } from 'socket.io';
import { config } from './config';
import type { QueueItem } from './queue';
import { getLiveState } from './liveMode';
import { getRuntimeConfig } from './db';

// ── Playback State ────────────────────────────────────────

export interface PlaybackState {
  streamUrl: string;          // Icecast stream URL
  currentItem: QueueItem | null;
  playing: boolean;           // Whether stream is active
  isLive: boolean;            // Whether live mode is active
  liveHlsUrl: string | null;  // HLS stream URL when live
  donationsEnabled: boolean;  // Whether queue/skip buttons are enabled
}

let state: Omit<PlaybackState, 'isLive' | 'liveHlsUrl' | 'donationsEnabled'> = {
  streamUrl: config.icecastUrl,
  currentItem: null,
  playing: false,
};

let io: SocketIOServer | null = null;

// ── Public API ────────────────────────────────────────────

export function initSync(socketIo: SocketIOServer) {
  io = socketIo;
}

export async function getPlaybackState(): Promise<PlaybackState> {
  const live = getLiveState();
  const donationsEnabled = (await getRuntimeConfig('donationsEnabled', 'false')) === 'true';
  return {
    ...state,
    isLive: live.isLive,
    liveHlsUrl: live.hlsUrl,
    donationsEnabled,
  };
}

/**
 * Called when Liquidsoap reports a new track started via webhook.
 * Broadcasts the new track info to all connected clients.
 */
export function onTrackChange(item: QueueItem): void {
  state = {
    ...state,
    streamUrl: config.icecastUrl,
    currentItem: item,
    playing: true,
  };

  console.log(`[Sync] Now playing: ${item.title}`);
  broadcastState();
}

/**
 * Update the current item directly (e.g., from queue mirror).
 */
export function setCurrentItem(item: QueueItem | null): void {
  state.currentItem = item;
  broadcastState();
}

/**
 * Mark stream as active/inactive.
 */
export function setStreamActive(active: boolean): void {
  state.playing = active;
  broadcastState();
}

// ── Broadcast ─────────────────────────────────────────────

async function broadcastState(): Promise<void> {
  if (!io) return;
  io.emit('sync:state', await getPlaybackState());
}
