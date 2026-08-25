import { Server as SocketIOServer } from 'socket.io';
import { config } from './config';

// ── Live Mode State ──────────────────────────────────────

export interface LiveState {
  isLive: boolean;
  hlsUrl: string | null;
  startedAt: string | null;
}

let state: LiveState = {
  isLive: false,
  hlsUrl: null,
  startedAt: null,
};

let io: SocketIOServer | null = null;
let onLiveChangeCallback: ((isLive: boolean) => void) | null = null;

// ── Public API ───────────────────────────────────────────

export function initLiveMode(
  socketIo: SocketIOServer,
  liveChangeCallback: (isLive: boolean) => void
) {
  io = socketIo;
  onLiveChangeCallback = liveChangeCallback;
}

export function getLiveState(): LiveState {
  return { ...state };
}

export function isLive(): boolean {
  return state.isLive;
}

/**
 * Activate live mode.
 * Pauses the donation queue and switches clients to the HLS video stream.
 */
export function goLive(): LiveState {
  if (state.isLive) return state;

  state = {
    isLive: true,
    hlsUrl: config.mediamtxHlsUrl,
    startedAt: new Date().toISOString(),
  };

  console.log(`[Live] 🔴 Going LIVE — HLS: ${state.hlsUrl}`);
  broadcastLiveState();

  if (onLiveChangeCallback) {
    onLiveChangeCallback(true);
  }

  return state;
}

/**
 * Deactivate live mode.
 * Resumes the donation queue and switches clients back to audio radio.
 */
export function goOffline(): LiveState {
  if (!state.isLive) return state;

  state = {
    isLive: false,
    hlsUrl: null,
    startedAt: null,
  };

  console.log('[Live] ⚪ Going OFFLINE — back to radio mode');
  broadcastLiveState();

  if (onLiveChangeCallback) {
    onLiveChangeCallback(false);
  }

  return state;
}

/**
 * Check if MediaMTX is reachable and a live stream is active.
 */
export async function checkMediaMTXStream(): Promise<boolean> {
  try {
    const res = await fetch(`${config.mediamtxApiUrl}/v3/paths/list`);
    if (!res.ok) return false;

    const data: any = await res.json();
    const items = data.items || [];
    return items.some((item: any) =>
      item.name === config.liveStreamKey && item.ready === true
    );
  } catch {
    return false;
  }
}

/**
 * Check if MediaMTX API is reachable at all.
 */
export async function isMediaMTXAlive(): Promise<boolean> {
  try {
    const res = await fetch(`${config.mediamtxApiUrl}/v3/paths/list`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Broadcast ────────────────────────────────────────────

function broadcastLiveState(): void {
  if (!io) return;
  io.emit('live:state', { ...state });
}
