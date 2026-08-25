import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { usePlayerStore } from '../stores/playerStore';
import { useChatStore } from '../stores/chatStore';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(window.location.origin, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });
  }
  return socket;
}

export function useSocket() {
  const isInitialized = useRef(false);
  const { setPlaybackState, setQueue, setCurrentItem } = usePlayerStore();
  const { addMessage, setMessages, setUsername, setViewerCount, setConnected } = useChatStore();

  useEffect(() => {
    if (isInitialized.current) return;
    isInitialized.current = true;

    const s = getSocket();

    s.on('connect', () => {
      console.log('[Socket] Connected');
      setConnected(true);
    });

    s.on('disconnect', () => {
      console.log('[Socket] Disconnected');
      setConnected(false);
    });

    // ── Sync events (simplified — Icecast handles actual sync) ──

    s.on('sync:state', (data: any) => {
      setPlaybackState({
        streamUrl: data.streamUrl,
        currentItem: data.currentItem,
        playing: data.playing,
      });
    });

    // ── Queue events ──

    s.on('queue:updated', (data: any) => {
      setQueue(data.queue || []);
      if (data.current) {
        setCurrentItem(data.current);
      }
    });

    // ── Live mode events ──

    s.on('live:state', (data: any) => {
      const goingLive = data.isLive || false;
      setPlaybackState({
        isLive: goingLive,
        liveHlsUrl: data.hlsUrl || null,
      });
      // Reset playing state so AudioRadioPlayer can re-autoplay when switching back
      if (!goingLive) {
        usePlayerStore.getState().setIsPlaying(false);
      }
    });

    // ── Chat events ──

    s.on('chat:history', (messages: any[]) => {
      setMessages(messages);
    });

    s.on('chat:message', (msg: any) => {
      addMessage(msg);
    });

    s.on('chat:viewers', (data: { count: number }) => {
      setViewerCount(data.count);
    });

    s.on('user:assigned', (data: { username: string }) => {
      setUsername(data.username);
    });

    // Cleanup is intentionally omitted — we want the socket to persist
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return getSocket();
}
