import { usePlayerStore } from '../../stores/playerStore';

export default function LivePlayer() {
  const { playback } = usePlayerStore();

  // MediaMTX's built-in WebRTC player is proxied through Apache at /stream/
  // It auto-negotiates WebRTC (sub-second latency) with HLS fallback.
  const playerUrl = playback.liveHlsUrl
    ? '/stream/' + playback.liveHlsUrl.replace(/.*\/hls\//, '').replace('/index.m3u8', '') + '/'
    : null;

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      {playerUrl ? (
        <>
          <iframe
            src={playerUrl}
            className="w-full h-full border-0"
            allow="autoplay; fullscreen"
            title="Live Stream"
          />
        </>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="text-center">
            <p className="text-5xl mb-4">🔴</p>
            <p className="text-base-300 text-lg">Live event in progress</p>
            <p className="text-base-500 text-sm mt-1">Waiting for stream...</p>
          </div>
        </div>
      )}

      {/* LIVE badge */}
      <div className="absolute top-4 left-4 z-20">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600/90 backdrop-blur-sm shadow-lg shadow-rose-500/30">
          <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
          <span className="text-xs font-bold text-white uppercase tracking-wider">Live</span>
        </div>
      </div>
    </div>
  );
}
