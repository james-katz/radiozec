import { create } from 'zustand';

export interface QueueItem {
  id: string;
  youtubeId: string;
  title: string;
  thumbnail: string;
  duration: number;
  requestedBy: string;
  donationTxid: string;
  donationAmount: number;
  addedAt: string;
  isFallback: boolean;
}

interface PlaybackState {
  streamUrl: string;
  currentItem: QueueItem | null;
  playing: boolean;
  isLive: boolean;
  liveHlsUrl: string | null;
}

interface PlayerStore {
  playback: PlaybackState;
  queue: QueueItem[];
  volume: number;
  isPlaying: boolean;
  setPlaybackState: (state: Partial<PlaybackState>) => void;
  setQueue: (queue: QueueItem[]) => void;
  setCurrentItem: (item: QueueItem | null) => void;
  setVolume: (volume: number) => void;
  setIsPlaying: (playing: boolean) => void;
}

export const usePlayerStore = create<PlayerStore>((set) => ({
  playback: {
    streamUrl: '',
    currentItem: null,
    playing: false,
    isLive: false,
    liveHlsUrl: null,
  },
  queue: [],
  volume: 80,
  isPlaying: false,
  setPlaybackState: (state) =>
    set((prev) => ({ playback: { ...prev.playback, ...state } })),
  setQueue: (queue) => set({ queue }),
  setCurrentItem: (item) =>
    set((prev) => ({ playback: { ...prev.playback, currentItem: item } })),
  setVolume: (volume) => set({ volume }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
}));
