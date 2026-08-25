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
- **React/Vite** — Frontend with audio visualizer, chat, and queue display

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
| **MediaMTX** | OBS live streaming (RTMP → HLS) | [Download binary](https://github.com/bluenviron/mediamtx/releases) |

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
git clone <repo-url> zecradio && cd zecradio
npm install
cd client && npm install && cd ..
cd server && npm install && cd ..
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env — set JWT_SECRET_KEY, passwords, etc.
```

### 3. Add fallback music

Download some audio files to `server/media/fallback/` — these play when the queue is empty:

```bash
yt-dlp -x --audio-format mp3 --audio-quality 0 -o 'server/media/fallback/%(title)s.%(ext)s' \
  "https://www.youtube.com/watch?v=K4DyBUG242c" \
  "https://www.youtube.com/watch?v=__CRWE-L45k"
```

### 4. Start everything

```bash
./start.sh          # Starts Icecast → Liquidsoap → dev server
```

That's it. The script checks dependencies, starts Icecast and Liquidsoap in the background, then launches the dev server.

| Command | Description |
|---------|-------------|
| `./start.sh` | Start all services (dev mode) |
| `./start.sh install` | Install MediaMTX + check deps + scan port conflicts |
| `./start.sh prod` | Build & start in production mode |
| `./start.sh stop` | Stop all RadioZec services |
| `./start.sh status` | Show status of all services |

> Default passwords in `server/icecast.xml` are `hackme` — **change them for production!**

Open **http://localhost:5173** and click **"Tune In"** to start listening!

### 7. (Optional) Connect a Zcash wallet

If you have a Zkool/Zcash wallet daemon running on port 8000 (GraphQL), RadioZec will automatically scan for incoming donations and queue songs from YouTube links in the memos.

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

## Configuration

All settings are in `.env` (see `.env.example` for reference):

| Variable | Default | Description |
|----------|---------|-------------|
| `ICECAST_URL` | `http://localhost:8000/radio` | Public Icecast stream URL |
| `LIQUIDSOAP_HOST` | `127.0.0.1` | Liquidsoap telnet host |
| `LIQUIDSOAP_PORT` | `1234` | Liquidsoap telnet port |
| `MEDIA_DIR` | `./media` | Audio download directory |
| `AUDIO_FORMAT` | `mp3` | Download format (`mp3`, `opus`) |
| `AUDIO_BITRATE` | `192` | Encoding bitrate (kbps) |
| `MEDIA_CLEANUP_HOURS` | `24` | Auto-delete files older than N hours |
| `QUEUE_VIDEO_PRICE` | `0.001` | ZEC cost to queue a song |
| `SKIP_VIDEO_PRICE` | `0.005` | ZEC cost to skip current song |
| `MEDIAMTX_API_URL` | `http://127.0.0.1:9997` | MediaMTX API (stream status checks) |
| `MEDIAMTX_HLS_URL` | `/live/` | HLS stream URL for live events |
| `LIVE_STREAM_KEY` | `zecradio-live` | OBS stream key for live mode |

## Live Streaming (Optional)

RadioZec supports **live video streaming** from OBS for community events.

### How it works

```
OBS Studio → RTMP → MediaMTX → HLS → Browser <video>
```

### Setup

1. **Download MediaMTX** (single binary, no install needed):
   ```bash
   wget https://github.com/bluenviron/mediamtx/releases/latest/download/mediamtx_v1.x.x_linux_amd64.tar.gz
   tar -xzf mediamtx_*.tar.gz
   ```

2. **Start MediaMTX** with the bundled config:
   ```bash
   ./mediamtx server/mediamtx.yml &
   ```

3. **Configure OBS**:
   - **Service**: Custom
   - **Server**: `rtmp://your-server-ip:1935/live`
   - **Stream Key**: `zecradio-live`

4. **Go live** from the admin panel (`/admin` → "▶ Go Live")
   - The song queue automatically pauses
   - All connected users switch from audio visualizer to video player
   - Chat continues working normally

5. Click **"⏹ End Live Stream"** to return to radio mode

## Project Structure

```
zecradio/
├── client/                  # React/Vite frontend
│   └── src/
│       ├── components/
│       │   ├── Player/      # RadioPlayer (audio + visualizer)
│       │   ├── Chat/        # Anonymous chat panel
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
│   │   ├── sync.ts          # Stream state broadcast
│   │   ├── scanner.ts       # Donation scanner
│   │   ├── zkool.ts         # Zcash wallet client
│   │   └── chat.ts          # Chat server
│   ├── radio.liq            # Liquidsoap configuration
│   ├── icecast.xml          # Icecast configuration
│   └── media/
│       ├── fallback/        # Default playlist audio files
│       └── jingles/         # Between-track jingles
└── .env.example             # Environment configuration template
```

## License

MIT
