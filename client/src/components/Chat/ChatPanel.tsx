import { useState, useRef, useEffect, useCallback } from 'react';
import { useChatStore } from '../../stores/chatStore';
import type { ChatMessage } from '../../stores/chatStore';
import { usePlayerStore } from '../../stores/playerStore';
import { getSocket } from '../../hooks/useSocket';
import QueueDisplay from '../Queue/QueueDisplay';
import QueueVideoModal from './QueueVideoModal';

export default function ChatPanel() {
  const { messages, username, viewerCount, isConnected } = useChatStore();
  const { playback } = usePlayerStore();
  const [input, setInput] = useState('');
  const [showQueueModal, setShowQueueModal] = useState(false);
  const [showSkipModal, setShowSkipModal] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    const socket = getSocket();
    socket.emit('chat:message', { text });
    setInput('');
    inputRef.current?.focus();
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleSetName = () => {
    const name = nameInput.trim();
    if (name.length >= 2) {
      const socket = getSocket();
      socket.emit('user:setName', { username: name });
      setIsEditingName(false);
    }
  };

  const handleSkipRequest = () => {
    const socket = getSocket();
    socket.emit('skip:request');
    setShowSkipModal(true);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-base-700/50">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse-glow' : 'bg-rose-500'}`} />
          <span className="text-sm font-semibold text-base-200">RadioZec</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-base-400">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span>{viewerCount}</span>
        </div>
      </div>

      {/* Username bar */}
      <div className="px-4 py-2 border-b border-base-800/50 flex items-center gap-2">
        {isEditingName ? (
          <div className="flex items-center gap-1.5 flex-1">
            <input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSetName()}
              placeholder="New username"
              maxLength={24}
              className="flex-1 bg-base-800 text-sm text-base-100 px-2 py-1 rounded border border-base-600 focus:border-purple-500 focus:outline-none"
              autoFocus
            />
            <button onClick={handleSetName} className="text-xs text-emerald-400 hover:text-emerald-300">
              ✓
            </button>
            <button onClick={() => setIsEditingName(false)} className="text-xs text-base-400 hover:text-base-300">
              ✗
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <span className="text-xs text-base-400">You:</span>
            <span className="text-xs font-medium text-purple-400 truncate">{username}</span>
            <button
              onClick={() => { setIsEditingName(true); setNameInput(username); }}
              className="text-xs text-base-500 hover:text-base-300 ml-auto flex-shrink-0"
              title="Change username"
            >
              ✏️
            </button>
          </div>
        )}
      </div>

      {/* Queue Display */}
      <div className="px-3 py-2 border-b border-base-800/50 overflow-y-auto max-h-[200px]">
        <QueueDisplay />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Action Buttons */}
      <div className="px-3 py-2 flex gap-2 border-t border-base-800/50">
        <button
          onClick={() => setShowQueueModal(true)}
          disabled={playback.isLive}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all active:scale-[0.98] shadow-lg
                     ${playback.isLive
                       ? 'bg-base-700 text-base-500 shadow-none cursor-not-allowed'
                       : 'bg-gradient-to-r from-gold-600 to-gold-500 text-base-950 hover:from-gold-500 hover:to-gold-400 shadow-gold-500/20'
                     }`}
          title={playback.isLive ? 'Queue is paused during live events' : ''}
        >
          🎵 Queue Video
        </button>
        <button
          onClick={handleSkipRequest}
          disabled={playback.isLive}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all active:scale-[0.98] border
                     ${playback.isLive
                       ? 'bg-base-800 text-base-500 border-base-700 cursor-not-allowed'
                       : 'bg-base-700 text-base-200 hover:bg-base-600 border-base-600'
                     }`}
          title={playback.isLive ? 'Skip is disabled during live events' : ''}
        >
          ⏭ Skip Video
        </button>
      </div>

      {/* Message Input */}
      <div className="p-3 border-t border-base-700/50">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            maxLength={500}
            className="flex-1 bg-base-800 text-sm text-base-100 px-3 py-2 rounded-lg border border-base-700 focus:border-purple-500 focus:outline-none placeholder:text-base-500 transition-colors"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim()}
            className="p-2 rounded-lg bg-purple-500 hover:bg-purple-400 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95"
          >
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>

      {/* Modals */}
      {showQueueModal && (
        <QueueVideoModal onClose={() => setShowQueueModal(false)} type="queue" />
      )}
      {showSkipModal && (
        <QueueVideoModal onClose={() => setShowSkipModal(false)} type="skip" />
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.isSystem) {
    return (
      <div className="text-center py-1 animate-fade-in">
        <span className="text-[11px] text-base-400 italic">{message.text}</span>
      </div>
    );
  }

  // Generate a consistent color from username
  const hue = hashCode(message.username) % 360;
  const color = `hsl(${hue}, 70%, 65%)`;

  return (
    <div className="animate-fade-in py-0.5">
      <span className="text-xs font-semibold mr-1.5" style={{ color }}>
        {message.username}
      </span>
      <span className="text-xs text-base-200">{message.text}</span>
    </div>
  );
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
    hash |= 0;
  }
  return Math.abs(hash);
}
