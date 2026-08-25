import dotenv from 'dotenv';
dotenv.config();

export interface AppConfig {
  // Zkool / Zcash
  gqlUrl: string;
  network: string;
  zkoolAccountId: number;

  // Server
  useHttps: boolean;
  port: number;
  jwtSecret: string;

  // Pricing (defaults, overridable via admin panel)
  queueVideoPrice: number;
  skipVideoPrice: number;

  // Donation scanner
  scanIntervalMs: number;

  // Admin seed user
  seedUsername: string;
  seedPassword: string;

  // Icecast
  icecastUrl: string;

  // Liquidsoap telnet
  liquidsoapHost: string;
  liquidsoapPort: number;

  // yt-dlp / media
  mediaDir: string;
  audioFormat: string;
  audioBitrate: number;
  mediaCleanupHours: number;

  // MediaMTX (live streaming)
  mediamtxApiUrl: string;
  mediamtxHlsUrl: string;
  liveStreamKey: string;
}

export const config: AppConfig = {
  gqlUrl: process.env.GQL_URL || 'http://127.0.0.1:8000/graphql',
  network: process.env.NETWORK || 'test',
  zkoolAccountId: parseInt(process.env.ZKOOL_ACCOUNT_ID || '1', 10),
  useHttps: process.env.USE_HTTPS === 'true',
  port: parseInt(process.env.PORT || '3000', 10),
  jwtSecret: process.env.JWT_SECRET_KEY || 'dev-secret-change-me',
  queueVideoPrice: parseFloat(process.env.QUEUE_VIDEO_PRICE || '0.001'),
  skipVideoPrice: parseFloat(process.env.SKIP_VIDEO_PRICE || '0.005'),
  scanIntervalMs: parseInt(process.env.SCAN_INTERVAL_MS || '30000', 10),
  seedUsername: process.env.SEED_USERNAME || 'admin',
  seedPassword: process.env.SEED_PASSWORD || 'changeme123',

  // Icecast stream URL (sent to clients for the <audio> element)
  // In dev: relative path proxied through Vite. In prod: set full public URL.
  icecastUrl: process.env.ICECAST_URL || '/radio',

  // Liquidsoap telnet control interface
  liquidsoapHost: process.env.LIQUIDSOAP_HOST || '127.0.0.1',
  liquidsoapPort: parseInt(process.env.LIQUIDSOAP_PORT || '1234', 10),

  // Media download settings
  mediaDir: process.env.MEDIA_DIR || './media',
  audioFormat: process.env.AUDIO_FORMAT || 'mp3',
  audioBitrate: parseInt(process.env.AUDIO_BITRATE || '192', 10),
  mediaCleanupHours: parseInt(process.env.MEDIA_CLEANUP_HOURS || '24', 10),

  // MediaMTX
  mediamtxApiUrl: process.env.MEDIAMTX_API_URL || 'http://127.0.0.1:9997',
  mediamtxHlsUrl: process.env.MEDIAMTX_HLS_URL || 'http://localhost:8888/zecradio-live/index.m3u8',
  liveStreamKey: process.env.LIVE_STREAM_KEY || 'zecradio-live',
};
