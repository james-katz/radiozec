#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════
# RadioZec — Seed Fallback Music
# Downloads royalty-free tracks to server/media/fallback/
# All tracks are NCS (No Copyright Sounds) or similar
# royalty-free releases, safe for streaming.
#
# Usage:
#   ./server/scripts/seed-fallback.sh
#   # or via npm:
#   cd server && npm run seed:fallback
# ══════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FALLBACK_DIR="$SCRIPT_DIR/../media/fallback"
FORMAT="mp3"
QUALITY="192"

# ── Colors ──
BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
CYAN="\033[0;36m"
NC="\033[0m"

# ── Check dependencies ──
if ! command -v yt-dlp &>/dev/null; then
  echo -e "${RED}Error: yt-dlp is not installed.${NC}"
  echo "Install with: pip install yt-dlp"
  exit 1
fi

if ! command -v ffmpeg &>/dev/null; then
  echo -e "${RED}Error: ffmpeg is not installed.${NC}"
  echo "Install with: sudo apt install ffmpeg"
  exit 1
fi

# ── Check yt-dlp version (YouTube breaks old versions constantly) ──
YT_DLP_VERSION=$(yt-dlp --version 2>/dev/null || echo "0")
YT_DLP_YEAR=$(echo "$YT_DLP_VERSION" | cut -d. -f1)

if [ "$YT_DLP_YEAR" -lt 2026 ] 2>/dev/null; then
  echo -e "${RED}⚠ yt-dlp version $YT_DLP_VERSION is outdated!${NC}"
  echo -e "  YouTube changes their API frequently — old versions will fail."
  echo ""
  read -p "  Auto-update yt-dlp now? (Y/n): " UPDATE_CHOICE
  if [ "${UPDATE_CHOICE,,}" != "n" ]; then
    echo -e "  ${CYAN}Updating yt-dlp...${NC}"
    if pip install --upgrade yt-dlp 2>/dev/null || pip install --break-system-packages --upgrade yt-dlp 2>/dev/null; then
      echo -e "  ${GREEN}✓ yt-dlp updated to $(yt-dlp --version)${NC}"
    else
      echo -e "  ${RED}✗ Auto-update failed. Try manually: pip install --upgrade yt-dlp${NC}"
      exit 1
    fi
  else
    echo -e "  ${YELLOW}Continuing with outdated version — downloads may fail.${NC}"
  fi
  echo ""
fi

mkdir -p "$FALLBACK_DIR"

# ══════════════════════════════════════════════════════════
# Royalty-Free Track List
# All NCS (NoCopyrightSounds) releases — free to use
# with attribution in streaming contexts.
# ══════════════════════════════════════════════════════════

TRACKS=(
  # ── Electronic / EDM ──
  "K4DyBUG242c"   # Elektronomia - Sky High
  "__CRWE-L45k"   # Disfigure - Blank
  "bM7SZ5SBzyY"   # Alan Walker - Spectre
  "J2X5mJ3HDYE"   # DEAF KEV - Invincible
  "TW9d8vYrVFQ"   # Itro & Tobu - Cloud 9
  "AOeY-nDp7hI"   # Alan Walker - Fade
  "MEYHMnAqkYc"   # Tobu - Hope
  "IIrCDAV3EgI"   # Cartoon - On & On (feat. Daniel Levi)
  "RkGKanKQ4MA"   # Tobu - Seven
  "B7xai5u_tnk"   # Tobu - Candyland
  "m7Bc3pLyij0"   # Tobu & Itro - Sunburst
  "u1I9ITfzqFs"   # Tobu - Infectious
  "QEoEjAXeaBE"   # Tobu - Colors
  "FseAiT2JKEE"   # Cartoon - Why We Lose (feat. Coleman Trapp)
  "n1WpP7iowLc"   # Elektronomia - Sky High pt. II

  # ── Chill / Lo-Fi ──
  "bAXUKnZMOcQ"   # Cartoon - C U Again (feat. Mikk Mäe)
  "tua4SVV2mSE"   # Kisma - Fingertips
  "zzGLAAJwcSM"   # Aero Chord - Surface
  "UNbvYMGMn9I"   # Mendum - Beyond (feat. Omri)

  # ── Drum & Bass / Dubstep ──
  "gAMbkJk6gnE"   # Jim Yosef - Firefly
  "y6120QOlsfU"   # Darude - Sandstorm (reupload)
  "oGPZhn2wJCQ"   # Distrion & Alex Skrindo - Lightning
  "8VDjPYcL-oU"   # Lensko - Cetus
  "HLQ1cM3b6G4"   # Lensko - Let's Go!
  "S19UcWdOA-I"   # Jim Yosef - Link

  # ── Trap / Future Bass ──
  "zj06ykBmtLQ"   # Warriyo - Mortals (feat. Laura Brehm)
  "EHU3st6qstQ"   # Unknown Brain - Superhero (feat. Chris Linton)
  "VtKbiyyVZks"   # Diviners - Savannah (feat. Philly K)
  "AwIzWaBHCKQ"   # Janji - Heroes Tonight (feat. Johnning)
  "0VFU93MgcDU"   # Axol x Alex Skrindo - You
)

TOTAL=${#TRACKS[@]}
DOWNLOADED=0
SKIPPED=0
FAILED=0

echo -e "${BOLD}${CYAN}"
echo "╔════════════════════════════════════════════════╗"
echo "║     📻 RadioZec — Seed Fallback Music         ║"
echo "║     Downloading $TOTAL royalty-free tracks          ║"
echo "╚════════════════════════════════════════════════╝"
echo -e "${NC}"
echo -e "Target: ${BOLD}$FALLBACK_DIR${NC}"
# ── Check for cookies file (needed on VPS/datacenter IPs) ──
COOKIES_FILE="$SCRIPT_DIR/../cookies.txt"
COOKIES_ARGS=()
if [ -f "$COOKIES_FILE" ]; then
  echo -e "  ${GREEN}✓${NC} Using cookies from: $COOKIES_FILE"
  COOKIES_ARGS=(--cookies "$COOKIES_FILE")
else
  echo -e "  ${YELLOW}⚠${NC} No cookies.txt found in server/"
  echo -e "    YouTube may block downloads from datacenter IPs."
  echo -e "    To fix: export cookies from your browser and place at server/cookies.txt"
  echo -e "    See: ${CYAN}https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp${NC}"
fi
echo ""

for id in "${TRACKS[@]}"; do
  # Skip if already downloaded
  if ls "$FALLBACK_DIR"/*"$id"* &>/dev/null 2>&1 || ls "$FALLBACK_DIR"/"$id".* &>/dev/null 2>&1; then
    echo -e "  ${YELLOW}⊘${NC} $id — already exists, skipping"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  echo -ne "  ${CYAN}↓${NC} $id — downloading..."

  if yt-dlp \
    "https://www.youtube.com/watch?v=$id" \
    -x \
    --audio-format "$FORMAT" \
    --audio-quality "${QUALITY}K" \
    -o "$FALLBACK_DIR/%(title)s [%(id)s].%(ext)s" \
    --no-playlist \
    --no-warnings \
    --js-runtimes node \
    "${COOKIES_ARGS[@]}" \
    --quiet \
    2>/dev/null; then
    echo -e "\r  ${GREEN}✓${NC} $id — downloaded                    "
    DOWNLOADED=$((DOWNLOADED + 1))
  else
    echo -e "\r  ${RED}✗${NC} $id — failed                        "
    FAILED=$((FAILED + 1))
  fi
done

echo ""
echo -e "${BOLD}════════════════════════════════════════════════${NC}"
echo -e "  Downloaded: ${GREEN}$DOWNLOADED${NC}"
echo -e "  Skipped:    ${YELLOW}$SKIPPED${NC} (already existed)"
echo -e "  Failed:     ${RED}$FAILED${NC}"
echo -e "  Total:      $(ls "$FALLBACK_DIR"/*.${FORMAT} 2>/dev/null | wc -l) tracks in fallback"
echo -e "${BOLD}════════════════════════════════════════════════${NC}"
echo ""

if [ "$FAILED" -gt 0 ]; then
  echo -e "${YELLOW}⚠ Some downloads failed. This is normal — some videos may be"
  echo -e "  region-locked or removed. Re-run the script to retry.${NC}"
fi

echo -e "${GREEN}✓ Fallback music ready. Start RadioZec with: ./start.sh${NC}"
