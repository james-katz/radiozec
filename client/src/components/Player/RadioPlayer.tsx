import { useRef, useCallback, useEffect, useState } from 'react';
import AudioMotionAnalyzer from 'audiomotion-analyzer';
import { usePlayerStore } from '../../stores/playerStore';
import LivePlayer from './LivePlayer';

// ── audioMotion preset configs ──
const PRESETS = [
  {
    name: 'Spectrum',
    options: {
      mode: 3,
      barSpace: 0.25,
      lumiBars: false,
      radial: false,
      mirror: 0,
      reflexRatio: 0.35,
      reflexAlpha: 0.2,
      showBgColor: false,
      overlay: true,
      bgAlpha: 0,
      spinSpeed: 0,
    },
  },
  {
    name: 'Mirror',
    options: {
      mode: 6,
      barSpace: 0.1,
      lumiBars: false,
      radial: false,
      mirror: 1,
      reflexRatio: 0,
      reflexAlpha: 0,
      showBgColor: false,
      overlay: true,
      bgAlpha: 0,
      spinSpeed: 0,
    },
  },
  {
    name: 'Radial',
    options: {
      mode: 3,
      barSpace: 0.2,
      lumiBars: false,
      radial: true,
      mirror: 0,
      reflexRatio: 0,
      reflexAlpha: 0,
      showBgColor: false,
      overlay: true,
      bgAlpha: 0,
      spinSpeed: 1,
    },
  },
  {
    name: 'Lumi',
    options: {
      mode: 4,
      barSpace: 0.15,
      lumiBars: true,
      radial: false,
      mirror: 0,
      reflexRatio: 0,
      reflexAlpha: 0,
      showBgColor: false,
      overlay: true,
      bgAlpha: 0,
      spinSpeed: 0,
    },
  },
];

// ── Custom RadioZec gradient ──
function registerGradients(analyzer: AudioMotionAnalyzer) {
  analyzer.registerGradient('zecGold', {
    bgColor: 'transparent',
    colorStops: [
      { color: '#6B5CE7', pos: 0 },     // purple (low freqs)
      { color: '#A78BFA', pos: 0.3 },    // light purple
      { color: '#F4B728', pos: 0.6 },    // gold
      { color: '#FFD700', pos: 0.8 },    // bright gold (high freqs)
      { color: '#FFF4CC', pos: 1 },      // cream white (peaks)
    ],
  });
  analyzer.registerGradient('zecFire', {
    bgColor: 'transparent',
    colorStops: [
      { color: '#1a0533', pos: 0 },
      { color: '#6B5CE7', pos: 0.2 },
      { color: '#F4B728', pos: 0.5 },
      { color: '#FF6B35', pos: 0.8 },
      { color: '#FFE4CC', pos: 1 },
    ],
  });
}

// ── Wrapper ──────────────────────────────────────────────

export default function RadioPlayer() {
  const { playback, isPlaying } = usePlayerStore();
  const [wasLive, setWasLive] = useState(false);
  const prevIsLive = useRef(playback.isLive);

  useEffect(() => {
    if (prevIsLive.current && !playback.isLive) {
      setWasLive(true);
    }
    prevIsLive.current = playback.isLive;
  }, [playback.isLive]);

  useEffect(() => {
    if (isPlaying) setWasLive(false);
  }, [isPlaying]);

  if (playback.isLive) {
    return <LivePlayer />;
  }

  return <AudioRadioPlayer returnedFromLive={wasLive} />;
}

// ── Audio Radio Player ──────────────────────────────────

function AudioRadioPlayer({ returnedFromLive = false }: { returnedFromLive?: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const vizContainerRef = useRef<HTMLDivElement>(null);
  const analyzerRef = useRef<AudioMotionAnalyzer | null>(null);

  const { playback, volume, isPlaying, setIsPlaying, setVolume } = usePlayerStore();
  const [presetIdx, setPresetIdx] = useState(0);
  const [connecting, setConnecting] = useState(false);

  const streamUrl = playback.streamUrl;
  const currentItem = playback.currentItem;
  const thumbnail = currentItem?.thumbnail || '';

  const showPlayButton = !isPlaying && streamUrl;

  // ── Clean song title from filename ──
  const songTitle = currentItem?.title
    ? currentItem.title.replace(/\.(mp3|wav|ogg|flac|m4a|opus)$/i, '')
    : '';

  // ── Start playing ──
  const startPlaying = useCallback(() => {
    if (!audioRef.current || !streamUrl) return;

    // Create audioMotion analyzer on first play
    if (!analyzerRef.current && vizContainerRef.current) {
      const analyzer = new AudioMotionAnalyzer(vizContainerRef.current, {
        source: audioRef.current,
        connectSpeakers: true,
        showScaleX: false,
        showScaleY: false,
        showPeaks: true,
        smoothing: 0.7,
        fftSize: 8192,
        weightingFilter: 'D',
        ...PRESETS[presetIdx].options,
      });
      // Register custom gradients AFTER construction, then apply
      registerGradients(analyzer);
      analyzer.gradient = 'zecGold';
      analyzerRef.current = analyzer;
    }

    // Resume AudioContext if suspended
    if (analyzerRef.current?.audioCtx.state === 'suspended') {
      analyzerRef.current.audioCtx.resume();
    }

    setConnecting(true);
    audioRef.current.src = streamUrl;
    audioRef.current.load();
    audioRef.current.play().then(() => {
      setIsPlaying(true);
      setConnecting(false);
    }).catch((err) => {
      console.warn('[Radio] Play failed:', err.name);
      // Re-enable button after timeout so user can retry
      setTimeout(() => setConnecting(false), 6000);
    });
  }, [streamUrl, setIsPlaying, presetIdx]);

  // ── Play/Pause Toggle ──
  const togglePlay = useCallback(() => {
    if (!audioRef.current || !streamUrl) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      startPlaying();
    }
  }, [isPlaying, streamUrl, setIsPlaying, startPlaying]);

  // ── Volume Control ──
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume / 100;
    }
  }, [volume]);

  // ── Update analyzer preset ──
  useEffect(() => {
    if (analyzerRef.current) {
      analyzerRef.current.setOptions(PRESETS[presetIdx].options);
    }
  }, [presetIdx]);

  // ── Cycle visualizer preset ──
  const cyclePreset = useCallback(() => {
    setPresetIdx((prev) => (prev + 1) % PRESETS.length);
  }, []);

  // ── Cleanup ──
  useEffect(() => {
    return () => {
      if (analyzerRef.current) {
        analyzerRef.current.destroy();
        analyzerRef.current = null;
      }
    };
  }, []);

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        crossOrigin="anonymous"
        preload="none"
      />

      {/* Background — blurred thumbnail */}
      {thumbnail && (
        <div
          className="absolute inset-0 bg-cover bg-center blur-3xl opacity-30 scale-110"
          style={{ backgroundImage: `url(${thumbnail})` }}
        />
      )}

      {/* audioMotion-analyzer container */}
      <div
        ref={vizContainerRef}
        className="absolute inset-0 w-full h-full z-0"
        onClick={cyclePreset}
        title="Click to change visualizer"
        style={{ cursor: 'pointer' }}
      />

      {/* Center — Play button */}
      {showPlayButton && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="flex flex-col items-center gap-4">
            {returnedFromLive && (
              <div className="px-4 py-2 rounded-xl bg-base-800/80 backdrop-blur-sm border border-base-700/50 mb-2">
                <p className="text-sm text-base-300">🔴 Live event ended</p>
              </div>
            )}
            <button
              onClick={togglePlay}
              disabled={connecting}
              className={`flex items-center gap-3 px-8 py-4 rounded-2xl
                         text-lg font-bold shadow-xl transition-all
                         ${connecting
                           ? 'bg-base-700 text-base-400 shadow-none cursor-wait'
                           : 'bg-gold-500/90 hover:bg-gold-400 text-base-950 shadow-gold-500/30 active:scale-95 animate-pulse-glow cursor-pointer'
                         }`}
            >
              {connecting ? (
                <>
                  <div className="w-6 h-6 border-2 border-base-500 border-t-base-300 rounded-full animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  {returnedFromLive ? 'Back to Radio' : 'Tune In'}
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* No stream */}
      {!streamUrl && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="text-center">
            <div className="text-5xl mb-4">📻</div>
            <p className="text-base-300 text-lg">RadioZec</p>
            <p className="text-base-500 text-sm mt-1">Starting stream...</p>
          </div>
        </div>
      )}

      {/* ── Now Playing overlay (top-left, hidden during live) ── */}
      {isPlaying && !playback.isLive && (
        <div className="absolute top-0 left-0 z-20 p-6
                        animate-[fadeSlideUp_0.5s_ease-out]">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-widest text-gold-400/80 font-semibold"
               style={{ textShadow: '0 1px 6px rgba(0,0,0,0.9)' }}>
              ♫ You're listening to
            </p>
            <p className="text-2xl font-bold text-gold-300 leading-tight max-w-lg"
               style={{ textShadow: '0 2px 10px rgba(0,0,0,0.95), 0 0 30px rgba(244,183,40,0.15)' }}>
              {songTitle || 'RadioZec'}
            </p>
            <p className="text-sm text-base-200/60 font-medium"
               style={{ textShadow: '0 1px 6px rgba(0,0,0,0.9)' }}>
              {currentItem?.isFallback
                ? '📻 RadioZec Playlist'
                : currentItem?.requestedBy
                  ? `Requested by ${currentItem.requestedBy}`
                  : ''}
            </p>
          </div>
        </div>
      )}

      {/* ── Controls (bottom-right, above now playing) ── */}
      {isPlaying && (
        <div className="absolute bottom-24 right-4 z-20 flex flex-col items-end gap-2">
          {/* Viz preset */}
          <button
            onClick={cyclePreset}
            className="px-3 py-1.5 rounded-lg bg-base-900/60 backdrop-blur-sm text-base-300 text-xs
                       hover:bg-base-800/70 transition-colors cursor-pointer border border-base-700/20"
            title="Change visualizer"
          >
            {PRESETS[presetIdx].name}
          </button>

          {/* Pause */}
          <button
            onClick={togglePlay}
            className="p-2 rounded-lg bg-base-900/60 backdrop-blur-sm text-base-300
                       hover:bg-base-800/70 transition-colors cursor-pointer border border-base-700/20"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          </button>

          {/* Volume */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-base-900/60 backdrop-blur-sm border border-base-700/20">
            <svg className="w-4 h-4 text-base-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
            </svg>
            <input
              type="range"
              min={0}
              max={100}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="w-20 h-1 accent-gold-500 cursor-pointer"
            />
          </div>
        </div>
      )}
    </div>
  );
}
