import express from 'express';
import cors from 'cors';
import http from 'http';
import https from 'https';
import fs from 'fs';
import { Server as SocketIOServer } from 'socket.io';

import { config } from './config';
import { initializeDatabase, getQueuePrice, getSkipPrice } from './db';
import { ZkoolClient } from './zkool';
import { initQueue, getQueue, getCurrentItem, enqueue, onLiquidsoapTrackChange, pauseQueue, resumeQueue } from './queue';
import { initSync, onTrackChange, getPlaybackState } from './sync';
import { initChat, handleChatConnection, sendSystemMessage } from './chat';
import { startScanner } from './scanner';
import { cleanupMediaFiles } from './downloader';
import { LiquidsoapClient } from './liquidsoap';
import { initLiveMode, getLiveState, isMediaMTXAlive } from './liveMode';
import { buildQueueUri, buildSkipUri } from './zip321';
import { parseYouTubeUrl, fetchVideoMeta } from './youtube';
import adminRouter from './admin';

async function main() {
  // ── Express ───────────────────────────────────────────
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // ── HTTP(S) Server ────────────────────────────────────
  let server: http.Server | https.Server;
  if (config.useHttps) {
    const sslOptions = {
      key: fs.readFileSync('privkey.pem'),
      cert: fs.readFileSync('cert.pem'),
    };
    server = https.createServer(sslOptions, app);
  } else {
    server = http.createServer(app);
  }

  // ── Socket.IO ─────────────────────────────────────────
  const io = new SocketIOServer(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  // ── Initialize Database ───────────────────────────────
  await initializeDatabase();

  // ── Initialize Zkool ──────────────────────────────────
  const zkool = new ZkoolClient(config.gqlUrl);
  zkool.accountId = config.zkoolAccountId;
  const zkoolReady = await zkool.init(true);
  if (!zkoolReady) {
    console.warn('[Server] Zkool client failed to initialize. Donation scanning disabled.');
  } else {
    console.log(`[Zkool] Using account ID: ${config.zkoolAccountId}`);
  }

  // ── Initialize Liquidsoap Client ──────────────────────
  const liquidsoap = new LiquidsoapClient();
  const lsAlive = await liquidsoap.isAlive();
  if (lsAlive) {
    console.log('[Server] Liquidsoap connected.');
  } else {
    console.warn('[Server] Liquidsoap not reachable. Queue push/skip will fail until it starts.');
  }

  // ── Initialize Modules ────────────────────────────────
  initQueue(io, liquidsoap, (item) => {
    onTrackChange(item);
    sendSystemMessage(
      `🎵 Now playing: ${item.title}${item.isFallback ? '' : ` (requested by ${item.requestedBy})`}`
    );
  });
  initSync(io);
  initChat(io);

  // Initialize live mode with queue pause/resume callbacks
  initLiveMode(io, (isLive) => {
    if (isLive) {
      pauseQueue();
      sendSystemMessage('🔴 LIVE EVENT started — song queue is paused');
    } else {
      resumeQueue();
      sendSystemMessage('📻 Live event ended — back to RadioZec');
    }
  });

  // Check MediaMTX availability
  const mtxAlive = await isMediaMTXAlive();
  if (mtxAlive) {
    console.log('[Server] MediaMTX connected (live streaming available).');
  } else {
    console.log('[Server] MediaMTX not reachable. Live streaming unavailable until it starts.');
  }

  // Start donation scanner
  if (zkoolReady) {
    startScanner(zkool);
  }

  // Schedule media cleanup every hour
  setInterval(() => cleanupMediaFiles(), 60 * 60 * 1000);

  // ── Liquidsoap Webhook ────────────────────────────────
  // Called by Liquidsoap's on_track handler when a new track starts
  app.post('/api/internal/track-change', (req, res) => {
    const { title, artist, filename, youtubeId } = req.body;
    console.log(`[Webhook] Track change: ${title || filename || 'unknown'}`);

    onLiquidsoapTrackChange({ title, artist, filename, youtubeId });
    res.status(200).json({ ok: true });
  });

  // ── Socket.IO Handlers ────────────────────────────────
  io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // Send current state on connect
    socket.emit('sync:state', getPlaybackState());
    socket.emit('queue:updated', {
      queue: getQueue(),
      current: getCurrentItem(),
    });
    socket.emit('live:state', getLiveState());

    // Chat handling
    handleChatConnection(socket);

    // Queue video request — returns ZIP-321 URI for payment
    socket.on('queue:request', async (data: { youtubeUrl: string }) => {
      const videoId = parseYouTubeUrl(data.youtubeUrl);
      if (!videoId) {
        socket.emit('queue:payment', { error: 'Invalid YouTube URL' });
        return;
      }

      const meta = await fetchVideoMeta(videoId);
      if (!meta) {
        socket.emit('queue:payment', { error: 'Could not fetch video info. Check if the URL is valid.' });
        return;
      }

      const address = await zkool.getAddress();
      const queuePrice = await getQueuePrice();
      const uri = buildQueueUri(address.ua || address.orchard, queuePrice, data.youtubeUrl);

      socket.emit('queue:payment', {
        uri,
        amount: queuePrice,
        address: address.ua || address.orchard,
        video: meta,
      });
    });

    // Skip video request — returns ZIP-321 URI for payment
    socket.on('skip:request', async () => {
      const address = await zkool.getAddress();
      const skipPrice = await getSkipPrice();
      const uri = buildSkipUri(address.ua || address.orchard, skipPrice);

      socket.emit('skip:payment', {
        uri,
        amount: skipPrice,
        address: address.ua || address.orchard,
      });
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
  });

  // ── REST Routes ───────────────────────────────────────
  app.use('/api/admin', adminRouter);

  // Public endpoint: get current state
  app.get('/api/state', (_req, res) => {
    res.json({
      playback: getPlaybackState(),
      queue: getQueue(),
      current: getCurrentItem(),
    });
  });

  // ── Start Server ──────────────────────────────────────
  server.listen(config.port, () => {
    const protocol = config.useHttps ? 'https' : 'http';
    console.log(`[Server] RadioZec running at ${protocol}://localhost:${config.port}`);
    console.log(`[Server] Icecast stream: ${config.icecastUrl}`);
  });

  // ── Graceful Shutdown ─────────────────────────────────
  process.on('SIGINT', () => {
    console.log('[Server] Shutting down...');
    process.exit(0);
  });
}

main().catch(console.error);
