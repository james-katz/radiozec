import { create } from 'zustand';

export interface ChatMessage {
  id: string;
  username: string;
  text: string;
  timestamp: number;
  isSystem: boolean;
}

interface ChatStore {
  messages: ChatMessage[];
  username: string;
  viewerCount: number;
  isConnected: boolean;
  addMessage: (msg: ChatMessage) => void;
  setMessages: (msgs: ChatMessage[]) => void;
  setUsername: (name: string) => void;
  setViewerCount: (count: number) => void;
  setConnected: (connected: boolean) => void;
}

const MAX_MESSAGES = 200;

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  username: '',
  viewerCount: 0,
  isConnected: false,
  addMessage: (msg) =>
    set((state) => ({
      messages: [...state.messages, msg].slice(-MAX_MESSAGES),
    })),
  setMessages: (msgs) => set({ messages: msgs.slice(-MAX_MESSAGES) }),
  setUsername: (name) => set({ username: name }),
  setViewerCount: (count) => set({ viewerCount: count }),
  setConnected: (connected) => set({ isConnected: connected }),
}));
