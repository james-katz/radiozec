import { useSocket } from '../hooks/useSocket';
import { usePlayerStore } from '../stores/playerStore';
import { useChatStore } from '../stores/chatStore';
import RadioPlayer from '../components/Player/RadioPlayer';
import ChatPanel from '../components/Chat/ChatPanel';

export default function MainPage() {
  useSocket();
  const { playback, isPlaying } = usePlayerStore();
  const { viewerCount } = useChatStore();
  const isLive = playback.isLive;

  return (
    <div className="h-full flex flex-col lg:flex-row">
      {/* Left: Player Area */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Header Bar */}
        <header className="flex items-center justify-between px-5 py-3 border-b border-base-800/50">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl">📻</span>
              <h1 className="text-xl font-extrabold tracking-tight">
                <span className="text-gold-400">Radio</span>
                <span className="text-base-100">Zec</span>
              </h1>
            </div>

            {/* Live Event Badge */}
            {isLive && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-600/20 border border-rose-500/40">
                <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                <span className="text-[11px] font-bold text-rose-400 uppercase tracking-wider">Live Event</span>
              </div>
            )}

            {/* Audio streaming indicator (only in radio mode) */}
            {!isLive && isPlaying && (
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-base-800/80 border border-base-700/50">
                <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                <span className="text-[11px] font-medium text-base-300 uppercase tracking-wider">On Air</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-4 text-xs text-base-400">
            <div className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <span>{viewerCount} {isLive ? 'watching' : 'listening'}</span>
            </div>
          </div>
        </header>

        {/* Radio Player / Live Player (auto-switches) — takes full remaining space */}
        <div className="flex-1 min-h-0">
          <RadioPlayer />
        </div>
      </div>

      {/* Right: Chat Sidebar */}
      <div className="w-full lg:w-[380px] h-[50vh] lg:h-full border-t lg:border-t-0 lg:border-l border-base-800/50 bg-base-900/50 flex flex-col">
        <ChatPanel />
      </div>
    </div>
  );
}
