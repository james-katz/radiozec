import { Server as SocketIOServer } from 'socket.io';
import { config } from './config';
import type { QueueItem } from './queue';
import { getLiveState } from './liveMode';

// ── Playback State ────────────────────────────────────────

export interface PlaybackState {
  streamUrl: string;          // Icecast stream URL
  currentItem: QueueItem | null;
  playing: boolean;           // Whether stream is active
  isLive: boolean;            // Whether live mode is active
  liveHlsUrl: string | null;  // HLS stream URL when live
}

let state: PlaybackState = {
  streamUrl: config.icecastUrl,
  currentItem: null,
  playing: false,
  isLive: false,
  liveHlsUrl: null,
};

let io: SocketIOServer | null = null;

// ── Public API ────────────────────────────────────────────

export function initSync(socketIo: SocketIOServer) {
  io = socketIo;
}

export function getPlaybackState(): PlaybackState {
  const live = getLiveState();
  return {
    ...state,
    isLive: live.isLive,
    liveHlsUrl: live.hlsUrl,
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

function broadcastState(): void {
  if (!io) return;
  io.emit('sync:state', getPlaybackState());
}
