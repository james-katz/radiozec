#!/usr/bin/liquidsoap

# ══════════════════════════════════════════════════════════
# RadioZec — Liquidsoap Configuration (1.4.x legacy)
# Community radio powered by Zcash donations
#
# This file is for Liquidsoap 1.4.x (Debian 11 / older distros).
# For 2.x+, use radio.liq instead.
# ══════════════════════════════════════════════════════════

# ── Server Settings ──────────────────────────────────────
# Telnet interface for Node.js control
set("server.telnet", true)
set("server.telnet.bind_addr", "127.0.0.1")
set("server.telnet.port", 1234)

# ── Sources ──────────────────────────────────────────────

# Primary: Donation-queued tracks (pushed via telnet)
queue = request.queue(id="queue")

# Jingles: Played between queued tracks (pushed via telnet)
jingles = request.queue(id="jingles")

# Fallback: Plays when both queue and jingles are empty
backup = playlist(id="backup", mode="randomize", reload_mode="watch",
  "./media/fallback")

# ── Combine Sources ──────────────────────────────────────

# Queue takes priority, then jingles, then fallback
radio = fallback(id="radio", track_sensitive=true,
  [jingles, queue, backup])

# ── Effects ──────────────────────────────────────────────

# Crossfade between tracks
radio = crossfade(fade_out=2., fade_in=2., duration=3., radio)

# Ensure stream never drops
radio = mksafe(radio)

# ── Track Change Webhook ─────────────────────────────────
# Notify the Node.js server whenever a new track starts

def on_new_track(m)
  title = m["title"]
  artist = m["artist"]
  filename = m["filename"]
  youtube_id = m["youtube_id"]

  data = '{"title":"#{title}","artist":"#{artist}","filename":"#{filename}","youtubeId":"#{youtube_id}"}'

  # 1.4.x uses system() instead of process.run()
  system("curl -s -X POST -H 'Content-Type: application/json' -d '#{data}' http://127.0.0.1:3000/api/internal/track-change &")
end

# Save reference for skip and register metadata callback
# In 1.4.x, on_metadata wraps the source
radio = on_metadata(on_new_track, radio)

# ── Register Skip Command ───────────────────────────────
server.register(
  namespace="radio",
  usage="skip",
  description="Skip the current track",
  "skip",
  fun(_) -> begin source.skip(radio) "Done!" end
)

# ── Output to Icecast ────────────────────────────────────

output.icecast(
  %mp3(bitrate=192),
  host="localhost",
  port=8001,
  password="hackme",
  mount="/radio",
  name="RadioZec",
  genre="Various",
  description="Community radio powered by Zcash donations",
  url="https://radio.zcashbr.com",
  radio
)
