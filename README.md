# 📻 RadioZec

Community internet radio powered by **Zcash donations**. Users send ZEC with a YouTube link in the memo — the audio gets downloaded and plays on a shared stream. Everyone hears the same thing, in sync. Chat is anonymous. Vibes are immaculate.

## Architecture

```
Donation (ZEC memo) → yt-dlp (extract audio) → Liquidsoap (queue + crossfade) → Icecast (stream) → Browser <audio>
```

- **Icecast** — HTTP audio streaming server (all listeners hear the same stream)
- **Liquidsoap** — Audio pipeline (queue management, crossfade, jingles, fallback playlist)
- **yt-dlp** — Downloads audio from YouTube URLs found in donation memos
- **Node.js/Express** — API server, Socket.IO for real-time chat & track info
- **React/Vite** — Frontend with audioMotion visualizer, chat, and queue display

## System Requirements

> **⚠️ These are OS-level packages — not npm. Install them before running RadioZec.**

### Required

| Package | Purpose | Install (Debian/Ubuntu) |
|---------|---------|-------------------------|
| **Node.js** ≥ 18 | Server & client runtime | `curl -fsSL https://deb.nodesource.com/setup_22.x \| sudo bash - && sudo apt install nodejs` |
| **yt-dlp** | YouTube audio extraction | `sudo apt install yt-dlp` or `pip install yt-dlp` |
| **ffmpeg** | Audio transcoding (used by yt-dlp) | `sudo apt install ffmpeg` |
| **Icecast2** | HTTP audio streaming server | `sudo apt install icecast2` |
| **Liquidsoap** | Audio pipeline & queue management | `sudo apt install liquidsoap` |

### Optional

| Package | Purpose | Install |
|---------|---------|---------|
| **Zkool** / Zcash wallet daemon | Receives ZEC donations | See [Zkool docs](https://github.com/nickaknudson/zkool) |
| **MediaMTX** | OBS live streaming (RTMP → WebRTC/HLS) | [Download binary](https://github.com/bluenviron/mediamtx/releases) |

### Verify installation

```bash
node --version        # ≥ 18.x
yt-dlp --version      # any recent version
ffmpeg -version       # any recent version
icecast2 -v           # or check systemctl status icecast2
liquidsoap --version  # ≥ 2.2.x recommended
```

## Quick Start

### 1. Clone & install

```bash
git clone https://github.com/james-katz/radiozec.git && cd radiozec
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env — set JWT_SECRET_KEY, SEED_PASSWORD, NETWORK, etc.
```

### 3. Seed fallback music

RadioZec needs audio files in `server/media/fallback/` to play when the queue is empty. The seed script downloads 30 royalty-free NCS tracks:

```bash
cd server && npm run seed:fallback
```

This uses `yt-dlp` to download the tracks. It's idempotent — safe to re-run if some fail.

### 4. (Optional) Set up Zcash wallet

If you have a [Zkool](https://github.com/nickaknudson/zkool) daemon running, import your viewing key so RadioZec can scan for donations:

```bash
cd server && npm run setup:zkool
```

The script will:
1. Connect to Zkool at the `GQL_URL` in your `.env`
2. List existing accounts or import a new viewing key
3. Print the `ZKOOL_ACCOUNT_ID` to add to `.env`

Without Zkool, RadioZec works fine — users just can't queue songs via ZEC donations.

### 5. Start everything

```bash
./start.sh          # Starts Icecast → Liquidsoap → dev server
```

The script checks dependencies, starts Icecast and Liquidsoap in the background, then launches the dev server.

| Command | Description |
|---------|-------------|
| `./start.sh` | Start all services (dev mode) |
| `./start.sh install` | Install MediaMTX + check deps + scan port conflicts |
| `./start.sh prod` | Build & start in production mode |
| `./start.sh stop` | Stop all RadioZec services |
| `./start.sh status` | Show status of all services |

> Default passwords in `server/icecast.xml` are `hackme` — **change them for production!**

Open **http://localhost:5173** and click **"Tune In"** to start listening!

## Jingles

Jingles are **automatically played between queued tracks**. Manage them from the admin panel:

1. Go to `/admin` → **🔔 Jingles** section
2. Click **＋ Upload Jingle** to add MP3/OGG/WAV/FLAC files (max 20MB)
3. Delete any jingle by hovering over it and clicking **Delete**

When a listener queues a song via donation, a random jingle plays first, then their requested track. Files are stored in `server/media/jingles/`.

## Admin Panel

Access at **http://localhost:5173/admin**

- Default credentials: `admin` / `changeme123` (change via `.env`)
- Queue management (add/remove/skip tracks)
- Donation history & analytics
- Pricing configuration
- Live mode toggle (Go Live / End Live Stream)
- Session persists for 24h via localStorage

## Configuration

All settings are in `.env` (see `.env.example` for reference):

### Core

| Variable | Default | Description |
|----------|---------|-------------|
| `GQL_URL` | `http://127.0.0.1:8000/graphql` | Zkool GraphQL endpoint |
| `ZKOOL_ACCOUNT_ID` | `1` | Zkool account to scan for donations (run `npm run setup:zkool`) |
| `NETWORK` | `main` | Zcash network (`main` or `test`) |
| `JWT_SECRET_KEY` | — | Secret for admin JWT tokens (**change this!**) |
| `SEED_USERNAME` | `admin` | Admin username (first run only) |
| `SEED_PASSWORD` | `changeme123` | Admin password (first run only) |

### Audio Streaming

| Variable | Default | Description |
|----------|---------|-------------|
| `ICECAST_URL` | `http://localhost:8001/radio` | Public Icecast stream URL |
| `LIQUIDSOAP_HOST` | `127.0.0.1` | Liquidsoap telnet host |
| `LIQUIDSOAP_PORT` | `1234` | Liquidsoap telnet port |
| `MEDIA_DIR` | `./media` | Audio download directory |
| `AUDIO_FORMAT` | `mp3` | Download format (`mp3`, `opus`) |
| `AUDIO_BITRATE` | `192` | Encoding bitrate (kbps) |
| `MEDIA_CLEANUP_HOURS` | `24` | Auto-delete files older than N hours |

### Donations

| Variable | Default | Description |
|----------|---------|-------------|
| `QUEUE_VIDEO_PRICE` | `0.001` | ZEC cost to queue a song |
| `SKIP_VIDEO_PRICE` | `0.005` | ZEC cost to skip current song |
| `SCAN_INTERVAL_MS` | `30000` | Donation scanner poll interval (ms) |

### Live Streaming (Optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `MEDIAMTX_API_URL` | `http://127.0.0.1:9997` | MediaMTX API (stream status checks) |
| `MEDIAMTX_HLS_URL` | `/hls/zecradio-live/index.m3u8` | HLS stream URL for live events |
| `LIVE_STREAM_KEY` | `zecradio-live` | OBS stream key for live mode |

> MediaMTX variables are only needed if you use the "Go Live" feature. Without MediaMTX, RadioZec works fine — just no live video.

## Live Streaming (Optional)

RadioZec supports **live video streaming** from OBS for community events.

### How it works

```
OBS Studio → RTMP → MediaMTX → WebRTC/HLS → Browser <video>
```

When live mode is activated:
- Song queue automatically pauses
- All listeners switch from audio visualizer to live video player
- Queue/Skip buttons are disabled
- Chat continues working
- When the stream ends, a "Back to Radio" button appears

### Setup

1. **Install MediaMTX** via the startup script:
   ```bash
   ./start.sh install
   ```

2. **Configure OBS**:
   - **Service**: Custom
   - **Server**: `rtmp://your-server-ip:1935/live`
   - **Stream Key**: `zecradio-live`

3. **Go live** from the admin panel (`/admin` → "▶ Go Live")

4. Click **"⏹ End Live Stream"** to return to radio mode

## NPM Scripts

### Server (`cd server`)

| Script | Description |
|--------|-------------|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Compile TypeScript |
| `npm run start` | Start production server |
| `npm run setup:zkool` | Interactive Zkool account setup |
| `npm run seed:fallback` | Download 30 royalty-free fallback tracks |

## Project Structure

```
radiozec/
├── client/                  # React/Vite frontend
│   └── src/
│       ├── components/
│       │   ├── Player/      # RadioPlayer (audioMotion visualizer) + LivePlayer
│       │   ├── Chat/        # Anonymous chat panel + queue modal
│       │   └── Queue/       # Queue display
│       ├── stores/          # Zustand state management
│       ├── hooks/           # Socket.IO hooks
│       └── pages/           # Main + Admin pages
├── server/                  # Express/Socket.IO backend
│   ├── src/
│   │   ├── index.ts         # Entry point
│   │   ├── downloader.ts    # yt-dlp wrapper
│   │   ├── liquidsoap.ts    # Telnet client
│   │   ├── queue.ts         # Queue + Liquidsoap delegation
│   │   ├── liveMode.ts      # Live streaming state management
│   │   ├── sync.ts          # Stream state broadcast
│   │   ├── scanner.ts       # Donation scanner
│   │   ├── zkool.ts         # Zcash wallet client (GraphQL)
│   │   └── chat.ts          # Chat server
│   ├── scripts/
│   │   ├── setup-zkool.ts   # Interactive Zkool account setup
│   │   └── seed-fallback.sh # Download fallback music
│   ├── radio.liq            # Liquidsoap configuration
│   ├── icecast.xml          # Icecast configuration
│   ├── mediamtx.yml         # MediaMTX configuration (live streaming)
│   └── media/
│       ├── fallback/        # Default playlist audio files
│       └── jingles/         # Between-track jingles
├── start.sh                 # All-in-one startup script
└── .env.example             # Environment configuration template
```

## License

MIT
