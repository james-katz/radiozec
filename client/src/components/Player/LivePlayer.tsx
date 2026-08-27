import { useEffect, useRef } from 'react';
import Hls from 'hls.js';
import { usePlayerStore } from '../../stores/playerStore';

export default function LivePlayer() {
  const { playback } = usePlayerStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const hlsUrl = playback.liveHlsUrl;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !hlsUrl) return;

    // Clean up previous instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 6,
      });

      hls.loadSource(hlsUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          console.warn('[LivePlayer] Fatal HLS error, attempting recovery:', data.type);
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          }
        }
      });

      hlsRef.current = hls;
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari native HLS
      video.src = hlsUrl;
      video.addEventListener('loadedmetadata', () => {
        video.play().catch(() => {});
      });
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [hlsUrl]);

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: '100%',
      background: '#000',
      overflow: 'hidden',
    }}>
      {hlsUrl ? (
        <video
          ref={videoRef}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
          }}
          autoPlay
          muted
          playsInline
          controls
        />
      ) : (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔴</p>
            <p style={{ color: '#aaa', fontSize: '1.1rem' }}>Live event in progress</p>
            <p style={{ color: '#666', fontSize: '0.85rem', marginTop: '0.25rem' }}>Waiting for stream...</p>
          </div>
        </div>
      )}

      {/* LIVE badge */}
      <div style={{
        position: 'absolute',
        top: '1rem',
        left: '1rem',
        zIndex: 20,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.375rem',
          padding: '0.375rem 0.75rem',
          borderRadius: '0.5rem',
          background: 'rgba(225, 29, 72, 0.9)',
          backdropFilter: 'blur(4px)',
          boxShadow: '0 4px 12px rgba(225, 29, 72, 0.3)',
        }}>
          <div style={{
            width: '0.5rem',
            height: '0.5rem',
            borderRadius: '50%',
            background: '#fff',
            animation: 'pulse 2s infinite',
          }} />
          <span style={{
            fontSize: '0.75rem',
            fontWeight: 700,
            color: '#fff',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>Live</span>
        </div>
      </div>
    </div>
  );
}
