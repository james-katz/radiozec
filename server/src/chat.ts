import { Server as SocketIOServer, Socket } from 'socket.io';
import { generateUsername } from './usernames';

interface ChatMessage {
  id: string;
  username: string;
  text: string;
  timestamp: number;
  isSystem: boolean;
}

const MAX_HISTORY = 100;
const RATE_LIMIT_MS = 1000;
const MAX_MESSAGE_LENGTH = 500;

let messageHistory: ChatMessage[] = [];
let io: SocketIOServer | null = null;

// Track connected user count
let viewerCount = 0;

export function initChat(socketIo: SocketIOServer) {
  io = socketIo;
}

export function getViewerCount(): number {
  return viewerCount;
}

/**
 * Broadcast a system message (e.g., "Now playing: ...", "Video skipped").
 */
export function sendSystemMessage(text: string): void {
  const msg: ChatMessage = {
    id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    username: 'RadioZec',
    text,
    timestamp: Date.now(),
    isSystem: true,
  };
  messageHistory.push(msg);
  if (messageHistory.length > MAX_HISTORY) {
    messageHistory = messageHistory.slice(-MAX_HISTORY);
  }
  io?.emit('chat:message', msg);
}

/**
 * Handle a new socket connection for chat.
 */
export function handleChatConnection(socket: Socket): void {
  const username = generateUsername();
  (socket as any)._chatUsername = username;
  (socket as any)._lastMessage = 0;

  viewerCount++;

  // Send initial data
  socket.emit('user:assigned', { username });
  socket.emit('chat:history', messageHistory.slice(-50));
  io?.emit('chat:viewers', { count: viewerCount });

  // Handle username change
  socket.on('user:setName', (data: { username: string }) => {
    const newName = sanitize(data.username).slice(0, 24);
    if (newName.length >= 2) {
      const oldName = (socket as any)._chatUsername;
      (socket as any)._chatUsername = newName;
      socket.emit('user:assigned', { username: newName });
      sendSystemMessage(`${oldName} is now ${newName}`);
    }
  });

  // Handle chat messages
  socket.on('chat:message', (data: { text: string }) => {
    const now = Date.now();
    const lastMsg = (socket as any)._lastMessage || 0;

    // Rate limit
    if (now - lastMsg < RATE_LIMIT_MS) return;
    (socket as any)._lastMessage = now;

    const text = sanitize(data.text).slice(0, MAX_MESSAGE_LENGTH);
    if (!text.trim()) return;

    const msg: ChatMessage = {
      id: `${now}-${Math.random().toString(36).slice(2, 6)}`,
      username: (socket as any)._chatUsername,
      text,
      timestamp: now,
      isSystem: false,
    };

    messageHistory.push(msg);
    if (messageHistory.length > MAX_HISTORY) {
      messageHistory = messageHistory.slice(-MAX_HISTORY);
    }

    io?.emit('chat:message', msg);
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    viewerCount = Math.max(0, viewerCount - 1);
    io?.emit('chat:viewers', { count: viewerCount });
  });
}

/**
 * Basic XSS sanitization.
 */
function sanitize(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}
